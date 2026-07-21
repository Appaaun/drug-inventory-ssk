import * as XLSX from "xlsx";
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTrustedUser } from "@/lib/auth";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "ร่าง",
  PENDING_CUP_APPROVAL: "รอ CUP พิจารณา",
  PENDING_PROVINCE_APPROVAL: "รออนุมัติ (อบจ.)",
  CUP_APPROVED: "อนุมัติแล้ว",
  PROVINCE_APPROVED: "อนุมัติแล้ว (อบจ.)",
  IN_TRANSIT: "กำลังจัดส่ง",
  ARRIVED_PENDING_CONFIRM: "รอตรวจรับ",
  CLOSED: "สำเร็จ",
  REJECTED: "ปฏิเสธ",
  CANCELLED: "ยกเลิก",
  DISCREPANCY_OPEN: "พบความคลาดเคลื่อน",
};

const ROLE_LABELS: Record<string, string> = {
  PROVINCE_ADMIN: "ผู้ดูแล อบจ.",
  CUP_MANAGER: "ผู้จัดการ CUP",
  PCU_REQUESTER: "เจ้าหน้าที่ รพ.สต.",
};

export async function GET(request: Request) {
  const user = getTrustedUser(request);
  if (!user || user.role !== "PROVINCE_ADMIN") {
    return NextResponse.json({ error: "เฉพาะ อบจ. เท่านั้นที่ export ข้อมูลนี้ได้" }, { status: 403 });
  }

  const [drugs, stock, receipts, requisitions, orgs, users] = await Promise.all([
    pool.query(
      `SELECT drug_code AS "รหัสยา", generic_name AS "ชื่อยา", unit AS "หน่วย",
              controlled_flag AS "ยาควบคุม", is_active AS "ใช้งานอยู่"
       FROM drugs ORDER BY generic_name`
    ),
    pool.query(
      `SELECT w.name AS "คลัง", w.type AS "ประเภทคลัง", d.generic_name AS "ชื่อยา",
              sl.lot_no AS "Lot", sl.expiry_date AS "วันหมดอายุ",
              sl.qty_on_hand AS "คงเหลือ", sl.unit_cost AS "ราคาต่อหน่วย"
       FROM stock_lots sl
       JOIN warehouses w ON w.id = sl.warehouse_id
       JOIN drugs d ON d.drug_code = sl.drug_code
       ORDER BY w.type, w.name, d.generic_name`
    ),
    pool.query(
      `SELECT sl.created_at AS "วันที่รับเข้า", w.name AS "คลัง", d.generic_name AS "ชื่อยา",
              sl.lot_no AS "Lot", sl.qty AS "จำนวน", sl.unit_cost AS "ราคาต่อหน่วย"
       FROM stock_ledger sl
       JOIN warehouses w ON w.id = sl.warehouse_id
       JOIN drugs d ON d.drug_code = sl.drug_code
       WHERE sl.txn_type = 'RECEIPT'
       ORDER BY sl.created_at DESC`
    ),
    pool.query(
      `SELECT r.created_at AS "วันที่", ro.name AS "หน่วยงานที่ขอ", ta.name AS "ส่งไปที่",
              r.status AS status, r.priority AS "ความสำคัญ", d.generic_name AS "ยา",
              ri.qty_requested AS "จำนวนที่ขอ", ri.qty_approved AS "จำนวนที่อนุมัติ",
              ri.qty_received AS "จำนวนที่รับจริง"
       FROM requisitions r
       JOIN organizations ro ON ro.id = r.requester_org_id
       JOIN organizations ta ON ta.id = r.target_org_id
       JOIN requisition_items ri ON ri.requisition_id = r.id
       JOIN drugs d ON d.drug_code = ri.drug_code
       ORDER BY r.created_at DESC`
    ),
    pool.query(
      `SELECT o.name AS "ชื่อ", o.type AS "ประเภท", p.name AS "สังกัด"
       FROM organizations o
       LEFT JOIN organizations p ON p.id = o.parent_org_id
       ORDER BY o.type, o.name`
    ),
    pool.query(
      `SELECT u.username AS "ชื่อผู้ใช้", r.name AS role_name, o.name AS "หน่วยงาน",
              u.is_active AS "ใช้งานอยู่", u.created_at AS "สร้างเมื่อ"
       FROM users u
       JOIN roles r ON r.id = u.role_id
       JOIN organizations o ON o.id = u.org_id
       ORDER BY u.created_at DESC`
    ),
  ]);

  const requisitionRows = requisitions.rows.map((r) => ({
    วันที่: r["วันที่"],
    หน่วยงานที่ขอ: r["หน่วยงานที่ขอ"],
    ส่งไปที่: r["ส่งไปที่"],
    สถานะ: STATUS_LABELS[r.status as string] ?? r.status,
    ความสำคัญ: r["ความสำคัญ"],
    ยา: r["ยา"],
    จำนวนที่ขอ: r["จำนวนที่ขอ"],
    จำนวนที่อนุมัติ: r["จำนวนที่อนุมัติ"],
    จำนวนที่รับจริง: r["จำนวนที่รับจริง"],
  }));
  const userRows = users.rows.map((u) => ({
    ชื่อผู้ใช้: u["ชื่อผู้ใช้"],
    บทบาท: ROLE_LABELS[u.role_name as string] ?? u.role_name,
    หน่วยงาน: u["หน่วยงาน"],
    ใช้งานอยู่: u["ใช้งานอยู่"],
    สร้างเมื่อ: u["สร้างเมื่อ"],
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(drugs.rows), "รายการยา");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stock.rows), "สต็อกทั้งหมด");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(receipts.rows), "ประวัติรับยา");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(requisitionRows), "คำขอเบิกยาทั้งหมด");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(orgs.rows), "หน่วยงาน");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(userRows), "บัญชีผู้ใช้");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `drug-inventory-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
