import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * The top of every signed-in page: where you are, the one question the page answers, and
 * the page's own actions on the right. Same spacing everywhere.
 */
export function PageHeader({
  title,
  description,
  actions,
  back,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** A parent page to step back to, shown as a breadcrumb above the title. */
  back?: { href: string; label: string };
  /** Tags or a line of detail shown beside or under the title. */
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {back && (
          <nav aria-label="Breadcrumb" className="mb-1.5 flex items-center gap-1 text-sm text-muted-foreground">
            <Link href={back.href} className="rounded-sm underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
              {back.label}
            </Link>
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </nav>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A dashed box for "nothing here": a short title, then what to do about it. */
export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-input bg-card/60 px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-[55ch] text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
