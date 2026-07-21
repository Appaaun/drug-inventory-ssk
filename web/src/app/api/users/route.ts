import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTrustedUser } from "@/lib/auth";
import { hashPassword } from "@/lib/password";

const VALID_ROLES = ["PROVINCE_ADMIN", "CUP_MANAGER", "PCU_REQUESTER"] as const;
const EXPECTED_ORG_TYPE: Record<(typeof VALID_ROLES)[number], string> = {
  PROVINCE_ADMIN: "PROVINCE",
  CUP_MANAGER: "CUP",
  PCU_REQUESTER: "PCU",
};

export async function GET(request: Request) {
  const user = getTrustedUser(request);
  if (!user || user.role !== "PROVINCE_ADMIN") {
    return NextResponse.json({ error: "เฉพาะ อบจ. เท่านั้นที่ดูรายชื่อบัญชีผู้ใช้ได้" }, { status: 403 });
  }

  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.is_active, u.created_at, r.name AS role_name, o.name AS org_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     JOIN organizations o ON o.id = u.org_id
     ORDER BY u.created_at DESC`
  );
  return NextResponse.json(rows);
}

// สร้างบัญชีผู้ใช้ใหม่ (ผู้ดูแล อบจ. / ผู้จัดการ CUP / เจ้าหน้าที่ รพ.สต.) — เฉพาะ อบจ. เท่านั้น
export async function POST(request: Request) {
  const user = getTrustedUser(request);
  if (!user || user.role !== "PROVINCE_ADMIN") {
    return NextResponse.json({ error: "เฉพาะ อบจ. เท่านั้นที่สร้างบัญชีผู้ใช้ได้" }, { status: 403 });
  }

  const body = await request.json();
  const {
    username,
    password,
    roleName,
    orgId,
  }: { username?: string; password?: string; roleName?: string; orgId?: string } = body;

  if (!username?.trim()) {
    return NextResponse.json({ error: "กรุณาระบุชื่อผู้ใช้" }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" }, { status: 400 });
  }
  if (!roleName || !VALID_ROLES.includes(roleName as (typeof VALID_ROLES)[number])) {
    return NextResponse.json({ error: "บทบาทไม่ถูกต้อง" }, { status: 400 });
  }
  if (!orgId) {
    return NextResponse.json({ error: "กรุณาเลือกหน่วยงาน" }, { status: 400 });
  }

  const orgRes = await pool.query(`SELECT type FROM organizations WHERE id = $1`, [orgId]);
  const orgType = orgRes.rows[0]?.type;
  if (!orgType) {
    return NextResponse.json({ error: "ไม่พบหน่วยงานที่เลือก" }, { status: 400 });
  }
  if (orgType !== EXPECTED_ORG_TYPE[roleName as (typeof VALID_ROLES)[number]]) {
    return NextResponse.json(
      { error: "บทบาทที่เลือกไม่ตรงกับประเภทของหน่วยงาน" },
      { status: 400 }
    );
  }

  const roleRes = await pool.query(`SELECT id FROM roles WHERE name = $1`, [roleName]);
  const roleId = roleRes.rows[0]?.id;
  if (!roleId) {
    return NextResponse.json({ error: "ไม่พบบทบาทนี้ในระบบ" }, { status: 500 });
  }

  try {
    const passwordHash = await hashPassword(password);
    const { rows } = await pool.query(
      `INSERT INTO users (org_id, role_id, username, password_hash)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [orgId, roleId, username.trim(), passwordHash]
    );
    return NextResponse.json({ id: rows[0].id }, { status: 201 });
  } catch (err) {
    if (String(err).includes("users_username_key")) {
      return NextResponse.json({ error: "ชื่อผู้ใช้นี้มีอยู่แล้ว" }, { status: 409 });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
