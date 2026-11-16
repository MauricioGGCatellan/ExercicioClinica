import type { Context, Next } from 'koa';
import jwt from 'jsonwebtoken';

export type JwtPayload = {
  sub: string;
  role: 'patient' | 'professional';
  name: string;
};

declare module 'koa' {
  interface DefaultState {
    user?: JwtPayload;
  }
}

export async function authRequired(ctx: Context, next: Next) {
  const header = ctx.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    ctx.status = 401;
    ctx.body = { error: 'Missing bearer token' };
    return;
  }

  const token = header.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    ctx.state.user = payload;
    await next();
  } catch {
    ctx.status = 401;
    ctx.body = { error: 'Invalid token' };
  }
}

export function requireRole(...roles: Array<'patient' | 'professional'>) {
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