// 학습스케줄 배정 앱 — 데이터 모델 타입 (스펙 v2)
// docs: 학습스케줄_자동생성_앱_스펙.md 참고

export interface Subject {
  id: string;
  name: string; // 예: "대수", "미적분1"
}

export interface Curriculum {
  id: string;
  subjectId: string;
  name: string; // 예: "대수_Bs", "기출의로직_미적분1"
  /**
   * 이 커리큘럼의 회차가 구성요소 타입 라벨을 갖는지 여부.
   * true (일반형): "[커리큘럼] 개념 : 8.로그함수의 활용 듣고 바인더 정리"
   * false (기출형): "[커리큘럼]: 함수의 극한 1~25번 풀기" (타입 라벨 생략)
   */
  hasTypedComponents: boolean;
}

export interface ScheduleItem {
  id: string;
  curriculumId: string;
  order: number; // 회차 번호
  // 실제 원본 파일을 보면 같은 회차라도 구성요소마다(개념/연산/라이트쎈/오답노트...) 참조하는
  // 제목/범위가 서로 달라 회차 전체를 대표하는 단일 title을 두기 어렵다.
  // (예: "곱셈공식 암기" 항목은 그 회차의 "1.다항식의 연산" 개념과 무관하게 존재)
  // 따라서 title은 두지 않고, 회차는 순수하게 그룹핑 키(order)로만 사용한다.
}

/**
 * 커리큘럼마다 실제 쓰이는 구성요소 타입은 다를 수 있어 열린 문자열로 둔다.
 * 일반형 커리큘럼에서 흔한 값: "개념" | "연산" | "RX" | "라이트쎈" | "오답노트"
 * 기출형 커리큘럼은 hasTypedComponents=false 이므로 이 값이 화면/텍스트에 노출되지 않는다.
 */
export type ComponentType = string;

export interface ScheduleComponent {
  id: string;
  scheduleItemId: string;
  /** 정규화된 타입 (개념/연산/RX/라이트쎈/오답노트/기타 등). UI 필터·컬럼 구분에 사용 */
  type: ComponentType;
  /**
   * 원본 파일에 적힌 타입 표기 그대로 (예: "공수1 개념", "라이트쎈(공수1)").
   * 콜론 구분자가 없는 행(오탈자 등)에서는 null.
   */
  typeLabel: string | null;
  /** 콜론(:) 뒤에 오는 본문 텍스트. 콜론이 없으면 전체 remainder. */
  content: string;
  /** "[커리큘럼명] " 접두어를 뺀 원본 셀 텍스트 전체 (무손실 원본 보존용) */
  rawText: string;
}

export interface Student {
  id: string;
  name: string;
  /** 담당 선생님 id. 아직 배정되지 않았으면 null. */
  teacherId: string | null;
  /** 복사용 텍스트를 마지막으로 지운 시각. 이 시각 이전에 배정된 항목은 복사용
   * 텍스트에서만 제외되고, 배정 기록 자체는 그대로 남는다. 지운 적 없으면 null. */
  copyClearedAt: string | null;
}

/** 학생이 실제로 듣는 과목 — 배정 기록과 별개로 명시적으로 등록/해제한다. */
export interface StudentSubject {
  id: string;
  studentId: string;
  subjectId: string;
}

export interface Assignment {
  id: string;
  studentId: string;
  scheduleComponentId: string;
  deadlineDate: string; // ISO date string (YYYY-MM-DD)
  assignedAt: string; // ISO datetime string
}

/** 배정 화면/복사 텍스트 생성에 필요한, 조인된 형태의 편의 타입 */
export interface AssignmentWithDetails extends Assignment {
  component: ScheduleComponent;
  scheduleItem: ScheduleItem;
  curriculum: Curriculum;
  subject: Subject;
}
