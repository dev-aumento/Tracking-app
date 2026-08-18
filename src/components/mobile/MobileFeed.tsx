import { useMemo } from "react";
import { useNavigate } from "react-router";
import { Loader2, MessageSquare } from "lucide-react";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { MobileFab } from "@/components/mobile/MobileFab";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { notificationListQueryOptions } from "@/hooks/useNotificationStream";
import { buildTaskNotificationLink } from "@/lib/task-notification-link";
import { formatTimeAgo, cn } from "@/lib/utils";
import { markNotificationReadInCache } from "@/lib/notification-list-cache";

type CommentNotif = {
  id: number;
  title: string;
  message: string;
  read: boolean | null;
  createdAt: Date | string;
  type?: string;
  taskId?: number | null;
  activityId?: number | null;
  link?: string | null;
};

function isCommentNotification(n: CommentNotif) {
  return String(n.type ?? "") === "mention" && Boolean(n.taskId || n.link);
}

export function MobileFeed() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.notification.list.useQuery(
    { unreadOnly: false, limit: 100 },
    { enabled: !!user, ...notificationListQueryOptions },
  );

  const markReadMutation = trpc.notification.markRead.useMutation({
    onMutate: ({ id }) => {
      markNotificationReadInCache(utils, id);
    },
    onSettled: () => {
      void utils.notification.list.invalidate();
    },
  });

  const comments = useMemo(() => {
    const list = (data?.notifications ?? []) as CommentNotif[];
    return list
      .filter(isCommentNotification)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [data?.notifications]);

  const openComment = (n: CommentNotif) => {
    if (!n.read) markReadMutation.mutate({ id: n.id });
    const target =
      n.link?.includes("activity=")
        ? n.link
        : n.taskId
          ? buildTaskNotificationLink(n.taskId, n.activityId)
          : n.link;
    if (target) navigate(target);
  };

  return (
    <div className="min-h-full">
      <MobilePageHeader title="Comments" showMore />

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-gray-400 dark:text-white/40" size={28} />
        </div>
      ) : comments.length === 0 ? (
        <div className="py-16 text-center">
          <MessageSquare size={36} className="mx-auto mb-2 text-gray-300 dark:text-white/25" />
          <p className="text-sm text-gray-500 dark:text-white/45">No recent task comments</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-white/[0.08] px-0 pb-6">
          {comments.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => openComment(n)}
                className="flex w-full items-start gap-3 py-3.5 text-left active:bg-black/[0.03] dark:active:bg-white/[0.04]"
              >
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2A85FF]/15 text-[#2A85FF]">
                  <MessageSquare size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={cn(
                        "text-[14px] leading-snug",
                        n.read
                          ? "font-medium text-gray-700 dark:text-white/85"
                          : "font-semibold text-[#1F2937] dark:text-white",
                      )}
                    >
                      {n.title || "New comment on task"}
                    </p>
                    <span className="shrink-0 text-[11px] text-gray-400 dark:text-white/40 pt-0.5">
                      {formatTimeAgo(n.createdAt)}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "mt-1 text-sm line-clamp-3",
                      n.read
                        ? "text-gray-500 dark:text-white/45"
                        : "text-gray-600 dark:text-white/70",
                    )}
                  >
                    {n.message}
                  </p>
                  {!n.read ? (
                    <span className="mt-2 inline-block h-1.5 w-1.5 rounded-full bg-[#2A85FF]" />
                  ) : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <MobileFab icon="pen" label="Quick actions" onClick={() => navigate("/m/menu")} />
    </div>
  );
}
