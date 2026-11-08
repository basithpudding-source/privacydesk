"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { CommandPalette } from "./command-palette";

/**
 * Keyboard layer from the design standard §2: C new case, / search, G then C cases,
 * G then I inbox (later), ? help, Ctrl/Cmd+K palette. Ignored while typing in a field.
 */
export function Shortcuts({ canWrite }: { canWrite: boolean }) {
  const router = useRouter();
  const [help, setHelp] = useState(false);
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    let pendingG = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if (typing) return;

      if (pendingG) {
        pendingG = false;
        clearTimeout(timer);
        if (e.key.toLowerCase() === "c") router.push("/cases");
        else if (e.key.toLowerCase() === "l") router.push("/clients");
        return;
      }
      switch (e.key) {
        case "g":
        case "G":
          pendingG = true;
          timer = setTimeout(() => (pendingG = false), 1500);
          break;
        case "c":
        case "C":
          if (canWrite) router.push("/cases/new");
          break;
        case "/":
          e.preventDefault();
          window.dispatchEvent(new Event("pd:focus-search"));
          break;
        case "?":
          setHelp(true);
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, [router, canWrite]);

  return (
    <>
      <CommandPalette open={palette} onOpenChange={setPalette} canWrite={canWrite} />
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>Every action in two keystrokes. They do not fire while you are typing in a field.</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt><Kbd>C</Kbd></dt><dd>Log a case</dd>
            <dt><Kbd>/</Kbd></dt><dd>Search the case list</dd>
            <dt><Kbd>G</Kbd> then <Kbd>C</Kbd></dt><dd>Go to cases</dd>
            <dt><Kbd>G</Kbd> then <Kbd>L</Kbd></dt><dd>Go to clients</dd>
            <dt><Kbd>Ctrl</Kbd> <Kbd>K</Kbd></dt><dd>Command palette</dd>
            <dt><Kbd>?</Kbd></dt><dd>This list</dd>
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
}
