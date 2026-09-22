import { useState, type FormEvent } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, KeyRound, Loader2, Mail, XCircle } from "lucide-react";

import PasswordForm from "@/components/PasswordForm";
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
 * Sign in with Google, a one-time email link, or an email + password —
 * either an existing one or a fresh account created with one.
 *
 * All of these send the browser back to this page rather than straight to
 * where the person was headed. By the time they return, the Supabase client
 * has read the login out of the URL, and the redirect below forwards them
 * on; if it failed, the reason is shown here instead of being lost on a page
 * that would just bounce them back again.
 *
 * A password-reset link also lands here. It signs the browser in the same
 * way, but `passwordRecovery` (from a Supabase `PASSWORD_RECOVERY` event)
 * says to show a "choose a new password" form instead of forwarding them on
 * — checked before the ordinary `user` redirect below, since a recovery
 * session already has a signed-in user.
 */
export default function SignIn() {
  const { user, loading, passwordRecovery, clearPasswordRecovery } = useAuth();
  const [searchParams] = useSearchParams();
  const next = safeNext(searchParams.get("next"));

  const [mode, setMode] = useState<"link" | "password">("password");
  // A "Sign up" link elsewhere (e.g. the example-group nudge) can land here
  // with ?signup=1 to open straight on the create-account tab.
  const [passwordTab, setPasswordTab] = useState<"signin" | "signup">(
    searchParams.get("signup") ? "signup" : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(errorFromUrl);

  const [forgotSending, setForgotSending] = useState(false);
  const [forgotSentTo, setForgotSentTo] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const [signupSubmitting, setSignupSubmitting] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);

  const [recoverySubmitting, setRecoverySubmitting] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  if (loading) return <div className="min-h-screen bg-background" />;

  // Come back to this page, still carrying where to go afterwards.
  const returnTo = `${window.location.origin}/sign-in?next=${encodeURIComponent(next)}`;

  async function handleNewPassword(newPassword: string) {
    setRecoverySubmitting(true);
    setRecoveryError(null);
    const { error: err } = await supabase.auth.updateUser({ password: newPassword });
    setRecoverySubmitting(false);
    if (err) setRecoveryError(err.message);
    else clearPasswordRecovery();
  }

  if (passwordRecovery) {
    return (
      <div className="min-h-screen bg-background">
        <TopNav />
        <main className="mx-auto max-w-sm px-4 pb-16 pt-6 sm:px-6 sm:pb-20 sm:pt-10">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Choose a new password
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You can sign in with this the next time, instead of an email link.
          </p>
          <div className="mt-6 rounded-2xl border bg-card p-5 shadow-sm sm:mt-8 sm:p-6">
            <PasswordForm
              submitting={recoverySubmitting}
              error={recoveryError}
              submitLabel="Save password"
              submittingLabel="Saving"
              onSubmit={(pw) => void handleNewPassword(pw)}
            />
          </div>
        </main>
      </div>
    );
  }

  if (user) return <Navigate to={next} replace />;

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

  async function handlePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSending(false);
    // On success the auth state change above redirects via `user`.
    if (err) setError(err.message);
  }

  async function handleSignUp(newPassword: string) {
    setSignupSubmitting(true);
    setSignupError(null);
    const { error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password: newPassword,
      options: { emailRedirectTo: returnTo },
    });
    setSignupSubmitting(false);
    // On success the auth state change above redirects via `user`: email
    // confirmations are off, so a new account signs itself in right away.
    // An email that already has a Google or email-link account fails here
    // instead, since manual account linking is off — the message says to
    // sign in the way they already do and add a password from their
    // profile, rather than silently creating a second, disconnected account.
    if (err) setSignupError(err.message);
  }

  async function handleForgotPassword() {
    const address = email.trim();
    if (!address) {
      setForgotError("Enter your email above first.");
      return;
    }
    setForgotSending(true);
    setForgotError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: returnTo,
    });
    setForgotSending(false);
    if (err) setForgotError(err.message);
    else setForgotSentTo(address);
  }

  function switchMode(next: "link" | "password") {
    setMode(next);
    setPasswordTab("signin");
    setError(null);
    setSentTo(null);
    setForgotSentTo(null);
    setForgotError(null);
    setSignupError(null);
  }

  function switchPasswordTab(next: "signin" | "signup") {
    setPasswordTab(next);
    setError(null);
    setForgotSentTo(null);
    setForgotError(null);
    setSignupError(null);
  }

  return (
    <div className="min-h-screen bg-background">
      <TopNav />

      <main className="mx-auto max-w-sm px-4 pb-16 pt-6 sm:px-6 sm:pb-20 sm:pt-10">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to connect your calendars and plan with your groups.
        </p>

        <div className="mt-6 rounded-2xl border bg-card p-5 shadow-sm sm:mt-8 sm:p-6">
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

          {mode === "link" ? (
            sentTo ? (
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
            )
          ) : (
            <>
              {/* Sign in with an existing password, or create an account with
                  a new one. Signing up with an email that already has a
                  Google or email-link account fails (manual linking is off),
                  and the error says to sign in that way and add a password
                  from the profile page instead of ending up with a second,
                  disconnected account. */}
              <div className="mb-4 flex gap-1 rounded-full bg-secondary p-1 text-sm font-semibold">
                <button
                  type="button"
                  onClick={() => switchPasswordTab("signin")}
                  className={`flex-1 rounded-full py-1.5 transition ${
                    passwordTab === "signin"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => switchPasswordTab("signup")}
                  className={`flex-1 rounded-full py-1.5 transition ${
                    passwordTab === "signup"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Create account
                </button>
              </div>

              {passwordTab === "signin" ? (
                forgotSentTo ? (
                  <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Check your inbox. We sent a password reset link to{" "}
                      <strong>{forgotSentTo}</strong>.{" "}
                      <button
                        type="button"
                        onClick={() => setForgotSentTo(null)}
                        className="font-medium underline underline-offset-2"
                      >
                        Try again
                      </button>
                    </span>
                  </div>
                ) : (
                  <form onSubmit={(e) => void handlePassword(e)} className="flex flex-col gap-3">
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
                    <label className="text-sm">
                      <span className="mb-1 block font-medium text-foreground">Password</span>
                      <input
                        type="password"
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
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
                        <KeyRound className="h-4 w-4" />
                      )}
                      {sending ? "Signing in" : "Sign in"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleForgotPassword()}
                      disabled={forgotSending}
                      className="self-start text-xs text-muted-foreground underline underline-offset-2 transition hover:text-foreground disabled:opacity-60"
                    >
                      {forgotSending ? "Sending reset link" : "Forgot password?"}
                    </button>
                    {forgotError && (
                      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{forgotError}</span>
                      </div>
                    )}
                  </form>
                )
              ) : (
                <div className="flex flex-col gap-3">
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
                  <PasswordForm
                    submitting={signupSubmitting}
                    error={signupError}
                    submitLabel="Create account"
                    submittingLabel="Creating account"
                    passwordLabel="Password"
                    onSubmit={(pw) => void handleSignUp(pw)}
                  />
                </div>
              )}
            </>
          )}

          <button
            type="button"
            onClick={() => switchMode(mode === "link" ? "password" : "link")}
            className="mt-4 text-xs text-muted-foreground underline underline-offset-2 transition hover:text-foreground"
          >
            {mode === "link" ? "Use a password instead" : "Use an email link instead"}
          </button>

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
