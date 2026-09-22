import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarCheck,
  CalendarDays,
  CalendarSearch,
  LogIn,
  User,
  type LucideIcon,
} from "lucide-react";

import { adminStatusQuery } from "@/api/admin";
import { calendarStatusQuery } from "@/api/calendarStatus";
import { eventsQuery, needsYourAnswer } from "@/api/events";
import { groupsQuery } from "@/api/groups";
import LanguageToggle from "@/components/LanguageToggle";
import { useAuth } from "@/context/auth";
import { useT } from "@/i18n/lang";
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
  const t = useT();
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

  // Signed out, the profile tab can only lead to the sign-in page, so it says
  // "Sign in" and is the one sign-in link in the bar.
  const signedOut = !loading && !user;

  const tabs: Tab[] = [
    // The logo also goes home, but that isn't obvious from Profile or My
    // events, so it gets its own labelled link like the others.
    { to: "/", label: t.nav.scheduler, short: t.nav.schedulerShort, icon: CalendarSearch, active: onHome },
    {
      to: "/events",
      label: t.nav.events,
      short: t.nav.eventsShort,
      icon: CalendarCheck,
      active: onEvents,
      prefetch: prefetchEvents,
      badge: pendingCount,
    },
    {
      to: "/calendar-overview",
      label: t.nav.calendar,
      short: t.nav.calendarShort,
      icon: CalendarDays,
      active: onCalendarOverview,
      prefetch: prefetchCalendarOverview,
    },
    signedOut
      ? {
          // Through /profile, so signing in lands you on your profile.
          to: "/profile",
          label: t.nav.signIn,
          short: t.nav.signIn,
          icon: LogIn,
          active: pathname === "/sign-in",
        }
      : {
          to: "/profile",
          label: t.nav.profile,
          short: t.nav.profileShort,
          icon: User,
          active: onProfile,
          prefetch: prefetchProfile,
        },
  ];

  return (
    // Edge to edge on every page, with the same responsive gutter as the
    // full-width pages' content, so the logo and links sit in the same place
    // wherever you are.
    <nav className="flex items-center justify-between gap-2 px-4 py-3 sm:gap-3 sm:px-6 sm:py-5 lg:px-8">
      <div className="flex items-center gap-2 sm:gap-3">
        <Link to="/" className="flex items-center">
          <span className="text-xl font-bold tracking-tight sm:text-2xl">casy</span>
        </Link>
        <LanguageToggle />
      </div>
      {/* On a phone each link is an icon over a one-word label, which is the
          only way four of them fit beside the logo on a 360px screen. */}
      <div className="flex items-center gap-0.5 text-muted-foreground sm:gap-6 sm:text-sm">
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            onMouseEnter={tab.prefetch}
            onFocus={tab.prefetch}
            onTouchStart={tab.prefetch}
            aria-current={tab.active ? "page" : undefined}
            className={cn(
              "flex min-w-12 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[11px] max-[359px]:min-w-0 max-[359px]:px-0.5 max-[359px]:text-[10px] font-medium transition hover:text-foreground sm:min-w-0 sm:flex-row sm:gap-1.5 sm:p-0 sm:text-sm sm:font-normal",
              tab.active && "text-primary sm:text-foreground",
            )}
          >
            <span className="relative">
              <tab.icon className="h-5 w-5 sm:h-4 sm:w-4" />
              {!!tab.badge && (
                <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground sm:hidden">
                  {tab.badge}
                </span>
              )}
            </span>
            <span className="whitespace-nowrap sm:hidden">{tab.short}</span>
            <span className="hidden sm:inline">{tab.label}</span>
            {!!tab.badge && (
              <span
                aria-label={t.nav.waitingForAnswer(tab.badge)}
                className="hidden h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground sm:flex"
              >
                {tab.badge}
              </span>
            )}
          </Link>
        ))}
        {/* On a phone, signing out lives on the profile page instead. */}
        {user && (
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="hidden transition hover:text-foreground sm:block"
          >
            {t.nav.signOut}
          </button>
        )}
      </div>
    </nav>
  );
}

interface Tab {
  to: string;
  label: string;
  /** The one-word label under the icon on a phone. */
  short: string;
  icon: LucideIcon;
  active: boolean;
  prefetch?: () => void;
  badge?: number;
}
