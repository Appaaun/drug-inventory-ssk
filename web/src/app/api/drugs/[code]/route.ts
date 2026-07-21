import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTrustedUser } from "@/lib/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const user = getTrustedUser(request);
  if (!user || user.role !== "PROVINCE_ADMIN") {
    return NextResponse.json({ error: "เฉพาะ อบจ. เท่านั้นที่แก้ไขรายการยาได้" }, { status: 403 });
  }

  const { code } = await params;
  const body = await request.json();
  const { genericName, unit, controlledFlag, isActive } = body as {
    genericName?: string;
    unit?: string;
    controlledFlag?: boolean;
    isActive?: boolean;
  };

  const { rows } = await pool.query(
    `UPDATE drugs
     SET generic_name = COALESCE($2, generic_name),
         unit = COALESCE($3, unit),
         controlled_flag = COALESCE($4, controlled_flag),
         is_active = COALESCE($5, is_active)
     WHERE drug_code = $1
     RETURNING drug_code, generic_name, unit, controlled_flag, is_active`,
    [code, genericName ?? null, unit ?? null, controlledFlag ?? null, isActive ?? null]
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: "ไม่พบยานี้" }, { status: 404 });
  }
  return NextResponse.json(rows[0]);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const user = getTrustedUser(request);
  if (!user || user.role !== "PROVINCE_ADMIN") {
    return NextResponse.json({ error: "เฉพาะ อบจ. เท่านั้นที่ปิดใช้งานรายการยาได้" }, { status: 403 });
  }

  const { code } = await params;
  const { rows } = await pool.query(
    `UPDATE drugs SET is_active = false WHERE drug_code = $1
     RETURNING drug_code, is_active`,
    [code]
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: "ไม่พบยานี้" }, { status: 404 });
  }
  return NextResponse.json(rows[0]);
}
