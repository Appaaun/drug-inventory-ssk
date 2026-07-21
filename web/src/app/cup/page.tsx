"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/TopNav";
import StatusBadge from "@/components/StatusBadge";
import CurvedLines from "@/components/CurvedLines";
import type { Requisition } from "@/lib/types";

type Session = { orgId: string; orgName: string; username: string };

const cardBox = "overflow-hidden rounded-2xl border border-line/70 bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]";
const th = "px-4 py-2.5 text-left text-[12px] font-medium text-muted";
const td = "px-4 py-3 text-[14px]";
const pillPrimary =
  "rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white transition hover:bg-accent-hover disabled:opacity-40";
const pillDanger =
  "rounded-full bg-red-50 px-3.5 py-1.5 text-[13px] font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-40";
const pillNeutral =
  "rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] font-medium text-foreground transition hover:bg-black/[0.04]";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[15px] font-semibold text-foreground">{children}</h2>;
}

export default function CupPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [all, setAll] = useState<Requisition[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");

  const refresh = useCallback(async () => {
    const rows = await fetch("/api/requisitions").then((r) => r.json());
    setAll(rows);
  }, []);

  useEffect(() => {
    (async () => {
      const meRes = await fetch("/api/auth/me");
      if (!meRes.ok) {
        router.push("/login");
        return;
      }
      const me = await meRes.json();
      setSession({ orgId: me.orgId, orgName: me.orgName, username: me.username });
      await refresh();
      setLoading(false);
    })();
  }, [router, refresh]);

  async function act(id: string, action: "approve" | "reject") {
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/requisitions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusyId(null);
    if (!res.ok) {
      const err = await res.json();
      setError(err.error ?? "เกิดข้อผิดพลาด");
    }
    refresh();
  }

  if (loading || !session) {
    return (
      <div className="flex flex-1 items-center justify-center text-[15px] text-muted">
        กำลังโหลด...
      </div>
    );
  }

  const pending = all.filter((r) => r.status === "PENDING_CUP_APPROVAL");
  const history = all.filter((r) => r.status !== "PENDING_CUP_APPROVAL");

  return (
    <>
      <TopNav section={`${session.orgName} · คำขอเบิกจาก รพ.สต.`} username={session.username} />
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="relative flex flex-wrap items-center justify-between gap-3 overflow-hidden py-6">
          <CurvedLines side="left" count={5} lineHeight={110} startWidth={24} widthStep={7} />
          <CurvedLines side="right" count={5} lineHeight={110} startWidth={24} widthStep={7} />
          <h1
            className="relative text-[30px] font-semibold text-foreground"
            style={{ letterSpacing: "-0.035em" }}
          >
            {session.orgName}
          </h1>
          <a href="/api/export/cup" className={`relative ${pillNeutral}`}>
            ส่งออกข้อมูล (Excel)
          </a>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-[14px] text-red-600">
            {error}
          </div>
        )}

        <div className="mt-2 inline-flex flex-wrap gap-1 rounded-full border border-line/70 bg-surface p-1">
          {(
            [
              { key: "pending", label: "คิวรอพิจารณา", count: pending.length },
              { key: "history", label: "ประวัติคำขอ" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium transition ${
                activeTab === tab.key
                  ? "bg-accent text-white"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {tab.label}
              {"count" in tab && tab.count > 0 && (
                <span
                  className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[11px] font-semibold ${
                    activeTab === tab.key ? "bg-white/25 text-white" : "bg-chip text-foreground"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === "pending" && (
        <section className="mt-8">
          <SectionLabel>คิวรอพิจารณา ({pending.length})</SectionLabel>
          <p className="mt-1 text-[13px] text-muted">
            อนุมัติ = ส่งต่อคำขอนี้ให้ อบจ. พิจารณาจัดส่งจากคลังจังหวัด (CUP ไม่มีสต็อกของตัวเองในระบบนี้)
          </p>
          <div className={`mt-3 ${cardBox}`}>
            <table className="w-full">
              <thead className="border-b border-line/70">
                <tr>
                  <th className={th}>วันที่</th>
                  <th className={th}>รพ.สต.</th>
                  <th className={th}>รายการยา</th>
                  <th className={th}>ความสำคัญ</th>
                  <th className={`${th} text-right`}>การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {pending.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[14px] text-muted">
                      ไม่มีคำขอรอพิจารณา
                    </td>
                  </tr>
                )}
                {pending.map((r) => (
                  <tr key={r.id} className="border-t border-line/50 align-top">
                    <td className={`${td} whitespace-nowrap text-muted`}>
                      {new Date(r.created_at).toLocaleDateString("th-TH")}
                    </td>
                    <td className={`${td} font-medium text-foreground`}>{r.requester_name}</td>
                    <td className={td}>
                      {r.items
                        .map((it) => `${it.generic_name} x${it.qty_requested}`)
                        .join(", ")}
                    </td>
                    <td className={td}>
                      {r.priority === "urgent" ? (
                        <span className="font-medium text-red-600">ด่วน</span>
                      ) : (
                        <span className="text-muted">ปกติ</span>
                      )}
                    </td>
                    <td className={`${td} text-right whitespace-nowrap`}>
                      <button
                        disabled={busyId === r.id}
                        onClick={() => act(r.id, "approve")}
                        className={`mr-2 ${pillPrimary}`}
                      >
                        ส่งต่อ อบจ.
                      </button>
                      <button
                        disabled={busyId === r.id}
                        onClick={() => act(r.id, "reject")}
                        className={pillDanger}
                      >
                        ปฏิเสธ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        )}

        {activeTab === "history" && (
        <section className="mt-8 mb-16">
          <SectionLabel>ประวัติคำขอ</SectionLabel>
          <div className={`mt-3 ${cardBox}`}>
            <table className="w-full">
              <thead className="border-b border-line/70">
                <tr>
                  <th className={th}>วันที่</th>
                  <th className={th}>รพ.สต.</th>
                  <th className={th}>รายการยา</th>
                  <th className={th}>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-[14px] text-muted">
                      ยังไม่มีประวัติ
                    </td>
                  </tr>
                )}
                {history.map((r) => (
                  <tr key={r.id} className="border-t border-line/50 align-top">
                    <td className={`${td} whitespace-nowrap text-muted`}>
                      {new Date(r.created_at).toLocaleDateString("th-TH")}
                    </td>
                    <td className={`${td} font-medium text-foreground`}>{r.requester_name}</td>
                    <td className={td}>
                      {r.items
                        .map((it) => `${it.generic_name} x${it.qty_requested}`)
                        .join(", ")}
                    </td>
                    <td className={td}>
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        )}
      </div>
    </>
  );
}
