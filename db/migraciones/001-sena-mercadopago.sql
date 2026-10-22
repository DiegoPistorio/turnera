-- ============================================
-- Turnera - Migración 001: seña con Mercado Pago
-- ============================================
-- Se puede correr más de una vez sin romper nada (todo es IF NOT EXISTS).
-- Producción: subir este archivo por "Import Backup" en Coolify.
-- Local:      docker exec -i turnera-db psql -U turnera -d turnera -v ON_ERROR_STOP=1 < db/migraciones/001-sena-mercadopago.sql

-- Turno web que no se pagó a tiempo. No está en la exclusion constraint, así que libera el horario.
ALTER TYPE estado_turno ADD VALUE IF NOT EXISTS 'vencido';

ALTER TABLE turnos
  ADD COLUMN IF NOT EXISTS sena              NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (sena >= 0), -- 0 = turno sin seña (cargado a mano)
  ADD COLUMN IF NOT EXISTS vence_en          TIMESTAMPTZ,  -- hasta cuándo se puede pagar la seña
  ADD COLUMN IF NOT EXISTS mp_preferencia_id TEXT,         -- preferencia de Checkout Pro, para reintentar el pago
  ADD COLUMN IF NOT EXISTS cancelado_por     TEXT CHECK (cancelado_por IN ('cliente', 'barberia'));

-- Para vencer rápido los turnos que esperan pago
CREATE INDEX IF NOT EXISTS idx_turnos_pendientes_vence ON turnos (vence_en) WHERE estado = 'pendiente';

-- La cuenta de Mercado Pago de la barbería, vinculada por OAuth. Una sola fila.
-- Los tokens se guardan cifrados (AES-256-GCM): nunca en claro.
CREATE TABLE IF NOT EXISTS mp_cuenta (
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
CREATE TABLE IF NOT EXISTS pagos (
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

CREATE INDEX IF NOT EXISTS idx_pagos_turno ON pagos (turno_id);
