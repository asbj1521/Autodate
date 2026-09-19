import { Check, ChevronDown, Plus, Users } from "lucide-react";

import Popover from "@/components/Popover";
import { cn } from "@/lib/utils";
import type { FriendGroup } from "@/types";

/**
 * A dropdown to switch which friend group you're scheduling for. Used in two
 * places — the hero and the card title — via the `variant` prop, so users see
 * the "pick your group" idea immediately and again in context.
 */
export default function GroupSwitcher({
  groups,
  selectedId,
  onChange,
  variant,
}: {
  groups: FriendGroup[];
  selectedId: string;
  onChange: (id: string) => void;
  variant: "hero" | "title";
}) {
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
          <span className="flex items-center gap-2">
            {hero && <Users className="h-4 w-4 text-primary" />}
            {selected?.name ?? "Select group"}
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
            Your friend groups
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
              <span className="font-medium text-foreground">{g.name}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {g.participants.length}
                </span>
                {g.id === selectedId && <Check className="h-4 w-4 text-primary" />}
              </span>
            </button>
          ))}
          <div className="mt-1 border-t pt-1">
            <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-primary transition hover:bg-secondary">
              <Plus className="h-4 w-4" />
              New group
            </button>
          </div>
        </>
      )}
    </Popover>
  );
}
