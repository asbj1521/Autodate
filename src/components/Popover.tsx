import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * The shell a menu needs: a trigger button, a click-away backdrop, and a panel
 * that fades in. Written once so the event-settings dropdown and the group
 * switcher can't drift apart in behaviour or timing.
 */
export default function Popover({
  className,
  triggerClassName,
  panelClassName,
  trigger,
  children,
}: {
  className?: string;
  triggerClassName?: string;
  panelClassName?: string;
  /** Trigger contents; `open` drives the chevron rotation. */
  trigger: (open: boolean) => ReactNode;
  /** Panel contents; call `close` to dismiss the menu. */
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("relative", className)}>
      <button onClick={() => setOpen((o) => !o)} className={triggerClassName}>
        {trigger(open)}
      </button>
      <AnimatePresence>
        {open && (
          <>
            {/* Click-away backdrop */}
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className={cn(
                "absolute left-0 z-20 mt-2 overflow-hidden rounded-xl border bg-card p-1 shadow-lg",
                panelClassName,
              )}
            >
              {children(() => setOpen(false))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
