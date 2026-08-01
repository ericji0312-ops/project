"use client";

import { useMemo, useState } from "react";
import { useScheduleStore, prefixedLine } from "@/lib/store";
import { parseRow } from "@/lib/excelParser";
import type { ScheduleComponent } from "@/types/schedule";

function componentLineText(component: ScheduleComponent): string {
  return component.typeLabel ? `${component.typeLabel} : ${component.content}` : component.content;
}

export default function CurriculumItemEditor({ curriculumId }: { curriculumId: string }) {
  const curricula = useScheduleStore((s) => s.curricula);
  const scheduleItems = useScheduleStore((s) => s.scheduleItems);
  const scheduleComponents = useScheduleStore((s) => s.scheduleComponents);
  const assignments = useScheduleStore((s) => s.assignments);
  const addComponentsToOrder = useScheduleStore((s) => s.addComponentsToOrder);
  const updateScheduleComponent = useScheduleStore((s) => s.updateScheduleComponent);
  const deleteScheduleComponent = useScheduleStore((s) => s.deleteScheduleComponent);
  const deleteScheduleItem = useScheduleStore((s) => s.deleteScheduleItem);

  const curriculum = curricula.find((c) => c.id === curriculumId);

  const items = useMemo(
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

  const assignmentCountByComponentId = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of assignments) {
      map.set(a.scheduleComponentId, (map.get(a.scheduleComponentId) ?? 0) + 1);
    }
    return map;
  }, [assignments]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingComponentId, setEditingComponentId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editWarning, setEditWarning] = useState<string | null>(null);

  const [pendingDeleteComponentId, setPendingDeleteComponentId] = useState<string | null>(null);
  const [pendingDeleteItemId, setPendingDeleteItemId] = useState<string | null>(null);

  const [newOrder, setNewOrder] = useState("");
  const [newLines, setNewLines] = useState("");
  const [addWarnings, setAddWarnings] = useState<string[]>([]);

  if (!curriculum) return null;

  const orderNum = Number(newOrder);
  const orderValid = Number.isInteger(orderNum) && orderNum > 0;
  const matchedItem = orderValid ? items.find((i) => i.order === orderNum) : undefined;
  const previewLines = newLines
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const parsedPreview = orderValid
    ? previewLines.map((line) => parseRow(orderNum, prefixedLine(curriculum, line)))
    : [];

  function startEdit(component: ScheduleComponent) {
    setEditingComponentId(component.id);
    setEditDraft(componentLineText(component));
    setEditWarning(null);
    setError(null);
  }

  async function handleSaveEdit(component: ScheduleComponent, order: number) {
    setBusy(true);
    setError(null);
    try {
      const { warning } = await updateScheduleComponent(
        component.id,
        curriculumId,
        order,
        editDraft
      );
      setEditWarning(warning ?? null);
      setEditingComponentId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteComponent(componentId: string) {
    setBusy(true);
    setError(null);
    try {
      await deleteScheduleComponent(componentId);
      setPendingDeleteComponentId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteItem(itemId: string) {
    setBusy(true);
    setError(null);
    try {
      await deleteScheduleItem(itemId);
      setPendingDeleteItemId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddSubmit() {
    setError(null);
    if (!orderValid) {
      setError("회차 번호를 올바르게 입력해주세요.");
      return;
    }
    if (previewLines.length === 0) {
      setError("추가할 내용을 한 줄 이상 입력해주세요.");
      return;
    }
    setBusy(true);
    try {
      const { warnings } = await addComponentsToOrder(curriculumId, orderNum, previewLines);
      setAddWarnings(warnings);
      setNewOrder("");
      setNewLines("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t bg-gray-50 dark:bg-neutral-900 p-3 space-y-3 text-xs">
      {error && <p className="text-red-600">{error}</p>}

      {items.length === 0 && <p className="text-gray-500">아직 회차가 없습니다.</p>}

      <div className="space-y-2">
        {items.map((item) => {
          const components = (componentsByItemId.get(item.id) ?? []).slice();
          const itemAssignmentCount = components.reduce(
            (sum, c) => sum + (assignmentCountByComponentId.get(c.id) ?? 0),
            0
          );
          const isPendingItemDelete = pendingDeleteItemId === item.id;

          return (
            <div key={item.id} className="border rounded bg-white dark:bg-neutral-950 p-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-medium">{item.order}회차</span>
                {isPendingItemDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-red-600">
                      회차 전체를 삭제할까요?
                      {itemAssignmentCount > 0 && ` (배정 기록 ${itemAssignmentCount}건도 함께 삭제됨)`}
                    </span>
                    <button
                      className="bg-red-600 text-white rounded px-2 py-0.5 transition-colors duration-150 hover:bg-red-700 disabled:opacity-40"
                      disabled={busy}
                      onClick={() => handleDeleteItem(item.id)}
                    >
                      확인
                    </button>
                    <button
                      className="border rounded px-2 py-0.5 transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-neutral-800"
                      disabled={busy}
                      onClick={() => setPendingDeleteItemId(null)}
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <button
                    className="text-gray-500 transition-colors hover:text-red-600"
                    onClick={() => setPendingDeleteItemId(item.id)}
                  >
                    회차 전체 삭제
                  </button>
                )}
              </div>

              <div className="space-y-1">
                {components.map((component) => {
                  const isEditing = editingComponentId === component.id;
                  const isPendingDelete = pendingDeleteComponentId === component.id;
                  const assignmentCount = assignmentCountByComponentId.get(component.id) ?? 0;

                  if (isEditing) {
                    return (
                      <div key={component.id} className="flex items-center gap-2">
                        <input
                          className="border rounded px-2 py-1 flex-1"
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveEdit(component, item.order);
                            if (e.key === "Escape") setEditingComponentId(null);
                          }}
                          autoFocus
                        />
                        <button
                          className="bg-blue-600 text-white rounded px-2 py-1 transition-colors duration-150 hover:bg-blue-700 disabled:opacity-40"
                          disabled={busy || !editDraft.trim()}
                          onClick={() => handleSaveEdit(component, item.order)}
                        >
                          저장
                        </button>
                        <button
                          className="border rounded px-2 py-1 transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-neutral-800"
                          disabled={busy}
                          onClick={() => setEditingComponentId(null)}
                        >
                          취소
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div key={component.id} className="flex items-center justify-between gap-2">
                      <span>{componentLineText(component)}</span>

                      {isPendingDelete ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-red-600">
                            삭제할까요?
                            {assignmentCount > 0 && ` (배정 기록 ${assignmentCount}건도 삭제됨)`}
                          </span>
                          <button
                            className="bg-red-600 text-white rounded px-2 py-0.5 transition-colors duration-150 hover:bg-red-700 disabled:opacity-40"
                            disabled={busy}
                            onClick={() => handleDeleteComponent(component.id)}
                          >
                            확인
                          </button>
                          <button
                            className="border rounded px-2 py-0.5 transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-neutral-800"
                            disabled={busy}
                            onClick={() => setPendingDeleteComponentId(null)}
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 shrink-0">
                          <button
                            className="text-gray-500 transition-colors hover:text-blue-600"
                            onClick={() => startEdit(component)}
                          >
                            수정
                          </button>
                          <button
                            className="text-gray-500 transition-colors hover:text-red-600"
                            onClick={() => setPendingDeleteComponentId(component.id)}
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {editWarning && editingComponentId === null && (
                <p className="text-amber-600">{editWarning}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="border rounded bg-white dark:bg-neutral-950 p-2 space-y-2">
        <p className="font-medium">새 항목 추가</p>
        <div className="flex items-center gap-2">
          <span>회차 번호</span>
          <input
            className="border rounded px-2 py-1 w-20"
            value={newOrder}
            onChange={(e) => setNewOrder(e.target.value)}
            placeholder="예: 19"
          />
          {orderValid &&
            (matchedItem ? (
              <span className="text-blue-700">기존 {orderNum}회차에 항목이 추가됩니다</span>
            ) : (
              <span className="text-green-700">새 {orderNum}회차가 생성됩니다</span>
            ))}
        </div>

        <textarea
          className="border rounded px-2 py-1 w-full font-mono"
          rows={3}
          value={newLines}
          onChange={(e) => setNewLines(e.target.value)}
          placeholder={
            curriculum.hasTypedComponents
              ? "한 줄에 하나씩:\n미적분1 개념 : 개념19. 로그함수의 뜻 듣고 바인더 정리\n연산 트레이닝 : 개념19. 로그함수의 뜻 풀기"
              : "한 줄에 하나씩:\n함수의 극한 1~25번 풀기"
          }
        />

        {parsedPreview.length > 0 && (
          <div className="bg-gray-50 dark:bg-neutral-900 border rounded p-2 space-y-0.5">
            <p className="text-gray-500">미리보기</p>
            {parsedPreview.map((r, i) =>
              r ? (
                <div key={i}>
                  {r.typeLabel ? `[${r.type}] ` : ""}
                  {r.content}
                </div>
              ) : null
            )}
          </div>
        )}

        {addWarnings.length > 0 && (
          <ul className="list-disc pl-5 text-amber-600">
            {addWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}

        <button
          className="bg-blue-600 text-white rounded px-3 py-1.5 transition-colors duration-150 hover:bg-blue-700 disabled:opacity-40"
          disabled={busy || !orderValid || previewLines.length === 0}
          onClick={handleAddSubmit}
        >
          추가
        </button>
      </div>
    </div>
  );
}
