import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTrustedUser } from "@/lib/auth";

export async function GET(request: Request) {
  const user = getTrustedUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const orgId = new URL(request.url).searchParams.get("orgId");
  if (!orgId) {
    return NextResponse.json({ error: "orgId is required" }, { status: 400 });
  }

  // อนุญาตดูสต็อกของหน่วยงานตัวเอง, ของคลังจังหวัด (สาธารณะให้ทุกคนดูได้), หรือถ้าเป็น PROVINCE_ADMIN ดูได้ทุกหน่วยงาน
  if (user.role !== "PROVINCE_ADMIN" && orgId !== user.orgId) {
    const orgRes = await pool.query(`SELECT type FROM organizations WHERE id = $1`, [orgId]);
    if (orgRes.rows[0]?.type !== "PROVINCE") {
      return NextResponse.json({ error: "ไม่มีสิทธิ์ดูสต็อกของหน่วยงานนี้" }, { status: 403 });
    }
  }

  const { rows } = await pool.query(
    `SELECT sl.drug_code, d.generic_name, d.unit, sl.lot_no, sl.expiry_date,
            sl.qty_on_hand, w.name AS warehouse_name
     FROM stock_lots sl
     JOIN warehouses w ON w.id = sl.warehouse_id
     JOIN drugs d ON d.drug_code = sl.drug_code
     WHERE w.org_id = $1
     ORDER BY d.generic_name, sl.expiry_date`,
    [orgId]
  );
  return NextResponse.json(rows);
}
