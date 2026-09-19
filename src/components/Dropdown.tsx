import { type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import Popover from "@/components/Popover";
import WheelPicker from "@/components/WheelPicker";
import { cn } from "@/lib/utils";

/** A small labelled dropdown that opens a looping wheel (type / duration / start). */
export default function Dropdown({
  icon,
  value,
  options,
  onChange,
  menuWidth = "w-32",
}: {
  icon: ReactNode;
  value: number;
  options: { label: string; value: number }[];
  onChange: (value: number) => void;
  /** Tailwind width class for the wheel popup (wider for long labels). */
  menuWidth?: string;
}) {
  const current = options.find((o) => o.value === value);

  return (
    <Popover
      className="inline-block"
      triggerClassName="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-sm font-medium text-foreground transition hover:bg-secondary"
      panelClassName={menuWidth}
      trigger={(open) => (
        <>
          {icon}
          {current?.label}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition",
              open && "rotate-180",
            )}
          />
        </>
      )}
    >
      {() => <WheelPicker options={options} value={value} onChange={onChange} />}
    </Popover>
  );
}
