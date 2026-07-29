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
  /** 적재 시점에 병합/신규생성 중 어떤 동작이었는지 (완료 후 라벨 표시용 — 신규 생성 직후엔
   * curriculumName이 자기 자신과 매칭돼버려 실시간 matched 값을 쓰면 라벨이 잘못 나온다) */
  loadedAsMerge?: boolean;
  /** 병합 적재 후 실제로 추가된 회차 수 (병합 모드였을 때만 채워짐) */
  mergedAddedCount?: number;
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
  const curricula = useScheduleStore((s) => s.curricula);
  const scheduleItems = useScheduleStore((s) => s.scheduleItems);
  const scheduleComponents = useScheduleStore((s) => s.scheduleComponents);
  const addSubject = useScheduleStore((s) => s.addSubject);
  const addCurriculum = useScheduleStore((s) => s.addCurriculum);
  const mergeCurriculum = useScheduleStore((s) => s.mergeCurriculum);
  const deleteCurriculum = useScheduleStore((s) => s.deleteCurriculum);

  useEffect(() => {
    if (!initialized) fetchAll();
  }, [initialized, fetchAll]);

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedBySheet, setParsedBySheet] = useState<Record<string, ParsedCurriculumData>>({});
  const [configBySheet, setConfigBySheet] = useState<Record<string, SheetConfig>>({});
  const [error, setError] = useState<string | null>(null);
  const [loadingSheet, setLoadingSheet] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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

      updateConfig(sheetName, { loaded: true, loadedAsMerge: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingSheet(null);
    }
  }

  async function handleMerge(sheetName: string, curriculumId: string) {
    const data = parsedBySheet[sheetName];
    if (!data) return;

    setError(null);
    setLoadingSheet(sheetName);
    try {
      const addedCount = await mergeCurriculum(
        curriculumId,
        data.scheduleItems,
        data.scheduleComponents
      );
      updateConfig(sheetName, { loaded: true, loadedAsMerge: true, mergedAddedCount: addedCount });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingSheet(null);
    }
  }

  async function handleDeleteCurriculum(curriculumId: string) {
    setError(null);
    setDeleting(true);
    try {
      await deleteCurriculum(curriculumId);
      setPendingDeleteId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
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
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          className="block w-full text-gray-700 dark:text-gray-300 cursor-pointer
            file:mr-4 file:cursor-pointer file:rounded file:border-0
            file:bg-blue-600 file:px-4 file:py-2 file:font-medium file:text-white
            file:transition-colors file:duration-150
            hover:file:bg-blue-700 hover:file:shadow-md"
        />
        {fileName && <p className="mt-2 text-gray-500">선택된 파일: {fileName}</p>}
        {error && <p className="mt-2 text-red-600">{error}</p>}
      </div>

      {Object.entries(parsedBySheet).map(([sheetName, data]) => {
        const config = configBySheet[sheetName];
        if (!config) return null;

        const matched = curricula.find((c) => c.name === config.curriculumName.trim());
        const existingOrdersForMatched = matched
          ? new Set(
              scheduleItems.filter((i) => i.curriculumId === matched.id).map((i) => i.order)
            )
          : null;
        const newOrderCount = existingOrdersForMatched
          ? data.scheduleItems.filter((i) => !existingOrdersForMatched.has(i.order)).length
          : 0;
        const existingOrderCount = data.scheduleItems.length - newOrderCount;
        // 적재 완료 후에는 그 시점에 실제로 어떤 동작이었는지(loadedAsMerge)를 기준으로 표시한다.
        // 그렇지 않으면 신규 생성 직후 curriculumName이 방금 만든 자기 자신과 매칭되어
        // 화면이 "병합됨"으로 잘못 보인다.
        const showAsMerge = config.loaded ? Boolean(config.loadedAsMerge) : Boolean(matched);

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

              {!showAsMerge && (
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
              )}

              {!showAsMerge && config.subjectId === "__new__" && (
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

            {!config.loaded &&
              (matched ? (
                <p className="text-blue-700 bg-blue-50 dark:bg-blue-950 rounded p-2">
                  기존 커리큘럼 <strong>{matched.name}</strong>에 병합됩니다 — 새 회차{" "}
                  <strong>{newOrderCount}개</strong> 추가 예정
                  {existingOrderCount > 0 && ` (이미 있는 회차 ${existingOrderCount}개는 건너뜀)`}
                  {newOrderCount === 0 && " · 추가할 새 회차가 없습니다"}
                </p>
              ) : (
                <div className="flex items-center gap-4">
                  <span className="font-medium">구성요소 타입 구분</span>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      checked={config.hasTypedComponents}
                      onChange={() => updateConfig(sheetName, { hasTypedComponents: true })}
                    />
                    있음 (일반형 — 개념/연산/RX/라이트쎈/오답노트 등)
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      checked={!config.hasTypedComponents}
                      onChange={() => updateConfig(sheetName, { hasTypedComponents: false })}
                    />
                    없음 (기출형)
                  </label>
                </div>
              ))}

            <div className="text-gray-600 dark:text-gray-400">
              회차 {data.scheduleItems.length}개 · 구성요소 {data.scheduleComponents.length}개
              {data.warnings.length > 0 && (
                <span className="text-amber-600"> · 경고 {data.warnings.length}건</span>
              )}
            </div>

            {data.warnings.length > 0 && (
              <details>
                <summary className="cursor-pointer text-amber-700 transition-colors hover:text-amber-900">
                  경고 내용 보기
                </summary>
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
              className="bg-blue-600 text-white rounded px-4 py-2 transition-colors duration-150 hover:bg-blue-700 hover:shadow-md disabled:opacity-40 disabled:hover:bg-blue-600 disabled:hover:shadow-none"
              disabled={
                config.loaded || loadingSheet === sheetName || (Boolean(matched) && newOrderCount === 0)
              }
              onClick={() =>
                matched ? handleMerge(sheetName, matched.id) : handleLoad(sheetName)
              }
            >
              {config.loaded
                ? config.loadedAsMerge
                  ? `병합 완료 (${config.mergedAddedCount ?? 0}개 회차 추가됨)`
                  : "적재 완료"
                : loadingSheet === sheetName
                  ? matched
                    ? "병합 중..."
                    : "적재 중..."
                  : matched
                    ? "이 커리큘럼에 병합하기"
                    : "이 커리큘럼 적재하기"}
            </button>
          </div>
        );
      })}

      <section className="space-y-2">
        <h2 className="text-lg font-bold">업로드된 커리큘럼</h2>
        {curricula.length === 0 && (
          <p className="text-gray-500">아직 업로드된 커리큘럼이 없습니다.</p>
        )}
        <div className="border rounded divide-y">
          {curricula.map((c) => {
            const subjectName = subjects.find((s) => s.id === c.subjectId)?.name ?? "(알 수 없음)";
            const itemCount = scheduleItems.filter((i) => i.curriculumId === c.id).length;
            const componentCount = scheduleComponents.filter((comp) =>
              scheduleItems.some((i) => i.id === comp.scheduleItemId && i.curriculumId === c.id)
            ).length;
            const isPending = pendingDeleteId === c.id;

            return (
              <div key={c.id} className="flex items-center justify-between p-3">
                <div>
                  <span className="font-medium">{c.name}</span>
                  <span className="ml-2 text-xs text-gray-500">
                    {subjectName} · 회차 {itemCount}개 · 구성요소 {componentCount}개
                  </span>
                </div>

                {isPending ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-600">
                      정말 삭제할까요? (회차/구성요소/관련 배정 기록 모두 삭제됨)
                    </span>
                    <button
                      className="text-xs bg-red-600 text-white rounded px-2 py-1 transition-colors duration-150 hover:bg-red-700 hover:shadow-md disabled:opacity-40 disabled:hover:bg-red-600 disabled:hover:shadow-none"
                      disabled={deleting}
                      onClick={() => handleDeleteCurriculum(c.id)}
                    >
                      확인
                    </button>
                    <button
                      className="text-xs border rounded px-2 py-1 transition-colors duration-150 hover:bg-gray-50 hover:shadow-sm dark:hover:bg-neutral-800"
                      disabled={deleting}
                      onClick={() => setPendingDeleteId(null)}
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <button
                    className="text-xs text-gray-500 transition-colors hover:text-red-600"
                    onClick={() => setPendingDeleteId(c.id)}
                  >
                    삭제
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
