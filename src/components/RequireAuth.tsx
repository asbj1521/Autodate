import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "@/context/auth";

/**
 * Only render `children` for a signed-in person; send anyone else to the
 * sign-in page, remembering where they were headed so they land back there.
 *
 * This is a convenience, not the security boundary: the page's code is public
 * either way. What actually protects the data is the Edge Functions checking
 * the login on every request.
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Same plain background the lazy pages use while loading.
  if (loading) return <div className="min-h-screen bg-background" />;

  if (!user) {
    const next = location.pathname + location.search;
    return <Navigate to={`/sign-in?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children}</>;
}
