import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { pool, query } from "@/lib/db";

// Integración con Mercado Pago. La barbería vincula su propia cuenta por OAuth y todos los
// cobros y reembolsos se hacen con SU access token: la plata entra directo a su cuenta.

const API = "https://api.mercadopago.com";
const AUTORIZACION = "https://auth.mercadopago.com/authorization";
const TIMEOUT_MS = 10_000;
const RENOVAR_FALTANDO_DIAS = 30; // el token dura 180 días: se renueva cuando le quedan menos de 30

export const RUTA_CALLBACK_OAUTH = "/api/mercadopago/oauth/callback";
export const RUTA_WEBHOOK = "/api/mercadopago/webhook";

function env(nombre: string) {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

// URL pública de la app (la misma que usa NextAuth): de acá salen la redirect_uri, el webhook y las back_urls
export function urlPublica(ruta: string) {
  return new URL(ruta, env("NEXTAUTH_URL")).toString();
}

export class ErrorMercadoPago extends Error {
  constructor(mensaje: string, readonly status?: number, readonly detalle?: unknown) {
    super(mensaje);
    this.name = "ErrorMercadoPago";
  }
}

// No hay cuenta vinculada, o la barbería le quitó el permiso a la app desde Mercado Pago: hay que vincular de nuevo
export class CuentaNoVinculada extends Error {
  constructor(mensaje = "La cuenta de Mercado Pago de la barbería no está vinculada.") {
    super(mensaje);
    this.name = "CuentaNoVinculada";
  }
}

// ---------- Cifrado de tokens (AES-256-GCM) ----------
// Formato guardado: "v1:<iv>:<tag>:<datos>" en base64. Sin la clave del .env, la base sola no sirve para operar.

function clave() {
  const k = Buffer.from(env("CLAVE_CIFRADO_TOKENS"), "base64");
  if (k.length !== 32) throw new Error("CLAVE_CIFRADO_TOKENS tiene que ser de 32 bytes en base64 (openssl rand -base64 32)");
  return k;
}

function cifrar(texto: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", clave(), iv);
  const datos = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), datos.toString("base64")].join(":");
}

function descifrar(guardado: string) {
  const [version, iv, tag, datos] = guardado.split(":");
  if (version !== "v1" || !iv || !tag || !datos) throw new Error("Token cifrado con formato desconocido");
  const d = createDecipheriv("aes-256-gcm", clave(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(datos, "base64")), d.final()]).toString("utf8");
}

// ---------- Vinculación (OAuth con PKCE) ----------

export function nuevoPkce() {
  const verifier = randomBytes(32).toString("base64url"); // 43 caracteres
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function urlAutorizacion(state: string, codeChallenge: string) {
  const params = new URLSearchParams({
    client_id: env("MP_CLIENT_ID"),
    response_type: "code",
    platform_id: "mp",
    state,
    redirect_uri: urlPublica(RUTA_CALLBACK_OAUTH),
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${AUTORIZACION}?${params}`;
}

type RespuestaToken = {
  access_token: string;
  refresh_token: string;
  public_key?: string;
  user_id: number;
  expires_in: number;
};

async function pedirToken(datos: Record<string, string>): Promise<RespuestaToken> {
  const r = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: env("MP_CLIENT_ID"), client_secret: env("MP_CLIENT_SECRET"), ...datos }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const json = await r.json().catch(() => null);
  if (!r.ok || !json?.access_token || !json?.refresh_token) {
    throw new ErrorMercadoPago("Mercado Pago rechazó el pedido de token.", r.status, json);
  }
  return json;
}

// Canjea el code que devuelve Mercado Pago por los tokens de la barbería y los guarda cifrados
export async function vincularCuenta(code: string, codeVerifier: string, usuarioId: number) {
  const modoPrueba = process.env.MP_MODO_PRUEBA === "true";
  const t = await pedirToken({
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    redirect_uri: urlPublica(RUTA_CALLBACK_OAUTH),
    test_token: String(modoPrueba), // true = credenciales de prueba
  });
  await query(
    `INSERT INTO mp_cuenta (id, mp_user_id, access_token, refresh_token, public_key, token_vence_en, modo_prueba, vinculada_por)
     VALUES (1, $1, $2, $3, $4, now() + make_interval(secs => $5), $6, $7)
     ON CONFLICT (id) DO UPDATE
       SET mp_user_id = EXCLUDED.mp_user_id, access_token = EXCLUDED.access_token,
           refresh_token = EXCLUDED.refresh_token, public_key = EXCLUDED.public_key,
           token_vence_en = EXCLUDED.token_vence_en, modo_prueba = EXCLUDED.modo_prueba,
           vinculada_por = EXCLUDED.vinculada_por, vinculada_en = now(), actualizada_en = now()`,
    [t.user_id, cifrar(t.access_token), cifrar(t.refresh_token), t.public_key ?? null, t.expires_in, modoPrueba, usuarioId]
  );
}

export async function desvincularCuenta() {
  await query(`DELETE FROM mp_cuenta WHERE id = 1`);
}

export type CuentaMP = { mpUserId: string; modoPrueba: boolean; vinculadaEn: Date; tokenVenceEn: Date };

// Datos para mostrar en el panel (nunca los tokens)
export async function cuentaVinculada(): Promise<CuentaMP | null> {
  const [c] = await query<CuentaMP>(
    `SELECT mp_user_id AS "mpUserId", modo_prueba AS "modoPrueba",
            vinculada_en AS "vinculadaEn", token_vence_en AS "tokenVenceEn"
       FROM mp_cuenta WHERE id = 1`
  );
  return c ?? null;
}

// ---------- Access token, con renovación automática ----------

async function accessToken(): Promise<string> {
  const [c] = await query<{ access_token: string; renovar: boolean }>(
    `SELECT access_token, token_vence_en < now() + make_interval(days => $1) AS renovar
       FROM mp_cuenta WHERE id = 1`,
    [RENOVAR_FALTANDO_DIAS]
  );
  if (!c) throw new CuentaNoVinculada();
  return c.renovar ? renovarToken() : descifrar(c.access_token);
}

// Se renueva con la fila bloqueada: si llegan dos pedidos juntos, el segundo espera y usa el token nuevo
async function renovarToken(): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [c] } = await client.query(
      `SELECT access_token, refresh_token,
              token_vence_en < now() + make_interval(days => $1) AS renovar,
              token_vence_en > now() AS vigente
         FROM mp_cuenta WHERE id = 1 FOR UPDATE`,
      [RENOVAR_FALTANDO_DIAS]
    );
    if (!c) throw new CuentaNoVinculada();
    if (!c.renovar) {
      await client.query("COMMIT");
      return descifrar(c.access_token);
    }

    let t: RespuestaToken;
    try {
      t = await pedirToken({ grant_type: "refresh_token", refresh_token: descifrar(c.refresh_token) });
    } catch (e) {
      // Si no se pudo renovar pero el token actual todavía sirve, seguimos con ese y se reintenta en el próximo uso
      if (c.vigente) {
        console.error("No se pudo renovar el token de Mercado Pago:", e);
        await client.query("COMMIT");
        return descifrar(c.access_token);
      }
      throw new CuentaNoVinculada("El permiso de Mercado Pago venció. Vinculá la cuenta de nuevo.");
    }

    await client.query(
      `UPDATE mp_cuenta
          SET access_token = $1, refresh_token = $2, public_key = coalesce($3, public_key),
              token_vence_en = now() + make_interval(secs => $4), actualizada_en = now()
        WHERE id = 1`,
      [cifrar(t.access_token), cifrar(t.refresh_token), t.public_key ?? null, t.expires_in]
    );
    await client.query("COMMIT");
    return t.access_token;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ---------- API (siempre con el token de la barbería) ----------

async function api<T>(ruta: string, opciones: { method?: string; body?: unknown; idempotencia?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await accessToken()}`,
    "Content-Type": "application/json",
  };
  if (opciones.idempotencia) headers["X-Idempotency-Key"] = opciones.idempotencia;

  const r = await fetch(`${API}${ruta}`, {
    method: opciones.method ?? "GET",
    headers,
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const json = await r.json().catch(() => null);
  if (r.status === 401) throw new CuentaNoVinculada("Mercado Pago rechazó el permiso de la cuenta. Vinculá la cuenta de nuevo.");
  if (!r.ok) throw new ErrorMercadoPago(json?.message ?? `Error de Mercado Pago (${r.status})`, r.status, json);
  return json as T;
}

export type DatosPreferencia = {
  turnoToken: string; // UUID del turno: va como external_reference (no se repite aunque se reinicie la base)
  titulo: string;
  monto: number;
  venceEn: Date;
};

// Checkout Pro para pagar la seña. binary_mode: el pago queda aprobado o rechazado, nunca "pendiente".
// Sin Rapipago/Pago Fácil ni cajero: tardan días en acreditarse y el turno vence a los minutos.
export async function crearPreferencia(d: DatosPreferencia): Promise<{ id: string; initPoint: string }> {
  const urlTurno = urlPublica(`/turno/${d.turnoToken}`);
  const p = await api<{ id: string; init_point: string }>("/checkout/preferences", {
    method: "POST",
    body: {
      items: [{ id: "sena", title: d.titulo, quantity: 1, unit_price: d.monto, currency_id: "ARS" }],
      external_reference: d.turnoToken,
      notification_url: urlPublica(RUTA_WEBHOOK),
      back_urls: { success: urlTurno, pending: urlTurno, failure: urlTurno },
      auto_return: "approved",
      binary_mode: true,
      expires: true,
      expiration_date_to: d.venceEn.toISOString(),
      payment_methods: { excluded_payment_types: [{ id: "ticket" }, { id: "atm" }], installments: 1 },
    },
  });
  return { id: p.id, initPoint: p.init_point };
}

export type PagoMP = {
  id: number;
  status: string; // approved, rejected, refunded, charged_back, cancelled...
  status_detail: string;
  external_reference: string | null;
  transaction_amount: number;
  currency_id: string;
  collector_id: number; // cuenta que cobró: tiene que ser la de la barbería
};

export function obtenerPago(id: string | number) {
  return api<PagoMP>(`/v1/payments/${encodeURIComponent(String(id))}`);
}

// Respaldo por si un webhook no llega: los pagos de un turno, del más nuevo al más viejo
export async function buscarPagosDeTurno(turnoToken: string): Promise<PagoMP[]> {
  const params = new URLSearchParams({ external_reference: turnoToken, sort: "date_created", criteria: "desc" });
  const r = await api<{ results?: PagoMP[] }>(`/v1/payments/search?${params}`);
  return r.results ?? [];
}

// Reembolso total. La clave de idempotencia evita devolver dos veces si se reintenta.
export function reembolsarPago(id: string | number) {
  return api<{ id: number; status: string }>(`/v1/payments/${encodeURIComponent(String(id))}/refunds`, {
    method: "POST",
    body: {},
    idempotencia: `reembolso-${id}`,
  });
}

// ---------- Webhook ----------

// Valida el header x-signature: HMAC-SHA256 con la clave secreta de webhooks sobre
// "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" (las partes que no vienen se omiten).
// Es una capa extra: el webhook igual consulta el pago a Mercado Pago y nunca confía en lo que recibe.
export function firmaWebhookValida(xSignature: string | null, xRequestId: string | null, dataId: string | null) {
  const secreto = process.env.MP_WEBHOOK_SECRET;
  if (!secreto || !xSignature) return false;

  const partes = new Map(
    xSignature.split(",").map((p) => {
      const [k, ...v] = p.split("=");
      return [k.trim(), v.join("=").trim()] as const;
    })
  );
  const ts = partes.get("ts");
  const v1 = partes.get("v1");
  if (!ts || !v1) return false;

  let manifest = "";
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${ts};`;

  const esperado = createHmac("sha256", secreto).update(manifest).digest("hex");
  return esperado.length === v1.length && timingSafeEqual(Buffer.from(esperado), Buffer.from(v1));
}
