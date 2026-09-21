import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";

import { AuthContext, type AuthState } from "@/context/auth";
import { clearPersistedQueries } from "@/lib/queryPersistence";
import { supabase } from "@/lib/supabase";

/**
 * Holds the current session and keeps it in step with Supabase.
 *
 * `onAuthStateChange` fires once straight away with whatever session is
 * stored (or none), and again on every sign-in, sign-out and token refresh,
 * so it is the only thing that ever writes the session here. It also covers
 * the return from Google or an email link: the client reads the login out of
 * the URL on startup and reports it through the same event.
 */
export default function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setLoading(false);
      // Cached answers belong to whoever asked for them. Dropping them on
      // sign-out means the next person on this browser never sees them.
      // The copies remembered on the device go with them.
      if (event === "SIGNED_OUT") {
        queryClient.clear();
        clearPersistedQueries();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
