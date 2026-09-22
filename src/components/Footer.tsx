import { Link } from "react-router-dom";

import { useT } from "@/i18n/lang";

/**
 * The bottom of every page: how Casy works, and the privacy link, which has
 * to be reachable from the home page for Google's consent screen.
 */
export default function Footer() {
  const t = useT();
  return (
    <footer className="border-t bg-background">
      {/* The same edge-to-edge gutter as the nav, so both ends line up with it. */}
      <div className="flex items-center justify-between px-4 py-6 text-sm text-muted-foreground sm:px-6 lg:px-8">
        <span>Casy</span>
        <div className="flex items-center gap-5">
          <Link to="/how-it-works" className="transition hover:text-foreground">
            {t.footer.howItWorks}
          </Link>
          <Link to="/privacy" className="transition hover:text-foreground">
            {t.footer.privacy}
          </Link>
        </div>
      </div>
    </footer>
  );
}
