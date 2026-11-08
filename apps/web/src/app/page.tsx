export default function Home() {
  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-16 sm:px-8">
      <div className="mx-auto w-full max-w-[65ch]">
        <p className="text-sm font-medium text-muted-foreground">Privacy Desk</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Complaints and subject access requests, with the deadlines worked out
          for you.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Sign-in arrives in the next build slice. Until then this page confirms
          the app is running.
        </p>
        <p className="mt-8 text-sm text-muted-foreground">
          Privacy Desk is software, not legal advice. Deadlines follow published
          ICO guidance; the organisation remains responsible for its responses.
        </p>
      </div>
    </main>
  );
}
