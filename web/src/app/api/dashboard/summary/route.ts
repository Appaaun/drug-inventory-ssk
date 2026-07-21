import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTrustedUser } from "@/lib/auth";

export async function GET(request: Request) {
  const user = getTrustedUser(request);
  if (!user || user.role !== "PROVINCE_ADMIN") {
    return NextResponse.json({ error: "เฉพาะ อบจ. เท่านั้นที่ดู dashboard นี้ได้" }, { status: 403 });
  }

  const [totalStock, totalDrugs, pending, lowStock, byPcu, byDrug, receipts, provinceStock] =
    await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(qty_on_hand * unit_cost), 0) AS value FROM stock_lots`
      ),
      pool.query(`SELECT count(*) AS n FROM drugs WHERE is_active = true`),
      pool.query(
        `SELECT count(*) AS n FROM requisitions WHERE status = 'PENDING_PROVINCE_APPROVAL'`
      ),
      pool.query(
        `SELECT w.name AS warehouse_name, d.generic_name, sl.qty_on_hand
         FROM stock_lots sl
         JOIN warehouses w ON w.id = sl.warehouse_id
         JOIN drugs d ON d.drug_code = sl.drug_code
         WHERE w.type = 'PCU' AND sl.qty_on_hand < 80
         ORDER BY sl.qty_on_hand ASC
         LIMIT 10`
      ),
      pool.query(
        `SELECT o.name, count(*) AS requisition_count,
                COALESCE(SUM(ri.qty_requested), 0) AS total_qty
         FROM requisitions r
         JOIN organizations o ON o.id = r.requester_org_id
         JOIN requisition_items ri ON ri.requisition_id = r.id
         GROUP BY o.name
         ORDER BY requisition_count DESC`
      ),
      pool.query(
        `SELECT d.generic_name, count(DISTINCT r.id) AS requisition_count,
                COALESCE(SUM(ri.qty_requested), 0) AS total_qty
         FROM requisition_items ri
         JOIN requisitions r ON r.id = ri.requisition_id
         JOIN drugs d ON d.drug_code = ri.drug_code
         GROUP BY d.generic_name
         ORDER BY total_qty DESC`
      ),
      pool.query(
        `SELECT sl.created_at, w.name AS warehouse_name, d.generic_name, sl.qty, sl.lot_no
         FROM stock_ledger sl
         JOIN warehouses w ON w.id = sl.warehouse_id
         JOIN drugs d ON d.drug_code = sl.drug_code
         WHERE sl.txn_type = 'RECEIPT'
         ORDER BY sl.created_at DESC
         LIMIT 15`
      ),
      pool.query(
        `SELECT d.generic_name, sl.lot_no, sl.expiry_date, sl.qty_on_hand
         FROM stock_lots sl
         JOIN warehouses w ON w.id = sl.warehouse_id
         JOIN drugs d ON d.drug_code = sl.drug_code
         WHERE w.type = 'PROVINCIAL'
         ORDER BY d.generic_name`
      ),
    ]);

  return NextResponse.json({
    totalStockValue: Number(totalStock.rows[0].value),
    totalDrugs: Number(totalDrugs.rows[0].n),
    pendingApprovals: Number(pending.rows[0].n),
    lowStockAlerts: lowStock.rows,
    requisitionsByPcu: byPcu.rows,
    requisitionsByDrug: byDrug.rows,
    recentReceipts: receipts.rows,
    provinceStock: provinceStock.rows,
  });
}
