// Who did something, in words. Every log keeps the person as a sign-in id; the desk's
// directory (pd.people, migration 0023) turns that into the name they chose for themselves,
// or their address, and still knows them after they have left the team.

export interface Person {
  name: string | null;
  email: string | null;
  /** Removed from the team since. What they did keeps their name. */
  left: boolean;
}

export type People = ReadonlyMap<string, Person>;

/** The words shown beside a log entry for whoever made it. */
export function whoDid(actor: string | null, me: string, people: People): string {
  if (!actor) return "system";
  if (actor === me) return "you";
  const p = people.get(actor);
  // Not in the directory: the database has not had migration 0023, or the id is not a person's.
  if (!p) return `user ${actor.slice(0, 8)}`;
  const named = p.name || p.email || "a team member";
  return p.left ? `${named} (no longer in the team)` : named;
}
