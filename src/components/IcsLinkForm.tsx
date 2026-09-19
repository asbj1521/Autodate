import { useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Lock, XCircle } from "lucide-react";

/**
 * The "add a calendar by link" form: a feed URL and an optional name.
 *
 * It keeps its own field state, because nothing outside cares what is half
 * typed into it — the page only needs to know when a link was submitted. The
 * submitting/error state does come from the page, since it belongs to the
 * request rather than the form.
 */
export default function IcsLinkForm({
  open,
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  submitting: boolean;
  error: string | null;
  onSubmit: (url: string, name: string) => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit(url, name);
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
              <span className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                <Lock className="h-3.5 w-3.5" />
                Calendar link
              </span>
              <input
                type="text"
                required
                autoComplete="off"
                spellCheck={false}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://... or webcal://..."
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                Treat this link like a password: anyone who has it can read the
                calendar. It is stored privately and never shown again.
              </span>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-foreground">
                Name (optional)
              </span>
              <input
                type="text"
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. CBS timetable"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
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
                {submitting ? "Reading calendar" : "Add link"}
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
