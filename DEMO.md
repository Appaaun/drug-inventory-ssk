# ทำ Demo ให้เข้าได้จริงเพื่อนำเสนอ (ฟรี ไม่ต้องมี VPS/โดเมน/รอ IT อนุมัติ)

นี่คือทางลัดสำหรับ "อยากได้ลิงก์จริงไปโชว์ก่อน" — ต่างจาก [DEPLOY.md](DEPLOY.md) ตรงที่:

- **ฟรีทั้งหมด** ไม่ต้องเสียเงินเช่า VPS
- **ไม่ต้องมีโดเมน** ได้ลิงก์แบบ `https://xxx.vercel.app` ทันที มี HTTPS ให้พร้อม
- **ใส่ข้อมูลตัวอย่างที่ดูสมจริง** (CUP/รพ.สต. หลายแห่ง, ประวัติคำขอเบิก, กราฟมีข้อมูล) แทนที่จะเป็นระบบว่างเปล่า เพื่อให้พรีเซนต์ได้สวยงาม
- ใช้เวลาราว 15-20 นาที

ใช้ **Vercel** (host ตัวแอป — บริษัทเดียวกับที่สร้าง Next.js ใช้ง่ายที่สุด) + **Neon** (ฐานข้อมูล PostgreSQL ฟรีบนคลาวด์)

---

## ขั้นตอนที่ 1 — สร้างฐานข้อมูลฟรีที่ Neon

1. ไปที่ [neon.tech](https://neon.tech) → สมัครฟรี (ใช้ GitHub login ได้เลย ไม่ต้องกรอกบัตรเครดิต)
2. สร้าง Project ใหม่ ตั้งชื่อ database ว่า `drug_inventory`
3. คัดลอก **Connection string** ที่ Neon ให้มา — **เลือกแบบ "Pooled connection"** (ไม่ใช่ direct) เพราะ Vercel รันแอปแบบ serverless เปิด-ปิด connection บ่อย ถ้าใช้ direct connection อาจเจอปัญหา connection เต็มระหว่างเดโม (หน้าตาจะมีคำว่า `-pooler` อยู่ในชื่อ host เช่น `ep-xxx-pooler.aws.neon.tech`)

## ขั้นตอนที่ 2 — ใส่โครงสร้างฐานข้อมูล + ข้อมูลตัวอย่าง

รันจากเครื่องนี้เลย (แทน `<CONNECTION_STRING>` ด้วยค่าที่คัดลอกมาจาก Neon):

```bash
"C:\Program Files\PostgreSQL\17\bin\psql.exe" "<CONNECTION_STRING>" -f "D:\try appa\db\schema.sql"
```

จากนั้นใส่ข้อมูลตัวอย่าง (CUP/รพ.สต./ยา/ประวัติคำขอเบิกแบบสุ่ม ให้ระบบดูมีชีวิตชีวาตอนเดโม):

```bash
cd "D:\try appa\web"
DATABASE_URL="<CONNECTION_STRING>" node scripts/seed.mjs
```

> อยากได้บัญชีจริงของหน่วยงานคุณเองแทนข้อมูลสมมติ ใช้ `bootstrap.mjs` แทนขั้นตอนนี้ (ดูใน [DEPLOY.md](DEPLOY.md)) แล้วไปเพิ่มหน่วยงาน/บัญชีเองผ่านหน้าเว็บทีหลัง

## ขั้นตอนที่ 3 — เอาโค้ดขึ้น GitHub

Vercel deploy จาก GitHub repo เท่านั้น ถ้ายังไม่มี repo:

```bash
cd "D:\try appa"
git init
git add web db
git commit -m "ระบบจัดการคลังยา"
```

แล้วสร้าง repo เปล่าที่ [github.com/new](https://github.com/new) (ตั้งเป็น Private ก็ได้) และ push:

```bash
git remote add origin <URL repo ที่สร้าง>
git push -u origin main
```

## ขั้นตอนที่ 4 — Deploy ที่ Vercel

1. ไปที่ [vercel.com](https://vercel.com) → สมัครฟรีด้วย GitHub account เดียวกัน
2. "Add New Project" → เลือก repo ที่เพิ่ง push
3. **สำคัญ**: ในหน้าตั้งค่า ช่อง **Root Directory** ให้เลือก `web` (เพราะโค้ด Next.js อยู่ในโฟลเดอร์ย่อย ไม่ใช่ root ของ repo)
4. ใส่ Environment Variables 2 ตัว:
   - `DATABASE_URL` = connection string จาก Neon (ขั้นตอนที่ 1)
   - `AUTH_SECRET` = ค่าสุ่มปลอดภัย (รันคำสั่ง `openssl rand -base64 32` เพื่อสร้าง)
5. กด **Deploy** รอประมาณ 1-2 นาที

เสร็จแล้วจะได้ลิงก์ `https://<ชื่อโปรเจกต์>.vercel.app` ใช้ได้จริงทันที เปิดจากมือถือ/คอมเครื่องไหนก็ได้ ไม่ต้องพึ่ง IP หรือเปิดคอมทิ้งไว้

## เข้าใช้งานตอนนำเสนอ

ถ้าใช้ `seed.mjs` ในขั้นตอนที่ 2 จะมีบัญชีตัวอย่างให้ล็อกอินโชว์ได้เลย (รหัสผ่านเดียวกันหมด `password123`):

- `province.admin` — มุมมอง อบจ. (แดชบอร์ด, กราฟ, อนุมัติคำขอ, จัดการหน่วยงาน)
- `11.manager` — มุมมอง CUP (พิจารณาคำขอจาก รพ.สต.)
- `101.requester` — มุมมอง รพ.สต. (เบิกยา, จ่ายยาให้ผู้ป่วย)

## ข้อควรรู้ (ข้อจำกัดของฟรีทาง)

- Neon free tier: ฐานข้อมูลจะ "sleep" ถ้าไม่มีการใช้งานนาน — พอมีคนเข้าเว็บจะตื่นเองใน 1-2 วินาที ไม่มีปัญหาระหว่างเดโม
- เหมาะสำหรับ "โชว์ว่าใช้งานได้จริง" เท่านั้น **ไม่ควรใช้เก็บข้อมูลสต็อกยาจริงระยะยาว** เพราะไม่มี SLA/backup ที่รับประกัน — พอได้ไฟเขียวจากที่นำเสนอแล้ว ค่อยย้ายไปตั้งค่าแบบถาวรตาม [DEPLOY.md](DEPLOY.md)
