import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(request: Request) {
  const showAll = new URL(request.url).searchParams.get("all") === "true";
  const { rows } = await pool.query(
    `SELECT drug_code, generic_name, unit, controlled_flag, is_active
     FROM drugs
     WHERE ($1::boolean IS TRUE OR is_active = true)
     ORDER BY generic_name`,
    [showAll]
  );
  return NextResponse.json(rows);
}
