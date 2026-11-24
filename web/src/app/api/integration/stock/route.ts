import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { authenticateIntegration, resolveDrugCode, type ItemResult } from "@/lib/integration";

const MAX_BATCH = 1000;

type StockInput = {
  drugCode?: string;
  localDrugCode?: string;
  lotNo?: string;
  expiryDate?: string;
  qtyOnHand?: number;
  unitCost?: number;
};

// รับสต็อกคงเหลือ (snapshot) จากระบบคลัง เช่น INVS — ตั้งยอดของแต่ละ lot ให้ตรงกับที่ส่งมา
// ถ้ายอดต่างจากเดิมจะบันทึกเป็นรายการปรับยอด (ADJUSTMENT) ในสมุดบัญชีสต็อก ย้อนตรวจสอบได้
export async function POST(request: Request) {
  const auth = await authenticateIntegration(request);
  if (!auth) {
    return NextResponse.json({ error: "API key ไม่ถูกต้องหรือถูกปิดใช้งาน" }, { status: 401 });
  }

  let body: { items?: StockInput[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบ JSON ไม่ถูกต้อง" }, { status: 400 });
  }
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `items ต้องเป็นอาร์เรย์ 1–${MAX_BATCH} รายการ` },
      { status: 400 }
    );
  }

  const results: ItemResult[] = [];
  for (let i = 0; i < body.items.length; i++) {
    results.push({ index: i, ...(await processItem(auth.orgId, body.items[i])) });
  }

  const count = (s: string) => results.filter((r) => r.status === s).length;
  return NextResponse.json({
    summary: { updated: count("updated"), unchanged: count("unchanged"), rejected: count("rejected") },
    results,
  });
}

async function processItem(orgId: string, it: StockInput): Promise<Omit<ItemResult, "index">> {
  const reject = (reason: string) => ({ status: "rejected", reason });

  if (!it || typeof it !== "object") return reject("รายการไม่ถูกต้อง");
  if (!it.lotNo || typeof it.lotNo !== "string" || it.lotNo.length > 50) {
    return reject("ต้องมี lotNo (ไม่เกิน 50 ตัวอักษร)");
  }
  if (!it.expiryDate || Number.isNaN(new Date(it.expiryDate).getTime())) {
    return reject("expiryDate ต้องเป็นวันที่ เช่น 2028-06-30");
  }
  if (typeof it.qtyOnHand !== "number" || it.qtyOnHand < 0) {
    return reject("qtyOnHand ต้องเป็นตัวเลขไม่ติดลบ");
  }
  if (it.unitCost !== undefined && (typeof it.unitCost !== "number" || it.unitCost < 0)) {
    return reject("unitCost ต้องเป็นตัวเลขไม่ติดลบ");
  }

  const drugCode = await resolveDrugCode(orgId, it);
  if (!drugCode) {
    return reject("ไม่พบรหัสยา — ส่ง drugCode (TMT) หรือ localDrugCode ที่ลงทะเบียนใน drug_code_mapping ไว้แล้ว");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO stock_lots (warehouse_id, drug_code, lot_no, expiry_date, qty_on_hand, unit_cost)
       VALUES ($1,$2,$3,$4,0,$5)
       ON CONFLICT (warehouse_id, drug_code, lot_no)
       DO UPDATE SET expiry_date = EXCLUDED.expiry_date,
                     unit_cost = COALESCE(EXCLUDED.unit_cost, stock_lots.unit_cost)`,
      [orgId, drugCode, it.lotNo, it.expiryDate, it.unitCost ?? null]
    );
    const cur = await client.query(
      `SELECT qty_on_hand FROM stock_lots WHERE warehouse_id=$1 AND drug_code=$2 AND lot_no=$3 FOR UPDATE`,
      [orgId, drugCode, it.lotNo]
    );
    const delta = it.qtyOnHand - Number(cur.rows[0].qty_on_hand);
    if (delta === 0) {
      await client.query("COMMIT");
      return { status: "unchanged" };
    }
    await client.query(
      `INSERT INTO stock_ledger (warehouse_id, drug_code, lot_no, txn_type, qty, balance_after, ref_type)
       VALUES ($1,$2,$3,'ADJUSTMENT',$4,$5,'INTEGRATION_SYNC')`,
      [orgId, drugCode, it.lotNo, delta, it.qtyOnHand]
    );
    await client.query("COMMIT");
    return { status: "updated" };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    return reject(`บันทึกไม่สำเร็จ: ${String(err)}`);
  } finally {
    client.release();
  }
}
