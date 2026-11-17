import type { Context, Next } from "koa";
import jwt from "jsonwebtoken";
 
type UserRole = "patient" | "professional";

type AuthenticatedUser = {
  sub: string;
  role: UserRole;
  name: string;
};

declare module "koa" {
  interface DefaultState {
    user?: AuthenticatedUser;
  }
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return secret;
}

export async function authRequired(ctx: Context, next: Next) {
  const header = ctx.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    ctx.status = 401;
    ctx.body = { error: "Missing bearer token" };
    return;
  }

  try {
    const token = header.slice("Bearer ".length);
    const decoded = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;

    if (
      typeof decoded.sub !== "string" ||
      typeof decoded.name !== "string" ||
      (decoded.role !== "patient" && decoded.role !== "professional")
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
  } catch {
    ctx.status = 401;
    ctx.body = { error: "Invalid or expired token" };
  }
}

export function requireRole(...roles: UserRole[]) {
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