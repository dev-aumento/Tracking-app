import { ErrorMessages } from "@contracts/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { canReviewTimeApprovals, hasPermission } from "./lib/permissions";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const createRouter = t.router;
export const publicQuery = t.procedure;

const requireAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ErrorMessages.unauthenticated,
    });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

function requireRole(role: string) {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== role) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ErrorMessages.insufficientRole,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

function requireManagerOrAbove() {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user || (ctx.user.role !== "admin" && ctx.user.role !== "manager")) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ErrorMessages.insufficientRole,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

/** Super admin, HR admin, or project manager can review manual time approvals. */
function requireTimeApprovalReviewer() {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user || !canReviewTimeApprovals(ctx.user)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ErrorMessages.insufficientRole,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

/** Admin role, or any user granted `employees.manage` or `permissions.manage`. */
function requireEmployeesManage() {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: ErrorMessages.unauthenticated,
      });
    }

    if (
      !hasPermission(ctx.user, "employees.manage") &&
      !hasPermission(ctx.user, "permissions.manage")
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ErrorMessages.insufficientRole,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

/**
 * Employee directory view/edit: employees.manage / permissions.manage, or project manager role.
 * Managers get read access + notice-period updates; full edits still require employees.manage.
 */
function requireEmployeesDirectoryAccess() {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: ErrorMessages.unauthenticated,
      });
    }

    const role = String(ctx.user.role ?? "").toLowerCase();
    if (
      role === "manager" ||
      hasPermission(ctx.user, "employees.manage") ||
      hasPermission(ctx.user, "permissions.manage")
    ) {
      return next({ ctx: { ...ctx, user: ctx.user } });
    }

    throw new TRPCError({
      code: "FORBIDDEN",
      message: ErrorMessages.insufficientRole,
    });
  });
}

export const authedQuery = t.procedure.use(requireAuth);
export const adminQuery = authedQuery.use(requireRole("admin"));
export const timeApprovalReviewerQuery = authedQuery.use(requireTimeApprovalReviewer());
export const managerQuery = authedQuery.use(requireManagerOrAbove());
export const employeesManageQuery = authedQuery.use(requireEmployeesManage());
export const employeesDirectoryQuery = authedQuery.use(requireEmployeesDirectoryAccess());
