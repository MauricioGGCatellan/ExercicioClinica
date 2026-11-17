import Router from "@koa/router";
import { authRequired, requireRole } from "../middleware/auth.js";
import { query, pool } from "../db.js";
import {
  getBody,
  isUuid, 
  badRequest,
  getDatabaseErrorCode,
  notFound,
  conflict,
} from "../helpers.js";

const router = new Router();

router.get(
  "/professional/reports",
  authRequired,
  requireRole("professional"),
  async (ctx) => {
    const professionalId = ctx.state.user!.sub;

    const { rows } = await query(
      `SELECT
         r.id,
         r.appointment_id,
         r.patient_id,
         r.title,
         r.content,
         r.status,
         r.published_at,
         r.created_at,
         r.updated_at,
         u.full_name AS professional_name,
         p.full_name AS patient_name,
         a.exam_type,
         a.starts_at,
         a.status AS appointment_status,
         EXISTS (
           SELECT 1
           FROM reports rr
           WHERE rr.appointment_id = r.appointment_id
             AND rr.status = 'published'
         ) AS has_published_report
       FROM reports r
       JOIN appointments a ON a.id = r.appointment_id
       JOIN users u ON u.id = r.author_professional_id
       JOIN users p ON p.id = r.patient_id
       WHERE r.author_professional_id = $1
       ORDER BY COALESCE(r.published_at, r.updated_at, r.created_at) DESC`,
      [professionalId]
    );

    ctx.body = rows;
  }
);

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
      badRequest(ctx, "appointmentId, title and text are required");
      return;
    }

    if (!isUuid(appointmentId)) {
      badRequest(ctx, "Invalid appointment ID");
      return;
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Bloqueia o agendamento durante a criação do laudo.
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
        conflict(ctx, "Cancelled appointments cannot receive reports");
        return;
      }

      // Verifica qualquer laudo, inclusive rascunhos.
      const existingReport = await client.query(
        `SELECT id, status
         FROM reports
         WHERE appointment_id = $1
         LIMIT 1`,
        [appointmentId]
      );

      if (existingReport.rows[0]) {
        await client.query("ROLLBACK");
        conflict(ctx, "This appointment already has a report");
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

      // Violação do índice único do PostgreSQL.
      if (getDatabaseErrorCode(error) === "23505") {
        conflict(ctx, "This appointment already has a report");
        return;
      }

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

    const result = await query(
      `UPDATE reports
       SET
         title = $3,
         content = $4,
         updated_at = now()
       WHERE id = $1
         AND author_professional_id = $2
         AND status = 'draft'
       RETURNING *`,
      [
        reportId,
        professionalId,
        title.trim(),
        text.trim(),
      ]
    );

    if (result.rowCount === 0) {
      conflict(
        ctx,
        "Report not found, does not belong to you, or is already published"
      );
      return;
    }

    ctx.body = result.rows[0];
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
        conflict(ctx, "Published reports cannot be published again");
        return;
      }

      // Bloqueia o agendamento para evitar publicação
      // de um laudo associado a um agendamento cancelado.
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
        conflict(ctx, "Cancelled appointments cannot receive published reports");
        return;
      }

      const result = await client.query(
        `UPDATE reports
         SET
           status = 'published',
           published_at = now(),
           updated_at = now()
         WHERE id = $1
           AND author_professional_id = $2
           AND status = 'draft'
         RETURNING *`,
        [reportId, professionalId]
      );

      if (result.rowCount === 0) {
        await client.query("ROLLBACK");
        conflict(ctx, "Report cannot be published");
        return;
      }

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

export default router;