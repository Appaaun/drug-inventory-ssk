import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE, SessionPayload } from "@/lib/auth";

function homeForSession(session: SessionPayload) {
  if (session.role === "PROVINCE_ADMIN") return "/admin";
  if (session.role === "CUP_MANAGER") return "/cup";
  return "/pcu";
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  // /api/auth/* จัดการ auth state ของตัวเองอยู่แล้ว (login/logout/me) ไม่ต้องเช็ค session ที่นี่ซ้ำ
  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  const isProtectedPage =
    pathname.startsWith("/admin") || pathname.startsWith("/pcu") || pathname.startsWith("/cup");
  const isApi = pathname.startsWith("/api/");

  if (!session) {
    if (isProtectedPage) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (isApi) {
      // ทุก endpoint ต้อง login ก่อน (ทั้ง GET/POST/PATCH/DELETE) — role/ownership เช็คเพิ่มในแต่ละ route handler
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // role gating ระดับหน้า
  if (pathname.startsWith("/admin") && session.role !== "PROVINCE_ADMIN") {
    return NextResponse.redirect(new URL(homeForSession(session), request.url));
  }
  if (pathname.startsWith("/cup") && session.role !== "CUP_MANAGER") {
    return NextResponse.redirect(new URL(homeForSession(session), request.url));
  }
  if (pathname.startsWith("/pcu") && session.orgType !== "PCU") {
    return NextResponse.redirect(new URL(homeForSession(session), request.url));
  }

  // ส่งค่า session ที่ verify แล้วผ่าน header ที่เชื่อถือได้ (เขียนทับค่าที่ client ส่งมาเสมอ)
  // เพื่อให้ route handler ปลายทางใช้ตรวจสิทธิ์ต่อได้โดยไม่ต้อง verify JWT ซ้ำ
  const headers = new Headers(request.headers);
  headers.set("x-user-id", session.sub);
  headers.set("x-user-role", session.role);
  headers.set("x-user-org-id", session.orgId);
  headers.set("x-user-org-type", session.orgType);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/admin/:path*", "/pcu/:path*", "/cup/:path*", "/api/:path*"],
};
