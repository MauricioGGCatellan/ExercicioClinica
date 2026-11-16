BEGIN;

-- Remove a antiga restrição vinculada ao profissional
ALTER TABLE appointments
DROP CONSTRAINT IF EXISTS no_overlap_professional;

-- Remove eventual índice antigo
DROP INDEX IF EXISTS idx_appointments_professional_id;

-- Remove o vínculo com profissionais
ALTER TABLE appointments
DROP COLUMN IF EXISTS professional_id;

-- Garante que não exista uma constraint anterior com esse nome
ALTER TABLE appointments
DROP CONSTRAINT IF EXISTS no_overlap_clinic_room;

-- Impede qualquer sobreposição de horários na clínica
ALTER TABLE appointments
ADD CONSTRAINT no_overlap_clinic_room
EXCLUDE USING gist (
    tstzrange(starts_at, ends_at, '[)') WITH &&
)
WHERE (status = 'scheduled');

COMMIT;