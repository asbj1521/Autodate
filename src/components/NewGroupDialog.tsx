import { useId, useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Users, XCircle } from "lucide-react";

import { useT } from "@/i18n/lang";
import { MAX_GROUP_NAME_LENGTH } from "@/lib/groups";

/**
 * "New group": one name, one button.
 *
 * A group is nothing but a name until people join it, so asking for anything
 * more here would be asking for work before there is anything to show for it.
 *
 * The form is a separate component that only exists while the dialog is open,
 * so the field starts empty every time by simply being new: a cancelled
 * attempt can't come back half filled in, and nothing has to reset it.
 */
export default function NewGroupDialog({
  open,
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  submitting: boolean;
  error: string | null;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40"
            onClick={submitting ? undefined : onCancel}
          />
          <NewGroupForm
            submitting={submitting}
            error={error}
            onSubmit={onSubmit}
            onCancel={onCancel}
          />
        </div>
      )}
    </AnimatePresence>
  );
}

/** The dialog's contents. Its own component so its state is born with it. */
function NewGroupForm({
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  submitting: boolean;
  error: string | null;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const nameId = useId();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (name.trim()) onSubmit(name.trim());
  }

  return (
    <motion.form
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: 8 }}
      onSubmit={handleSubmit}
      className="relative z-10 w-full max-w-sm rounded-2xl border bg-card p-5 shadow-xl"
    >
      <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
        <Users className="h-5 w-5 text-primary" />
        {t.newGroup.title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t.newGroup.body}</p>

      <label className="mt-4 block text-sm" htmlFor={nameId}>
        <span className="mb-1 block font-medium text-foreground">{t.newGroup.nameLabel}</span>
        <input
          id={nameId}
          type="text"
          required
          autoFocus
          maxLength={MAX_GROUP_NAME_LENGTH}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.newGroup.placeholder}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
        />
      </label>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary disabled:opacity-50"
        >
          {t.common.cancel}
        </button>
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {t.newGroup.create}
        </button>
      </div>
    </motion.form>
  );
}
