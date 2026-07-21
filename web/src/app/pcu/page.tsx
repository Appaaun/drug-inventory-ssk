"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/TopNav";
import StatusBadge from "@/components/StatusBadge";
import StockLevelBadge from "@/components/StockLevelBadge";
import CurvedLines from "@/components/CurvedLines";
import type { Drug, StockRow, Requisition } from "@/lib/types";

type FormRow = { drugCode: string; qty: string };
type Session = { orgId: string; orgName: string; username: string };
type DispensingEntry = {
  id: string;
  encounter_ref: string;
  qty_dispensed: string;
  dispensed_at: string;
  lot_no: string;
  drug_code: string;
  generic_name: string;
  unit: string;
};

const cardBox = "overflow-hidden rounded-2xl border border-line/70 bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]";
const th = "px-4 py-2.5 text-left text-[12px] font-medium text-muted";
const td = "px-4 py-3 text-[14px]";
const input =
  "rounded-lg border border-line bg-background px-3 py-2 text-[14px] text-foreground outline-none transition focus:border-accent focus:ring-1 focus:ring-accent";
const pillPrimary =
  "rounded-full bg-accent px-4 py-2 text-[14px] font-medium text-white transition hover:bg-accent-hover disabled:opacity-40";
const pillNeutral =
  "rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] font-medium text-foreground transition hover:bg-black/[0.04]";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[15px] font-semibold text-foreground">{children}</h2>;
}

export default function PcuPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [centralStock, setCentralStock] = useState<StockRow[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [rows, setRows] = useState<FormRow[]>([{ drugCode: "", qty: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [drugSearch, setDrugSearch] = useState("");
  const [encounterRef, setEncounterRef] = useState("");
  const [dispenseRows, setDispenseRows] = useState<FormRow[]>([{ drugCode: "", qty: "" }]);
  const [dispensing, setDispensing] = useState(false);
  const [dispenseMessage, setDispenseMessage] = useState<string | null>(null);
  const [dispensingHistory, setDispensingHistory] = useState<DispensingEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"stock" | "dispense" | "requisition">("stock");

  const loadFacilityData = useCallback(async (orgId: string) => {
    const [stockRes, reqRes, dispenseRes] = await Promise.all([
      fetch(`/api/stock?orgId=${orgId}`).then((r) => r.json()),
      fetch(`/api/requisitions`).then((r) => r.json()), // scope ตาม session อัตโนมัติ
      fetch(`/api/dispensing-events`).then((r) => r.json()),
    ]);
    setStock(stockRes);
    setRequisitions(reqRes);
    setDispensingHistory(dispenseRes);
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

      const [drugRes, provinceRes] = await Promise.all([
        fetch("/api/drugs").then((r) => r.json()),
        fetch("/api/organizations?type=PROVINCE").then((r) => r.json()),
      ]);
      setDrugs(drugRes);
      if (provinceRes.length > 0) {
        const stockRes = await fetch(`/api/stock?orgId=${provinceRes[0].id}`).then((r) =>
          r.json()
        );
        setCentralStock(stockRes);
      }
      await loadFacilityData(me.orgId);
      setLoading(false);
    })();
  }, [router, loadFacilityData]);

  function updateRow(idx: number, field: keyof FormRow, value: string) {
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));
  }
  function addRow() {
    setRows((r) => [...r, { drugCode: "", qty: "" }]);
  }
  function removeRow(idx: number) {
    setRows((r) => r.filter((_, i) => i !== idx));
  }

  async function submitRequisition(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const items = rows
      .filter((r) => r.drugCode && r.qty)
      .map((r) => ({ drugCode: r.drugCode, qtyRequested: Number(r.qty) }));
    if (items.length === 0) {
      setMessage("กรุณาเลือกยาอย่างน้อย 1 รายการ");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/requisitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority: "normal", items }),
    });
    setSubmitting(false);
    if (res.ok) {
      setMessage("ส่งคำขอเบิกยาสำเร็จ");
      setRows([{ drugCode: "", qty: "" }]);
      if (session) loadFacilityData(session.orgId);
    } else {
      const err = await res.json();
      setMessage(`เกิดข้อผิดพลาด: ${err.error ?? "unknown"}`);
    }
  }

  function updateDispenseRow(idx: number, field: keyof FormRow, value: string) {
    setDispenseRows((r) => r.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));
  }
  function addDispenseRow() {
    setDispenseRows((r) => [...r, { drugCode: "", qty: "" }]);
  }
  function removeDispenseRow(idx: number) {
    setDispenseRows((r) => r.filter((_, i) => i !== idx));
  }

  async function submitDispense(e: React.FormEvent) {
    e.preventDefault();
    setDispenseMessage(null);
    if (!encounterRef.trim()) {
      setDispenseMessage("กรุณาระบุรหัสอ้างอิงผู้ป่วย");
      return;
    }
    const items = dispenseRows
      .filter((r) => r.drugCode && r.qty)
      .map((r) => ({ drugCode: r.drugCode, qtyDispensed: Number(r.qty) }));
    if (items.length === 0) {
      setDispenseMessage("กรุณาเลือกยาอย่างน้อย 1 รายการ");
      return;
    }
    setDispensing(true);
    const res = await fetch("/api/dispensing-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encounterRef: encounterRef.trim(), items }),
    });
    setDispensing(false);
    if (res.ok) {
      setDispenseMessage("บันทึกการจ่ายยาสำเร็จ ตัดสต็อกเรียบร้อย");
      setEncounterRef("");
      setDispenseRows([{ drugCode: "", qty: "" }]);
      if (session) loadFacilityData(session.orgId);
    } else {
      const err = await res.json();
      setDispenseMessage(`เกิดข้อผิดพลาด: ${err.error ?? "unknown"}`);
    }
  }

  if (loading || !session) {
    return (
      <div className="flex flex-1 items-center justify-center text-[15px] text-muted">
        กำลังโหลด...
      </div>
    );
  }

  const dq = drugSearch.trim().toLowerCase();
  const dispensableDrugs = dq
    ? drugs.filter(
        (d) => d.generic_name.toLowerCase().includes(dq) || d.drug_code.toLowerCase().includes(dq)
      )
    : drugs;

  return (
    <>
      <TopNav section={`${session.orgName} · เบิกยา`} username={session.username} />
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
          <a href="/api/export/pcu" className={`relative ${pillNeutral}`}>
            ส่งออกข้อมูล (Excel)
          </a>
        </div>

        <div className="mt-2 inline-flex flex-wrap gap-1 rounded-full border border-line/70 bg-surface p-1">
          {(
            [
              { key: "stock", label: "สต็อกยา" },
              { key: "dispense", label: "จ่ายยา" },
              { key: "requisition", label: "เบิกยา" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full px-4 py-2 text-[13px] font-medium transition ${
                activeTab === tab.key
                  ? "bg-accent text-white"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "stock" && (
        <section className="mt-8">
          <SectionLabel>สต็อกยาคงเหลือ</SectionLabel>
          <div className={`mt-3 ${cardBox}`}>
            <table className="w-full">
              <thead className="border-b border-line/70">
                <tr>
                  <th className={th}>ยา</th>
                  <th className={th}>Lot</th>
                  <th className={th}>วันหมดอายุ</th>
                  <th className={`${th} text-right`}>คงเหลือ</th>
                </tr>
              </thead>
              <tbody>
                {stock.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-[14px] text-muted">
                      ไม่มีสต็อกยา
                    </td>
                  </tr>
                )}
                {stock.map((s, i) => (
                  <tr key={i} className="border-t border-line/50">
                    <td className={td}>
                      {s.generic_name} <span className="text-muted">({s.unit})</span>
                    </td>
                    <td className={`${td} text-muted`}>{s.lot_no}</td>
                    <td className={`${td} text-muted`}>
                      {new Date(s.expiry_date).toLocaleDateString("th-TH")}
                    </td>
                    <td className={`${td} text-right`}>
                      <StockLevelBadge qty={Number(s.qty_on_hand)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        )}

        {activeTab === "dispense" && (
        <section className="mt-8">
          <SectionLabel>จ่ายยาให้ผู้ป่วย</SectionLabel>
          <form
            onSubmit={submitDispense}
            className="mt-3 rounded-2xl border border-line/70 bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          >
            <label className="block text-[13px] font-medium text-muted">
              รหัสอ้างอิงผู้ป่วย (เลขที่ visit — ไม่ใช่เลขบัตรประชาชน)
              <input
                type="text"
                placeholder="เช่น V2026-000123"
                className={`${input} mt-1.5 w-full sm:w-80`}
                value={encounterRef}
                onChange={(e) => setEncounterRef(e.target.value)}
              />
            </label>

            <div className="mt-4">
              <input
                type="text"
                placeholder="ค้นหายาด้วยชื่อหรือรหัส..."
                className={`${input} w-full sm:w-72`}
                value={drugSearch}
                onChange={(e) => setDrugSearch(e.target.value)}
              />
            </div>

            <div className="mt-3 space-y-2.5">
              {dispenseRows.map((row, idx) => (
                <div key={idx} className="flex gap-2">
                  <select
                    className={`flex-1 ${input}`}
                    value={row.drugCode}
                    onChange={(e) => updateDispenseRow(idx, "drugCode", e.target.value)}
                  >
                    <option value="">-- เลือกยา ({dispensableDrugs.length} รายการ) --</option>
                    {dispensableDrugs.map((d) => (
                      <option key={d.drug_code} value={d.drug_code}>
                        {d.generic_name} ({d.unit})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    placeholder="จำนวน"
                    className={`w-28 ${input}`}
                    value={row.qty}
                    onChange={(e) => updateDispenseRow(idx, "qty", e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removeDispenseRow(idx)}
                    className="rounded-lg px-2 text-muted transition hover:bg-black/[0.04] hover:text-foreground"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={addDispenseRow}
                className="text-[14px] font-medium text-accent transition hover:text-accent-hover"
              >
                + เพิ่มรายการยา
              </button>
              <button type="submit" disabled={dispensing} className={pillPrimary}>
                {dispensing ? "กำลังบันทึก..." : "บันทึกการจ่ายยา"}
              </button>
            </div>
            {dispenseMessage && <p className="mt-3 text-[13px] text-muted">{dispenseMessage}</p>}
          </form>
        </section>
        )}

        {activeTab === "dispense" && (
        <section className="mt-8">
          <SectionLabel>ประวัติการจ่ายยา</SectionLabel>
          <div className={`mt-3 ${cardBox}`}>
            <table className="w-full">
              <thead className="border-b border-line/70">
                <tr>
                  <th className={th}>วันที่</th>
                  <th className={th}>รหัสอ้างอิงผู้ป่วย</th>
                  <th className={th}>ยา</th>
                  <th className={`${th} text-right`}>จำนวน</th>
                </tr>
              </thead>
              <tbody>
                {dispensingHistory.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-[14px] text-muted">
                      ยังไม่มีประวัติการจ่ายยา
                    </td>
                  </tr>
                )}
                {dispensingHistory.map((e) => (
                  <tr key={e.id} className="border-t border-line/50">
                    <td className={`${td} whitespace-nowrap text-muted`}>
                      {new Date(e.dispensed_at).toLocaleDateString("th-TH")}
                    </td>
                    <td className={`${td} text-muted`}>{e.encounter_ref}</td>
                    <td className={td}>
                      {e.generic_name} <span className="text-muted">({e.unit})</span>
                    </td>
                    <td className={`${td} text-right font-medium`}>
                      -{Number(e.qty_dispensed).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        )}

        {activeTab === "stock" && (
        <section className="mt-8">
          <SectionLabel>สต็อกคงเหลือที่ส่วนกลาง (คลังจังหวัด)</SectionLabel>
          <div className={`mt-3 ${cardBox}`}>
            <table className="w-full">
              <thead className="border-b border-line/70">
                <tr>
                  <th className={th}>ยา</th>
                  <th className={`${th} text-right`}>คงเหลือที่ส่วนกลาง</th>
                </tr>
              </thead>
              <tbody>
                {centralStock.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-[14px] text-muted">
                      ไม่มีข้อมูล
                    </td>
                  </tr>
                )}
                {Object.values(
                  centralStock.reduce<Record<string, { name: string; unit: string; qty: number }>>(
                    (acc, s) => {
                      const key = s.drug_code;
                      if (!acc[key]) acc[key] = { name: s.generic_name, unit: s.unit, qty: 0 };
                      acc[key].qty += Number(s.qty_on_hand);
                      return acc;
                    },
                    {}
                  )
                )
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((d, i) => (
                    <tr key={i} className="border-t border-line/50">
                      <td className={td}>
                        {d.name} <span className="text-muted">({d.unit})</span>
                      </td>
                      <td className={`${td} text-right font-medium`}>
                        {d.qty.toLocaleString()}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
        )}

        {activeTab === "requisition" && (
        <section className="mt-8">
          <SectionLabel>สร้างคำขอเบิกยาใหม่</SectionLabel>
          <form
            onSubmit={submitRequisition}
            className="mt-3 rounded-2xl border border-line/70 bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          >
            <div className="space-y-2.5">
              {rows.map((row, idx) => (
                <div key={idx} className="flex gap-2">
                  <select
                    className={`flex-1 ${input}`}
                    value={row.drugCode}
                    onChange={(e) => updateRow(idx, "drugCode", e.target.value)}
                  >
                    <option value="">-- เลือกยา --</option>
                    {drugs.map((d) => (
                      <option key={d.drug_code} value={d.drug_code}>
                        {d.generic_name} ({d.unit})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    placeholder="จำนวน"
                    className={`w-28 ${input}`}
                    value={row.qty}
                    onChange={(e) => updateRow(idx, "qty", e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="rounded-lg px-2 text-muted transition hover:bg-black/[0.04] hover:text-foreground"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={addRow}
                className="text-[14px] font-medium text-accent transition hover:text-accent-hover"
              >
                + เพิ่มรายการยา
              </button>
              <button type="submit" disabled={submitting} className={pillPrimary}>
                {submitting ? "กำลังส่ง..." : "ส่งคำขอเบิกยา"}
              </button>
            </div>
            {message && <p className="mt-3 text-[13px] text-muted">{message}</p>}
          </form>
        </section>
        )}

        {activeTab === "requisition" && (
        <section className="mt-8 mb-16">
          <SectionLabel>ประวัติคำขอเบิก</SectionLabel>
          <div className={`mt-3 ${cardBox}`}>
            <table className="w-full">
              <thead className="border-b border-line/70">
                <tr>
                  <th className={th}>วันที่</th>
                  <th className={th}>รายการยา</th>
                  <th className={th}>ส่งไปที่</th>
                  <th className={th}>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {requisitions.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-[14px] text-muted">
                      ยังไม่มีคำขอเบิก
                    </td>
                  </tr>
                )}
                {requisitions.map((r) => (
                  <tr key={r.id} className="border-t border-line/50 align-top">
                    <td className={`${td} whitespace-nowrap text-muted`}>
                      {new Date(r.created_at).toLocaleDateString("th-TH")}
                    </td>
                    <td className={td}>
                      {r.items
                        .map((it) => `${it.generic_name} x${it.qty_requested}`)
                        .join(", ")}
                    </td>
                    <td className={`${td} text-muted`}>{r.target_name}</td>
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
