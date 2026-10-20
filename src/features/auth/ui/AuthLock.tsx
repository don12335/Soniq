import { lazy, Suspense, useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import AppFrame from "@/features/navigation/ui/AppFrame";
import { isMobileLayout } from "@/shared/platform";

// only loaded in the phone layout (iOS shell or the soniq:layout=mobile dev override)
const MobileShell = lazy(() => import("@/mobile/MobileShell"));

// there is no sign-in in this build; this only clears sessions left by older builds
export function AuthLock({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  if (isMobileLayout()) {
    // the mobile shell has its own routes (search and settings are pages there)
    return (
      <Suspense fallback={null}>
        <MobileShell />
      </Suspense>
    );
  }

  return <AppFrame>{children}</AppFrame>;
}

export default AuthLock;
