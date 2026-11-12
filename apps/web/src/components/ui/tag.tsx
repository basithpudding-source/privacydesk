import { cn } from "@/lib/utils";

/** The five meanings a colour may carry (design standard 5). Nothing else is coloured. */
export type Tone = "ok" | "warn" | "danger" | "info" | "neutral";

const TONES: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok-fg",
  warn: "bg-warn-bg text-warn-fg",
  danger: "bg-danger-bg text-danger-fg",
  info: "bg-info-bg text-info-fg",
  neutral: "bg-muted text-muted-foreground",
};

const DOTS: Record<Tone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-muted-foreground/50",
};

/**
 * A status tag: always words, colour only as a second cue. Use it for statuses and nothing
 * else, so a coloured pill always means "this is the state of the thing".
 */
export function Tag({ tone = "neutral", dot = false, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", TONES[tone], className)}>
      {dot && <span className={cn("size-1.5 shrink-0 rounded-full", DOTS[tone])} aria-hidden="true" />}
      {children}
    </span>
  );
}

/** The solid colour for a tone, for row edges and small markers. */
export const TONE_SOLID: Record<Tone, string> = DOTS;
