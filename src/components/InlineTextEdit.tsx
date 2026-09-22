import { useState, type FormEvent } from "react";
import { Check, Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A short piece of text, editable in place: a group's name, a person's own
 * display name. Sized to what's actually typed rather than stretching to
 * fill its row, so the save/cancel buttons stay right next to the text.
 */
export default function InlineTextEdit({
  value,
  maxLength,
  submitting,
  error,
  inputClassName,
  onSubmit,
  onCancel,
}: {
  value: string;
  maxLength: number;
  submitting: boolean;
  error: string | null;
  /** Overrides the input's text size/weight; defaults to a small label style. */
  inputClassName?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSubmit(trimmed);
    else if (trimmed) onCancel();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-1.5">
      <input
        type="text"
        autoFocus
        required
        disabled={submitting}
        maxLength={maxLength}
        size={Math.min(maxLength, Math.max(draft.length, 8)) + 1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        className={cn(
          "w-auto max-w-full rounded-md border bg-background px-2 py-1 text-foreground outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50",
          inputClassName ?? "text-sm font-semibold",
        )}
      />
      <button
        type="submit"
        disabled={submitting || !draft.trim()}
        title="Save"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-primary transition hover:bg-primary/10 disabled:opacity-50"
      >
        {submitting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Check className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={submitting}
        title="Cancel"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {error && <p className="basis-full text-xs text-red-700">{error}</p>}
    </form>
  );
}
