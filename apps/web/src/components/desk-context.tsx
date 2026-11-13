"use client";

import { createContext, useContext } from "react";
import { deskWords, type DeskKind, type DeskWords } from "@/lib/desk";

interface Desk {
  /** The words for this kind of desk (lib/desk.ts), including whether it has clients at all. */
  words: DeskWords;
  /** Whether the signed-in person is an administrator of the desk. */
  isAdmin: boolean;
}

const DeskContext = createContext<Desk>({ words: deskWords("consultancy"), isAdmin: false });

/** Set once in the app's frame, so any part of a signed-in page can ask what kind of desk it is in. */
export function DeskProvider({ kind, isAdmin, children }: { kind: DeskKind; isAdmin: boolean; children: React.ReactNode }) {
  return <DeskContext.Provider value={{ words: deskWords(kind), isAdmin }}>{children}</DeskContext.Provider>;
}

export function useDesk(): Desk {
  return useContext(DeskContext);
}
