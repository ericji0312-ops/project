"use server";

import { getSession } from "@/lib/session";
import { supabase } from "@/lib/supabaseClient";
import { generatePassword, hashPassword } from "@/lib/password";

export interface TeacherSummary {
  id: string;
  name: string;
  createdAt: string;
}

async function requireAdmin() {
  const session = await getSession();
  if (session?.role !== "admin") {
    throw new Error("관리자만 사용할 수 있는 기능입니다.");
  }
}

export async function listTeachers(): Promise<TeacherSummary[]> {
  await requireAdmin();

  const { data, error } = await supabase
    .from("teachers")
    .select("id, name, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  }));
}

export async function createTeacher(
  name: string
): Promise<{ teacher: TeacherSummary; password: string }> {
  await requireAdmin();

  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("이름을 입력해주세요.");

  const password = generatePassword();
  const passwordHash = hashPassword(password);

  const { data, error } = await supabase
    .from("teachers")
    .insert({ name: trimmedName, password_hash: passwordHash })
    .select("id, name, created_at")
    .single();
  if (error) throw new Error(error.message);

  return {
    teacher: { id: data.id, name: data.name, createdAt: data.created_at },
    password,
  };
}

export async function regenerateTeacherPassword(teacherId: string): Promise<string> {
  await requireAdmin();

  const password = generatePassword();
  const passwordHash = hashPassword(password);

  const { error } = await supabase
    .from("teachers")
    .update({ password_hash: passwordHash })
    .eq("id", teacherId);
  if (error) throw new Error(error.message);

  return password;
}

export async function deleteTeacher(teacherId: string): Promise<void> {
  await requireAdmin();

  const { error } = await supabase.from("teachers").delete().eq("id", teacherId);
  if (error) throw new Error(error.message);
}
