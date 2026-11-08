// Pages a member of the public sees: no navigation, no session, one column of running text.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <main className="flex flex-1 flex-col px-4 py-10 sm:px-8">{children}</main>
      <footer className="px-4 py-6 text-center text-xs text-muted-foreground sm:px-8">
        Provided by Privacy Desk. Software, not legal advice.
      </footer>
    </div>
  );
}
