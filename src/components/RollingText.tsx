import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * Text that rolls when it changes: the old line slides up and out while the
 * new one rises into its place.
 *
 * Used for the group name on the front page, where the examples change by
 * themselves every few seconds. A name that simply blinked to a different
 * word would read as a glitch; watching it roll makes it obvious that the
 * page is cycling through examples rather than telling you something new.
 *
 * Both lines sit in the same grid cell so they overlap while they cross, which
 * keeps the height fixed and stops the layout jumping on every change. The
 * outgoing line stops taking clicks on its way out, so it can't swallow one
 * meant for what's underneath.
 */
export default function RollingText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <span className={cn("grid overflow-hidden [&>*]:col-start-1 [&>*]:row-start-1", className)}>
      <AnimatePresence initial={false}>
        <motion.span
          key={text}
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{ y: "-100%", opacity: 0, pointerEvents: "none" }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="block truncate"
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
