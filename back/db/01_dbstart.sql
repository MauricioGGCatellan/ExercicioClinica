-- Extensões úteis
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Tipos
CREATE TYPE user_role AS ENUM ('patient', 'professional');
CREATE TYPE appointment_status AS ENUM ('scheduled', 'cancelled', 'completed', 'no_show');
CREATE TYPE report_status AS ENUM ('draft', 'published');

-- Usuários base
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name       TEXT NOT NULL,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    phone           TEXT,
    role            user_role NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pacientes
CREATE TABLE patients (
    user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    cpf             VARCHAR(11) UNIQUE,
    birth_date      DATE,
    gender          TEXT,
    notes           TEXT
);

-- Profissionais
CREATE TABLE professionals (
    user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    council_number  TEXT UNIQUE,      -- ex.: CRM, CRP, CREFITO etc.
    specialty       TEXT,
    license_state   CHAR(2),
    notes           TEXT
);

