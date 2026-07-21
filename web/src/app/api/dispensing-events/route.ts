import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTrustedUser } from "@/lib/auth";

export async function GET(request: Request) {
  const user = getTrustedUser(request);
  if (!user || user.orgType !== "PCU") {
    return NextResponse.json({ error: "เฉพาะ รพ.สต. เท่านั้นที่ดูประวัติการจ่ายยาได้" }, { status: 403 });
  }

  const { rows } = await pool.query(
    `SELECT de.id, de.encounter_ref, de.qty_dispensed, de.dispensed_at, de.lot_no,
            d.drug_code, d.generic_name, d.unit
     FROM dispensing_events de
     JOIN drugs d ON d.drug_code = de.drug_code
     WHERE de.org_id = $1
     ORDER BY de.dispensed_at DESC
     LIMIT 100`,
    [user.orgId]
  );
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const user = getTrustedUser(request);
  if (!user || user.orgType !== "PCU") {
    return NextResponse.json({ error: "เฉพาะ รพ.สต. เท่านั้นที่จ่ายยาได้" }, { status: 403 });
  }

  const body = await request.json();
  const { encounterRef, items } = body as {
    encounterRef?: string;
    items: { drugCode: string; qtyDispensed: number }[];
  };

  if (!encounterRef?.trim()) {
    return NextResponse.json({ error: "กรุณาระบุรหัสอ้างอิงผู้ป่วย" }, { status: 400 });
  }
  if (!items?.length) {
    return NextResponse.json({ error: "กรุณาเลือกยาอย่างน้อย 1 รายการ" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const dispensedAt = new Date();

    for (const item of items) {
      if (!item.qtyDispensed || item.qtyDispensed <= 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "จำนวนยาต้องมากกว่า 0" }, { status: 400 });
      }

      const lotRes = await client.query(
        `SELECT lot_no, qty_on_hand FROM stock_lots
         WHERE warehouse_id = $1 AND drug_code = $2 AND qty_on_hand >= $3
         ORDER BY expiry_date ASC LIMIT 1 FOR UPDATE`,
        [user.orgId, item.drugCode, item.qtyDispensed]
      );
      if (lotRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: `สต็อกไม่พอสำหรับ ${item.drugCode}` },
          { status: 409 }
        );
      }
      const lot = lotRes.rows[0];
      const newBalance = Number(lot.qty_on_hand) - Number(item.qtyDispensed);

      await client.query(
        `INSERT INTO stock_ledger (warehouse_id, drug_code, lot_no, txn_type, qty, balance_after, ref_type, created_by)
         VALUES ($1,$2,$3,'DISPENSE',$4,$5,'DISPENSING_EVENT',$6)`,
        [user.orgId, item.drugCode, lot.lot_no, -item.qtyDispensed, newBalance, user.userId]
      );

      await client.query(
        `INSERT INTO dispensing_events
           (org_id, drug_code, lot_no, encounter_ref, qty_dispensed, dispensed_by, dispensed_at, source_system, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'MANUAL',$8)`,
        [
          user.orgId,
          item.drugCode,
          lot.lot_no,
          encounterRef.trim(),
          item.qtyDispensed,
          user.userId,
          dispensedAt,
          crypto.randomUUID(),
        ]
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
