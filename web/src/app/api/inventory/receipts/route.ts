import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTrustedUser } from "@/lib/auth";

const PROVINCE_ID = "00000000-0000-0000-0000-000000000001";

export async function POST(request: Request) {
  const user = getTrustedUser(request);
  if (!user || user.role !== "PROVINCE_ADMIN") {
    return NextResponse.json({ error: "เฉพาะ อบจ. เท่านั้นที่รับยาเข้าคลังได้" }, { status: 403 });
  }

  const body = await request.json();
  const {
    drugCode,
    newDrug,
    qty,
    unitCost,
    lotNo,
    expiryDate,
    receivedDate,
  }: {
    drugCode?: string;
    newDrug?: { genericName: string; unit: string; controlledFlag?: boolean };
    qty: number;
    unitCost: number;
    lotNo?: string;
    expiryDate?: string;
    receivedDate?: string;
  } = body;

  if (!qty || qty <= 0) {
    return NextResponse.json({ error: "จำนวนต้องมากกว่า 0" }, { status: 400 });
  }
  if (unitCost === undefined || unitCost === null || unitCost < 0) {
    return NextResponse.json({ error: "ราคาต้องไม่ติดลบ" }, { status: 400 });
  }
  if (!drugCode && !newDrug?.genericName) {
    return NextResponse.json({ error: "ต้องเลือกยา หรือระบุชื่อยาใหม่" }, { status: 400 });
  }
  if (!lotNo?.trim()) {
    return NextResponse.json({ error: "กรุณาระบุเลข Lot" }, { status: 400 });
  }
  if (!expiryDate?.trim()) {
    return NextResponse.json({ error: "กรุณาระบุวันหมดอายุ" }, { status: 400 });
  }
  if (!receivedDate?.trim()) {
    return NextResponse.json({ error: "กรุณาระบุวันที่รับเข้า" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let finalDrugCode = drugCode;
    if (!finalDrugCode) {
      const maxRes = await client.query(
        `SELECT drug_code FROM drugs ORDER BY drug_code DESC LIMIT 1 FOR UPDATE`
      );
      const lastCode = maxRes.rows[0]?.drug_code as string | undefined;
      const lastNum = lastCode ? parseInt(lastCode.replace("TMT-", ""), 10) : 0;
      finalDrugCode = `TMT-${String(lastNum + 1).padStart(8, "0")}`;
      await client.query(
        `INSERT INTO drugs (drug_code, generic_name, unit, controlled_flag)
         VALUES ($1,$2,$3,$4)`,
        [finalDrugCode, newDrug!.genericName, newDrug!.unit || "TAB", !!newDrug!.controlledFlag]
      );
    }

    await client.query(
      `INSERT INTO stock_lots (warehouse_id, drug_code, lot_no, expiry_date, qty_on_hand, unit_cost)
       VALUES ($1,$2,$3,$4,0,$5)
       ON CONFLICT (warehouse_id, drug_code, lot_no)
       DO UPDATE SET unit_cost = EXCLUDED.unit_cost`,
      [PROVINCE_ID, finalDrugCode, lotNo, expiryDate, unitCost]
    );
    const cur = await client.query(
      `SELECT qty_on_hand FROM stock_lots WHERE warehouse_id=$1 AND drug_code=$2 AND lot_no=$3 FOR UPDATE`,
      [PROVINCE_ID, finalDrugCode, lotNo]
    );
    const newBalance = Number(cur.rows[0].qty_on_hand) + Number(qty);
    await client.query(
      `INSERT INTO stock_ledger (warehouse_id, drug_code, lot_no, txn_type, qty, balance_after, unit_cost, ref_type, created_by, created_at)
       VALUES ($1,$2,$3,'RECEIPT',$4,$5,$6,'RECEIPT',$7,$8)`,
      [PROVINCE_ID, finalDrugCode, lotNo, qty, newBalance, unitCost, user.userId, receivedDate]
    );

    await client.query("COMMIT");
    return NextResponse.json(
      { drugCode: finalDrugCode, lotNo, qtyOnHand: newBalance },
      { status: 201 }
    );
  } catch (err) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
