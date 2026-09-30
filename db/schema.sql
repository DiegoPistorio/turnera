-- ============================================
-- Turnera - Esquema inicial
-- ============================================
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- necesaria para la exclusion constraint

CREATE TYPE rol_usuario  AS ENUM ('admin', 'profesional');
CREATE TYPE estado_turno AS ENUM ('pendiente', 'confirmado', 'cancelado', 'completado', 'ausente');

-- Usuarios del panel (el cliente final NO tiene usuario)
CREATE TABLE usuarios (
  id            SERIAL PRIMARY KEY,
  nombre        TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol           rol_usuario NOT NULL DEFAULT 'profesional',
  activo        BOOLEAN NOT NULL DEFAULT true,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE profesionales (
  id         SERIAL PRIMARY KEY,
  usuario_id INT UNIQUE REFERENCES usuarios(id) ON DELETE SET NULL,
  nombre     TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#6366f1',  -- color en la agenda
  activo     BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE servicios (
  id           SERIAL PRIMARY KEY,
  nombre       TEXT NOT NULL,
  descripcion  TEXT,
  duracion_min INT NOT NULL CHECK (duracion_min > 0 AND duracion_min % 15 = 0),
  precio       NUMERIC(12,2) NOT NULL CHECK (precio >= 0),
  activo       BOOLEAN NOT NULL DEFAULT true
);

-- Qué servicios hace cada profesional
CREATE TABLE profesional_servicios (
  profesional_id INT REFERENCES profesionales(id) ON DELETE CASCADE,
  servicio_id    INT REFERENCES servicios(id)     ON DELETE CASCADE,
  PRIMARY KEY (profesional_id, servicio_id)
);

-- Horario semanal de atención (puede haber 2 franjas por día: mañana y tarde)
CREATE TABLE horarios (
  id             SERIAL PRIMARY KEY,
  profesional_id INT NOT NULL REFERENCES profesionales(id) ON DELETE CASCADE,
  dia_semana     SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6), -- 0 = domingo
  hora_inicio    TIME NOT NULL,
  hora_fin       TIME NOT NULL,
  CHECK (hora_fin > hora_inicio)
);

-- Vacaciones, feriados, trámites. profesional_id NULL = cierra todo el local
CREATE TABLE bloqueos (
  id             SERIAL PRIMARY KEY,
  profesional_id INT REFERENCES profesionales(id) ON DELETE CASCADE,
  inicio         TIMESTAMPTZ NOT NULL,
  fin            TIMESTAMPTZ NOT NULL,
  motivo         TEXT,
  CHECK (fin > inicio)
);

CREATE TABLE clientes (
  id        SERIAL PRIMARY KEY,
  nombre    TEXT NOT NULL,
  telefono  TEXT NOT NULL UNIQUE,   -- identifica al cliente
  email     TEXT,
  notas     TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE turnos (
  id             SERIAL PRIMARY KEY,
  cliente_id     INT NOT NULL REFERENCES clientes(id),
  profesional_id INT NOT NULL REFERENCES profesionales(id),
  servicio_id    INT NOT NULL REFERENCES servicios(id),
  inicio         TIMESTAMPTZ NOT NULL,
  fin            TIMESTAMPTZ NOT NULL,
  estado         estado_turno NOT NULL DEFAULT 'confirmado',
  precio         NUMERIC(12,2) NOT NULL,  -- snapshot del precio al reservar
  notas          TEXT,
  origen         TEXT NOT NULL DEFAULT 'web' CHECK (origen IN ('web', 'admin', 'asistente')),
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fin > inicio),
  -- La clave: un profesional no puede tener dos turnos activos superpuestos.
  -- Los cancelados no cuentan, así ese horario se libera.
  CONSTRAINT turnos_sin_superposicion EXCLUDE USING gist (
    profesional_id WITH =,
    tstzrange(inicio, fin, '[)') WITH &&
  ) WHERE (estado IN ('pendiente', 'confirmado'))
);

CREATE INDEX idx_turnos_prof_inicio ON turnos (profesional_id, inicio);
CREATE INDEX idx_turnos_cliente     ON turnos (cliente_id);
CREATE INDEX idx_bloqueos_rango     ON bloqueos (profesional_id, inicio, fin);

ALTER TABLE turnos ADD COLUMN token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE;
