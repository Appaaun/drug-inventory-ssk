-- Provincial Drug Inventory Management System
-- PostgreSQL schema

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- สำหรับ gen_random_uuid()

CREATE TYPE org_type AS ENUM ('PROVINCE','CUP','PCU');
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type org_type NOT NULL,
    parent_org_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_organizations_parent ON organizations(parent_org_id);

CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    permissions JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    role_id INT NOT NULL REFERENCES roles(id),
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_org ON users(org_id);

CREATE TABLE drugs (
    drug_code VARCHAR(24) PRIMARY KEY,        -- รหัส TMT 24-digit
    generic_name VARCHAR(255) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    controlled_flag BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,  -- soft-delete: ซ่อนจาก dropdown แต่คงประวัติ transaction เดิมไว้
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE drug_code_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    local_code VARCHAR(50) NOT NULL,          -- รหัสยาใน JHIIS/HosXP_PCU
    drug_code VARCHAR(24) NOT NULL REFERENCES drugs(drug_code),
    UNIQUE (org_id, local_code)
);

CREATE TYPE warehouse_type AS ENUM ('PROVINCIAL','CUP','PCU');
CREATE TABLE warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(255) NOT NULL,
    type warehouse_type NOT NULL
);

CREATE TABLE stock_lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    drug_code VARCHAR(24) NOT NULL REFERENCES drugs(drug_code),
    lot_no VARCHAR(50) NOT NULL,
    expiry_date DATE NOT NULL,
    qty_on_hand NUMERIC(12,2) NOT NULL DEFAULT 0,   -- derived cache จาก stock_ledger
    unit_cost NUMERIC(12,4),
    UNIQUE (warehouse_id, drug_code, lot_no)
);
CREATE INDEX idx_stock_lots_fefo ON stock_lots(warehouse_id, drug_code, expiry_date);

CREATE TYPE ledger_txn_type AS ENUM ('RECEIPT','ISSUE','ADJUSTMENT','DISPENSE','RETURN');
CREATE TABLE stock_ledger (
    id BIGSERIAL,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    drug_code VARCHAR(24) NOT NULL REFERENCES drugs(drug_code),
    lot_no VARCHAR(50) NOT NULL,
    txn_type ledger_txn_type NOT NULL,
    qty NUMERIC(12,2) NOT NULL,              -- ค่าลบสำหรับ ISSUE/DISPENSE
    balance_after NUMERIC(12,2) NOT NULL,
    unit_cost NUMERIC(12,4),                 -- ราคาต่อหน่วย ณ เวลารับเข้า (RECEIPT) — เก็บที่นี่แทน stock_lots เพื่อไม่ให้ประวัติราคาถูกเขียนทับ
    ref_type VARCHAR(30),                    -- 'REQUISITION' | 'DISPENSING_EVENT' | 'RECEIPT'
    ref_id UUID,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- ตัวอย่าง partition รายเดือน (สร้างล่วงหน้าด้วย pg_partman หรือ scheduled job)
CREATE TABLE stock_ledger_2026_07 PARTITION OF stock_ledger
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

-- DEFAULT partition กันไว้ไม่ให้ insert พังถ้า pg_partman/scheduled job ยังสร้าง partition เดือนนั้นไม่ทัน
CREATE TABLE stock_ledger_default PARTITION OF stock_ledger DEFAULT;

CREATE INDEX idx_stock_ledger_lookup ON stock_ledger(warehouse_id, drug_code, lot_no, created_at);

-- ledger คือ source of truth เสมอ; qty_on_hand ใน stock_lots เป็นแค่ cache
CREATE OR REPLACE FUNCTION fn_apply_stock_ledger() RETURNS TRIGGER AS $$
BEGIN
    UPDATE stock_lots
       SET qty_on_hand = NEW.balance_after
     WHERE warehouse_id = NEW.warehouse_id
       AND drug_code = NEW.drug_code
       AND lot_no = NEW.lot_no;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_ledger_apply
    AFTER INSERT ON stock_ledger
    FOR EACH ROW EXECUTE FUNCTION fn_apply_stock_ledger();

CREATE TYPE requisition_status AS ENUM (
    'DRAFT','PENDING_CUP_APPROVAL','PENDING_PROVINCE_APPROVAL',
    'CUP_APPROVED','PROVINCE_APPROVED','REJECTED','CANCELLED',
    'IN_TRANSIT','ARRIVED_PENDING_CONFIRM','DISCREPANCY_OPEN','CLOSED'
);
CREATE TABLE requisitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_org_id UUID NOT NULL REFERENCES organizations(id),
    target_org_id UUID NOT NULL REFERENCES organizations(id),
    status requisition_status NOT NULL DEFAULT 'DRAFT',
    priority VARCHAR(10) NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgent')),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_requisitions_status ON requisitions(status);
CREATE INDEX idx_requisitions_requester ON requisitions(requester_org_id);

CREATE TABLE requisition_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requisition_id UUID NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
    drug_code VARCHAR(24) NOT NULL REFERENCES drugs(drug_code),
    qty_requested NUMERIC(12,2) NOT NULL CHECK (qty_requested > 0),
    qty_approved NUMERIC(12,2),
    qty_received NUMERIC(12,2),
    lot_no VARCHAR(50)
);
CREATE INDEX idx_requisition_items_req ON requisition_items(requisition_id);

CREATE TABLE discrepancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requisition_item_id UUID NOT NULL REFERENCES requisition_items(id),
    reported_qty NUMERIC(12,2) NOT NULL,
    actual_qty NUMERIC(12,2) NOT NULL,
    reason TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id)
);

CREATE TABLE dispensing_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    drug_code VARCHAR(24) NOT NULL REFERENCES drugs(drug_code),
    lot_no VARCHAR(50) NOT NULL,
    encounter_ref VARCHAR(100) NOT NULL,        -- pseudo-ID จาก HIS ไม่ใช่ HN ตรง (PDPA minimization)
    qty_dispensed NUMERIC(12,2) NOT NULL CHECK (qty_dispensed > 0),
    dispensed_by UUID REFERENCES users(id),
    dispensed_at TIMESTAMPTZ NOT NULL,
    source_system VARCHAR(20) NOT NULL CHECK (source_system IN ('JHIIS','HosXP_PCU','MANUAL')),
    idempotency_key VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_dispensing_events_org_drug ON dispensing_events(org_id, drug_code, dispensed_at);

CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    before_value JSONB,
    after_value JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- append-only: จำกัดสิทธิ์ระดับ DB ให้ application role เขียนได้แค่ INSERT/SELECT
-- REVOKE UPDATE, DELETE ON audit_logs FROM app_role;
