import { useId, useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Lock, XCircle } from "lucide-react";

import InfoTip from "@/components/InfoTip";

/**
 * Apple's sign-in form. iCloud has no consent-screen flow for calendars, so
 * connecting means an app-specific password rather than an OAuth redirect.
 *
 * Like the ICS form, it owns its fields: the page only needs to hear that the
 * form was submitted. The submitting/error state comes from the page, since it
 * belongs to the request rather than the form.
 */
export default function AppleCredentialsForm({
  open,
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  submitting: boolean;
  error: string | null;
  onSubmit: (email: string, password: string) => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const emailId = useId();
  const passwordId = useId();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit(email, password);
  }

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.form
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          onSubmit={handleSubmit}
          className="overflow-hidden"
        >
          <div className="mt-4 flex flex-col gap-3 border-t pt-4">
            <div className="text-sm">
              <label htmlFor={emailId} className="mb-1 block font-medium text-foreground">
                Apple ID email
              </label>
              <input
                id={emailId}
                type="email"
                required
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@icloud.com"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="text-sm">
              {/* The (i) sits beside the label, not inside it: a button inside a
                  <label> would take over the label from its input. */}
              <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                <Lock className="h-3.5 w-3.5" />
                <label htmlFor={passwordId}>App-specific password</label>
                <InfoTip label="About app-specific passwords">
                  Apple has no one-click sign-in for calendars. In Sign-In and Security at
                  account.apple.com, open App-Specific Passwords and create one for Casy.
                  Casy never sees your main Apple ID password. It only asks Apple for event
                  times, never titles, and stores this password encrypted. You can revoke it at any
                  time in the same place.
                </InfoTip>
              </div>
              <input
                id={passwordId}
                type="password"
                required
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="xxxx-xxxx-xxxx-xxxx"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                Generate one at{" "}
                <a
                  href="https://account.apple.com"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  account.apple.com
                </a>
              </span>
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? "Reading calendars" : "Connect"}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={onCancel}
                className="text-sm text-muted-foreground transition hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
