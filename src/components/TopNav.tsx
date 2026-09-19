import { Link, useLocation } from "react-router-dom";
import { User } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The top navigation bar, shared across every page. Previously lived inline
 * inside the scheduling page; pulled out once a second page (Profile) needed
 * the same bar so the two don't drift apart.
 */
export default function TopNav() {
  const { pathname } = useLocation();
  const onProfile = pathname === "/profile";

  return (
    <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
      <Link to="/" className="flex items-center gap-2">
        <span className="text-lg font-semibold tracking-tight">autodate</span>
      </Link>
      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        <a href="#" className="transition hover:text-foreground">
          How it works
        </a>
        <Link
          to="/profile"
          className={cn(
            "flex items-center gap-1.5 transition hover:text-foreground",
            onProfile && "text-foreground",
          )}
        >
          <User className="h-4 w-4" />
          Profile
        </Link>
        <a href="#" className="transition hover:text-foreground">
          Sign in
        </a>
      </div>
    </nav>
  );
}
