import Koa, { type Context, type Next } from "koa";
import Router from "@koa/router";
import bodyParser from "koa-bodyparser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { pool, query } from "./db.js";

type UserRole = "patient" | "professional";

type AuthenticatedUser = {
  sub: string;
  role: UserRole;
  name: string;
};

type ExamType =
  | "xray"
  | "ultrasound"
  | "magnetic_resonance";

type AppointmentStatus =
  | "scheduled"
  | "cancelled"
  | "completed"
  | "no_show";

type ReportStatus = "draft" | "published";

declare module "koa" {
  interface DefaultState {
    user?: AuthenticatedUser;
  }
}

const app = new Koa();
const router = new Router();

const CLINIC_TIMEZONE = "America/Sao_Paulo";

const EXAM_TYPES: ExamType[] = [
  "xray",
  "ultrasound",
  "magnetic_resonance",
];

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return secret;
}

// Tratamento global de erros
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    console.error("API error:", error);

    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error
        ? Number((error as { status: number }).status)
        : 500;

    ctx.status = status || 500;
    ctx.body = {
      error:
        ctx.status >= 500
          ? "Internal server error"
          : error instanceof Error
            ? error.message
            : "Request error",
    };
  }
});

app.use(bodyParser());

// =====================================================
// HELPERS
// =====================================================

function getBody(ctx: Context): Record<string, unknown> {
  const value = (
    ctx.request as typeof ctx.request & { body?: unknown }
  ).body;

  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return {};
  }

  return value as Record<string, unknown>;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isExamType(value: string): value is ExamType {
  return EXAM_TYPES.includes(value as ExamType);
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function getClinicDateParts(date: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLINIC_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
}

function getClinicDate(date: Date): string {
  const parts = getClinicDateParts(date);

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function validateAppointmentDateTime(
  value: string
): Date | null {
  // Exige data/hora ISO com indicação explícita de fuso.
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  // Não permite datas passadas ou hoje.
  // O agendamento deve ser feito a partir do dia seguinte.
  const clinicDate = getClinicDate(date);
  const today = getClinicDate(new Date());

  if (clinicDate <= today) {
    return null;
  }

  // Verifica horário no fuso da clínica.
  const parts = getClinicDateParts(date);

  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);

  const validHour = hour >= 8 && hour <= 17;

  const validMinute = minute === 0 || minute === 30;

  // O último horário possível é 17:00.
  const validClosingTime =
    hour < 17 || (hour === 17 && minute === 0);

  const validSeconds = second === 0;
  const validMilliseconds = date.getUTCMilliseconds() === 0;

  if (
    !validHour ||
    !validMinute ||
    !validClosingTime ||
    !validSeconds ||
    !validMilliseconds
  ) {
    return null;
  }

  return date;
}

function getDatabaseErrorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error
  ) {
    return String((error as { code: unknown }).code);
  }

  return undefined;
}

function badRequest(ctx: Context, message: string) {
  ctx.status = 400;
  ctx.body = { error: message };
}

function notFound(ctx: Context, message: string) {
  ctx.status = 404;
  ctx.body = { error: message };
}

function conflict(ctx: Context, message: string) {
  ctx.status = 409;
  ctx.body = { error: message };
}

// =====================================================
// AUTENTICAÇÃO
// =====================================================

async function authRequired(ctx: Context, next: Next) {
  const header = ctx.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    ctx.status = 401;
    ctx.body = { error: "Missing bearer token" };
    return;
  }

  const token = header.slice("Bearer ".length);

  let decoded: string | jwt.JwtPayload;

  try {
    decoded = jwt.verify(token, getJwtSecret());
  } catch {
    ctx.status = 401;
    ctx.body = { error: "Invalid or expired token" };
    return;
  }

  if (
    typeof decoded === "string" ||
    typeof decoded.sub !== "string" ||
    typeof decoded.name !== "string" ||
    (decoded.role !== "patient" &&
      decoded.role !== "professional")
  ) {
    ctx.status = 401;
    ctx.body = { error: "Invalid token payload" };
    return;
  }

  ctx.state.user = {
    sub: decoded.sub,
    name: decoded.name,
    role: decoded.role,
  };

  await next();
}

function requireRole(...roles: UserRole[]) {
  return async (ctx: Context, next: Next) => {
    const user = ctx.state.user;

    if (!user) {
      ctx.status = 401;
      ctx.body = { error: "Unauthorized" };
      return;
    }

    if (!roles.includes(user.role)) {
      ctx.status = 403;
      ctx.body = { error: "Forbidden" };
      return;
    }

    await next();
  };
}

// =====================================================
// HEALTH CHECK
// =====================================================

router.get("/health", (ctx) => {
  ctx.body = { ok: true };
});

// =====================================================
// LOGIN
// =====================================================

router.post("/auth/login", async (ctx) => {
  const body = getBody(ctx);

  const email = body.email;
  const password = body.password;

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    !password
  ) {
    badRequest(ctx, "email and password are required");
    return;
  }

  const { rows } = await query(
    `SELECT id, full_name, email, role, password_hash
     FROM users
     WHERE LOWER(email) = LOWER($1)
       AND is_active = TRUE`,
    [email.trim()]
  );

  const user = rows[0] as
    | {
        id: string;
        full_name: string;
        email: string;
        role: UserRole;
        password_hash: string;
      }
    | undefined;

  if (!user) {
    ctx.status = 401;
    ctx.body = { error: "Invalid credentials" };
    return;
  }

  const validPassword = await bcrypt.compare(
    password,
    user.password_hash
  );

  if (!validPassword) {
    ctx.status = 401;
    ctx.body = { error: "Invalid credentials" };
    return;
  }

  const token = jwt.sign(
    {
      sub: user.id,
      role: user.role,
      name: user.full_name,
    },
    getJwtSecret(),
    { expiresIn: "8h" }
  );

  ctx.body = {
    token,
    tokenType: "Bearer",
    user: {
      id: user.id,
      name: user.full_name,
      email: user.email,
      role: user.role,
    },
  };
});

// =====================================================
// DISPONIBILIDADE DA CLÍNICA
// =====================================================

router.get(
  "/appointments/availability",
  authRequired,
  requireRole("patient", "professional"),
  async (ctx) => {
    const date =
      typeof ctx.query.date === "string"
        ? ctx.query.date
        : "";

    if (!isValidDateOnly(date)) {
      badRequest(ctx, "A valid date is required");
      return;
    }

    const { rows } = await query(
      `SELECT starts_at
       FROM appointments
       WHERE status = 'scheduled'
         AND starts_at >= (
           $1::date::timestamp AT TIME ZONE 'America/Sao_Paulo'
         )
         AND starts_at < (
           ($1::date + 1)::timestamp
           AT TIME ZONE 'America/Sao_Paulo'
         )
       ORDER BY starts_at`,
      [date]
    );

    // Não expõe informações pessoais dos pacientes.
    ctx.body = rows;
  }
);

// =====================================================
// CRIAÇÃO DE AGENDAMENTOS
// =====================================================

async function createAppointment(
  ctx: Context,
  patientId: string,
  examType: string,
  startsAtRaw: string
) {
  if (!isUuid(patientId)) {
    badRequest(ctx, "Invalid patient ID");
    return;
  }

  if (!isExamType(examType)) {
    badRequest(
      ctx,
      "Invalid exam type. Allowed: xray, ultrasound, magnetic_resonance"
    );
    return;
  }

  const startsAt = validateAppointmentDateTime(startsAtRaw);

  if (!startsAt) {
    badRequest(
      ctx,
      "Invalid appointment date or time. Available slots are from 08:00 to 17:00, every 30 minutes, starting tomorrow."
    );
    return;
  }

  // Confirma que o paciente existe e está ativo.
  const patient = await query(
    `SELECT 1
     FROM patients p
     JOIN users u ON u.id = p.user_id
     WHERE p.user_id = $1
       AND u.is_active = TRUE`,
    [patientId]
  );

  if (!patient.rows[0]) {
    notFound(ctx, "Patient not found");
    return;
  }

  try {
    const { rows } = await query(
      `INSERT INTO appointments (
         patient_id,
         starts_at,
         exam_type,
         status
       )
       VALUES ($1, $2, $3, 'scheduled')
       RETURNING *`,
      [
        patientId,
        startsAt.toISOString(),
        examType,
      ]
    );

    ctx.status = 201;
    ctx.body = rows[0];
  } catch (error) {
    // Constraint no_overlap_clinic_room.
    if (getDatabaseErrorCode(error) === "23P01") {
      conflict(
        ctx,
        "This time slot is already reserved. Please select another time."
      );
      return;
    }

    throw error;
  }
}

// Paciente agenda para si próprio.
router.post(
  "/me/appointments",
  authRequired,
  requireRole("patient"),
  async (ctx) => {
    const body = getBody(ctx);

    const examType = body.examType;
    const startsAt = body.startsAt;

    if (
      typeof examType !== "string" ||
      typeof startsAt !== "string"
    ) {
      badRequest(ctx, "examType and startsAt are required");
      return;
    }

    const patientId = ctx.state.user!.sub;

    await createAppointment(
      ctx,
      patientId,
      examType,
      startsAt
    );
  }
);

// Profissional agenda para um paciente.
router.post(
  "/professional/appointments",
  authRequired,
  requireRole("professional"),
  async (ctx) => {
    const body = getBody(ctx);

    const patientId = body.patientId;
    const examType = body.examType;
    const startsAt = body.startsAt;

    if (
      typeof patientId !== "string" ||
      typeof examType !== "string" ||
      typeof startsAt !== "string"
    ) {
      badRequest(
        ctx,
        "patientId, examType and startsAt are required"
      );
      return;
    }

    await createAppointment(
      ctx,
      patientId,
      examType,
      startsAt
    );
  }
);

// =====================================================
// CONSULTA DE AGENDAMENTOS
// =====================================================

// Paciente consulta somente seus próprios agendamentos.
router.get(
  "/me/appointments",
  authRequired,
  requireRole("patient"),
  async (ctx) => {
    const patientId = ctx.state.user!.sub;

    const { rows } = await query(
      `SELECT
         a.id,
         a.patient_id,
         a.starts_at,
         a.ends_at,
         a.exam_type,
         a.status,
         EXISTS (
           SELECT 1
           FROM reports r
           WHERE r.appointment_id = a.id
             AND r.status = 'published'
         ) AS has_published_report
       FROM appointments a
       WHERE a.patient_id = $1
       ORDER BY a.starts_at DESC`,
      [patientId]
    );

    ctx.body = rows;
  }
);

// Profissional consulta os agendamentos da clínica.
// Pode filtrar por data e paciente.
router.get(
  "/professional/appointments",
  authRequired,
  requireRole("professional"),
  async (ctx) => {
    const date =
      typeof ctx.query.date === "string"
        ? ctx.query.date
        : "";

    const patientId =
      typeof ctx.query.patientId === "string"
        ? ctx.query.patientId
        : "";

    if (date && !isValidDateOnly(date)) {
      badRequest(ctx, "Invalid date");
      return;
    }

    if (patientId && !isUuid(patientId)) {
      badRequest(ctx, "Invalid patient ID");
      return;
    }

    const params: unknown[] = [];

    let sql = `
      SELECT
        a.*,
        u.full_name AS patient_name,
        EXISTS (
          SELECT 1
          FROM reports r
          WHERE r.appointment_id = a.id
            AND r.status = 'published'
        ) AS has_published_report
      FROM appointments a
      JOIN users u ON u.id = a.patient_id
      WHERE 1 = 1
    `;

    if (date) {
      params.push(date);
      const index = params.length;

      sql += `
        AND a.starts_at >= (
          $${index}::date::timestamp
          AT TIME ZONE 'America/Sao_Paulo'
        )
        AND a.starts_at < (
          ($${index}::date + 1)::timestamp
          AT TIME ZONE 'America/Sao_Paulo'
        )
      `;
    }

    if (patientId) {
      params.push(patientId);
      sql += ` AND a.patient_id = $${params.length}`;
    }

    sql += ` ORDER BY a.starts_at ASC`;

    const { rows } = await query(sql, params);

    ctx.body = rows;
  }
);

// =====================================================
// CANCELAMENTO
// =====================================================

router.patch(
  "/professional/appointments/:id/cancel",
  authRequired,
  requireRole("professional"),
  async (ctx) => {
    const appointmentId = ctx.params.id;

    if (!isUuid(appointmentId)) {
      badRequest(ctx, "Invalid appointment ID");
      return;
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Bloqueia o agendamento durante a operação.
      const appointmentResult = await client.query(
        `SELECT *
         FROM appointments
         WHERE id = $1
         FOR UPDATE`,
        [appointmentId]
      );

      const appointment = appointmentResult.rows[0];

      if (!appointment) {
        await client.query("ROLLBACK");
        notFound(ctx, "Appointment not found");
        return;
      }

      if (appointment.status !== "scheduled") {
        await client.query("ROLLBACK");
        conflict(
          ctx,
          "Only scheduled appointments can be cancelled"
        );
        return;
      }

      // Agendamento com laudo publicado não pode ser cancelado.
      const publishedReport = await client.query(
        `SELECT 1
         FROM reports
         WHERE appointment_id = $1
           AND status = 'published'
         LIMIT 1`,
        [appointmentId]
      );

      if (publishedReport.rows[0]) {
        await client.query("ROLLBACK");
        conflict(
          ctx,
          "Appointments with published reports cannot be cancelled"
        );
        return;
      }

      const result = await client.query(
        `UPDATE appointments
         SET status = 'cancelled',
             canceled_at = now(),
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [appointmentId]
      );

      await client.query("COMMIT");

      ctx.body = result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
);

// =====================================================
// CRIAÇÃO DE LAUDOS COMO RASCUNHO
// =====================================================

router.post(
  "/professional/reports/drafts",
  authRequired,
  requireRole("professional"),
  async (ctx) => {
    const professionalId = ctx.state.user!.sub;
    const body = getBody(ctx);

    const appointmentId = body.appointmentId;
    const title = body.title;
    const text = body.text;

    if (
      typeof appointmentId !== "string" ||
      typeof title !== "string" ||
      typeof text !== "string" ||
      !appointmentId.trim() ||
      !title.trim() ||
      !text.trim()
    ) {
      badRequest(
        ctx,
        "appointmentId, title and text are required"
      );
      return;
    }

    if (!isUuid(appointmentId)) {
      badRequest(ctx, "Invalid appointment ID");
      return;
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Bloqueia o agendamento para evitar publicação/cancelamento concorrentes.
      const appointmentResult = await client.query(
        `SELECT *
         FROM appointments
         WHERE id = $1
         FOR UPDATE`,
        [appointmentId]
      );

      const appointment = appointmentResult.rows[0];

      if (!appointment) {
        await client.query("ROLLBACK");
        notFound(ctx, "Appointment not found");
        return;
      }

      if (appointment.status === "cancelled") {
        await client.query("ROLLBACK");
        conflict(
          ctx,
          "Cancelled appointments cannot receive reports"
        );
        return;
      }

      const publishedReport = await client.query(
        `SELECT 1
         FROM reports
         WHERE appointment_id = $1
           AND status = 'published'
         LIMIT 1`,
        [appointmentId]
      );

      if (publishedReport.rows[0]) {
        await client.query("ROLLBACK");
        conflict(
          ctx,
          "This appointment already has a published report"
        );
        return;
      }

      const result = await client.query(
        `INSERT INTO reports (
           appointment_id,
           patient_id,
           author_professional_id,
           title,
           content,
           status
         )
         VALUES ($1, $2, $3, $4, $5, 'draft')
         RETURNING *`,
        [
          appointmentId,
          appointment.patient_id,
          professionalId,
          title.trim(),
          text.trim(),
        ]
      );

      await client.query("COMMIT");

      ctx.status = 201;
      ctx.body = result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
);

// =====================================================
// EDIÇÃO DE RASCUNHOS
// =====================================================

router.put(
  "/professional/reports/:id",
  authRequired,
  requireRole("professional"),
  async (ctx) => {
    const professionalId = ctx.state.user!.sub;
    const reportId = ctx.params.id;
    const body = getBody(ctx);

    const title = body.title;
    const text = body.text;

    if (
      typeof title !== "string" ||
      typeof text !== "string" ||
      !title.trim() ||
      !text.trim()
    ) {
      badRequest(ctx, "title and text are required");
      return;
    }

    if (!isUuid(reportId)) {
      badRequest(ctx, "Invalid report ID");
      return;
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const reportResult = await client.query(
        `SELECT *
         FROM reports
         WHERE id = $1
           AND author_professional_id = $2
         FOR UPDATE`,
        [reportId, professionalId]
      );

      const report = reportResult.rows[0];

      if (!report) {
        await client.query("ROLLBACK");
        notFound(ctx, "Report not found");
        return;
      }

      if (report.status !== "draft") {
        await client.query("ROLLBACK");
        conflict(ctx, "Published reports cannot be edited");
        return;
      }

      const result = await client.query(
        `UPDATE reports
         SET title = $2,
             content = $3,
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [reportId, title.trim(), text.trim()]
      );

      await client.query("COMMIT");

      ctx.body = result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
);

// =====================================================
// PUBLICAÇÃO DE LAUDOS
// =====================================================

router.patch(
  "/professional/reports/:id/publish",
  authRequired,
  requireRole("professional"),
  async (ctx) => {
    const professionalId = ctx.state.user!.sub;
    const reportId = ctx.params.id;

    if (!isUuid(reportId)) {
      badRequest(ctx, "Invalid report ID");
      return;
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const reportResult = await client.query(
        `SELECT *
         FROM reports
         WHERE id = $1
           AND author_professional_id = $2
         FOR UPDATE`,
        [reportId, professionalId]
      );

      const report = reportResult.rows[0];

      if (!report) {
        await client.query("ROLLBACK");
        notFound(ctx, "Report not found");
        return;
      }

      if (report.status !== "draft") {
        await client.query("ROLLBACK");
        conflict(ctx, "Only draft reports can be published");
        return;
      }

      if (!report.appointment_id) {
        await client.query("ROLLBACK");
        conflict(ctx, "Report has no associated appointment");
        return;
      }

      // Bloqueia o agendamento para evitar publicação após cancelamento.
      const appointmentResult = await client.query(
        `SELECT *
         FROM appointments
         WHERE id = $1
         FOR UPDATE`,
        [report.appointment_id]
      );

      const appointment = appointmentResult.rows[0];

      if (!appointment || appointment.status === "cancelled") {
        await client.query("ROLLBACK");
        conflict(
          ctx,
          "Cancelled or nonexistent appointments cannot receive published reports"
        );
        return;
      }

      const otherPublishedReport = await client.query(
        `SELECT 1
         FROM reports
         WHERE appointment_id = $1
           AND id <> $2
           AND status = 'published'
         LIMIT 1`,
        [report.appointment_id, reportId]
      );

      if (otherPublishedReport.rows[0]) {
        await client.query("ROLLBACK");
        conflict(
          ctx,
          "This appointment already has another published report"
        );
        return;
      }

      const result = await client.query(
        `UPDATE reports
         SET status = 'published',
             published_at = now(),
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [reportId]
      );

      await client.query("COMMIT");

      ctx.body = result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
);

// =====================================================
// CONSULTA DE LAUDOS PELO PACIENTE
// =====================================================

// Lista somente laudos publicados do próprio paciente.
router.get(
  "/me/reports",
  authRequired,
  requireRole("patient"),
  async (ctx) => {
    const patientId = ctx.state.user!.sub;

    const { rows } = await query(
      `SELECT
         r.id,
         r.title,
         r.content,
         r.status,
         r.published_at,
         u.full_name AS professional_name,
         a.exam_type,
         a.starts_at
       FROM reports r
       JOIN appointments a ON a.id = r.appointment_id
       JOIN users u ON u.id = r.author_professional_id
       WHERE r.patient_id = $1
         AND r.status = 'published'
       ORDER BY r.published_at DESC`,
      [patientId]
    );

    ctx.body = rows;
  }
);

// Consulta um laudo específico, sempre verificando o proprietário.
router.get(
  "/me/reports/:id",
  authRequired,
  requireRole("patient"),
  async (ctx) => {
    const patientId = ctx.state.user!.sub;
    const reportId = ctx.params.id;

    if (!isUuid(reportId)) {
      badRequest(ctx, "Invalid report ID");
      return;
    }

    const { rows } = await query(
      `SELECT
         r.id,
         r.title,
         r.content,
         r.status,
         r.published_at,
         u.full_name AS professional_name,
         a.exam_type,
         a.starts_at
       FROM reports r
       JOIN appointments a ON a.id = r.appointment_id
       JOIN users u ON u.id = r.author_professional_id
       WHERE r.id = $1
         AND r.patient_id = $2
         AND r.status = 'published'`,
      [reportId, patientId]
    );

    const report = rows[0];

    if (!report) {
      notFound(ctx, "Report not found");
      return;
    }

    ctx.body = report;
  }
);

// =====================================================
// FINALIZAÇÃO
// =====================================================

app.use(router.routes());
app.use(router.allowedMethods());

export default app;