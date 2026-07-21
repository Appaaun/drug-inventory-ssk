import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { signSession, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth";

export async function POST(request: Request) {
  const { username, password } = (await request.json()) as {
    username?: string;
    password?: string;
  };

  if (!username || !password) {
    return NextResponse.json({ error: "กรุณากรอก username และ password" }, { status: 400 });
  }

  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.password_hash, r.name AS role,
            o.id AS org_id, o.name AS org_name, o.type AS org_type, o.parent_org_id
     FROM users u
     JOIN roles r ON r.id = u.role_id
     JOIN organizations o ON o.id = u.org_id
     WHERE u.username = $1 AND u.is_active = true`,
    [username]
  );

  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return NextResponse.json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }

  const token = await signSession({
    sub: user.id,
    username: user.username,
    role: user.role,
    orgId: user.org_id,
    orgType: user.org_type,
    orgName: user.org_name,
    parentOrgId: user.parent_org_id,
  });

  const res = NextResponse.json({
    role: user.role,
    orgType: user.org_type,
    orgId: user.org_id,
    orgName: user.org_name,
  });
  res.cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
  return res;
}
