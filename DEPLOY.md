# นำระบบขึ้นใช้งานจริง (Production Deployment)

ตอนนี้ระบบรันอยู่บนเครื่องคอมพิวเตอร์ส่วนตัว (`npm run dev`) ซึ่งใช้งานได้เฉพาะตอนเครื่องเปิดอยู่ และ IP
เปลี่ยนทุกครั้งที่เชื่อมต่อ network ใหม่ — ไม่เหมาะกับการใช้งานจริงที่ รพ.สต. หลายแห่งต้องเข้าถึงจากคนละสถานที่คนละ network

เอกสารนี้คือขั้นตอนย้ายระบบไปรันบนเซิร์ฟเวอร์ (VPS) ที่เปิดตลอด 24 ชม. มีที่อยู่ (โดเมน) คงที่ และเข้าถึงได้จากอินเทอร์เน็ตอย่างปลอดภัย (HTTPS)

## สิ่งที่ต้องมีก่อนเริ่ม

1. **VPS (เซิร์ฟเวอร์เช่า)** — สเปกขั้นต่ำ 1-2 vCPU / 2GB RAM ก็เพียงพอสำหรับขนาดหน่วยงานนี้
   ตัวเลือกที่ราคาย่อมเยา: DigitalOcean, Vultr, Linode, AWS Lightsail (ประมาณ 200-400 บาท/เดือน)
   ถ้าต้องการข้อมูลอยู่ในประเทศไทยตามระเบียบราชการ: ลองผู้ให้บริการ Thai Cloud เช่น G-Cloud (สพร.), CAT Cloud, TrueIDC
2. **โดเมนหรือ subdomain** — เช่น `drug-inventory.ssk-pao.go.th` (ขอ subdomain จากหน่วยงาน IT ของ อบจ. ได้)
3. เข้าถึง VPS ผ่าน SSH ได้ (ผู้ให้บริการ VPS จะส่งข้อมูลนี้ให้หลังสมัคร)

## ขั้นตอนที่ 1 — ติดตั้ง Docker บน VPS

```bash
curl -fsSL https://get.docker.com | sh
```

## ขั้นตอนที่ 2 — คัดลอกโค้ดขึ้นเซิร์ฟเวอร์

```bash
git clone <URL ของ repo นี้> drug-inventory
cd drug-inventory
```

(ถ้ายังไม่มี git repo ให้สร้างก่อน หรือใช้ `scp`/`rsync` คัดลอกทั้งโฟลเดอร์ `db/`, `web/`, `docker-compose.prod.yml` ขึ้นไปแทนได้)

## ขั้นตอนที่ 3 — ตั้งค่ารหัสผ่าน/secret

```bash
cp .env.production.example .env
```

แก้ไฟล์ `.env` ใส่ค่าจริง — **ห้ามใช้ค่าเดียวกับตอน dev เด็ดขาด**:

```bash
openssl rand -base64 32   # รันคำสั่งนี้ 2 ครั้งเพื่อสุ่มค่า DB_PASSWORD และ AUTH_SECRET
```

## ขั้นตอนที่ 4 — เปิดระบบ

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

ครั้งแรกจะสร้างฐานข้อมูลเปล่าตามโครงสร้างใน `db/schema.sql` โดยอัตโนมัติ

## ขั้นตอนที่ 5 — สร้างบัญชีผู้ดูแลคนแรก (ทำครั้งเดียว)

ฐานข้อมูลใหม่ยังไม่มีหน่วยงาน/บัญชีผู้ใช้เลย ต้องสร้างบัญชี อบจ. คนแรกก่อนถึงจะ login เข้าไปเพิ่ม CUP/รพ.สต./บัญชีอื่นๆ ผ่านหน้าเว็บได้:

```bash
docker compose -f docker-compose.prod.yml exec web \
  node scripts/bootstrap.mjs "องค์การบริหารส่วนจังหวัดศรีสะเกษ" admin "ตั้งรหัสผ่านที่ปลอดภัยตรงนี้"
```

จากนั้น login ด้วยบัญชีนี้ แล้วไปที่แท็บ **"หน่วยงาน & บัญชีผู้ใช้"** ในหน้า admin เพื่อเพิ่ม CUP, รพ.สต., และบัญชีผู้ใช้จริงของแต่ละหน่วยงานต่อได้เลย (ไม่ต้องแตะฐานข้อมูลตรงๆ อีก)

## ขั้นตอนที่ 6 — ทำ HTTPS + ผูกโดเมน (สำคัญ — ห้ามข้าม)

ใช้ [Caddy](https://caddyserver.com/) ซึ่งขอใบรับรอง HTTPS (Let's Encrypt) ให้อัตโนมัติ ไม่ต้องตั้งค่าอะไรเพิ่ม:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

แก้ไฟล์ `/etc/caddy/Caddyfile` ให้เหลือแค่:

```
drug-inventory.ssk-pao.go.th {
    reverse_proxy localhost:3000
}
```

(แทนที่โดเมนด้วยของจริง แล้วต้องชี้ DNS ของโดเมนนั้นมาที่ IP ของ VPS ก่อน — เพิ่ม A record ที่ผู้ดูแล DNS ของหน่วยงาน)

```bash
sudo systemctl restart caddy
```

เท่านี้ระบบจะเข้าถึงได้ผ่าน `https://drug-inventory.ssk-pao.go.th` จากทุกที่ ทุก รพ.สต. โดยไม่ต้องพึ่ง IP หรือเปิดคอมทิ้งไว้อีกต่อไป

## การสำรองข้อมูล (Backup)

ตั้ง cron job สำรองฐานข้อมูลรายวัน เพราะเป็นข้อมูลสต็อกยาจริงที่ห้ามหาย:

```bash
# เพิ่มใน crontab -e
0 2 * * * docker compose -f /path/to/drug-inventory/docker-compose.prod.yml exec -T db pg_dump -U postgres drug_inventory | gzip > /backups/drug-inventory-$(date +\%Y\%m\%d).sql.gz
```

## อัปเดตระบบในอนาคต

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

(ฐานข้อมูลจะไม่ถูกลบ เพราะเก็บอยู่ใน Docker volume แยกต่างหาก)
