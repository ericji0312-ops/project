import * as XLSX from "xlsx";
import type { ScheduleItem, ScheduleComponent, ComponentType } from "@/types/schedule";

/**
 * 원본 파일 형식 (실제 샘플 확인 결과, 스펙 초안의 "행마다 5개 컬럼" 가정과 다름):
 * 시트 하나 = 커리큘럼 하나. 컬럼은 "회차"(숫자), "항목내용"(문자열) 2개뿐이고,
 * 항목내용에 이미 최종 문구 형태가 통째로 들어있다.
 *
 *   일반형: "[공수1] 공수1 개념 : 1.다항식의 연산 듣고 바인더 정리"
 *   기출형: "[기출의로직_미적분1]: 함수의 극한 1~25번 풀기"  (대괄호 뒤 콜론, 타입 라벨 없음)
 *
 * 콜론 표기가 항상 일관되진 않아(오탈자로 콜론 자체가 누락된 행 존재) 콜론이 없으면
 * 전체 텍스트를 content로 두고 키워드로 type만 추정한다.
 */

export interface ParsedScheduleRow {
  order: number;
  rawText: string; // "[커리큘럼] " 접두어를 뺀 원본 텍스트 전체
  curriculumNameInFile: string; // 대괄호 안에 적힌 커리큘럼명 (검증/매칭용)
  typeLabel: string | null; // 콜론 앞부분 원문 (없으면 null)
  type: ComponentType; // 정규화된 타입
  content: string; // 콜론 뒷부분 (없으면 전체 remainder)
}

const TYPE_RULES: { pattern: RegExp; type: string }[] = [
  { pattern: /RX/i, type: "RX" },
  { pattern: /(오답|틀린\s*문제)/, type: "오답노트" },
  { pattern: /개념/, type: "개념" },
  { pattern: /라이트쎈/, type: "라이트쎈" },
  { pattern: /쎈/, type: "쎈" },
  { pattern: /고쟁이/, type: "고쟁이" },
  { pattern: /연산/, type: "연산" },
  { pattern: /RPM/i, type: "RPM" },
];

// "기출의 로직" 계열은 커리큘럼마다 번호가 달라도(기로4-, 기로5...) 몇 스텝인지가
// 핵심 구분값이라, 스텝 번호를 그대로 타입에 반영한다. 예: "기출의 로직(1스텝)".
// 스텝 표기가 "1스텝"(한글), "step1"(영문), "[Step1]"(대괄호, content 쪽에 붙는 경우) 등
// 파일마다 제각각이라 한 정규식으로 함께 잡는다.
const GIRO_STEP_RE = /기출.*?(?:(\d)\s*스텝|step\s*(\d))/i;
// typeLabel에 스텝 번호가 없고(예: "기출의 로직4+") content 쪽에 "틀린문제 다시 풀기"류
// 오답 복습 행만 있는 경우 — 별도 스텝 매칭이 불가능하므로 오답노트로 분류한다.
const REVIEW_RE = /(오답|틀린\s*문제)/;

function detectType(typeLabel: string, content: string = ""): string {
  if (/기출/.test(typeLabel) || /기출/.test(content)) {
    const combined = `${typeLabel} ${content}`;
    const stepMatch = combined.match(GIRO_STEP_RE);
    if (stepMatch) return `기출의 로직(${stepMatch[1] ?? stepMatch[2]}스텝)`;
    if (REVIEW_RE.test(combined)) return "오답노트";
  }

  for (const rule of TYPE_RULES) {
    if (rule.pattern.test(typeLabel)) return rule.type;
  }
  return "기타";
}

const BRACKET_RE = /^\[([^\]]+)\]\s*(.*)$/;
const TYPE_CONTENT_RE = /^(.*?)\s*:\s*(.*)$/;

export function parseRow(order: number, rawCellText: string): ParsedScheduleRow | null {
  const text = rawCellText.trim();
  if (!text) return null;

  // 대괄호 표기 자체가 없는 파일도 있다(예: "고쟁이 : (1스텝) 1~28번까지 풀기").
  // 이 경우 커리큘럼명만 못 얻을 뿐, 타입/내용 분리는 대괄호가 있을 때와 동일하게 시도한다.
  const bracketMatch = text.match(BRACKET_RE);
  const curriculumNameInFile = bracketMatch ? bracketMatch[1].trim() : "";
  const rest = bracketMatch ? bracketMatch[2].trim() : text;

  // "[X]: 내용" — 기출형 (대괄호 바로 뒤 콜론, 타입 라벨 없음)
  if (bracketMatch && rest.startsWith(":")) {
    const content = rest.slice(1).trim();
    return {
      order,
      rawText: text,
      curriculumNameInFile,
      typeLabel: null,
      type: detectType(content),
      content,
    };
  }

  // "[X] 타입 : 내용" (대괄호 없으면 "타입 : 내용") — 일반형. 콜론이 아예 없는 오탈자 행은 전체를 content로.
  const typeContentMatch = rest.match(TYPE_CONTENT_RE);
  if (!rest.includes(":") || !typeContentMatch) {
    return {
      order,
      rawText: text,
      curriculumNameInFile,
      typeLabel: null,
      type: detectType(rest),
      content: rest,
    };
  }

  const typeLabel = typeContentMatch[1].trim();
  const content = typeContentMatch[2].trim();

  return {
    order,
    rawText: text,
    curriculumNameInFile,
    typeLabel,
    type: detectType(typeLabel, content),
    content,
  };
}

export function parseWorksheetRows(rows: unknown[][]): ParsedScheduleRow[] {
  const body = rows.slice(1); // 첫 행은 헤더("회차", "항목내용")
  const parsed: ParsedScheduleRow[] = [];

  for (const row of body) {
    const order = Number(row[0]);
    const text = String(row[1] ?? "");
    if (!Number.isFinite(order) || !text.trim()) continue;
    const result = parseRow(order, text);
    if (result) parsed.push(result);
  }

  return parsed;
}

export interface ParsedCurriculumData {
  scheduleItems: ScheduleItem[];
  scheduleComponents: ScheduleComponent[];
  /** 파싱 중 발견된, 검토가 필요한 행 (콜론 누락 등 원본 오탈자) */
  warnings: string[];
}

export function buildScheduleData(
  curriculumId: string,
  parsedRows: ParsedScheduleRow[]
): ParsedCurriculumData {
  const itemsByOrder = new Map<number, ScheduleItem>();
  const components: ScheduleComponent[] = [];
  const warnings: string[] = [];

  for (const row of parsedRows) {
    let item = itemsByOrder.get(row.order);
    if (!item) {
      item = { id: `${curriculumId}-${row.order}`, curriculumId, order: row.order };
      itemsByOrder.set(row.order, item);
    }

    if (row.typeLabel === null) {
      warnings.push(
        `회차 ${row.order}: 콜론(:) 구분자를 찾지 못해 type을 키워드로 추정했습니다 — "${row.rawText}"`
      );
    }

    components.push({
      id: `${item.id}-${components.length}`,
      scheduleItemId: item.id,
      type: row.type,
      typeLabel: row.typeLabel,
      content: row.content,
      rawText: row.rawText,
    });
  }

  return {
    scheduleItems: [...itemsByOrder.values()].sort((a, b) => a.order - b.order),
    scheduleComponents: components,
    warnings,
  };
}

/** 워크북 전체를 파싱. 시트 이름 = 커리큘럼명으로 취급한다. */
export function parseExcelWorkbook(
  buffer: ArrayBuffer
): Record<string, ParsedCurriculumData> {
  const workbook = XLSX.read(buffer, { type: "array" });
  const result: Record<string, ParsedCurriculumData> = {};

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
    });
    const parsedRows = parseWorksheetRows(rows);
    result[sheetName] = buildScheduleData(sheetName, parsedRows);
  }

  return result;
}
