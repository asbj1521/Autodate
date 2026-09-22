import { useId, useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Lock, XCircle } from "lucide-react";

import { useT } from "@/i18n/lang";

/** Supabase's own floor (`minimum_password_length` in supabase/config.toml). */
const MIN_PASSWORD_LENGTH = 6;

/**
 * A new-password + confirm-password pair, used both for setting/changing a
 * password on the profile page and for the "choose a new password" step of
 * the forgot-password flow on the sign-in page.
 *
 * It owns its fields and checks the two match before calling `onSubmit` with
 * a single password: nothing outside cares what was typed into either box,
 * only the value once it has been confirmed. The submitting/error state
 * comes from the caller, since it belongs to the request rather than the
 * form; the match check is purely local, so it is cleared on every keystroke
 * rather than surviving until the next submit.
 */
export default function PasswordForm({
  open = true,
  submitting,
  error,
  submitLabel,
  submittingLabel,
  passwordLabel,
  onSubmit,
  onCancel,
}: {
  open?: boolean;
  submitting: boolean;
  error: string | null;
  submitLabel: string;
  submittingLabel: string;
  /** "New password" fits changing one; a fresh sign-up reads better as "Password". */
  passwordLabel?: string;
  onSubmit: (password: string) => void;
  onCancel?: () => void;
}) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const passwordId = useId();
  const confirmId = useId();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    onSubmit(password);
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
          <div className="flex flex-col gap-3">
            <div className="text-sm">
              <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                <Lock className="h-3.5 w-3.5" />
                <label htmlFor={passwordId}>{passwordLabel ?? t.passwordForm.newPassword}</label>
              </div>
              <input
                id={passwordId}
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setMismatch(false);
                }}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                {t.passwordForm.atLeast(MIN_PASSWORD_LENGTH)}
              </span>
            </div>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-foreground">{t.passwordForm.confirm}</span>
              <input
                id={confirmId}
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setMismatch(false);
                }}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
            {(mismatch || error) && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{mismatch ? t.passwordForm.mismatch : error}</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? submittingLabel : submitLabel}
              </button>
              {onCancel && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={onCancel}
                  className="text-sm text-muted-foreground transition hover:text-foreground"
                >
                  {t.common.cancel}
                </button>
              )}
            </div>
          </div>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
