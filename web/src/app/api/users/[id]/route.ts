import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTrustedUser } from "@/lib/auth";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getTrustedUser(request);
  if (!user || user.role !== "PROVINCE_ADMIN") {
    return NextResponse.json({ error: "เฉพาะ อบจ. เท่านั้นที่ลบบัญชีผู้ใช้ได้" }, { status: 403 });
  }

  const { id } = await params;
  if (id === user.userId) {
    return NextResponse.json({ error: "ไม่สามารถลบบัญชีของตัวเองได้" }, { status: 400 });
  }

  const targetRes = await pool.query(
    `SELECT u.username, r.name AS role_name
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1 AND u.is_active = true`,
    [id]
  );
  const target = targetRes.rows[0];
  if (!target) {
    return NextResponse.json({ error: "ไม่พบบัญชีนี้" }, { status: 404 });
  }

  if (target.role_name === "PROVINCE_ADMIN") {
    const adminCountRes = await pool.query(
      `SELECT count(*)::int AS n FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.name = 'PROVINCE_ADMIN' AND u.is_active = true`
    );
    if (adminCountRes.rows[0].n <= 1) {
      return NextResponse.json(
        { error: "ต้องมีบัญชีผู้ดูแล อบจ. อย่างน้อย 1 บัญชีเสมอ" },
        { status: 400 }
      );
    }
  }

  try {
    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true, username: target.username, softDeleted: false });
  } catch (err) {
    // FK violation (23503) แปลว่าบัญชีนี้มีประวัติทำรายการในระบบ (สร้างคำขอเบิก/รับยา/จ่ายยา ฯลฯ)
    // ลบถาวรไม่ได้เพราะจะทำให้ประวัติ transaction เดิมอ้างอิงถึงผู้ใช้ที่ไม่มีอยู่จริง — ปิดใช้งานแทน
    if (String(err).includes("violates foreign key constraint")) {
      await pool.query(`UPDATE users SET is_active = false WHERE id = $1`, [id]);
      return NextResponse.json({ ok: true, username: target.username, softDeleted: true });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
