// สร้างข้อมูลเริ่มต้นขั้นต่ำสำหรับใช้งานจริง — รันครั้งเดียวตอน deploy ครั้งแรกเท่านั้น
// (ต่างจาก seed.mjs ซึ่งสร้างข้อมูลตัวอย่าง/เดโมจำนวนมากสำหรับพัฒนา ไม่ใช้กับฐานข้อมูลจริง)
//
// วิธีใช้:
//   node scripts/bootstrap.mjs "ชื่อหน่วยงาน อบจ." <username ผู้ดูแลคนแรก> <รหัสผ่าน>
//
// ตัวอย่าง:
//   node scripts/bootstrap.mjs "องค์การบริหารส่วนจังหวัดศรีสะเกษ" admin "รหัสผ่านที่ปลอดภัย"

import pg from "pg";
import bcrypt from "bcryptjs";

const [provinceName, adminUsername, adminPassword] = process.argv.slice(2);

if (!provinceName || !adminUsername || !adminPassword) {
  console.error(
    'วิธีใช้: node scripts/bootstrap.mjs "ชื่อหน่วยงาน อบจ." <username> <password>'
  );
  process.exit(1);
}
if (adminPassword.length < 8) {
  console.error("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(`SELECT count(*)::int AS n FROM organizations`);
    if (existing.rows[0].n > 0) {
      console.error("ฐานข้อมูลนี้มีข้อมูลอยู่แล้ว — bootstrap ใช้ได้เฉพาะฐานข้อมูลเปล่าเท่านั้น");
      await client.query("ROLLBACK");
      process.exit(1);
    }

    for (const role of ["PROVINCE_ADMIN", "CUP_MANAGER", "PCU_REQUESTER", "PCU_DISPENSER"]) {
      await client.query(
        `INSERT INTO roles (name, permissions) VALUES ($1, '[]') ON CONFLICT (name) DO NOTHING`,
        [role]
      );
    }

    const orgRes = await client.query(
      `INSERT INTO organizations (name, type, parent_org_id) VALUES ($1,'PROVINCE',NULL) RETURNING id`,
      [provinceName]
    );
    const provinceId = orgRes.rows[0].id;

    await client.query(`INSERT INTO warehouses (id, org_id, name, type) VALUES ($1,$1,$2,'PROVINCIAL')`, [
      provinceId,
      `คลังยา ${provinceName}`,
    ]);

    const roleRes = await client.query(`SELECT id FROM roles WHERE name = 'PROVINCE_ADMIN'`);
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await client.query(
      `INSERT INTO users (org_id, role_id, username, password_hash) VALUES ($1,$2,$3,$4)`,
      [provinceId, roleRes.rows[0].id, adminUsername, passwordHash]
    );

    await client.query("COMMIT");
    console.log(`สร้างสำเร็จ: หน่วยงาน "${provinceName}" + บัญชีผู้ดูแล "${adminUsername}"`);
    console.log("เข้าสู่ระบบด้วยบัญชีนี้ แล้วเพิ่ม CUP/รพ.สต. และบัญชีอื่นๆ ต่อได้ผ่านหน้า admin");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
