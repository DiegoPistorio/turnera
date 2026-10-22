-- ============================================
-- Turnera - Esquema inicial
-- ============================================
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- necesaria para la exclusion constraint

CREATE TYPE rol_usuario  AS ENUM ('admin', 'profesional');
-- vencido = turno web que no se pagó a tiempo (libera el horario)
CREATE TYPE estado_turno AS ENUM ('pendiente', 'confirmado', 'cancelado', 'completado', 'ausente', 'vencido');

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
  sena           NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (sena >= 0), -- 0 = turno sin seña (cargado a mano)
  vence_en       TIMESTAMPTZ,  -- hasta cuándo se puede pagar la seña
  mp_preferencia_id TEXT,      -- preferencia de Checkout Pro, para reintentar el pago
  cancelado_por  TEXT CHECK (cancelado_por IN ('cliente', 'barberia')),
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
CREATE INDEX idx_turnos_pendientes_vence ON turnos (vence_en) WHERE estado = 'pendiente';

-- La cuenta de Mercado Pago de la barbería, vinculada por OAuth. Una sola fila.
-- Los tokens se guardan cifrados (AES-256-GCM): nunca en claro.
CREATE TABLE mp_cuenta (
  id             SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  mp_user_id     BIGINT NOT NULL,
  access_token   TEXT NOT NULL,
  refresh_token  TEXT NOT NULL,
  public_key     TEXT,
  token_vence_en TIMESTAMPTZ NOT NULL,
  modo_prueba    BOOLEAN NOT NULL DEFAULT false,
  vinculada_por  INT REFERENCES usuarios(id) ON DELETE SET NULL,
  vinculada_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizada_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pagos de seña recibidos de Mercado Pago (uno por intento de pago)
CREATE TABLE pagos (
  id               SERIAL PRIMARY KEY,
  turno_id         INT NOT NULL REFERENCES turnos(id),
  mp_payment_id    BIGINT NOT NULL UNIQUE,
  monto            NUMERIC(12,2) NOT NULL,
  estado           TEXT NOT NULL,  -- status de MP: approved, rejected, refunded...
  estado_detalle   TEXT,           -- status_detail de MP
  reembolso_estado TEXT CHECK (reembolso_estado IN ('pendiente', 'hecho', 'error')),
  reembolso_error  TEXT,
  reembolsado_en   TIMESTAMPTZ,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pagos_turno ON pagos (turno_id);

ALTER TABLE turnos ADD COLUMN token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE;
