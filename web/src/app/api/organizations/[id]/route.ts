import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTrustedUser } from "@/lib/auth";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getTrustedUser(request);
  if (!user || user.role !== "PROVINCE_ADMIN") {
    return NextResponse.json({ error: "เฉพาะ อบจ. เท่านั้นที่ลบหน่วยงานได้" }, { status: 403 });
  }

  const { id } = await params;
  const client = await pool.connect();
  try {
    const orgRes = await client.query(`SELECT type, name FROM organizations WHERE id = $1`, [id]);
    const org = orgRes.rows[0];
    if (!org) {
      return NextResponse.json({ error: "ไม่พบหน่วยงานนี้" }, { status: 404 });
    }
    if (org.type === "PROVINCE") {
      return NextResponse.json({ error: "ไม่สามารถลบหน่วยงาน อบจ. ได้" }, { status: 400 });
    }

    const childRes = await client.query(
      `SELECT count(*)::int AS n FROM organizations WHERE parent_org_id = $1`,
      [id]
    );
    if (childRes.rows[0].n > 0) {
      return NextResponse.json(
        { error: `ยังมีหน่วยงานย่อยสังกัดอยู่ ${childRes.rows[0].n} แห่ง กรุณาลบหน่วยงานย่อยก่อน` },
        { status: 409 }
      );
    }

    const userRes = await client.query(`SELECT count(*)::int AS n FROM users WHERE org_id = $1`, [
      id,
    ]);
    if (userRes.rows[0].n > 0) {
      return NextResponse.json(
        { error: `ยังมีบัญชีผู้ใช้สังกัดอยู่ ${userRes.rows[0].n} บัญชี กรุณาลบบัญชีเหล่านั้นก่อน` },
        { status: 409 }
      );
    }

    const reqRes = await client.query(
      `SELECT count(*)::int AS n FROM requisitions WHERE requester_org_id = $1 OR target_org_id = $1`,
      [id]
    );
    if (reqRes.rows[0].n > 0) {
      return NextResponse.json(
        { error: "หน่วยงานนี้มีประวัติคำขอเบิกยาอยู่ ไม่สามารถลบได้" },
        { status: 409 }
      );
    }

    const dispenseRes = await client.query(
      `SELECT count(*)::int AS n FROM dispensing_events WHERE org_id = $1`,
      [id]
    );
    if (dispenseRes.rows[0].n > 0) {
      return NextResponse.json(
        { error: "หน่วยงานนี้มีประวัติการจ่ายยาอยู่ ไม่สามารถลบได้" },
        { status: 409 }
      );
    }

    const stockRes = await client.query(
      `SELECT count(*)::int AS n FROM stock_lots sl
       JOIN warehouses w ON w.id = sl.warehouse_id
       WHERE w.org_id = $1 AND sl.qty_on_hand > 0`,
      [id]
    );
    if (stockRes.rows[0].n > 0) {
      return NextResponse.json(
        { error: "คลังของหน่วยงานนี้ยังมีสต็อกยาคงเหลืออยู่ ไม่สามารถลบได้" },
        { status: 409 }
      );
    }

    await client.query("BEGIN");
    await client.query(
      `DELETE FROM stock_ledger WHERE warehouse_id IN (SELECT id FROM warehouses WHERE org_id = $1)`,
      [id]
    );
    await client.query(
      `DELETE FROM stock_lots WHERE warehouse_id IN (SELECT id FROM warehouses WHERE org_id = $1)`,
      [id]
    );
    await client.query(`DELETE FROM integration_keys WHERE org_id = $1`, [id]);
    await client.query(`DELETE FROM warehouses WHERE org_id = $1`, [id]);
    await client.query(`DELETE FROM organizations WHERE id = $1`, [id]);
    await client.query("COMMIT");

    return NextResponse.json({ ok: true, name: org.name });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
