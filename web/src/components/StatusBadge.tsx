const DOT: Record<string, string> = {
  DRAFT: "bg-muted",
  PENDING_CUP_APPROVAL: "bg-amber-500",
  PENDING_PROVINCE_APPROVAL: "bg-amber-500",
  CUP_APPROVED: "bg-accent",
  PROVINCE_APPROVED: "bg-accent",
  IN_TRANSIT: "bg-accent",
  ARRIVED_PENDING_CONFIRM: "bg-accent",
  CLOSED: "bg-emerald-500",
  REJECTED: "bg-red-500",
  CANCELLED: "bg-red-500",
  DISCREPANCY_OPEN: "bg-orange-500",
};

const LABELS: Record<string, string> = {
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

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-chip px-2.5 py-1 text-[12.5px] font-medium tracking-tight text-foreground">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[status] ?? "bg-muted"}`} />
      {LABELS[status] ?? status}
    </span>
  );
}
