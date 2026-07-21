import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTrustedUser } from "@/lib/auth";

const PROVINCE_ID = "00000000-0000-0000-0000-000000000001";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getTrustedUser(request);
  if (!user || (user.role !== "CUP_MANAGER" && user.role !== "PROVINCE_ADMIN")) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ดำเนินการ" }, { status: 403 });
  }

  const { id } = await params;
  const { action } = (await request.json()) as { action: "approve" | "reject" };
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const reqRes = await client.query(
      `SELECT id, requester_org_id, target_org_id, status FROM requisitions WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (reqRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "requisition not found" }, { status: 404 });
    }
    const requisition = reqRes.rows[0];

    // ---- ขั้นที่ 1: CUP Manager รับคำขอจาก รพ.สต. ในเครือ แล้วส่งต่อ (escalate) ให้ อบจ. ----
    if (user.role === "CUP_MANAGER") {
      if (requisition.target_org_id !== user.orgId) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "คำขอนี้ไม่ได้ส่งมาที่ CUP ของคุณ" },
          { status: 403 }
        );
      }
      if (requisition.status !== "PENDING_CUP_APPROVAL") {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: `cannot ${action}: current status is ${requisition.status}` },
          { status: 409 }
        );
      }
      const nextStatus = action === "approve" ? "PENDING_PROVINCE_APPROVAL" : "REJECTED";
      await client.query(
        `UPDATE requisitions SET status=$2, updated_at=now() WHERE id=$1`,
        [id, nextStatus]
      );
      await client.query("COMMIT");
      return NextResponse.json({ status: nextStatus });
    }

    // ---- ขั้นที่ 2: อบจ. อนุมัติขั้นสุดท้าย + ตัดสต็อกจริงจากคลังจังหวัด ----
    if (requisition.status !== "PENDING_PROVINCE_APPROVAL") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: `cannot ${action}: current status is ${requisition.status}` },
        { status: 409 }
      );
    }

    if (action === "reject") {
      await client.query(
        `UPDATE requisitions SET status='REJECTED', updated_at=now() WHERE id=$1`,
        [id]
      );
      await client.query("COMMIT");
      return NextResponse.json({ status: "REJECTED" });
    }

    const approverUserId = user.userId;
    const itemsRes = await client.query(
      `SELECT id, drug_code, qty_requested FROM requisition_items WHERE requisition_id = $1`,
      [id]
    );

    for (const item of itemsRes.rows) {
      const lotRes = await client.query(
        `SELECT lot_no, qty_on_hand, unit_cost, expiry_date FROM stock_lots
         WHERE warehouse_id = $1 AND drug_code = $2 AND qty_on_hand >= $3
         ORDER BY expiry_date ASC LIMIT 1 FOR UPDATE`,
        [PROVINCE_ID, item.drug_code, item.qty_requested]
      );
      if (lotRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: `สต็อกจังหวัดไม่พอสำหรับ ${item.drug_code}` },
          { status: 409 }
        );
      }
      const lot = lotRes.rows[0];

      // deduct from province
      const newProvinceBalance = Number(lot.qty_on_hand) - Number(item.qty_requested);
      await client.query(
        `INSERT INTO stock_ledger (warehouse_id, drug_code, lot_no, txn_type, qty, balance_after, ref_type, ref_id, created_by)
         VALUES ($1,$2,$3,'ISSUE',$4,$5,'REQUISITION',$6,$7)`,
        [PROVINCE_ID, item.drug_code, lot.lot_no, -item.qty_requested, newProvinceBalance, id, approverUserId]
      );

      // receive into the requesting PCU — carry over the source lot's real cost/expiry
      // (not a re-purchase, so this doesn't count towards price history, just keeps stock valuation accurate)
      await client.query(
        `INSERT INTO stock_lots (warehouse_id, drug_code, lot_no, expiry_date, qty_on_hand, unit_cost)
         VALUES ($1,$2,$3,$4,0,$5)
         ON CONFLICT (warehouse_id, drug_code, lot_no) DO UPDATE SET unit_cost = EXCLUDED.unit_cost`,
        [requisition.requester_org_id, item.drug_code, lot.lot_no, lot.expiry_date, lot.unit_cost]
      );
      const pcuLot = await client.query(
        `SELECT qty_on_hand FROM stock_lots WHERE warehouse_id=$1 AND drug_code=$2 AND lot_no=$3`,
        [requisition.requester_org_id, item.drug_code, lot.lot_no]
      );
      const newPcuBalance = Number(pcuLot.rows[0].qty_on_hand) + Number(item.qty_requested);
      await client.query(
        `INSERT INTO stock_ledger (warehouse_id, drug_code, lot_no, txn_type, qty, balance_after, unit_cost, ref_type, ref_id, created_by)
         VALUES ($1,$2,$3,'RECEIPT',$4,$5,$6,'REQUISITION',$7,$8)`,
        [requisition.requester_org_id, item.drug_code, lot.lot_no, item.qty_requested, newPcuBalance, lot.unit_cost, id, approverUserId]
      );

      await client.query(
        `UPDATE requisition_items SET qty_approved=$1, qty_received=$1, lot_no=$2 WHERE id=$3`,
        [item.qty_requested, lot.lot_no, item.id]
      );
    }

    await client.query(
      `UPDATE requisitions SET status='CLOSED', updated_at=now() WHERE id=$1`,
      [id]
    );

    await client.query("COMMIT");
    return NextResponse.json({ status: "CLOSED" });
  } catch (err) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
