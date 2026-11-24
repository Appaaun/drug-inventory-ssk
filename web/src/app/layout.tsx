import type { Metadata } from "next";
// ฟอนต์ฝังไว้ในโปรเจกต์ (แพ็กเกจ fontsource) ไม่ดึงจาก Google ตอน build — เคยทำให้ build บน Vercel ล้มเหลว
import "@fontsource-variable/inter";
import "@fontsource-variable/source-serif-4";
import "@fontsource-variable/source-serif-4/wght-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "ระบบจัดการคลังยา — อบจ.ศรีสะเกษ",
  description: "ระบบจัดการคลังยาในสังกัดองค์การบริหารส่วนจังหวัดศรีสะเกษ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      className="h-full antialiased"
    >
      <body className="flex min-h-full flex-col bg-background text-foreground font-sans">
        {children}
      </body>
    </html>
  );
}
