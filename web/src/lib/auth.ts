import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "session";
const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 ชั่วโมง

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  sub: string; // user id
  username: string;
  role: string;
  orgId: string;
  orgType: string;
  orgName: string;
  parentOrgId: string | null;
};

export async function signSession(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// อ่านค่าที่ proxy.ts verify แล้วเขียนทับ header ไว้ให้ — เชื่อถือได้เพราะ client
// override ค่าพวกนี้เองไม่ได้ (proxy จะเขียนทับด้วยค่าจริงจาก JWT เสมอ ก่อนถึง route handler)
export function getTrustedUser(request: Request) {
  const role = request.headers.get("x-user-role");
  const orgId = request.headers.get("x-user-org-id");
  const orgType = request.headers.get("x-user-org-type");
  const userId = request.headers.get("x-user-id");
  if (!role || !orgId || !userId) return null;
  return { userId, role, orgId, orgType };
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};
