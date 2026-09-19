/**
 * Who is signed in, for any component that needs to know.
 *
 * The context object and its hook live apart from AuthProvider so that file
 * exports only a component, which is what React's fast refresh needs to
 * hot-reload it in place.
 */
import { createContext, useContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

export interface AuthState {
  session: Session | null;
  user: User | null;
  /**
   * True until the stored session has been read. Pages that require login
   * wait for this, or a signed-in person would be bounced to the sign-in page
   * for the split second before their session is known.
   */
  loading: boolean;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside <AuthProvider>");
  return auth;
}

/** The name to greet someone by: their Google name if we have it, else their email. */
export function displayName(user: User | null): string {
  const meta = user?.user_metadata as { full_name?: string; name?: string } | undefined;
  return meta?.full_name ?? meta?.name ?? user?.email ?? "";
}
