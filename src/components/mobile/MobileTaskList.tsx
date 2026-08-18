import { useMemo, useState } from "react";
import { ChevronDown, Loader2, Flame, Timer } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { formatTimeAgo, cn } from "@/lib/utils";
import { formatWorkZoneDate } from "@/lib/timezone";
import {
  type PipelineStageDef,
  tasksForPipelineColumn,
  withOrphanPipelineStages,
} from "@/lib/task-kanban";

export type MobileTaskListItem = {
  id: number;
  title: string;
  status: string;
  stage?: string | null;
  priority: string;
  dueDate?: string | Date | null;
  updatedAt?: string | Date | null;
  project?: { id: number; name: string } | null;
  assignee?: { name: string | null; avatar?: string | null } | null;
};

function shortListDate(value?: string | Date | null) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThen = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round(
    (startToday.getTime() - startThen.getTime()) / 86400000,
  );
  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff > 1 && dayDiff < 7) {
    return formatWorkZoneDate(d, { weekday: "short" });
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return formatWorkZoneDate(d, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function MobileTaskRow({
  task,
  onTaskClick,
  showProjectName,
}: {
  task: MobileTaskListItem;
  onTaskClick: (id: number) => void;
  showProjectName: boolean;
}) {
  const overdue =
    !!task.dueDate &&
    task.status !== "done" &&
    new Date(task.dueDate).getTime() < Date.now();
  const urgent = task.priority === "urgent" || task.priority === "high";

  return (
    <li>
      <button
        type="button"
        onClick={() => onTaskClick(task.id)}
        className="flex w-full min-w-0 flex-col gap-2 py-3.5 px-1 text-left active:bg-black/[0.03] dark:active:bg-white/[0.04]"
      >
        <div className="flex items-start justify-between gap-3 min-w-0">
          <span className="text-[15px] font-semibold text-[#1F2937] dark:text-white leading-snug break-words min-w-0">
            {task.title}
          </span>
          <span className="shrink-0 text-xs text-gray-400 dark:text-white/45 pt-0.5">
            {shortListDate(task.dueDate ?? task.updatedAt ?? null)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <UserAvatar
              name={task.assignee?.name}
              avatar={task.assignee?.avatar}
              size={28}
            />
            {overdue ? (
              <span className="rounded-full bg-[#5c1a1a] px-2 py-0.5 text-[11px] font-medium text-[#ff8a80]">
                {formatTimeAgo(task.dueDate!)}
              </span>
            ) : task.updatedAt ? (
              <span className="rounded-full bg-gray-100 dark:bg-white/10 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:text-white/55">
                {formatTimeAgo(task.updatedAt)}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 shrink-0 min-w-0">
            {urgent ? <Flame size={16} className="text-orange-400" /> : null}
            <Timer size={15} className="text-gray-300 dark:text-white/35" />
            {showProjectName && task.project?.name ? (
              <span className="max-w-[7rem] truncate text-[11px] text-gray-400 dark:text-white/40">
                {task.project.name}
              </span>
            ) : null}
          </div>
        </div>
      </button>
    </li>
  );
}

type MobileTaskListProps = {
  tasks: MobileTaskListItem[];
  isLoading?: boolean;
  onTaskClick: (id: number) => void;
  emptyMessage?: string;
  /** When false, hide the project name chip (e.g. inside a single project). */
  showProjectName?: boolean;
  /** Pipeline stages for status grouping (project list). */
  stages?: PipelineStageDef[];
  /** Group tasks under collapsible status headers like desktop list view. */
  groupByStage?: boolean;
};

/** Vertical task rows for Capacitor — no horizontal scroll / wide table. */
export function MobileTaskList({
  tasks,
  isLoading,
  onTaskClick,
  emptyMessage = "No tasks yet",
  showProjectName = true,
  stages = [],
  groupByStage = false,
}: MobileTaskListProps) {
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(
    () => new Set(),
  );

  const stageGroups = useMemo(() => {
    if (!groupByStage) return [];
    const resolved = withOrphanPipelineStages(stages, tasks);
    return resolved.map((stage) => ({
      ...stage,
      tasks: tasksForPipelineColumn(tasks, stage.key),
    }));
  }, [tasks, stages, groupByStage]);

  const toggleStage = (stageKey: string) => {
    setCollapsedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageKey)) next.delete(stageKey);
      else next.add(stageKey);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-gray-400 dark:text-white/40" size={28} />
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-gray-500 dark:text-white/45">
        {emptyMessage}
      </p>
    );
  }

  if (groupByStage) {
    return (
      <div className="overflow-x-hidden rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-transparent">
        {stageGroups.map((group) => {
          const collapsed = collapsedStages.has(group.key);
          return (
            <div key={group.key}>
              <button
                type="button"
                onClick={() => toggleStage(group.key)}
                className="flex w-full items-center gap-2 border-b border-gray-200 dark:border-white/[0.08] bg-gray-50/90 dark:bg-white/[0.04] px-3 py-2.5 text-left active:bg-gray-100/80 dark:active:bg-white/[0.07]"
                aria-expanded={!collapsed}
              >
                <ChevronDown
                  size={16}
                  className={cn(
                    "shrink-0 text-gray-400 transition-transform",
                    collapsed && "-rotate-90",
                  )}
                />
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: group.color }}
                />
                <span className="text-sm font-semibold text-[#1F2937] dark:text-white">
                  {group.label}
                </span>
                <span className="flex h-5 min-w-[22px] items-center justify-center rounded-full bg-gray-200/80 dark:bg-white/15 px-1.5 text-[11px] font-semibold text-gray-500 dark:text-white/60">
                  {group.tasks.length}
                </span>
              </button>

              {!collapsed ? (
                group.tasks.length === 0 ? (
                  <div className="border-b border-dashed border-gray-200 dark:border-white/[0.08] px-3 py-4 text-center text-xs text-gray-400 dark:text-white/40">
                    No tasks
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-200 dark:divide-white/[0.08] px-2">
                    {group.tasks.map((task) => (
                      <MobileTaskRow
                        key={task.id}
                        task={task}
                        onTaskClick={onTaskClick}
                        showProjectName={showProjectName}
                      />
                    ))}
                  </ul>
                )
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-200 dark:divide-white/[0.08] overflow-x-hidden">
      {tasks.map((task) => (
        <MobileTaskRow
          key={task.id}
          task={task}
          onTaskClick={onTaskClick}
          showProjectName={showProjectName}
        />
      ))}
    </ul>
  );
}
