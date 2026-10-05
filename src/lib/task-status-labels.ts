export const TASK_STATUS_KEYS = ["todo", "in_progress", "review", "done"] as const;
export type TaskStatusKey = (typeof TASK_STATUS_KEYS)[number];

export type TaskStatusLabels = Record<TaskStatusKey, string>;

const DEFAULT_TASK_STATUS_LABELS: TaskStatusLabels = {
  todo: "To Do",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
};

export function mergeTaskStatusLabels(
  partial?: Partial<TaskStatusLabels> | null,
): TaskStatusLabels {
  const labels = { ...DEFAULT_TASK_STATUS_LABELS };
  if (!partial) return labels;
  for (const key of TASK_STATUS_KEYS) {
    const value = partial[key]?.trim();
    if (value) labels[key] = value;
  }
  return labels;
}

export function assignedTaskStatusCountRows(
  counts: Record<TaskStatusKey, number>,
  labels: TaskStatusLabels = DEFAULT_TASK_STATUS_LABELS,
) {
  return TASK_STATUS_KEYS.map((status) => ({
    name: labels[status],
    value: counts[status] ?? 0,
    status,
  }));
}
