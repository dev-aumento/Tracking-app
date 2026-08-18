import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { useTaskChatBadgeCount } from "@/hooks/useTaskChats";
import { canAccessRoute } from "@/lib/permissions";
import { canManageLeaves, isAdminOrManagement, isFinanceRoleOnly } from "@/lib/leave-policy";
import { requestDashboardRefresh } from "@/lib/dashboard-refresh";
import {
  getSidebarWidth,
  useLayoutMode,
} from "@/hooks/use-layout-mode";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  LayoutDashboard,
  ClipboardList,
  ListTodo,
  BarChart3,
  Settings,
  Users,
  Shield,
  ChevronLeft,
  ChevronRight,
  LogOut,
  FolderKanban,
  MessageSquare,
  Clock,
  CalendarDays,
  ClipboardCheck,
  UserMinus,
  FileText,
  Building2,
  CalendarCheck2,
  MapPin,
  QrCode,
  Banknote,
  Receipt,
  ScrollText,
  Wallet,
  HandCoins,
  Scale,
  TrendingUp,
  ArrowLeftRight,
  Landmark,
  BookOpen,
} from "lucide-react";
import {
  SHOW_LOCATION_QR_MENU,
  isLocationQrMenuPath,
} from "@/lib/location-qr-menu";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  drawerOpen: boolean;
  onDrawerOpenChange: (open: boolean) => void;
}

type NavItem = {
  path: string;
  icon: React.ElementType;
  label: string;
  badge?: number;
  /** Section label for grouped leadership sidebars (WORK / PEOPLE / …). */
  section?: string;
};

const SECTION_ORDER = [
  "ACCOUNTS",
  "REPORTS",
  "SETTINGS",
  "OVERVIEW",
  "WORK",
  "PEOPLE",
  "BUSINESS",
  "FINANCE",
  "SYSTEM",
] as const;

function isLeadershipSidebarUser(
  user: { role?: string | null; department?: string | null } | null | undefined,
) {
  if (!user) return false;
  const role = String(user.role ?? "").toLowerCase();
  if (role === "admin" || role === "manager") return true;
  return isAdminOrManagement(user);
}

function SidebarPanel({
  collapsed,
  showCollapseToggle,
  onToggle,
  onNavigate,
}: {
  collapsed: boolean;
  showCollapseToggle: boolean;
  onToggle: () => void;
  onNavigate: (path: string) => void;
}) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const taskChatsCount = useTaskChatBadgeCount();
  const leadershipNav = isLeadershipSidebarUser(user);

  const navItems: NavItem[] = useMemo(() => {
    const hidePersonalNav = isAdminOrManagement(user);
    const isAdmin = user?.role === "admin";

    if (isFinanceRoleOnly(user)) {
      return [
        { path: "/", icon: LayoutDashboard, label: "Dashboard", section: "ACCOUNTS" },
        { path: "/admin/invoices", icon: FileText, label: "Invoices", section: "ACCOUNTS" },
        { path: "/finance/payments", icon: Banknote, label: "Payments", section: "ACCOUNTS" },
        { path: "/finance/expenses", icon: Receipt, label: "Expenses", section: "ACCOUNTS" },
        { path: "/finance/estimates", icon: ClipboardList, label: "Estimates", section: "ACCOUNTS" },
        { path: "/finance/contracts", icon: ScrollText, label: "Contracts", section: "ACCOUNTS" },
        { path: "/finance/receivable", icon: Wallet, label: "Accounts Receivable", section: "ACCOUNTS" },
        { path: "/finance/payable", icon: HandCoins, label: "Accounts Payable", section: "ACCOUNTS" },
        { path: "/finance/tax", icon: Scale, label: "Tax & Compliance", section: "ACCOUNTS" },
        { path: "/finance/reports", icon: BarChart3, label: "Financial Reports", section: "REPORTS" },
        { path: "/finance/profit-loss", icon: TrendingUp, label: "Profit & Loss", section: "REPORTS" },
        { path: "/finance/cash-flow", icon: ArrowLeftRight, label: "Cash Flow", section: "REPORTS" },
        { path: "/finance/balance-sheet", icon: Landmark, label: "Balance Sheet", section: "REPORTS" },
        { path: "/finance/chart-of-accounts", icon: BookOpen, label: "Chart of Accounts", section: "SETTINGS" },
        { path: "/finance/banks", icon: Building2, label: "Bank Accounts", section: "SETTINGS" },
      ];
    }

    if (leadershipNav) {
      const items: NavItem[] = [
        { path: "/", icon: LayoutDashboard, label: "Dashboard" },
        ...(!hidePersonalNav
          ? [
              {
                path: "/tasks",
                icon: ListTodo,
                label: "My Tasks",
                section: "WORK",
              } satisfies NavItem,
            ]
          : []),
        { path: "/admin/tasks", icon: ClipboardList, label: "All Tasks", section: "WORK" },
        { path: "/projects", icon: FolderKanban, label: "Projects", section: "WORK" },
        {
          path: "/time-tracking",
          icon: Clock,
          label: "Time & Hours",
          section: "WORK",
        },
        ...(!hidePersonalNav
          ? [
              {
                path: "/task-chats",
                icon: MessageSquare,
                label: "Task Chats",
                section: "WORK",
                badge: taskChatsCount > 0 ? taskChatsCount : undefined,
              } satisfies NavItem,
            ]
          : []),
        {
          path: "/admin/employees",
          icon: Users,
          label: "Employees",
          section: "PEOPLE",
        },
        {
          path: "/attendance-management",
          icon: CalendarCheck2,
          label: "Attendance",
          section: "PEOPLE",
        },
        {
          path: "/leave-management",
          icon: ClipboardCheck,
          label: "Leave management",
          section: "PEOPLE",
        },
        ...(!hidePersonalNav
          ? [
              {
                path: "/leaves",
                icon: CalendarDays,
                label: "My Leaves",
                section: "PEOPLE",
              } satisfies NavItem,
            ]
          : []),
        {
          path: "/recent-employees",
          icon: UserMinus,
          label: "Recent employees",
          section: "PEOPLE",
        },
        {
          path: "/analytics",
          icon: BarChart3,
          label: "Reports & Analytics",
          section: "PEOPLE",
        },
        {
          path: "/admin/customers",
          icon: Building2,
          label: "Clients",
          section: "BUSINESS",
        },
        {
          path: "/admin/invoices",
          icon: FileText,
          label: "Invoices",
          section: "BUSINESS",
        },
        {
          path: "/admin/permissions",
          icon: Shield,
          label: "Permissions",
          section: "SYSTEM",
        },
        {
          path: "/locations",
          icon: MapPin,
          label: "Location",
          section: "SYSTEM",
        },
        {
          path: "/qr-code",
          icon: QrCode,
          label: "QR Code",
          section: "SYSTEM",
        },
      ];
      return items;
    }

    // Employee / HR: flat list (existing behavior)
    const items: NavItem[] = [
      { path: "/", icon: LayoutDashboard, label: "Dashboard" },
      ...(hidePersonalNav
        ? []
        : [{ path: "/tasks", icon: ListTodo, label: "My Tasks" }]),
      { path: "/admin/tasks", icon: ClipboardList, label: "All Tasks" },
      { path: "/projects", icon: FolderKanban, label: "Projects" },
      {
        path: "/time-tracking",
        icon: Clock,
        label: hidePersonalNav ? "Employee Hours" : "Time Tracking",
      },
      { path: "/admin/employees", icon: Users, label: "Employees" },
      { path: "/admin/permissions", icon: Shield, label: "Permissions" },
      ...(isAdmin
        ? [
            { path: "/admin/invoices", icon: FileText, label: "Invoice" },
            { path: "/admin/customers", icon: Building2, label: "Customers" },
          ]
        : []),
      { path: "/analytics", icon: BarChart3, label: "Analytics" },
      ...(hidePersonalNav
        ? []
        : [
            {
              path: "/task-chats",
              icon: MessageSquare,
              label: "Task Chats",
              badge: taskChatsCount > 0 ? taskChatsCount : undefined,
            },
            { path: "/leaves", icon: CalendarDays, label: "Leaves" },
          ]),
    ];
    if (canManageLeaves(user)) {
      items.push(
        {
          path: "/leave-management",
          icon: ClipboardCheck,
          label: "Leave Management",
        },
        {
          path: "/attendance-management",
          icon: CalendarCheck2,
          label: "Attendance",
        },
        {
          path: "/recent-employees",
          icon: UserMinus,
          label: "Recent employees",
        },
        { path: "/locations", icon: MapPin, label: "Location" },
        { path: "/qr-code", icon: QrCode, label: "QR Code" },
      );
    }
    return items;
  }, [taskChatsCount, user, leadershipNav]);

  const visibleNav = navItems.filter((item) => {
    if (!canAccessRoute(user, item.path)) return false;
    if (
      leadershipNav &&
      (item.path === "/leave-management" ||
        item.path === "/attendance-management" ||
        item.path === "/recent-employees") &&
      !canManageLeaves(user)
    ) {
      return false;
    }
    return true;
  });

  const useGroupedNav = leadershipNav || isFinanceRoleOnly(user);

  const navSections = useMemo(() => {
    if (!useGroupedNav) {
      return [{ section: null as string | null, items: visibleNav }];
    }
    const ungrouped = visibleNav.filter((item) => !item.section);
    const groups = SECTION_ORDER.map((section) => ({
      section,
      items: visibleNav.filter((item) => item.section === section),
    })).filter((group) => group.items.length > 0);

    return [
      ...(ungrouped.length ? [{ section: null as string | null, items: ungrouped }] : []),
      ...groups,
    ];
  }, [useGroupedNav, visibleNav]);

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    if (path === "/tasks") {
      return (
        location.pathname === "/tasks" ||
        location.pathname.startsWith("/tasks/")
      );
    }
    if (path === "/admin/tasks") {
      return (
        location.pathname === "/admin/tasks" ||
        location.pathname.startsWith("/admin/tasks/")
      );
    }
    if (path === "/projects") {
      if (/\/projects\/[^/]+\/tasks\//i.test(location.pathname)) return false;
      return location.pathname.startsWith("/projects");
    }
    return location.pathname.startsWith(path);
  };

  const handleNav = (path: string) => {
    if (path === "/" && location.pathname === "/") {
      requestDashboardRefresh();
      return;
    }
    onNavigate(path);
  };

  const renderNavItem = (item: NavItem) => (
    <button
      key={item.path}
      type="button"
      onClick={() => handleNav(item.path)}
      style={
        !SHOW_LOCATION_QR_MENU && isLocationQrMenuPath(item.path)
          ? { display: "none" }
          : undefined
      }
      aria-hidden={
        !SHOW_LOCATION_QR_MENU && isLocationQrMenuPath(item.path)
          ? true
          : undefined
      }
      tabIndex={
        !SHOW_LOCATION_QR_MENU && isLocationQrMenuPath(item.path) ? -1 : undefined
      }
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white transition-all duration-150 group relative ${
        isActive(item.path)
          ? "bg-white/20 border-l-[3px] border-white dark:bg-[#151c2c] dark:border-[#38BDF8]"
          : "hover:bg-white/10 border-l-[3px] border-transparent dark:hover:bg-[#151c2c]/80"
      }`}
    >
      <item.icon size={20} className="text-white shrink-0 dark:text-gray-200" />
      {!collapsed && (
        <>
          <span className="flex-1 text-left text-white dark:text-gray-100">
            {item.label}
          </span>
          {item.badge ? (
            <span className="bg-white text-[#1e3a5f] text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 dark:bg-[#38BDF8] dark:text-[#0b1220]">
              {item.badge}
            </span>
          ) : null}
        </>
      )}
      {collapsed && item.badge ? (
        <span className="absolute -top-1 -right-1 bg-white text-[#1e3a5f] text-[8px] font-bold rounded-full w-4 h-4 flex items-center justify-center dark:bg-[#38BDF8] dark:text-[#0b1220]">
          {item.badge}
        </span>
      ) : null}
    </button>
  );

  return (
    <div className="relative flex h-full flex-col bg-gradient-to-b from-[#1e3a5f] via-[#2563EB] to-[#1e40af] dark:bg-none dark:bg-[#0b1220] dark:border-r dark:border-[#1e293b] sidebar-chrome">
      <div
        className="pointer-events-none absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_top,_white,_transparent_55%)] dark:opacity-40 dark:bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_transparent_50%)]"
        aria-hidden
      />
      <div
        className={`relative h-14 sm:h-16 flex items-center border-b border-white/15 dark:border-[#1e293b] ${
          collapsed ? "justify-center px-2" : "gap-3 px-4"
        }`}
      >
        {collapsed ? (
          <img
            src="/logo-vector.svg"
            alt="Aumento"
            className="h-8 w-8 object-contain flex-shrink-0"
          />
        ) : (
          <img
            src="/Logo.png"
            alt="Aumento"
            className="h-8 w-auto max-w-[160px] object-contain object-left flex-shrink-0"
          />
        )}
        {showCollapseToggle ? (
          <button
            type="button"
            onClick={onToggle}
            className={
              collapsed
                ? "absolute top-1/2 -translate-y-1/2 -right-3 z-[130] flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#1e3a5f] shadow-md border border-white/80 hover:bg-blue-50 transition-colors dark:bg-[#151c2c] dark:text-gray-100 dark:border-[#2d3a4f] dark:hover:bg-[#1a2336]"
                : "ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-white hover:bg-white/10 transition-colors dark:hover:bg-white/5"
            }
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight size={16} strokeWidth={2.5} />
            ) : (
              <ChevronLeft size={16} />
            )}
          </button>
        ) : null}
      </div>

      <nav className="relative flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin py-4 px-2 space-y-1">
        {navSections.map((group, groupIndex) => (
          <div
            key={group.section ?? `top-${groupIndex}`}
            className={groupIndex > 0 ? "pt-3 mt-1" : undefined}
          >
            {group.section && !collapsed ? (
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">
                {group.section}
              </p>
            ) : null}
            {group.section && collapsed && groupIndex > 0 ? (
              <div
                className="mx-2 mb-2 border-t border-white/15"
                aria-hidden
              />
            ) : null}
            <div className="space-y-1">{group.items.map(renderNavItem)}</div>
          </div>
        ))}
      </nav>

      <div className="relative border-t border-white/15 dark:border-[#1e293b] p-2 space-y-1 overflow-hidden">
        <button
          type="button"
          onClick={() => handleNav("/settings")}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white transition-all duration-150 ${
            isActive("/settings")
              ? "bg-white/20 border-l-[3px] border-white dark:bg-[#151c2c] dark:border-[#38BDF8]"
              : "hover:bg-white/10 border-l-[3px] border-transparent dark:hover:bg-[#151c2c]/80"
          }`}
        >
          <Settings size={20} className="text-white shrink-0" />
          {!collapsed && <span className="text-white">Settings</span>}
        </button>

        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white hover:bg-white/10 dark:hover:bg-[#151c2c]/80 transition-all duration-150"
        >
          <LogOut size={20} className="text-white shrink-0" />
          {!collapsed && <span className="text-white">Logout</span>}
        </button>
      </div>
    </div>
  );
}

export function Sidebar({
  collapsed,
  onToggle,
  drawerOpen,
  onDrawerOpenChange,
}: SidebarProps) {
  const layoutMode = useLayoutMode();
  const navigate = useNavigate();
  const isDrawer = layoutMode === "drawer";
  const sidebarWidth = getSidebarWidth(layoutMode, collapsed);

  const handleNavigate = (path: string) => {
    navigate(path);
    if (isDrawer) {
      onDrawerOpenChange(false);
    }
  };

  if (isDrawer) {
    return (
      <Sheet open={drawerOpen} onOpenChange={onDrawerOpenChange}>
        <SheetContent
          side="left"
          className="w-[min(280px,85vw)] max-w-[85vw] p-0 border-0 bg-transparent shadow-2xl [&>button]:hidden z-[140]"
        >
          <SidebarPanel
            collapsed={false}
            showCollapseToggle={false}
            onToggle={onToggle}
            onNavigate={handleNavigate}
          />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      className="fixed left-0 top-0 h-screen flex flex-col z-[120] transition-all duration-300 overflow-visible"
      style={{ width: sidebarWidth }}
    >
      <SidebarPanel
        collapsed={collapsed}
        showCollapseToggle
        onToggle={onToggle}
        onNavigate={handleNavigate}
      />
    </aside>
  );
}
