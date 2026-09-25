import { ROUTE_PERMISSIONS } from "@contracts/permissions";
import {
  isFinanceRoleOnly,
  isFinanceRestrictedPath,
  isHrDepartmentUser,
  isHrRestrictedPath,
  isHrUser,
} from "@/lib/leave-policy";
import { isNativeApp } from "@/lib/platform";

export type AppRole = "admin" | "manager" | "employee" | "hr" | "client" | "finance";

type PermissionUser = {
  role: AppRole;
  permissions?: string[];
  department?: string | null;
};

export function hasPermission(user: PermissionUser | null | undefined, permission: string) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return user.permissions?.includes(permission) ?? false;
}

/** Super admin, HR admin, and project manager may review manual time entries. */
export function canReviewTimeApprovals(
  user: { role?: string | null } | null | undefined,
): boolean {
  const role = String(user?.role ?? "").toLowerCase();
  return role === "admin" || role === "hr" || role === "manager";
}

export function hasAnyPermission(
  user: PermissionUser | null | undefined,
  permissions: string[],
) {
  return permissions.some((permission) => hasPermission(user, permission));
}

/** First route a user can open after login (clients have no dashboard). */
export function getDefaultHomePath(user: PermissionUser | null | undefined): string {
  if (!user) return "/";

  if (isNativeApp()) {
    // Native app opens on the home dashboard when available.
    if (canAccessRoute(user, "/")) return "/";
    if (isHrUser(user)) return "/leave-management";
    if (isFinanceRoleOnly(user) && canAccessRoute(user, "/admin/invoices")) {
      return "/admin/invoices";
    }
    if (
      canAccessRoute(user, "/tasks") ||
      canAccessRoute(user, "/admin/tasks") ||
      canAccessRoute(user, "/projects")
    ) {
      return "/m/work?tab=my";
    }
    return "/m/menu";
  }

  const candidates = ["/", "/admin/invoices", "/admin/customers", "/projects", "/admin/tasks", "/tasks"];
  for (const path of candidates) {
    if (canAccessRoute(user, path)) return path;
  }
  return "/settings";
}

function isClientRestrictedPath(path: string): boolean {
  if (path === "/" || path === "") return true;
  if (path === "/leaves" || path.startsWith("/leaves")) return true;
  if (path === "/leave-management" || path.startsWith("/leave-management")) return true;
  if (path === "/attendance-management" || path.startsWith("/attendance-management")) return true;
  if (path === "/locations" || path.startsWith("/locations")) return true;
  if (path === "/qr-code" || path.startsWith("/qr-code")) return true;
  if (path === "/recent-employees" || path.startsWith("/recent-employees")) return true;
  if (path === "/time-tracking" || path.startsWith("/time-tracking")) return true;
  if (path === "/analytics" || path.startsWith("/analytics")) return true;
  if (path === "/admin/employees" || path.startsWith("/admin/employees")) return true;
  if (path === "/admin/permissions" || path.startsWith("/admin/permissions")) return true;
  if (path === "/admin/invoices" || path.startsWith("/admin/invoices")) return true;
  if (path === "/admin/customers" || path.startsWith("/admin/customers")) return true;
  return false;
}

export function canAccessRoute(user: PermissionUser | null | undefined, path: string) {
  if (isHrDepartmentUser(user) && isHrRestrictedPath(path)) {
    return false;
  }

  if (isFinanceRoleOnly(user) && isFinanceRestrictedPath(path)) {
    return false;
  }

  if (user?.role === "client" && isClientRestrictedPath(path)) {
    return false;
  }

  // Project managers can open the employees directory (notice period + directory view).
  if (
    (path === "/admin/employees" || path.startsWith("/admin/employees")) &&
    String(user?.role ?? "").toLowerCase() === "manager"
  ) {
    return true;
  }

  const exact = ROUTE_PERMISSIONS[path];
  if (exact) {
    return Array.isArray(exact)
      ? hasAnyPermission(user, exact)
      : hasPermission(user, exact);
  }

  if (path.startsWith("/projects/")) {
    if (isHrDepartmentUser(user) || isFinanceRoleOnly(user)) return false;
    return hasAnyPermission(user, ["projects.view", "projects.manage"]);
  }

  if (
    path.startsWith("/tasks/task=") ||
    path.startsWith("/tasks/task/view/")
  ) {
    return canAccessRoute(user, "/tasks");
  }

  if (path.startsWith("/admin/tasks/")) {
    return canAccessRoute(user, "/admin/tasks");
  }

  if (path.startsWith("/admin/invoices") || path.startsWith("/admin/customers")) {
    const permission = path.startsWith("/admin/invoices")
      ? "invoices.manage"
      : "customers.manage";
    return hasPermission(user, permission);
  }

  if (path.startsWith("/finance/") || path === "/finance") {
    const role = String(user?.role ?? "").toLowerCase();
    return role === "finance" || role === "admin";
  }

  if (path.startsWith("/admin/")) {
    const role = String(user?.role ?? "").toLowerCase();
    return role === "admin" || role === "manager" || role === "hr" || role === "finance";
  }

  return true;
}

/** Login path for the signed-in (or last-known) user. */
export function getLoginPathForUser(
  user: { role?: string | null } | null | undefined,
): string {
  return isFinanceRoleOnly(user) ? "/finance/login" : "/login";
}
