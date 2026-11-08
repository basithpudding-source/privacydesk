import Link from "next/link";

export const LEGAL_PAGES = [
  { href: "/terms", label: "Terms of use" },
  { href: "/privacy", label: "Privacy notice" },
  { href: "/dpa", label: "Data processing terms" },
  { href: "/sub-processors", label: "Sub-processors" },
];

/**
 * The frame for the legal pages (production checklist). Every one is a draft written by the
 * developer for a solicitor to review; the banner says so until the launch checklist is done.
 */
export function LegalPage({ title, summary, children }: { title: string; summary: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto w-full max-w-[65ch]">
      <p className="text-sm font-medium text-muted-foreground">Privacy Desk</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 text-muted-foreground">{summary}</p>
      <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100" role="note">
        <strong>Draft.</strong> This text has not yet been reviewed by a solicitor and is not in force. Items in square brackets are to be filled in before launch.
      </div>
      <nav aria-label="Legal pages" className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {LEGAL_PAGES.map((p) => (
          <Link key={p.href} href={p.href} className="underline-offset-4 hover:underline">
            {p.label}
          </Link>
        ))}
      </nav>
      <div className="legal mt-8 space-y-4 text-[15px] leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_table]:w-full [&_table]:text-sm [&_td]:border-t [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium">
        {children}
      </div>
      <p className="mt-10 text-xs text-muted-foreground">Last updated [date]. Privacy Desk is software, not legal advice.</p>
    </article>
  );
}

/** Footer links shared by the public pages. */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <span className={className}>
      {LEGAL_PAGES.map((p, i) => (
        <span key={p.href}>
          {i > 0 && " · "}
          <Link href={p.href} className="underline-offset-4 hover:underline">
            {p.label}
          </Link>
        </span>
      ))}
    </span>
  );
}
