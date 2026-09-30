import { Pool } from "pg";

// En desarrollo Next.js recarga módulos en caliente: guardamos el pool
// en globalThis para no abrir conexiones nuevas en cada cambio.
const globalForDb = globalThis as unknown as { pool?: Pool };

export const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export async function query<T = unknown>(text: string, params?: unknown[]) {
  const result = await pool.query(text, params);
  return result.rows as T[];
}
