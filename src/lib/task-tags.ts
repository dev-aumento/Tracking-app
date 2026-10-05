function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Tags stored on the task or inside activity metadata. */
export function extractTaskTags(task: {
  tags?: unknown;
  metadata?: unknown;
}): string[] {
  const direct = stringList(task.tags);
  if (direct.length > 0) return direct;
  const metadata = task.metadata;
  if (metadata && typeof metadata === "object" && "tags" in metadata) {
    return stringList((metadata as { tags?: unknown }).tags);
  }
  return [];
}
