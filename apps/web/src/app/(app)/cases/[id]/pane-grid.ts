// The rows of a case's top pane share these, so their columns and the line between them
// line up. The pane lays itself out by its own width (a container query), not the window's.
export const PANE_ROW = "grid gap-x-8 gap-y-5 pl-7 pr-5 @2xl:grid-cols-2";
export const PANE_SECOND = "min-w-0 @2xl:border-l @2xl:border-border @2xl:pl-8";
