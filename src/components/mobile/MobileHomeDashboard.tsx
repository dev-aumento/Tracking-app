import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Loader2,
  Plus,
} from "lucide-react";
import {
  animate,
  motion,
  useDragControls,
  useMotionValue,
  type PanInfo,
} from "framer-motion";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { notificationListQueryOptions } from "@/hooks/useNotificationStream";
import { canAccessRoute } from "@/lib/permissions";
import { isAdminOrManagement } from "@/lib/leave-policy";
import { istTimeOfDayGreeting, formatWorkZoneDate } from "@/lib/timezone";
import {
  fillBreakdownForPeriod,
  formatHoursMinutes,
  startOfCalendarWeek,
  endOfWorkWeek,
} from "@/lib/work-hours-policy";
import { cn } from "@/lib/utils";
import { canCreateTask } from "@/lib/create-task-permission";
import {
  buildMyTasksViewPath,
  buildAllTasksViewPath,
} from "@/lib/task-notification-link";
import { TodayBirthdaysBanner } from "@/components/dashboard/UpcomingBirthdaysPanel";
import { dashboardQueryOptions } from "@/lib/dashboard-refresh";

type TaskFilter = "todo" | "in_progress" | "done";

type HomeTask = {
  id: number;
  title: string;
  status: string;
  dueDate?: string | Date | null;
  assignee?: { name: string | null; avatar?: string | null } | null;
};

type SheetSnap = "collapsed" | "expanded";

function formatTaskTime(dueDate?: string | Date | null) {
  if (!dueDate) return "No due time";
  const d = dueDate instanceof Date ? dueDate : new Date(dueDate);
  if (Number.isNaN(d.getTime())) return "No due time";
  return formatWorkZoneDate(d, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function weekRangeLabel(now = new Date()) {
  const start = startOfCalendarWeek(now);
  const end = endOfWorkWeek(now);
  const left = formatWorkZoneDate(start, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
  const right = formatWorkZoneDate(end, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
  return `${left} - ${right}`;
}

function matchesFilter(status: string, filter: TaskFilter) {
  const s = String(status ?? "").toLowerCase();
  if (filter === "todo") return s === "todo" || s === "open" || s === "backlog";
  if (filter === "in_progress") {
    return (
      s === "in_progress" ||
      s === "in-progress" ||
      s === "doing" ||
      s === "review"
    );
  }
  return s === "done" || s === "completed" || s === "closed";
}

function useViewportHeight() {
  const [height, setHeight] = useState(() =>
    typeof window === "undefined" ? 800 : window.innerHeight,
  );

  useEffect(() => {
    const update = () => setHeight(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  return height;
}

export function MobileHomeDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const firstName = user?.name?.split(" ")[0] || "there";
  const greeting = useMemo(() => istTimeOfDayGreeting(new Date()), []);
  const hidePersonal = isAdminOrManagement(user);
  const canViewMy = canAccessRoute(user, "/tasks");
  const canViewAll = canAccessRoute(user, "/admin/tasks");
  const showTaskSection = canViewMy || canViewAll;
  const showHours = !hidePersonal && canAccessRoute(user, "/time-tracking");
  const canAddTask = canCreateTask(user);
  const canNotify = canAccessRoute(user, "/task-chats");

  const [filter, setFilter] = useState<TaskFilter>("todo");
  const [filterReady, setFilterReady] = useState(false);
  const [snap, setSnap] = useState<SheetSnap>("collapsed");

  const viewportH = useViewportHeight();
  const dragControls = useDragControls();
  const sheetY = useMotionValue(0);
  const listRef = useRef<HTMLDivElement>(null);
  const pullStartY = useRef<number | null>(null);
  const pullStartScroll = useRef(0);

  const expandedH = Math.round(viewportH * 0.93);
  const collapsedH = Math.round(
    Math.min(Math.max(viewportH * 0.44, 300), viewportH * 0.52),
  );
  const collapsedOffset = Math.max(0, expandedH - collapsedH);
  const isExpanded = snap === "expanded";

  const snapTo = useCallback(
    (next: SheetSnap) => {
      const target = next === "expanded" ? 0 : collapsedOffset;
      setSnap(next);
      void animate(sheetY, target, {
        type: "spring",
        stiffness: 380,
        damping: 36,
        mass: 0.85,
      });
      if (next === "collapsed" && listRef.current) {
        listRef.current.scrollTop = 0;
      }
    },
    [collapsedOffset, sheetY],
  );

  // Keep snap position aligned when viewport size changes (keyboard / rotate)
  useEffect(() => {
    sheetY.set(snap === "expanded" ? 0 : collapsedOffset);
    // Intentionally omit `snap` so open/close spring animations are not interrupted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsedOffset, sheetY]);

  const { data: weekStats } = trpc.timeEntry.getStats.useQuery(
    { period: "week" },
    { enabled: showHours, staleTime: 30_000 },
  );
  const { data: leaveSummary } = trpc.dashboard.getLeaveSummary.useQuery(
    undefined,
    dashboardQueryOptions,
  );

  const { data: badgeData } = trpc.notification.list.useQuery(
    { unreadOnly: true, limit: 20 },
    { enabled: !!user, ...notificationListQueryOptions },
  );
  const unreadCount = badgeData?.notifications?.length ?? 0;

  const listInput = useMemo(() => {
    if (canViewMy && !hidePersonal) {
      return { assigneeId: user?.id ?? 0, limit: 80 };
    }
    return { limit: 80 };
  }, [canViewMy, hidePersonal, user?.id]);

  const { data: taskData, isLoading: tasksLoading } = trpc.task.list.useQuery(
    listInput,
    {
      enabled: showTaskSection && (hidePersonal || (user?.id ?? 0) > 0),
      staleTime: 20_000,
    },
  );

  const tasks = (taskData?.tasks ?? []) as HomeTask[];

  const counts = useMemo(
    () => ({
      todo: tasks.filter((t) => matchesFilter(t.status, "todo")).length,
      in_progress: tasks.filter((t) =>
        matchesFilter(t.status, "in_progress"),
      ).length,
      done: tasks.filter((t) => matchesFilter(t.status, "done")).length,
    }),
    [tasks],
  );

  useEffect(() => {
    if (filterReady || tasksLoading) return;
    setFilterReady(true);
    if (counts.todo > 0) {
      setFilter("todo");
      return;
    }
    if (counts.in_progress > 0) {
      setFilter("in_progress");
      return;
    }
    if (counts.done > 0) setFilter("done");
  }, [filterReady, tasksLoading, counts.todo, counts.in_progress, counts.done]);

  const filteredTasks = useMemo(() => {
    const matched = tasks.filter((t) => matchesFilter(t.status, filter));
    return isExpanded ? matched.slice(0, 40) : matched.slice(0, 5);
  }, [tasks, filter, isExpanded]);

  const chartDays = useMemo(() => {
    if (!showHours) return [];
    return fillBreakdownForPeriod(weekStats?.dailyBreakdown ?? [], "week");
  }, [showHours, weekStats?.dailyBreakdown]);

  const maxHours = Math.max(1, ...chartDays.map((d) => d.hours));
  const peakIndex = chartDays.reduce(
    (best, day, i, arr) => (day.hours > (arr[best]?.hours ?? 0) ? i : best),
    0,
  );

  const openTask = (id: number) => {
    navigate(
      canViewAll && hidePersonal
        ? buildAllTasksViewPath(id)
        : buildMyTasksViewPath(id),
    );
  };

  const seeAllPath =
    canViewMy && !hidePersonal ? "/m/work?tab=my" : "/m/work?tab=all";

  const onSheetDragEnd = (_: unknown, info: PanInfo) => {
    const current = sheetY.get();
    const mid = collapsedOffset / 2;

    if (info.velocity.y < -420) {
      snapTo("expanded");
      return;
    }
    if (info.velocity.y > 420) {
      snapTo("collapsed");
      return;
    }
    snapTo(current < mid ? "expanded" : "collapsed");
  };

  const handleToggleClick = () => {
    // Ignore synthetic click right after a drag gesture
    if (Math.abs(sheetY.get() - (isExpanded ? 0 : collapsedOffset)) > 6) {
      return;
    }
    snapTo(isExpanded ? "collapsed" : "expanded");
  }; 

  const onListTouchStart = (e: React.TouchEvent) => {
    pullStartY.current = e.touches[0]?.clientY ?? null;
    pullStartScroll.current = listRef.current?.scrollTop ?? 0;
  };

  const onListTouchEnd = (e: React.TouchEvent) => {
    if (pullStartY.current == null) return;
    const endY = e.changedTouches[0]?.clientY ?? pullStartY.current;
    const dy = endY - pullStartY.current;
    const atTop = pullStartScroll.current <= 2;

    // Pull down while list is at top → collapse the sheet
    if (isExpanded && atTop && dy > 72) {
      snapTo("collapsed");
    }
    // Flick up from collapsed list → expand
    if (!isExpanded && dy < -64) {
      snapTo("expanded");
    }
    pullStartY.current = null;
  };

  return (
    <div className="relative h-dvh overflow-hidden bg-[#0a0a0a] text-white">
      {/* Dark hero — sits behind the sheet */}
      <div
        className="absolute inset-x-0 top-0 overflow-y-auto px-5 pb-2 pt-[calc(0.65rem+env(safe-area-inset-top,0px))]"
        style={{ bottom: collapsedH - 12 }}
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="h-11 w-11 overflow-hidden rounded-[0.9rem] ring-1 ring-white/10 active:opacity-80"
            aria-label="Profile"
          >
            <UserAvatar
              name={user?.name}
              avatar={user?.avatar}
              size={44}
              className="!rounded-[0.9rem]"
            />
          </button>
          <button
            type="button"
            onClick={() => navigate(canNotify ? "/task-chats" : "/m/menu")}
            className="relative flex h-11 w-11 items-center justify-center rounded-[0.9rem] bg-white/[0.08] ring-1 ring-white/10 active:bg-white/[0.14]"
            aria-label="Notifications"
          >
            <Bell size={20} className="text-white" />
            {unreadCount > 0 ? (
              <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-[#0a0a0a]" />
            ) : null}
          </button>
        </div>

        <p className="mt-6 text-[12px] font-medium tracking-[0.02em] text-white/40">
          // New Day, New Tasks
        </p>
        <h1 className="mt-1.5 text-[1.75rem] font-bold leading-[1.15] tracking-tight text-white sm:text-[1.9rem]">
          {greeting}, {firstName}{" "}
          <span
            className="inline-block origin-[70%_70%] animate-wave will-change-transform"
            role="img"
            aria-label="waving hand"
          >
            👋
          </span>
        </h1>

        <TodayBirthdaysBanner
          className="mt-4"
          birthdays={leaveSummary?.upcomingBirthdays ?? []}
        />

        <div className="mt-5 flex items-center gap-2.5">
          <button
            type="button"
            onClick={() =>
              navigate(
                canAccessRoute(user, "/time-tracking")
                  ? "/time-tracking"
                  : "/m/menu",
              )
            }
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl bg-white/[0.08] px-3.5 py-3.5 text-left ring-1 ring-white/10 active:bg-white/[0.12]"
          >
            <CalendarDays size={18} className="shrink-0 text-white/65" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white/90">
              {weekRangeLabel()}
            </span>
            <ChevronDown size={16} className="shrink-0 text-white/40" />
          </button>
          {canAddTask || showTaskSection ? (
            <button
              type="button"
              onClick={() => navigate(seeAllPath)}
              className="flex h-[3.15rem] w-[3.15rem] shrink-0 items-center justify-center rounded-2xl bg-white text-[#0a0a0a] shadow-sm active:scale-95"
              aria-label="Add task"
            >
              <Plus size={22} strokeWidth={2.5} />
            </button>
          ) : null}
        </div>

        {showHours && chartDays.length > 0 ? (
          <div className="mt-7 pb-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-white">
                Weekly Progress
              </h2>
              <button
                type="button"
                onClick={() => navigate("/time-tracking")}
                className="text-[13px] font-medium text-white/40 active:text-white/70"
              >
                View All
              </button>
            </div>
            <div className="flex h-[8.5rem] items-end gap-3 px-0.5">
              {chartDays.map((day, index) => {
                const fillPct = Math.max(
                  day.hours > 0 ? 12 : 0,
                  (day.hours / maxHours) * 100,
                );
                const isPeak = index === peakIndex && day.hours > 0;
                const label = formatWorkZoneDate(
                  new Date(`${day.date}T12:00:00`),
                  { weekday: "narrow" },
                );
                return (
                  <div
                    key={day.date}
                    className="relative flex h-full flex-1 flex-col items-center"
                  >
                    {isPeak ? (
                      <span className="absolute top-0 z-10 -translate-y-1 whitespace-nowrap rounded-lg bg-[#1c1c1e] px-2 py-1 text-[10px] font-semibold text-white shadow-lg ring-1 ring-white/10">
                        {formatHoursMinutes(day.hours)}
                      </span>
                    ) : null}
                    <div className="mt-auto flex w-full flex-1 flex-col justify-end pb-1.5 pt-7">
                      <div className="relative h-full w-full overflow-hidden rounded-t-xl bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.12)_0_5px,rgba(255,255,255,0.04)_5px_10px)]">
                        <div
                          className={cn(
                            "absolute inset-x-0 bottom-0 rounded-t-xl transition-all",
                            isPeak
                              ? "bg-gradient-to-t from-[#2A85FF] to-[#7EB6FF]"
                              : "bg-gradient-to-t from-[#2A85FF]/75 to-[#2A85FF]/25",
                          )}
                          style={{ height: `${fillPct}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[10px] font-medium text-white/35">
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* Dim hero when sheet is fully open */}
      <motion.button
        type="button"
        aria-label="Collapse tasks"
        className="absolute inset-0 z-[15] bg-black/45"
        initial={false}
        animate={{ opacity: isExpanded ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        style={{ pointerEvents: isExpanded ? "auto" : "none" }}
        onClick={() => snapTo("collapsed")}
      />

      {/* Draggable All Tasks sheet */}
      <motion.div
        className="absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden rounded-t-[1.75rem] bg-white text-[#111827] shadow-[0_-8px_30px_rgba(0,0,0,0.25)] dark:bg-[#151515] dark:text-white dark:shadow-[0_-8px_30px_rgba(0,0,0,0.55)]"
        style={{
          height: expandedH,
          y: sheetY,
          paddingBottom: "calc(4.75rem + env(safe-area-inset-bottom))",
        }}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: collapsedOffset }}
        dragElastic={0.08}
        onDragEnd={onSheetDragEnd}
      >
        {/* Drag handle */}
        <div
          className="flex shrink-0 cursor-grab touch-none flex-col items-center active:cursor-grabbing"
          onPointerDown={(e) => dragControls.start(e)}
          onClick={handleToggleClick}
          role="button"
          aria-label={isExpanded ? "Collapse tasks sheet" : "Expand tasks sheet"}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              snapTo(isExpanded ? "collapsed" : "expanded");
            }
          }}
        >
          <div className="flex w-full items-center justify-center pb-1 pt-3">
            <div className="h-1 w-10 rounded-full bg-black/15 dark:bg-white/20" />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-1">
          <h2 className="text-[1.15rem] font-bold tracking-tight text-[#111827] dark:text-white">
            All Tasks
          </h2>
          {showTaskSection ? (
            <button
              type="button"
              onClick={() => navigate(seeAllPath)}
              className="flex items-center gap-0.5 text-[13px] font-medium text-gray-400 active:text-gray-700 dark:text-white/45 dark:active:text-white/75"
            >
              See All
              <ChevronRight size={16} />
            </button>
          ) : null}
        </div>

        {showTaskSection ? (
          <>
            <div className="shrink-0 px-0 pb-3">
              <div className="flex gap-2 overflow-x-auto overflow-y-visible px-5 py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {(
                  [
                    { id: "todo", label: "To Do", count: counts.todo },
                    {
                      id: "in_progress",
                      label: "In Progress",
                      count: counts.in_progress,
                    },
                    { id: "done", label: "Done", count: counts.done },
                  ] as const
                ).map((tab) => {
                  const active = filter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setFilter(tab.id)}
                      className={cn(
                        "shrink-0 rounded-full px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap transition-colors",
                        active
                          ? "bg-[#111827] text-white dark:bg-white dark:text-[#111827]"
                          : "bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-200/80 dark:bg-white/10 dark:text-white/60 dark:ring-white/10",
                      )}
                    >
                      {tab.label} ({tab.count})
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              ref={listRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5"
              onTouchStart={onListTouchStart}
              onTouchEnd={onListTouchEnd}
            >
              {tasksLoading ? (
                <div className="flex items-center justify-center py-14">
                  <Loader2
                    className="animate-spin text-gray-300 dark:text-white/30"
                    size={28}
                  />
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-white/10 dark:text-white/40">
                    {filter === "done" ? (
                      <CheckCircle2 size={26} />
                    ) : (
                      <ClipboardList size={26} />
                    )}
                  </div>
                  <p className="text-[15px] font-semibold text-gray-700 dark:text-white/85">
                    No tasks here
                  </p>
                  <p className="mt-1 max-w-[16rem] text-[13px] text-gray-400 dark:text-white/45">
                    {filter === "todo"
                      ? "You're all caught up on to-dos."
                      : filter === "in_progress"
                        ? "Nothing in progress right now."
                        : "Completed tasks will show up here."}
                  </p>
                </div>
              ) : (
                <ul className="space-y-2.5 pb-4">
                  {filteredTasks.map((task) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => openTask(task.id)}
                        className="flex w-full items-center gap-3 rounded-2xl bg-blue-50 px-4 py-3.5 text-left text-[#111827] active:bg-blue-100 dark:bg-[#1e293b] dark:text-white dark:active:bg-[#243447]"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-semibold leading-snug text-[#111827] dark:text-white">
                            {task.title}
                          </p>
                          <p className="mt-1 text-[12px] text-gray-500 dark:text-white/55">
                            {formatTaskTime(task.dueDate)}
                          </p>
                          <div className="mt-2.5 flex items-center">
                            <UserAvatar
                              name={task.assignee?.name ?? user?.name}
                              avatar={task.assignee?.avatar ?? user?.avatar}
                              size={24}
                              className="ring-2 ring-blue-50 dark:ring-[#1e293b]"
                            />
                          </div>
                        </div>
                        <ChevronRight
                          size={18}
                          className="shrink-0 text-gray-400 dark:text-white/40"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-5 py-14 text-center">
            <p className="text-sm text-gray-500 dark:text-white/45">
              Open Menu for tools and settings
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
