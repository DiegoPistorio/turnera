import type { Pool, PoolClient } from "pg";
import { pool, query } from "@/lib/db";

export type Slot = { inicio: string; hora: string };

// Los turnos web que no se pagaron a tiempo pasan a "vencido" y liberan el horario.
// Se corre antes de mostrar o reservar horarios, así no hace falta un proceso aparte.
export async function vencerPendientes(db: Pool | PoolClient = pool) {
  await db.query(`UPDATE turnos SET estado = 'vencido' WHERE estado = 'pendiente' AND vence_en < now()`);
}

// Devuelve los horarios libres de un profesional para un servicio en una fecha.
// Todo el cálculo lo hace Postgres: genera candidatos cada 15 min dentro de las
// franjas de atención y descarta los que pisan un turno activo o un bloqueo.
const SQL = `
WITH params AS (
  SELECT $1::int AS prof, $2::int AS serv, $3::date AS fecha,
         (SELECT duracion_min FROM servicios WHERE id = $2 AND activo) AS dur
),
franjas AS (
  SELECT (p.fecha + h.hora_inicio) AT TIME ZONE 'America/Argentina/Buenos_Aires' AS ini,
         (p.fecha + h.hora_fin)    AT TIME ZONE 'America/Argentina/Buenos_Aires' AS fin,
         p.dur
  FROM params p
  JOIN horarios h ON h.profesional_id = p.prof
                 AND h.dia_semana = EXTRACT(DOW FROM p.fecha)
  WHERE EXISTS (SELECT 1 FROM profesional_servicios ps
                WHERE ps.profesional_id = p.prof AND ps.servicio_id = p.serv)
),
candidatos AS (
  SELECT gs AS inicio, gs + make_interval(mins => f.dur) AS fin
  FROM franjas f,
       generate_series(f.ini, f.fin - make_interval(mins => f.dur), interval '15 minutes') AS gs
)
SELECT c.inicio,
       to_char(c.inicio AT TIME ZONE 'America/Argentina/Buenos_Aires', 'HH24:MI') AS hora
FROM candidatos c, params p
WHERE c.inicio > now() + interval '30 minutes'
  AND NOT EXISTS (
    SELECT 1 FROM turnos t
    WHERE t.profesional_id = p.prof
      AND t.estado IN ('pendiente', 'confirmado')
      AND tstzrange(t.inicio, t.fin, '[)') && tstzrange(c.inicio, c.fin, '[)'))
  AND NOT EXISTS (
    SELECT 1 FROM bloqueos b
    WHERE (b.profesional_id = p.prof OR b.profesional_id IS NULL)
      AND tstzrange(b.inicio, b.fin, '[)') && tstzrange(c.inicio, c.fin, '[)'))
ORDER BY c.inicio;
`;

export async function obtenerDisponibilidad(
  profesionalId: number,
  servicioId: number,
  fecha: string // "YYYY-MM-DD"
): Promise<Slot[]> {
  const rows = await query<{ inicio: Date; hora: string }>(SQL, [
    profesionalId,
    servicioId,
    fecha,
  ]);
  return rows.map((r) => ({ inicio: r.inicio.toISOString(), hora: r.hora }));
}

export type SlotConProfesionales = Slot & { profesionales: number[] };

// "El primero disponible": junta los horarios de todos los profesionales
// que hacen el servicio y recuerda quién está libre en cada horario.
export async function obtenerDisponibilidadCualquiera(
  servicioId: number,
  fecha: string
): Promise<SlotConProfesionales[]> {
  const profesionales = await query<{ id: number }>(
    `SELECT p.id
       FROM profesionales p
       JOIN profesional_servicios ps ON ps.profesional_id = p.id
      WHERE ps.servicio_id = $1 AND p.activo
      ORDER BY p.id`,
    [servicioId]
  );

  const porHorario = new Map<string, SlotConProfesionales>();
  for (const { id } of profesionales) {
    const slots = await obtenerDisponibilidad(id, servicioId, fecha);
    for (const s of slots) {
      const existente = porHorario.get(s.inicio);
      if (existente) existente.profesionales.push(id);
      else porHorario.set(s.inicio, { ...s, profesionales: [id] });
    }
  }
  return [...porHorario.values()].sort((a, b) => a.inicio.localeCompare(b.inicio));
}
