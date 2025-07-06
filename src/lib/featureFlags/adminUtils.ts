// Admin utility functions for feature flags

// Admin email addresses with full access
export const ADMIN_EMAILS = [
  'nicom.19@icloud.com',
  'nicola.mattioli.95@gmail.com'
];

/**
 * Check if a user email is in the admin list
 * @param userEmail - The user's email address
 * @returns true if user is admin, false otherwise
 */
export function isAdminUser(userEmail?: string | null): boolean {
  if (!userEmail) return false;
  return ADMIN_EMAILS.includes(userEmail.toLowerCase());
}

/**
 * Check if current session user is admin
 * @param session - NextAuth session object
 * @returns true if session user is admin, false otherwise
 */
export function isSessionUserAdmin(session?: any): boolean {
  return isAdminUser(session?.user?.email);
}

/**
 * Get admin status with metadata
 * @param userEmail - The user's email address
 * @returns object with admin status and metadata
 */
export function getAdminStatus(userEmail?: string | null) {
  const isAdmin = isAdminUser(userEmail);
  return {
    isAdmin,
    userEmail,
    hasFullAccess: isAdmin,
    metadata: isAdmin ? {
      reason: 'Admin user with full access to all features',
      adminEmails: ADMIN_EMAILS,
    } : null
  };
}

/**
 * Admin-only function wrapper
 * @param userEmail - The user's email address
 * @param fn - Function to execute if user is admin
 * @param fallback - Fallback value if user is not admin
 */
export function adminOnly<T>(
  userEmail: string | null | undefined,
  fn: () => T,
  fallback?: T
): T | undefined {
  if (isAdminUser(userEmail)) {
    return fn();
  }
  return fallback;
}