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
    void queryClient.prefetchQuery(calendarStatusQuery(user.id));
  };

  return (
    <nav
      className={cn(
        "mx-auto flex items-center justify-between py-5",
        // `wide` pages run edge to edge, so the bar takes the same responsive
        // gutter as their content and its logo and links line up with what is
        // underneath. Narrow pages keep the centred, capped bar.
        wide ? "px-4 sm:px-6 lg:px-8" : "max-w-6xl px-6",
      )}
    >
      <Link to="/" className="flex items-center gap-2">
        {/* The wordmark, sized to read as a logo rather than as another nav
            link. It steps down on small screens: at 24px the name plus the
            three links is wider than a narrow phone, and the row would wrap. */}
        <span className="text-xl font-bold tracking-tight sm:text-2xl">casy</span>
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
