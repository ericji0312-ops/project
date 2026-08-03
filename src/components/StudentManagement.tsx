"use client";

import { useEffect, useMemo, useState } from "react";
import { useScheduleStore } from "@/lib/store";
import { listTeachersBasic, type TeacherBasic } from "@/app/actions/teachers";
import type { CurrentSession } from "@/lib/session";

export default function StudentManagement({ session }: { session: CurrentSession | null }) {
  const isTeacher = session?.role === "teacher";
  const ownTeacherId = session?.teacherId;

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

  // "전체" | "unassigned" | teacherId
  // 선생님 계정은 실수로 다른 선생님 학생을 잘못 배정하는 일을 막기 위해 항상 본인 학생으로 고정한다.
  const [teacherFilter, setTeacherFilter] = useState<string>(
    isTeacher && ownTeacherId ? ownTeacherId : "all"
  );
  const [countSort, setCountSort] = useState<"asc" | "desc" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

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

  const visibleStudents = useMemo(() => {
    let list = students;

    if (teacherFilter === "unassigned") {
      list = list.filter((s) => !s.teacherId);
    } else if (teacherFilter !== "all") {
      list = list.filter((s) => s.teacherId === teacherFilter);
    }

    const query = searchQuery.trim().toLowerCase();
    if (query) {
      list = list.filter((s) => s.name.toLowerCase().includes(query));
    }

    if (countSort) {
      list = [...list].sort((a, b) => {
        const diff =
          (assignmentCountByStudent.get(a.id) ?? 0) - (assignmentCountByStudent.get(b.id) ?? 0);
        return countSort === "asc" ? diff : -diff;
      });
    }

    return list;
  }, [students, teacherFilter, searchQuery, countSort, assignmentCountByStudent]);

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    setActionError(null);
    setBusy(true);
    try {
      await addStudent(name, isTeacher ? ownTeacherId : undefined);
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

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {isTeacher ? (
              <>
                <button
                  className={`rounded-full px-3 py-1 text-xs transition-colors duration-150 ${
                    teacherFilter === ownTeacherId
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "border text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-neutral-800"
                  }`}
                  onClick={() => setTeacherFilter(ownTeacherId ?? "all")}
                >
                  내 학생
                </button>
                <button
                  className={`rounded-full px-3 py-1 text-xs transition-colors duration-150 ${
                    teacherFilter === "unassigned"
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "border text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-neutral-800"
                  }`}
                  onClick={() => setTeacherFilter("unassigned")}
                  title="아직 담당 선생님이 지정되지 않은 학생 — 여기서 찾아 담당 선생님 칸에서 나를 지정할 수 있습니다"
                >
                  미배정
                </button>
              </>
            ) : (
              <>
                <button
                  className={`rounded-full px-3 py-1 text-xs transition-colors duration-150 ${
                    teacherFilter === "all"
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "border text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-neutral-800"
                  }`}
                  onClick={() => setTeacherFilter("all")}
                >
                  전체
                </button>
                {teachers.map((t) => (
                  <button
                    key={t.id}
                    className={`rounded-full px-3 py-1 text-xs transition-colors duration-150 ${
                      teacherFilter === t.id
                        ? "bg-blue-600 text-white hover:bg-blue-700"
                        : "border text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-neutral-800"
                    }`}
                    onClick={() => setTeacherFilter(t.id)}
                  >
                    {t.name}
                  </button>
                ))}
                <button
                  className={`rounded-full px-3 py-1 text-xs transition-colors duration-150 ${
                    teacherFilter === "unassigned"
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "border text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-neutral-800"
                  }`}
                  onClick={() => setTeacherFilter("unassigned")}
                >
                  미배정
                </button>
              </>
            )}
          </div>

          <input
            className="border rounded px-2 py-1 text-xs ml-auto"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="이름 검색"
          />
        </div>

        {students.length === 0 ? (
          <p className="border rounded p-4 text-gray-500">등록된 학생이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto border rounded">
            <table className="w-full border-collapse table-fixed text-xs">
              <colgroup>
                <col className="w-24" />
                <col className="w-20" />
                <col className="w-32" />
                <col />
                <col className="w-24" />
              </colgroup>
              <thead>
                <tr className="bg-gray-100 dark:bg-neutral-800">
                  <th className="border px-2 py-1 text-left">이름</th>
                  <th className="border px-2 py-1 text-left">
                    <button
                      className="flex items-center gap-1 transition-colors hover:text-blue-600"
                      onClick={() =>
                        setCountSort((prev) => (prev === "asc" ? "desc" : "asc"))
                      }
                    >
                      배정건수
                      <span className="text-[10px]">
                        {countSort === "asc" ? "▲" : countSort === "desc" ? "▼" : "–"}
                      </span>
                    </button>
                  </th>
                  <th className="border px-2 py-1 text-left">담당 선생님</th>
                  <th className="border px-2 py-1 text-left">과목</th>
                  <th className="border px-2 py-1 text-left">삭제</th>
                </tr>
              </thead>
              <tbody>
                {visibleStudents.length === 0 && (
                  <tr>
                    <td colSpan={5} className="border px-2 py-3 text-center text-gray-500">
                      조건에 맞는 학생이 없습니다.
                    </td>
                  </tr>
                )}
                {visibleStudents.map((s) => {
                  const count = assignmentCountByStudent.get(s.id) ?? 0;
                  const isPending = pendingDeleteId === s.id;
                  const enrolled = studentSubjectsByStudent.get(s.id) ?? [];
                  const enrolledSubjectIds = new Set(enrolled.map((ss) => ss.subjectId));
                  const availableSubjects = subjects.filter(
                    (sub) => !enrolledSubjectIds.has(sub.id)
                  );
                  const subjectBusy = subjectBusyByStudent[s.id] ?? false;

                  return (
                    <tr
                      key={s.id}
                      className={count === 0 ? "bg-red-50/60 dark:bg-red-950/20" : ""}
                    >
                      <td className="border px-2 py-1 align-top font-medium truncate">
                        {s.name}
                      </td>
                      <td className="border px-2 py-1 align-top">
                        {count === 0 ? (
                          <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 px-2 py-0.5">
                            미배정
                          </span>
                        ) : (
                          <span>{count}건</span>
                        )}
                      </td>
                      <td className="border px-2 py-1 align-top">
                        <select
                          className="border rounded px-1.5 py-0.5 w-full"
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
                      </td>
                      <td className="border px-2 py-1 align-top">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {enrolled.length === 0 && (
                            <span className="text-gray-400">등록된 과목 없음</span>
                          )}
                          {enrolled.map((ss) => {
                            const subjectName =
                              subjects.find((sub) => sub.id === ss.subjectId)?.name ??
                              "(알 수 없음)";
                            return (
                              <span
                                key={ss.id}
                                className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2 py-0.5"
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
                                className="border rounded px-1.5 py-0.5"
                                value={subjectToAddByStudent[s.id] ?? ""}
                                disabled={subjectBusy}
                                onChange={(e) =>
                                  setSubjectToAddByStudent((prev) => ({
                                    ...prev,
                                    [s.id]: e.target.value,
                                  }))
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
                                className="border rounded px-2 py-0.5 transition-colors duration-150 hover:bg-gray-50 hover:shadow-sm dark:hover:bg-neutral-800 disabled:opacity-40"
                                disabled={subjectBusy || !subjectToAddByStudent[s.id]}
                                onClick={() => handleAddSubject(s.id)}
                              >
                                추가
                              </button>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="border px-2 py-1 align-top">
                        {isPending ? (
                          <div className="flex flex-col items-start gap-1">
                            <span className="text-red-600">
                              삭제할까요?{count > 0 && ` (배정 ${count}건 삭제)`}
                            </span>
                            <div className="flex gap-1">
                              <button
                                className="bg-red-600 text-white rounded px-2 py-0.5 transition-colors duration-150 hover:bg-red-700 hover:shadow-md disabled:opacity-40 disabled:hover:bg-red-600 disabled:hover:shadow-none"
                                disabled={busy}
                                onClick={() => handleConfirmDelete(s.id)}
                              >
                                확인
                              </button>
                              <button
                                className="border rounded px-2 py-0.5 transition-colors duration-150 hover:bg-gray-50 hover:shadow-sm dark:hover:bg-neutral-800"
                                disabled={busy}
                                onClick={() => setPendingDeleteId(null)}
                              >
                                취소
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            className="text-gray-500 transition-colors hover:text-red-600"
                            onClick={() => setPendingDeleteId(s.id)}
                          >
                            삭제
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
