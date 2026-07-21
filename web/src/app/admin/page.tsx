"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import TopNav from "@/components/TopNav";
import StatusBadge from "@/components/StatusBadge";
import StockLevelBadge from "@/components/StockLevelBadge";
import CurvedLines from "@/components/CurvedLines";
import type { Drug, Organization, PriceHistoryEntry, Requisition, UserAccount } from "@/lib/types";

const ROLE_LABELS: Record<UserAccount["role_name"], string> = {
  PROVINCE_ADMIN: "ผู้ดูแล อบจ.",
  CUP_MANAGER: "ผู้จัดการ CUP",
  PCU_REQUESTER: "เจ้าหน้าที่ รพ.สต.",
};

type Summary = {
  totalStockValue: number;
  totalDrugs: number;
  pendingApprovals: number;
  lowStockAlerts: { warehouse_name: string; generic_name: string; qty_on_hand: string }[];
  requisitionsByPcu: { name: string; requisition_count: string; total_qty: string }[];
  requisitionsByDrug: { generic_name: string; requisition_count: string; total_qty: string }[];
  recentReceipts: {
    created_at: string;
    warehouse_name: string;
    generic_name: string;
    qty: string;
    lot_no: string;
  }[];
  provinceStock: {
    generic_name: string;
    lot_no: string;
    expiry_date: string;
    qty_on_hand: string;
  }[];
};

function Card({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${
        alert ? "border-red-200 bg-red-50" : "border-line/70 bg-surface"
      }`}
    >
      <div className={`text-[13px] font-medium ${alert ? "text-red-600" : "text-muted"}`}>
        {alert && "⚠ "}
        {label}
      </div>
      <div
        className={`mt-1.5 text-[26px] font-semibold tracking-tight ${
          alert ? "text-red-600" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[15px] font-semibold text-foreground">{children}</h2>;
}

const cardBox = "overflow-hidden rounded-2xl border border-line/70 bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]";
const th = "px-4 py-2.5 text-left text-[12px] font-medium text-muted";
const td = "px-4 py-3 text-[14px]";
const input =
  "rounded-lg border border-line bg-background px-3 py-2 text-[14px] text-foreground outline-none transition focus:border-accent focus:ring-1 focus:ring-accent";
const pillPrimary =
  "rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white transition hover:bg-accent-hover disabled:opacity-40";
const pillNeutral =
  "rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] font-medium text-foreground transition hover:bg-black/[0.04] disabled:opacity-40";
const pillDanger =
  "rounded-full bg-red-50 px-3.5 py-1.5 text-[13px] font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-40";

type ReceiptForm = {
  mode: "existing" | "new";
  drugCode: string;
  newName: string;
  newUnit: string;
  qty: string;
  unitCost: string;
  lotNo: string;
  expiryDate: string;
  receivedDate: string;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function emptyReceiptForm(): ReceiptForm {
  return {
    mode: "existing",
    drugCode: "",
    newName: "",
    newUnit: "TAB",
    qty: "",
    unitCost: "",
    lotNo: "",
    expiryDate: "",
    receivedDate: todayISO(),
  };
}

type DrugEditForm = { genericName: string; unit: string; controlledFlag: boolean };

export default function AdminPage() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pending, setPending] = useState<Requisition[]>([]);
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [allDrugs, setAllDrugs] = useState<Drug[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receiptForm, setReceiptForm] = useState<ReceiptForm>(emptyReceiptForm);
  const [receiptSubmitting, setReceiptSubmitting] = useState(false);
  const [receiptMessage, setReceiptMessage] = useState<string | null>(null);

  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<DrugEditForm>({
    genericName: "",
    unit: "",
    controlledFlag: false,
  });
  const [manageMessage, setManageMessage] = useState<string | null>(null);
  const [priceHistoryDrug, setPriceHistoryDrug] = useState<string | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);
  const [drugSearch, setDrugSearch] = useState("");

  const [allOrgs, setAllOrgs] = useState<Organization[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [orgForm, setOrgForm] = useState({ name: "", type: "PCU" as "PCU" | "CUP", parentOrgId: "" });
  const [orgSubmitting, setOrgSubmitting] = useState(false);
  const [orgMessage, setOrgMessage] = useState<string | null>(null);
  const [userForm, setUserForm] = useState({
    username: "",
    password: "",
    roleName: "PCU_REQUESTER" as UserAccount["role_name"],
    orgId: "",
  });
  const [userSubmitting, setUserSubmitting] = useState(false);
  const [userMessage, setUserMessage] = useState<string | null>(null);
  const [deletingOrgId, setDeletingOrgId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "pending" | "receive" | "drugs" | "orgs" | "reports"
  >("pending");
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [s, p, d, ad, orgs, us] = await Promise.all([
      fetch("/api/dashboard/summary").then((r) => r.json()),
      fetch("/api/requisitions?status=PENDING_PROVINCE_APPROVAL").then((r) => r.json()),
      fetch("/api/drugs").then((r) => r.json()),
      fetch("/api/drugs?all=true").then((r) => r.json()),
      fetch("/api/organizations").then((r) => r.json()),
      fetch("/api/users").then((r) => r.json()),
    ]);
    setSummary(s);
    setPending(p);
    setDrugs(d);
    setAllDrugs(ad);
    setAllOrgs(orgs);
    setUsers(us);
  }, []);

  useEffect(() => {
    refresh();
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((me) => setUsername(me.username))
      .catch(() => router.push("/login"));
  }, [refresh, router]);

  function startEdit(drug: Drug) {
    setEditingCode(drug.drug_code);
    setEditForm({
      genericName: drug.generic_name,
      unit: drug.unit,
      controlledFlag: drug.controlled_flag,
    });
    setManageMessage(null);
  }

  async function saveEdit(code: string) {
    setManageMessage(null);
    const res = await fetch(`/api/drugs/${code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        genericName: editForm.genericName,
        unit: editForm.unit,
        controlledFlag: editForm.controlledFlag,
      }),
    });
    if (res.ok) {
      setEditingCode(null);
      refresh();
    } else {
      const err = await res.json();
      setManageMessage(`เกิดข้อผิดพลาด: ${err.error ?? "unknown"}`);
    }
  }

  async function toggleActive(drug: Drug) {
    setManageMessage(null);
    const res = drug.is_active
      ? await fetch(`/api/drugs/${drug.drug_code}`, { method: "DELETE" })
      : await fetch(`/api/drugs/${drug.drug_code}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: true }),
        });
    if (res.ok) {
      refresh();
    } else {
      const err = await res.json();
      setManageMessage(`เกิดข้อผิดพลาด: ${err.error ?? "unknown"}`);
    }
  }

  async function loadPriceHistory(code: string) {
    setPriceHistoryDrug(code);
    const data = await fetch(`/api/drugs/${code}/price-history`).then((r) => r.json());
    setPriceHistory(data);
  }

  async function submitReceipt(e: React.FormEvent) {
    e.preventDefault();
    setReceiptMessage(null);

    const qty = Number(receiptForm.qty);
    const unitCost = Number(receiptForm.unitCost);
    if (!qty || qty <= 0) {
      setReceiptMessage("กรุณาระบุจำนวนให้ถูกต้อง");
      return;
    }
    if (receiptForm.unitCost === "" || unitCost < 0) {
      setReceiptMessage("กรุณาระบุราคาให้ถูกต้อง");
      return;
    }
    if (receiptForm.mode === "existing" && !receiptForm.drugCode) {
      setReceiptMessage("กรุณาเลือกยา");
      return;
    }
    if (receiptForm.mode === "new" && !receiptForm.newName.trim()) {
      setReceiptMessage("กรุณาระบุชื่อยาใหม่");
      return;
    }
    if (!receiptForm.lotNo.trim()) {
      setReceiptMessage("กรุณาระบุเลข Lot");
      return;
    }
    if (!receiptForm.expiryDate) {
      setReceiptMessage("กรุณาระบุวันหมดอายุ");
      return;
    }
    if (!receiptForm.receivedDate) {
      setReceiptMessage("กรุณาระบุวันที่รับเข้า");
      return;
    }

    setReceiptSubmitting(true);
    const res = await fetch("/api/inventory/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        drugCode: receiptForm.mode === "existing" ? receiptForm.drugCode : undefined,
        newDrug:
          receiptForm.mode === "new"
            ? { genericName: receiptForm.newName.trim(), unit: receiptForm.newUnit }
            : undefined,
        qty,
        unitCost,
        lotNo: receiptForm.lotNo,
        expiryDate: receiptForm.expiryDate,
        receivedDate: receiptForm.receivedDate,
      }),
    });
    setReceiptSubmitting(false);
    if (res.ok) {
      const data = await res.json();
      setReceiptMessage(`รับยาเข้าคลังสำเร็จ (${data.drugCode}, lot ${data.lotNo})`);
      setReceiptForm(emptyReceiptForm);
      refresh();
    } else {
      const err = await res.json();
      setReceiptMessage(`เกิดข้อผิดพลาด: ${err.error ?? "unknown"}`);
    }
  }

  async function submitOrg(e: React.FormEvent) {
    e.preventDefault();
    setOrgMessage(null);
    if (!orgForm.name.trim()) {
      setOrgMessage("กรุณาระบุชื่อหน่วยงาน");
      return;
    }
    if (!orgForm.parentOrgId) {
      setOrgMessage(orgForm.type === "PCU" ? "กรุณาเลือก CUP ต้นสังกัด" : "กรุณาเลือก อบจ. ต้นสังกัด");
      return;
    }
    setOrgSubmitting(true);
    const res = await fetch("/api/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orgForm),
    });
    setOrgSubmitting(false);
    if (res.ok) {
      setOrgMessage(`เพิ่ม${orgForm.type === "PCU" ? "รพ.สต." : "CUP"} "${orgForm.name.trim()}" สำเร็จ`);
      setOrgForm({ name: "", type: orgForm.type, parentOrgId: "" });
      refresh();
    } else {
      const err = await res.json();
      setOrgMessage(`เกิดข้อผิดพลาด: ${err.error ?? "unknown"}`);
    }
  }

  async function submitUser(e: React.FormEvent) {
    e.preventDefault();
    setUserMessage(null);
    if (!userForm.username.trim()) {
      setUserMessage("กรุณาระบุชื่อผู้ใช้");
      return;
    }
    if (userForm.password.length < 8) {
      setUserMessage("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }
    if (!userForm.orgId) {
      setUserMessage("กรุณาเลือกหน่วยงาน");
      return;
    }
    setUserSubmitting(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userForm),
    });
    setUserSubmitting(false);
    if (res.ok) {
      setUserMessage(`สร้างบัญชี "${userForm.username.trim()}" สำเร็จ`);
      setUserForm({ username: "", password: "", roleName: userForm.roleName, orgId: "" });
      refresh();
    } else {
      const err = await res.json();
      setUserMessage(`เกิดข้อผิดพลาด: ${err.error ?? "unknown"}`);
    }
  }

  async function deleteOrg(id: string, name: string) {
    if (!window.confirm(`ยืนยันลบหน่วยงาน "${name}"? การลบนี้ย้อนกลับไม่ได้`)) return;
    setOrgMessage(null);
    setDeletingOrgId(id);
    const res = await fetch(`/api/organizations/${id}`, { method: "DELETE" });
    setDeletingOrgId(null);
    if (res.ok) {
      setOrgMessage(`ลบหน่วยงาน "${name}" แล้ว`);
      refresh();
    } else {
      const err = await res.json();
      setOrgMessage(`ลบไม่สำเร็จ: ${err.error ?? "unknown"}`);
    }
  }

  async function deleteUser(id: string, username: string) {
    if (!window.confirm(`ยืนยันลบบัญชี "${username}"? การลบนี้ย้อนกลับไม่ได้`)) return;
    setUserMessage(null);
    setDeletingUserId(id);
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    setDeletingUserId(null);
    if (res.ok) {
      const data = await res.json();
      setUserMessage(
        data.softDeleted
          ? `บัญชี "${username}" มีประวัติทำรายการอยู่ จึงปิดใช้งานแทนการลบถาวร`
          : `ลบบัญชี "${username}" แล้ว`
      );
      refresh();
    } else {
      const err = await res.json();
      setUserMessage(`ลบไม่สำเร็จ: ${err.error ?? "unknown"}`);
    }
  }

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

  if (!summary) {
    return (
      <div className="flex flex-1 items-center justify-center text-[15px] text-muted">
        กำลังโหลด...
      </div>
    );
  }

  const pcuChartData = summary.requisitionsByPcu.map((r) => ({
    name: r.name.replace("รพ.สต.", ""),
    คำขอ: Number(r.requisition_count),
    จำนวนยา: Number(r.total_qty),
  }));
  const drugChartData = summary.requisitionsByDrug.map((r) => ({
    name: r.generic_name,
    จำนวนยา: Number(r.total_qty),
  }));

  const q = drugSearch.trim().toLowerCase();
  const filteredDrugs = q
    ? allDrugs.filter(
        (d) =>
          d.generic_name.toLowerCase().includes(q) || d.drug_code.toLowerCase().includes(q)
      )
    : allDrugs;

  const provinces = allOrgs.filter((o) => o.type === "PROVINCE");
  const cups = allOrgs.filter((o) => o.type === "CUP");
  const pcus = allOrgs.filter((o) => o.type === "PCU");
  const orgParentOptions = orgForm.type === "PCU" ? cups : provinces;
  const expectedOrgType =
    userForm.roleName === "PCU_REQUESTER"
      ? "PCU"
      : userForm.roleName === "CUP_MANAGER"
        ? "CUP"
        : "PROVINCE";
  const userOrgOptions = allOrgs.filter((o) => o.type === expectedOrgType);

  return (
    <>
      <TopNav section="อบจ.ศรีสะเกษ · บริหารคลังยากลาง" username={username} />
      <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="relative flex flex-wrap items-center justify-between gap-3 overflow-hidden py-6">
          <CurvedLines side="left" count={5} lineHeight={110} startWidth={24} widthStep={7} />
          <CurvedLines side="right" count={5} lineHeight={110} startWidth={24} widthStep={7} />
          <h1
            className="relative text-[30px] font-semibold text-foreground"
            style={{ letterSpacing: "-0.035em" }}
          >
            คลัง<span className="brand-serif text-[30px]">ยากลาง</span>
          </h1>
          <a href="/api/export/inventory" className={`relative ${pillNeutral}`}>
            ส่งออกข้อมูล (Excel)
          </a>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-[14px] text-red-600">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            label="มูลค่าสต็อกรวม"
            value={`${summary.totalStockValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} บาท`}
          />
          <Card label="จำนวนรายการยาทั้งหมด" value={String(summary.totalDrugs)} />
          <Card label="คำขอรออนุมัติ" value={String(summary.pendingApprovals)} />
          <Card
            label="รายการใกล้หมด/วิกฤต (รพ.สต.)"
            value={String(summary.lowStockAlerts.length)}
            alert={summary.lowStockAlerts.some((s) => Number(s.qty_on_hand) < 30)}
          />
        </div>

        <div className="mt-8 inline-flex flex-wrap gap-1 rounded-full border border-line/70 bg-surface p-1">
          {(
            [
              { key: "pending", label: "คิวรออนุมัติ", count: pending.length },
              { key: "receive", label: "รับยาเข้าคลัง" },
              { key: "drugs", label: "จัดการรายการยา" },
              { key: "orgs", label: "หน่วยงาน & บัญชีผู้ใช้" },
              { key: "reports", label: "รายงานและสต็อก" },
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

        {activeTab === "receive" && (
        <section className="mt-10">
          <SectionLabel>รับยาเข้าคลังจังหวัด</SectionLabel>
          <form
            onSubmit={submitReceipt}
            className="mt-3 rounded-2xl border border-line/70 bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          >
            <div className="flex gap-5 text-[14px]">
              <label className="flex items-center gap-1.5 text-foreground">
                <input
                  type="radio"
                  checked={receiptForm.mode === "existing"}
                  onChange={() => setReceiptForm((f) => ({ ...f, mode: "existing" }))}
                  className="accent-accent"
                />
                ยาที่มีอยู่แล้ว
              </label>
              <label className="flex items-center gap-1.5 text-foreground">
                <input
                  type="radio"
                  checked={receiptForm.mode === "new"}
                  onChange={() => setReceiptForm((f) => ({ ...f, mode: "new" }))}
                  className="accent-accent"
                />
                เพิ่มยาชนิดใหม่
              </label>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {receiptForm.mode === "existing" ? (
                <select
                  className={`${input} sm:col-span-2`}
                  value={receiptForm.drugCode}
                  onChange={(e) =>
                    setReceiptForm((f) => ({ ...f, drugCode: e.target.value }))
                  }
                >
                  <option value="">-- เลือกยา --</option>
                  {drugs.map((d) => (
                    <option key={d.drug_code} value={d.drug_code}>
                      {d.generic_name} ({d.unit})
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="ชื่อยาใหม่ เช่น Ibuprofen 400mg"
                    className={input}
                    value={receiptForm.newName}
                    onChange={(e) =>
                      setReceiptForm((f) => ({ ...f, newName: e.target.value }))
                    }
                  />
                  <select
                    className={input}
                    value={receiptForm.newUnit}
                    onChange={(e) =>
                      setReceiptForm((f) => ({ ...f, newUnit: e.target.value }))
                    }
                  >
                    <option value="TAB">TAB</option>
                    <option value="CAP">CAP</option>
                    <option value="SACHET">SACHET</option>
                    <option value="BOTTLE">BOTTLE</option>
                    <option value="VIAL">VIAL</option>
                  </select>
                </>
              )}

              <input
                type="number"
                min={1}
                placeholder="จำนวน *"
                className={input}
                value={receiptForm.qty}
                onChange={(e) => setReceiptForm((f) => ({ ...f, qty: e.target.value }))}
              />
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="ราคาต่อหน่วย (บาท) *"
                className={input}
                value={receiptForm.unitCost}
                onChange={(e) =>
                  setReceiptForm((f) => ({ ...f, unitCost: e.target.value }))
                }
              />
              <input
                type="text"
                placeholder="เลข Lot *"
                required
                className={input}
                value={receiptForm.lotNo}
                onChange={(e) => setReceiptForm((f) => ({ ...f, lotNo: e.target.value }))}
              />
              <label className="flex flex-col gap-1 text-[12px] text-muted">
                วันหมดอายุ *
                <input
                  type="date"
                  required
                  className={input}
                  value={receiptForm.expiryDate}
                  onChange={(e) =>
                    setReceiptForm((f) => ({ ...f, expiryDate: e.target.value }))
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-muted">
                วันที่รับเข้า *
                <input
                  type="date"
                  required
                  className={input}
                  value={receiptForm.receivedDate}
                  onChange={(e) =>
                    setReceiptForm((f) => ({ ...f, receivedDate: e.target.value }))
                  }
                />
              </label>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-[12px] text-muted">* จำเป็นต้องระบุทุกช่อง</p>
              <button type="submit" disabled={receiptSubmitting} className={pillPrimary}>
                {receiptSubmitting ? "กำลังบันทึก..." : "รับยาเข้าคลัง"}
              </button>
            </div>
            {receiptMessage && (
              <p className="mt-3 text-[13px] text-muted">{receiptMessage}</p>
            )}
          </form>
        </section>
        )}

        {activeTab === "drugs" && (
        <section className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionLabel>จัดการรายการยา</SectionLabel>
            <input
              type="text"
              placeholder="ค้นหาด้วยชื่อยาหรือรหัสยา..."
              value={drugSearch}
              onChange={(e) => setDrugSearch(e.target.value)}
              className={`${input} w-64`}
            />
          </div>
          {manageMessage && (
            <div className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-[14px] text-red-600">
              {manageMessage}
            </div>
          )}
          <div className={`mt-3 ${cardBox}`}>
            <table className="w-full">
              <thead className="border-b border-line/70">
                <tr>
                  <th className={th}>ชื่อยา</th>
                  <th className={th}>หน่วย</th>
                  <th className={th}>ควบคุม</th>
                  <th className={th}>สถานะ</th>
                  <th className={`${th} text-right`}>การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {filteredDrugs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[14px] text-muted">
                      ไม่พบยาที่ตรงกับคำค้นหา
                    </td>
                  </tr>
                )}
                {filteredDrugs.map((d) => {
                  const isEditing = editingCode === d.drug_code;
                  return (
                    <tr key={d.drug_code} className="border-t border-line/50 align-middle">
                      {isEditing ? (
                        <>
                          <td className={td}>
                            <input
                              className={`w-full ${input} py-1.5`}
                              value={editForm.genericName}
                              onChange={(e) =>
                                setEditForm((f) => ({ ...f, genericName: e.target.value }))
                              }
                            />
                          </td>
                          <td className={td}>
                            <input
                              className={`w-24 ${input} py-1.5`}
                              value={editForm.unit}
                              onChange={(e) =>
                                setEditForm((f) => ({ ...f, unit: e.target.value }))
                              }
                            />
                          </td>
                          <td className={td}>
                            <input
                              type="checkbox"
                              checked={editForm.controlledFlag}
                              onChange={(e) =>
                                setEditForm((f) => ({
                                  ...f,
                                  controlledFlag: e.target.checked,
                                }))
                              }
                              className="accent-accent"
                            />
                          </td>
                          <td className={`${td} text-muted`}>
                            {d.is_active ? "ใช้งานอยู่" : "ปิดใช้งาน"}
                          </td>
                          <td className={`${td} text-right whitespace-nowrap`}>
                            <button
                              onClick={() => saveEdit(d.drug_code)}
                              className={`mr-2 ${pillPrimary}`}
                            >
                              บันทึก
                            </button>
                            <button
                              onClick={() => setEditingCode(null)}
                              className={pillNeutral}
                            >
                              ยกเลิก
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className={`${td} ${!d.is_active ? "text-muted line-through" : "text-foreground"}`}>
                            {d.generic_name}
                          </td>
                          <td className={`${td} text-muted`}>{d.unit}</td>
                          <td className={`${td} text-muted`}>
                            {d.controlled_flag ? "ใช่" : "–"}
                          </td>
                          <td className={td}>
                            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${d.is_active ? "bg-emerald-500" : "bg-muted"}`}
                              />
                              {d.is_active ? "ใช้งานอยู่" : "ปิดใช้งาน"}
                            </span>
                          </td>
                          <td className={`${td} text-right whitespace-nowrap`}>
                            <button
                              onClick={() => loadPriceHistory(d.drug_code)}
                              className={`mr-2 ${pillNeutral}`}
                            >
                              ประวัติราคา
                            </button>
                            <button onClick={() => startEdit(d)} className={`mr-2 ${pillNeutral}`}>
                              แก้ไข
                            </button>
                            <button
                              onClick={() => toggleActive(d)}
                              className={d.is_active ? pillDanger : pillPrimary}
                            >
                              {d.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            &quot;ปิดใช้งาน&quot; ไม่ได้ลบข้อมูลถาวร — แค่ซ่อนยานี้จากตัวเลือกในหน้าเบิกยา/รับยา
            ใหม่ แต่ยังคงประวัติ transaction เดิมไว้ครบ
          </p>

          {priceHistoryDrug && (
            <div className="mt-4 rounded-2xl border border-line/70 bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-semibold text-foreground">
                  ประวัติราคา —{" "}
                  {allDrugs.find((d) => d.drug_code === priceHistoryDrug)?.generic_name}
                </h3>
                <button
                  onClick={() => setPriceHistoryDrug(null)}
                  className="text-[13px] text-muted transition hover:text-foreground"
                >
                  ปิด ✕
                </button>
              </div>
              {priceHistory.length === 0 ? (
                <p className="mt-4 text-[14px] text-muted">ยังไม่มีประวัติการรับยา</p>
              ) : (
                <>
                  <div className="mt-4 h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={priceHistory.map((p) => ({
                          date: new Date(p.created_at).toLocaleDateString("th-TH"),
                          ราคา: Number(p.unit_cost),
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5ea" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6e6e73" }} />
                        <YAxis tick={{ fontSize: 11, fill: "#6e6e73" }} />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey="ราคา"
                          stroke="#0071e3"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <table className="mt-4 w-full">
                    <thead>
                      <tr>
                        <th className="py-1.5 text-left text-[12px] font-medium text-muted">วันที่รับ</th>
                        <th className="py-1.5 text-left text-[12px] font-medium text-muted">Lot</th>
                        <th className="py-1.5 text-left text-[12px] font-medium text-muted">คลัง</th>
                        <th className="py-1.5 text-right text-[12px] font-medium text-muted">จำนวน</th>
                        <th className="py-1.5 text-right text-[12px] font-medium text-muted">ราคาต่อหน่วย</th>
                      </tr>
                    </thead>
                    <tbody>
                      {priceHistory.map((p, i) => (
                        <tr key={i} className="border-t border-line/50">
                          <td className="py-2 text-[14px]">
                            {new Date(p.created_at).toLocaleDateString("th-TH")}
                          </td>
                          <td className="py-2 text-[14px] text-muted">{p.lot_no}</td>
                          <td className="py-2 text-[14px] text-muted">{p.warehouse_name}</td>
                          <td className="py-2 text-right text-[14px]">
                            {Number(p.qty).toLocaleString()}
                          </td>
                          <td className="py-2 text-right text-[14px] font-medium">
                            {Number(p.unit_cost).toLocaleString()} บาท
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}
        </section>
        )}

        {activeTab === "orgs" && (
        <section className="mt-10">
          <SectionLabel>จัดการหน่วยงานและบัญชีผู้ใช้</SectionLabel>

          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <form onSubmit={submitOrg} className={`${cardBox} p-5`}>
              <h3 className="text-[14px] font-semibold text-foreground">เพิ่มหน่วยงานใหม่</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block text-[13px] font-medium text-muted sm:col-span-2">
                  ชื่อหน่วยงาน
                  <input
                    type="text"
                    placeholder="เช่น รพ.สต.บ้านโนนสูง"
                    className={`mt-1.5 w-full ${input}`}
                    value={orgForm.name}
                    onChange={(e) => setOrgForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </label>
                <label className="block text-[13px] font-medium text-muted">
                  ประเภท
                  <select
                    className={`mt-1.5 w-full ${input}`}
                    value={orgForm.type}
                    onChange={(e) =>
                      setOrgForm((f) => ({
                        ...f,
                        type: e.target.value as "PCU" | "CUP",
                        parentOrgId: "",
                      }))
                    }
                  >
                    <option value="PCU">รพ.สต.</option>
                    <option value="CUP">CUP</option>
                  </select>
                </label>
                <label className="block text-[13px] font-medium text-muted">
                  {orgForm.type === "PCU" ? "สังกัด CUP" : "สังกัด อบจ."}
                  <select
                    className={`mt-1.5 w-full ${input}`}
                    value={orgForm.parentOrgId}
                    onChange={(e) => setOrgForm((f) => ({ ...f, parentOrgId: e.target.value }))}
                  >
                    <option value="">-- เลือก --</option>
                    {orgParentOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button type="submit" disabled={orgSubmitting} className={`mt-4 ${pillPrimary}`}>
                {orgSubmitting ? "กำลังบันทึก..." : "เพิ่มหน่วยงาน"}
              </button>
              {orgMessage && <p className="mt-3 text-[13px] text-muted">{orgMessage}</p>}
            </form>

            <form onSubmit={submitUser} className={`${cardBox} p-5`}>
              <h3 className="text-[14px] font-semibold text-foreground">สร้างบัญชีผู้ใช้ใหม่</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block text-[13px] font-medium text-muted">
                  ชื่อผู้ใช้
                  <input
                    type="text"
                    placeholder="เช่น 106.requester"
                    className={`mt-1.5 w-full ${input}`}
                    value={userForm.username}
                    onChange={(e) => setUserForm((f) => ({ ...f, username: e.target.value }))}
                  />
                </label>
                <label className="block text-[13px] font-medium text-muted">
                  รหัสผ่าน
                  <input
                    type="text"
                    placeholder="อย่างน้อย 8 ตัวอักษร"
                    className={`mt-1.5 w-full ${input}`}
                    value={userForm.password}
                    onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))}
                  />
                </label>
                <label className="block text-[13px] font-medium text-muted">
                  บทบาท
                  <select
                    className={`mt-1.5 w-full ${input}`}
                    value={userForm.roleName}
                    onChange={(e) =>
                      setUserForm((f) => ({
                        ...f,
                        roleName: e.target.value as UserAccount["role_name"],
                        orgId: "",
                      }))
                    }
                  >
                    <option value="PCU_REQUESTER">เจ้าหน้าที่ รพ.สต.</option>
                    <option value="CUP_MANAGER">ผู้จัดการ CUP</option>
                    <option value="PROVINCE_ADMIN">ผู้ดูแล อบจ.</option>
                  </select>
                </label>
                <label className="block text-[13px] font-medium text-muted">
                  หน่วยงาน
                  <select
                    className={`mt-1.5 w-full ${input}`}
                    value={userForm.orgId}
                    onChange={(e) => setUserForm((f) => ({ ...f, orgId: e.target.value }))}
                  >
                    <option value="">-- เลือก --</option>
                    {userOrgOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button type="submit" disabled={userSubmitting} className={`mt-4 ${pillPrimary}`}>
                {userSubmitting ? "กำลังบันทึก..." : "สร้างบัญชี"}
              </button>
              {userMessage && <p className="mt-3 text-[13px] text-muted">{userMessage}</p>}
            </form>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-[13px] font-medium text-muted">
                หน่วยงานทั้งหมด ({cups.length + pcus.length})
              </p>
              <div className={`mt-2 max-h-72 overflow-y-auto ${cardBox}`}>
                <table className="w-full">
                  <thead className="border-b border-line/70">
                    <tr>
                      <th className={th}>ชื่อ</th>
                      <th className={th}>ประเภท</th>
                      <th className={th}>สังกัด</th>
                      <th className={`${th} text-right`}>การดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...cups, ...pcus].length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-[13px] text-muted">
                          ยังไม่มีหน่วยงานนอกเหนือจากที่มีอยู่เดิม
                        </td>
                      </tr>
                    )}
                    {[...cups, ...pcus].map((o) => (
                      <tr key={o.id} className="border-t border-line/50">
                        <td className={`${td} font-medium text-foreground`}>{o.name}</td>
                        <td className={`${td} text-muted`}>{o.type === "PCU" ? "รพ.สต." : "CUP"}</td>
                        <td className={`${td} text-muted`}>{o.parent_name}</td>
                        <td className={`${td} text-right whitespace-nowrap`}>
                          <button
                            disabled={deletingOrgId === o.id}
                            onClick={() => deleteOrg(o.id, o.name)}
                            className={pillDanger}
                          >
                            ลบ
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <p className="text-[13px] font-medium text-muted">บัญชีผู้ใช้ทั้งหมด ({users.length})</p>
              <div className={`mt-2 max-h-72 overflow-y-auto ${cardBox}`}>
                <table className="w-full">
                  <thead className="border-b border-line/70">
                    <tr>
                      <th className={th}>ชื่อผู้ใช้</th>
                      <th className={th}>บทบาท</th>
                      <th className={th}>หน่วยงาน</th>
                      <th className={`${th} text-right`}>การดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-[13px] text-muted">
                          ยังไม่มีบัญชีผู้ใช้
                        </td>
                      </tr>
                    )}
                    {users.map((u) => (
                      <tr key={u.id} className="border-t border-line/50">
                        <td className={`${td} ${!u.is_active ? "text-muted line-through" : "font-medium text-foreground"}`}>
                          {u.username}
                        </td>
                        <td className={`${td} text-muted`}>{ROLE_LABELS[u.role_name]}</td>
                        <td className={`${td} text-muted`}>{u.org_name}</td>
                        <td className={`${td} text-right whitespace-nowrap`}>
                          {u.is_active ? (
                            u.username === username ? (
                              <span className="text-[13px] text-muted">บัญชีตัวเอง</span>
                            ) : (
                              <button
                                disabled={deletingUserId === u.id}
                                onClick={() => deleteUser(u.id, u.username)}
                                className={pillDanger}
                              >
                                ลบ
                              </button>
                            )
                          ) : (
                            <span className="text-[13px] text-muted">ปิดใช้งานแล้ว</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
        )}

        {activeTab === "reports" && (
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <section>
            <SectionLabel>ความถี่การเบิกยาแยกตาม รพ.สต.</SectionLabel>
            <div className="mt-3 h-72 rounded-2xl border border-line/70 bg-surface p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pcuChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5ea" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6e6e73" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#6e6e73" }} />
                  <Tooltip />
                  <Bar dataKey="คำขอ" fill="#0071e3" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section>
            <SectionLabel>ปริมาณยาที่เบิกมากที่สุด (รวมทุก รพ.สต.)</SectionLabel>
            <div className="mt-3 h-72 rounded-2xl border border-line/70 bg-surface p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={drugChartData} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e5ea" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#6e6e73" }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "#6e6e73" }} width={110} />
                  <Tooltip />
                  <Bar dataKey="จำนวนยา" fill="#1d1d1f" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
        )}

        {activeTab === "pending" && (
        <section className="mt-10">
          <SectionLabel>คิวรออนุมัติ</SectionLabel>
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
                      ไม่มีคำขอรออนุมัติ
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
                        อนุมัติ
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

        {activeTab === "reports" && (
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {/* Province stock */}
          <section>
            <SectionLabel>สต็อกคลังจังหวัด</SectionLabel>
            <div className={`mt-3 ${cardBox}`}>
              <table className="w-full">
                <thead className="border-b border-line/70">
                  <tr>
                    <th className={th}>ยา</th>
                    <th className={th}>Lot</th>
                    <th className={`${th} text-right`}>คงเหลือ</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.provinceStock.map((s, i) => (
                    <tr key={i} className="border-t border-line/50">
                      <td className={td}>{s.generic_name}</td>
                      <td className={`${td} text-muted`}>{s.lot_no}</td>
                      <td className={`${td} text-right`}>
                        <StockLevelBadge qty={Number(s.qty_on_hand)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Low stock alerts */}
          <section>
            <SectionLabel>รพ.สต. ที่สต็อกใกล้หมด (&lt; 80 หน่วย)</SectionLabel>
            <div className={`mt-3 ${cardBox}`}>
              <table className="w-full">
                <thead className="border-b border-line/70">
                  <tr>
                    <th className={th}>หน่วยงาน</th>
                    <th className={th}>ยา</th>
                    <th className={`${th} text-right`}>คงเหลือ</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.lowStockAlerts.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-[14px] text-muted">
                        ไม่มีรายการใกล้หมด
                      </td>
                    </tr>
                  )}
                  {summary.lowStockAlerts.map((s, i) => (
                    <tr key={i} className="border-t border-line/50">
                      <td className={td}>{s.warehouse_name}</td>
                      <td className={td}>{s.generic_name}</td>
                      <td className={`${td} text-right`}>
                        <StockLevelBadge qty={Number(s.qty_on_hand)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
        )}

        {activeTab === "reports" && (
        <section className="mt-10 mb-16">
          <SectionLabel>ประวัติรับยาเข้าคลังล่าสุด</SectionLabel>
          <div className={`mt-3 ${cardBox}`}>
            <table className="w-full">
              <thead className="border-b border-line/70">
                <tr>
                  <th className={th}>วันที่</th>
                  <th className={th}>คลัง</th>
                  <th className={th}>ยา</th>
                  <th className={`${th} text-right`}>จำนวน</th>
                </tr>
              </thead>
              <tbody>
                {summary.recentReceipts.map((r, i) => (
                  <tr key={i} className="border-t border-line/50">
                    <td className={`${td} whitespace-nowrap text-muted`}>
                      {new Date(r.created_at).toLocaleDateString("th-TH")}
                    </td>
                    <td className={td}>{r.warehouse_name}</td>
                    <td className={td}>{r.generic_name}</td>
                    <td className={`${td} text-right font-medium`}>
                      +{Number(r.qty).toLocaleString()}
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
