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
  if (!user || user.role !== "CUP_MANAGER") {
    return NextResponse.json({ error: "เฉพาะ CUP เท่านั้นที่ export ข้อมูลนี้ได้" }, { status: 403 });
  }

  const { rows } = await pool.query(
    `SELECT r.created_at AS "วันที่", ro.name AS "รพ.สต.", r.status AS status,
            r.priority AS "ความสำคัญ", d.generic_name AS "ยา",
            ri.qty_requested AS "จำนวนที่ขอ", ri.qty_approved AS "จำนวนที่อนุมัติ",
            ri.qty_received AS "จำนวนที่รับจริง"
     FROM requisitions r
     JOIN organizations ro ON ro.id = r.requester_org_id
     JOIN requisition_items ri ON ri.requisition_id = r.id
     JOIN drugs d ON d.drug_code = ri.drug_code
     WHERE r.target_org_id = $1
     ORDER BY r.created_at DESC`,
    [user.orgId]
  );

  const requisitionRows = rows.map((r) => ({
    วันที่: r["วันที่"],
    "รพ.สต.": r["รพ.สต."],
    สถานะ: STATUS_LABELS[r.status as string] ?? r.status,
    ความสำคัญ: r["ความสำคัญ"],
    ยา: r["ยา"],
    จำนวนที่ขอ: r["จำนวนที่ขอ"],
    จำนวนที่อนุมัติ: r["จำนวนที่อนุมัติ"],
    จำนวนที่รับจริง: r["จำนวนที่รับจริง"],
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(requisitionRows), "คำขอเบิกยาจาก รพ.สต.");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `cup-export-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
