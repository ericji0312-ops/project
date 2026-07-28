import type { Curriculum, ScheduleComponent } from "@/types/schedule";

const WEEKDAYS_KR = ["일", "월", "화", "수", "목", "금", "토"];

export function formatDateHeader(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS_KR[d.getDay()]})`;
}

export function formatComponentLine(
  curriculum: Curriculum,
  component: ScheduleComponent
): string {
  if (!curriculum.hasTypedComponents) {
    return `[${curriculum.name}]: ${component.content}`;
  }
  return `[${curriculum.name}] ${component.type} : ${component.content}`;
}

export interface AssignedLine {
  deadlineDate: string; // YYYY-MM-DD
  curriculum: Curriculum;
  component: ScheduleComponent;
}

/**
 * 마감기한(날짜)별로 한 줄씩 묶어 복사용 텍스트를 생성한다.
 * 형식: "● 마감기한 : 7/23 (목) - [커리큘럼] 타입 : 내용 - ..."
 */
export function generateCopyText(assignments: AssignedLine[]): string {
  const byDate = new Map<string, AssignedLine[]>();
  for (const a of assignments) {
    const list = byDate.get(a.deadlineDate) ?? [];
    list.push(a);
    byDate.set(a.deadlineDate, list);
  }

  const sortedDates = [...byDate.keys()].sort();

  return sortedDates
    .map((date) => {
      const items = byDate.get(date)!;
      const parts = items.map((a) => formatComponentLine(a.curriculum, a.component));
      return `● 마감기한 : ${formatDateHeader(date)} - ${parts.join(" - ")}`;
    })
    .join("\n");
}
