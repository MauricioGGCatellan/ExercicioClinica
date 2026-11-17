import Koa from "koa";
import Router from "@koa/router";
import bodyParser from "koa-bodyparser";

import authRouter from "./routes/auth.js";
import appointmentsRouter from "./routes/appointments.js";
import reportsRouter from "./routes/reports.js";
 
const app = new Koa();

app.use(bodyParser());

app.use(authRouter.routes());
app.use(authRouter.allowedMethods());

app.use(appointmentsRouter.routes());
app.use(appointmentsRouter.allowedMethods());

app.use(reportsRouter.routes());
app.use(reportsRouter.allowedMethods());
 
const router = new Router();
// =====================================================
// HEALTH CHECK
// =====================================================

router.get("/health", (ctx) => {
  ctx.body = { ok: true };
});
 
// =====================================================
// FINALIZAÇÃO
// =====================================================

app.use(router.routes());
app.use(router.allowedMethods());
 
 
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
 

export default app; 
