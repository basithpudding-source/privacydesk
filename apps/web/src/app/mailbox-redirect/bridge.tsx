"use client";

import { useEffect, useState } from "react";

// React runs an effect twice in development; the answer from Microsoft can only be handed over once.
let handedOver = false;

/**
 * Hands Microsoft's answer from this pop-up window back to the Privacy Desk window that
 * opened it, which then closes this one. Microsoft's own code does the handing over.
 */
export function Bridge() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (handedOver) return;
    handedOver = true;
    import("@azure/msal-browser/redirect-bridge")
      .then(({ broadcastResponseToMainFrame }) => broadcastResponseToMainFrame())
      .catch(() => setFailed(true));
  }, []);

  return (
    <p className="text-sm text-muted-foreground" role="status">
      {failed ? "This window can be closed. Go back to Privacy Desk and connect the mailbox again." : "Finishing the Microsoft sign-in…"}
    </p>
  );
}
