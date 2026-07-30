import { create } from "zustand";
import { supabase } from "@/lib/supabaseClient";
import type {
  Subject,
  Curriculum,
  ScheduleItem,
  ScheduleComponent,
  Student,
  StudentSubject,
  Assignment,
} from "@/types/schedule";

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

function mapStudent(row: { id: string; name: string; teacher_id: string | null }): Student {
  return { id: row.id, name: row.name, teacherId: row.teacher_id };
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
  createAssignments: (
    lines: { studentId: string; scheduleComponentId: string; deadlineDate: string }[]
  ) => Promise<void>;
  resetAssignmentsForStudent: (studentId: string) => Promise<void>;
  deleteAssignment: (assignmentId: string) => Promise<void>;
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
      supabase.from("subjects").select("*"),
      supabase.from("curricula").select("*"),
      supabase.from("schedule_items").select("*"),
      supabase.from("schedule_components").select("*"),
      supabase.from("students").select("*"),
      supabase.from("student_subjects").select("*"),
      supabase.from("assignments").select("*"),
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
