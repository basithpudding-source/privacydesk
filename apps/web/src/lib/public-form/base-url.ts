// Where emailed links point. In production this must come from APP_URL, never from the
// request: the Host header is whatever the sender says it is, so building the link from it
// would let someone have the app email a person a link to a site of the sender's choosing,
// carrying that person's one-time token.

export interface RequestHost {
  host: string | null;
  forwardedHost: string | null;
  forwardedProto: string | null;
}

/**
 * The origin for links in emails, or null when it cannot be trusted: production with no
 * APP_URL. Development falls back to the request's own host so the form works on localhost.
 */
export function linkBase(appUrl: string | undefined, production: boolean, request: RequestHost): string | null {
  const configured = (appUrl ?? "").trim().replace(/\/+$/, "");
  if (configured) return /^https?:\/\//.test(configured) ? configured : null;
  if (production) return null;
  const host = request.forwardedHost ?? request.host ?? "localhost:3000";
  const proto = request.forwardedProto ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}
