// เส้นโค้งตกแต่งแบบเว็บ Alwayzz — ใช้ซ้ำได้ทุกหน้า ปรับขนาด/จำนวนได้ตามพื้นที่ของแต่ละหน้า
export default function CurvedLines({
  side,
  count = 10,
  lineHeight = 380,
  startWidth = 44,
  widthStep = 12,
}: {
  side: "left" | "right";
  count?: number;
  lineHeight?: number;
  startWidth?: number;
  widthStep?: number;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 hidden w-64 overflow-hidden sm:block"
      aria-hidden="true"
      style={side === "left" ? { left: 0 } : { right: 0 }}
    >
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={`curved-line ${side === "left" ? "curved-line-left" : "curved-line-right"}`}
          style={{
            [side]: 0,
            width: `${startWidth + i * widthStep}px`,
            height: `${lineHeight}px`,
            marginTop: `${-lineHeight / 2}px`,
            animationDelay: `${i * 0.3}s`,
          }}
        />
      ))}
    </div>
  );
}
