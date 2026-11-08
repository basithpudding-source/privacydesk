// Tests the deadline engine against the ICO's own worked examples.
const assert = require('assert');
const c = require('./clocks.js');

const none = new Set();
const ew = new Set(c.BANK_HOLIDAYS_ENGLAND_WALES);
const xmas2024 = new Set(['2024-12-25', '2024-12-26']);
let passed = 0;
function t(name, fn) { fn(); passed++; console.log('ok  ', name); }

// Complaints: received Thursday 5 June, day 30 is Saturday 5 July, so Monday 7 July.
t('complaint ack rolls past weekend (ICO example)', () => {
  const r = c.complaintClock({ receivedOn: '2025-06-05' }, none);
  assert.strictEqual(r.ackDue, '2025-07-07');
});
t('complaint ack on a weekday stays put', () => {
  const r = c.complaintClock({ receivedOn: '2026-11-02' }, ew); // +30 = Wed 2 Dec 2026
  assert.strictEqual(r.ackDue, '2026-12-02');
});
t('complaint ack rolls past Christmas bank holidays', () => {
  const r = c.complaintClock({ receivedOn: '2026-11-25' }, ew); // +30 = Fri 25 Dec -> Mon 28 Dec (holiday) -> Tue 29 Dec
  assert.strictEqual(r.ackDue, '2026-12-29');
});

// SARs
t('SAR received on a bank holiday: 1 Jan to 1 Feb (ICO example)', () => {
  const r = c.sarClock({ type: 'sar', receivedOn: '2027-01-01' }, ew);
  assert.strictEqual(r.due, '2027-02-01');
});
t('SAR 31 Jan to last day of Feb, leap year (ICO example)', () => {
  const r = c.sarClock({ type: 'sar', receivedOn: '2028-01-31' }, none);
  assert.strictEqual(r.due, '2028-02-29');
});
t('SAR 31 Jan to 28 Feb in a normal year, then weekend roll', () => {
  const r = c.sarClock({ type: 'sar', receivedOn: '2026-01-31' }, ew); // 28 Feb 2026 is a Saturday
  assert.strictEqual(r.due, '2026-03-02');
});
t('SAR Monday 25 Nov to Friday 27 Dec over Christmas (ICO example)', () => {
  const r = c.sarClock({ type: 'sar', receivedOn: '2024-11-25' }, xmas2024);
  assert.strictEqual(r.due, '2024-12-27');
});
t('SAR extension: 7 Aug to 7 Nov (ICO example)', () => {
  const r = c.sarClock({ type: 'sar', receivedOn: '2025-08-07', extended: true }, none);
  assert.strictEqual(r.due, '2025-11-07');
  assert.strictEqual(r.state, 'extended');
});
t('SAR stop the clock: 14 May, paused 15-18 May, due 18 June (ICO example)', () => {
  const r = c.sarClock({ type: 'sar', receivedOn: '2025-05-14', pauses: [{ from: '2025-05-15', to: '2025-05-18' }] }, none);
  assert.strictEqual(r.pausedDays, 4);
  assert.strictEqual(r.due, '2025-06-18');
});
t('SAR same-day clarification stops the clock for one day', () => {
  const r = c.sarClock({ type: 'sar', receivedOn: '2025-05-14', pauses: [{ from: '2025-05-15', to: '2025-05-15' }] }, none);
  assert.strictEqual(r.pausedDays, 1);
  assert.strictEqual(r.due, '2025-06-16'); // 14 Jun + 1 = Sun 15 Jun -> Mon 16 Jun
});
t('SAR waiting for ID has no deadline yet', () => {
  const r = c.sarClock({ type: 'sar', receivedOn: '2026-11-02', idRequired: true }, ew);
  assert.strictEqual(r.state, 'waiting_id');
  assert.strictEqual(r.due, null);
});
t('SAR clock starts on the day ID arrives', () => {
  const r = c.sarClock({ type: 'sar', receivedOn: '2026-11-02', idRequired: true, idReceivedOn: '2026-11-05' }, ew);
  assert.strictEqual(r.due, '2026-12-07'); // 5 Dec 2026 is a Saturday -> Mon 7 Dec
});
t('SAR with an open pause shows the clock as stopped', () => {
  const r = c.sarClock({ type: 'sar', receivedOn: '2026-11-02', pauses: [{ from: '2026-11-04' }] }, ew);
  assert.strictEqual(r.state, 'paused');
  assert.strictEqual(r.due, null);
});
t('end-of-month clamp keeps leap and non-leap years apart', () => {
  assert.strictEqual(c.addMonthsClamped('2026-10-31', 1), '2026-11-30');
  assert.strictEqual(c.addMonthsClamped('2026-11-30', 3), '2027-02-28');
  assert.strictEqual(c.addMonthsClamped('2026-12-15', 1), '2027-01-15');
});

console.log(`\n${passed} tests passed`);
