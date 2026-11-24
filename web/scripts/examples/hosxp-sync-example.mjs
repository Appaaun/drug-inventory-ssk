// ตัวอย่างสคริปต์ฝั่ง รพ.สต. ที่ส่งข้อมูลจาก HOSxP เข้าระบบจัดการคลังยา
// รันบนเครื่องในเครือข่าย รพ.สต. (ที่เข้าถึงฐานข้อมูล HOSxP ได้) ตั้งเวลารันซ้ำได้ เช่น ทุก 15 นาทีด้วย Task Scheduler/cron
// ส่งซ้ำปลอดภัย — ระบบกันข้อมูลซ้ำด้วย idempotencyKey
//
// วิธีลอง (ใช้ข้อมูลตัวอย่างในสคริปต์ ไม่ต้องมี HOSxP จริง):
//   SSK_API_URL=https://drug-inventory-ssk.vercel.app SSK_API_KEY=ssk_xxxx node hosxp-sync-example.mjs
//   เพิ่ม --dry-run เพื่อดู payload โดยไม่ส่งจริง
//
// ใช้กับ HOSxP จริง: แทนที่ฟังก์ชัน readDispensingFromHosxp() ด้วยการ query MySQL (ต้องติดตั้งแพ็กเกจ mysql2)
// ตัวอย่าง query (ชื่อตาราง/คอลัมน์อาจต่างกันในแต่ละ รพ. ต้องตรวจกับ DBA ของ รพ. ก่อน):
//
//   SELECT o.vn, o.icode, o.qty, o.rxdate, o.rxtime
//   FROM opitemrece o
//   JOIN drugitems d ON d.icode = o.icode
//   WHERE o.rxdate >= CURDATE() - INTERVAL 1 DAY;
//
// สำคัญ (PDPA): ใช้ vn (เลขที่ visit) เป็น encounterRef — ห้ามส่ง hn หรือเลขบัตรประชาชน

const API_URL = process.env.SSK_API_URL ?? "http://localhost:3000";
const API_KEY = process.env.SSK_API_KEY;
const DRY_RUN = process.argv.includes("--dry-run");

if (!API_KEY && !DRY_RUN) {
  console.error("ต้องตั้งค่า SSK_API_KEY (ขอจากผู้ดูแลระบบ อบจ.)");
  process.exit(1);
}

// ข้อมูลตัวอย่างหน้าตาเหมือนผลลัพธ์ของ query ข้างบน
async function readDispensingFromHosxp() {
  return [
    { vn: "690721001", icode: "1000001", qty: 10, rxdate: "2026-07-21", rxtime: "09:30:00" },
    { vn: "690721002", icode: "1000001", qty: 6, rxdate: "2026-07-21", rxtime: "10:05:00" },
  ];
}

const rows = await readDispensingFromHosxp();

const payload = {
  sourceSystem: "HosXP_PCU",
  events: rows.map((r) => ({
    // คีย์กันซ้ำ: ต้องคงที่สำหรับรายการเดิมเสมอ ไม่ว่าจะส่งกี่ครั้ง
    idempotencyKey: `${r.vn}-${r.icode}-${r.rxtime}`,
    encounterRef: r.vn,
    localDrugCode: r.icode, // รหัสยาใน HOSxP — ต้องลงทะเบียนใน drug_code_mapping ของหน่วยงานไว้ก่อน
    qty: Number(r.qty),
    dispensedAt: `${r.rxdate}T${r.rxtime}+07:00`,
  })),
};

if (DRY_RUN) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const res = await fetch(`${API_URL}/api/integration/dispensing`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
  body: JSON.stringify(payload),
});
const result = await res.json();
console.log(`HTTP ${res.status}`, JSON.stringify(result.summary ?? result));
for (const r of result.results ?? []) {
  if (r.status === "rejected") console.log(`  ✗ รายการที่ ${r.index}: ${r.reason}`);
}
if (!res.ok) process.exit(1);
