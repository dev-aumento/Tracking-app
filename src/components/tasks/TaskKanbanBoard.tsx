import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { trpc } from "@/providers/trpc";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { PriorityBadge } from "@/components/shared/StatusBadge";
import { GripVertical, Plus, Loader2, Calendar, Clock, Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { EdgeScrollArea } from "@/components/shared/EdgeScrollArea";
import {
  formatDueLabel,
  isTaskDueToday,
  isTaskOverdue,
  trackedSecondsFromHours,
} from "@/lib/task-deadline";
import { formatDurationClock } from "@/lib/utils";
import { invalidateProjectStats } from "@/lib/project-stats";
import { refreshDashboardStats } from "@/lib/dashboard-refresh";
import { taskLocateHighlightClass } from "@/hooks/useLocateTaskInView";
import { cn } from "@/lib/utils";
import {
  PROJECT_PIPELINE_STAGES,
  contrastingTextOnColor,
  isPipelineStageDeletable,
  taskBelongsToPipelineColumn,
  tasksForPipelineColumn,
  withOrphanPipelineStages,
  type PipelineStageDef,
  type ProjectPipelineStageKey,
} from "@/lib/task-kanban";

type KanbanTask = {
  id: number;
  title: string;
  status: string;
  stage?: string | null;
  priority: string;
  position?: number | null;
  dueDate?: string | Date | null;
  estimatedHours?: string | number | null;
  actualHours?: string | number | null;
  assignee?: { name: string | null; avatar?: string | null } | null;
};

type DropTarget = { columnKey: string; index: number };

type ReorderItem = { id: number; position: number; stage?: string };

const COLUMN_SCROLL_EDGE_PX = 140;
const COLUMN_SCROLL_MAX_SPEED = 22;
const BOARD_SCROLL_EDGE_PX = 80;
const BOARD_SCROLL_MAX_SPEED = 18;

function edgeDelta(distanceFromOuterEdge: number, edgePx: number, maxSpeed: number) {
  const clamped = Math.min(edgePx, Math.max(0, distanceFromOuterEdge));
  const intensity = 1 - clamped / edgePx;
  return (0.5 + 0.5 * intensity) * maxSpeed;
}

function kanbanPosition(task: { position?: number | null }) {
  return typeof task.position === "number" && Number.isFinite(task.position)
    ? task.position
    : 0;
}

function orderedColumnTasks<T extends { id: number; position?: number | null }>(tasks: T[]) {
  return [...tasks].sort((a, b) => kanbanPosition(a) - kanbanPosition(b));
}

function applyColumnOrder<T extends { id: number; position?: number | null }>(
  tasks: T[],
  ids: number[] | undefined,
) {
  const sorted = orderedColumnTasks(tasks);
  if (!ids?.length) return sorted;
  const byId = new Map(sorted.map((task) => [task.id, task]));
  const ordered: T[] = [];
  const seen = new Set<number>();
  for (const id of ids) {
    const task = byId.get(id);
    if (!task) continue;
    ordered.push(task);
    seen.add(id);
  }
  for (const task of sorted) {
    if (!seen.has(task.id)) ordered.push(task);
  }
  return ordered;
}

function columnKeyOf(task: KanbanTask, columnKeys: string[]) {
  return (
    columnKeys.find((key) => taskBelongsToPipelineColumn(task, key)) ??
    task.stage ??
    "new"
  );
}

function planColumnReorder(
  tasks: KanbanTask[],
  columnKeys: string[],
  columnOrder: Record<string, number[]>,
  taskId: number,
  target: DropTarget,
): { items: ReorderItem[]; orders: Record<string, number[]> } | null {
  const dragged = tasks.find((task) => task.id === taskId);
  if (!dragged) return null;

  const sourceKey = columnKeyOf(dragged, columnKeys);
  const source = applyColumnOrder(
    tasks.filter((task) => taskBelongsToPipelineColumn(task, sourceKey)),
    columnOrder[sourceKey],
  ).filter((task) => task.id !== taskId);

  if (sourceKey === target.columnKey) {
    const index = Math.max(0, Math.min(target.index, source.length));
    const next = [...source.slice(0, index), dragged, ...source.slice(index)];
    const previous = applyColumnOrder(
      tasks.filter((task) => taskBelongsToPipelineColumn(task, sourceKey)),
      columnOrder[sourceKey],
    );
    if (next.every((task, index) => task.id === previous[index]?.id)) return null;
    return {
      items: next.map((task, index) => ({ id: task.id, position: index })),
      orders: { [sourceKey]: next.map((task) => task.id) },
    };
  }

  const dest = applyColumnOrder(
    tasks.filter((task) => taskBelongsToPipelineColumn(task, target.columnKey)),
    columnOrder[target.columnKey],
  ).filter((task) => task.id !== taskId);
  const index = Math.max(0, Math.min(target.index, dest.length));
  const nextDest = [...dest.slice(0, index), dragged, ...dest.slice(index)];
  return {
    items: [
      ...nextDest.map((task, position) => ({
        id: task.id,
        position,
        ...(task.id === taskId ? { stage: target.columnKey } : {}),
      })),
      ...source.map((task, position) => ({ id: task.id, position })),
    ],
    orders: {
      [target.columnKey]: nextDest.map((task) => task.id),
      [sourceKey]: source.map((task) => task.id),
    },
  };
}

function columnUnderPointer(
  columns: Map<string, HTMLElement>,
  clientX: number,
  clientY: number,
) {
  for (const [key, el] of columns) {
    const rect = el.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right) continue;
    return { key, el, rect, offsetY: clientY - rect.top };
  }
  return null;
}

function scrollColumnAtPointer(
  columns: Map<string, HTMLElement>,
  clientX: number,
  clientY: number,
) {
  const hit = columnUnderPointer(columns, clientX, clientY);
  if (!hit) return false;
  const maxScroll = hit.el.scrollHeight - hit.el.clientHeight;
  if (maxScroll <= 1) return false;

  const edge = Math.min(COLUMN_SCROLL_EDGE_PX, Math.max(56, hit.rect.height * 0.22));
  let delta = 0;
  if (hit.offsetY < edge) {
    delta = -edgeDelta(hit.offsetY, edge, COLUMN_SCROLL_MAX_SPEED);
  } else if (hit.rect.height - hit.offsetY < edge) {
    delta = edgeDelta(hit.rect.height - hit.offsetY, edge, COLUMN_SCROLL_MAX_SPEED);
  }
  if (delta === 0) return false;

  const next = Math.min(maxScroll, Math.max(0, hit.el.scrollTop + delta));
  if (next === hit.el.scrollTop) return false;
  hit.el.scrollTop = next;
  return true;
}

function scrollBoardAtPointer(board: HTMLElement | null, clientX: number, clientY: number) {
  if (!board || board.scrollWidth - board.clientWidth <= 1) return;
  const rect = board.getBoundingClientRect();
  if (clientY < rect.top || clientY > rect.bottom) return;
  const offsetX = clientX - rect.left;
  if (offsetX < -24 || offsetX > rect.width + 24) return;
  let delta = 0;
  if (offsetX < BOARD_SCROLL_EDGE_PX) {
    delta = -edgeDelta(offsetX, BOARD_SCROLL_EDGE_PX, BOARD_SCROLL_MAX_SPEED);
  } else if (rect.width - offsetX < BOARD_SCROLL_EDGE_PX) {
    delta = edgeDelta(rect.width - offsetX, BOARD_SCROLL_EDGE_PX, BOARD_SCROLL_MAX_SPEED);
  }
  if (delta !== 0) board.scrollLeft += delta;
}

function snapshotColumnOrders(
  tasks: KanbanTask[],
  columnKeys: string[],
  columnOrder: Record<string, number[]>,
) {
  const orders: Record<string, number[]> = {};
  for (const key of columnKeys) {
    orders[key] = applyColumnOrder(
      tasks.filter((task) => taskBelongsToPipelineColumn(task, key)),
      columnOrder[key],
    ).map((task) => task.id);
  }
  return orders;
}

function itemsForOrderChange(
  start: Record<string, number[]>,
  final: Record<string, number[]>,
) {
  const items: ReorderItem[] = [];
  const keys = new Set([...Object.keys(start), ...Object.keys(final)]);
  for (const key of keys) {
    const before = start[key] ?? [];
    const after = final[key] ?? before;
    if (before.length === after.length && before.every((id, index) => id === after[index])) {
      continue;
    }
    const beforeSet = new Set(before);
    after.forEach((id, position) => {
      items.push({
        id,
        position,
        ...(beforeSet.has(id) ? {} : { stage: key }),
      });
    });
  }
  return items;
}

function pointerDragDirection(originY: number, clientY: number) {
  const delta = clientY - originY;
  if (delta > 8) return "down" as const;
  if (delta < -8) return "up" as const;
  return "none" as const;
}

/** Index in the column with the dragged card removed. */
function dropIndexInColumn(
  scroller: HTMLElement,
  clientY: number,
  draggedId: number | null,
  direction: "up" | "down" | "none",
) {
  const cards = [...scroller.querySelectorAll<HTMLElement>("[data-kanban-task-id]")].filter(
    (el) => {
      if (draggedId != null && Number(el.dataset.kanbanTaskId) === draggedId) return false;
      return el.getBoundingClientRect().height > 8;
    },
  );
  // Moving down, the slot is after a card once the pointer is on it.
  // Moving up, the slot is before a card once the pointer is on it.
  const ratio = direction === "down" ? 0.2 : direction === "up" ? 0.8 : 0.5;
  for (let index = 0; index < cards.length; index += 1) {
    const rect = cards[index].getBoundingClientRect();
    if (clientY < rect.top + rect.height * ratio) return index;
  }
  return cards.length;
}

function formatKanbanDeadline(dueDate: string | Date) {
  return formatDueLabel(dueDate, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatKanbanHours(
  estimated?: string | number | null,
  actual?: string | number | null,
) {
  const trackedSeconds = trackedSecondsFromHours(
    actual != null ? String(actual) : null,
  );
  if (trackedSeconds > 0) {
    return formatDurationClock(trackedSeconds);
  }

  const estimatedHours = parseFloat(String(estimated ?? "0"));
  if (!Number.isNaN(estimatedHours) && estimatedHours > 0) {
    const rounded = Number.isInteger(estimatedHours)
      ? String(estimatedHours)
      : estimatedHours.toFixed(1);
    return `${rounded}h est`;
  }

  return "0h";
}

function KanbanTaskCard({
  task,
  isDragging,
  isHighlighted,
  onPointerDown,
  onClick,
}: {
  task: KanbanTask;
  isDragging?: boolean;
  isHighlighted?: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onClick: () => void;
}) {
  const overdue = isTaskOverdue(task);
  const dueToday = isTaskDueToday(task);
  const hoursLabel = formatKanbanHours(task.estimatedHours, task.actualHours);

  const borderClass = overdue
    ? "border-red-500 hover:border-red-600 hover:shadow-md shadow-sm shadow-red-100"
    : dueToday
      ? "border-amber-500 hover:border-amber-600 hover:shadow-md shadow-sm shadow-amber-100"
      : "border-gray-200 hover:shadow-md";

  const deadlineClass = overdue
    ? "text-red-600 font-medium"
    : dueToday
      ? "text-amber-600 font-medium"
      : task.dueDate
        ? "text-gray-600"
        : "text-gray-400";

  return (
    <motion.div
      data-task-locate-id={task.id}
      onPointerDown={onPointerDown}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isDragging ? 0.35 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={cn(
        "bg-white rounded-lg p-3.5 cursor-grab touch-none select-none transition-shadow border-2",
        borderClass,
        isDragging && "cursor-grabbing",
        isHighlighted && taskLocateHighlightClass,
      )}
    >
      <div className="flex items-start gap-2 mb-2">
        <GripVertical size={14} className="text-gray-300 mt-0.5 flex-shrink-0 pointer-events-none" />
        <span className="text-sm font-medium text-[#1F2937] leading-snug">{task.title}</span>
      </div>

      <div className="flex items-center gap-2 mb-2.5">
        <PriorityBadge priority={task.priority as "low" | "medium" | "high" | "urgent"} size="sm" />
      </div>

      <div className="flex items-center gap-2 mb-2.5 min-h-[22px]">
        {task.assignee ? (
          <>
            <UserAvatar name={task.assignee.name} avatar={task.assignee.avatar} size={22} />
            <span className="text-xs text-gray-600 truncate">{task.assignee.name}</span>
          </>
        ) : (
          <span className="text-[11px] text-gray-400">Unassigned</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-gray-100 text-[11px]">
        <div className="flex items-center gap-1.5 min-w-0">
          <Calendar size={12} className="shrink-0 text-gray-400" />
          <span className={`truncate ${deadlineClass}`}>
            {task.dueDate ? formatKanbanDeadline(task.dueDate) : "No deadline"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 justify-end min-w-0">
          <Clock size={12} className="shrink-0 text-gray-400" />
          <span className="font-mono tabular-nums text-gray-600 truncate">{hoursLabel}</span>
        </div>
      </div>
    </motion.div>
  );
}

type TaskListQueryInput = {
  limit: number;
  projectId?: number;
  assigneeId?: number;
};

interface TaskKanbanBoardProps {
  tasks: KanbanTask[];
  isLoading?: boolean;
  onTaskClick: (id: number) => void;
  canCreate?: boolean;
  projectId?: number;
  listQueryInput?: TaskListQueryInput;
  onCreateClick?: (stage: ProjectPipelineStageKey) => void;
  highlightedTaskId?: number | null;
  /** Pipeline columns (defaults + project custom sections). */
  stages?: PipelineStageDef[];
  /** Show "New section" column (project board only). */
  canAddSection?: boolean;
  onAddSection?: (label: string) => Promise<void> | void;
  addingSection?: boolean;
  /** Rename column label only (stage key stays the same). */
  canRenameSection?: boolean;
  onRenameSection?: (key: string, label: string) => Promise<void> | void;
  renamingSection?: boolean;
  canDeleteSection?: boolean;
  onDeleteSection?: (key: string) => Promise<void> | void;
  deletingSection?: boolean;
  canReorderSection?: boolean;
  onReorderSection?: (key: string, direction: "left" | "right") => Promise<void> | void;
  reorderingSection?: boolean;
}

export function TaskKanbanBoard({
  tasks,
  isLoading,
  onTaskClick,
  canCreate = true,
  projectId,
  listQueryInput,
  onCreateClick,
  highlightedTaskId = null,
  stages = PROJECT_PIPELINE_STAGES.map((s) => ({ ...s })),
  canAddSection = false,
  onAddSection,
  addingSection = false,
  canRenameSection = false,
  onRenameSection,
  renamingSection = false,
  canDeleteSection = false,
  onDeleteSection,
  deletingSection = false,
  canReorderSection = false,
  onReorderSection,
  reorderingSection = false,
}: TaskKanbanBoardProps) {
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const didDragRef = useRef(false);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);
  const columnScrollersRef = useRef(new Map<string, HTMLDivElement>());
  const boardScrollerRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const dragOriginRef = useRef({ x: 0, y: 0 });
  const draggedNodeRef = useRef<HTMLElement | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const columnKeysRef = useRef<string[]>([]);
  const [columnOrder, setColumnOrder] = useState<Record<string, number[]>>({});
  const columnOrderRef = useRef(columnOrder);
  const draggingActiveRef = useRef(false);
  if (!draggingActiveRef.current) {
    columnOrderRef.current = columnOrder;
  }
  const draggingIdRef = useRef<number | null>(null);
  const startOrderRef = useRef<Record<string, number[]>>({});
  const updateDropRef = useRef<(x: number, y: number) => void>(() => {});
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [newSectionLabel, setNewSectionLabel] = useState("");
  const newSectionInputRef = useRef<HTMLInputElement>(null);
  const [editingColumnKey, setEditingColumnKey] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const listInput =
    listQueryInput ?? (projectId ? { projectId, limit: 200 } : { limit: 200 });

  const reorderMutation = trpc.task.reorder.useMutation({
    onMutate: async ({ items }) => {
      await utils.task.list.cancel();
      const previous = utils.task.list.getData(listInput);
      const byId = new Map(items.map((item) => [item.id, item]));
      const apply = <T extends { tasks: Array<{ id: number; status: string }> }>(data: T) => ({
        ...data,
        tasks: data.tasks.map((task) => {
          const next = byId.get(task.id);
          if (!next) return task;
          return {
            ...task,
            position: next.position,
            ...(next.stage
              ? {
                  stage: next.stage,
                  ...(next.stage === "finished"
                    ? { status: "done" as const, assigneeId: null, assignee: null }
                    : task.status === "done"
                      ? { status: "in_progress" as const }
                      : {}),
                }
              : {}),
          };
        }),
      });
      const writeCache = (current: typeof previous) => {
        if (!current || !Array.isArray(current.tasks)) return current;
        return apply(current);
      };
      utils.task.list.setQueriesData({}, (current) => writeCache(current));
      if (previous) utils.task.list.setData(listInput, writeCache(previous));
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        utils.task.list.setData(listInput, context.previous);
      }
      void refreshDashboardStats(utils);
    },
    onSettled: async () => {
      await Promise.all([
        utils.task.list.invalidate(),
        utils.task.getById.invalidate(),
        refreshDashboardStats(utils),
      ]);
      invalidateProjectStats(utils, projectId);
    },
  });

  const startPointerDrag = (event: React.PointerEvent<HTMLDivElement>, taskId: number) => {
    if (event.button !== 0) return;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    pointerRef.current = { x: startX, y: startY };
    dragOriginRef.current = { x: startX, y: startY };
    let active = false;

    const concealDraggedCard = (target: EventTarget | null) => {
      const node = target instanceof Element ? target.closest("[data-kanban-task-id]") : null;
      if (!(node instanceof HTMLElement) || draggedNodeRef.current === node) return;
      node.style.setProperty("display", "none", "important");
      draggedNodeRef.current = node;
    };

    const detach = () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onCancel, true);
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      pointerRef.current = { x: ev.clientX, y: ev.clientY };
      if (!active) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
        active = true;
        draggingActiveRef.current = true;
        draggingIdRef.current = taskId;
        didDragRef.current = true;
        startOrderRef.current = snapshotColumnOrders(
          tasksRef.current,
          columnKeysRef.current,
          columnOrderRef.current,
        );
        concealDraggedCard(ev.target);
        setDraggingId(taskId);
      }
      updateDropRef.current(ev.clientX, ev.clientY);
    };

    let finished = false;
    const finish = (ev: PointerEvent) => {
      if (finished || ev.pointerId !== pointerId) return;
      finished = true;
      detach();
      if (!active) return;
      pointerRef.current = { x: ev.clientX, y: ev.clientY };
      updateDropRef.current(ev.clientX, ev.clientY);
      const target = dropTargetRef.current;
      const task = draggingIdRef.current;
      if (task != null && target) {
        const plan = planColumnReorder(
          tasksRef.current,
          columnKeysRef.current,
          columnOrderRef.current,
          task,
          target,
        );
        if (plan) {
          const nextOrder = { ...columnOrderRef.current, ...plan.orders };
          columnOrderRef.current = nextOrder;
          setColumnOrder(nextOrder);
        }
      }
      const items = itemsForOrderChange(startOrderRef.current, columnOrderRef.current);
      draggingActiveRef.current = false;
      draggingIdRef.current = null;
      dropTargetRef.current = null;
      setDropTarget(null);
      setDraggingId(null);
      if (items.length > 0) {
        reorderMutation.mutate({ items });
      }
      requestAnimationFrame(() => {
        didDragRef.current = false;
      });
    };

    const onUp = (ev: PointerEvent) => finish(ev);
    const onCancel = (ev: PointerEvent) => finish(ev);

    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onCancel, true);
  };

  useLayoutEffect(() => {
    if (draggingId != null) return;
    const node = draggedNodeRef.current;
    if (!node) return;
    node.style.removeProperty("display");
    draggedNodeRef.current = null;
  }, [draggingId]);

  useEffect(() => {
    if (draggingId == null) return;
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "grabbing";
    let frame = 0;
    const tick = () => {
      if (!draggingActiveRef.current) return;
      const { x, y } = pointerRef.current;
      scrollBoardAtPointer(boardScrollerRef.current, x, y);
      scrollColumnAtPointer(columnScrollersRef.current, x, y);
      updateDropRef.current(x, y);
      const ghost = ghostRef.current;
      if (ghost) ghost.style.transform = `translate(${x + 12}px, ${y + 14}px)`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      document.body.style.cursor = previousCursor;
      cancelAnimationFrame(frame);
    };
  }, [draggingId]);

  const submitNewSection = async () => {
    const label = newSectionLabel.trim();
    if (!label || !onAddSection || addingSection) return;
    await onAddSection(label);
    setNewSectionLabel("");
    setIsAddingSection(false);
  };

  const beginRename = (column: PipelineStageDef) => {
    if (!canRenameSection || !onRenameSection || renamingSection) return;
    setEditingColumnKey(column.key);
    setEditingLabel(column.label);
    requestAnimationFrame(() => renameInputRef.current?.select());
  };

  const cancelRename = () => {
    setEditingColumnKey(null);
    setEditingLabel("");
  };

  const tasksByColumn = (columnKey: string) =>
    applyColumnOrder(tasksForPipelineColumn(tasks, columnKey), columnOrder[columnKey]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin text-gray-400" />
      </div>
    );
  }

  const boardHeightClass = "h-[calc(100vh-12.5rem)] !overflow-y-hidden";
  const columns = withOrphanPipelineStages(stages, tasks);
  columnKeysRef.current = columns.map((column) => column.key);
  updateDropRef.current = (x, y) => {
    const taskId = draggingIdRef.current;
    if (taskId == null) return;
    const hit = columnUnderPointer(columnScrollersRef.current, x, y);
    if (!hit) return;
    const target = {
      columnKey: hit.key,
      index: dropIndexInColumn(
        hit.el,
        y,
        taskId,
        pointerDragDirection(dragOriginRef.current.y, y),
      ),
    };
    const prev = dropTargetRef.current;
    if (prev?.columnKey !== target.columnKey || prev.index !== target.index) {
      dropTargetRef.current = target;
      setDropTarget(target);
    }
  };
  const draggingTask = draggingId == null ? null : tasks.find((task) => task.id === draggingId) ?? null;

  const submitRename = async () => {
    if (!editingColumnKey || !onRenameSection || renamingSection) return;
    const label = editingLabel.trim();
    const current = columns.find((c) => c.key === editingColumnKey);
    if (!label || !current || label === current.label) {
      cancelRename();
      return;
    }
    await onRenameSection(editingColumnKey, label);
    cancelRename();
  };

  const handleDeleteSection = async (column: PipelineStageDef) => {
    if (!canDeleteSection || !onDeleteSection || deletingSection) return;
    if (!isPipelineStageDeletable(column.key)) return;
    const count = tasksByColumn(column.key).length;
    const message =
      count > 0
        ? `Delete "${column.label}"? ${count} task(s) in this section will move to To Do.`
        : `Delete "${column.label}"?`;
    if (!window.confirm(message)) return;
    await onDeleteSection(column.key);
  };

  const handleReorderSection = async (
    column: PipelineStageDef,
    direction: "left" | "right",
  ) => {
    if (!canReorderSection || !onReorderSection || reorderingSection) return;
    await onReorderSection(column.key, direction);
  };

  return (
    <EdgeScrollArea className={boardHeightClass} showScrollbar scrollerRef={boardScrollerRef}>
      <div className="flex gap-3 w-max min-w-full pb-2 items-stretch h-full">
      {columns.map((column, columnIndex) => {
        const columnTasks = tasksByColumn(column.key);
        const isDragOver = dropTarget?.columnKey === column.key;
        const headerTextColor = contrastingTextOnColor(column.color);
        const countBadgeClass =
          headerTextColor === "#FFFFFF"
            ? "bg-white/25 text-white"
            : "bg-black/10 text-gray-800";
        const canMoveLeft = canReorderSection && onReorderSection && columnIndex > 0;
        const canMoveRight =
          canReorderSection && onReorderSection && columnIndex < columns.length - 1;
        const showReorderControls = Boolean(canReorderSection && onReorderSection);

        return (
            <div
              key={column.key}
              className={`w-[260px] shrink-0 bg-gray-50/80 border-2 rounded-xl flex flex-col h-full overflow-hidden transition-colors ${
                isDragOver ? "border-[#2563EB]/40 bg-blue-50/50" : "border-dashed border-gray-200"
              }`}
            >
            <div
              className={cn(
                "group/header flex items-center justify-between px-3 py-3 shrink-0 gap-1",
              )}
              style={{ backgroundColor: column.color }}
            >
              {showReorderControls ? (
                <button
                  type="button"
                  onClick={() => void handleReorderSection(column, "left")}
                  disabled={!canMoveLeft || reorderingSection}
                  className={cn(
                    "shrink-0 p-1 rounded-md transition-opacity",
                    "opacity-0 group-hover/header:opacity-100 focus-visible:opacity-100",
                    canMoveLeft && !reorderingSection
                      ? "hover:bg-black/10"
                      : "group-hover/header:opacity-35 cursor-not-allowed",
                  )}
                  aria-label={`Move ${column.label} left`}
                  title="Move left"
                >
                  <ChevronLeft size={14} style={{ color: headerTextColor }} />
                </button>
              ) : null}
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {editingColumnKey === column.key ? (
                  <input
                    ref={renameInputRef}
                    value={editingLabel}
                    onChange={(e) => setEditingLabel(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void submitRename();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        cancelRename();
                      }
                    }}
                    onBlur={() => void submitRename()}
                    disabled={renamingSection}
                    className="h-7 min-w-0 flex-1 rounded-md border border-white/40 bg-white/95 px-2 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-white/60"
                    aria-label="Rename section"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => beginRename(column)}
                    disabled={!canRenameSection || !onRenameSection}
                    title={canRenameSection ? "Click to rename" : undefined}
                    className={cn(
                      "text-sm font-semibold truncate text-left min-w-0",
                      canRenameSection && onRenameSection
                        ? "hover:underline decoration-white/50 cursor-text"
                        : "cursor-default",
                    )}
                    style={{ color: headerTextColor }}
                  >
                    {column.label}
                  </button>
                )}
                <span
                  className={`text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 shrink-0 ${countBadgeClass}`}
                >
                  {columnTasks.length}
                </span>
              </div>
              {canRenameSection && onRenameSection && editingColumnKey !== column.key ? (
                <button
                  type="button"
                  onClick={() => beginRename(column)}
                  className="shrink-0 p-1 rounded-md opacity-80 hover:opacity-100 hover:bg-black/10"
                  aria-label={`Rename ${column.label}`}
                  title="Rename section"
                >
                  <Pencil size={12} style={{ color: headerTextColor }} />
                </button>
              ) : null}
              {canDeleteSection &&
              onDeleteSection &&
              isPipelineStageDeletable(column.key) &&
              editingColumnKey !== column.key ? (
                <button
                  type="button"
                  onClick={() => void handleDeleteSection(column)}
                  disabled={deletingSection}
                  className="shrink-0 p-1 rounded-md opacity-80 hover:opacity-100 hover:bg-black/10"
                  aria-label={`Delete ${column.label}`}
                  title="Delete section"
                >
                  <Trash2 size={12} style={{ color: headerTextColor }} />
                </button>
              ) : null}
              {showReorderControls ? (
                <button
                  type="button"
                  onClick={() => void handleReorderSection(column, "right")}
                  disabled={!canMoveRight || reorderingSection}
                  className={cn(
                    "shrink-0 p-1 rounded-md transition-opacity",
                    "opacity-0 group-hover/header:opacity-100 focus-visible:opacity-100",
                    canMoveRight && !reorderingSection
                      ? "hover:bg-black/10"
                      : "group-hover/header:opacity-35 cursor-not-allowed",
                  )}
                  aria-label={`Move ${column.label} right`}
                  title="Move right"
                >
                  <ChevronRight size={14} style={{ color: headerTextColor }} />
                </button>
              ) : null}
            </div>

            {canCreate && onCreateClick && (
              <div className="shrink-0 px-2.5 pt-2 pb-1 border-b border-gray-200/80 bg-white/60">
                <button
                  type="button"
                  onClick={() => onCreateClick(column.key)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-gray-500 hover:text-[#2563EB] hover:bg-blue-50/80 rounded-lg transition-colors"
                >
                  <Plus size={14} /> Add Task
                </button>
              </div>
            )}

            <div
              ref={(node) => {
                const map = columnScrollersRef.current;
                if (node) map.set(column.key, node);
                else map.delete(column.key);
              }}
              className="flex-1 flex flex-col p-2.5 min-h-0 overflow-y-auto overscroll-y-contain scrollbar-thin"
            >
              <div className="relative flex flex-col gap-2.5">
                {(() => {
                  const nodes: ReactNode[] = [];
                  let slot = 0;
                  const showSlot = isDragOver && draggingId != null;
                  for (const task of columnTasks) {
                    const dragging = draggingId === task.id;
                    if (showSlot && !dragging && dropTarget?.index === slot) {
                      nodes.push(
                        <div
                          key="drop-slot"
                          className="h-1.5 shrink-0 rounded-full bg-[#2563EB]"
                        />,
                      );
                    }
                    nodes.push(
                      <div key={task.id} data-kanban-task-id={task.id}>
                        <KanbanTaskCard
                          task={task}
                          isDragging={dragging}
                          isHighlighted={highlightedTaskId === task.id}
                          onPointerDown={(e) => startPointerDrag(e, task.id)}
                          onClick={() => {
                            if (!didDragRef.current) onTaskClick(task.id);
                          }}
                        />
                      </div>,
                    );
                    if (!dragging) slot += 1;
                  }
                  if (showSlot && (dropTarget?.index ?? 0) >= slot) {
                    nodes.push(
                      <div
                        key="drop-slot"
                        className="h-1.5 shrink-0 rounded-full bg-[#2563EB]"
                      />,
                    );
                  }
                  if (columnTasks.length === 0 && isDragOver) {
                    nodes.push(
                      <p key="empty-drop" className="text-xs text-[#2563EB] text-center py-8">
                        Drop here
                      </p>,
                    );
                  }
                  return nodes;
                })()}
              </div>
            </div>
          </div>
        );
      })}

      {canAddSection && onAddSection ? (
        <div className="w-[260px] shrink-0 rounded-xl border-2 border-dashed border-[#2563EB]/45 bg-blue-50/40 flex flex-col h-full min-h-[220px] overflow-hidden">
          <div className="px-3 py-3 shrink-0 bg-[#2563EB] text-white">
            <span className="text-sm font-semibold">New Section</span>
          </div>
          {isAddingSection ? (
            <div className="p-3 flex flex-col gap-2 bg-white/80 flex-1">
              <input
                ref={newSectionInputRef}
                autoFocus
                value={newSectionLabel}
                onChange={(e) => setNewSectionLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void submitNewSection();
                  }
                  if (e.key === "Escape") {
                    setIsAddingSection(false);
                    setNewSectionLabel("");
                  }
                }}
                placeholder="Section name"
                disabled={addingSection}
                className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB]"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void submitNewSection()}
                  disabled={!newSectionLabel.trim() || addingSection}
                  className="h-8 px-3 rounded-lg bg-[#2563EB] text-white text-xs font-medium hover:bg-[#1D4ED8] disabled:opacity-50"
                >
                  {addingSection ? "Adding…" : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingSection(false);
                    setNewSectionLabel("");
                  }}
                  disabled={addingSection}
                  className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setIsAddingSection(true);
                requestAnimationFrame(() => newSectionInputRef.current?.focus());
              }}
              className="flex-1 flex flex-col items-center justify-center gap-2 px-4 py-8 text-[#2563EB] hover:bg-blue-50 transition-colors bg-white/70"
            >
              <Plus size={22} />
              <span className="text-sm font-semibold">Add New Section</span>
              <span className="text-[11px] text-gray-500 text-center px-2">
                Creates a status column for this project
              </span>
            </button>
          )}
        </div>
      ) : null}
      </div>
      {draggingTask &&
        createPortal(
          <div
            ref={ghostRef}
            className="fixed left-0 top-0 z-[80] pointer-events-none max-w-[220px] truncate rounded-lg border border-[#2563EB] bg-white px-3 py-2 text-sm font-medium text-[#1F2937] shadow-lg"
            style={{
              transform: `translate(${pointerRef.current.x + 12}px, ${pointerRef.current.y + 14}px)`,
            }}
          >
            {draggingTask.title}
          </div>,
          document.body,
        )}
    </EdgeScrollArea>
  );
}
