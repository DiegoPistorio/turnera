"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";
import { NEGOCIO } from "@/lib/config";

export type DatosPeluquero = {
  id: number | null; // null = nuevo
  nombre: string;
  color: string;
  dias: number[]; // 0 = domingo ... 6 = sábado
  servicios: number[];
  activo: boolean;
  acceso: boolean; // si tiene usuario para entrar al panel
  email: string;
  password: string; // vacío = no cambiar
};

async function soloAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return "Tu sesión venció. Volvé a ingresar.";
  if (session.user.rol === "profesional") return "Solo el administrador puede gestionar peluqueros.";
  return null;
}

export async function guardarPeluquero(d: DatosPeluquero): Promise<{ error?: string }> {
  const sinPermiso = await soloAdmin();
  if (sinPermiso) return { error: sinPermiso };

  const nombre = d.nombre.trim();
  const email = d.email.trim().toLowerCase();
  if (nombre.length < 2) return { error: "Ingresá el nombre." };
  if (!/^#[0-9a-f]{6}$/i.test(d.color)) return { error: "Elegí un color." };
  const dias = [...new Set(d.dias)].filter((x) => NEGOCIO.diasAtencion.includes(x));
  if (d.activo && dias.length === 0) return { error: "Marcá al menos un día de trabajo." };
  if (d.acceso && !/^\S+@\S+\.\S+$/.test(email)) return { error: "Ingresá un email válido para el acceso." };
  if (d.password && d.password.length < 8) return { error: "La contraseña tiene que tener al menos 8 caracteres." };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Datos del peluquero
    let id = d.id;
    let usuarioId: number | null = null;
    if (id === null) {
      const { rows } = await client.query(
        `INSERT INTO profesionales (nombre, color, activo) VALUES ($1, $2, $3) RETURNING id`,
        [nombre, d.color, d.activo]
      );
      id = rows[0].id as number;
    } else {
      const { rows } = await client.query(
        `UPDATE profesionales SET nombre = $2, color = $3, activo = $4 WHERE id = $1 RETURNING usuario_id`,
        [id, nombre, d.color, d.activo]
      );
      if (!rows[0]) throw new Error("Peluquero inexistente");
      usuarioId = rows[0].usuario_id;
    }

    // 2. Días de trabajo: una franja por día con el horario fijo del local
    await client.query(`DELETE FROM horarios WHERE profesional_id = $1`, [id]);
    if (dias.length > 0) {
      await client.query(
        `INSERT INTO horarios (profesional_id, dia_semana, hora_inicio, hora_fin)
         SELECT $1, unnest($2::smallint[]), $3::time, $4::time`,
        [id, dias, NEGOCIO.horario.apertura, NEGOCIO.horario.cierre]
      );
    }

    // 3. Servicios que hace
    await client.query(`DELETE FROM profesional_servicios WHERE profesional_id = $1`, [id]);
    if (d.servicios.length > 0) {
      await client.query(
        `INSERT INTO profesional_servicios (profesional_id, servicio_id) SELECT $1, unnest($2::int[])`,
        [id, d.servicios]
      );
    }

    // 4. Acceso al panel (usuario con rol "profesional": solo ve y carga sus turnos)
    if (d.acceso) {
      if (usuarioId === null) {
        if (!d.password) {
          await client.query("ROLLBACK");
          return { error: "Poné una contraseña para el acceso nuevo." };
        }
        const { rows } = await client.query(
          `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
           VALUES ($1, $2, $3, 'profesional', $4) RETURNING id`,
          [nombre, email, await bcrypt.hash(d.password, 10), d.activo]
        );
        await client.query(`UPDATE profesionales SET usuario_id = $2 WHERE id = $1`, [id, rows[0].id]);
      } else {
        await client.query(
          `UPDATE usuarios
              SET nombre = $2, email = $3, activo = $4,
                  password_hash = COALESCE($5, password_hash)
            WHERE id = $1`,
          [usuarioId, nombre, email, d.activo, d.password ? await bcrypt.hash(d.password, 10) : null]
        );
      }
    } else if (usuarioId !== null) {
      // Se le quitó el acceso: el usuario queda desactivado (no puede volver a entrar)
      await client.query(`UPDATE usuarios SET activo = false WHERE id = $1`, [usuarioId]);
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    if ((e as { code?: string }).code === "23505") {
      return { error: "Ese email ya lo usa otro usuario." };
    }
    throw e;
  } finally {
    client.release();
  }

  revalidatePath("/admin/peluqueros");
  return {};
}
