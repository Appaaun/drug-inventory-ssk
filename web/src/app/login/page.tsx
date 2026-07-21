"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CurvedLines from "@/components/CurvedLines";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "เข้าสู่ระบบไม่สำเร็จ");
      return;
    }
    const data = await res.json();
    const home =
      data.role === "PROVINCE_ADMIN" ? "/admin" : data.role === "CUP_MANAGER" ? "/cup" : "/pcu";
    router.push(home);
    router.refresh();
  }

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-16">
      <CurvedLines side="left" count={8} lineHeight={420} />
      <CurvedLines side="right" count={8} lineHeight={420} />

      <div className="relative w-full max-w-[360px]">
        <p className="text-center text-[13px] font-semibold tracking-tight text-muted uppercase">
          อบจ.ศรีสะเกษ
        </p>
        <h1
          className="mt-1.5 text-center text-[32px] font-semibold text-foreground"
          style={{ letterSpacing: "-0.045em" }}
        >
          เข้าสู่<span className="brand-serif text-[32px]">ระบบ</span>
        </h1>

        <form
          onSubmit={handleSubmit}
          className="mt-7 rounded-2xl border border-line/70 bg-surface p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
        >
          <label className="block text-[13px] font-medium text-muted">
            ชื่อผู้ใช้
            <input
              type="text"
              autoFocus
              className="mt-1.5 w-full rounded-lg border border-line bg-background px-3 py-2 text-[15px] text-foreground outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label className="mt-4 block text-[13px] font-medium text-muted">
            รหัสผ่าน
            <input
              type="password"
              className="mt-1.5 w-full rounded-lg border border-line bg-background px-3 py-2 text-[15px] text-foreground outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-5 w-full rounded-full bg-accent py-2.5 text-[15px] font-medium text-white transition hover:bg-accent-hover disabled:opacity-40"
          >
            {submitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>

        {process.env.NODE_ENV !== "production" && (
          <div className="mt-5 rounded-2xl border border-line/70 bg-black/[0.02] p-4 text-[13px] leading-relaxed text-muted">
            <p className="inline-flex items-center gap-1.5 font-medium text-foreground/80">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              บัญชีทดสอบ · รหัสผ่าน password123
            </p>
            <p className="mt-1.5">province.admin — อบจ.ศรีสะเกษ</p>
            <p>11.manager, 12.manager — CUP Manager แต่ละแห่ง</p>
            <p>101.requester … 105.requester — รพ.สต. แต่ละแห่ง</p>
          </div>
        )}
      </div>
    </div>
  );
}
