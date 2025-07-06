import { useSession } from '@/src/lib/auth-client';
import { isAdminUser, isSessionUserAdmin, getAdminStatus } from '@/src/lib/featureFlags/adminUtils';

/**
 * Hook for checking admin status
 */
export function useAdmin() {
  const { data: session } = useSession();

  const isAdmin = isSessionUserAdmin(session);
  const adminStatus = getAdminStatus(session?.user?.email);

  return {
    isAdmin,
    adminStatus,
    hasFullAccess: isAdmin,
    userEmail: session?.user?.email,
    session,
  };
}

/**
 * Hook for admin-only functionality
 * @param fallback - What to return if user is not admin
 */
export function useAdminOnly<T>(fallback?: T) {
  const { isAdmin } = useAdmin();

  return {
    isAdmin,
    ifAdmin: (fn: () => T): T | undefined => {
      return isAdmin ? fn() : fallback;
    },
    adminOnly: (value: T): T | undefined => {
      return isAdmin ? value : fallback;
    },
  };
}