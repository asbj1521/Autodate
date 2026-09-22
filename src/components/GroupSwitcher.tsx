import { Check, ChevronDown, Plus, Users } from "lucide-react";

import Popover from "@/components/Popover";
import RollingText from "@/components/RollingText";
import { useT } from "@/i18n/lang";
import { cn } from "@/lib/utils";
import type { SchedulingGroup } from "@/hooks/useSchedulingGroups";

/**
 * A dropdown to switch which friend group you're scheduling for. Used in two
 * places — the hero and the card title — via the `variant` prop, so users see
 * the "pick your group" idea immediately and again in context.
 *
 * The example group shown to people with no groups of their own is labelled
 * as one here too: it is the first thing anyone reads, and a made-up group
 * that doesn't say so is worse than no group at all.
 */
export default function GroupSwitcher({
  groups,
  selectedId,
  onChange,
  onCreate,
  variant,
}: {
  groups: SchedulingGroup[];
  selectedId: string;
  onChange: (id: string) => void;
  onCreate: () => void;
  variant: "hero" | "title";
}) {
  const t = useT();
  const selected = groups.find((g) => g.id === selectedId);
  const hero = variant === "hero";

  return (
    <Popover
      className={cn("text-left", hero ? "block w-full" : "inline-block")}
      triggerClassName={cn(
        "transition",
        hero
          ? "flex w-full items-center justify-between gap-2 rounded-lg border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary"
          : "inline-flex items-center gap-2 rounded-lg px-1 -mx-1 text-2xl font-bold text-foreground hover:bg-secondary",
      )}
      panelClassName="w-full min-w-[15rem]"
      trigger={(open) => (
        <>
          <span className="flex min-w-0 items-center gap-2">
            {hero && <Users className="h-4 w-4 shrink-0 text-primary" />}
            <RollingText text={selected?.name ?? t.groupSwitcher.select} className="min-w-0" />
            {selected?.isExample && (
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                {t.common.example}
              </span>
            )}
          </span>
          <ChevronDown
            className={cn(
              "text-muted-foreground transition",
              hero ? "h-4 w-4" : "h-5 w-5",
              open && "rotate-180",
            )}
          />
        </>
      )}
    >
      {(close) => (
        <>
          <p className="px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t.groupSwitcher.yourGroups}
          </p>
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => {
                onChange(g.id);
                close();
              }}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-secondary"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium text-foreground">{g.name}</span>
                {g.isExample && (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    {t.common.example}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {g.memberCount}
                </span>
                {g.id === selectedId && <Check className="h-4 w-4 text-primary" />}
              </span>
            </button>
          ))}
          <div className="mt-1 border-t pt-1">
            <button
              onClick={() => {
                onCreate();
                close();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-primary transition hover:bg-secondary"
            >
              <Plus className="h-4 w-4" />
              {t.groupSwitcher.newGroup}
            </button>
          </div>
        </>
      )}
    </Popover>
  );
}
