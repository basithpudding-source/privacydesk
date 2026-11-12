"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, Columns3, Filter, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sameFilters, viewHref, type CaseView, type ViewParams } from "@/lib/cases/views";
import { savePrefs } from "@/lib/prefs-client";
import { CASE_COLUMNS, DEFAULT_CASE_COLUMNS, type CaseColumn, type Prefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { deleteView, saveView, updateView } from "./view-actions";

const trigger =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-card px-2.5 text-sm outline-none hover:border-ring/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const panel = "absolute left-0 top-full z-40 mt-1.5 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg";
const item = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted";
const iconBtn = "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50";

/** A button that opens a panel under it; closes on Escape, on a click outside, or when told to. */
function Menu({ label, icon, children, width }: { label: React.ReactNode; icon: React.ReactNode; children: (close: () => void) => React.ReactNode; width: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button type="button" className={trigger} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((v) => !v)}>
        {icon}
        {label}
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
      </button>
      {open && <div className={cn(panel, width)}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

/**
 * Views: the filters that come with the app, and the person's own saved ones. Choosing one
 * sets the filters and sort (a saved view also restores its columns). The current filters can
 * be saved under a name, and a saved view can be renamed, updated to the current filters, or
 * deleted.
 */
export function ViewsMenu({ builtIn, saved, current, prefs, unavailable }: { builtIn: CaseView[]; saved: CaseView[]; current: ViewParams; prefs: Prefs; unavailable: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = [...saved, ...builtIn].find((v) => sameFilters(v.params, current));
  const currentWithColumns: ViewParams = { ...current, columns: prefs.caseColumns };

  function apply(view: CaseView, close: () => void) {
    if (view.params.columns) savePrefs({ ...prefs, caseColumns: view.params.columns });
    close();
    router.push(viewHref(view.params));
    router.refresh();
  }
  function run(work: () => Promise<{ error: string | null }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const out = await work();
      if (out.error) setError(out.error);
      else after?.();
    });
  }

  return (
    <Menu
      width="w-80"
      icon={<Filter className="size-3.5 text-muted-foreground" aria-hidden="true" />}
      label={
        <>
          <span className="text-muted-foreground">View:</span> <span className="max-w-44 truncate font-medium">{active?.name ?? "Custom filters"}</span>
        </>
      }
    >
      {(close) => (
        <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto">
          <div>
            <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">Ready-made</p>
            <ul>
              {builtIn.map((v) => (
                <li key={v.id}>
                  <button type="button" className={item} onClick={() => apply(v, close)}>
                    <Check className={cn("size-3.5 shrink-0", active?.id === v.id ? "text-primary" : "invisible")} aria-hidden="true" />
                    {v.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-border pt-2">
            <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">Your saved views</p>
            {unavailable ? (
              <p className="px-2 py-1 text-sm text-muted-foreground">Saving views needs database migration 0019.</p>
            ) : saved.length === 0 ? (
              <p className="px-2 py-1 text-sm text-muted-foreground">None yet. Set the filters, sort and columns you want, then save them below.</p>
            ) : (
              <ul>
                {saved.map((v) => (
                  <li key={v.id} className="flex items-center gap-0.5">
                    {editing?.id === v.id ? (
                      <form
                        className="flex flex-1 items-center gap-1.5 px-1 py-0.5"
                        onSubmit={(e) => {
                          e.preventDefault();
                          run(() => updateView(v.id, { name: editing.name }), () => setEditing(null));
                        }}
                      >
                        <Input value={editing.name} onChange={(e) => setEditing({ id: v.id, name: e.target.value })} maxLength={60} aria-label={`New name for ${v.name}`} className="h-7" autoFocus />
                        <Button type="submit" size="sm" disabled={pending}>Rename</Button>
                      </form>
                    ) : (
                      <>
                        <button type="button" className={cn(item, "min-w-0 flex-1")} onClick={() => apply(v, close)}>
                          <Check className={cn("size-3.5 shrink-0", active?.id === v.id ? "text-primary" : "invisible")} aria-hidden="true" />
                          <span className="truncate">{v.name}</span>
                        </button>
                        <button type="button" className={iconBtn} title={`Rename “${v.name}”`} aria-label={`Rename ${v.name}`} onClick={() => setEditing({ id: v.id, name: v.name })}>
                          <Pencil className="size-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={iconBtn}
                          title={`Update “${v.name}” to the filters, sort and columns showing now`}
                          aria-label={`Update ${v.name} to the current filters`}
                          disabled={pending}
                          onClick={() => run(() => updateView(v.id, { params: currentWithColumns }))}
                        >
                          <RefreshCw className="size-3.5" aria-hidden="true" />
                        </button>
                        <button type="button" className={iconBtn} title={`Delete “${v.name}”`} aria-label={`Delete ${v.name}`} disabled={pending} onClick={() => run(() => deleteView(v.id))}>
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!unavailable && (
            <form
              className="border-t border-border px-2 pb-1 pt-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => saveView(name, currentWithColumns), () => setName(""));
              }}
            >
              <label htmlFor="view-name" className="text-xs font-semibold text-muted-foreground">
                Save what is showing now as a view
              </label>
              <div className="mt-1.5 flex items-center gap-1.5">
                <Input id="view-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="For example: My overdue SARs" className="h-8" />
                <Button type="submit" disabled={pending || !name.trim()}>
                  Save
                </Button>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">Keeps the filters, the sort and the visible columns. Only you see your saved views.</p>
            </form>
          )}
          {error && (
            <p className="px-2 pb-1 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </Menu>
  );
}

/** Columns: tick the ones to show. The reference column always stays. Kept in this browser. */
export function ColumnsMenu({ prefs }: { prefs: Prefs }) {
  const router = useRouter();
  // The ticks follow the saved preference itself, so a view that restores its columns shows here too.
  const columns = prefs.caseColumns;

  function set(next: CaseColumn[]) {
    const ordered = DEFAULT_CASE_COLUMNS.filter((k) => next.includes(k));
    savePrefs({ ...prefs, caseColumns: ordered });
    router.refresh();
  }
  const hidden = DEFAULT_CASE_COLUMNS.length - columns.length;

  return (
    <Menu
      width="w-60"
      icon={<Columns3 className="size-3.5 text-muted-foreground" aria-hidden="true" />}
      label={
        <>
          Columns{hidden > 0 && <span className="text-muted-foreground"> ({hidden} hidden)</span>}
        </>
      }
    >
      {() => (
        <fieldset>
          <legend className="px-2 py-1 text-xs font-semibold text-muted-foreground">Show these columns</legend>
          <label className={cn(item, "text-muted-foreground")}>
            <input type="checkbox" checked disabled className="size-4 accent-primary" />
            Ref (always shown)
          </label>
          {CASE_COLUMNS.map((c) => {
            const on = columns.includes(c.key);
            return (
              <label key={c.key} className={cn(item, "cursor-pointer")}>
                <input
                  type="checkbox"
                  checked={on}
                  // The last column cannot be unticked: a list with only references says nothing.
                  disabled={on && columns.length === 1}
                  onChange={() => set(on ? columns.filter((k) => k !== c.key) : [...columns, c.key])}
                  className="size-4 accent-primary"
                />
                {c.label}
              </label>
            );
          })}
          <div className="mt-1 border-t border-border px-1 pt-2">
            <Button type="button" variant="outline" size="sm" disabled={hidden === 0} onClick={() => set(DEFAULT_CASE_COLUMNS)}>
              Show all columns
            </Button>
          </div>
        </fieldset>
      )}
    </Menu>
  );
}
