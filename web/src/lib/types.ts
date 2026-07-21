export type Organization = {
  id: string;
  name: string;
  type: "PROVINCE" | "CUP" | "PCU";
  parent_org_id: string | null;
  parent_name?: string | null;
};

export type UserAccount = {
  id: string;
  username: string;
  is_active: boolean;
  created_at: string;
  role_name: "PROVINCE_ADMIN" | "CUP_MANAGER" | "PCU_REQUESTER";
  org_name: string;
};

export type Drug = {
  drug_code: string;
  generic_name: string;
  unit: string;
  controlled_flag: boolean;
  is_active?: boolean;
};

export type PriceHistoryEntry = {
  created_at: string;
  unit_cost: string;
  qty: string;
  lot_no: string;
  warehouse_name: string;
};

export type StockRow = {
  drug_code: string;
  generic_name: string;
  unit: string;
  lot_no: string;
  expiry_date: string;
  qty_on_hand: string;
  warehouse_name: string;
};

export type RequisitionItem = {
  drug_code: string;
  generic_name: string;
  qty_requested: number;
  qty_approved: number | null;
  qty_received: number | null;
};

export type Requisition = {
  id: string;
  status: string;
  priority: string;
  created_at: string;
  requester_name: string;
  target_name: string;
  items: RequisitionItem[];
};
