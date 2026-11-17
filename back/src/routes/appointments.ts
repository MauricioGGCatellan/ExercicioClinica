import { type Context} from 'koa'; 
import Router from "@koa/router";
import { query, pool } from "../db.js";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  getBody,
  isUuid,
  isValidDateOnly,
  getDatabaseErrorCode,
  badRequest,
  notFound,
  conflict,
} from "../helpers.js"; 

type ExamType =
  | "xray"
  | "ultrasound"
  | "magnetic_resonance";

const router = new Router();

const EXAM_TYPES: ExamType[] = [
  "xray",
  "ultrasound",
  "magnetic_resonance",
];

const CLINIC_TIMEZONE = "America/Sao_Paulo";

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

function isExamType(value: string): value is ExamType {
  return EXAM_TYPES.includes(value as ExamType);
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

            -- Verifica se existe qualquer laudo
            EXISTS (
            SELECT 1
            FROM reports r
            WHERE r.appointment_id = a.id
            ) AS has_report,

            -- Verifica especificamente se existe laudo publicado
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

export default router;