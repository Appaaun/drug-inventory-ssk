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

export async function GET(request: Request) {
  const user = getTrustedUser(request);
  if (!user || user.orgType !== "PCU") {
    return NextResponse.json({ error: "เฉพาะ รพ.สต. เท่านั้นที่ export ข้อมูลนี้ได้" }, { status: 403 });
  }

  const [stock, dispensing, requisitions] = await Promise.all([
    pool.query(
      `SELECT d.generic_name AS "ชื่อยา", sl.lot_no AS "Lot", sl.expiry_date AS "วันหมดอายุ",
              sl.qty_on_hand AS "คงเหลือ"
       FROM stock_lots sl
       JOIN warehouses w ON w.id = sl.warehouse_id
       JOIN drugs d ON d.drug_code = sl.drug_code
       WHERE w.org_id = $1
       ORDER BY d.generic_name, sl.expiry_date`,
      [user.orgId]
    ),
    pool.query(
      `SELECT de.dispensed_at AS "วันที่", de.encounter_ref AS "รหัสอ้างอิงผู้ป่วย",
              d.generic_name AS "ยา", de.lot_no AS "Lot", de.qty_dispensed AS "จำนวน"
       FROM dispensing_events de
       JOIN drugs d ON d.drug_code = de.drug_code
       WHERE de.org_id = $1
       ORDER BY de.dispensed_at DESC`,
      [user.orgId]
    ),
    pool.query(
      `SELECT r.created_at AS "วันที่", ta.name AS "ส่งไปที่", r.status AS status,
              r.priority AS "ความสำคัญ", d.generic_name AS "ยา",
              ri.qty_requested AS "จำนวนที่ขอ", ri.qty_approved AS "จำนวนที่อนุมัติ",
              ri.qty_received AS "จำนวนที่รับจริง"
       FROM requisitions r
       JOIN organizations ta ON ta.id = r.target_org_id
       JOIN requisition_items ri ON ri.requisition_id = r.id
       JOIN drugs d ON d.drug_code = ri.drug_code
       WHERE r.requester_org_id = $1
       ORDER BY r.created_at DESC`,
      [user.orgId]
    ),
  ]);

  const requisitionRows = requisitions.rows.map((r) => ({
    วันที่: r["วันที่"],
    ส่งไปที่: r["ส่งไปที่"],
    สถานะ: STATUS_LABELS[r.status as string] ?? r.status,
    ความสำคัญ: r["ความสำคัญ"],
    ยา: r["ยา"],
    จำนวนที่ขอ: r["จำนวนที่ขอ"],
    จำนวนที่อนุมัติ: r["จำนวนที่อนุมัติ"],
    จำนวนที่รับจริง: r["จำนวนที่รับจริง"],
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stock.rows), "สต็อกคงเหลือ");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dispensing.rows), "ประวัติการจ่ายยา");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(requisitionRows), "ประวัติคำขอเบิก");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `pcu-export-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
