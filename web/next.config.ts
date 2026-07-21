import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" มีไว้สำหรับ Docker/self-host เท่านั้น (ดู Dockerfile) — ถ้าใส่ไว้ตอน deploy บน Vercel
  // จะไปชนกับ build pipeline ของ Vercel เอง ทำให้ route หายกลายเป็น 404 จึงเปิดใช้เฉพาะตอน build ผ่าน Docker
  ...(process.env.DOCKER_BUILD === "true" ? { output: "standalone" as const } : {}),
};

export default nextConfig;
