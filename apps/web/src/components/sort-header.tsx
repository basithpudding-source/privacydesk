import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A column heading that sorts the table. The sort lives in the page's address, so it survives
 * a reload and can be shared. Click once for ascending, again for descending, a third time to
 * go back to the table's own order. Put it inside a <th> and give the <th> `aria-sort`.
 */
export function SortHeader({
  label,
  state,
  hrefs,
  align = "left",
  title,
}: {
  label: string;
  /** How this column is sorted now. */
  state: "asc" | "desc" | "none";
  /** Where each next click goes: sort ascending, sort descending, or clear the sort. */
  hrefs: { asc: string; desc: string; clear: string };
  align?: "left" | "right";
  title?: string;
}) {
  const next = state === "none" ? hrefs.asc : state === "asc" ? hrefs.desc : hrefs.clear;
  const Icon = state === "asc" ? ArrowUp : state === "desc" ? ArrowDown : ChevronsUpDown;
  const hint = state === "none" ? "sort ascending" : state === "asc" ? "sort descending" : "clear the sort";
  return (
    <Link
      href={next}
      scroll={false}
      title={`${title ? `${title}. ` : ""}Click to ${hint}`}
      className={cn(
        "group/sort -mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
        align === "right" && "flex-row-reverse",
        state !== "none" && "text-foreground",
      )}
    >
      {label}
      <Icon className={cn("size-3.5 shrink-0", state === "none" ? "opacity-40 group-hover/sort:opacity-100" : "text-primary")} aria-hidden="true" />
      <span className="sr-only">, {hint}</span>
    </Link>
  );
}

export function ariaSort(state: "asc" | "desc" | "none"): "ascending" | "descending" | undefined {
  return state === "asc" ? "ascending" : state === "desc" ? "descending" : undefined;
}
