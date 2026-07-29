import "server-only";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";

const SESSION_COOKIE = "session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30일

const secretKey = process.env.AUTH_SECRET;
if (!secretKey) {
  throw new Error("AUTH_SECRET 환경변수가 설정되지 않았습니다.");
}
const encodedKey = new TextEncoder().encode(secretKey);

export type SessionRole = "admin" | "teacher";

interface SessionPayload extends JWTPayload {
  authenticated: boolean;
  role: SessionRole;
  teacherId?: string;
  teacherName?: string;
}

export interface CreateSessionInput {
  role: SessionRole;
  teacherId?: string;
  teacherName?: string;
}

async function encrypt(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(encodedKey);
}

export async function decrypt(token?: string): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, encodedKey, {
      algorithms: ["HS256"],
    });
    return payload;
  } catch {
    return null;
  }
}

export async function createSession(input: CreateSessionInput) {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const session = await encrypt({
    authenticated: true,
    role: input.role,
    teacherId: input.teacherId,
    teacherName: input.teacherName,
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export interface CurrentSession {
  role: SessionRole;
  teacherId?: string;
  teacherName?: string;
}

export async function getSession(): Promise<CurrentSession | null> {
  const cookieStore = await cookies();
  const session = await decrypt(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session?.authenticated) return null;
  return {
    // 이 기능 배포 전에 발급된 세션 쿠키는 role이 없다 — 그때는 공유 비밀번호 로그인만
    // 존재했으므로 관리자로 취급한다 (재로그인 강제 없이 하위 호환).
    role: session.role ?? "admin",
    teacherId: session.teacherId,
    teacherName: session.teacherName,
  };
}
