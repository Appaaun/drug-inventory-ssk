import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTrustedUser } from "@/lib/auth";

export async function GET(request: Request) {
  const type = new URL(request.url).searchParams.get("type");
  const { rows } = await pool.query(
    `SELECT o.id, o.name, o.type, o.parent_org_id, p.name AS parent_name
     FROM organizations o
     LEFT JOIN organizations p ON p.id = o.parent_org_id
     WHERE ($1::text IS NULL OR o.type::text = $1)
     ORDER BY o.name`,
    [type]
  );
  return NextResponse.json(rows);
}

// สร้างหน่วยงานใหม่ (รพ.สต. ใต้ CUP หรือ CUP ใต้ อบจ.) — เฉพาะ อบจ. เท่านั้น
export async function POST(request: Request) {
  const user = getTrustedUser(request);
  if (!user || user.role !== "PROVINCE_ADMIN") {
    return NextResponse.json({ error: "เฉพาะ อบจ. เท่านั้นที่เพิ่มหน่วยงานได้" }, { status: 403 });
  }

  const body = await request.json();
  const { name, type, parentOrgId }: { name?: string; type?: "PCU" | "CUP"; parentOrgId?: string } =
    body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "กรุณาระบุชื่อหน่วยงาน" }, { status: 400 });
  }
  if (type !== "PCU" && type !== "CUP") {
    return NextResponse.json({ error: "ประเภทหน่วยงานไม่ถูกต้อง" }, { status: 400 });
  }
  if (!parentOrgId) {
    return NextResponse.json({ error: "กรุณาเลือกหน่วยงานต้นสังกัด" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const parentRes = await client.query(`SELECT type FROM organizations WHERE id = $1`, [
      parentOrgId,
    ]);
    const parentType = parentRes.rows[0]?.type;
    const expectedParentType = type === "PCU" ? "CUP" : "PROVINCE";
    if (parentType !== expectedParentType) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: `หน่วยงานต้นสังกัดของ${type === "PCU" ? "รพ.สต." : "CUP"} ต้องเป็น${type === "PCU" ? " CUP" : "อบจ."}` },
        { status: 400 }
      );
    }

    const orgRes = await client.query(
      `INSERT INTO organizations (name, type, parent_org_id) VALUES ($1,$2,$3) RETURNING id`,
      [name.trim(), type, parentOrgId]
    );
    const orgId = orgRes.rows[0].id;

    // ทุกหน่วยงานต้องมีคลังของตัวเองตั้งแต่สร้าง เพื่อให้ /api/stock, /api/inventory/receipts ทำงานได้ทันที
    // ตั้ง warehouse.id = organization.id ตรงๆ (ไม่ใช้ default gen_random_uuid()) เพราะทั้งระบบ
    // (dispensing-events, requisitions approval, stock lookup) อ้างอิง warehouse โดยใช้ org id ตรงๆ ทุกจุด
    await client.query(`INSERT INTO warehouses (id, org_id, name, type) VALUES ($1,$1,$2,$3)`, [
      orgId,
      `คลังยา ${name.trim()}`,
      type,
    ]);

    await client.query("COMMIT");
    return NextResponse.json({ id: orgId }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
