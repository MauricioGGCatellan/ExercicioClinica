BEGIN;

-- Garante a existência da data de publicação
ALTER TABLE reports
ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Cria unicidade por agendamento, independentemente do status
CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_appointment_id
ON reports (appointment_id)
WHERE appointment_id IS NOT NULL;

COMMIT;