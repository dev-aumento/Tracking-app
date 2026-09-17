import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  ChevronRight,
  Loader2,
  LogOut,
  MapPin,
  QrCode,
  MessageSquare,
  Pause,
  Play,
  Power,
  Search,
  Sparkles,
  Users,
  CalendarDays,
  Clock,
  ClipboardList,
  FolderKanban,
  Settings as SettingsIcon,
  BarChart3,
  Shield,
  Building2,
  FileText,
  UserMinus,
  CalendarCheck2,
} from "lucide-react";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { CrossDayClockOutDialog } from "@/components/time-tracking/CrossDayClockOutDialog";
import { useAuth } from "@/hooks/useAuth";
import { useClockOutAction } from "@/hooks/useClockOutAction";
import { useLiveSessionTimers } from "@/hooks/useLiveSessionTimers";
import { useTaskChatBadgeCount } from "@/hooks/useTaskChats";
import { trpc } from "@/providers/trpc";
import { canAccessRoute } from "@/lib/permissions";
import { canManageLeaves, isAdminOrManagement, isFinanceRoleOnly } from "@/lib/leave-policy";
import { invalidateActiveTaskTimers } from "@/lib/invalidate-task-timers";
import { runClockInWithLocation } from "@/lib/clock-in-with-location";
import { formatElapsedHMS, roleConfig } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { hasUnseenWhatsNew } from "@/lib/whats-new";
import {
  SHOW_LOCATION_QR_MENU,
  isLocationQrMenuPath,
} from "@/lib/location-qr-menu";
import { toast } from "sonner";

type ToolLink = {
  path: string;
  label: string;
  icon: React.ElementType;
  section: string;
};

export default function MobileMenu() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const hidePersonalTime = isAdminOrManagement(user) || isFinanceRoleOnly(user);
  const taskChatsCount = useTaskChatBadgeCount();
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const utils = trpc.useUtils();
  const { data: todayStats } = trpc.timeEntry.getStats.useQuery(
    { period: "today" },
    { enabled: !hidePersonalTime, staleTime: 30_000 },
  );
  const hasWorkedToday = (todayStats?.totalSeconds ?? 0) > 0;

  const { data: currentSession, refetch: refetchSession } =
    trpc.timeEntry.getCurrentSession.useQuery(undefined, {
      staleTime: 30_000,
      enabled: !hidePersonalTime,
      refetchInterval: hidePersonalTime ? false : 30_000,
    });

  const isClockedIn = !!currentSession?.active;
  const isPaused = !!currentSession?.paused;
  const { workSeconds } = useLiveSessionTimers(
    isClockedIn ? currentSession : null,
  );
  const priorWorkSeconds = currentSession?.priorDayWorkSeconds ?? 0;
  const cumulativeWorkSeconds = priorWorkSeconds + workSeconds;

  const invalidateTime = () => {
    utils.timeEntry.getCurrentSession.invalidate();
    utils.timeEntry.getStats.invalidate();
    utils.timeEntry.getBreaks.invalidate();
    utils.timeEntry.list.invalidate();
    utils.dashboard.getStats.invalidate();
    invalidateActiveTaskTimers(utils);
  };

  const clockOutAction = useClockOutAction(() => {
    invalidateTime();
    refetchSession();
  });

  const clockInMutation = trpc.timeEntry.clockIn.useMutation({
    onSuccess: () => {
      invalidateTime();
      refetchSession();
    },
    onError: (err) => toast.error(err.message || "Could not clock in"),
  });
  const pauseMutation = trpc.timeEntry.pause.useMutation({
    onSuccess: () => {
      invalidateTime();
      refetchSession();
    },
  });
  const resumeMutation = trpc.timeEntry.resume.useMutation({
    onSuccess: () => {
      invalidateTime();
      refetchSession();
    },
  });

  const isBusy =
    clockInMutation.isPending ||
    pauseMutation.isPending ||
    resumeMutation.isPending ||
    clockOutAction.isPending;

  const roleLabel =
    (user?.role && roleConfig[user.role as keyof typeof roleConfig]?.label) ||
    user?.role ||
    "Member";

  const tools = useMemo(() => {
    const items: ToolLink[] = [];
    const push = (path: string, label: string, icon: React.ElementType, section: string) => {
      if (canAccessRoute(user, path)) {
        items.push({ path, label, icon, section });
      }
    };

    push("/task-chats", "Task Chats", MessageSquare, "Collaboration");
    push("/m/work", "Tasks & Projects", ClipboardList, "Collaboration");
    if (canAccessRoute(user, "/projects")) {
      items.push({
        path: "/m/work?tab=projects",
        label: "Projects",
        icon: FolderKanban,
        section: "Collaboration",
      });
    }

    if (!isAdminOrManagement(user)) {
      push("/leaves", "Leaves", CalendarDays, "HR");
      push("/time-tracking", "Time Tracking", Clock, "HR");
    } else {
      push("/time-tracking", "Employee Hours", Clock, "HR");
    }
    if (canManageLeaves(user)) {
      push("/leave-management", "Leave Management", CalendarCheck2, "HR");
      push("/attendance-management", "Attendance", UserMinus, "HR");
      push("/locations", "Location", MapPin, "HR");
      push("/qr-code", "QR Code", QrCode, "HR");
    }

    push("/admin/employees", "Employees", Users, "Admin");
    push("/admin/permissions", "Permissions", Shield, "Admin");
    if (isFinanceRoleOnly(user)) {
      push("/admin/invoices", "Invoices", FileText, "Finance");
      push("/finance/payments", "Payments", FileText, "Finance");
      push("/finance/expenses", "Expenses", FileText, "Finance");
      push("/finance/receivable", "Receivable", Building2, "Finance");
      push("/finance/reports", "Reports", BarChart3, "Finance");
    } else {
      push("/admin/invoices", "Invoices", FileText, "Admin");
      push("/admin/customers", "Customers", Building2, "Admin");
      push("/analytics", "Analytics", BarChart3, "Workspace");
    }
    // Always available on mobile — no route permission gate
    items.push({
      path: "/m/whats-new",
      label: "What's new",
      icon: Sparkles,
      section: "Workspace",
    });
    push("/settings", "Settings", SettingsIcon, "Workspace");

    return items;
  }, [user]);

  const filteredTools = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter((t) => t.label.toLowerCase().includes(q));
  }, [tools, search]);

  const sections = useMemo(() => {
    const map = new Map<string, ToolLink[]>();
    for (const tool of filteredTools) {
      const list = map.get(tool.section) ?? [];
      list.push(tool);
      map.set(tool.section, list);
    }
    return [...map.entries()];
  }, [filteredTools]);

  return (
    <div className="min-h-full pb-8">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#1a237e] via-[#283593] to-[#4a148c] pb-8">
        <div className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_20%_20%,#64b5f6,transparent_45%),radial-gradient(circle_at_80%_0%,#ce93d8,transparent_40%)]" />
        <MobilePageHeader
          title="Menu"
          className="px-[10px]"
          onBrandHeader
          showSearch
          onSearchClick={() => setShowSearch((v) => !v)}
          showMore={false}
        />

        <div className="relative flex flex-col items-center px-4 pt-2 pb-1">
          <UserAvatar
            name={user?.name}
            avatar={user?.avatar}
            size={72}
            className="ring-2 ring-white/30"
          />
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="mt-3 flex items-center gap-1 text-lg font-semibold text-white"
          >
            {user?.name || "Account"}
            <ChevronRight size={18} className="opacity-70" />
          </button>
          <p className="text-sm text-white/70">{roleLabel}</p>
        </div>
      </div>

      <div className="relative z-10 -mt-4 space-y-3 px-3">
        {showSearch ? (
          <div className="rounded-2xl bg-[#1a1a1a] px-3 py-2 border border-white/10">
            <div className="flex items-center gap-2">
              <Search size={16} className="text-white/40" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tools…"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
                autoFocus
              />
            </div>
          </div>
        ) : null}

        {!hidePersonalTime ? (
          <div className="rounded-2xl bg-[#152238] border border-white/8 overflow-hidden">
            <div className="flex items-center gap-3 px-3.5 py-3 border-b border-white/8">
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full",
                  isClockedIn ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-white/60",
                )}
              >
                <Clock size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">
                  {isClockedIn
                    ? isPaused
                      ? "On break"
                      : formatElapsedHMS(cumulativeWorkSeconds)
                    : "Not clocked in"}
                </p>
                <p className="text-xs text-white/45">Working day</p>
              </div>
              {isClockedIn ? (
                <div className="flex items-center gap-1.5">
                  {isPaused ? (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => resumeMutation.mutate()}
                      className="h-9 rounded-xl bg-[#2A85FF] px-3 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {resumeMutation.isPending ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <span className="flex items-center gap-1">
                          <Play size={12} fill="currentColor" /> Resume
                        </span>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => pauseMutation.mutate()}
                      className="h-9 rounded-xl border border-[#2A85FF] px-3 text-xs font-semibold text-[#2A85FF] disabled:opacity-50"
                    >
                      <Pause size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      clockOutAction.requestClockOut(currentSession!.startTime)
                    }
                    className="h-9 rounded-xl bg-[#2A85FF] px-3 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {clockOutAction.isPending ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Power size={14} />
                    )}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    void runClockInWithLocation(
                      (input) => clockInMutation.mutateAsync(input),
                      {
                        isLocationRequired: async () =>
                          (await utils.location.clockInPolicy.fetch()).required,
                      },
                    );
                  }}
                  className="h-9 rounded-xl bg-[#2A85FF] px-3.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {clockInMutation.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <span className="flex items-center gap-1">
                      <Play size={12} fill="currentColor" />
                      {hasWorkedToday ? "Clock in again" : "Clock in"}
                    </span>
                  )}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => navigate("/time-tracking")}
              className="flex w-full items-center gap-3 px-3.5 py-3 active:bg-white/5"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2A85FF]/20 text-[#2A85FF]">
                <MapPin size={18} />
              </span>
              <div className="min-w-0 flex-1 text-left">
                <p className="text-sm font-medium text-white">Check-in</p>
                <p className="text-xs text-white/45">Time & attendance</p>
              </div>
              <span className="rounded-xl border border-[#2A85FF]/70 px-3 py-1.5 text-xs font-semibold text-[#2A85FF]">
                Open
              </span>
            </button>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl bg-[#1a1a1a] border border-white/8">
          <div className="px-4 pt-4 pb-2">
            <h2 className="text-base font-semibold text-white">Tools</h2>
          </div>
          {sections.map(([section, items]) => (
            <div key={section}>
              <p className="px-4 pt-2 pb-1 text-xs font-medium uppercase tracking-wide text-white/35">
                {section}
              </p>
              <ul>
                {items.map((tool) => {
                  const Icon = tool.icon;
                  const badge =
                    tool.path === "/task-chats" && taskChatsCount > 0
                      ? taskChatsCount > 99
                        ? "99+"
                        : String(taskChatsCount)
                      : tool.path === "/m/whats-new" && hasUnseenWhatsNew()
                        ? "1"
                        : null;
                  return (
                    <li
                      key={tool.path}
                      style={
                        !SHOW_LOCATION_QR_MENU && isLocationQrMenuPath(tool.path)
                          ? { display: "none" }
                          : undefined
                      }
                      aria-hidden={
                        !SHOW_LOCATION_QR_MENU && isLocationQrMenuPath(tool.path)
                          ? true
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        onClick={() => navigate(tool.path)}
                        tabIndex={
                          !SHOW_LOCATION_QR_MENU && isLocationQrMenuPath(tool.path)
                            ? -1
                            : undefined
                        }
                        className="flex w-full items-center gap-3 px-4 py-3.5 active:bg-white/5"
                      >
                        <Icon size={20} className="text-white/55" strokeWidth={1.75} />
                        <span className="flex-1 text-left text-[15px] text-white">
                          {tool.label}
                        </span>
                        {badge ? (
                          <span className="mr-1 rounded-full bg-[#E53935] px-1.5 text-[10px] font-bold leading-4 text-white">
                            {badge}
                          </span>
                        ) : null}
                        <ChevronRight size={18} className="text-white/25" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <button
            type="button"
            onClick={() => logout()}
            className="flex w-full items-center gap-3 border-t border-white/8 px-4 py-3.5 text-red-400 active:bg-white/5"
          >
            <LogOut size={20} strokeWidth={1.75} />
            <span className="text-[15px] font-medium">Log out</span>
          </button>
        </div>

      </div>

      {!hidePersonalTime && currentSession?.startTime ? (
        <CrossDayClockOutDialog
          open={clockOutAction.dialogOpen}
          onOpenChange={clockOutAction.setDialogOpen}
          sessionStartTime={currentSession.startTime}
          isPending={clockOutAction.isPending}
          onConfirmNow={clockOutAction.confirmClockOutNow}
          onUpdateTime={clockOutAction.updateClockOutTime}
        />
      ) : null}
    </div>
  );
}
