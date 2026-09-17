import type { trpc } from "@/providers/trpc";

type TrpcUtils = ReturnType<typeof trpc.useUtils>;

export const DASHBOARD_REFRESH_EVENT = "dashboard:refresh";

export function requestDashboardRefresh() {
  window.dispatchEvent(new CustomEvent(DASHBOARD_REFRESH_EVENT));
}

/** Refetch dashboard stats even when the Dashboard page is not mounted. */
export async function refreshDashboardStats(utils: TrpcUtils) {
  await utils.dashboard.getStats.invalidate(undefined, { refetchType: "all" });
}

/** Refetch every query used on the Dashboard page. */
export async function refreshDashboardPage(utils: TrpcUtils) {
  await Promise.all([
    refreshDashboardStats(utils),
    utils.dashboard.getWeeklyActivity.invalidate(undefined, { refetchType: "all" }),
    utils.dashboard.getHrDashboard.invalidate(undefined, { refetchType: "all" }),
    utils.dashboard.getFinanceDashboard.invalidate(undefined, { refetchType: "all" }),
    utils.dashboard.getLeaveSummary.invalidate(undefined, { refetchType: "all" }),
    utils.timeEntry.getStats.invalidate({ period: "today" }, { refetchType: "all" }),
    utils.timeEntry.getMonthAttendance.invalidate(undefined, { refetchType: "all" }),
    utils.timeEntry.getCurrentSession.invalidate(undefined, { refetchType: "all" }),
    utils.leave.listHolidays.invalidate(undefined, { refetchType: "all" }),
  ]);
}

/** After portal currency changes, refresh totals, FX, and formatted money. */
export async function refreshPortalCurrencyViews(utils: TrpcUtils) {
  await Promise.all([
    utils.organization.getBillingProfile.invalidate(undefined, { refetchType: "all" }),
    utils.finance.fx.rates.invalidate(undefined, { refetchType: "all" }),
    utils.finance.reports.summary.invalidate(undefined, { refetchType: "all" }),
    refreshDashboardPage(utils),
  ]);
  requestDashboardRefresh();
}

/** Cache dashboard data briefly so remounts / soft navigations don't double-fetch. */
export const dashboardQueryOptions = {
  staleTime: 30_000,
  refetchOnMount: true as const,
};
