-- Agendamentos de 30 minutos
CREATE TABLE appointments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID NOT NULL REFERENCES patients(user_id),
    professional_id     UUID NOT NULL REFERENCES professionals(user_id),
    starts_at           TIMESTAMPTZ NOT NULL,
    ends_at             TIMESTAMPTZ NOT NULL,
    status              appointment_status NOT NULL DEFAULT 'scheduled',
    reason              TEXT,
    observations        TEXT,
    exam_type           TEXT NOT NULL CHECK (exam_type IN ('xray', 'ultrasound', 'magnetic_resonance')),
    canceled_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_appointment_30min
        CHECK (ends_at = starts_at + INTERVAL '30 minutes')
);

-- Impede conflito de agenda do profissional em horários ativos
ALTER TABLE appointments
ADD CONSTRAINT no_overlap_professional
EXCLUDE USING gist (
    professional_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
)
WHERE (status = 'scheduled');

-- Impede conflito de agenda do paciente em horários ativos
ALTER TABLE appointments
ADD CONSTRAINT no_overlap_patient
EXCLUDE USING gist (
    patient_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
)
WHERE (status = 'scheduled');

-- Laudos
CREATE TABLE reports (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id          UUID REFERENCES appointments(id) ON DELETE SET NULL,
    patient_id              UUID NOT NULL REFERENCES patients(user_id) ON DELETE CASCADE,
    author_professional_id   UUID NOT NULL REFERENCES professionals(user_id),
    title                   TEXT NOT NULL,
    content                 TEXT NOT NULL,
    status                  report_status NOT NULL DEFAULT 'draft',
    published_at            TIMESTAMPTZ, 
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_report_publish_state
        CHECK (
            (status = 'draft' AND published_at IS NULL)
            OR
            (status = 'published' AND published_at IS NOT NULL)
        )
);

-- Índices úteis
CREATE INDEX idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX idx_appointments_professional_id ON appointments(professional_id);
CREATE INDEX idx_appointments_starts_at ON appointments(starts_at);
CREATE INDEX idx_reports_patient_id ON reports(patient_id);
CREATE INDEX idx_reports_professional_id ON reports(author_professional_id);
CREATE INDEX idx_reports_status ON reports(status);

-- Trigger genérica para updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_appointments_updated_at
BEFORE UPDATE ON appointments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_reports_updated_at
BEFORE UPDATE ON reports
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION set_appointment_ends_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.ends_at := NEW.starts_at + INTERVAL '30 minutes';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_appointment_ends_at
BEFORE INSERT OR UPDATE OF starts_at
ON appointments
FOR EACH ROW
EXECUTE FUNCTION set_appointment_ends_at();