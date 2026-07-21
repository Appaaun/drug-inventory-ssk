import pg from "pg";
import bcrypt from "bcryptjs";

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://postgres:devpassword@localhost:5432/drug_inventory",
});

// รหัสผ่านเดโมเดียวกันทุกบัญชี — ใช้เพื่อทดสอบเท่านั้น ห้ามใช้ pattern นี้ใน production
const DEMO_PASSWORD_HASH = await bcrypt.hash("password123", 10);

const PROVINCE_ID = "00000000-0000-0000-0000-000000000001";
const CUPS = [
  { id: "00000000-0000-0000-0000-000000000011", name: "รพ.แม่ข่าย เมือง A (CUP)" },
  { id: "00000000-0000-0000-0000-000000000012", name: "รพ.แม่ข่าย เมือง B (CUP)" },
];
const PCUS = [
  { id: "00000000-0000-0000-0000-000000000101", name: "รพ.สต.บ้านหนองบัว", cup: 0 },
  { id: "00000000-0000-0000-0000-000000000102", name: "รพ.สต.บ้านสวนผึ้ง", cup: 0 },
  { id: "00000000-0000-0000-0000-000000000103", name: "รพ.สต.บ้านโป่ง", cup: 0 },
  { id: "00000000-0000-0000-0000-000000000104", name: "รพ.สต.บ้านไร่", cup: 1 },
  { id: "00000000-0000-0000-0000-000000000105", name: "รพ.สต.บ้านทุ่ง", cup: 1 },
];
const DRUGS = [
  { code: "TMT-00000001", name: "Paracetamol 500mg", unit: "TAB" },
  { code: "TMT-00000002", name: "Amoxicillin 500mg", unit: "CAP" },
  { code: "TMT-00000003", name: "ORS ผงเกลือแร่", unit: "SACHET" },
  { code: "TMT-00000004", name: "Cetirizine 10mg", unit: "TAB" },
  { code: "TMT-00000005", name: "Metformin 500mg", unit: "TAB" },
  { code: "TMT-00000006", name: "Amlodipine 5mg", unit: "TAB" },
  { code: "TMT-00000007", name: "Omeprazole 20mg", unit: "CAP" },
  { code: "TMT-00000008", name: "Tramadol 50mg", unit: "CAP", controlled: true },
];

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // reset (dev-only, re-runnable)
    await client.query(
      `TRUNCATE discrepancies, dispensing_events, requisition_items, requisitions,
                stock_ledger, stock_lots, drug_code_mapping, warehouses,
                users, roles, drugs, organizations RESTART IDENTITY CASCADE`
    );

    // roles
    const roleRes = await client.query(
      `INSERT INTO roles (name, permissions) VALUES
        ('PROVINCE_ADMIN','[]'), ('CUP_MANAGER','[]'),
        ('PCU_REQUESTER','[]'), ('PCU_DISPENSER','[]')
       RETURNING id, name`
    );
    const roleId = Object.fromEntries(roleRes.rows.map((r) => [r.name, r.id]));

    // organizations: province -> cups -> pcus
    await client.query(
      `INSERT INTO organizations (id, name, type, parent_org_id) VALUES ($1,$2,'PROVINCE',NULL)`,
      [PROVINCE_ID, "องค์การบริหารส่วนจังหวัดศรีสะเกษ"]
    );
    for (const cup of CUPS) {
      await client.query(
        `INSERT INTO organizations (id, name, type, parent_org_id) VALUES ($1,$2,'CUP',$3)`,
        [cup.id, cup.name, PROVINCE_ID]
      );
    }
    for (const pcu of PCUS) {
      await client.query(
        `INSERT INTO organizations (id, name, type, parent_org_id) VALUES ($1,$2,'PCU',$3)`,
        [pcu.id, pcu.name, CUPS[pcu.cup].id]
      );
    }

    // users (one per org, enough to satisfy created_by/dispensed_by FKs)
    // รหัสผ่านเดโมของทุกบัญชี: password123
    await client.query(
      `INSERT INTO users (id, org_id, role_id, username, password_hash) VALUES ($1,$2,$3,$4,$5)`,
      ["10000000-0000-0000-0000-000000000001", PROVINCE_ID, roleId.PROVINCE_ADMIN, "province.admin", DEMO_PASSWORD_HASH]
    );
    for (const cup of CUPS) {
      await client.query(
        `INSERT INTO users (id, org_id, role_id, username, password_hash) VALUES ($1,$2,$3,$4,$5)`,
        ["1" + cup.id.slice(1), cup.id, roleId.CUP_MANAGER, `${cup.id.slice(-2)}.manager`, DEMO_PASSWORD_HASH]
      );
    }
    for (const pcu of PCUS) {
      await client.query(
        `INSERT INTO users (id, org_id, role_id, username, password_hash) VALUES ($1,$2,$3,$4,$5)`,
        ["1" + pcu.id.slice(1), pcu.id, roleId.PCU_REQUESTER, `${pcu.id.slice(-3)}.requester`, DEMO_PASSWORD_HASH]
      );
    }

    // warehouses (warehouse id == org id, for simplicity)
    await client.query(
      `INSERT INTO warehouses (id, org_id, name, type) VALUES ($1,$1,$2,'PROVINCIAL')`,
      [PROVINCE_ID, "คลังยาจังหวัด"]
    );
    for (const cup of CUPS) {
      await client.query(
        `INSERT INTO warehouses (id, org_id, name, type) VALUES ($1,$1,$2,'CUP')`,
        [cup.id, `คลังยา ${cup.name}`]
      );
    }
    for (const pcu of PCUS) {
      await client.query(
        `INSERT INTO warehouses (id, org_id, name, type) VALUES ($1,$1,$2,'PCU')`,
        [pcu.id, `คลังยา ${pcu.name}`]
      );
    }

    // drugs
    for (const d of DRUGS) {
      await client.query(
        `INSERT INTO drugs (drug_code, generic_name, unit, controlled_flag) VALUES ($1,$2,$3,$4)`,
        [d.code, d.name, d.unit, !!d.controlled]
      );
    }

    // helper: receive stock into a warehouse via the ledger (mirrors POST /inventory/receipts)
    async function receiveStock(warehouseId, drugCode, lotNo, expiryDate, qty, unitCost, createdBy, createdAt) {
      await client.query(
        `INSERT INTO stock_lots (warehouse_id, drug_code, lot_no, expiry_date, qty_on_hand, unit_cost)
         VALUES ($1,$2,$3,$4,0,$5)
         ON CONFLICT (warehouse_id, drug_code, lot_no) DO NOTHING`,
        [warehouseId, drugCode, lotNo, expiryDate, unitCost]
      );
      const cur = await client.query(
        `SELECT qty_on_hand FROM stock_lots WHERE warehouse_id=$1 AND drug_code=$2 AND lot_no=$3`,
        [warehouseId, drugCode, lotNo]
      );
      const newBalance = Number(cur.rows[0].qty_on_hand) + qty;
      await client.query(
        `INSERT INTO stock_ledger (warehouse_id, drug_code, lot_no, txn_type, qty, balance_after, ref_type, created_by, created_at)
         VALUES ($1,$2,$3,'RECEIPT',$4,$5,'RECEIPT',$6,$7)`,
        [warehouseId, drugCode, lotNo, qty, newBalance, createdBy, createdAt]
      );
    }

    // province: large stock of every drug
    for (const d of DRUGS) {
      await receiveStock(
        PROVINCE_ID,
        d.code,
        "LOT2026A",
        "2028-06-30",
        randInt(8000, 20000),
        1.5,
        "10000000-0000-0000-0000-000000000001",
        daysAgo(75)
      );
    }

    // each PCU: stock of a random subset of 4-6 drugs
    for (const pcu of PCUS) {
      const subset = [...DRUGS].sort(() => Math.random() - 0.5).slice(0, randInt(4, 6));
      for (const d of subset) {
        await receiveStock(
          pcu.id,
          d.code,
          "LOT2026A",
          "2027-12-31",
          randInt(30, 300),
          1.5,
          "1" + pcu.id.slice(1),
          daysAgo(randInt(10, 60))
        );
      }
    }

    // requisitions: history spread over the last ~75 days
    const statuses = [
      ...Array(6).fill("CLOSED"),
      "PENDING_CUP_APPROVAL",
      "PENDING_CUP_APPROVAL",
      "CUP_APPROVED",
      "REJECTED",
    ];
    let reqCount = 0;
    for (const pcu of PCUS) {
      const numReq = randInt(5, 9);
      for (let i = 0; i < numReq; i++) {
        const status = pick(statuses);
        const createdAt = daysAgo(randInt(1, 74));
        const reqRes = await client.query(
          `INSERT INTO requisitions (requester_org_id, target_org_id, status, priority, created_by, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id`,
          [
            pcu.id,
            CUPS[pcu.cup].id,
            status,
            Math.random() < 0.15 ? "urgent" : "normal",
            "1" + pcu.id.slice(1),
            createdAt,
          ]
        );
        const reqId = reqRes.rows[0].id;
        const numItems = randInt(1, 3);
        const chosenDrugs = [...DRUGS].sort(() => Math.random() - 0.5).slice(0, numItems);
        for (const d of chosenDrugs) {
          const qtyRequested = randInt(20, 200);
          const qtyApproved =
            status === "REJECTED" ? null : status === "PENDING_CUP_APPROVAL" ? null : qtyRequested;
          const qtyReceived = status === "CLOSED" ? qtyApproved : null;
          await client.query(
            `INSERT INTO requisition_items (requisition_id, drug_code, qty_requested, qty_approved, qty_received, lot_no)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [reqId, d.code, qtyRequested, qtyApproved, qtyReceived, qtyReceived ? "LOT2026A" : null]
          );
        }
        reqCount++;
      }
    }

    await client.query("COMMIT");
    console.log(`Seed complete: ${PCUS.length} PCUs, ${DRUGS.length} drugs, ${reqCount} requisitions`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
