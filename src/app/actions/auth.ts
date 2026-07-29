"use server";

import { redirect } from "next/navigation";
import { createSession, deleteSession } from "@/lib/session";
import { supabase } from "@/lib/supabaseClient";
import { verifyPassword } from "@/lib/password";

export interface LoginState {
  error?: string;
}

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const password = formData.get("password");

  if (typeof password !== "string" || password.length === 0) {
    return { error: "비밀번호를 입력해주세요." };
  }

  if (password === process.env.SHARED_PASSWORD) {
    await createSession({ role: "admin" });
    redirect("/");
  }

  const { data: teachers, error } = await supabase
    .from("teachers")
    .select("id, name, password_hash");
  if (error) {
    return { error: "로그인 중 오류가 발생했습니다." };
  }

  const matched = teachers?.find((t) => verifyPassword(password, t.password_hash));
  if (!matched) {
    return { error: "비밀번호가 올바르지 않습니다." };
  }

  await createSession({ role: "teacher", teacherId: matched.id, teacherName: matched.name });
  redirect("/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
