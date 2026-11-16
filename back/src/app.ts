import Koa, { type Context, type Next } from 'koa';
import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from './db.js';

type UserRole = 'patient' | 'professional';
type AppointmentStatus = 'scheduled' | 'cancelled' | 'completed' | 'no_show';
type ReportStatus = 'draft' | 'published';

type JwtPayload = {
  sub: string;
  role: UserRole;
  name: string;
};

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

type CreateAppointmentBody = {
  patientId?: unknown;
  examType?: unknown;
  startsAt?: unknown;
};

type ReportDraftBody = {
  appointmentId?: unknown;
  title?: unknown;
  text?: unknown;
};

type ReportEditBody = {
  title?: unknown;
  text?: unknown;
};

declare module 'koa' {
  interface DefaultState {
    user?: JwtPayload;
  }

  interface Request {
    body?: unknown;
  }
}

const app = new Koa();
const router = new Router();

app.use(bodyParser());

function badRequest(message: string): never {
  const err = new Error(message);
  (err as any).status = 400;
  throw err;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}

function isUserRole(value: unknown): value is UserRole {
  return value === 'patient' || value === 'professional';
}

async function authRequired(ctx: Context, next: Next) {
  const header = ctx.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    ctx.status = 401;
    ctx.body = { error: 'Missing bearer token' };
    return;
  }

  const token = header.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as Partial<JwtPayload>;

    if (
      typeof payload.sub !== 'string' ||
      typeof payload.name !== 'string' ||
      !isUserRole(payload.role)
    ) {
      ctx.status = 401;
      ctx.body = { error: 'Invalid token' };
      return;
    }

    ctx.state.user = {
      sub: payload.sub,
      role: payload.role,
      name: payload.name,
    };

    await next();
  } catch {
    ctx.status = 401;
    ctx.body = { error: 'Invalid token' };
  }
}

function requireRole(...roles: UserRole[]) {
  return async (ctx: Context, next: Next) => {
    const user = ctx.state.user;

    if (!user) {
      ctx.status = 401;
      ctx.body = { error: 'Unauthorized' };
      return;
    }

    if (!roles.includes(user.role)) {
      ctx.status = 403;
      ctx.body = { error: 'Forbidden' };
      return;
    }

    await next();
  };
}

async function loadAppointmentForProfessional(appointmentId: string, professionalId: string) {
  const { rows } = await query(
    `SELECT *
     FROM appointments
     WHERE id = $1 AND professional_id = $2`,
    [appointmentId, professionalId]
  );

  return rows[0] as any | undefined;
}

async function loadReportForProfessional(reportId: string, professionalId: string) {
  const { rows } = await query(
    `SELECT *
     FROM reports
     WHERE id = $1 AND author_professional_id = $2`,
    [reportId, professionalId]
  );

  return rows[0] as any | undefined;
}

router.get('/health', ctx => {
  ctx.body = { ok: true };
});

router.post('/auth/login', async ctx => {
  const body = (ctx.request.body ?? {}) as LoginBody;

  const email = requireString(body.email, 'email');
  const password = requireString(body.password, 'password');

  const { rows } = await query(
    `SELECT id, full_name, role, password_hash
     FROM users
     WHERE email = $1 AND is_active = true`,
    [email]
  );

  const user = rows[0] as
    | { id: string; full_name: string; role: UserRole; password_hash: string }
    | undefined;

  if (!user) {
    ctx.status = 401;
    ctx.body = { error: 'Invalid credentials' };
    return;
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    ctx.status = 401;
    ctx.body = { error: 'Invalid credentials' };
    return;
  }

  const token = jwt.sign(
    { sub: user.id, role: user.role, name: user.full_name },
    process.env.JWT_SECRET!,
    { expiresIn: '8h' }
  );

  ctx.body = {
    token,
    tokenType: 'Bearer',
    user: {
      id: user.id,
      name: user.full_name,
      role: user.role,
    },
  };
});

/* =========================
   PROFESSIONAL: agendamentos
   ========================= */

router.post(
  '/professional/appointments',
  authRequired,
  requireRole('professional'),
  async ctx => {
    const userId = ctx.state.user!.sub;
    const body = (ctx.request.body ?? {}) as CreateAppointmentBody;

    const patientId = requireString(body.patientId, 'patientId');
    const examType = requireString(body.examType, 'examType');
    const startsAtRaw = requireString(body.startsAt, 'startsAt');

    const allowedExamTypes = ['xray', 'ultrasound', 'magnetic_resonance'] as const;
    if (!allowedExamTypes.includes(examType as any)) {
      ctx.status = 400;
      ctx.body = {
        error: 'Invalid examType. Allowed values: xray, ultrasound, magnetic_resonance',
      };
      return;
    }

    const startsAt = new Date(startsAtRaw);
    if (Number.isNaN(startsAt.getTime())) {
      ctx.status = 400;
      ctx.body = { error: 'startsAt must be a valid datetime' };
      return;
    }

    const patientExists = await query(
      `SELECT 1
       FROM patients
       WHERE user_id = $1`,
      [patientId]
    );

    if (!patientExists.rows[0]) {
      ctx.status = 404;
      ctx.body = { error: 'Patient not found' };
      return;
    }

    const { rows } = await query(
      `INSERT INTO appointments (patient_id, professional_id, starts_at, exam_type, status)
       VALUES ($1, $2, $3, $4, 'scheduled')
       RETURNING *`,
      [patientId, userId, startsAt.toISOString(), examType]
    );

    ctx.status = 201;
    ctx.body = rows[0];
  }
);

router.get(
  '/professional/appointments',
  authRequired,
  requireRole('professional'),
  async ctx => {
    const userId = ctx.state.user!.sub;
    const date = typeof ctx.query.date === 'string' ? ctx.query.date : '';
    const patientId = typeof ctx.query.patientId === 'string' ? ctx.query.patientId : '';

    const params: any[] = [userId];
    let sql = `
      SELECT a.*
      FROM appointments a
      WHERE a.professional_id = $1
    `;

    if (date) {
      params.push(date);
      sql += ` AND a.starts_at >= ($2::date) AND a.starts_at < ($2::date + INTERVAL '1 day')`;
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

router.patch(
  '/professional/appointments/:id/cancel',
  authRequired,
  requireRole('professional'),
  async ctx => {
    const userId = ctx.state.user!.sub;
    const appointmentId = ctx.params.id;

    const appt = await loadAppointmentForProfessional(appointmentId, userId);
    if (!appt) {
      ctx.status = 404;
      ctx.body = { error: 'Appointment not found' };
      return;
    }

    if (appt.status !== 'scheduled') {
      ctx.status = 409;
      ctx.body = { error: 'Only scheduled appointments can be cancelled' };
      return;
    }

    const publishedReport = await query(
      `SELECT 1
       FROM reports
       WHERE appointment_id = $1 AND status = 'published'
       LIMIT 1`,
      [appointmentId]
    );

    if (publishedReport.rows[0]) {
      ctx.status = 409;
      ctx.body = { error: 'Appointments with published reports cannot be cancelled' };
      return;
    }

    const { rows } = await query(
      `UPDATE appointments
       SET status = 'cancelled',
           canceled_at = now(),
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [appointmentId]
    );

    ctx.body = rows[0];
  }
);

/* ======================
   PROFESSIONAL: laudos
   ====================== */

router.post(
  '/professional/reports/drafts',
  authRequired,
  requireRole('professional'),
  async ctx => {
    const professionalId = ctx.state.user!.sub;
    const professionalName = ctx.state.user!.name;
    const body = (ctx.request.body ?? {}) as ReportDraftBody;

    const appointmentId = requireString(body.appointmentId, 'appointmentId');
    const title = requireString(body.title, 'title');
    const text = requireString(body.text, 'text');

    const appt = await loadAppointmentForProfessional(appointmentId, professionalId);
    if (!appt) {
      ctx.status = 404;
      ctx.body = { error: 'Appointment not found' };
      return;
    }

    if (appt.status === 'cancelled') {
      ctx.status = 409;
      ctx.body = { error: 'Cancelled appointments cannot receive reports' };
      return;
    }

    const alreadyPublished = await query(
      `SELECT 1
       FROM reports
       WHERE appointment_id = $1 AND status = 'published'
       LIMIT 1`,
      [appointmentId]
    );

    if (alreadyPublished.rows[0]) {
      ctx.status = 409;
      ctx.body = { error: 'Appointment already has a published report' };
      return;
    }

    const { rows } = await query(
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
      [appointmentId, appt.patient_id, professionalId, title, text]
    );

    ctx.status = 201;
    ctx.body = {
      ...rows[0],
      author_name: professionalName,
    };
  }
);

router.put(
  '/professional/reports/:id',
  authRequired,
  requireRole('professional'),
  async ctx => {
    const professionalId = ctx.state.user!.sub;
    const reportId = ctx.params.id;
    const body = (ctx.request.body ?? {}) as ReportEditBody;

    const title = requireString(body.title, 'title');
    const text = requireString(body.text, 'text');

    const report = await loadReportForProfessional(reportId, professionalId);
    if (!report) {
      ctx.status = 404;
      ctx.body = { error: 'Report not found' };
      return;
    }

    if (report.status !== 'draft') {
      ctx.status = 409;
      ctx.body = { error: 'Published reports cannot be edited' };
      return;
    }

    const { rows } = await query(
      `UPDATE reports
       SET title = $2,
           content = $3,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [reportId, title, text]
    );

    ctx.body = rows[0];
  }
);

router.patch(
  '/professional/reports/:id/publish',
  authRequired,
  requireRole('professional'),
  async ctx => {
    const professionalId = ctx.state.user!.sub;
    const reportId = ctx.params.id;

    const report = await loadReportForProfessional(reportId, professionalId);
    if (!report) {
      ctx.status = 404;
      ctx.body = { error: 'Report not found' };
      return;
    }

    if (report.status !== 'draft') {
      ctx.status = 409;
      ctx.body = { error: 'Only draft reports can be published' };
      return;
    }

    const { rows } = await query(
      `UPDATE reports
       SET status = 'published',
           published_at = now(),
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [reportId]
    );

    ctx.body = rows[0];
  }
);

/* ======================
   PACIENTE: consultas
   ====================== */

router.get(
  '/me/appointments',
  authRequired,
  requireRole('patient'),
  async ctx => {
    const patientId = ctx.state.user!.sub;

    const { rows } = await query(
      `SELECT
         a.id,
         a.exam_type,
         a.starts_at,
         a.status,
         EXISTS (
           SELECT 1
           FROM reports r
           WHERE r.appointment_id = a.id AND r.status = 'published'
         ) AS has_published_report
       FROM appointments a
       WHERE a.patient_id = $1
       ORDER BY a.starts_at DESC`,
      [patientId]
    );

    ctx.body = rows;
  }
);

router.get(
  '/me/reports',
  authRequired,
  requireRole('patient'),
  async ctx => {
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
         a.starts_at,
         a.status AS appointment_status
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

router.get(
  '/me/reports/:id',
  authRequired,
  requireRole('patient'),
  async ctx => {
    const patientId = ctx.state.user!.sub;
    const reportId = ctx.params.id;

    const { rows } = await query(
      `SELECT
         r.id,
         r.title,
         r.content,
         r.status,
         r.published_at,
         u.full_name AS professional_name,
         a.exam_type,
         a.starts_at,
         a.status AS appointment_status
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
      ctx.status = 404;
      ctx.body = { error: 'Report not found' };
      return;
    }

    ctx.body = report;
  }
);

app.use(router.routes());
app.use(router.allowedMethods());

export default app;