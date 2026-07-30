"use client";

import { useEffect, useMemo, useState } from "react";
import { useScheduleStore } from "@/lib/store";
import { listTeachersBasic, type TeacherBasic } from "@/app/actions/teachers";

export default function StudentManagement() {
  const initialized = useScheduleStore((s) => s.initialized);
  const loading = useScheduleStore((s) => s.loading);
  const storeError = useScheduleStore((s) => s.error);
  const fetchAll = useScheduleStore((s) => s.fetchAll);
  const students = useScheduleStore((s) => s.students);
  const subjects = useScheduleStore((s) => s.subjects);
  const studentSubjects = useScheduleStore((s) => s.studentSubjects);
  const assignments = useScheduleStore((s) => s.assignments);
  const addStudent = useScheduleStore((s) => s.addStudent);
  const deleteStudent = useScheduleStore((s) => s.deleteStudent);
  const addStudentSubject = useScheduleStore((s) => s.addStudentSubject);
  const removeStudentSubject = useScheduleStore((s) => s.removeStudentSubject);
  const setStudentTeacher = useScheduleStore((s) => s.setStudentTeacher);

  useEffect(() => {
    if (!initialized) fetchAll();
  }, [initialized, fetchAll]);

  const [teachers, setTeachers] = useState<TeacherBasic[]>([]);
  useEffect(() => {
    listTeachersBasic()
      .then(setTeachers)
      .catch(() => setTeachers([]));
  }, []);

  const [newName, setNewName] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [subjectToAddByStudent, setSubjectToAddByStudent] = useState<Record<string, string>>({});
  const [subjectBusyByStudent, setSubjectBusyByStudent] = useState<Record<string, boolean>>({});
  const [teacherBusyByStudent, setTeacherBusyByStudent] = useState<Record<string, boolean>>({});

  const assignmentCountByStudent = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of assignments) {
      map.set(a.studentId, (map.get(a.studentId) ?? 0) + 1);
    }
    return map;
  }, [assignments]);

  const studentSubjectsByStudent = useMemo(() => {
    const map = new Map<string, typeof studentSubjects>();
    for (const ss of studentSubjects) {
      if (!map.has(ss.studentId)) map.set(ss.studentId, []);
      map.get(ss.studentId)!.push(ss);
    }
    return map;
  }, [studentSubjects]);

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

  async function handleAddSubject(studentId: string) {
    const subjectId = subjectToAddByStudent[studentId];
    if (!subjectId) return;
    setActionError(null);
    setSubjectBusyByStudent((prev) => ({ ...prev, [studentId]: true }));
    try {
      await addStudentSubject(studentId, subjectId);
      setSubjectToAddByStudent((prev) => ({ ...prev, [studentId]: "" }));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubjectBusyByStudent((prev) => ({ ...prev, [studentId]: false }));
    }
  }

  async function handleRemoveSubject(studentId: string, studentSubjectId: string) {
    setActionError(null);
    setSubjectBusyByStudent((prev) => ({ ...prev, [studentId]: true }));
    try {
      await removeStudentSubject(studentSubjectId);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubjectBusyByStudent((prev) => ({ ...prev, [studentId]: false }));
    }
  }

  async function handleTeacherChange(studentId: string, teacherId: string) {
    setActionError(null);
    setTeacherBusyByStudent((prev) => ({ ...prev, [studentId]: true }));
    try {
      await setStudentTeacher(studentId, teacherId || null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setTeacherBusyByStudent((prev) => ({ ...prev, [studentId]: false }));
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
            placeholder="예: 임민영"
          />
        </label>
        <button
          className="bg-blue-600 text-white rounded px-4 py-2 transition-colors duration-150 hover:bg-blue-700 hover:shadow-md disabled:opacity-40 disabled:hover:bg-blue-600 disabled:hover:shadow-none"
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
          const enrolled = studentSubjectsByStudent.get(s.id) ?? [];
          const enrolledSubjectIds = new Set(enrolled.map((ss) => ss.subjectId));
          const availableSubjects = subjects.filter((sub) => !enrolledSubjectIds.has(sub.id));
          const subjectBusy = subjectBusyByStudent[s.id] ?? false;

          return (
            <div key={s.id} className="border rounded p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-gray-500">배정 {count}건</span>
                  <select
                    className="border rounded px-1.5 py-0.5 text-xs"
                    value={s.teacherId ?? ""}
                    disabled={teacherBusyByStudent[s.id] ?? false}
                    onChange={(e) => handleTeacherChange(s.id, e.target.value)}
                  >
                    <option value="">담당 선생님 없음</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {isPending ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-600">
                      정말 삭제할까요? {count > 0 && `(배정 기록 ${count}건도 함께 삭제됨)`}
                    </span>
                    <button
                      className="text-xs bg-red-600 text-white rounded px-2 py-1 transition-colors duration-150 hover:bg-red-700 hover:shadow-md disabled:opacity-40 disabled:hover:bg-red-600 disabled:hover:shadow-none"
                      disabled={busy}
                      onClick={() => handleConfirmDelete(s.id)}
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
                  <button
                    className="text-xs text-gray-500 transition-colors hover:text-red-600"
                    onClick={() => setPendingDeleteId(s.id)}
                  >
                    삭제
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {enrolled.length === 0 && (
                  <span className="text-xs text-gray-400">등록된 과목 없음</span>
                )}
                {enrolled.map((ss) => {
                  const subjectName = subjects.find((sub) => sub.id === ss.subjectId)?.name ?? "(알 수 없음)";
                  return (
                    <span
                      key={ss.id}
                      className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs px-2 py-0.5"
                    >
                      {subjectName}
                      <button
                        className="text-blue-400 transition-colors hover:text-red-600 disabled:opacity-40"
                        disabled={subjectBusy}
                        onClick={() => handleRemoveSubject(s.id, ss.id)}
                        aria-label={`${subjectName} 과목 제거`}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}

                {availableSubjects.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <select
                      className="border rounded px-1.5 py-0.5 text-xs"
                      value={subjectToAddByStudent[s.id] ?? ""}
                      disabled={subjectBusy}
                      onChange={(e) =>
                        setSubjectToAddByStudent((prev) => ({ ...prev, [s.id]: e.target.value }))
                      }
                    >
                      <option value="">+ 과목 추가</option>
                      {availableSubjects.map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {sub.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="text-xs border rounded px-2 py-0.5 transition-colors duration-150 hover:bg-gray-50 hover:shadow-sm dark:hover:bg-neutral-800 disabled:opacity-40"
                      disabled={subjectBusy || !subjectToAddByStudent[s.id]}
                      onClick={() => handleAddSubject(s.id)}
                    >
                      추가
                    </button>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
