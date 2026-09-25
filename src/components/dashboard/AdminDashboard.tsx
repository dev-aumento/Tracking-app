import { useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import {
  Briefcase,
  Clock,
  DollarSign,
  FileText,
  FolderKanban,
  Timer,
  TrendingUp,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import {
  dashboardQueryOptions,
  DASHBOARD_REFRESH_EVENT,
  refreshDashboardPage,
} from "@/lib/dashboard-refresh";
import { formatWorkZoneDate, istTimeOfDayGreeting } from "@/lib/timezone";
import { formatHoursMinutes } from "@/lib/work-hours-policy";
import { formatMoney } from "@/lib/invoice-store";
import { WorkforceKpiCards } from "@/components/dashboard/WorkforceKpiCards";
import { DashboardCalendarEventsBlocks } from "@/components/dashboard/DashboardCalendarPanel";
import { UpcomingBirthdaysPanel, TodayBirthdaysBanner } from "@/components/dashboard/UpcomingBirthdaysPanel";
import { LeaveSummaryPanel } from "@/components/dashboard/LeaveSummaryPanel";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { useEffect } from "react";

const WORK_COLORS = ["#2563EB", "#3B82F6", "#60A5FA", "#93C5FD", "#38BDF8", "#0EA5E9"];

function TrendText({
  value,
  suffix,
  positiveIsGood = true,
}: {
  value: number;
  suffix: string;
  positiveIsGood?: boolean;
}) {
  if (value === 0) {
    return (
      <span className="text-[11px] font-medium text-gray-400">No change {suffix}</span>
    );
  }
  const up = value > 0;
  const good = positiveIsGood ? up : !up;
  return (
    <span className={`text-[11px] font-semibold ${good ? "text-emerald-600" : "text-red-500"}`}>
      {up ? "↑" : "↓"} {Math.abs(value)}
      {suffix}
    </span>
  );
}

function formatDashboardHours(hours: number) {
  return formatHoursMinutes(Math.max(0, hours));
}

function DonutCard({
  title,
  subtitle,
  centerValue,
  centerLabel,
  rows,
  colors,
  emptyLabel,
  footer,
}: {
  title: string;
  subtitle: string;
  centerValue: number | string;
  centerLabel: string;
  rows: Array<{ name: string; count: number; percent: number; color?: string }>;
  colors: string[];
  emptyLabel: string;
  footer?: ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 h-full">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-[#1F2937]">{title}</h2>
      </div>
      <p className="text-xs text-gray-400 mb-4">{subtitle}</p>
      <div className="h-48 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              dataKey="count"
              nameKey="name"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={2}
              strokeWidth={0}
            >
              {rows.map((row, i) => (
                <Cell
                  key={row.name}
                  fill={row.color ?? colors[i % colors.length]}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, name: string) => [`${value}`, name]}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #E5E7EB",
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-xl font-bold text-[#1F2937]">{centerValue}</div>
            <div className="text-[10px] text-gray-400">{centerLabel}</div>
          </div>
        </div>
      </div>
      <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">{emptyLabel}</p>
        ) : (
          rows.map((row, i) => (
            <div
              key={row.name}
              className="flex items-center justify-between text-xs gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    backgroundColor: row.color ?? colors[i % colors.length],
                  }}
                />
                <span className="text-gray-600 truncate">{row.name}</span>
              </div>
              <span className="text-gray-500 shrink-0">
                {row.count}{" "}
                <span className="text-gray-400">({row.percent}%)</span>
              </span>
            </div>
          ))
        )}
      </div>
      {footer}
    </div>
  );
}

export function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const firstName = user?.name?.split(" ")[0] || "there";
  const greeting = useMemo(() => istTimeOfDayGreeting(new Date()), []);

  const { data, isLoading } = trpc.dashboard.getHrDashboard.useQuery(undefined, {
    ...dashboardQueryOptions,
  });

  useEffect(() => {
    const onRefresh = () => {
      void refreshDashboardPage(utils);
    };
    window.addEventListener(DASHBOARD_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(DASHBOARD_REFRESH_EVENT, onRefresh);
  }, [utils]);

  const metrics = data?.monthMetrics;
  const projectOverview = data?.projectOverview;
  const workRows = data?.byDepartment ?? [];
  const currency = metrics?.currency || "INR";

  const metricCards = useMemo(() => {
    if (!metrics) return [];
    return [
      {
        title: "Total Hours Logged",
        value: formatDashboardHours(metrics.totalHoursLogged),
        sub: "Attendance hours",
        trend: (
          <TrendText value={metrics.totalHoursDeltaPct} suffix="% vs last month" />
        ),
        icon: Clock,
        iconWrap: "bg-blue-50 text-[#2563EB]",
      },
      {
        title: "Tracked Hours",
        value: formatDashboardHours(metrics.trackedHours),
        sub: `${metrics.trackedHoursPct}% of total`,
        trend: (
          <TrendText value={metrics.trackedHoursDeltaPct} suffix="% vs last month" />
        ),
        icon: Timer,
        iconWrap: "bg-sky-50 text-sky-600",
      },
      {
        title: "Billable Hours",
        value: formatDashboardHours(metrics.billableHours),
        sub: `${metrics.billablePct}% of total`,
        trend: null,
        icon: Briefcase,
        iconWrap: "bg-violet-50 text-violet-600",
      },
      {
        title: "Team Utilization",
        value: `${metrics.teamUtilizationPct}%`,
        sub: null,
        trend: (
          <TrendText value={metrics.utilizationDeltaPct} suffix="% vs last month" />
        ),
        icon: TrendingUp,
        iconWrap: "bg-emerald-50 text-emerald-600",
      },
      {
        title: "Pending Invoices",
        value: formatMoney(metrics.pendingInvoicesAmount, currency),
        sub: `${metrics.pendingInvoicesCount} invoice${
          metrics.pendingInvoicesCount === 1 ? "" : "s"
        }`,
        trend: null,
        icon: FileText,
        iconWrap: "bg-orange-50 text-orange-500",
      },
      {
        title: "Revenue This Month",
        value: formatMoney(metrics.revenueThisMonth, currency),
        sub: null,
        trend: (
          <TrendText value={metrics.revenueDeltaPct} suffix="% vs last month" />
        ),
        icon: DollarSign,
        iconWrap: "bg-amber-50 text-amber-600",
      },
    ];
  }, [metrics, currency]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.35, ease: "easeOut" as const },
    },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <motion.div variants={itemVariants}>
        <h1 className="text-lg sm:text-2xl font-bold text-[#1F2937]">
          {greeting}, {firstName}{" "}
          <span
            className="inline-block origin-[70%_70%] animate-wave"
            role="img"
            aria-label="waving hand"
          >
            👋
          </span>
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {formatWorkZoneDate(new Date(), {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </motion.div>

      <TodayBirthdaysBanner birthdays={data?.upcomingBirthdays ?? []} />

      {isLoading && !data ? (
        <div className="h-40 rounded-xl border border-gray-200 bg-white animate-pulse" />
      ) : (
        <>
          <motion.div variants={itemVariants}>
            <WorkforceKpiCards data={data} />
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 items-stretch"
          >
            <DonutCard
              title="Work Overview"
              subtitle="Team by department / role"
              centerValue={
                data?.overviewStaffTotal ??
                workRows.reduce((sum, row) => sum + row.count, 0)
              }
              centerLabel="Total"
              rows={workRows}
              colors={WORK_COLORS}
              emptyLabel="No work overview data yet"
              footer={
                <button
                  type="button"
                  onClick={() => navigate("/admin/employees")}
                  className="mt-4 w-full h-9 rounded-lg border border-gray-200 text-sm font-medium text-[#2563EB] hover:bg-blue-50 transition-colors"
                >
                  View Report
                </button>
              }
            />
            <DonutCard
              title="Project Overview"
              subtitle="Projects by status"
              centerValue={projectOverview?.total ?? 0}
              centerLabel="Projects"
              rows={projectOverview?.byStatus ?? []}
              colors={WORK_COLORS}
              emptyLabel="No projects yet"
              footer={
                <button
                  type="button"
                  onClick={() => navigate("/projects")}
                  className="mt-4 w-full h-9 rounded-lg border border-gray-200 text-sm font-medium text-[#2563EB] hover:bg-blue-50 transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  <FolderKanban size={15} />
                  View Projects
                </button>
              }
            />
            <DashboardCalendarEventsBlocks />
          </motion.div>

          {metricCards.length > 0 ? (
            <motion.div
              variants={itemVariants}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4"
            >
              {metricCards.map((card) => (
                <div
                  key={card.title}
                  className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-gray-500">
                        {card.title}
                      </div>
                      <div className="text-xl font-bold text-[#1F2937] mt-1 truncate">
                        {card.value}
                      </div>
                      {card.sub ? (
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {card.sub}
                        </div>
                      ) : null}
                    </div>
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${card.iconWrap}`}
                    >
                      <card.icon size={18} />
                    </div>
                  </div>
                  {card.trend}
                </div>
              ))}
            </motion.div>
          ) : null}

          <motion.div variants={itemVariants}>
            <LeaveSummaryPanel
              leaveMonthLabel={data?.leaveMonthLabel}
              upcomingLeaves={data?.upcomingLeaves ?? []}
              upcomingWfh={data?.upcomingWfh ?? []}
            />
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="grid grid-cols-1 lg:grid-cols-2 gap-5"
          >
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-[#1F2937]">Recent Joiners</h2>
                <button
                  type="button"
                  onClick={() => navigate("/admin/employees")}
                  className="text-xs font-medium text-[#2563EB] hover:underline"
                >
                  View All
                </button>
              </div>
              <div className="space-y-3">
                {(data?.recentJoiners ?? []).length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-6">
                    No recent joiners
                  </p>
                ) : (
                  (data?.recentJoiners ?? []).map((person) => (
                    <div key={person.id} className="flex items-center gap-3">
                      <UserAvatar
                        name={person.name}
                        avatar={person.avatar}
                        size={40}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-[#1F2937] truncate">
                          {person.name}
                        </div>
                        <div className="text-xs text-gray-400 truncate">
                          {person.position}
                        </div>
                      </div>
                      <div className="text-xs text-gray-400 shrink-0">
                        {person.joinedLabel}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <UpcomingBirthdaysPanel
              birthdays={data?.upcomingBirthdays ?? []}
            />
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
