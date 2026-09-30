// Crea (o actualiza) un usuario administrador del panel.
// Uso: node --env-file=.env.local scripts/crear-admin.mjs "Nombre" email contraseña
import pg from "pg";
import bcrypt from "bcryptjs";

const [nombre, email, password] = process.argv.slice(2);
if (!nombre || !email || !password || password.length < 8) {
  console.error('Uso: node --env-file=.env.local scripts/crear-admin.mjs "Nombre" email contraseña');
  console.error("La contraseña tiene que tener al menos 8 caracteres.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const hash = await bcrypt.hash(password, 10);
const { rows: [u] } = await pool.query(
  `INSERT INTO usuarios (nombre, email, password_hash, rol)
   VALUES ($1, lower($2), $3, 'admin')
   ON CONFLICT (email) DO UPDATE
     SET nombre = EXCLUDED.nombre, password_hash = EXCLUDED.password_hash, rol = 'admin', activo = true
   RETURNING id, email`,
  [nombre, email, hash]
);
console.log(`Administrador listo: ${u.email}`);
await pool.end();
