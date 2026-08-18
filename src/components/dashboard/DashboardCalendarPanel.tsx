import { useMemo, useState } from "react";
import {
  CalendarDays,
  Loader2,
  Plus,
  Trash2,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";
import { trpc } from "@/providers/trpc";
import { workZoneDateKey, formatWorkZoneDate } from "@/lib/timezone";
import { cn } from "@/lib/utils";

function parseDateKey(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

function formatDisplayTime(time: string | null | undefined) {
  if (!time) return null;
  const [hh, mm] = time.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return time;
  const d = new Date();
  d.setHours(hh!, mm!, 0, 0);
  return d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

type ReminderRow = {
  id: number;
  title: string;
  note: string | null;
  dateKey: string;
  time: string | null;
  color: string | null;
  userId?: number;
  createdByName?: string | null;
};

/**
 * Renders two sibling cards (Calendar + Events) so a parent CSS grid can
 * place them as separate columns alongside Work / Project overview.
 */
export function DashboardCalendarEventsBlocks({
  className = "",
}: {
  className?: string;
}) {
  const utils = trpc.useUtils();
  const todayKey = useMemo(() => workZoneDateKey(new Date()), []);
  const [selected, setSelected] = useState<Date>(() => parseDateKey(todayKey));
  const [month, setMonth] = useState<Date>(() => parseDateKey(todayKey));
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [adding, setAdding] = useState(false);

  const selectedKey = workZoneDateKey(selected);
  const year = month.getFullYear();
  const monthNum = month.getMonth() + 1;

  const { data: monthReminders = [], isLoading } =
    trpc.dashboardReminder.listByMonth.useQuery(
      { year, month: monthNum },
      { staleTime: 15_000 },
    );

  const createMutation = trpc.dashboardReminder.create.useMutation({
    onSuccess: async () => {
      setTitle("");
      setTime("");
      setAdding(false);
      await utils.dashboardReminder.listByMonth.invalidate();
      toast.success("Reminder added");
    },
    onError: (err) => toast.error(err.message || "Could not add reminder"),
  });

  const removeMutation = trpc.dashboardReminder.remove.useMutation({
    onSuccess: async () => {
      await utils.dashboardReminder.listByMonth.invalidate();
    },
    onError: (err) => toast.error(err.message || "Could not delete reminder"),
  });

  const daysWithReminders = useMemo(() => {
    return new Set(monthReminders.map((r) => r.dateKey));
  }, [monthReminders]);

  const dayReminders = useMemo(
    () =>
      (monthReminders as ReminderRow[])
        .filter((r) => r.dateKey === selectedKey)
        .sort((a, b) => String(a.time ?? "").localeCompare(String(b.time ?? ""))),
    [monthReminders, selectedKey],
  );

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("Enter a reminder title");
      return;
    }
    createMutation.mutate({
      title: trimmed,
      dateKey: selectedKey,
      time: time.trim() ? time.trim() : null,
      note: null,
    });
  };

  const isToday = selectedKey === todayKey;
  const cardClass = cn(
    "bg-white border border-gray-200 rounded-xl p-5 flex flex-col min-h-[320px] h-full",
    className,
  );

  return (
    <>
      {/* 3 — Calendar */}
      <div className={cardClass}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-[#1F2937] flex items-center gap-2">
            <CalendarDays size={16} className="text-[#2563EB]" />
            Calendar
          </h2>
        </div>
        <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-1 flex-1">
          <Calendar
            mode="single"
            month={month}
            onMonthChange={setMonth}
            selected={selected}
            onSelect={(day) => {
              if (day) setSelected(day);
            }}
            className="w-full bg-transparent"
            modifiers={{
              hasReminder: (day) => daysWithReminders.has(workZoneDateKey(day)),
            }}
            modifiersClassNames={{
              hasReminder:
                "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-[#2563EB]",
            }}
          />
        </div>
        <p className="mt-2 text-[11px] text-gray-400 text-center">
          Select a date to view or add events
        </p>
      </div>

      {/* 4 — Events for selected calendar day */}
      <div className={cardClass}>
        <div className="flex items-center justify-between mb-3">
          <div className="min-w-0">
            <h2 className="font-semibold text-[#1F2937]">
              {isToday ? "Today's Events" : "Events"}
            </h2>
            <p className="text-[11px] text-gray-400 truncate">
              {formatWorkZoneDate(selected, {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB] hover:underline shrink-0"
          >
            <Plus size={14} />
            Add
          </button>
        </div>

        {adding ? (
          <div className="mb-3 rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Call with Ben — Keratin"
              className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#2563EB]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm outline-none focus:border-[#2563EB]"
              />
              <button
                type="button"
                onClick={submit}
                disabled={createMutation.isPending}
                className="h-9 px-3 rounded-lg bg-[#2563EB] text-white text-sm font-semibold disabled:opacity-60"
              >
                {createMutation.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  "Save"
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setTitle("");
                  setTime("");
                }}
                className="h-9 px-2 text-sm text-gray-500"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-0.5">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-gray-300" size={22} />
            </div>
          ) : dayReminders.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">
              No events for this day. Click Add to create one.
            </p>
          ) : (
            dayReminders.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-2.5 rounded-xl border border-gray-100 bg-white px-3 py-2.5 group"
              >
                <span
                  className="mt-1.5 h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: item.color || "#2563EB" }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#1F2937] leading-snug">
                    {item.title}
                  </p>
                  {item.time ? (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-gray-400">
                      <Clock size={11} />
                      {formatDisplayTime(item.time)}
                    </p>
                  ) : null}
                  {item.createdByName ? (
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      Added by {item.createdByName}
                    </p>
                  ) : null}
                  {item.note ? (
                    <p className="mt-0.5 text-[11px] text-gray-400 line-clamp-2">
                      {item.note}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  title="Delete"
                  onClick={() => removeMutation.mutate({ id: item.id })}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-opacity"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

/** @deprecated Prefer DashboardCalendarEventsBlocks for the 4-block layout. */
export function DashboardCalendarPanel({
  className = "",
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-5", className)}>
      <DashboardCalendarEventsBlocks />
    </div>
  );
}
