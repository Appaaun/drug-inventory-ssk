# เชื่อมต่อระบบภายนอก (HOSxP / INVS / JHIIS)

ระบบเปิด API ให้ระบบของ รพ./รพ.สต. **ส่งข้อมูลเข้ามา** ได้ 2 แบบ (ตัวระบบไม่เข้าไปดึงข้อมูลเอง เพราะเซิร์ฟเวอร์ รพ. ปกติไม่เปิดสู่อินเทอร์เน็ต
ให้สคริปต์ฝั่ง รพ.สต. ส่งออกมาแทน)

```
[HOSxP/INVS ใน LAN ของ รพ.สต.] --(สคริปต์ซิงก์ HTTPS + API key)--> [ระบบจัดการคลังยา อบจ.]
```

| Endpoint | ใช้ทำอะไร | ข้อมูลต้นทางโดยทั่วไป |
|---|---|---|
| `POST /api/integration/dispensing` | บันทึกการจ่ายยาให้ผู้ป่วยและตัดสต็อก (FEFO) | HOSxP |
| `POST /api/integration/stock` | ตั้งยอดสต็อกคงเหลือรายล็อตให้ตรงกับระบบคลัง | INVS |

## การยืนยันตัวตน

ใส่ API key ใน header `x-api-key` — คีย์ผูกกับ **รพ.สต. เดียว** ข้อมูลที่ส่งมาจะถูกบันทึกในนามหน่วยงานนั้นเสมอ (ไม่รับรหัสหน่วยงานจาก body)
ในฐานข้อมูลเก็บเฉพาะ SHA-256 hash ของคีย์ ปิดการใช้งานคีย์ได้โดยตั้ง `integration_keys.is_active = false`

สร้างคีย์ (ผู้ดูแลระบบ อบจ. รันครั้งเดียวต่อ รพ.สต. คีย์แสดงครั้งเดียวเท่านั้น):

```bash
cd web
DATABASE_URL="<connection string>" node scripts/create-api-key.mjs <orgId ของ รพ.สต.> "HOSxP รพ.สต.บ้านหนองบัว"
```

## รหัสยา

ส่งได้ 2 แบบ อย่างใดอย่างหนึ่งต่อรายการ
- `drugCode` — รหัส TMT มาตรฐานของระบบนี้
- `localDrugCode` — รหัสยาในระบบของ รพ. (เช่น `icode` ของ HOSxP) ต้องลงทะเบียนแปลงรหัสไว้ก่อน:

```sql
INSERT INTO drug_code_mapping (org_id, local_code, drug_code)
VALUES ('<orgId>', '1000001', 'TMT-00000001');
```

## POST /api/integration/dispensing

```json
{
  "sourceSystem": "HosXP_PCU",
  "events": [
    {
      "idempotencyKey": "690721001-1000001-09:30:00",
      "encounterRef": "690721001",
      "localDrugCode": "1000001",
      "qty": 10,
      "dispensedAt": "2026-07-21T09:30:00+07:00"
    }
  ]
}
```

- ส่งได้ครั้งละ 1–500 รายการ `sourceSystem` เป็น `HosXP_PCU` (ค่าเริ่มต้น) หรือ `JHIIS`
- `idempotencyKey` ต้องคงที่สำหรับรายการเดิมเสมอ ส่งซ้ำจะตอบ `duplicate` และไม่ตัดสต็อกซ้ำ
- `encounterRef` คือเลขที่ visit/VN **ห้ามส่งเลขบัตรประชาชน 13 หลักหรือ HN** (หลัก PDPA ของระบบ) ถ้าเป็นเลข 13 หลักจะถูกปฏิเสธ
- ตัดสต็อกจากล็อตที่หมดอายุก่อน ถ้าสต็อกในระบบไม่พอรายการนั้นจะถูกปฏิเสธ (ไม่ตัดติดลบ)

ตอบกลับ HTTP 200 พร้อมผลรายรายการ:

```json
{
  "summary": { "created": 1, "duplicate": 0, "rejected": 0 },
  "results": [{ "index": 0, "status": "created", "idempotencyKey": "690721001-1000001-09:30:00" }]
}
```

`status` เป็น `created` / `duplicate` / `rejected` (พร้อม `reason`)

## POST /api/integration/stock

```json
{
  "items": [
    {
      "localDrugCode": "1000001",
      "lotNo": "L2026A",
      "expiryDate": "2028-06-30",
      "qtyOnHand": 100,
      "unitCost": 1.5
    }
  ]
}
```

- ส่งได้ครั้งละ 1–1,000 รายการ ตั้งยอดของล็อตให้เท่ากับ `qtyOnHand` ถ้าต่างจากเดิมจะบันทึกเป็นรายการ `ADJUSTMENT` ในสมุดบัญชีสต็อก (ตรวจย้อนหลังได้)
- `status`: `updated` / `unchanged` / `rejected`

## ลองใช้

```bash
curl -X POST https://drug-inventory-ssk.vercel.app/api/integration/stock \
  -H "x-api-key: ssk_xxxx" -H "Content-Type: application/json" \
  -d '{"items":[{"drugCode":"TMT-00000001","lotNo":"L1","expiryDate":"2028-06-30","qtyOnHand":100}]}'
```

สคริปต์ตัวอย่างที่ยิงข้อมูลจำลองจาก HOSxP: [`web/scripts/examples/hosxp-sync-example.mjs`](web/scripts/examples/hosxp-sync-example.mjs)
(เพิ่ม `--dry-run` เพื่อดู payload โดยไม่ส่งจริง)

## สิ่งที่ต้องตกลงกับ รพ. ก่อนใช้จริง

- **ใครเป็นต้นทางของสต็อก** — ถ้า INVS เป็นต้นทาง ควรใช้ระบบนี้เพื่อรับข้อมูลมาแสดง/วิเคราะห์ และไม่ทำรายการรับ-เบิกซ้ำสองที่ ไม่เช่นนั้นสต็อกสองระบบจะไม่ตรงกัน
- **โครงสร้างฐานข้อมูล HOSxP/INVS ของแต่ละ รพ.** ต่างกันได้ ต้องขอสิทธิ์อ่านอย่างเดียวจาก DBA ของ รพ. แล้วปรับ query ในสคริปต์ให้ตรง
- **การเข้าถึงเครือข่าย** — สคริปต์ต้องออกอินเทอร์เน็ตแบบ HTTPS ไปยังระบบนี้ได้ ไม่ต้องเปิดพอร์ตเข้า รพ.
