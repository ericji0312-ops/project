"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useScheduleStore } from "@/lib/store";
import { generateCopyText, formatComponentLine, formatDateHeader, type AssignedLine } from "@/lib/textGenerator";
import type { ScheduleComponent } from "@/types/schedule";

const RECENT_DAYS = 7;
import { listTeachersBasic, type TeacherBasic } from "@/app/actions/teachers";

const TYPE_COLUMN_PRIORITY = [
  "개념",
  "연산",
  "RX",
  "쎈",
  "라이트쎈",
  "고쟁이",
  "기출의 로직(1스텝)",
  "기출의 로직(2스텝)",
  "오답노트",
];

function toISODateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODateLocal(d);
}

export default function ScheduleAssignment() {
  const initialized = useScheduleStore((s) => s.initialized);
  const loading = useScheduleStore((s) => s.loading);
  const storeError = useScheduleStore((s) => s.error);
  const fetchAll = useScheduleStore((s) => s.fetchAll);
  const subjects = useScheduleStore((s) => s.subjects);
  const curricula = useScheduleStore((s) => s.curricula);
  const scheduleItems = useScheduleStore((s) => s.scheduleItems);
  const scheduleComponents = useScheduleStore((s) => s.scheduleComponents);
  const students = useScheduleStore((s) => s.students);
  const studentSubjects = useScheduleStore((s) => s.studentSubjects);
  const assignments = useScheduleStore((s) => s.assignments);
  const createAssignments = useScheduleStore((s) => s.createAssignments);
  const resetAssignmentsForStudent = useScheduleStore((s) => s.resetAssignmentsForStudent);
  const deleteAssignment = useScheduleStore((s) => s.deleteAssignment);
  const clearCopyText = useScheduleStore((s) => s.clearCopyText);

  useEffect(() => {
    if (!initialized) fetchAll();
  }, [initialized, fetchAll]);

  const [studentId, setStudentId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [curriculumId, setCurriculumId] = useState("");

  const [teachers, setTeachers] = useState<TeacherBasic[]>([]);
  // "all" | "unassigned" | teacherId — 학생 목록을 담당 선생님으로 좁힐 때 사용.
  const [teacherFilter, setTeacherFilter] = useState<string>("all");
  // "all" | subjectId — 학생 목록을 수강 과목으로 좁힐 때 사용.
  const [studentSubjectFilter, setStudentSubjectFilter] = useState<string>("all");
  // 학생 이름 검색어 — 부분 일치로 학생 목록을 좁힐 때 사용.
  const [studentSearch, setStudentSearch] = useState("");

  useEffect(() => {
    listTeachersBasic()
      .then(setTeachers)
      .catch(() => setTeachers([]));
  }, []);

  const studentsForFilters = useMemo(() => {
    let list = students;
    if (teacherFilter === "unassigned") list = list.filter((s) => !s.teacherId);
    else if (teacherFilter !== "all") list = list.filter((s) => s.teacherId === teacherFilter);

    if (studentSubjectFilter !== "all") {
      const enrolledIds = new Set(
        studentSubjects
          .filter((ss) => ss.subjectId === studentSubjectFilter)
          .map((ss) => ss.studentId)
      );
      list = list.filter((s) => enrolledIds.has(s.id));
    }

    const query = studentSearch.trim();
    if (query) list = list.filter((s) => s.name.includes(query));

    return list;
  }, [students, teacherFilter, studentSubjectFilter, studentSubjects, studentSearch]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deadlineMode, setDeadlineMode] = useState<"auto" | "manual">("auto");
  const [autoStartDate, setAutoStartDate] = useState(toISODateLocal(new Date()));
  const [autoIntervalDays, setAutoIntervalDays] = useState(1);
  const [autoRowsPerDay, setAutoRowsPerDay] = useState(1);
  const [manualDates, setManualDates] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelingAssignmentId, setCancelingAssignmentId] = useState<string | null>(null);

  const itemById = useMemo(() => new Map(scheduleItems.map((i) => [i.id, i])), [scheduleItems]);
  const curriculumById = useMemo(() => new Map(curricula.map((c) => [c.id, c])), [curricula]);
  const componentById = useMemo(
    () => new Map(scheduleComponents.map((c) => [c.id, c])),
    [scheduleComponents]
  );

  // 학생 관리 화면에서 등록한 과목만으로 좁힌다. 아직 등록된 과목이 없는 학생(첫 배정)이면
  // 좁힐 기준이 없으므로 전체 과목을 보여준다.
  const subjectsForStudentId = useCallback(
    (sid: string) => {
      const subjectIds = new Set(
        studentSubjects.filter((ss) => ss.studentId === sid).map((ss) => ss.subjectId)
      );
      return subjectIds.size > 0 ? subjects.filter((s) => subjectIds.has(s.id)) : subjects;
    },
    [studentSubjects, subjects]
  );

  const subjectsForStudent = useMemo(
    () => subjectsForStudentId(studentId),
    [subjectsForStudentId, studentId]
  );

  useEffect(() => {
    if (studentsForFilters.length === 0) {
      if (studentId) setStudentId("");
      return;
    }
    if (!studentsForFilters.some((s) => s.id === studentId)) {
      handleStudentChange(studentsForFilters[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentsForFilters, studentId]);

  useEffect(() => {
    if (!subjectId && subjectsForStudent.length > 0) setSubjectId(subjectsForStudent[0].id);
  }, [subjectsForStudent, subjectId]);

  useEffect(() => {
    if (!curriculumId && subjectId) {
      const first = curricula.find((c) => c.subjectId === subjectId);
      if (first) setCurriculumId(first.id);
    }
  }, [subjectId, curricula, curriculumId]);

  const curriculaForSubject = useMemo(
    () => curricula.filter((c) => c.subjectId === subjectId),
    [curricula, subjectId]
  );

  const curriculum = curricula.find((c) => c.id === curriculumId) ?? null;

  const itemsForCurriculum = useMemo(
    () =>
      scheduleItems
        .filter((i) => i.curriculumId === curriculumId)
        .sort((a, b) => a.order - b.order),
    [scheduleItems, curriculumId]
  );

  const componentsByItemId = useMemo(() => {
    const map = new Map<string, ScheduleComponent[]>();
    for (const c of scheduleComponents) {
      if (!map.has(c.scheduleItemId)) map.set(c.scheduleItemId, []);
      map.get(c.scheduleItemId)!.push(c);
    }
    return map;
  }, [scheduleComponents]);

  const columns = useMemo(() => {
    if (!curriculum || !curriculum.hasTypedComponents) return ["내용"];
    const found = new Set<string>();
    for (const item of itemsForCurriculum) {
      for (const c of componentsByItemId.get(item.id) ?? []) found.add(c.type);
    }
    const ordered = TYPE_COLUMN_PRIORITY.filter((t) => found.has(t));
    const rest = [...found].filter((t) => !TYPE_COLUMN_PRIORITY.includes(t));
    return [...ordered, ...rest];
  }, [curriculum, itemsForCurriculum, componentsByItemId]);

  // 테이블에 실제 렌더되는 순서 (행 → 컬럼) — 자동 배분 시 이 순서를 기준으로 날짜를 매긴다.
  const orderedVisibleComponents = useMemo(() => {
    const list: ScheduleComponent[] = [];
    for (const item of itemsForCurriculum) {
      const comps = componentsByItemId.get(item.id) ?? [];
      if (!curriculum?.hasTypedComponents) {
        list.push(...comps);
        continue;
      }
      for (const col of columns) {
        list.push(...comps.filter((c) => c.type === col));
      }
    }
    return list;
  }, [itemsForCurriculum, componentsByItemId, columns, curriculum]);

  const currentAssignmentLines: AssignedLine[] = useMemo(() => {
    return assignments
      .filter((a) => a.studentId === studentId)
      .map((a) => {
        const component = componentById.get(a.scheduleComponentId);
        const item = component ? itemById.get(component.scheduleItemId) : undefined;
        const curriculum = item ? curriculumById.get(item.curriculumId) : undefined;
        if (!component || !curriculum) return null;
        return { deadlineDate: a.deadlineDate, curriculum, component };
      })
      .filter((x): x is AssignedLine => x !== null);
  }, [assignments, studentId, componentById, itemById, curriculumById]);

  const currentStudent = students.find((s) => s.id === studentId) ?? null;

  // 복사용 텍스트에만 쓰는 목록 — "지우기"로 숨긴 시각 이전 항목은 제외한다.
  // 배정 기록 자체(위 currentAssignmentLines, 표의 배정됨 체크)에는 영향을 주지 않는다.
  const copyableAssignmentLines: AssignedLine[] = useMemo(() => {
    const clearedAt = currentStudent?.copyClearedAt;
    return assignments
      .filter((a) => a.studentId === studentId)
      .filter((a) => !clearedAt || a.assignedAt > clearedAt)
      .map((a) => {
        const component = componentById.get(a.scheduleComponentId);
        const item = component ? itemById.get(component.scheduleItemId) : undefined;
        const curriculum = item ? curriculumById.get(item.curriculumId) : undefined;
        if (!component || !curriculum) return null;
        return { deadlineDate: a.deadlineDate, curriculum, component };
      })
      .filter((x): x is AssignedLine => x !== null);
  }, [assignments, studentId, componentById, itemById, curriculumById, currentStudent]);

  // 학생별 "최근 N일 배정내역" — 복사용 텍스트를 지워도(copyClearedAt) 영향받지 않고,
  // 배정된 시각(assignedAt) 기준으로 최근 항목을 그대로 보여준다.
  const recentAssignmentsByDate = useMemo(() => {
    const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
    const lines = assignments
      .filter((a) => a.studentId === studentId && new Date(a.assignedAt).getTime() >= cutoff)
      .map((a) => {
        const component = componentById.get(a.scheduleComponentId);
        const item = component ? itemById.get(component.scheduleItemId) : undefined;
        const curriculum = item ? curriculumById.get(item.curriculumId) : undefined;
        if (!component || !curriculum) return null;
        return { assignedAt: a.assignedAt, deadlineDate: a.deadlineDate, curriculum, component };
      })
      .filter((x): x is AssignedLine & { assignedAt: string } => x !== null)
      .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt));

    const byDate = new Map<string, typeof lines>();
    for (const line of lines) {
      const dateKey = toISODateLocal(new Date(line.assignedAt));
      const list = byDate.get(dateKey) ?? [];
      list.push(line);
      byDate.set(dateKey, list);
    }
    return [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [assignments, studentId, componentById, itemById, curriculumById]);

  const assignedComponentIds = useMemo(
    () => new Set(currentAssignmentLines.map((l) => l.component.id)),
    [currentAssignmentLines]
  );

  const assignmentIdByComponentId = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of assignments) {
      if (a.studentId === studentId) map.set(a.scheduleComponentId, a.id);
    }
    return map;
  }, [assignments, studentId]);

  function toggleComponent(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 회차 번호 클릭 시 해당 행의 구성요소 중 RX와 이미 배정된 항목을 제외하고 전체 선택/해제 토글.
  function toggleRowSelection(itemId: string) {
    const comps = componentsByItemId.get(itemId) ?? [];
    const selectable = comps.filter((c) => c.type !== "RX" && !assignedComponentIds.has(c.id));
    if (selectable.length === 0) return;
    const allSelected = selectable.every((c) => selectedIds.has(c.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const c of selectable) {
        if (allSelected) next.delete(c.id);
        else next.add(c.id);
      }
      return next;
    });
  }

  async function handleCancelAssignment(assignmentId: string) {
    setActionError(null);
    setCancelingAssignmentId(assignmentId);
    try {
      await deleteAssignment(assignmentId);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setCancelingAssignmentId(null);
    }
  }

  function handleSubjectChange(newSubjectId: string) {
    setSubjectId(newSubjectId);
    const firstCurriculum = curricula.find((c) => c.subjectId === newSubjectId);
    setCurriculumId(firstCurriculum?.id ?? "");
    setSelectedIds(new Set());
    setManualDates({});
  }

  function handleStudentChange(newStudentId: string) {
    setStudentId(newStudentId);

    const filteredSubjects = subjectsForStudentId(newStudentId);
    const newSubjectId = filteredSubjects[0]?.id ?? "";
    setSubjectId(newSubjectId);

    const firstCurriculum = curricula.find((c) => c.subjectId === newSubjectId);
    setCurriculumId(firstCurriculum?.id ?? "");

    setSelectedIds(new Set());
    setManualDates({});
  }

  async function handleAssign() {
    if (!curriculum || selectedIds.size === 0) return;

    const selectedOrdered = orderedVisibleComponents.filter((c) => selectedIds.has(c.id));

    // 자동 배분: 선택된 항목을 화면에 보이는 순서(행 → 컬럼) 그대로 나열한 뒤,
    // "하루에 배정할 항목 수"만큼씩 끊어서 같은 날짜를 부여한다.
    const rowsPerDay = Math.max(1, autoRowsPerDay);

    const lines = selectedOrdered.map((component, index) => {
      if (deadlineMode !== "auto") {
        return {
          studentId,
          scheduleComponentId: component.id,
          deadlineDate: manualDates[component.id] || autoStartDate,
        };
      }
      const chunkIndex = Math.floor(index / rowsPerDay);
      return {
        studentId,
        scheduleComponentId: component.id,
        deadlineDate: addDays(autoStartDate, chunkIndex * autoIntervalDays),
      };
    });

    setSubmitting(true);
    setActionError(null);
    try {
      await createAssignments(lines);
      setSelectedIds(new Set());
      setManualDates({});
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetAssignments() {
    setSubmitting(true);
    setActionError(null);
    try {
      await resetAssignmentsForStudent(studentId);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClearCopyText() {
    setSubmitting(true);
    setActionError(null);
    try {
      await clearCopyText(studentId);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const copyText = generateCopyText(copyableAssignmentLines);

  async function handleCopy() {
    await navigator.clipboard.writeText(copyText);
  }

  if (loading && !initialized) {
    return <div className="p-6 text-sm text-gray-500">불러오는 중...</div>;
  }

  if (storeError) {
    return <div className="p-6 text-sm text-red-600">데이터를 불러오지 못했습니다: {storeError}</div>;
  }

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6 text-sm">
      <h1 className="text-xl font-bold">학습스케줄 배정</h1>

      {actionError && <p className="text-red-600">{actionError}</p>}

      <section className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="font-medium">선생님</span>
          <select
            className="border rounded px-2 py-1"
            value={teacherFilter}
            onChange={(e) => setTeacherFilter(e.target.value)}
          >
            <option value="all">전체</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value="unassigned">미배정</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium">수강 과목</span>
          <select
            className="border rounded px-2 py-1"
            value={studentSubjectFilter}
            onChange={(e) => setStudentSubjectFilter(e.target.value)}
          >
            <option value="all">전체</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium">학생 검색</span>
          <input
            type="text"
            className="border rounded px-2 py-1"
            placeholder="이름으로 검색"
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium">학생</span>
          <select
            className="border rounded px-2 py-1"
            value={studentId}
            onChange={(e) => handleStudentChange(e.target.value)}
          >
            {studentsForFilters.length === 0 && <option value="">학생 없음</option>}
            {studentsForFilters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {students.length === 0 && (
            <Link
              href="/students"
              className="text-xs text-blue-600 underline transition-colors hover:text-blue-800"
            >
              학생 관리에서 추가
            </Link>
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium">과목</span>
          <select
            className="border rounded px-2 py-1"
            value={subjectId}
            onChange={(e) => handleSubjectChange(e.target.value)}
          >
            {subjectsForStudent.length === 0 && <option value="">과목 없음</option>}
            {subjectsForStudent.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium">커리큘럼</span>
          <select
            className="border rounded px-2 py-1"
            value={curriculumId}
            onChange={(e) => {
              setCurriculumId(e.target.value);
              setSelectedIds(new Set());
              setManualDates({});
            }}
          >
            {curriculaForSubject.length === 0 && <option value="">커리큘럼 없음</option>}
            {curriculaForSubject.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {currentStudent && (
        <section className="space-y-2 border rounded p-4">
          <h2 className="font-semibold">최근 {RECENT_DAYS}일 배정내역 — {currentStudent.name}</h2>
          {recentAssignmentsByDate.length === 0 ? (
            <p className="text-xs text-gray-500">최근 {RECENT_DAYS}일간 배정된 항목이 없습니다.</p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-auto">
              {recentAssignmentsByDate.map(([dateKey, lines]) => (
                <div key={dateKey}>
                  <div className="text-xs font-medium text-gray-500">
                    {formatDateHeader(dateKey)} 배정
                  </div>
                  <ul className="text-xs space-y-0.5 pl-2">
                    {lines.map((l) => (
                      <li key={l.component.id}>
                        - {formatComponentLine(l.curriculum, l.component)}
                        <span className="text-gray-400"> (마감 {formatDateHeader(l.deadlineDate)})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {curriculum && (
        <section className="overflow-auto border rounded max-h-[42vh]">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="sticky top-0 z-10 border bg-gray-100 dark:bg-neutral-800 px-2 py-1 text-left w-16">
                  회차
                </th>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="sticky top-0 z-10 border bg-gray-100 dark:bg-neutral-800 px-2 py-1 text-left"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itemsForCurriculum.map((item) => {
                const comps = componentsByItemId.get(item.id) ?? [];
                return (
                  <tr key={item.id}>
                    <td
                      className="border px-2 py-1 align-top font-medium cursor-pointer transition-colors duration-150 hover:bg-blue-50 dark:hover:bg-blue-950"
                      title="클릭하면 RX를 제외한 이 행 전체를 선택/해제합니다"
                      onClick={() => toggleRowSelection(item.id)}
                    >
                      {item.order}
                    </td>
                    {columns.map((col) => {
                      const cellComponents = curriculum.hasTypedComponents
                        ? comps.filter((c) => c.type === col)
                        : comps;
                      return (
                        <td key={col} className="border px-2 py-1 align-top">
                          <div className="flex flex-col gap-1">
                            {cellComponents.map((c) => {
                              const isAssigned = assignedComponentIds.has(c.id);
                              const isSelected = selectedIds.has(c.id);
                              const assignmentId = assignmentIdByComponentId.get(c.id);
                              const isCanceling =
                                isAssigned && assignmentId !== undefined && cancelingAssignmentId === assignmentId;
                              return (
                                <label
                                  key={c.id}
                                  className={`flex items-start gap-1 rounded px-1 py-0.5 -mx-1 -my-0.5 transition-colors duration-150 ${
                                    isCanceling
                                      ? "opacity-30"
                                      : isAssigned
                                        ? "cursor-pointer opacity-60 hover:opacity-90 hover:bg-red-50 dark:hover:bg-red-950"
                                        : isSelected
                                          ? "cursor-pointer bg-blue-50 dark:bg-blue-950"
                                          : "cursor-pointer"
                                  }`}
                                  title={isAssigned ? `${c.content} (클릭하면 배정 취소)` : c.content}
                                >
                                  <input
                                    type="checkbox"
                                    className="mt-0.5"
                                    disabled={isCanceling}
                                    checked={isAssigned || isSelected}
                                    onChange={() => {
                                      if (isAssigned) {
                                        if (assignmentId) handleCancelAssignment(assignmentId);
                                      } else {
                                        toggleComponent(c.id);
                                      }
                                    }}
                                  />
                                  <span>
                                    {c.content}
                                    {isAssigned && (
                                      <span className="ml-1 text-xs text-gray-500">
                                        {isCanceling ? "(취소 중...)" : "(배정됨 · 클릭해서 취소)"}
                                      </span>
                                    )}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <section className="space-y-3 border rounded p-4">
        <div className="flex items-center gap-4">
          <span className="font-medium">마감기한 배정 모드</span>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={deadlineMode === "auto"}
              onChange={() => setDeadlineMode("auto")}
            />
            자동 배분
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={deadlineMode === "manual"}
              onChange={() => setDeadlineMode("manual")}
            />
            수동 지정
          </label>
        </div>

        {deadlineMode === "auto" ? (
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2">
              시작일
              <input
                type="date"
                className="border rounded px-2 py-1"
                value={autoStartDate}
                onChange={(e) => setAutoStartDate(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2">
              간격(일)
              <input
                type="number"
                min={0}
                className="border rounded px-2 py-1 w-16"
                value={autoIntervalDays}
                onChange={(e) => setAutoIntervalDays(Number(e.target.value))}
              />
            </label>
            <label className="flex items-center gap-2">
              하루에 배정할 항목 수
              <input
                type="number"
                min={1}
                className="border rounded px-2 py-1 w-16"
                value={autoRowsPerDay}
                onChange={(e) => setAutoRowsPerDay(Math.max(1, Number(e.target.value)))}
              />
            </label>
          </div>
        ) : (
          selectedIds.size > 0 && (
            <div className="space-y-1">
              {orderedVisibleComponents
                .filter((c) => selectedIds.has(c.id))
                .map((c) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <span className="flex-1 truncate">{c.content}</span>
                    <input
                      type="date"
                      className="border rounded px-2 py-1"
                      value={manualDates[c.id] ?? autoStartDate}
                      onChange={(e) =>
                        setManualDates((prev) => ({ ...prev, [c.id]: e.target.value }))
                      }
                    />
                  </div>
                ))}
            </div>
          )
        )}

        <button
          className="bg-blue-600 text-white rounded px-4 py-2 transition-colors duration-150 hover:bg-blue-700 hover:shadow-md disabled:opacity-40 disabled:hover:bg-blue-600 disabled:hover:shadow-none"
          disabled={selectedIds.size === 0 || submitting}
          onClick={handleAssign}
        >
          배정하기 ({selectedIds.size}개 선택됨)
        </button>
      </section>

      <section className="space-y-2 border rounded p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">복사용 텍스트</h2>
          <div className="flex gap-2">
            <button
              className="text-xs border rounded px-2 py-1 transition-colors duration-150 hover:bg-gray-50 hover:shadow-sm dark:hover:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:shadow-none"
              onClick={handleResetAssignments}
              disabled={currentAssignmentLines.length === 0 || submitting}
              title="실제 배정 기록을 삭제합니다 (표의 배정됨 체크도 함께 취소됨)"
            >
              배정 초기화
            </button>
            <button
              className="text-xs border rounded px-2 py-1 transition-colors duration-150 hover:bg-gray-50 hover:shadow-sm dark:hover:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:shadow-none"
              onClick={handleClearCopyText}
              disabled={copyableAssignmentLines.length === 0 || submitting}
              title="배정 기록은 그대로 두고 복사용 텍스트만 비웁니다"
            >
              텍스트 지우기
            </button>
            <button
              className="text-xs bg-gray-800 text-white rounded px-2 py-1 transition-colors duration-150 hover:bg-gray-900 hover:shadow-md disabled:opacity-40 disabled:hover:bg-gray-800 disabled:hover:shadow-none"
              onClick={handleCopy}
              disabled={!copyText}
            >
              복사
            </button>
          </div>
        </div>
        <pre className="whitespace-pre-wrap text-xs bg-gray-50 dark:bg-neutral-900 border rounded p-3 min-h-16">
          {copyText || "배정된 항목이 없습니다."}
        </pre>
      </section>
    </div>
  );
}
