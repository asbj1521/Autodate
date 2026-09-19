import { useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock } from "lucide-react";

/**
 * Apple's sign-in form. iCloud has no consent-screen flow for calendars, so
 * connecting means an app-specific password rather than an OAuth redirect.
 *
 * Like the ICS form, it owns its fields: the page only needs to hear that the
 * form was submitted. The backend for this is still to come, which is why
 * submitting currently raises an honest notice instead of linking an account.
 */
export default function AppleCredentialsForm({
  open,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  onSubmit: (email: string, password: string) => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
            <label className="text-sm">
              <span className="mb-1 block font-medium text-foreground">
                iCloud email
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@icloud.com"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                <Lock className="h-3.5 w-3.5" />
                App-specific password
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="xxxx-xxxx-xxxx-xxxx"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                Generate one at{" "}
                <a
                  href="https://appleid.apple.com"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  appleid.apple.com
                </a>{" "}
                under Sign-In and Security. Autodate never sees your main Apple
                ID password.
              </span>
            </label>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                Connect
              </button>
              <button
                type="button"
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
