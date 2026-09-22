import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, CalendarDays, CalendarSearch, User } from "lucide-react";

import { adminStatusQuery } from "@/api/admin";
import { calendarStatusQuery } from "@/api/calendarStatus";
import { eventsQuery, needsYourAnswer } from "@/api/events";
import { groupsQuery } from "@/api/groups";
import { useAuth } from "@/context/auth";
import { cn } from "@/lib/utils";

/**
 * The top navigation bar, shared across every page. Previously lived inline
 * inside the scheduling page; pulled out once a second page (Profile) needed
 * the same bar so the two don't drift apart.
 */
export default function TopNav() {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user, loading, signOut } = useAuth();
  const onHome = pathname === "/";
  const onProfile = pathname === "/profile";
  const onEvents = pathname === "/events";
  const onCalendarOverview = pathname === "/calendar-overview";

  // How many suggested events are waiting for your answer: the badge on My
  // events is how people find out something was suggested to them.
  const { data: events } = useQuery({ ...eventsQuery(user?.id ?? ""), enabled: !!user });
  const pendingCount = events?.filter(needsYourAnswer).length ?? 0;

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  /**
   * Warm both halves of the profile page as soon as someone shows intent to go
   * there: its code chunk, and the three answers it opens by asking for
   * (calendar status, groups, and whether this person is an admin).
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
    void queryClient.prefetchQuery(groupsQuery(user.id));
    void queryClient.prefetchQuery(adminStatusQuery(user.id));
  };

  const prefetchEvents = () => {
    if (onEvents || !user) return;
    void import("@/pages/MyEvents");
  };

  const prefetchCalendarOverview = () => {
    if (onCalendarOverview || !user) return;
    void import("@/pages/CalendarOverview");
  };

  return (
    // Edge to edge on every page, with the same responsive gutter as the
    // full-width pages' content, so the logo and links sit in the same place
    // wherever you are. (There used to be a narrower, centred variant; on a
    // wide screen it pulled both ends inward and the bar jumped between pages.)
    <nav className="flex items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
      <Link to="/" className="flex items-center gap-2">
        {/* The wordmark, sized to read as a logo rather than as another nav
            link. It steps down on small screens: at 24px the name plus the
            links is wider than a narrow phone, and the row would wrap. */}
        <span className="text-xl font-bold tracking-tight sm:text-2xl">casy</span>
      </Link>
      <div className="flex items-center gap-5 text-sm text-muted-foreground sm:gap-6">
        {/* The logo also goes home, but that isn't obvious from Profile or My
            events, so it gets its own labelled link like the others. */}
        <Link
          to="/"
          className={cn(
            "flex items-center gap-1.5 transition hover:text-foreground",
            onHome && "text-foreground",
          )}
        >
          <CalendarSearch className="h-4 w-4" />
          Scheduler
        </Link>
        <Link
          to="/events"
          onMouseEnter={prefetchEvents}
          onFocus={prefetchEvents}
          onTouchStart={prefetchEvents}
          className={cn(
            "flex items-center gap-1.5 transition hover:text-foreground",
            onEvents && "text-foreground",
          )}
        >
          <CalendarCheck className="h-4 w-4" />
          My events
          {pendingCount > 0 && (
            <span
              aria-label={`${pendingCount} waiting for your answer`}
              className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground"
            >
              {pendingCount}
            </span>
          )}
        </Link>
        <Link
          to="/calendar-overview"
          onMouseEnter={prefetchCalendarOverview}
          onFocus={prefetchCalendarOverview}
          onTouchStart={prefetchCalendarOverview}
          className={cn(
            "flex items-center gap-1.5 transition hover:text-foreground",
            onCalendarOverview && "text-foreground",
          )}
        >
          <CalendarDays className="h-4 w-4" />
          My calendar
        </Link>
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
