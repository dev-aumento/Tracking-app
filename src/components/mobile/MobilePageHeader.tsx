import type { ReactNode } from "react";
import { MoreVertical, Search } from "lucide-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { cn } from "@/lib/utils";

type MobilePageHeaderProps = {
  title: string;
  actions?: ReactNode;
  showSearch?: boolean;
  onSearchClick?: () => void;
  showMore?: boolean;
  onMoreClick?: () => void;
  showThemeToggle?: boolean;
  /** Use light icons (e.g. Menu gradient header) */
  onBrandHeader?: boolean;
  className?: string;
};

export function MobilePageHeader({
  title,
  actions,
  showSearch = true,
  onSearchClick,
  showMore = true,
  onMoreClick,
  showThemeToggle = true,
  onBrandHeader = false,
  className,
}: MobilePageHeaderProps) {
  const iconTone = onBrandHeader
    ? "text-white/85"
    : "text-[#1F2937]/70 dark:text-white/80";
  const hoverTone = onBrandHeader
    ? "active:bg-white/10 hover:bg-white/10"
    : "active:bg-black/5 dark:active:bg-white/10 hover:bg-black/5 dark:hover:bg-white/10";

  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex items-center justify-between gap-3 px-0 pb-2 backdrop-blur-md",
        onBrandHeader
          ? "bg-transparent"
          : "bg-[#F8F9FA]/95 dark:bg-[#0d0d0d]/95",
        "pt-[calc(0.75rem+env(safe-area-inset-top,0px))]",
        className,
      )}
    >
      <h1
        className={cn(
          "text-[1.65rem] font-bold tracking-tight leading-tight truncate py-0.5",
          onBrandHeader ? "text-white" : "text-[#1F2937] dark:text-white",
        )}
      >
        {title}
      </h1>
      <div className="flex items-center gap-0.5 shrink-0">
        {actions}
        {showThemeToggle ? (
          <ThemeToggle
            className={cn("rounded-full", hoverTone)}
            iconClassName={iconTone}
          />
        ) : null}
        {showSearch ? (
          <button
            type="button"
            onClick={onSearchClick}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full",
              iconTone,
              hoverTone,
            )}
            aria-label="Search"
          >
            <Search size={22} strokeWidth={1.75} />
          </button>
        ) : null}
        {showMore ? (
          <button
            type="button"
            onClick={onMoreClick}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full",
              iconTone,
              hoverTone,
            )}
            aria-label="More"
          >
            <MoreVertical size={22} strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
    </header>
  );
}
