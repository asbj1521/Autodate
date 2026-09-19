import type { ReactNode } from "react";
import { Info } from "lucide-react";

import Popover from "@/components/Popover";

/**
 * A small (i) that opens a short explanation. It is how the profile page keeps
 * long helper text out of the way without deleting it.
 *
 * Built on the same click-to-open popover as the menus rather than a hover
 * tooltip, so it also works on touch screens. `label` is what a screen reader
 * announces for the icon. Don't place it inside a <label>: a button there
 * would hijack the label from its input.
 */
export default function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover
      className="inline-block"
      triggerClassName="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition hover:text-foreground"
      panelClassName="w-72 max-w-[calc(100vw-3rem)] p-3 text-xs font-normal leading-relaxed text-foreground/80"
      trigger={() => (
        <>
          <Info className="h-4 w-4" />
          <span className="sr-only">{label}</span>
        </>
      )}
    >
      {() => <div>{children}</div>}
    </Popover>
  );
}
