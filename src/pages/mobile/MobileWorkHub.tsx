import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Loader2 } from "lucide-react";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { MobilePillTabs } from "@/components/mobile/MobilePillTabs";
import { MobileFab } from "@/components/mobile/MobileFab";
import { MobileTaskList } from "@/components/mobile/MobileTaskList";
import { UserAvatar } from "@/components/shared/UserAvatar";
import {
  CreateTaskModal,
  createEmptyTaskForm,
  type CreateTaskFormData,
} from "@/components/tasks/CreateTaskModal";
import { TaskDetailPanel } from "@/components/tasks/TaskDetailPanel";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import {
  canCreateTask,
  tryOpenCreateTask,
} from "@/lib/create-task-permission";
import { isAdminOrManagement, isHrUser } from "@/lib/leave-policy";
import { canAccessRoute, hasPermission } from "@/lib/permissions";
import { formatWorkZoneDate } from "@/lib/timezone";
import {
  buildAllTasksViewPath,
  buildMyTasksViewPath,
  parseActivityIdParam,
} from "@/lib/task-notification-link";
import { submitCreateTask } from "@/lib/submit-create-task";
import { resetStagingMediaIds } from "@/lib/staged-task-media";
import { invalidateTaskQueries } from "@/lib/invalidate-on-notifications";
import { invalidateProjectStats } from "@/lib/project-stats";
import { AnimatePresence } from "framer-motion";
import Analytics from "@/pages/Analytics";
import AdminEmployees from "@/pages/admin/Employees";

type WorkTab = "my" | "all" | "projects" | "analytics" | "employees";

/** Admin, project manager (manager), and HR — not regular employees. */
function canSeeStaffWorkLinks(
  user: { role?: string | null; department?: string | null } | null | undefined,
) {
  if (!user) return false;
  const role = String(user.role ?? "").toLowerCase();
  if (role === "admin" || role === "manager" || role === "hr") return true;
  if (isHrUser(user) || isAdminOrManagement(user)) return true;
  return false;
}

function parseWorkTab(
  raw: string | null,
  canViewAll: boolean,
  preferAllDefault: boolean,
  options: { allowAnalytics: boolean; allowEmployees: boolean },
): WorkTab {
  if (raw === "projects") return "projects";
  if (raw === "analytics" && options.allowAnalytics) return "analytics";
  if (raw === "employees" && options.allowEmployees) return "employees";
  if (raw === "all") return canViewAll ? "all" : "my";
  if (raw === "my") return "my";
  return preferAllDefault && canViewAll ? "all" : "my";
}

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

export default function MobileWorkHub() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const canViewAll = canAccessRoute(user, "/admin/tasks");
  const canViewMy = canAccessRoute(user, "/tasks") || canViewAll;
  const hidePersonal = isAdminOrManagement(user);
  const showStaffLinks = canSeeStaffWorkLinks(user);
  const showAnalytics = showStaffLinks && canAccessRoute(user, "/analytics");
  // Employees lives in the bottom nav for HR — keep it off the Tasks hub pills.
  const showEmployees =
    showStaffLinks &&
    canAccessRoute(user, "/admin/employees") &&
    !isHrUser(user);

  const tab = parseWorkTab(searchParams.get("tab"), canViewAll, hidePersonal, {
    allowAnalytics: showAnalytics,
    allowEmployees: showEmployees,
  });

  const setTab = (next: WorkTab) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "projects") p.set("tab", "projects");
        else if (next === "all") p.set("tab", "all");
        else if (next === "analytics") p.set("tab", "analytics");
        else if (next === "employees") p.set("tab", "employees");
        else p.set("tab", "my");
        return p;
      },
      { replace: true },
    );
  };

  const onPillChange = (id: string) => {
    setTab(id as WorkTab);
  };

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<CreateTaskFormData>(() =>
    createEmptyTaskForm(),
  );
  const [cloneSourceTitle, setCloneSourceTitle] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedTask, setSelectedTask] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const myListInput = useMemo(
    () => ({ assigneeId: userId, limit: 200 }),
    [userId],
  );
  const allListInput = useMemo(() => ({ limit: 200 }), []);

  const { data: myTaskData, isLoading: myTasksLoading } = trpc.task.list.useQuery(
    myListInput,
    { enabled: userId > 0 && tab === "my" && canViewMy },
  );
  const { data: allTaskData, isLoading: allTasksLoading } = trpc.task.list.useQuery(
    allListInput,
    { enabled: userId > 0 && tab === "all" && canViewAll },
  );
  const { data: projects, isLoading: projectsLoading } =
    trpc.project.list.useQuery(undefined, { staleTime: 60_000 });
  const { data: usersData } = trpc.user.listForPicker.useQuery({ limit: 500 });
  const { data: projectsData } = trpc.project.listForPicker.useQuery();

  const utils = trpc.useUtils();
  const createMutation = trpc.task.create.useMutation();
  const addParticipantMutation = trpc.task.addParticipant.useMutation();
  const addObserverMutation = trpc.task.addObserver.useMutation();
  const updateMutation = trpc.task.update.useMutation();
  const createSubtaskMutation = trpc.subtask.create.useMutation();
  const addCommentMutation = trpc.task.addComment.useMutation();
  const addAttachmentMutation = trpc.task.addAttachment.useMutation();
  const createProjectMutation = trpc.project.create.useMutation({
    onSuccess: () => utils.project.list.invalidate(),
  });

  const tasks =
    tab === "all" ? (allTaskData?.tasks ?? []) : (myTaskData?.tasks ?? []);
  const tasksLoading = tab === "all" ? allTasksLoading : myTasksLoading;

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((t) => t.title?.toLowerCase().includes(q));
  }, [tasks, query]);

  const filteredProjects = useMemo(() => {
    const list = projects ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => p.name?.toLowerCase().includes(q));
  }, [projects, query]);

  const highlightActivityId = useMemo(
    () => parseActivityIdParam(searchParams.get("activity")),
    [searchParams],
  );

  useEffect(() => {
    const taskParam = searchParams.get("task");
    setSelectedTask(taskParam ? Number(taskParam) : null);
  }, [searchParams]);

  // Prefetch counts for badges when idle on other tabs
  const { data: myCountData } = trpc.task.list.useQuery(myListInput, {
    enabled: userId > 0 && canViewMy,
    staleTime: 60_000,
  });
  const { data: allCountData } = trpc.task.list.useQuery(allListInput, {
    enabled: userId > 0 && canViewAll,
    staleTime: 60_000,
  });

  const openTask = (id: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("task", String(id));
      return next;
    });
  };

  const closeTask = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("task");
      next.delete("activity");
      return next;
    });
  };

  const canCreate = canCreateTask(user);
  const canCreateProject = hasPermission(user, "projects.manage");

  const openCreate = () => {
    if (tab === "analytics" || tab === "employees") return;
    if (tab === "projects") {
      if (!canCreateProject) {
        window.alert("You don't have permission to create projects.");
        return;
      }
      const name = window.prompt("Project name");
      if (!name?.trim()) return;
      createProjectMutation.mutate({ name: name.trim() });
      return;
    }
    tryOpenCreateTask(user, () => {
      setFormData(createEmptyTaskForm());
      setCloneSourceTitle(null);
      resetStagingMediaIds();
      setShowCreateModal(true);
    });
  };

  const handleCreate = async () => {
    if (!formData.title.trim()) return;
    setIsCreating(true);
    try {
      await submitCreateTask({
        formData,
        cloneSourceTitle,
        createMutation,
        addParticipantMutation,
        addObserverMutation,
        updateMutation,
        createSubtaskMutation,
        addCommentMutation,
        addAttachmentMutation,
      });
      setShowCreateModal(false);
      setFormData(createEmptyTaskForm());
      await invalidateTaskQueries(utils);
      invalidateProjectStats(utils);
    } finally {
      setIsCreating(false);
    }
  };

  const pillTabs = useMemo(() => {
    const items: {
      id: string;
      label: string;
      badge?: number | null;
      badgeTone?: "neutral" | "danger";
    }[] = [];
    if (canViewMy) {
      items.push({
        id: "my",
        label: "My Tasks",
        badge: myCountData?.tasks?.length ?? null,
        badgeTone: tab === "my" ? "danger" : "neutral",
      });
    }
    if (canViewAll) {
      items.push({
        id: "all",
        label: "All Tasks",
        badge: allCountData?.tasks?.length ?? null,
        badgeTone: tab === "all" ? "danger" : "neutral",
      });
    }
    items.push({
      id: "projects",
      label: "Projects",
      badge: (projects ?? []).length || null,
      badgeTone: tab === "projects" ? "danger" : "neutral",
    });
    if (showAnalytics) {
      items.push({ id: "analytics", label: "Analytics" });
    }
    if (showEmployees) {
      items.push({ id: "employees", label: "Employees" });
    }
    return items;
  }, [
    canViewMy,
    canViewAll,
    showAnalytics,
    showEmployees,
    myCountData?.tasks?.length,
    allCountData?.tasks?.length,
    projects,
    tab,
  ]);

  const searchPlaceholder =
    tab === "projects"
      ? "Search projects…"
      : tab === "all"
        ? "Search all tasks…"
        : "Search my tasks…";

  const showHubSearch = tab === "my" || tab === "all" || tab === "projects";
  const showFab =
    tab === "projects"
      ? canCreateProject
      : tab === "my" || tab === "all"
        ? canCreate
        : false;

  const renderTaskList = () => (
    <MobileTaskList
      tasks={filteredTasks}
      isLoading={tasksLoading}
      onTaskClick={openTask}
      emptyMessage={
        tab === "all" ? "No tasks yet" : "No tasks assigned to you"
      }
      showProjectName
    />
  );

  const renderProjectsList = () =>
    projectsLoading ? (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-gray-400 dark:text-white/40" size={28} />
      </div>
    ) : filteredProjects.length === 0 ? (
      <p className="py-16 text-center text-sm text-gray-500 dark:text-white/45">
        No projects yet
      </p>
    ) : (
      <ul className="divide-y divide-gray-200 dark:divide-white/[0.08]">
        {filteredProjects.map((project) => {
          const members = project.members ?? [];
          const overflow =
            typeof project.taskCount === "number"
              ? project.taskCount - (project.completedCount ?? 0)
              : 0;

          return (
            <li key={project.id}>
              <button
                type="button"
                onClick={() => navigate(`/projects/${project.id}`)}
                className="flex w-full items-start gap-3 py-3.5 text-left active:bg-black/[0.03] dark:active:bg-white/[0.04]"
              >
                <span
                  className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{
                    backgroundColor: project.color || "#2A85FF",
                  }}
                >
                  {(project.name || "?").slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[15px] font-semibold text-[#1F2937] dark:text-white truncate">
                      {project.name}
                    </span>
                    <span className="shrink-0 text-xs text-gray-400 dark:text-white/45">
                      {shortListDate(project.lastActiveAt ?? project.updatedAt)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center -space-x-2">
                      {members.slice(0, 5).map((m) => (
                        <UserAvatar
                          key={m.id}
                          name={m.name}
                          avatar={m.avatar}
                          size={24}
                          className="ring-2 ring-[#F8F9FA] dark:ring-[#0d0d0d]"
                        />
                      ))}
                      {members.length > 5 ? (
                        <span className="ml-1 text-xs text-gray-400 dark:text-white/45">
                          +{members.length - 5}
                        </span>
                      ) : null}
                    </div>
                    {overflow > 0 ? (
                      <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#E53935] px-1.5 text-[11px] font-bold text-white">
                        {overflow > 99 ? "99+" : overflow}
                      </span>
                    ) : (
                      <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#2e7d32] px-1.5 text-[11px] font-bold text-white">
                        {project.completedCount ?? 0}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    );

  return (
    <div className="min-h-full">
      <MobilePageHeader
        title="Tasks and Projects"
        showSearch={showHubSearch}
        onSearchClick={() => setSearchOpen((v) => !v)}
        showMore={false}
      />

      <MobilePillTabs
        tabs={pillTabs}
        activeId={tab}
        onChange={onPillChange}
      />

      {searchOpen && showHubSearch ? (
        <div className="pb-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3.5 py-2.5 text-sm text-[#1F2937] dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/40 outline-none focus:border-[#2A85FF]/60"
            autoFocus
          />
        </div>
      ) : null}

      {tab === "my" || tab === "all"
        ? renderTaskList()
        : tab === "projects"
          ? renderProjectsList()
          : tab === "analytics"
            ? (
              <div className="pb-6">
                <Analytics embedded />
              </div>
              )
            : tab === "employees"
              ? (
                <div className="pb-6">
                  <AdminEmployees embedded />
                </div>
                )
              : null}

      {showFab ? <MobileFab onClick={openCreate} /> : null}

      {canCreate ? (
        <CreateTaskModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          formData={formData}
          onFormDataChange={setFormData}
          onSubmit={handleCreate}
          isSubmitting={isCreating}
          users={usersData?.users ?? []}
          projects={projectsData ?? []}
          tasks={tasks.map((t) => ({ id: t.id, title: t.title }))}
          currentUser={
            user
              ? { id: user.id, name: user.name, avatar: user.avatar }
              : null
          }
        />
      ) : null}

      <AnimatePresence>
        {selectedTask ? (
          <TaskDetailPanel
            taskId={selectedTask}
            highlightActivityId={highlightActivityId}
            onHighlightDone={() => {
              setSearchParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  next.delete("activity");
                  return next;
                },
                { replace: true },
              );
            }}
            onClose={closeTask}
            onTaskOpen={(id) => {
              const path =
                tab === "all" || hidePersonal
                  ? buildAllTasksViewPath(id)
                  : buildMyTasksViewPath(id);
              navigate(path);
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
