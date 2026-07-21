// เกณฑ์ระดับสต็อก: แดง = วิกฤต ต้องเติมด่วน, ส้ม = ใกล้หมด, เขียว = ปกติ
const CRITICAL_BELOW = 30;
const LOW_BELOW = 80;

export function stockLevel(qty: number): "critical" | "low" | "normal" {
  if (qty < CRITICAL_BELOW) return "critical";
  if (qty < LOW_BELOW) return "low";
  return "normal";
}

const STYLE: Record<string, { dot: string; text: string }> = {
  critical: { dot: "bg-red-500", text: "text-red-600" },
  low: { dot: "bg-amber-500", text: "text-amber-600" },
  normal: { dot: "bg-emerald-500", text: "text-foreground" },
};

export default function StockLevelBadge({ qty }: { qty: number }) {
  const level = stockLevel(qty);
  const style = STYLE[level];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-chip px-2.5 py-1 text-[13px] font-medium tracking-tight ${style.text}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
      {qty.toLocaleString()}
    </span>
  );
}
