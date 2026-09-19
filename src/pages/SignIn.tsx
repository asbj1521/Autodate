import { useState, type FormEvent } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, Mail, XCircle } from "lucide-react";

import TopNav from "@/components/TopNav";
import { useAuth } from "@/context/auth";
import { supabase } from "@/lib/supabase";

/**
 * Where to go after signing in. Only a path on this site is accepted: taking
 * any URL from the query string would let a crafted link bounce someone to a
 * look-alike site straight after they log in. "//evil.com" is a full URL to a
 * browser, so it is refused along with "https://...".
 */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/profile";
}

/**
 * A failed Google sign-in comes back to this page with the reason in the URL,
 * in the query or after the #, depending on where it failed.
 */
function errorFromUrl(): string | null {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  return hash.get("error_description") ?? query.get("error_description");
}

/**
 * Sign in with Google, or by a one-time link sent to an email address.
 *
 * Both send the browser back to this page rather than straight to where the
 * person was headed. By the time they return, the Supabase client has read
 * the login out of the URL, and the redirect below forwards them on; if it
 * failed, the reason is shown here instead of being lost on a page that would
 * just bounce them back again.
 */
export default function SignIn() {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const next = safeNext(searchParams.get("next"));

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(errorFromUrl);

  if (loading) return <div className="min-h-screen bg-background" />;
  if (user) return <Navigate to={next} replace />;

  // Come back to this page, still carrying where to go afterwards.
  const returnTo = `${window.location.origin}/sign-in?next=${encodeURIComponent(next)}`;

  async function handleGoogle() {
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: returnTo },
    });
    // On success the browser is already leaving for Google.
    if (err) setError(err.message);
  }

  async function handleEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);
    setError(null);
    const address = email.trim();
    const { error: err } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: returnTo },
    });
    setSending(false);
    if (err) setError(err.message);
    else setSentTo(address);
  }

  return (
    <div className="min-h-screen bg-background">
      <TopNav />

      <main className="mx-auto max-w-sm px-6 pb-20 pt-10">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to connect your calendars and plan with your groups.
        </p>

        <div className="mt-8 rounded-2xl border bg-card p-6 shadow-sm">
          <button
            type="button"
            onClick={() => void handleGoogle()}
            className="flex w-full items-center justify-center gap-2 rounded-full border bg-background px-5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
              G
            </span>
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          {sentTo ? (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Check your inbox. We sent a sign-in link to <strong>{sentTo}</strong>. Open it in
                this browser to finish signing in.{" "}
                <button
                  type="button"
                  onClick={() => setSentTo(null)}
                  className="font-medium underline underline-offset-2"
                >
                  Use another email
                </button>
              </span>
            </div>
          ) : (
            <form onSubmit={(e) => void handleEmail(e)} className="flex flex-col gap-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-foreground">Email</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
              <button
                type="submit"
                disabled={sending}
                className="flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                {sending ? "Sending link" : "Email me a sign-in link"}
              </button>
            </form>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
