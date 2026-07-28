"use client";

import { useEffect, useMemo, useState } from "react";
import { useScheduleStore } from "@/lib/store";

export default function StudentManagement() {
  const initialized = useScheduleStore((s) => s.initialized);
  const loading = useScheduleStore((s) => s.loading);
  const storeError = useScheduleStore((s) => s.error);
  const fetchAll = useScheduleStore((s) => s.fetchAll);
  const students = useScheduleStore((s) => s.students);
  const assignments = useScheduleStore((s) => s.assignments);
  const addStudent = useScheduleStore((s) => s.addStudent);
  const deleteStudent = useScheduleStore((s) => s.deleteStudent);

  useEffect(() => {
    if (!initialized) fetchAll();
  }, [initialized, fetchAll]);

  const [newName, setNewName] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const assignmentCountByStudent = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of assignments) {
      map.set(a.studentId, (map.get(a.studentId) ?? 0) + 1);
    }
    return map;
  }, [assignments]);

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    setActionError(null);
    setBusy(true);
    try {
      await addStudent(name);
      setNewName("");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmDelete(studentId: string) {
    setActionError(null);
    setBusy(true);
    try {
      await deleteStudent(studentId);
      setPendingDeleteId(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !initialized) {
    return <div className="p-6 text-sm text-gray-500">불러오는 중...</div>;
  }

  if (storeError) {
    return <div className="p-6 text-sm text-red-600">데이터를 불러오지 못했습니다: {storeError}</div>;
  }

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-6 text-sm">
      <h1 className="text-xl font-bold">학생 관리</h1>

      {actionError && <p className="text-red-600">{actionError}</p>}

      <section className="flex items-end gap-2 border rounded p-4">
        <label className="flex flex-col gap-1 flex-1">
          <span className="font-medium">학생 이름</span>
          <input
            className="border rounded px-2 py-1"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            placeholder="예: 김하은"
          />
        </label>
        <button
          className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-40"
          onClick={handleAdd}
          disabled={busy || !newName.trim()}
        >
          추가
        </button>
      </section>

      <section className="space-y-2">
        {students.length === 0 && (
          <p className="border rounded p-4 text-gray-500">등록된 학생이 없습니다.</p>
        )}
        {students.map((s) => {
          const count = assignmentCountByStudent.get(s.id) ?? 0;
          const isPending = pendingDeleteId === s.id;
          return (
            <div key={s.id} className="flex items-center justify-between border rounded p-3">
              <div>
                <span className="font-medium">{s.name}</span>
                <span className="ml-2 text-xs text-gray-500">배정 {count}건</span>
              </div>

              {isPending ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600">
                    정말 삭제할까요? {count > 0 && `(배정 기록 ${count}건도 함께 삭제됨)`}
                  </span>
                  <button
                    className="text-xs bg-red-600 text-white rounded px-2 py-1 disabled:opacity-40"
                    disabled={busy}
                    onClick={() => handleConfirmDelete(s.id)}
                  >
                    확인
                  </button>
                  <button
                    className="text-xs border rounded px-2 py-1"
                    disabled={busy}
                    onClick={() => setPendingDeleteId(null)}
                  >
                    취소
                  </button>
                </div>
              ) : (
                <button
                  className="text-xs text-gray-500 hover:text-red-600"
                  onClick={() => setPendingDeleteId(s.id)}
                >
                  삭제
                </button>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
