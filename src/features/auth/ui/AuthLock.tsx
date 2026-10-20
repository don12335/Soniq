import { lazy, Suspense, useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import AppFrame from "@/features/navigation/ui/AppFrame";
import { isMobileLayout } from "@/shared/platform";
import { bootCloud } from "@/shared/account/account";

// only loaded in the phone layout (iOS shell or the soniq:layout=mobile dev override)
const MobileShell = lazy(() => import("@/mobile/MobileShell"));

// Legacy auth sessions are cleared here; the optional cloud account boots separately.
export function AuthLock({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    void initialize();
    bootCloud();
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
