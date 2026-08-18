import { Plus, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";

type MobileFabProps = {
  onClick: () => void;
  icon?: "plus" | "pen";
  label?: string;
  className?: string;
};

export function MobileFab({
  onClick,
  icon = "plus",
  label = "Create",
  className,
}: MobileFabProps) {
  const Icon = icon === "pen" ? PenLine : Plus;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "fixed z-30 flex h-14 w-14 items-center justify-center rounded-[1.15rem] bg-[#2A85FF] text-white shadow-lg shadow-blue-900/40 active:scale-95 transition-transform",
        "right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))]",
        className,
      )}
    >
      <Icon size={28} strokeWidth={2.25} />
    </button>
  );
}
