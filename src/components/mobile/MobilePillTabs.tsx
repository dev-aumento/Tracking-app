import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MobilePillTab = {
  id: string;
  label: string;
  badge?: number | string | null;
  badgeTone?: "neutral" | "danger";
};

type MobilePillTabsProps = {
  tabs: MobilePillTab[];
  activeId: string;
  onChange: (id: string) => void;
  trailing?: ReactNode;
  className?: string;
};

function formatBadge(value: number | string) {
  if (typeof value === "number") {
    return value > 99 ? "99+" : String(value);
  }
  return value;
}

export function MobilePillTabs({
  tabs,
  activeId,
  onChange,
  trailing,
  className,
}: MobilePillTabsProps) {
  return (
    <div
      className={cn(
        // Extra top padding so pill borders + badges aren't clipped by overflow-x
        "flex items-center gap-2 overflow-x-auto px-0 pt-2.5 pb-3 scrollbar-none",
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        const badge = tab.badge != null && tab.badge !== 0 ? formatBadge(tab.badge) : null;
        const danger = tab.badgeTone === "danger" || (active && badge);

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors border",
              active
                ? "border-[#1F2937]/80 text-[#1F2937] dark:border-white/90 dark:text-white bg-transparent"
                : "border-transparent text-gray-500 dark:text-white/70 bg-gray-100 dark:bg-white/[0.06]",
            )}
          >
            {tab.label}
            {badge ? (
              <span
                className={cn(
                  "absolute -right-1 -top-1.5 min-w-[1.15rem] rounded-full px-1 text-[10px] font-semibold leading-4 text-center",
                  danger || tab.badgeTone === "danger"
                    ? "bg-[#E53935] text-white"
                    : "bg-[#3a3a3a] text-white/90",
                )}
              >
                {badge}
              </span>
            ) : null}
          </button>
        );
      })}
      {trailing}
    </div>
  );
}
