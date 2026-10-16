import { HALF_DAY_PERIOD_OPTIONS, type HalfDayPeriod } from "@/lib/leave-policy";
import { cn } from "@/lib/utils";

export function HalfDayPeriodField({
  value,
  onChange,
  variant = "solid",
}: {
  value: HalfDayPeriod | "";
  onChange: (next: HalfDayPeriod) => void;
  variant?: "solid" | "soft" | "pill";
}) {
  const labelClass =
    variant === "solid"
      ? "block text-sm font-medium text-gray-700 mb-1.5"
      : variant === "pill"
        ? "text-xs font-medium text-gray-500"
        : "block text-xs text-gray-400 mb-1.5";

  return (
    <div className={variant === "pill" ? "space-y-1.5" : "mt-3"}>
      <label className={labelClass}>Half of the day</label>
      <div className="flex flex-wrap gap-2">
        {HALF_DAY_PERIOD_OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "font-medium border transition-colors",
                variant === "solid" && "h-9 px-3 rounded-lg text-sm",
                variant === "soft" && "h-8 px-2.5 rounded-lg text-xs",
                variant === "pill" && "h-9 px-3 rounded-full text-xs font-semibold",
                selected
                  ? variant === "solid"
                    ? "bg-[#2563EB] text-white border-[#2563EB]"
                    : variant === "pill"
                      ? "bg-[#2563EB] border-[#2563EB] text-white"
                      : "border-[#2563EB] bg-blue-50 text-[#2563EB]"
                  : variant === "pill"
                    ? "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
