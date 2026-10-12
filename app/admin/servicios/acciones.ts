"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";

export type DatosServicio = {
  id: number | null; // null = servicio nuevo
  nombre: string;
  descripcion: string;
  duracionMin: number;
  precio: number;
  activo: boolean;
  profesionales: number[];
};

async function soloAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return "Tu sesión venció. Volvé a ingresar.";
  if (session.user.rol === "profesional") return "Solo el administrador puede modificar los servicios.";
  return null;
}

export async function guardarServicio(d: DatosServicio): Promise<{ error?: string; id?: number }> {
  const sinPermiso = await soloAdmin();
  if (sinPermiso) return { error: sinPermiso };

  const nombre = d.nombre.trim();
  const descripcion = d.descripcion.trim() || null;
  if (nombre.length < 2) return { error: "Ingresá el nombre del servicio." };
  if (!Number.isInteger(d.duracionMin) || d.duracionMin <= 0 || d.duracionMin % 15 !== 0) {
    return { error: "La duración tiene que ser de 15, 30, 45 minutos, etc." };
  }
  if (!Number.isFinite(d.precio) || d.precio < 0) return { error: "Ingresá un precio válido." };
  if (d.activo && d.profesionales.length === 0) {
    return { error: "Elegí al menos un peluquero que haga este servicio, o pausalo." };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let id = d.id;
    if (id === null) {
      const { rows } = await client.query(
        `INSERT INTO servicios (nombre, descripcion, duracion_min, precio, activo)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [nombre, descripcion, d.duracionMin, d.precio, d.activo]
      );
      id = rows[0].id as number;
    } else {
      await client.query(
        `UPDATE servicios
            SET nombre = $2, descripcion = $3, duracion_min = $4, precio = $5, activo = $6
          WHERE id = $1`,
        [id, nombre, descripcion, d.duracionMin, d.precio, d.activo]
      );
    }
    // Qué peluqueros lo hacen: se reemplaza la lista completa
    await client.query(`DELETE FROM profesional_servicios WHERE servicio_id = $1`, [id]);
    if (d.profesionales.length > 0) {
      await client.query(
        `INSERT INTO profesional_servicios (profesional_id, servicio_id)
         SELECT unnest($2::int[]), $1`,
        [id, d.profesionales]
      );
    }
    await client.query("COMMIT");
    revalidatePath("/admin/servicios");
    return { id };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// Borrar solo se permite si el servicio nunca tuvo turnos; si tuvo, se pausa (así el historial no se pierde)
export async function borrarServicio(id: number): Promise<{ error?: string; pausado?: boolean }> {
  const sinPermiso = await soloAdmin();
  if (sinPermiso) return { error: sinPermiso };

  const client = await pool.connect();
  try {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM turnos WHERE servicio_id = $1`, [id]);
    if (rows[0].n > 0) {
      await client.query(`UPDATE servicios SET activo = false WHERE id = $1`, [id]);
      revalidatePath("/admin/servicios");
      return { pausado: true };
    }
    await client.query("BEGIN");
    await client.query(`DELETE FROM profesional_servicios WHERE servicio_id = $1`, [id]);
    await client.query(`DELETE FROM servicios WHERE id = $1`, [id]);
    await client.query("COMMIT");
    revalidatePath("/admin/servicios");
    return {};
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
