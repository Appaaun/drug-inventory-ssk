// สร้าง API key ให้ระบบภายนอก (HOSxP/INVS) ส่งข้อมูลเข้ามาในนามหน่วยงานหนึ่ง
//
// วิธีใช้:
//   DATABASE_URL=... node scripts/create-api-key.mjs <orgId> "<ชื่อคีย์ เช่น HOSxP รพ.สต.บ้านหนองบัว>"
//
// คีย์จริงจะแสดงครั้งเดียวตอนนี้เท่านั้น (ในฐานข้อมูลเก็บแค่ hash) เก็บไว้ในที่ปลอดภัย

import pg from "pg";
import { randomBytes, createHash } from "node:crypto";

const [orgId, name] = process.argv.slice(2);
if (!orgId || !name) {
  console.error('วิธีใช้: node scripts/create-api-key.mjs <orgId> "<ชื่อคีย์>"');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const org = await pool.query(`SELECT name, type FROM organizations WHERE id = $1`, [orgId]);
  if (org.rows.length === 0) {
    console.error("ไม่พบหน่วยงานนี้");
    process.exit(1);
  }
  if (org.rows[0].type !== "PCU") {
    console.error("ตอนนี้รองรับเฉพาะคีย์ของ รพ.สต. (type PCU) เพราะข้อมูลที่รับเข้ามาคือการจ่ายยา/สต็อกของหน่วยบริการ");
    process.exit(1);
  }
  const key = "ssk_" + randomBytes(24).toString("base64url");
  await pool.query(
    `INSERT INTO integration_keys (org_id, name, key_hash) VALUES ($1,$2,$3)`,
    [orgId, name, createHash("sha256").update(key).digest("hex")]
  );
  console.log(`สร้างคีย์สำเร็จสำหรับ ${org.rows[0].name}`);
  console.log(`API key (แสดงครั้งเดียว): ${key}`);
} finally {
  await pool.end();
}
