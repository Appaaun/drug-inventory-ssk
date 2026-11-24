import { createHash } from "node:crypto";
import { pool } from "@/lib/db";

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

// ตรวจ API key จาก header x-api-key — คีย์ผูกกับหน่วยงานเดียว ข้อมูลที่ส่งเข้ามาจะถูกบันทึกในนามหน่วยงานนั้นเสมอ
// (ไม่รับ orgId จาก body กันระบบของ รพ.สต. หนึ่งส่งข้อมูลปลอมในนามหน่วยงานอื่น)
export async function authenticateIntegration(request: Request) {
  const key = request.headers.get("x-api-key");
  if (!key) return null;
  const { rows } = await pool.query(
    `UPDATE integration_keys SET last_used_at = now()
     WHERE key_hash = $1 AND is_active = true
     RETURNING id, org_id`,
    [hashApiKey(key)]
  );
  if (rows.length === 0) return null;
  return { keyId: rows[0].id as string, orgId: rows[0].org_id as string };
}

// รับ drugCode (รหัส TMT มาตรฐาน) ตรงๆ หรือ localDrugCode (รหัสยาในระบบ รพ. เช่น icode ของ HOSxP)
// แล้วแปลงผ่านตาราง drug_code_mapping ของหน่วยงานนั้น
export async function resolveDrugCode(
  orgId: string,
  input: { drugCode?: string; localDrugCode?: string }
): Promise<string | null> {
  if (input.drugCode) {
    const r = await pool.query(`SELECT drug_code FROM drugs WHERE drug_code = $1`, [input.drugCode]);
    return r.rows[0]?.drug_code ?? null;
  }
  if (input.localDrugCode) {
    const r = await pool.query(
      `SELECT drug_code FROM drug_code_mapping WHERE org_id = $1 AND local_code = $2`,
      [orgId, input.localDrugCode]
    );
    return r.rows[0]?.drug_code ?? null;
  }
  return null;
}

export type ItemResult = {
  index: number;
  status: string;
  reason?: string;
  idempotencyKey?: string;
};
