import Router from "@koa/router";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "../db.js"; 

const router = new Router({ prefix: "/auth" });

router.post("/login", async (ctx) => {
  const { email, password } = ctx.request.body as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    ctx.status = 400;
    ctx.body = { error: "email and password are required" };
    return;
  }

  const { rows } = await query(
    `SELECT id, full_name, email, role, password_hash
     FROM users
     WHERE LOWER(email) = LOWER($1)
       AND is_active = TRUE`,
    [email]
  );

  const user = rows[0] as
    | {
        id: string;
        full_name: string;
        email: string;
        role: "patient" | "professional";
        password_hash: string;
      }
    | undefined;

  if (!user) {
    ctx.status = 401;
    ctx.body = { error: "Invalid credentials" };
    return;
  }

  const ok = await bcrypt.compare(password, user.password_hash);

  if (!ok) {
    ctx.status = 401;
    ctx.body = { error: "Invalid credentials" };
    return;
  }

  const token = jwt.sign(
    { sub: user.id, role: user.role, name: user.full_name },
    process.env.JWT_SECRET!,
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

export default router;