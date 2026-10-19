// pages are lazy-loaded from app/routes.tsx; re-exporting them here would pull
// them back into the startup bundle
export { default as AuthLock, AuthLock as AuthLockComponent } from "./ui/AuthLock";
export {
  useAuthStore,
  authErrorMessage,
  type AuthState,
  type AuthStatus,
} from "./store/authStore";
export { useProfile } from "./hooks/useProfile";
