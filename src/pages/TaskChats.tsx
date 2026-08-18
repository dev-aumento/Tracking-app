import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { TaskChatsList } from "@/components/tasks/TaskChatsList";
import { TaskDetailPanel } from "@/components/tasks/TaskDetailPanel";
import { useTaskChats } from "@/hooks/useTaskChats";
import { parseActivityIdParam } from "@/lib/task-notification-link";
import { markTaskNotificationsReadInCache } from "@/lib/notification-list-cache";
import { isNativeApp } from "@/lib/platform";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { formatTimeAgo, cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";

export default function TaskChats() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { taskChats, taskChatsCount, isLoading } = useTaskChats();
  const [selectedTask, setSelectedTask] = useState<number | null>(null);
  const native = isNativeApp();

  const utils = trpc.useUtils();
  const markAllReadMutation = trpc.notification.markAllRead.useMutation({
    onSuccess: () => {
      void utils.notification.list.invalidate();
    },
  });

  const markTaskReadMutation = trpc.notification.markReadForTask.useMutation({
    onMutate: ({ taskId }) => {
      markTaskNotificationsReadInCache(utils, taskId);
    },
    onSettled: () => {
      void utils.notification.list.invalidate();
    },
  });

  const markTaskAsRead = (taskId: number) => {
    markTaskReadMutation.mutate({ taskId });
  };

  const openTask = (id: number) => {
    markTaskAsRead(id);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("task", String(id));
      return next;
    });
  };

  const closeTask = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("task");
      next.delete("activity");
      return next;
    });
  };

  const clearActivityHighlight = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("activity");
      return next;
    }, { replace: true });
  };

  const highlightActivityId = useMemo(
    () => parseActivityIdParam(searchParams.get("activity")),
    [searchParams],
  );

  useEffect(() => {
    const taskParam = searchParams.get("task");
    setSelectedTask(taskParam ? Number(taskParam) : null);
  }, [searchParams]);

  if (native) {
    return (
      <div className="min-h-full">
        <MobilePageHeader
          title="Messenger"
          showSearch
          showMore={false}
          actions={
            taskChatsCount > 0 ? (
              <button
                type="button"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="mr-1 text-xs font-medium text-[#2A85FF] disabled:opacity-50"
              >
                Read all
              </button>
            ) : null
          }
        />

        <p className="pb-2 text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-white/40">
          Your chats
        </p>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-gray-400 dark:text-white/40" size={28} />
          </div>
        ) : taskChats.length === 0 ? (
          <div className="py-16 text-center">
            <MessageSquare size={36} className="mx-auto mb-2 text-gray-300 dark:text-white/25" />
            <p className="text-sm text-gray-500 dark:text-white/45">No task conversations yet</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-white/[0.08]">
            {taskChats.map((chat) => (
              <li key={chat.taskId}>
                <button
                  type="button"
                  onClick={() => openTask(chat.taskId)}
                  className="flex w-full items-start gap-3 py-3.5 text-left active:bg-black/[0.03] dark:active:bg-white/[0.04]"
                >
                  {chat.assignee ? (
                    <UserAvatar
                      name={chat.assignee.name}
                      avatar={chat.assignee.avatar}
                      size={44}
                    />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2A85FF]/25 text-sm font-bold text-[#1F2937] dark:text-white">
                      {(chat.title || "?").slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "truncate text-[15px]",
                          chat.unread
                            ? "font-semibold text-[#1F2937] dark:text-white"
                            : "font-medium text-gray-700 dark:text-white/85",
                        )}
                      >
                        {chat.title}
                      </span>
                      <span className="shrink-0 text-xs text-gray-400 dark:text-white/40">
                        {formatTimeAgo(chat.lastAt)}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "mt-0.5 truncate text-sm",
                        chat.unread
                          ? "text-gray-600 dark:text-white/70"
                          : "text-gray-500 dark:text-white/45",
                      )}
                    >
                      {chat.lastMessage}
                    </p>
                  </div>
                  {chat.unread ? (
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#2A85FF]" />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}

        <AnimatePresence>
          {selectedTask && (
            <TaskDetailPanel
              taskId={selectedTask}
              highlightActivityId={highlightActivityId}
              onHighlightDone={clearActivityHighlight}
              onClose={closeTask}
              onTaskOpen={openTask}
            />
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-5"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937]">Task Chats</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Recent conversations across your tasks
          </p>
        </div>

        {taskChatsCount > 0 && (
          <button
            type="button"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
            className="h-9 px-3 text-sm font-medium text-[#2563EB] hover:bg-blue-50 rounded-xl border border-transparent hover:border-blue-100 transition-colors flex items-center gap-1.5 disabled:opacity-50 shrink-0"
          >
            {markAllReadMutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Mark all as read
          </button>
        )}
      </div>

      <TaskChatsList
        chats={taskChats}
        isLoading={isLoading}
        onTaskClick={openTask}
        onMarkAsRead={markTaskAsRead}
      />

      <AnimatePresence>
        {selectedTask && (
          <TaskDetailPanel
            taskId={selectedTask}
            highlightActivityId={highlightActivityId}
            onHighlightDone={clearActivityHighlight}
            onClose={closeTask}
            onTaskOpen={openTask}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
