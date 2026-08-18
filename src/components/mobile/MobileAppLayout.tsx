import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { AppToaster } from "@/components/ui/app-toaster";
import { TaskNotificationToasts } from "@/components/notifications/TaskNotificationToasts";
import { SidebarWidthContext } from "@/hooks/useSidebarWidth";
import { cn } from "@/lib/utils";
import { MobileBottomNav } from "./MobileBottomNav";
import { GeofenceAutoClockOut } from "@/hooks/useGeofenceAutoClockOut";

const NATIVE_CLASS = "native-app";

/** Screens that already apply safe-area via MobilePageHeader / home hero */
function usesMobilePageHeader(pathname: string) {
  if (pathname === "/" || pathname === "") return true;
  if (pathname === "/feed") return true;
  if (pathname.startsWith("/task-chats")) return true;
  if (pathname.startsWith("/m/")) return true;
  return false;
}

/** Menu + home keep edge-to-edge; everything else gets side gutters */
function isFullBleedPath(pathname: string) {
  return pathname === "/" || pathname === "" || pathname.startsWith("/m/menu");
}

function MobileSafeOutlet() {
  const { pathname } = useLocation();
  const needsTopInset = !usesMobilePageHeader(pathname);
  const sideGutter = !isFullBleedPath(pathname);
  const isHome = pathname === "/" || pathname === "";

  return (
    <div
      className={cn(
        needsTopInset && "pt-[max(0.75rem,env(safe-area-inset-top,0px))]",
        sideGutter &&
          "pl-[max(10px,env(safe-area-inset-left,0px))] pr-[max(10px,env(safe-area-inset-right,0px))]",
        // Home draws its own sheet padding so content can sit under the glass tab bar.
        !isHome && "pb-[calc(5.75rem+env(safe-area-inset-bottom))]",
      )}
    >
      <Outlet />
    </div>
  );
}

export function MobileAppLayout() {
  useEffect(() => {
    const root = document.documentElement;
    // Do not force dark — ThemeToggle / next-themes owns light vs dark
    root.classList.add(NATIVE_CLASS);
    return () => {
      root.classList.remove(NATIVE_CLASS);
    };
  }, []);

  return (
    // Zero sidebar width so detail panels / overlays use the full viewport
    <SidebarWidthContext.Provider value={0}>
      <div className="native-shell min-h-dvh bg-[#F8F9FA] text-[#1F2937] dark:bg-[#0d0d0d] dark:text-white">
        <GeofenceAutoClockOut />
        <main className="min-h-dvh pb-0">
          <MobileSafeOutlet />
        </main>
        <MobileBottomNav />
        <AppToaster />
        <TaskNotificationToasts />
      </div>
    </SidebarWidthContext.Provider>
  );
}
