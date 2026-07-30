"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listTeachers,
  createTeacher,
  regenerateTeacherPassword,
  deleteTeacher,
  type TeacherSummary,
} from "@/app/actions/teachers";
import { useScheduleStore } from "@/lib/store";

export default function TeacherManagement() {
  const [teachers, setTeachers] = useState<TeacherSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const studentsInitialized = useScheduleStore((s) => s.initialized);
  const fetchStudents = useScheduleStore((s) => s.fetchAll);
  const students = useScheduleStore((s) => s.students);

  useEffect(() => {
    if (!studentsInitialized) fetchStudents();
  }, [studentsInitialized, fetchStudents]);

  const studentsByTeacherId = useMemo(() => {
    const map = new Map<string, typeof students>();
    for (const s of students) {
      if (!s.teacherId) continue;
      if (!map.has(s.teacherId)) map.set(s.teacherId, []);
      map.get(s.teacherId)!.push(s);
    }
    return map;
  }, [students]);

  const [expandedTeacherId, setExpandedTeacherId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [revealedPassword, setRevealedPassword] = useState<{
    teacherId: string;
    teacherName: string;
    password: string;
  } | null>(null);

  async function reload() {
    try {
      setTeachers(await listTeachers());
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    setActionError(null);
    setBusy(true);
    try {
      const { teacher, password } = await createTeacher(name);
      setNewName("");
      setRevealedPassword({ teacherId: teacher.id, teacherName: teacher.name, password });
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleRegenerate(teacherId: string, teacherName: string) {
    setActionError(null);
    setBusy(true);
    try {
      const password = await regenerateTeacherPassword(teacherId);
      setRevealedPassword({ teacherId, teacherName, password });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmDelete(teacherId: string) {
    setActionError(null);
    setBusy(true);
    try {
      await deleteTeacher(teacherId);
      setPendingDeleteId(null);
      if (revealedPassword?.teacherId === teacherId) setRevealedPassword(null);
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return <div className="p-6 text-sm text-red-600">데이터를 불러오지 못했습니다: {loadError}</div>;
  }

  if (teachers === null) {
    return <div className="p-6 text-sm text-gray-500">불러오는 중...</div>;
  }

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-6 text-sm">
      <h1 className="text-xl font-bold">선생님 관리</h1>

      {actionError && <p className="text-red-600">{actionError}</p>}

      {revealedPassword && (
        <section className="border border-blue-300 bg-blue-50 dark:bg-blue-950 rounded p-4 space-y-1">
          <p className="font-medium">
            {revealedPassword.teacherName} 선생님 비밀번호가 발급되었습니다
          </p>
          <p className="font-mono text-lg tracking-wide">{revealedPassword.password}</p>
          <p className="text-xs text-gray-500">
            이 비밀번호는 지금만 볼 수 있습니다. 선생님께 전달해주세요.
          </p>
          <button
            className="text-xs border rounded px-2 py-1 mt-1 transition-colors duration-150 hover:bg-gray-50 hover:shadow-sm dark:hover:bg-neutral-800"
            onClick={() => setRevealedPassword(null)}
          >
            닫기
          </button>
        </section>
      )}

      <section className="flex items-end gap-2 border rounded p-4">
        <label className="flex flex-col gap-1 flex-1">
          <span className="font-medium">선생님 이름</span>
          <input
            className="border rounded px-2 py-1"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            placeholder="예: 김민준"
          />
        </label>
        <button
          className="bg-blue-600 text-white rounded px-4 py-2 transition-colors duration-150 hover:bg-blue-700 hover:shadow-md disabled:opacity-40 disabled:hover:bg-blue-600 disabled:hover:shadow-none"
          onClick={handleAdd}
          disabled={busy || !newName.trim()}
        >
          추가 (비밀번호 자동 생성)
        </button>
      </section>

      <section className="space-y-2">
        {teachers.length === 0 && (
          <p className="border rounded p-4 text-gray-500">등록된 선생님이 없습니다.</p>
        )}
        {teachers.map((t) => {
          const isPending = pendingDeleteId === t.id;
          const isExpanded = expandedTeacherId === t.id;
          const assignedStudents = studentsByTeacherId.get(t.id) ?? [];
          return (
            <div key={t.id} className="border rounded p-3 space-y-2">
              <div className="flex items-center justify-between">
                <button
                  className="font-medium text-left transition-colors hover:text-blue-600"
                  onClick={() => setExpandedTeacherId(isExpanded ? null : t.id)}
                >
                  {t.name}
                  <span className="ml-2 text-xs text-gray-500">
                    학생 {assignedStudents.length}명
                  </span>
                </button>

                {isPending ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-600">정말 삭제할까요?</span>
                    <button
                      className="text-xs bg-red-600 text-white rounded px-2 py-1 transition-colors duration-150 hover:bg-red-700 hover:shadow-md disabled:opacity-40 disabled:hover:bg-red-600 disabled:hover:shadow-none"
                      disabled={busy}
                      onClick={() => handleConfirmDelete(t.id)}
                    >
                      확인
                    </button>
                    <button
                      className="text-xs border rounded px-2 py-1 transition-colors duration-150 hover:bg-gray-50 hover:shadow-sm dark:hover:bg-neutral-800"
                      disabled={busy}
                      onClick={() => setPendingDeleteId(null)}
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button
                      className="text-xs border rounded px-2 py-1 transition-colors duration-150 hover:bg-gray-50 hover:shadow-sm dark:hover:bg-neutral-800 disabled:opacity-40"
                      disabled={busy}
                      onClick={() => handleRegenerate(t.id, t.name)}
                    >
                      비밀번호 재발급
                    </button>
                    <button
                      className="text-xs text-gray-500 transition-colors hover:text-red-600"
                      onClick={() => setPendingDeleteId(t.id)}
                    >
                      삭제
                    </button>
                  </div>
                )}
              </div>

              {isExpanded && (
                <div className="border-t pt-2 text-xs">
                  {assignedStudents.length === 0 ? (
                    <p className="text-gray-500">배정된 학생이 없습니다.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {assignedStudents.map((s) => (
                        <span
                          key={s.id}
                          className="rounded-full bg-gray-100 dark:bg-neutral-800 px-2 py-0.5"
                        >
                          {s.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
