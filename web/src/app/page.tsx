import Link from "next/link";
import CurvedLines from "@/components/CurvedLines";

function IconPcu() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" strokeWidth={1.5}>
      <path
        d="M4 21V9.5L12 4l8 5.5V21"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 21v-6h6v6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 9v4M10 11h4" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function IconCup() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" strokeWidth={1.5}>
      <circle cx="12" cy="5" r="2.2" stroke="currentColor" />
      <circle cx="5" cy="19" r="2.2" stroke="currentColor" />
      <circle cx="19" cy="19" r="2.2" stroke="currentColor" />
      <path
        d="M12 7.2V12M12 12L6.4 17.2M12 12l5.6 5.2"
        stroke="currentColor"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconAdmin() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" strokeWidth={1.5}>
      <path
        d="M4 20V10M11 20V4M18 20v-7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 20h18" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

const TICKER_ITEMS = [
  "จัดการสต็อกยา",
  "เบิก-อนุมัติออนไลน์",
  "แจ้งเตือนสต็อกใกล้หมด",
  "ส่งออกรายงาน Excel",
  "รองรับหลายหน่วยงาน",
];

function Ticker() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS, ...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div className="ticker-mask mt-8 w-full max-w-md overflow-hidden">
      <div className="ticker-track flex w-max items-center gap-2.5">
        {items.map((item, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-chip px-3.5 py-1.5 text-[13px] font-medium text-muted"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

const roles = [
  {
    href: "/pcu",
    icon: IconPcu,
    eyebrow: "รพ.สต.",
    title: "เบิกยา และดูสต็อก",
    body: "ส่งคำขอเบิกยาไปยัง CUP ต้นสังกัด และติดตามสต็อกคงเหลือของหน่วยบริการแบบเรียลไทม์",
  },
  {
    href: "/cup",
    icon: IconCup,
    eyebrow: "CUP",
    title: "พิจารณาคำขอเบิก",
    body: "รับคำขอจาก รพ.สต. ในเครือ กลั่นกรองก่อนส่งต่อให้ อบจ. อนุมัติจัดสรรจากคลังกลาง",
  },
  {
    href: "/admin",
    icon: IconAdmin,
    eyebrow: "อบจ.ศรีสะเกษ",
    title: "บริหารคลังยากลาง",
    body: "ภาพรวมสต็อก มูลค่า แนวโน้มการเบิก และอนุมัติจัดสรรยาให้ทุกหน่วยบริการในสังกัด",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="relative flex flex-col items-center overflow-hidden px-6 pt-28 pb-20 text-center sm:pt-36 sm:pb-28">
        <CurvedLines side="left" />
        <CurvedLines side="right" />

        <p className="relative text-[13px] font-semibold tracking-tight text-muted uppercase">
          องค์การบริหารส่วนจังหวัดศรีสะเกษ
        </p>
        <h1
          className="relative mt-4 max-w-3xl text-[44px] font-semibold text-foreground sm:text-[68px]"
          style={{ letterSpacing: "-0.045em", lineHeight: 1.05 }}
        >
          ระบบจัดการ<span className="brand-serif text-[44px] sm:text-[68px]">คลังยา</span>
        </h1>
        <p className="relative mt-5 max-w-xl text-balance text-lg text-muted sm:text-xl">
          เชื่อมข้อมูลสต็อกยาตั้งแต่คลังกลาง อบจ. ไปจนถึง รพ.สต. ทุกแห่งในสังกัด
          ไว้ในที่เดียว
        </p>

        <Ticker />

        <Link
          href="/login"
          className="relative mt-9 rounded-full bg-accent px-7 py-3 text-[15px] font-medium text-white transition hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-[0_4px_20px_rgba(0,0,0,0.15)] active:scale-[0.98]"
        >
          เข้าสู่ระบบ
        </Link>
      </section>

      <section className="mx-auto w-full max-w-5xl px-6 pb-28">
        <div className="grid gap-4 sm:grid-cols-3">
          {roles.map(({ href, icon: Icon, eyebrow, title, body }) => (
            <Link
              key={href}
              href={href}
              className="group relative overflow-hidden rounded-2xl border border-line/70 bg-surface p-7 transition hover:-translate-y-1 hover:border-line hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)]"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-black/[0.04] text-foreground transition group-hover:bg-accent group-hover:text-white">
                <Icon />
              </div>
              <p className="mt-5 text-[13px] font-semibold tracking-tight text-muted uppercase">
                {eyebrow}
              </p>
              <h2 className="mt-1 text-[19px] font-semibold tracking-tight text-foreground">
                {title}
              </h2>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">{body}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-[14px] font-medium text-accent">
                เปิดใช้งาน
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-3.5 w-3.5 transition group-hover:translate-x-0.5"
                >
                  <path
                    d="M9 6l6 6-6 6"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
