// Privacy Desk deadline engine.
// Dates are 'YYYY-MM-DD' strings, handled in UTC so time zones never shift a day.
// Rules follow the ICO's published guidance:
//  - complaints: acknowledge within 30 days; day 1 is the day after receipt; a deadline on a
//    weekend or public holiday moves to the end of the next working day.
//  - SARs: one calendar month from the day of receipt (or of ID); same date next month, or the
//    last day of that month if the date doesn't exist; next working day if it lands on a
//    weekend or bank holiday; extension to three months from the start; stop-the-clock pauses
//    on the day clarification is requested and resumes the day after it arrives.

const BANK_HOLIDAYS_ENGLAND_WALES = [
  // 2026
  '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31',
  '2026-12-25', '2026-12-28',
  // 2027
  '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30',
  '2027-12-27', '2027-12-28',
];

const DAY = 86400000;

function toDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toStr(dt) {
  return dt.toISOString().slice(0, 10);
}

function addDays(s, n) {
  return toStr(new Date(toDate(s).getTime() + n * DAY));
}

function daysBetween(a, b) {
  // whole days from a to b (b - a)
  return Math.round((toDate(b) - toDate(a)) / DAY);
}

function addMonthsClamped(s, months) {
  const [y, m, d] = s.split('-').map(Number);
  const targetMonthIndex = m - 1 + months;
  const ty = y + Math.floor(targetMonthIndex / 12);
  const tm = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return toStr(new Date(Date.UTC(ty, tm, Math.min(d, lastDay))));
}

function isWorkingDay(s, holidays) {
  const dow = toDate(s).getUTCDay();
  return dow !== 0 && dow !== 6 && !holidays.has(s);
}

function nextWorkingDay(s, holidays) {
  let cur = s;
  while (!isWorkingDay(cur, holidays)) cur = addDays(cur, 1);
  return cur;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

function longDate(s) {
  const dt = toDate(s);
  return `${WEEKDAYS[dt.getUTCDay()]} ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}

function shortDate(s) {
  const dt = toDate(s);
  return `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()].slice(0, 3)} ${dt.getUTCFullYear()}`;
}

function whyNotWorking(s, holidays) {
  const dow = toDate(s).getUTCDay();
  if (dow === 0 || dow === 6) return 'a weekend';
  if (holidays.has(s)) return 'a bank holiday';
  return '';
}

// Complaint: acknowledgement deadline.
function complaintClock(c, holidays) {
  const steps = [];
  const day30 = addDays(c.receivedOn, 30);
  steps.push(`Received ${longDate(c.receivedOn)}. Day 1 is the next day, so day 30 is ${longDate(day30)}.`);
  const ackDue = nextWorkingDay(day30, holidays);
  if (ackDue !== day30) {
    steps.push(`That is ${whyNotWorking(day30, holidays)}, so the deadline moves to the next working day: ${longDate(ackDue)}.`);
  }
  return {
    kind: 'complaint',
    state: c.acknowledgedOn ? 'acknowledged' : 'awaiting_ack',
    ackDue,
    due: c.acknowledgedOn ? null : ackDue,
    steps,
  };
}

// SAR: response deadline, with ID, stop-the-clock and extension.
function sarClock(c, holidays) {
  const steps = [];
  if (c.idRequired && !c.idReceivedOn) {
    steps.push('ID has been requested. The one-month clock starts when it arrives.');
    return { kind: 'sar', state: 'waiting_id', start: null, due: null, steps };
  }
  const start = c.idRequired ? c.idReceivedOn : c.receivedOn;
  steps.push(c.idRequired
    ? `ID received ${longDate(start)}: the clock starts that day.`
    : `Received ${longDate(start)}: the clock starts that day.`);

  const months = c.extended ? 3 : 1;
  const base = addMonthsClamped(start, months);
  const [, , sd] = start.split('-').map(Number);
  const [, , bd] = base.split('-').map(Number);
  steps.push(`${months === 3 ? 'Extended: three' : 'One'} calendar month${months === 3 ? 's' : ''} later is ${longDate(base)}${bd !== sd ? ' (that month has no matching date, so it is the last day of the month)' : ''}.`);

  let pausedDays = 0;
  let openPause = null;
  for (const p of c.pauses || []) {
    if (p.to) {
      const n = daysBetween(p.from, p.to) + 1;
      pausedDays += n;
      steps.push(`Clock stopped ${shortDate(p.from)} for clarification, received ${shortDate(p.to)}: ${n} day${n === 1 ? '' : 's'} added.`);
    } else {
      openPause = p;
    }
  }
  const shifted = addDays(base, pausedDays);
  const due = nextWorkingDay(shifted, holidays);
  if (due !== shifted) {
    steps.push(`${longDate(shifted)} is ${whyNotWorking(shifted, holidays)}, so the deadline moves to ${longDate(due)}.`);
  }
  const oneMonth = nextWorkingDay(addMonthsClamped(start, 1), holidays);
  if (openPause) {
    steps.push(`Clock stopped since ${longDate(openPause.from)} while waiting for clarification. The deadline moves back once it arrives.`);
  }
  return {
    kind: 'sar',
    state: openPause ? 'paused' : (c.extended ? 'extended' : 'running'),
    start,
    due: openPause ? null : due,
    provisionalDue: due,
    pausedDays,
    extensionNoticeBy: oneMonth,
    steps,
  };
}

function caseClock(c, holidays) {
  if (c.type === 'complaint') return complaintClock(c, holidays);
  if (c.type === 'sar') return sarClock(c, holidays);
  // Other rights requests (erasure, rectification, objection) also run on one calendar month.
  const r = sarClock({ ...c, idRequired: c.idRequired }, holidays);
  r.kind = c.type;
  return r;
}

if (typeof module !== 'undefined') {
  module.exports = {
    BANK_HOLIDAYS_ENGLAND_WALES, addDays, daysBetween, addMonthsClamped, isWorkingDay,
    nextWorkingDay, complaintClock, sarClock, caseClock, longDate, shortDate,
  };
}
