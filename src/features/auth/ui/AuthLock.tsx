import { useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import AppFrame from "@/features/navigation/ui/AppFrame";

// there is no sign-in in this build; this only clears sessions left by older builds
export function AuthLock({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return <AppFrame>{children}</AppFrame>;
}

export default AuthLock;
