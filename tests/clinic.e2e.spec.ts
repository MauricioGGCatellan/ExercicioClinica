import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { Pool } from 'pg';

type ExamType = 'xray' | 'ultrasound' | 'magnetic_resonance';

type AuthResponse = {
  token: string;
  tokenType: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: 'patient' | 'professional';
  };
};

type Appointment = {
  id: string;
  starts_at: string;
  exam_type: ExamType;
  status: string;
};

type Report = {
  id: string;
  title: string;
  status: 'draft' | 'published';
  published_at: string | null;
  appointment_id: string;
};

const FRONTEND_BASE = process.env.FRONTEND_BASE_URL ?? 'http://localhost:3000';
const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:3001';
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgres://clinic:clinic123@localhost:5432/clinicdb';

const CLINIC_TIMEZONE = 'America/Sao_Paulo';

const PATIENT_A = {
  email: 'paciente@teste.com',
  password: 'Paciente123!',
};

const PROFESSIONAL = {
  email: 'profissional@teste.com',
  password: 'Profissional123!',
};

const PATIENT_B = {
  email: 'e2e.patient.b@clinic.test',
  password: 'E2ePatientB123!',
  fullName: 'Paciente E2E B',
  phone: '(11) 97777-7777',
  cpf: '98765432100',
};

const CONCURRENCY_SLOT = clinicIso(5, 10, 0);
const PAST_SLOT = clinicIso(-1, 10, 0);

// Fixtures de laudo para os casos 2, 3 e 4.
const DRAFT_APPOINTMENT_SLOT = clinicIso(20, 8, 0);
const PUBLISHED_APPOINTMENT_SLOT = clinicIso(21, 9, 0);

let api: APIRequestContext;
let pool: Pool;

let patientBId = '';
let patientAToken = '';
let patientBToken = '';
let professionalToken = '';

let draftReportId = '';
let publishedReportId = '';

test.describe.serial('Clinic E2E', () => {
  test.beforeAll(async ({ playwright }) => {
    pool = new Pool({ connectionString: DATABASE_URL });
    api = await playwright.request.newContext({
      baseURL: API_BASE,
    });

    // Limpeza de qualquer dado de execuções anteriores.
    await cleanupPatientData(PATIENT_B.email);
    await deleteAppointmentsByStartsAt(CONCURRENCY_SLOT);
    await deleteAppointmentsByStartsAt(PAST_SLOT);
    await deleteAppointmentsByStartsAt(DRAFT_APPOINTMENT_SLOT);
    await deleteAppointmentsByStartsAt(PUBLISHED_APPOINTMENT_SLOT);

    // Recria paciente B de forma idempotente.
    patientBId = await seedPatient(PATIENT_B);

    // Logins necessários para o restante da suíte.
    patientAToken = await loginApi(PATIENT_A.email, PATIENT_A.password);
    patientBToken = await loginApi(PATIENT_B.email, PATIENT_B.password);
    professionalToken = await loginApi(PROFESSIONAL.email, PROFESSIONAL.password);

    // Cria um rascunho que pertence ao paciente B.
    const draftAppointment = await createAppointmentAsPatient(
      patientBToken,
      DRAFT_APPOINTMENT_SLOT,
      'xray'
    );

    const draftReport = await createDraftReport(
      professionalToken,
      draftAppointment.id,
      'Laudo rascunho E2E',
      'Conteúdo do laudo rascunho E2E.'
    );

    draftReportId = draftReport.id;

    // Cria um laudo publicado para o paciente B.
    const publishedAppointment = await createAppointmentAsPatient(
      patientBToken,
      PUBLISHED_APPOINTMENT_SLOT,
      'ultrasound'
    );

    const createdPublishedReport = await createDraftReport(
      professionalToken,
      publishedAppointment.id,
      'Laudo publicado E2E',
      'Conteúdo do laudo publicado E2E.'
    );

    const publishResponse = await api.patch(
      `/professional/reports/${createdPublishedReport.id}/publish`,
      {
        headers: authHeaders(professionalToken),
      }
    );

    expect(publishResponse.ok()).toBeTruthy();
    publishedReportId = createdPublishedReport.id;
  });

  test.afterEach(async () => {
    // Garante limpeza das tentativas do caso 1 e 5.
    await deleteAppointmentsByStartsAt(CONCURRENCY_SLOT);
    await deleteAppointmentsByStartsAt(PAST_SLOT);
  });

  test.afterAll(async () => {
    if (publishedReportId) {
      await pool.query(`DELETE FROM reports WHERE id = $1`, [publishedReportId]);
    }

    if (draftReportId) {
      await pool.query(`DELETE FROM reports WHERE id = $1`, [draftReportId]);
    }

    await deleteAppointmentsByStartsAt(DRAFT_APPOINTMENT_SLOT);
    await deleteAppointmentsByStartsAt(PUBLISHED_APPOINTMENT_SLOT);

    await cleanupPatientData(PATIENT_B.email);

    await api.dispose();
    await pool.end();
  });

  test('1. Duas tentativas simultâneas de agendamento no mesmo horário: apenas uma deve ser aceita.', async () => {
    const payload = {
      examType: 'xray' as const,
      startsAt: CONCURRENCY_SLOT,
    };

    const [responseA, responseB] = await Promise.all([
      api.post('/me/appointments', {
        headers: authHeaders(patientAToken),
        data: payload,
      }),
      api.post('/me/appointments', {
        headers: authHeaders(patientBToken),
        data: payload,
      }),
    ]);

    const statuses = [responseA.status(), responseB.status()].sort();

    expect(statuses).toEqual([201, 409]);
  });

  test('2. Um paciente tenta consultar um laudo de outro paciente: o acesso deve ser negado.', async () => {
    const response = await api.get(`/me/reports/${publishedReportId}`, {
      headers: authHeaders(patientAToken),
    });

    expect(response.status()).toBe(404);
  });

  test('3. Um paciente tenta acessar um rascunho: seu conteúdo não deve ser disponibilizado.', async () => {
    const response = await api.get(`/me/reports/${draftReportId}`, {
      headers: authHeaders(patientBToken),
    });

    expect(response.status()).toBe(404);
  });

  test('4. Um laudo é publicado e passa a estar disponível para o paciente correto.', async ({ page }) => {
    await uiLogin(page, PATIENT_B.email, PATIENT_B.password, 'patient');

    await page.goto(`${FRONTEND_BASE}/laudos`);

    await expect(
      page.getByRole('heading', {
        name: 'Laudo publicado E2E',
        exact: true
      })
    ).toBeVisible();
    await expect(page.getByText(/Publicado em:/)).toBeVisible(); 
  });

  test('5. Uma tentativa de agendar no passado é rejeitada.', async () => {
    const response = await api.post('/me/appointments', {
      headers: authHeaders(patientAToken),
      data: {
        examType: 'xray',
        startsAt: PAST_SLOT,
      },
    });

    expect(response.status()).toBe(400);
  });
});

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function loginApi(email: string, password: string): Promise<string> {
  const response = await api.post('/auth/login', {
    data: { email, password },
  });

  expect(response.ok()).toBeTruthy();

  const body = (await response.json()) as AuthResponse;
  return body.token;
}

async function uiLogin(
  page: Page,
  email: string,
  password: string,
  role: 'patient' | 'professional' = 'patient'
) {
  await page.goto(`${FRONTEND_BASE}/login`);

  if (role === 'professional') {
    await page.getByRole('radio', { name: 'Profissional' }).check();
  } else {
    await page.getByRole('radio', { name: 'Paciente' }).check();
  }

  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.locator('form.login-form')
    .getByRole('button', { name: 'Entrar' })
    .click();

  await expect(page).toHaveURL(/\/$/);
}

async function createAppointmentAsPatient(
  token: string,
  startsAt: string,
  examType: ExamType
): Promise<Appointment> {
  const response = await api.post('/me/appointments', {
    headers: authHeaders(token),
    data: {
      examType,
      startsAt,
    },
  });

  expect(response.ok()).toBeTruthy();

  return (await response.json()) as Appointment;
}

async function createDraftReport(
  token: string,
  appointmentId: string,
  title: string,
  content: string
): Promise<Report> {
  const response = await api.post('/professional/reports/drafts', {
    headers: authHeaders(token),
    data: {
      appointmentId,
      title,
      text: content,
    },
  });

  expect(response.ok()).toBeTruthy();

  return (await response.json()) as Report;
}

async function seedPatient(patient: {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  cpf: string;
}): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `
    INSERT INTO users (
      full_name,
      email,
      password_hash,
      phone,
      role,
      is_active
    )
    VALUES (
      $1,
      $2,
      crypt($3, gen_salt('bf')),
      $4,
      'patient',
      TRUE
    )
    ON CONFLICT (email) DO UPDATE
    SET
      full_name = EXCLUDED.full_name,
      password_hash = EXCLUDED.password_hash,
      phone = EXCLUDED.phone,
      role = 'patient',
      is_active = TRUE
    RETURNING id
    `,
    [patient.fullName, patient.email, patient.password, patient.phone]
  );

  const userId = result.rows[0].id;

  await pool.query(
    `
    INSERT INTO patients (
      user_id,
      cpf,
      birth_date,
      gender,
      notes
    )
    VALUES ($1, $2, DATE '1996-01-01', 'F', 'Paciente E2E')
    ON CONFLICT (user_id) DO UPDATE
    SET
      cpf = EXCLUDED.cpf,
      birth_date = EXCLUDED.birth_date,
      gender = EXCLUDED.gender,
      notes = EXCLUDED.notes
    `,
    [userId, patient.cpf]
  );

  return userId;
}

async function cleanupPatientData(email: string) {
  const patientIdResult = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1`,
    [email]
  );

  const patientId = patientIdResult.rows[0]?.id;
  if (!patientId) return;

  await pool.query(`DELETE FROM reports WHERE patient_id = $1`, [patientId]);
  await pool.query(`DELETE FROM appointments WHERE patient_id = $1`, [patientId]);
  await pool.query(`DELETE FROM patients WHERE user_id = $1`, [patientId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [patientId]);
}

async function deleteAppointmentsByStartsAt(startsAt: string) {
  await pool.query(`DELETE FROM reports WHERE appointment_id IN (
      SELECT id FROM appointments WHERE starts_at = $1
    )`, [startsAt]);

  await pool.query(`DELETE FROM appointments WHERE starts_at = $1`, [startsAt]);
}

function clinicDateString(offsetDays: number): string {
  const now = new Date();

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLINIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);

  const shifted = new Date(Date.UTC(year, month - 1, day + offsetDays));

  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, '0'),
    String(shifted.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function clinicIso(offsetDays: number, hour: number, minute: number): string {
  return `${clinicDateString(offsetDays)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-03:00`;
}