import { Link } from "react-router-dom";

/**
 * The bottom of every page. Its one job for now is the privacy link, which
 * has to be reachable from the home page for Google's consent screen.
 */
export default function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-sm text-muted-foreground">
        <span>Casy</span>
        <Link to="/privacy" className="transition hover:text-foreground">
          Privacy
        </Link>
      </div>
    </footer>
  );
}
