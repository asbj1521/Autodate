import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { User } from "lucide-react";

import { calendarStatusQuery } from "@/api/calendarStatus";
import { useAuth } from "@/context/auth";
import { cn } from "@/lib/utils";

/**
 * The top navigation bar, shared across every page. Previously lived inline
 * inside the scheduling page; pulled out once a second page (Profile) needed
 * the same bar so the two don't drift apart.
 */
export default function TopNav({ wide = false }: { wide?: boolean }) {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user, loading, signOut } = useAuth();
  const onProfile = pathname === "/profile";

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  /**
   * Warm both halves of the profile page as soon as someone shows intent to go
   * there: its code chunk, and the calendar status it opens by asking for.
   * Supabase takes roughly a third of a second to answer, and a pointer
   * resting on a link is usually good for about that long, so the page tends
   * to have what it needs by the time it mounts. Hovering without clicking
   * costs one cheap read, and React Query dedupes it against the page's own
   * request. The import specifier matches the one App.tsx lazy-loads, so this
   * fetches that exact chunk rather than a second copy.
   */
  const prefetchProfile = () => {
    // Signed out, the link leads to the sign-in page, so there's nothing to warm.
    if (onProfile || !user) return;
    void import("@/pages/Profile");
    void queryClient.prefetchQuery(calendarStatusQuery());
  };

  return (
    <nav
      className={cn(
        "mx-auto flex items-center justify-between px-6 py-5",
        // `wide` pages use the full screen; keep the bar's edges in step with theirs.
        wide ? "lg:px-10" : "max-w-6xl",
      )}
    >
      <Link to="/" className="flex items-center gap-2">
        <span className="text-lg font-semibold tracking-tight">autodate</span>
      </Link>
      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        <a href="#" className="transition hover:text-foreground">
          How it works
        </a>
        <Link
          to="/profile"
          onMouseEnter={prefetchProfile}
          onFocus={prefetchProfile}
          onTouchStart={prefetchProfile}
          className={cn(
            "flex items-center gap-1.5 transition hover:text-foreground",
            onProfile && "text-foreground",
          )}
        >
          <User className="h-4 w-4" />
          Profile
        </Link>
        {/* Nothing until the session is known, so it never flickers from
            "Sign in" to "Sign out" on load. */}
        {!loading &&
          (user ? (
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="transition hover:text-foreground"
            >
              Sign out
            </button>
          ) : (
            <Link
              to="/sign-in"
              className={cn(
                "transition hover:text-foreground",
                pathname === "/sign-in" && "text-foreground",
              )}
            >
              Sign in
            </Link>
          ))}
      </div>
    </nav>
  );
}
