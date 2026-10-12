"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { NEGOCIO } from "@/lib/config";

export type TurnoAfectado = {
  id: number;
  fecha: string;
  hora: string;
  cliente: string;
  telefono: string;
  servicio: string;
  profesional: string;
};

type NuevoCierre = {
  profesionalId: number | null; // null = cierra todo el local
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
  diaCompleto: boolean;
  horaDesde?: string; // HH:MM, solo si no es día completo
  horaHasta?: string;
  motivo?: string;
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}$/;

export async function crearCierre(
  d: NuevoCierre
): Promise<{ error?: string; afectados?: TurnoAfectado[] }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Tu sesión venció. Volvé a ingresar." };

  // Un profesional solo puede bloquear su propia agenda; cerrar el local es cosa del admin
  if (session.user.rol === "profesional") {
    const [propio] = await query<{ id: number }>(
      `SELECT id FROM profesionales WHERE usuario_id = $1`,
      [Number(session.user.id)]
    );
    if (!propio || d.profesionalId !== propio.id) {
      return { error: "Solo podés bloquear tu propia agenda." };
    }
  }

  if (!FECHA.test(d.desde) || !FECHA.test(d.hasta)) return { error: "Elegí las fechas." };
  if (d.hasta < d.desde) return { error: "La fecha final no puede ser anterior a la inicial." };

  let inicioSql: string;
  let finSql: string;
  const params: unknown[] = [d.profesionalId, d.motivo?.trim() || null, NEGOCIO.zonaHoraria, d.desde, d.hasta];

  if (d.diaCompleto) {
    // Desde las 00:00 del primer día hasta las 00:00 del día siguiente al último
    inicioSql = `($4::date)::timestamp AT TIME ZONE $3`;
    finSql = `($5::date + 1)::timestamp AT TIME ZONE $3`;
  } else {
    if (d.desde !== d.hasta) return { error: "Para cerrar solo unas horas, elegí un único día." };
    if (!d.horaDesde || !d.horaHasta || !HORA.test(d.horaDesde) || !HORA.test(d.horaHasta)) {
      return { error: "Elegí el horario de cierre." };
    }
    if (d.horaHasta <= d.horaDesde) return { error: "La hora final tiene que ser posterior a la inicial." };
    params.push(d.horaDesde, d.horaHasta);
    inicioSql = `($4::date + $6::time) AT TIME ZONE $3`;
    finSql = `($4::date + $7::time) AT TIME ZONE $3`;
  }

  const [cierre] = await query<{ inicio: Date; fin: Date }>(
    `INSERT INTO bloqueos (profesional_id, inicio, fin, motivo)
     VALUES ($1, ${inicioSql}, ${finSql}, $2)
     RETURNING inicio, fin`,
    params
  );

  // Turnos ya reservados que caen dentro del cierre: no se cancelan solos, se avisan
  const afectados = await query<TurnoAfectado>(
    `SELECT t.id,
            to_char(t.inicio AT TIME ZONE $4, 'YYYY-MM-DD') AS fecha,
            to_char(t.inicio AT TIME ZONE $4, 'HH24:MI') AS hora,
            c.nombre AS cliente, c.telefono, s.nombre AS servicio, p.nombre AS profesional
       FROM turnos t
       JOIN clientes c      ON c.id = t.cliente_id
       JOIN servicios s     ON s.id = t.servicio_id
       JOIN profesionales p ON p.id = t.profesional_id
      WHERE t.estado IN ('pendiente', 'confirmado')
        AND ($1::int IS NULL OR t.profesional_id = $1)
        AND tstzrange(t.inicio, t.fin, '[)') && tstzrange($2, $3, '[)')
      ORDER BY t.inicio`,
    [d.profesionalId, cierre.inicio, cierre.fin, NEGOCIO.zonaHoraria]
  );

  revalidatePath("/admin/cierres");
  return { afectados };
}

export async function borrarCierre(id: number): Promise<{ error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Tu sesión venció. Volvé a ingresar." };
  const soloUsuario = session.user.rol === "profesional" ? Number(session.user.id) : null;

  await query(
    `DELETE FROM bloqueos b
      WHERE b.id = $1
        AND ($2::int IS NULL OR b.profesional_id IN
              (SELECT id FROM profesionales WHERE usuario_id = $2))`,
    [id, soloUsuario]
  );
  revalidatePath("/admin/cierres");
  return {};
}
