// Sample data for the dev version. All people, addresses and organisations are invented.
// Prints [{path, data}] as JSON. Dates are fixed around 8 November 2026.
const orgs = [
  { id: 'hbl', name: 'Harbour Lettings (sample)', code: 'HBL', colour: '#1d5c86' },
  { id: 'bpr', name: 'Brightpath Recruitment (sample)', code: 'BPR', colour: '#7a5ea8' },
  { id: 'mdp', name: 'Meadow Dental Practice (sample)', code: 'MDP', colour: '#22744a' },
];

const ev = (on, text, kind) => ({ at: on + 'T10:00:00.000Z', on, kind: kind || 'note', text, by: null });

const base = {
  status: 'open', idRequired: false, idReceivedOn: null, pauses: [], extended: false, extendedOn: null,
  acknowledgedOn: null, closedOn: null, outcome: '',
};

const cases = [
  {
    id: 'c01', ref: 'PD-HBL01', orgId: 'hbl', type: 'complaint', channel: 'Email', receivedOn: '2026-10-12',
    requesterName: 'Jordan Hale', requesterEmail: 'jordan.hale@example.com',
    summary: 'Agent told the new landlord about rent arrears without consent.',
    message: 'Your agent told my new landlord about my rent arrears without asking me. I never agreed to that. I want to know why you shared it and I want it to stop.',
    triage: { by: 'ai', type: 'complaint', confidence: 0.93 },
    events: [ev('2026-10-12', 'Case created from a pasted message (AI triage: complaint, 93% confident)', 'created')],
  },
  {
    id: 'c02', ref: 'PD-HBL02', orgId: 'hbl', type: 'sar', channel: 'Letter', receivedOn: '2026-10-06',
    requesterName: 'Alex Morgan', requesterEmail: 'alex.morgan@example.com',
    summary: 'Former tenant wants a copy of the full tenancy file and inspection notes.',
    acknowledgedOn: '2026-10-07',
    events: [ev('2026-10-06', 'Case logged by hand (letter)', 'created'), ev('2026-10-07', 'Acknowledgement sent on 7 Oct 2026', 'ack'), ev('2026-10-20', 'Inspection photos found on the old shared drive; still collecting', 'note')],
  },
  {
    id: 'c03', ref: 'PD-BPR01', orgId: 'bpr', type: 'sar', channel: 'Email', receivedOn: '2026-10-20',
    requesterName: 'Priya Shah', requesterEmail: 'priya.shah@example.com',
    summary: 'Candidate wants her file, interview notes and consultants’ emails about her.',
    idRequired: true, idReceivedOn: '2026-10-22', acknowledgedOn: '2026-10-20',
    triage: { by: 'ai', type: 'sar', confidence: 0.96 },
    events: [ev('2026-10-20', 'Case created from a pasted message (AI triage: SAR, 96% confident)', 'created'), ev('2026-10-20', 'Asked for proof of identity; clock waits until it arrives', 'id'), ev('2026-10-22', 'Proof of identity received 22 Oct 2026; clock started', 'id')],
  },
  {
    id: 'c04', ref: 'PD-BPR02', orgId: 'bpr', type: 'complaint', channel: 'Web form', receivedOn: '2026-11-02',
    requesterName: 'Tom Okafor', requesterEmail: 'tom.okafor@example.com',
    summary: 'CV sent to a client company without his permission.',
    acknowledgedOn: '2026-11-03', triage: { by: 'form' },
    events: [ev('2026-11-02', 'Received through Brightpath Recruitment (sample)’s public form', 'created'), ev('2026-11-03', 'Acknowledgement sent on 3 Nov 2026', 'ack')],
  },
  {
    id: 'c05', ref: 'PD-BPR03', orgId: 'bpr', type: 'sar', channel: 'Email', receivedOn: '2026-10-15',
    requesterName: 'Dana Whitfield', requesterEmail: 'dana.whitfield@example.com',
    summary: 'Former contractor asks for all data held over six years.',
    pauses: [{ from: '2026-10-16', to: null }], acknowledgedOn: '2026-10-16',
    events: [ev('2026-10-15', 'Case created from a pasted message (keyword check; logged as sar)', 'created'), ev('2026-10-16', 'Clarification requested 16 Oct 2026; clock stopped: which placements and which years', 'pause')],
  },
  {
    id: 'c06', ref: 'PD-MDP01', orgId: 'mdp', type: 'sar', channel: 'Email', receivedOn: '2026-09-14',
    requesterName: 'Sam Rivers', requesterEmail: 'sam.rivers@example.com',
    summary: 'Patient asks for full dental records including X-rays from two practices.',
    extended: true, extendedOn: '2026-10-01', acknowledgedOn: '2026-09-15',
    events: [ev('2026-09-14', 'Case logged by hand (email)', 'created'), ev('2026-09-15', 'Acknowledgement sent on 15 Sep 2026', 'ack'), ev('2026-10-01', 'Extended to three months; person told 1 Oct 2026. Reason: records held at two practices and an archive', 'extend')],
  },
  {
    id: 'c07', ref: 'PD-MDP02', orgId: 'mdp', type: 'complaint', channel: 'Phone', receivedOn: '2026-09-02',
    requesterName: 'Leah Burns', requesterEmail: 'leah.burns@example.com',
    summary: 'Treatment details discussed loudly at reception in front of others.',
    acknowledgedOn: '2026-09-04', status: 'closed', closedOn: '2026-09-25',
    outcome: 'Apology given; reception staff retrained on confidential calls.',
    events: [ev('2026-09-02', 'Case logged by hand (phone)', 'created'), ev('2026-09-04', 'Acknowledgement sent on 4 Sep 2026', 'ack'), ev('2026-09-25', 'Closed 25 Sep 2026: Apology given; reception staff retrained on confidential calls.', 'close')],
  },
  {
    id: 'c08', ref: 'PD-HBL03', orgId: 'hbl', type: 'erasure', channel: 'Email', receivedOn: '2026-10-28',
    requesterName: 'Chris Penn', requesterEmail: 'chris.penn@example.com',
    summary: 'Unsuccessful applicant asks for references and ID copies to be deleted.',
    events: [ev('2026-10-28', 'Case created from a pasted message (AI triage: erasure, 88% confident)', 'created')],
  },
  {
    id: 'c09', ref: 'PD-MDP03', orgId: 'mdp', type: 'sar', channel: 'Web form', receivedOn: '2026-08-11',
    requesterName: 'Nadia Ellis', requesterEmail: 'nadia.ellis@example.com',
    summary: 'Copy of treatment notes for an insurance claim.',
    acknowledgedOn: '2026-08-11', status: 'closed', closedOn: '2026-09-08', outcome: 'Records sent by secure email.',
    events: [ev('2026-08-11', 'Received through Meadow Dental Practice (sample)’s public form', 'created'), ev('2026-09-08', 'Closed 8 Sep 2026: Records sent by secure email.', 'close')],
  },
  {
    id: 'c10', ref: 'PD-HBL04', orgId: 'hbl', type: 'complaint', channel: 'Email', receivedOn: '2026-08-20',
    requesterName: 'Morgan Price', requesterEmail: 'morgan.price@example.com',
    summary: 'Deposit dispute emails copied to the wrong tenant.',
    acknowledgedOn: '2026-09-22', status: 'closed', closedOn: '2026-10-10',
    outcome: 'Wrong recipient asked to delete; email process changed to check recipients.',
    events: [ev('2026-08-20', 'Case created from a pasted message (AI triage: complaint, 90% confident)', 'created'), ev('2026-09-22', 'Acknowledgement sent on 22 Sep 2026', 'ack'), ev('2026-10-10', 'Closed 10 Oct 2026: Wrong recipient asked to delete; email process changed to check recipients.', 'close')],
  },
  {
    id: 'c11', ref: 'PD-BPR04', orgId: 'bpr', type: 'complaint', channel: 'Email', receivedOn: '2026-11-06',
    requesterName: 'Ruth Adeyemi', requesterEmail: 'ruth.adeyemi@example.com',
    summary: 'Still getting job alerts after asking to be removed; unhappy her details were kept.',
    triage: { by: 'ai', type: 'complaint', confidence: 0.81 },
    events: [ev('2026-11-06', 'Case created from a pasted message (AI triage: complaint, 81% confident; also mentions objection)', 'created')],
  },
];

const docs = [];
for (const o of orgs) {
  const { id, ...data } = o;
  docs.push({ path: `orgs/${id}`, data: { ...data, createdAt: '2026-08-01T09:00:00.000Z' } });
}
for (const c of cases) {
  const { id, ...rest } = c;
  const created = rest.events[0].at;
  const updated = rest.events[rest.events.length - 1].at;
  docs.push({ path: `cases/${id}`, data: { ...base, ...rest, createdAt: created, updatedAt: updated } });
}
docs.push({ path: 'config/desk', data: { internalTargetDays: 28 } });

if (require.main === module) process.stdout.write(JSON.stringify(docs));
module.exports = docs;
