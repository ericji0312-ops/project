import { create } from "zustand";
import { supabase } from "@/lib/supabaseClient";
import { parseRow } from "@/lib/excelParser";
import type {
  Subject,
  Curriculum,
  ScheduleItem,
  ScheduleComponent,
  Student,
  StudentSubject,
  Assignment,
} from "@/types/schedule";

// 커리큘럼 인앱 편집기에서 "타입 : 내용" 한 줄만 입력받아도 업로드 때와 동일한
// parseRow() 규칙을 재사용할 수 있도록, 원본 엑셀 셀 형식([커리큘럼명] ...)을 복원한다.
export function prefixedLine(curriculum: Curriculum, rawLine: string): string {
  return curriculum.hasTypedComponents
    ? `[${curriculum.name}] ${rawLine}`
    : `[${curriculum.name}]: ${rawLine}`;
}

// DB(snake_case) <-> 앱 타입(camelCase) 매핑
function mapCurriculum(row: {
  id: string;
  subject_id: string;
  name: string;
  has_typed_components: boolean;
}): Curriculum {
  return {
    id: row.id,
    subjectId: row.subject_id,
    name: row.name,
    hasTypedComponents: row.has_typed_components,
  };
}

function mapScheduleItem(row: {
  id: string;
  curriculum_id: string;
  order_no: number;
}): ScheduleItem {
  return { id: row.id, curriculumId: row.curriculum_id, order: row.order_no };
}

function mapScheduleComponent(row: {
  id: string;
  schedule_item_id: string;
  type: string;
  type_label: string | null;
  content: string;
  raw_text: string;
}): ScheduleComponent {
  return {
    id: row.id,
    scheduleItemId: row.schedule_item_id,
    type: row.type,
    typeLabel: row.type_label,
    content: row.content,
    rawText: row.raw_text,
  };
}

function mapStudent(row: {
  id: string;
  name: string;
  teacher_id: string | null;
  copy_cleared_at: string | null;
}): Student {
  return {
    id: row.id,
    name: row.name,
    teacherId: row.teacher_id,
    copyClearedAt: row.copy_cleared_at,
  };
}

function mapStudentSubject(row: {
  id: string;
  student_id: string;
  subject_id: string;
}): StudentSubject {
  return { id: row.id, studentId: row.student_id, subjectId: row.subject_id };
}

function mapAssignment(row: {
  id: string;
  student_id: string;
  schedule_component_id: string;
  deadline_date: string;
  assigned_at: string;
}): Assignment {
  return {
    id: row.id,
    studentId: row.student_id,
    scheduleComponentId: row.schedule_component_id,
    deadlineDate: row.deadline_date,
    assignedAt: row.assigned_at,
  };
}

interface ScheduleStore {
  initialized: boolean;
  loading: boolean;
  error: string | null;

  subjects: Subject[];
  curricula: Curriculum[];
  scheduleItems: ScheduleItem[];
  scheduleComponents: ScheduleComponent[];
  students: Student[];
  studentSubjects: StudentSubject[];
  assignments: Assignment[];

  fetchAll: () => Promise<void>;
  addSubject: (name: string) => Promise<Subject>;
  addStudent: (name: string) => Promise<Student>;
  deleteStudent: (studentId: string) => Promise<void>;
  setStudentTeacher: (studentId: string, teacherId: string | null) => Promise<void>;
  /** 배정 기록은 그대로 두고, 복사용 텍스트 화면에서만 지금까지의 항목을 숨긴다. */
  clearCopyText: (studentId: string) => Promise<void>;
  addStudentSubject: (studentId: string, subjectId: string) => Promise<void>;
  removeStudentSubject: (studentSubjectId: string) => Promise<void>;
  addCurriculum: (
    curriculum: Omit<Curriculum, "id">,
    items: ScheduleItem[],
    components: ScheduleComponent[]
  ) => Promise<void>;
  deleteCurriculum: (curriculumId: string) => Promise<void>;
  /** 같은 커리큘럼에 새 회차만 이어붙인다. 이미 있는 order_no는 건드리지 않는다. 반환값은 추가된 회차 수. */
  mergeCurriculum: (
    curriculumId: string,
    items: ScheduleItem[],
    components: ScheduleComponent[]
  ) => Promise<number>;
  /** 인앱 편집기용: 회차 하나에 "타입 : 내용" 줄들을 추가한다. 해당 회차가 없으면 새로 만든다. */
  addComponentsToOrder: (
    curriculumId: string,
    order: number,
    rawLines: string[]
  ) => Promise<{ warnings: string[] }>;
  /** 인앱 편집기용: 구성요소 한 줄을 새 텍스트로 재파싱해 덮어쓴다. */
  updateScheduleComponent: (
    componentId: string,
    curriculumId: string,
    order: number,
    rawLine: string
  ) => Promise<{ warning?: string }>;
  deleteScheduleComponent: (componentId: string) => Promise<void>;
  deleteScheduleItem: (itemId: string) => Promise<void>;
  createAssignments: (
    lines: { studentId: string; scheduleComponentId: string; deadlineDate: string }[]
  ) => Promise<void>;
  resetAssignmentsForStudent: (studentId: string) => Promise<void>;
  deleteAssignment: (assignmentId: string) => Promise<void>;
}

// Supabase/PostgREST는 select("*")에 기본 최대 행 수 제한(보통 1000)이 있어
// 테이블이 그보다 커지면 나머지 행이 조용히 잘린다. range()로 끝까지 이어서 가져온다.
async function fetchAllRows<T>(table: string): Promise<{ data: T[]; error: { message: string } | null }> {
  const pageSize = 1000;
  const allRows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + pageSize - 1);
    if (error) return { data: allRows, error };
    allRows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return { data: allRows, error: null };
}

export const useScheduleStore = create<ScheduleStore>((set, get) => ({
  initialized: false,
  loading: false,
  error: null,

  subjects: [],
  curricula: [],
  scheduleItems: [],
  scheduleComponents: [],
  students: [],
  studentSubjects: [],
  assignments: [],

  fetchAll: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });

    const [
      subjectsRes,
      curriculaRes,
      itemsRes,
      componentsRes,
      studentsRes,
      studentSubjectsRes,
      assignmentsRes,
    ] = await Promise.all([
      fetchAllRows<Subject>("subjects"),
      fetchAllRows<Parameters<typeof mapCurriculum>[0]>("curricula"),
      fetchAllRows<Parameters<typeof mapScheduleItem>[0]>("schedule_items"),
      fetchAllRows<Parameters<typeof mapScheduleComponent>[0]>("schedule_components"),
      fetchAllRows<Parameters<typeof mapStudent>[0]>("students"),
      fetchAllRows<Parameters<typeof mapStudentSubject>[0]>("student_subjects"),
      fetchAllRows<Parameters<typeof mapAssignment>[0]>("assignments"),
    ]);

    const firstError =
      subjectsRes.error ||
      curriculaRes.error ||
      itemsRes.error ||
      componentsRes.error ||
      studentsRes.error ||
      studentSubjectsRes.error ||
      assignmentsRes.error;

    if (firstError) {
      set({ loading: false, error: firstError.message });
      return;
    }

    set({
      subjects: subjectsRes.data ?? [],
      curricula: (curriculaRes.data ?? []).map(mapCurriculum),
      scheduleItems: (itemsRes.data ?? []).map(mapScheduleItem),
      scheduleComponents: (componentsRes.data ?? []).map(mapScheduleComponent),
      students: (studentsRes.data ?? []).map(mapStudent),
      studentSubjects: (studentSubjectsRes.data ?? []).map(mapStudentSubject),
      assignments: (assignmentsRes.data ?? []).map(mapAssignment),
      initialized: true,
      loading: false,
    });
  },

  addSubject: async (name) => {
    const existing = get().subjects.find((s) => s.name === name);
    if (existing) return existing;

    const { data, error } = await supabase.from("subjects").insert({ name }).select().single();
    if (error) throw new Error(error.message);

    const subject: Subject = data;
    set((state) => ({ subjects: [...state.subjects, subject] }));
    return subject;
  },

  addStudent: async (name) => {
    const { data, error } = await supabase.from("students").insert({ name }).select().single();
    if (error) throw new Error(error.message);

    const student = mapStudent(data);
    set((state) => ({ students: [...state.students, student] }));
    return student;
  },

  deleteStudent: async (studentId) => {
    const { error } = await supabase.from("students").delete().eq("id", studentId);
    if (error) throw new Error(error.message);

    set((state) => ({
      students: state.students.filter((s) => s.id !== studentId),
      // 학생 삭제 시 배정 기록/과목 등록도 FK cascade로 DB에서 함께 삭제되므로 로컬 state도 맞춘다.
      studentSubjects: state.studentSubjects.filter((ss) => ss.studentId !== studentId),
      assignments: state.assignments.filter((a) => a.studentId !== studentId),
    }));
  },

  setStudentTeacher: async (studentId, teacherId) => {
    const { error } = await supabase
      .from("students")
      .update({ teacher_id: teacherId })
      .eq("id", studentId);
    if (error) throw new Error(error.message);

    set((state) => ({
      students: state.students.map((s) => (s.id === studentId ? { ...s, teacherId } : s)),
    }));
  },

  clearCopyText: async (studentId) => {
    const copyClearedAt = new Date().toISOString();
    const { error } = await supabase
      .from("students")
      .update({ copy_cleared_at: copyClearedAt })
      .eq("id", studentId);
    if (error) throw new Error(error.message);

    set((state) => ({
      students: state.students.map((s) => (s.id === studentId ? { ...s, copyClearedAt } : s)),
    }));
  },

  addStudentSubject: async (studentId, subjectId) => {
    const { data, error } = await supabase
      .from("student_subjects")
      .insert({ student_id: studentId, subject_id: subjectId })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const studentSubject = mapStudentSubject(data);
    set((state) => ({ studentSubjects: [...state.studentSubjects, studentSubject] }));
  },

  removeStudentSubject: async (studentSubjectId) => {
    const { error } = await supabase
      .from("student_subjects")
      .delete()
      .eq("id", studentSubjectId);
    if (error) throw new Error(error.message);

    set((state) => ({
      studentSubjects: state.studentSubjects.filter((ss) => ss.id !== studentSubjectId),
    }));
  },

  addCurriculum: async (curriculum, items, components) => {
    const { data: curriculumRow, error: curriculumError } = await supabase
      .from("curricula")
      .insert({
        subject_id: curriculum.subjectId,
        name: curriculum.name,
        has_typed_components: curriculum.hasTypedComponents,
      })
      .select()
      .single();
    if (curriculumError) throw new Error(curriculumError.message);

    const realCurriculum = mapCurriculum(curriculumRow);

    const { data: itemRows, error: itemsError } = await supabase
      .from("schedule_items")
      .insert(items.map((i) => ({ curriculum_id: realCurriculum.id, order_no: i.order })))
      .select();
    if (itemsError) throw new Error(itemsError.message);

    const realItems = itemRows.map(mapScheduleItem);
    const orderNoToRealId = new Map(realItems.map((i) => [i.order, i.id]));
    const tempIdToRealId = new Map(items.map((i) => [i.id, orderNoToRealId.get(i.order)!]));

    const { data: componentRows, error: componentsError } = await supabase
      .from("schedule_components")
      .insert(
        components.map((c) => ({
          schedule_item_id: tempIdToRealId.get(c.scheduleItemId),
          type: c.type,
          type_label: c.typeLabel,
          content: c.content,
          raw_text: c.rawText,
        }))
      )
      .select();
    if (componentsError) throw new Error(componentsError.message);

    const realComponents = componentRows.map(mapScheduleComponent);

    set((state) => ({
      curricula: [...state.curricula, realCurriculum],
      scheduleItems: [...state.scheduleItems, ...realItems],
      scheduleComponents: [...state.scheduleComponents, ...realComponents],
    }));
  },

  mergeCurriculum: async (curriculumId, items, components) => {
    const existingOrders = new Set(
      get()
        .scheduleItems.filter((i) => i.curriculumId === curriculumId)
        .map((i) => i.order)
    );
    const newItems = items.filter((i) => !existingOrders.has(i.order));
    if (newItems.length === 0) return 0;

    const newItemTempIds = new Set(newItems.map((i) => i.id));
    const newComponents = components.filter((c) => newItemTempIds.has(c.scheduleItemId));

    const { data: itemRows, error: itemsError } = await supabase
      .from("schedule_items")
      .insert(newItems.map((i) => ({ curriculum_id: curriculumId, order_no: i.order })))
      .select();
    if (itemsError) throw new Error(itemsError.message);

    const realItems = itemRows.map(mapScheduleItem);
    const orderNoToRealId = new Map(realItems.map((i) => [i.order, i.id]));
    const tempIdToRealId = new Map(newItems.map((i) => [i.id, orderNoToRealId.get(i.order)!]));

    const { data: componentRows, error: componentsError } = await supabase
      .from("schedule_components")
      .insert(
        newComponents.map((c) => ({
          schedule_item_id: tempIdToRealId.get(c.scheduleItemId),
          type: c.type,
          type_label: c.typeLabel,
          content: c.content,
          raw_text: c.rawText,
        }))
      )
      .select();
    if (componentsError) throw new Error(componentsError.message);

    const realComponents = componentRows.map(mapScheduleComponent);

    set((state) => ({
      scheduleItems: [...state.scheduleItems, ...realItems],
      scheduleComponents: [...state.scheduleComponents, ...realComponents],
    }));

    return newItems.length;
  },

  deleteCurriculum: async (curriculumId) => {
    const { error } = await supabase.from("curricula").delete().eq("id", curriculumId);
    if (error) throw new Error(error.message);

    // schedule_items -> schedule_components -> assignments 순으로 DB에서 FK cascade 삭제되므로
    // 로컬 state도 같은 범위로 정리한다.
    set((state) => {
      const deletedItemIds = new Set(
        state.scheduleItems.filter((i) => i.curriculumId === curriculumId).map((i) => i.id)
      );
      const deletedComponentIds = new Set(
        state.scheduleComponents
          .filter((c) => deletedItemIds.has(c.scheduleItemId))
          .map((c) => c.id)
      );

      return {
        curricula: state.curricula.filter((c) => c.id !== curriculumId),
        scheduleItems: state.scheduleItems.filter((i) => i.curriculumId !== curriculumId),
        scheduleComponents: state.scheduleComponents.filter(
          (c) => !deletedItemIds.has(c.scheduleItemId)
        ),
        assignments: state.assignments.filter(
          (a) => !deletedComponentIds.has(a.scheduleComponentId)
        ),
      };
    });
  },

  addComponentsToOrder: async (curriculumId, order, rawLines) => {
    const curriculum = get().curricula.find((c) => c.id === curriculumId);
    if (!curriculum) throw new Error("커리큘럼을 찾을 수 없습니다.");

    let item = get().scheduleItems.find(
      (i) => i.curriculumId === curriculumId && i.order === order
    );

    if (!item) {
      const { data, error } = await supabase
        .from("schedule_items")
        .insert({ curriculum_id: curriculumId, order_no: order })
        .select()
        .single();
      if (error) throw new Error(error.message);
      item = mapScheduleItem(data);
      const newItem = item;
      set((state) => ({ scheduleItems: [...state.scheduleItems, newItem] }));
    }

    const parsedRows = rawLines
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => parseRow(order, prefixedLine(curriculum, line)))
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const warnings = parsedRows
      .filter((r) => curriculum.hasTypedComponents && r.typeLabel === null)
      .map((r) => `콜론(:) 구분자를 찾지 못해 type을 키워드로 추정했습니다 — "${r.content}"`);

    if (parsedRows.length === 0) return { warnings };

    const { data: componentRows, error: componentsError } = await supabase
      .from("schedule_components")
      .insert(
        parsedRows.map((r) => ({
          schedule_item_id: item!.id,
          type: r.type,
          type_label: r.typeLabel,
          content: r.content,
          raw_text: r.rawText,
        }))
      )
      .select();
    if (componentsError) throw new Error(componentsError.message);

    const realComponents = componentRows.map(mapScheduleComponent);
    set((state) => ({
      scheduleComponents: [...state.scheduleComponents, ...realComponents],
    }));

    return { warnings };
  },

  updateScheduleComponent: async (componentId, curriculumId, order, rawLine) => {
    const curriculum = get().curricula.find((c) => c.id === curriculumId);
    if (!curriculum) throw new Error("커리큘럼을 찾을 수 없습니다.");

    const parsed = parseRow(order, prefixedLine(curriculum, rawLine.trim()));
    if (!parsed) throw new Error("내용을 입력해주세요.");

    const { error } = await supabase
      .from("schedule_components")
      .update({
        type: parsed.type,
        type_label: parsed.typeLabel,
        content: parsed.content,
        raw_text: parsed.rawText,
      })
      .eq("id", componentId);
    if (error) throw new Error(error.message);

    set((state) => ({
      scheduleComponents: state.scheduleComponents.map((c) =>
        c.id === componentId
          ? {
              ...c,
              type: parsed.type,
              typeLabel: parsed.typeLabel,
              content: parsed.content,
              rawText: parsed.rawText,
            }
          : c
      ),
    }));

    const warning =
      curriculum.hasTypedComponents && parsed.typeLabel === null
        ? `콜론(:) 구분자를 찾지 못해 type을 키워드로 추정했습니다 — "${parsed.content}"`
        : undefined;

    return { warning };
  },

  deleteScheduleComponent: async (componentId) => {
    const { error } = await supabase.from("schedule_components").delete().eq("id", componentId);
    if (error) throw new Error(error.message);

    set((state) => ({
      scheduleComponents: state.scheduleComponents.filter((c) => c.id !== componentId),
      assignments: state.assignments.filter((a) => a.scheduleComponentId !== componentId),
    }));
  },

  deleteScheduleItem: async (itemId) => {
    const { error } = await supabase.from("schedule_items").delete().eq("id", itemId);
    if (error) throw new Error(error.message);

    set((state) => {
      const deletedComponentIds = new Set(
        state.scheduleComponents.filter((c) => c.scheduleItemId === itemId).map((c) => c.id)
      );
      return {
        scheduleItems: state.scheduleItems.filter((i) => i.id !== itemId),
        scheduleComponents: state.scheduleComponents.filter((c) => c.scheduleItemId !== itemId),
        assignments: state.assignments.filter(
          (a) => !deletedComponentIds.has(a.scheduleComponentId)
        ),
      };
    });
  },

  createAssignments: async (lines) => {
    const { data, error } = await supabase
      .from("assignments")
      .insert(
        lines.map((l) => ({
          student_id: l.studentId,
          schedule_component_id: l.scheduleComponentId,
          deadline_date: l.deadlineDate,
        }))
      )
      .select();
    if (error) throw new Error(error.message);

    const realAssignments = data.map(mapAssignment);
    set((state) => ({ assignments: [...state.assignments, ...realAssignments] }));
  },

  resetAssignmentsForStudent: async (studentId) => {
    const { error } = await supabase.from("assignments").delete().eq("student_id", studentId);
    if (error) throw new Error(error.message);

    set((state) => ({
      assignments: state.assignments.filter((a) => a.studentId !== studentId),
    }));
  },

  deleteAssignment: async (assignmentId) => {
    const { error } = await supabase.from("assignments").delete().eq("id", assignmentId);
    if (error) throw new Error(error.message);

    set((state) => ({
      assignments: state.assignments.filter((a) => a.id !== assignmentId),
    }));
  },
}));
