import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTrustedUser } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const user = getTrustedUser(request);
  if (!user || user.role !== "PROVINCE_ADMIN") {
    return NextResponse.json({ error: "เฉพาะ อบจ. เท่านั้นที่ดูประวัติราคาได้" }, { status: 403 });
  }

  const { code } = await params;
  const { rows } = await pool.query(
    `SELECT sl.created_at, sl.unit_cost, sl.qty, sl.lot_no, w.name AS warehouse_name
     FROM stock_ledger sl
     JOIN warehouses w ON w.id = sl.warehouse_id
     WHERE sl.drug_code = $1 AND sl.txn_type = 'RECEIPT' AND sl.unit_cost IS NOT NULL
       AND w.type = 'PROVINCIAL'
     ORDER BY sl.created_at ASC`,
    [code]
  );
  return NextResponse.json(rows);
}
