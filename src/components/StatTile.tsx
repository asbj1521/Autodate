import { cn } from "@/lib/utils";

/**
 * One number with a label under it, as in the profile card's stat strip and
 * admin mode's overview. `null` while its source is still loading, so a row
 * never flashes a false "0" before the real answer arrives. `alert` tints it
 * for a number that means something needs attention.
 */
export default function StatTile({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: number | null;
  alert?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl p-3 text-center sm:text-left",
        alert ? "bg-red-50 text-red-800" : "bg-secondary",
      )}
    >
      <p className={cn("text-2xl font-bold tabular-nums", alert ? "text-red-700" : "text-foreground")}>
        {value === null ? "..." : value.toLocaleString("en-GB")}
      </p>
      <p className={cn("mt-0.5 text-xs", alert ? "text-red-800/80" : "text-muted-foreground")}>{label}</p>
    </div>
  );
}
