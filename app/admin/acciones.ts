"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool, query } from "@/lib/db";
import { NEGOCIO } from "@/lib/config";

const ESTADOS = ["confirmado", "completado", "ausente", "cancelado"];

export async function cambiarEstado(id: number, estado: string): Promise<{ error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Tu sesión venció. Volvé a ingresar." };
  if (!ESTADOS.includes(estado)) return { error: "Estado inválido." };

  // Un profesional solo puede tocar sus propios turnos; el admin, todos
  const soloUsuario = session.user.rol === "profesional" ? Number(session.user.id) : null;

  try {
    await query(
      `UPDATE turnos t
          SET estado = $2
         FROM profesionales p
        WHERE t.id = $1
          AND p.id = t.profesional_id
          AND ($3::int IS NULL OR p.usuario_id = $3)`,
      [id, estado, soloUsuario]
    );
  } catch (e) {
    // Reactivar un turno cancelado cuyo horario ya tomó otra persona
    if ((e as { code?: string }).code === "23P01") {
      return { error: "Ese horario ya lo ocupa otro turno. No se puede reactivar." };
    }
    throw e;
  }

  revalidatePath("/admin");
  return {};
}

// ---------- Carga manual de turnos ----------

export async function buscarCliente(telefono: string): Promise<{ nombre: string; turnos: number } | null> {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  const digitos = telefono.replace(/\D/g, "");
  if (digitos.length < 8) return null;

  const [c] = await query<{ nombre: string; turnos: number }>(
    `SELECT c.nombre, count(t.id)::int AS turnos
       FROM clientes c
       LEFT JOIN turnos t ON t.cliente_id = c.id AND t.estado <> 'cancelado'
      WHERE c.telefono = $1
      GROUP BY c.id`,
    [digitos]
  );
  return c ?? null;
}

type NuevoTurno = {
  telefono: string;
  nombre: string;
  servicioId: number;
  profesionalId: number;
  fecha: string; // YYYY-MM-DD
  hora: string; // HH:MM
  notas?: string;
};

export async function crearTurno(d: NuevoTurno): Promise<{ error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Tu sesión venció. Volvé a ingresar." };

  const telefono = d.telefono.replace(/\D/g, "");
  const nombre = d.nombre.trim();
  const notas = d.notas?.trim() || null;
  if (telefono.length < 8 || telefono.length > 15) return { error: "Ingresá el celular con característica." };
  if (nombre.length < 2) return { error: "Ingresá el nombre del cliente." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha) || !/^\d{2}:\d{2}$/.test(d.hora)) {
    return { error: "Elegí día y horario." };
  }

  // Un profesional solo puede cargarse turnos a sí mismo
  const [prof] = await query<{ nombre: string; usuario_id: number | null; hace_servicio: boolean }>(
    `SELECT p.nombre, p.usuario_id,
            EXISTS (SELECT 1 FROM profesional_servicios ps
                     WHERE ps.profesional_id = p.id AND ps.servicio_id = $2) AS hace_servicio
       FROM profesionales p
      WHERE p.id = $1 AND p.activo`,
    [d.profesionalId, d.servicioId]
  );
  if (!prof) return { error: "El profesional no existe." };
  if (session.user.rol === "profesional" && prof.usuario_id !== Number(session.user.id)) {
    return { error: "Solo podés cargar turnos para vos." };
  }
  if (!prof.hace_servicio) return { error: `${prof.nombre} no hace ese servicio.` };

  const [servicio] = await query<{ duracion_min: number; precio: string }>(
    `SELECT duracion_min, precio FROM servicios WHERE id = $1 AND activo`,
    [d.servicioId]
  );
  if (!servicio) return { error: "El servicio no existe." };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [cliente] } = await client.query(
      `INSERT INTO clientes (nombre, telefono) VALUES ($1, $2)
       ON CONFLICT (telefono) DO UPDATE SET nombre = EXCLUDED.nombre
       RETURNING id`,
      [nombre, telefono]
    );
    await client.query(
      `WITH x AS (SELECT ($5::date + $6::time) AT TIME ZONE $9 AS inicio)
       INSERT INTO turnos (cliente_id, profesional_id, servicio_id, inicio, fin, precio, notas, origen)
       SELECT $1, $2, $3, x.inicio, x.inicio + make_interval(mins => $4::int), $7, $8, 'admin'
         FROM x`,
      [cliente.id, d.profesionalId, d.servicioId, servicio.duracion_min, d.fecha, d.hora, servicio.precio, notas, NEGOCIO.zonaHoraria]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    if ((e as { code?: string }).code === "23P01") {
      return { error: `Ese horario se pisa con otro turno de ${prof.nombre}. Elegí otro.` };
    }
    throw e;
  } finally {
    client.release();
  }

  revalidatePath("/admin");
  return {};
}
