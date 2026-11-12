# Design standard

The standard to build to, drawn from three products that get this right: the GOV.UK Design System (clarity and accessibility for case-handling work), Linear (speed and keyboard-first triage) and the best DSAR portals such as OneTrust and Transcend (intake and identity verification done properly).

## 1. The job of each screen

| Screen | The one question it answers | Model to copy |
| --- | --- | --- |
| Inbox (new) | "What has come in that nobody has looked at yet?" | Linear's Triage inbox: items land here first and are accepted or declined, so the case list stays clean |
| Cases | "What is due, and in what order?" | A GOV.UK-style list: one row per case, sorted by next legal deadline, status as a tag |
| Case | "Where is this case, what is the deadline, what happens next?" | GOV.UK task list: the steps of the process in order, each with a status, the next step obvious |
| Dashboard | "Is any client at risk this week?" | A live operations board: the queue as tiles and one bar, what needs attention beside a calendar of due dates, a board by client, then work by type and the monthly chart. Every number opens the cases behind it |
| Report | "What do I send the client this month?" | One page, plain English, copy or PDF |
| Public form | "How does a member of the public raise this with the organisation?" | A DSAR portal: short form, verify by email link, confirmation with reference and date |

## 2. Speed and keyboard

- Every action reachable in two keystrokes. `C` new case, `/` search, `G` then `I` inbox, `G` then `C` cases, `Cmd/Ctrl+K` command palette, `?` shortcut help.
- Shortcuts shown in tooltips so people learn them by using the app.
- Optimistic updates: change the screen immediately, sync in the background, show an error only if it fails.
- No page reloads between views; no spinners for actions under 300 ms.

## 3. Case page as a task list

The case page shows the process as ordered steps, each with a status, using the GOV.UK task list pattern (research-tested across case management systems). For a SAR:

1. Received — date, channel, who logged it
2. Identity checked — Not needed / Requested on … / Received on …
3. Scope clarified — Not needed / Asked on … (clock stopped) / Received on …
4. Acknowledged — date
5. Data gathered — notes and checklist
6. Response sent — date, outcome

Status words are adjectives in sentence case (Completed, In progress, Not started, Cannot start yet), never verbs, so they are not mistaken for buttons. The whole row is clickable.

## 4. The deadline block

- The due date is the largest thing on the page. Under it, the working in numbered steps, exactly as the ICO would explain it.
- Three visual states only: fine (more than 5 days), warning (5 days or fewer), overdue. Paused and waiting-for-ID are grey, with a sentence saying what restarts the clock.
- The internal target (28 days) is visibly a target, not a legal limit.
- The same pane holds the case's details and the request as received, under the date, so who it is from and what they asked for are read with the deadline. A long request is cut to eight lines with a button to show all of it. (Changed 12 November 2026: these were separate cards.)
- The column beside the page is for recording a step or a note, and for the audit trail. Nothing else goes there.

## 5. Status and colour

- Tags only ever show a status. Colour is read as meaning, so: green good, amber warning, red critical, blue informational, grey neutral. Nothing else is coloured.
- Never rely on colour alone; every tag has words.
- WCAG 2.2 AA throughout: visible focus, labels on every control, 4.5:1 contrast, works at 400% zoom, keyboard-only works end to end.

## 6. Intake and identity

- Public form: at most five fields; plain words, no legal terms; a note not to include bank or health details; a privacy line naming the organisation and the ICO.
- Email verification by magic link before a request is accepted (as Transcend and OneTrust do): the link proves the address, and the clock starts when the request is complete.
- Risk-based ID: no extra ID for a request from a known address about routine data; ID requested when the address does not match records or the data is sensitive. The clock waits for ID, and the app says so on the confirmation.
- Confirmation page and email: reference, date received, the legal response date, who to contact.

## 7. Copy

- Write for the consultant at 5 pm with six clients. First sentence of any message says what to do.
- Buttons say what happens: "Mark acknowledged", "Ask for clarification (stops the clock)", "Close: response sent".
- Errors say what went wrong and how to fix it.
- Never "Submit", "OK", "Error occurred".

## 8. Layout rules

- One bar across the top holds the five sections, search and "Log a case"; everything below it uses the full width of the window. (Changed 12 November 2026 from a 220 px side rail: with five sections a top bar is enough, and the rail left the work in a narrow column.) On phones the sections move to a bottom bar.
- Lists are dense tables, one line per row: column headings stay in view while the table scrolls, rows are grouped under headings that also stay in view, and the first column is the reference. A row can be previewed in a panel beside the list, so it can be found, checked and acted on without leaving the table.
- Wide screens show related things side by side (list, message and decision in the inbox; steps and letters on a case) before they add empty margin.
- 65-character running text; tabular numerals in tables; 8 px spacing steps.
- Same card, same padding, same baseline everywhere. One accent colour; semantic colours separate.
- Light and dark themes with equal care. Each person chooses light, dark or "match my device" on their profile page, with table density, where the navigation sits and how cases open. Light, top navigation and comfortable rows are the standard.

## 9. What to copy from the prototype, and what to fix

Keep: the deadline working shown step by step; the triage result with quoted reasons and a confidence bar; the per-client dashboard table; the monthly report text.

Fix: the case register needs the ref column fixed-width and a visible row focus; case actions should be a task list, not a row of buttons; triage should land in an inbox rather than straight into cases; no command palette or shortcuts yet; the public form needs email verification; the report needs a PDF.
