function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rewrite a notification so the signed-in viewer is "you" instead of their own name.
 */
export function personalizeNotificationCopy<T extends { title?: string | null; message?: string | null }>(
  notification: T,
  viewer: { name?: string | null; email?: string | null } | null | undefined,
): T {
  const name = viewer?.name?.trim();
  if (!name || name.length < 2) return notification;
  const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi");
  const rewrite = (text: string | null | undefined) =>
    typeof text === "string" ? text.replace(pattern, "you") : text;
  return {
    ...notification,
    title: rewrite(notification.title),
    message: rewrite(notification.message),
  };
}
