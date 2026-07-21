import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTrustedUser } from "@/lib/auth";

export async function GET(request: Request) {
  const user = getTrustedUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const status = params.get("status");

  // scope ตาม role เสมอ (ไม่รับ orgId จาก client) กัน CUP/PCU เห็นข้อมูลข้ามหน่วยงาน
  // PROVINCE_ADMIN เห็นทุกคำขอ, CUP_MANAGER เห็นเฉพาะที่ส่งมาที่ CUP ตัวเอง, PCU_REQUESTER เห็นเฉพาะที่ตัวเองสร้าง
  let scopeColumn: "requester_org_id" | "target_org_id" | null = null;
  if (user.role === "CUP_MANAGER") scopeColumn = "target_org_id";
  else if (user.role === "PCU_REQUESTER") scopeColumn = "requester_org_id";

  const { rows } = await pool.query(
    `SELECT r.id, r.status, r.priority, r.created_at,
            ro.name AS requester_name, ta.name AS target_name,
            COALESCE(
              (SELECT json_agg(json_build_object(
                 'drug_code', ri.drug_code,
                 'generic_name', d.generic_name,
                 'qty_requested', ri.qty_requested,
                 'qty_approved', ri.qty_approved,
                 'qty_received', ri.qty_received
               ) ORDER BY d.generic_name)
               FROM requisition_items ri
               JOIN drugs d ON d.drug_code = ri.drug_code
               WHERE ri.requisition_id = r.id),
              '[]'
            ) AS items
     FROM requisitions r
     JOIN organizations ro ON ro.id = r.requester_org_id
     JOIN organizations ta ON ta.id = r.target_org_id
     WHERE ($1::text IS NULL OR (r.${scopeColumn ?? "requester_org_id"})::text = $1)
       AND ($2::text IS NULL OR r.status::text = $2)
     ORDER BY r.created_at DESC
     LIMIT 200`,
    [scopeColumn ? user.orgId : null, status]
  );
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const user = getTrustedUser(request);
  if (!user || user.role !== "PCU_REQUESTER" || user.orgType !== "PCU") {
    return NextResponse.json({ error: "เฉพาะผู้ใช้ รพ.สต. เท่านั้นที่สร้างคำขอเบิกได้" }, { status: 403 });
  }

  const body = await request.json();
  const { priority, items } = body as {
    priority: "normal" | "urgent";
    items: { drugCode: string; qtyRequested: number }[];
  };

  if (!items?.length) {
    return NextResponse.json({ error: "missing required fields" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // requesterOrgId/createdBy มาจาก session ที่ verify แล้วเท่านั้น ไม่รับค่าจาก client
    // targetOrgId คำนวณจาก parent_org_id ของหน่วยงานตัวเอง ป้องกันการปลอมแปลงส่งคำขอในนามหน่วยงานอื่น
    const orgRes = await client.query(
      `SELECT parent_org_id FROM organizations WHERE id = $1`,
      [user.orgId]
    );
    const targetOrgId = orgRes.rows[0]?.parent_org_id;
    if (!targetOrgId) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "ไม่พบหน่วยงานต้นสังกัด (CUP)" }, { status: 400 });
    }
    const reqRes = await client.query(
      `INSERT INTO requisitions (requester_org_id, target_org_id, status, priority, created_by)
       VALUES ($1,$2,'PENDING_CUP_APPROVAL',$3,$4) RETURNING id`,
      [user.orgId, targetOrgId, priority ?? "normal", user.userId]
    );
    const requisitionId = reqRes.rows[0].id;
    for (const item of items) {
      await client.query(
        `INSERT INTO requisition_items (requisition_id, drug_code, qty_requested)
         VALUES ($1,$2,$3)`,
        [requisitionId, item.drugCode, item.qtyRequested]
      );
    }
    await client.query("COMMIT");
    return NextResponse.json({ id: requisitionId }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
