import { useEffect } from "react";
import { useNavigate } from "react-router";
import { Sparkles } from "lucide-react";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import {
  WHATS_NEW_ITEMS,
  markWhatsNewSeen,
  type WhatsNewItem,
} from "@/lib/whats-new";
import { cn } from "@/lib/utils";

function tagClass(tag?: WhatsNewItem["tag"]) {
  switch (tag) {
    case "New":
      return "bg-[#2A85FF]/15 text-[#2563EB] dark:bg-[#2A85FF]/20 dark:text-[#7eb6ff]";
    case "Improved":
      return "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
    case "Mobile":
      return "bg-violet-500/10 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300";
    default:
      return "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-white/60";
  }
}

export default function MobileWhatsNew() {
  const navigate = useNavigate();

  useEffect(() => {
    markWhatsNewSeen();
  }, []);

  return (
    <div className="min-h-full pb-8">
      <MobilePageHeader
        title="What's new"
        showSearch={false}
        showMore={false}
        actions={
          <button
            type="button"
            onClick={() => navigate("/m/menu")}
            className="mr-1 text-sm font-medium text-[#2A85FF]"
          >
            Back
          </button>
        }
      />

      <div className="pt-1 pb-4">
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-gray-200 dark:border-white/8 bg-white dark:bg-[#1a1a1a] px-3.5 py-3.5">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2A85FF]/15 text-[#2A85FF]">
            <Sparkles size={18} />
          </span>
          <div>
            <p className="text-[15px] font-semibold text-[#1F2937] dark:text-white">
              Tracker mobile updates
            </p>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-white/50">
              Recent improvements so the app feels native on your phone.
            </p>
          </div>
        </div>

        <ul className="space-y-2.5">
          {WHATS_NEW_ITEMS.map((item) => (
            <li
              key={item.id}
              className="rounded-2xl border border-gray-200 dark:border-white/8 bg-white dark:bg-[#1a1a1a] px-3.5 py-3.5"
            >
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                {item.tag ? (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      tagClass(item.tag),
                    )}
                  >
                    {item.tag}
                  </span>
                ) : null}
                <h2 className="text-[15px] font-semibold text-[#1F2937] dark:text-white">
                  {item.title}
                </h2>
              </div>
              <p className="text-sm leading-relaxed text-gray-500 dark:text-white/55">
                {item.description}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
