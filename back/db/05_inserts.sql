CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

-- Paciente mockado
WITH new_user AS (
    INSERT INTO users (
        full_name,
        email,
        password_hash,
        phone,
        role,
        is_active
    )
    VALUES (
        'Paciente Teste',
        'paciente@teste.com',
        crypt('Paciente123!', gen_salt('bf')),
        '(11) 99999-0001',
        'patient',
        TRUE
    )
    RETURNING id
)
INSERT INTO patients (
    user_id,
    cpf,
    birth_date,
    gender,
    notes
)
SELECT
    id,
    '12345678901',
    DATE '1995-04-20',
    'F',
    'Paciente mockado para testes'
FROM new_user;

-- Profissional mockado
WITH new_user AS (
    INSERT INTO users (
        full_name,
        email,
        password_hash,
        phone,
        role,
        is_active
    )
    VALUES (
        'Dra. Ana Souza',
        'profissional@teste.com',
        crypt('Profissional123!', gen_salt('bf')),
        '(11) 98888-0002',
        'professional',
        TRUE
    )
    RETURNING id
)
INSERT INTO professionals (
    user_id,
    council_number,
    specialty,
    license_state,
    notes
)
SELECT
    id,
    'CRM-SP 123456',
    'Radiologia',
    'SP',
    'Profissional mockado para testes'
FROM new_user;

COMMIT;