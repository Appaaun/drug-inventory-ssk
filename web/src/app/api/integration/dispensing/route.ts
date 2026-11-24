import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { authenticateIntegration, resolveDrugCode, type ItemResult } from "@/lib/integration";

const MAX_BATCH = 500;
const SOURCE_SYSTEMS = ["HosXP_PCU", "JHIIS"];

type DispensingInput = {
  idempotencyKey?: string;
  encounterRef?: string;
  drugCode?: string;
  localDrugCode?: string;
  qty?: number;
  dispensedAt?: string;
};

// รับข้อมูลการจ่ายยาจากระบบ HIS ของ รพ./รพ.สต. (HOSxP, JHIIS) เป็นชุด (batch) แล้วตัดสต็อกในระบบนี้ตามลำดับหมดอายุก่อน (FEFO)
// ส่งซ้ำได้ปลอดภัย: idempotencyKey เดิมจะตอบ "duplicate" ไม่ตัดสต็อกซ้ำ
export async function POST(request: Request) {
  const auth = await authenticateIntegration(request);
  if (!auth) {
    return NextResponse.json({ error: "API key ไม่ถูกต้องหรือถูกปิดใช้งาน" }, { status: 401 });
  }

  let body: { sourceSystem?: string; events?: DispensingInput[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบ JSON ไม่ถูกต้อง" }, { status: 400 });
  }

  const sourceSystem = body.sourceSystem ?? "HosXP_PCU";
  if (!SOURCE_SYSTEMS.includes(sourceSystem)) {
    return NextResponse.json(
      { error: `sourceSystem ต้องเป็นหนึ่งใน ${SOURCE_SYSTEMS.join(", ")}` },
      { status: 400 }
    );
  }
  if (!Array.isArray(body.events) || body.events.length === 0 || body.events.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `events ต้องเป็นอาร์เรย์ 1–${MAX_BATCH} รายการ` },
      { status: 400 }
    );
  }

  const results: ItemResult[] = [];
  for (let i = 0; i < body.events.length; i++) {
    results.push({ index: i, ...(await processEvent(auth.orgId, sourceSystem, body.events[i])) });
  }

  const count = (s: string) => results.filter((r) => r.status === s).length;
  return NextResponse.json({
    summary: { created: count("created"), duplicate: count("duplicate"), rejected: count("rejected") },
    results,
  });
}

async function processEvent(
  orgId: string,
  sourceSystem: string,
  ev: DispensingInput
): Promise<Omit<ItemResult, "index">> {
  const reject = (reason: string) => ({ status: "rejected", reason, idempotencyKey: ev?.idempotencyKey });

  if (!ev || typeof ev !== "object") return reject("รายการไม่ถูกต้อง");
  if (!ev.idempotencyKey || typeof ev.idempotencyKey !== "string" || ev.idempotencyKey.length > 80) {
    return reject("ต้องมี idempotencyKey (ข้อความไม่เกิน 80 ตัวอักษร) เพื่อกันตัดสต็อกซ้ำ");
  }
  if (!ev.encounterRef || typeof ev.encounterRef !== "string" || ev.encounterRef.length > 100) {
    return reject("ต้องมี encounterRef (เลขที่ visit ไม่เกิน 100 ตัวอักษร)");
  }
  // PDPA: ห้ามส่งเลขบัตรประชาชน (13 หลัก) เข้ามาเก็บ ใช้เลขที่ visit/VN ที่ไม่ระบุตัวบุคคลโดยตรงเท่านั้น
  if (/^\d{13}$/.test(ev.encounterRef.trim())) {
    return reject("encounterRef ห้ามเป็นเลขบัตรประชาชน 13 หลัก (PDPA) ให้ใช้เลขที่ visit แทน");
  }
  if (typeof ev.qty !== "number" || !(ev.qty > 0)) return reject("qty ต้องเป็นตัวเลขมากกว่า 0");
  const dispensedAt = ev.dispensedAt ? new Date(ev.dispensedAt) : null;
  if (!dispensedAt || Number.isNaN(dispensedAt.getTime())) {
    return reject("dispensedAt ต้องเป็นวันเวลา ISO 8601 เช่น 2026-07-21T09:30:00+07:00");
  }

  const drugCode = await resolveDrugCode(orgId, ev);
  if (!drugCode) {
    return reject("ไม่พบรหัสยา — ส่ง drugCode (TMT) หรือ localDrugCode ที่ลงทะเบียนใน drug_code_mapping ไว้แล้ว");
  }

  const idempotencyKey = `${orgId}:${ev.idempotencyKey}`;
  const dup = await pool.query(`SELECT 1 FROM dispensing_events WHERE idempotency_key = $1`, [idempotencyKey]);
  if (dup.rows.length > 0) return { status: "duplicate", idempotencyKey: ev.idempotencyKey };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // คลังของหน่วยงาน = warehouse ที่มี id เท่ากับ org id (ตามที่ทั้งระบบใช้)
    const lotRes = await client.query(
      `SELECT lot_no, qty_on_hand FROM stock_lots
       WHERE warehouse_id = $1 AND drug_code = $2 AND qty_on_hand >= $3
       ORDER BY expiry_date ASC LIMIT 1 FOR UPDATE`,
      [orgId, drugCode, ev.qty]
    );
    if (lotRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return reject(`สต็อกในระบบไม่พอสำหรับยา ${drugCode} จำนวน ${ev.qty}`);
    }
    const lot = lotRes.rows[0];

    const ins = await client.query(
      `INSERT INTO dispensing_events
         (org_id, drug_code, lot_no, encounter_ref, qty_dispensed, dispensed_at, source_system, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [orgId, drugCode, lot.lot_no, ev.encounterRef.trim(), ev.qty, dispensedAt, sourceSystem, idempotencyKey]
    );
    if (ins.rows.length === 0) {
      await client.query("ROLLBACK");
      return { status: "duplicate", idempotencyKey: ev.idempotencyKey };
    }

    const newBalance = Number(lot.qty_on_hand) - ev.qty;
    await client.query(
      `INSERT INTO stock_ledger (warehouse_id, drug_code, lot_no, txn_type, qty, balance_after, ref_type, ref_id)
       VALUES ($1,$2,$3,'DISPENSE',$4,$5,'DISPENSING_EVENT',$6)`,
      [orgId, drugCode, lot.lot_no, -ev.qty, newBalance, ins.rows[0].id]
    );
    await client.query("COMMIT");
    return { status: "created", idempotencyKey: ev.idempotencyKey };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    return reject(`บันทึกไม่สำเร็จ: ${String(err)}`);
  } finally {
    client.release();
  }
}
