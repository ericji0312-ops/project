"use client";

import { useEffect, useState } from "react";
import { useScheduleStore } from "@/lib/store";
import { parseExcelWorkbook, type ParsedCurriculumData } from "@/lib/excelParser";

interface SheetConfig {
  curriculumName: string;
  hasTypedComponents: boolean;
  subjectId: string; // "__new__" 이면 newSubjectName 사용
  newSubjectName: string;
  loaded: boolean;
}

function detectHasTypedComponents(data: ParsedCurriculumData): boolean {
  const total = data.scheduleComponents.length;
  if (total === 0) return true;
  const typedCount = data.scheduleComponents.filter((c) => c.typeLabel !== null).length;
  return typedCount > total / 2;
}

export default function UploadCurriculum() {
  const initialized = useScheduleStore((s) => s.initialized);
  const fetchAll = useScheduleStore((s) => s.fetchAll);
  const subjects = useScheduleStore((s) => s.subjects);
  const addSubject = useScheduleStore((s) => s.addSubject);
  const addCurriculum = useScheduleStore((s) => s.addCurriculum);

  useEffect(() => {
    if (!initialized) fetchAll();
  }, [initialized, fetchAll]);

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedBySheet, setParsedBySheet] = useState<Record<string, ParsedCurriculumData>>({});
  const [configBySheet, setConfigBySheet] = useState<Record<string, SheetConfig>>({});
  const [error, setError] = useState<string | null>(null);
  const [loadingSheet, setLoadingSheet] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const result = parseExcelWorkbook(buffer);

      if (Object.keys(result).length === 0) {
        setError("시트를 찾을 수 없습니다. 파일 형식을 확인해주세요.");
        return;
      }

      setParsedBySheet(result);
      setConfigBySheet(
        Object.fromEntries(
          Object.entries(result).map(([sheetName, data]) => [
            sheetName,
            {
              curriculumName: sheetName,
              hasTypedComponents: detectHasTypedComponents(data),
              subjectId: subjects[0]?.id ?? "__new__",
              newSubjectName: "",
              loaded: false,
            } satisfies SheetConfig,
          ])
        )
      );
    } catch {
      setError("엑셀 파일을 읽는 중 오류가 발생했습니다. 파일이 손상되지 않았는지 확인해주세요.");
    }
  }

  function updateConfig(sheetName: string, patch: Partial<SheetConfig>) {
    setConfigBySheet((prev) => ({
      ...prev,
      [sheetName]: { ...prev[sheetName], ...patch },
    }));
  }

  async function handleLoad(sheetName: string) {
    const data = parsedBySheet[sheetName];
    const config = configBySheet[sheetName];
    if (!data || !config) return;

    setError(null);
    setLoadingSheet(sheetName);
    try {
      let subjectId = config.subjectId;
      if (subjectId === "__new__") {
        if (!config.newSubjectName.trim()) {
          setError("새 과목 이름을 입력해주세요.");
          return;
        }
        subjectId = (await addSubject(config.newSubjectName.trim())).id;
      }

      await addCurriculum(
        {
          subjectId,
          name: config.curriculumName.trim() || sheetName,
          hasTypedComponents: config.hasTypedComponents,
        },
        data.scheduleItems,
        data.scheduleComponents
      );

      updateConfig(sheetName, { loaded: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingSheet(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6 text-sm">
      <h1 className="text-xl font-bold">엑셀 업로드</h1>
      <p className="text-gray-600 dark:text-gray-400">
        원장님이 작성한 학습스케줄표 엑셀을 업로드하면 시트별로 파싱 결과를 미리 보여줘요.
        내용을 확인하고 과목/커리큘럼명을 확정한 뒤 적재하면 배정화면에서 바로 사용할 수 있어요.
      </p>

      <div className="border rounded p-4">
        <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} />
        {fileName && <p className="mt-2 text-gray-500">선택된 파일: {fileName}</p>}
        {error && <p className="mt-2 text-red-600">{error}</p>}
      </div>

      {Object.entries(parsedBySheet).map(([sheetName, data]) => {
        const config = configBySheet[sheetName];
        if (!config) return null;

        return (
          <div key={sheetName} className="border rounded p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">시트: {sheetName}</h2>
              {config.loaded && (
                <span className="text-green-700 bg-green-50 dark:bg-green-950 px-2 py-0.5 rounded text-xs">
                  적재됨
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1">
                <span className="font-medium">커리큘럼 이름</span>
                <input
                  className="border rounded px-2 py-1"
                  value={config.curriculumName}
                  disabled={config.loaded}
                  onChange={(e) => updateConfig(sheetName, { curriculumName: e.target.value })}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="font-medium">과목</span>
                <select
                  className="border rounded px-2 py-1"
                  value={config.subjectId}
                  disabled={config.loaded}
                  onChange={(e) => updateConfig(sheetName, { subjectId: e.target.value })}
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  <option value="__new__">+ 새 과목 추가</option>
                </select>
              </label>

              {config.subjectId === "__new__" && (
                <label className="flex flex-col gap-1 col-span-2">
                  <span className="font-medium">새 과목 이름</span>
                  <input
                    className="border rounded px-2 py-1"
                    value={config.newSubjectName}
                    disabled={config.loaded}
                    onChange={(e) => updateConfig(sheetName, { newSubjectName: e.target.value })}
                  />
                </label>
              )}
            </div>

            <div className="flex items-center gap-4">
              <span className="font-medium">구성요소 타입 구분</span>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  disabled={config.loaded}
                  checked={config.hasTypedComponents}
                  onChange={() => updateConfig(sheetName, { hasTypedComponents: true })}
                />
                있음 (일반형 — 개념/연산/RX/라이트쎈/오답노트 등)
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  disabled={config.loaded}
                  checked={!config.hasTypedComponents}
                  onChange={() => updateConfig(sheetName, { hasTypedComponents: false })}
                />
                없음 (기출형)
              </label>
            </div>

            <div className="text-gray-600 dark:text-gray-400">
              회차 {data.scheduleItems.length}개 · 구성요소 {data.scheduleComponents.length}개
              {data.warnings.length > 0 && (
                <span className="text-amber-600"> · 경고 {data.warnings.length}건</span>
              )}
            </div>

            {data.warnings.length > 0 && (
              <details>
                <summary className="cursor-pointer text-amber-700">경고 내용 보기</summary>
                <ul className="list-disc pl-5 text-xs text-gray-600 dark:text-gray-400">
                  {data.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            )}

            <div>
              <p className="font-medium mb-1">미리보기 (앞 2회차)</p>
              <div className="space-y-1 text-xs bg-gray-50 dark:bg-neutral-900 border rounded p-2">
                {data.scheduleItems.slice(0, 2).map((item) => (
                  <div key={item.id}>
                    <span className="font-medium">{item.order}회차</span>{" "}
                    {data.scheduleComponents
                      .filter((c) => c.scheduleItemId === item.id)
                      .map((c) =>
                        config.hasTypedComponents ? `[${c.type}] ${c.content}` : c.content
                      )
                      .join(" / ")}
                  </div>
                ))}
              </div>
            </div>

            <button
              className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-40"
              disabled={config.loaded || loadingSheet === sheetName}
              onClick={() => handleLoad(sheetName)}
            >
              {config.loaded
                ? "적재 완료"
                : loadingSheet === sheetName
                  ? "적재 중..."
                  : "이 커리큘럼 적재하기"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
