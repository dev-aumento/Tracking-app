import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  Building2,
  CalendarCheck2,
  CheckCircle2,
  FileText,
  Home,
  MessageSquare,
  Newspaper,
  UserMinus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTaskChatBadgeCount } from "@/hooks/useTaskChats";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { canAccessRoute } from "@/lib/permissions";
import { isAdminOrManagement, isFinanceRoleOnly, isHrUser } from "@/lib/leave-policy";
import { cn } from "@/lib/utils";

type TabId =
  | "home"
  | "tasks"
  | "feed"
  | "messenger"
  | "leaves"
  | "employees"
  | "attendance"
  | "customers"
  | "invoices"
  | "menu";

type TabDef = {
  id: TabId;
  label: string;
  path: string;
  match: (pathname: string) => boolean;
  icon?: LucideIcon;
  badge?: number | string;
  center?: boolean;
};

export function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const taskChatsCount = useTaskChatBadgeCount();

  const isHr = isHrUser(user);
  const isFinance = isFinanceRoleOnly(user);
  const isAdminRole = String(user?.role ?? "").toLowerCase() === "admin";
  const hidePersonalNav = isAdminOrManagement(user);
  const canHome = canAccessRoute(user, "/");

  const tasksPath = useMemo(() => {
    if (canAccessRoute(user, "/tasks") && !hidePersonalNav) return "/m/work?tab=my";
    if (canAccessRoute(user, "/admin/tasks")) return "/m/work?tab=my";
    if (canAccessRoute(user, "/projects")) return "/m/work?tab=projects";
    return "/m/menu";
  }, [user, hidePersonalNav]);

  const feedPath = canAccessRoute(user, "/") ? "/feed" : tasksPath;
  const homePath = canHome
    ? "/"
    : isHr
      ? "/leave-management"
      : isFinance
        ? "/admin/invoices"
        : tasksPath;

  const tabs: TabDef[] = useMemo(() => {
    const left: TabDef[] = [];
    const rightExtras: TabDef[] = [];

    if (isFinance) {
      left.push({
        id: "customers",
        label: "Customers",
        path: "/admin/customers",
        match: (p) => p.startsWith("/admin/customers"),
        icon: Building2,
      });
      left.push({
        id: "invoices",
        label: "Invoices",
        path: "/admin/invoices",
        match: (p) => p.startsWith("/admin/invoices"),
        icon: FileText,
      });
    } else if (isHr) {
      left.push({
        id: "leaves",
        label: "Leave",
        path: "/leave-management",
        match: (p) => p.startsWith("/leave-management"),
        icon: CalendarCheck2,
      });
      if (canAccessRoute(user, "/admin/employees")) {
        left.push({
          id: "employees",
          label: "Employees",
          path: "/admin/employees",
          match: (p) => p.startsWith("/admin/employees"),
          icon: Users,
        });
      }
      rightExtras.push({
        id: "attendance",
        label: "Attendance",
        path: "/attendance-management",
        match: (p) => p.startsWith("/attendance-management"),
        icon: UserMinus,
      });
    } else {
      left.push({
        id: "tasks",
        label: "Tasks",
        path: tasksPath,
        match: (p) =>
          p.startsWith("/m/work") ||
          p.startsWith("/tasks") ||
          p.startsWith("/admin/tasks") ||
          p.startsWith("/projects"),
        icon: CheckCircle2,
      });

      if (canAccessRoute(user, "/")) {
        left.push({
          id: "feed",
          label: "Comments",
          path: feedPath,
          match: (p) => p === "/feed",
          icon: Newspaper,
        });
      }

      if (!hidePersonalNav && canAccessRoute(user, "/task-chats")) {
        rightExtras.push({
          id: "messenger",
          label: "Notifications",
          path: "/task-chats",
          match: (p) => p.startsWith("/task-chats"),
          icon: MessageSquare,
          badge: taskChatsCount > 0 ? taskChatsCount : undefined,
        });
      }

      if (isAdminRole) {
        rightExtras.push({
          id: "attendance",
          label: "Attendance",
          path: "/attendance-management",
          match: (p) => p.startsWith("/attendance-management"),
          icon: UserMinus,
        });
      }
    }

    const leftTabs = left.slice(0, 2);
    const rightSide = rightExtras.slice(0, 1);

    const sideForMenuMatch = [...leftTabs, ...rightSide];
    const dedicatedPrefixes = sideForMenuMatch.flatMap((t) => {
      if (t.id === "tasks") {
        return ["/m/work", "/tasks", "/admin/tasks", "/projects"];
      }
      if (t.id === "feed") return ["/feed"];
      if (t.id === "messenger") return ["/task-chats"];
      if (t.id === "leaves") return ["/leave-management"];
      if (t.id === "employees") return ["/admin/employees"];
      if (t.id === "attendance") return ["/attendance-management"];
      if (t.id === "customers") return ["/admin/customers"];
      if (t.id === "invoices") return ["/admin/invoices"];
      return [];
    });

    const menuTab: TabDef = {
      id: "menu",
      label: "Menu",
      path: "/m/menu",
      match: (p) => {
        if (p === "/" || p === "") return false;
        if (
          dedicatedPrefixes.some(
            (prefix) => p === prefix || p.startsWith(`${prefix}/`),
          )
        ) {
          return false;
        }
        return (
          p.startsWith("/m/menu") ||
          p.startsWith("/m/whats-new") ||
          p.startsWith("/settings") ||
          p.startsWith("/leaves") ||
          p.startsWith("/time-tracking") ||
          p.startsWith("/admin/") ||
          p.startsWith("/leave-management") ||
          p.startsWith("/attendance-management") ||
          p.startsWith("/locations") ||
          p.startsWith("/analytics")
        );
      },
      badge: 1,
    };

    const homeTab: TabDef = {
      id: "home",
      label: "Home",
      path: homePath,
      match: (p) => p === "/" || p === "",
      icon: Home,
      center: true,
    };

    return [...leftTabs, homeTab, ...rightSide, menuTab];
  }, [
    isHr,
    isFinance,
    isAdminRole,
    hidePersonalNav,
    user,
    feedPath,
    tasksPath,
    homePath,
    taskChatsCount,
  ]);

  const activeId = tabs.find((t) => t.match(location.pathname))?.id ?? "menu";
  const homeTab = tabs.find((t) => t.center);
  const HomeIcon = homeTab?.icon;
  const homeActive = homeTab?.id === activeId;

  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 overflow-visible px-3 pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-8"
      aria-label="Primary"
    >
      <div className="pointer-events-none relative mx-auto max-w-md overflow-visible">
        {/* Raised home button sits ABOVE the glass bar so backdrop/radius never clip it */}
        {homeTab ? (
          <button
            type="button"
            aria-label={homeTab.label}
            aria-current={homeActive ? "page" : undefined}
            onClick={() => {
              const pathOnly = homeTab.path.split("?")[0] ?? homeTab.path;
              if (
                location.pathname !== pathOnly ||
                (homeTab.path.includes("?") &&
                  location.search !== `?${homeTab.path.split("?")[1]}`)
              ) {
                navigate(homeTab.path);
              }
            }}
            className={cn(
              "pointer-events-auto absolute left-1/2 top-0 z-20 flex h-[3.65rem] w-[3.65rem] -translate-x-1/2 -translate-y-[42%] items-center justify-center overflow-visible rounded-full text-white",
              "bg-[#2A85FF] shadow-[0_8px_20px_rgba(42,133,255,0.45)]",
              "ring-[3px] ring-white/80 dark:ring-white/20",
              homeActive && "scale-105",
            )}
          >
            {HomeIcon ? (
              <HomeIcon
                size={24}
                strokeWidth={2.15}
                className="relative top-px shrink-0 overflow-visible"
                aria-hidden
              />
            ) : null}
          </button>
        ) : null}

        <div
          className={cn(
            "native-glass-tabbar pointer-events-auto flex h-[4.15rem] items-center justify-between gap-0.5 rounded-[1.85rem] px-1.5",
            "border border-white/40 dark:border-white/15",
            "shadow-[0_8px_28px_rgba(0,0,0,0.18)] dark:shadow-[0_8px_28px_rgba(0,0,0,0.45)]",
          )}
        >
          {tabs.map((tab) => {
            const active = tab.id === activeId;
            const badge =
              tab.badge != null
                ? typeof tab.badge === "number" && tab.badge > 99
                  ? "99+"
                  : String(tab.badge)
                : null;
            const inactiveIcon = "text-gray-600/80 dark:text-white/55";
            const Icon = tab.icon;
            const isCenter = Boolean(tab.center);

            if (isCenter) {
              // Spacer for the floating home button above
              return <div key={tab.id} className="flex-1" aria-hidden />;
            }

            return (
              <button
                key={tab.id}
                type="button"
                aria-label={tab.label}
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  const pathOnly = tab.path.split("?")[0] ?? tab.path;
                  if (
                    location.pathname !== pathOnly ||
                    (tab.path.includes("?") &&
                      location.search !== `?${tab.path.split("?")[1]}`)
                  ) {
                    navigate(tab.path);
                  }
                }}
                className="relative flex h-14 flex-1 flex-col items-center justify-center"
              >
                {tab.id === "menu" ? (
                  <span className="relative">
                    <UserAvatar
                      name={user?.name}
                      avatar={user?.avatar}
                      size={26}
                      className={cn(
                        "ring-2 ring-offset-2 ring-offset-transparent",
                        active ? "ring-[#2A85FF]" : "ring-transparent",
                      )}
                    />
                    {badge ? (
                      <span className="absolute -right-1.5 -top-1.5 min-w-[1rem] rounded-full bg-[#E53935] px-1 text-center text-[9px] font-bold leading-4 text-white">
                        {badge}
                      </span>
                    ) : null}
                  </span>
                ) : Icon ? (
                  <span className="relative">
                    <Icon
                      size={23}
                      strokeWidth={active ? 2.3 : 1.8}
                      className={active ? "text-[#2A85FF]" : inactiveIcon}
                    />
                    {badge ? (
                      <span className="absolute -right-2.5 -top-1.5 min-w-[1rem] rounded-full bg-[#E53935] px-1 text-center text-[9px] font-bold leading-4 text-white">
                        {badge}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
