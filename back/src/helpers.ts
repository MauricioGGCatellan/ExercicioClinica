import type { Context } from "koa";

export function getBody(ctx: Context): Record<string, unknown> {
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

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

export function isValidDateOnly(value: string): boolean {
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

export function getDatabaseErrorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error
  ) {
    return String((error as { code: unknown }).code);
  }

  return undefined;
}

export function badRequest(ctx: Context, message: string) {
  ctx.status = 400;
  ctx.body = { error: message };
}

export function notFound(ctx: Context, message: string) {
  ctx.status = 404;
  ctx.body = { error: message };
}

export function conflict(ctx: Context, message: string) {
  ctx.status = 409;
  ctx.body = { error: message };
}