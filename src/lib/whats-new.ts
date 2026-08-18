export type WhatsNewItem = {
  id: string;
  title: string;
  description: string;
  tag?: "New" | "Improved" | "Mobile";
};

/** App release highlights shown in Menu → What's new */
export const WHATS_NEW_ITEMS: WhatsNewItem[] = [
  {
    id: "native-shell",
    title: "Native mobile experience",
    description:
      "Bottom navigation for Tasks, Feed, Messenger, and Menu — designed for phones, not a squeezed web layout.",
    tag: "Mobile",
  },
  {
    id: "my-all-projects",
    title: "My Tasks, All Tasks & Projects",
    description:
      "Switch between your assignments, the full task list, and projects from one place under Tasks.",
    tag: "New",
  },
  {
    id: "personal-messenger",
    title: "Your task chats only",
    description:
      "Messenger shows comment conversations related to you — assignee, participant, or mentions.",
    tag: "Improved",
  },
  {
    id: "comment-feed",
    title: "Feed of recent comments",
    description:
      "Collaboration Feed highlights the latest task comments so you can catch up quickly.",
    tag: "New",
  },
  {
    id: "full-width-details",
    title: "Full-screen task details",
    description:
      "Opening a task fills the screen on mobile instead of a narrow side panel.",
    tag: "Improved",
  },
  {
    id: "menu-clock",
    title: "Clock in from Menu",
    description:
      "Start, pause, and clock out from the Menu hub, plus quick links to Leaves, Settings, and more.",
    tag: "Mobile",
  },
];

export const WHATS_NEW_STORAGE_KEY = "tracker-whats-new-seen-v1";

export function hasUnseenWhatsNew(): boolean {
  try {
    return localStorage.getItem(WHATS_NEW_STORAGE_KEY) !== "1";
  } catch {
    return true;
  }
}

export function markWhatsNewSeen(): void {
  try {
    localStorage.setItem(WHATS_NEW_STORAGE_KEY, "1");
  } catch {
    // ignore
  }
}
