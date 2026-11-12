import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";

/** The product mark and name, as shown above the sign-in and set-up cards. */
export function Brand({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-center gap-2.5 text-sm font-semibold tracking-tight", className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground" aria-hidden="true">
        <Timer className="size-4.5" />
      </span>
      Privacy Desk
    </p>
  );
}
