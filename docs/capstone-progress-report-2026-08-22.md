# Capstone Project Progress Form: draft answers

**Date:** 2026-08-22
**Programme:** CWC Research, National Health Fellows Mentorship Program
**Project:** PHC-Track, Nnewi North PHC Digital Health Platform
**Status:** Draft for the fellow's review before submission

---

## How to use this document

Each numbered heading matches a field on the form. Copy the text under it.

Two markers appear throughout:

- **`[CONFIRM]`** means the answer is drafted from the repository and should be
  checked against what actually happened in the programme.
- **`[YOUR INPUT NEEDED]`** means the answer cannot be derived from the project
  files at all. It concerns people, meetings, dates or permissions that only the
  fellow knows. **Do not submit these as written.**

Everything without a marker is verifiable against the repository, the test
suites, or the screenshots in [`docs/evidence/`](evidence/).

> **A note on honesty.** This project has not yet been deployed in a clinic. No
> patient has used it and no facility is running it in service. Several fields
> below say so plainly. That is the correct answer for a build-stage capstone,
> and it is far safer than a number that cannot be defended if a mentor asks how
> it was measured.

---

## 1. Project Title

```
PHC-Track: An Offline-First Digital Health Record and Reporting Platform for
Primary Health Centres in Nnewi North LGA, Anambra State
```

## 2. Project Description

```
PHC-Track is an offline-first digital health record system for the Primary
Health Centres of Nnewi North Local Government Area, Anambra State. It replaces
paper registers and card files with a single patient record that any authorised
PHC in the LGA can use, that keeps working when the network is down, and that
produces the monthly NHMIS returns the health system already requires as a
by-product of ordinary clinical work.

The core problem it addresses is that PHC documentation is paper-based and the
connectivity that most digital health tools assume is not reliably present.
Files are misplaced, patient history is slow to retrieve, antenatal and
immunization follow-up depends on manual registers, and the monthly report is
assembled by hand from those registers.

The system is built as a Progressive Web App that installs on a low-end Android
device and holds the full clinical workflow on the device itself. Care never
waits for the network. When a connection returns, the device reconciles with a
central sync hub, and conflicting edits are resolved by documented per-record
rules rather than by whichever device happens to connect last.

It covers patient registration and records, maternal and antenatal care,
childhood immunization scheduling, the clinic queue, NHMIS-aligned monthly
reporting with DHIS2 export, role-based access control, and an audit trail.
It is designed for self-hosting inside Nigeria, in line with the Nigeria Data
Protection Act 2023.
```

## 3. Primary Project Type

```
Digital Health
```

## 4. Additional Classifications

```
Innovation
Data or M&E
```

**Reasoning.** *Innovation* covers the offline-first sync engine, which is the
genuinely novel part. *Data or M&E* covers the NHMIS-aligned reporting and DHIS2
export. Do not tick *Community Intervention* or *Research*: no community
deployment and no study have taken place yet.

## 5. Digital Platform URL (Optional)

```
https://github.com/OG-001/Nnewi-North-Medtrack
```

**`[CONFIRM]`** This is the source code repository, not a hosted application.
There is no public deployment yet. **The repository is currently public**, so
confirm you are willing for it to be viewed before submitting this link. If not,
leave the field blank and rely on the screenshots and video instead.

## 6. Pitch Video URL (Optional)

```
[YOUR INPUT NEEDED]
```

No pitch video exists in the project files. Leave blank, or record one and add
the link. The screen recording at
[`docs/evidence/video/`](evidence/video/) is a product demonstration, not a
pitch, so it belongs in the video upload field rather than here.

## 7. Innovation Name (Optional)

```
PHC-Track Offline-First Sync Engine
```

## 8. Innovation Description (Optional)

```
Most digital health tools fail in primary care because they assume a working
internet connection at the point of care. PHC-Track inverts that assumption: the
clinic device is the system of record during a session, and the central hub is
eventually consistent. Care never waits for the network; the network catches up
to care.

The innovation is the sync engine that makes this safe. Every record is created
with an identifier generated on the device, so a patient registered with no
network has a stable identity before the hub ever sees them. Every write is
committed to the device together with an outbox entry and an audit entry in a
single transaction, so a crash cannot half-record a clinical fact. When
connectivity returns, the device pushes its own work before pulling anyone
else's, resuming from exactly where an interrupted transfer stopped and never
duplicating a record that was already sent.

Where two health workers edit the same record while both are offline, resolution
follows rules chosen to match clinical reality rather than a generic
last-write-wins. Clinical events such as visits and immunization doses are never
overwritten, because each is its own record. Workflow states only ever move
forward, so two stations advancing the same patient converge instead of undoing
each other. Demographic corrections merge field by field. A genuine contradiction
on an identity-critical field, such as two different dates of birth for the same
patient, is escalated to an administrator with both versions preserved, and is
never silently resolved.

A device only ever receives and holds records for the facilities its user is
authorised for, enforced on the server, so one PHC's patient data cannot reach
another PHC's device.
```

## 9. Prototype/Demo URL (Optional)

```
[YOUR INPUT NEEDED]
```

There is no hosted demo. The application can be run locally in minutes using
[`RUNNING.md`](../RUNNING.md), and the evidence uploads show it working. If a
demo link is expected, the system is Docker-packaged and could be hosted, but
that is a decision about cost, ownership and patient-data residency that should
be made deliberately.

## 10. Current Project Stage

```
Functional prototype complete and internally tested; pre-pilot. Development is
substantially complete for the pilot-ready feature set, and the project is now
at the point of preparing for a supervised pilot at one or two Primary Health
Centres.
```

**`[CONFIRM]`** Match this wording to whatever stage vocabulary the form offers
if it is a dropdown rather than free text.

## 11. Percent Complete

```
75
```

**Basis for the number, so it can be defended.** The build plan defines eleven
phases, numbered 0 to 10.

| Status | Phases |
|--------|--------|
| Complete | 0, 1, 2, 3, 4, 5, 6, 9 |
| Partly complete | 8 |
| Not started | 7, 10 |

Phase 8 (reporting) has its facility-side reporting and DHIS2 export working,
while the server-side reporting projection is deferred. Phase 7 is SMS reminders.
Phase 10 is production hardening, deployment and pilot rollout, and it is
deliberately the last phase. That gives 8.5 of 11, which rounds to roughly 75%
of the software build. It is **not** 75% of the overall project, because the
pilot itself is still ahead.

## 12. Key Activities Completed

```
1. Requirements and design. Produced a complete build blueprint covering the
   product scope, the ten functional modules, seven user roles with a permission
   matrix, the data model, the offline sync design, the API contract, and the
   security and compliance position under the Nigeria Data Protection Act 2023.

2. Compiled the facility registry. All 76 health facilities in Nnewi North LGA
   are encoded with their national facility codes, ownership and ward, so the
   system is LGA-wide by construction rather than single-site.

3. Built the offline-first clinical application. Patient registration and
   records, maternal and antenatal care with a schedule engine, childhood
   immunization with the routine EPI schedule, the clinic queue, role-based
   access control, an audit trail, and the installable app shell.

4. Built the NHMIS reporting module, generating monthly facility summaries from
   the same live clinical data, with DHIS2 and CSV export.

5. Built the central sync hub. A server with facility-scoped authentication, a
   change ledger, the push and pull protocol, rule-based conflict resolution,
   and an administrator queue for contradictions needing human judgement.

6. Implemented cross-facility data isolation in three layers: sign-in scoped to
   a facility, every on-device query filtered by facility, and server-side
   enforcement so that even a tampered device cannot request another facility's
   records.

7. Tested to the plan's own release-blocking criteria. 45 automated tests now
   run: conflict-resolution rules, live protocol tests against a running server
   including interrupted-transfer recovery and volume, on-device durability
   tests, and browser tests that drive real clinic workflows with the network
   switched off.

8. Packaged the whole system with Docker for self-hosting inside Nigeria, and
   maintained a change log recording what shipped, decisions taken, and where the
   build deviates from the plan.
```

## 13. Key Outputs Generated

```
1. A working offline-first Progressive Web App covering the pilot-ready clinical
   workflow, installable on a low-end Android device.

2. A central sync hub with facility-scoped authentication, a change ledger, and
   rule-based conflict resolution.

3. A shared domain library holding the logic both sides must agree on: the
   immunization schedule engine, the antenatal contact schedule, expected
   delivery date arithmetic, the permission matrix, offline-safe Medical Record
   Number generation, and the LGA facility registry.

4. NHMIS-aligned monthly reporting with DHIS2 and CSV export.

5. An automated test suite of 45 tests, including offline browser tests and
   live-server protocol tests, covering the no-data-loss guarantees.

6. A complete technical documentation set: master plan, six architecture
   documents, eleven phase plans, product specifications, and a per-phase change
   log.

7. Deployment packaging: Docker images and a Compose stack for self-hosting.

8. Demonstration evidence: 15 screenshots and a screen recording of the offline
   to reconciled workflow, in docs/evidence/.
```

## 14. Target Beneficiaries Reached

```
Direct beneficiaries reached to date: 0.

The platform has not yet been deployed in any health facility and no patient
record has been created outside the development and demonstration environment.
Reporting any other figure at this stage would misrepresent the project.

Designed reach, on pilot and rollout:

- Pilot, planned for one to two Primary Health Centres: the patients attending
  those facilities, with antenatal and immunization attendees as the priority
  groups, plus the clinical and records staff who operate the system.
- Full LGA rollout: all 76 health facilities in the Nnewi North LGA registry are
  already encoded in the system, so the platform is built for LGA-wide reach
  rather than a single site.

Beneficiary groups the design prioritises: pregnant women in antenatal care,
nursing mothers and infants, children in the routine immunization schedule, and
general outpatients. Indirect beneficiaries are the LGA health authority and
monitoring and evaluation officers, who receive accurate monthly returns.
```

**`[YOUR INPUT NEEDED]`** If you have demonstrated the system to health workers,
facility staff or LGA officers, add that here as *people engaged in
demonstration*, with the number and the date. Keep it clearly separate from
beneficiaries served, which remains zero.

## 15. Geographical Implementation Locations

```
Nnewi North Local Government Area, Anambra State, Nigeria.

The system encodes the complete Nnewi North LGA facility registry: all 76 health
facilities with their national facility codes, ward, town and ownership.

Two facilities are configured as the reference sites in the demonstration build:

- Primary Health Centre Umuenem Otolo Nnewi, national code 04/14/1/1/0062
- Obiagu Health Post, Uruagu, Nnewi, national code 04/14/1/1/0060

These are real facilities from the LGA registry used as the demonstration
configuration. No software has been installed at either site, and neither has
been approached as a pilot host on the basis of this build.
```

**`[YOUR INPUT NEEDED]`** If a pilot facility has actually been approached or
agreed, replace the final sentence with what was agreed and when.

## 16. Key Stakeholders Engaged

```
[YOUR INPUT NEEDED]
```

This cannot be drafted from the project files. The documentation names the
intended stakeholder groups, but naming them as *engaged* when no record of
engagement exists would be a false statement on a formal submission.

The intended stakeholder groups, as a prompt for what to fill in:

- Nnewi North LGA health authority, and monitoring and evaluation officers
- Officers-in-charge of the candidate pilot Primary Health Centres
- PHC clinical staff: nurses and midwives, records clerks, Community Health
  Extension Workers
- The National Primary Health Care Development Agency, and the state primary
  health care board
- The CWC Research mentorship team
- A data controller and Data Protection Officer for the deployment, which the
  plan records as an unresolved question and which the pilot requires

For each stakeholder you did engage, record who, their role, the date, and the
outcome.

## 17. Implementation Challenges Encountered

```
1. Building for genuinely unreliable connectivity. The hard part is not storing
   data locally, it is reconciling two health workers who both edited the same
   record while offline without losing or duplicating clinical information. This
   is the highest-risk component in the system and it drove the design.

2. Proving the offline guarantee rather than asserting it. Early automated tests
   passed while running against a development server that has no offline support
   at all, so they proved nothing about the behaviour that matters. The tests had
   to be rebuilt against the production build.

3. Defects that only appear against a real database. Two faults survived unit
   testing and were caught only by running the full system against a real
   PostgreSQL instance. In one, a record re-sent after a dropped acknowledgement
   was treated as a new edit, so a retry inflated the record history. In the
   other, the database does not preserve the ordering of stored fields, which
   defeated the comparison used to recognise a repeat transmission.

4. A contract mismatch that made the sync hub reject every clinical record. The
   application and the hub used different names for the same record type. Both
   sides' unit tests passed because both used the same incorrect name. It was
   found only by running the complete end-to-end workflow and inspecting what
   actually arrived at the server.

5. Cross-facility data isolation had been enforced only on the device. A device
   could still, in principle, request another facility's records from the server.

6. Performance on the target hardware. The system targets low-end Android
   devices on slow networks, which constrains how much data may be transferred
   when a device first enrols.
```

**`[YOUR INPUT NEEDED]`** Add any non-technical challenges: access to
facilities, permissions, mentor availability, funding, time alongside other
commitments. A progress report that lists only engineering challenges reads as
incomplete.

## 18. Solutions Implemented or Planned

```
1. Conflict resolution was designed per record type rather than generically, and
   built as a separately testable component. Clinical events are never
   overwritten. Workflow states only move forward. Demographic edits merge field
   by field. Identity-critical contradictions escalate to an administrator with
   both versions preserved, and are never silently resolved. 21 tests cover these
   rules, one per documented case.

2. The offline browser tests were moved onto the production build, where the
   service worker that provides offline capability actually exists. Seven tests
   now confirm that the app opens and signs in with the network cut, that records
   registered offline survive a reload and a full airplane-mode cycle, and that
   every offline write is kept rather than only the most recent.

3. Both database-only defects were fixed and each has a regression test.
   Recognition of a repeat transmission now compares record content rather than
   revision numbers, and the comparison ignores field ordering.

4. The record-type mismatch was fixed by making the application's own record
   naming the single authority, and by adding a contract test that compares the
   three places a record type is named and fails if they ever diverge again. That
   test is the real fix; the rename alone would have left the same trap open.

5. Server-side facility scope enforcement was implemented. A request naming a
   facility outside the user's authorisation is refused, and a record carrying
   another facility's identifier is rejected. This closes the third and final
   isolation layer, which the plan had listed as deferred.

6. The initial data transfer to a newly enrolled device is bounded by record
   age, so the patient roster and active pregnancies arrive in full while older
   history is fetched on demand. Measured against a facility-sized dataset, the
   full transfer completes in well under a second.

Planned:

7. SMS reminders for antenatal and immunization defaulters, built
   provider-agnostically so a provider can be changed without a code change, and
   gated on recorded patient consent.

8. Production hardening and a supervised pilot: backup and restore rehearsal,
   security review, staff training materials, and baseline measurement in the
   pilot's first weeks.
```

## 19. Next Steps/Action Plan

```
1. Owner sign-off on the sync test matrix. Every release-blocking test is written
   and passing; the remaining step is formal acceptance, which is the gate that
   makes a pilot viable.

2. Resolve the outstanding governance questions the plan records as open, in
   particular where the system will be hosted inside Nigeria, and who is named as
   data controller and Data Protection Officer. The pilot cannot lawfully begin
   without the second.

3. Confirm the immunization schedule against current NPHCDA guidance. It is
   stored as editable configuration rather than code precisely so it can be
   corrected without a software change, but it must be verified before real
   children are scheduled against it.

4. Build the SMS reminder module for antenatal and immunization defaulters.

5. Complete the server-side reporting projection so that LGA-level monthly
   returns are generated centrally.

6. Production hardening: security review, backup and restore rehearsal,
   monitoring, and a rollback plan.

7. Agree a pilot site and secure written approval from the LGA health authority
   and the facility officer-in-charge.

8. Measure the baseline in the pilot's first weeks, before the system changes
   anything, so that improvement can be demonstrated rather than asserted.

9. Train pilot staff and run a supervised pilot at one or two PHCs, with
   paper-based fallback retained throughout.

10. Review pilot findings, then decide on LGA-wide rollout.
```

**`[YOUR INPUT NEEDED]`** Add target dates against each step.

## 20. Expected Completion Date

```
[YOUR INPUT NEEDED]
```

This depends on pilot approvals and on your programme timeline, neither of which
is in the project files. Two dates are worth distinguishing: completion of the
software build, which is nearer, and completion of the pilot, which is what the
capstone is likely to be assessed on.

## 21. Date

```
2026-08-22
```

## 22. Project Baseline Data

```
No baseline has been collected yet, because the system has not been deployed and
baseline measurement is a pilot activity. The plan states explicitly that
baselines must be measured in the pilot's first weeks and must not be assumed.

The baseline to be captured at the pilot site, before the system changes
anything, covers:

- Time taken to register a new patient, and to retrieve a returning patient's
  record, from the paper register.
- Time taken to compile the monthly NHMIS return by hand.
- Completeness of key fields in the existing paper registers.
- Antenatal attendance against expected visits, and the current defaulter count.
- Immunization coverage for age, and the dropout rate between the first Penta
  dose and the first Measles dose, which is a standard EPI quality indicator.
- Proportion of clinic working time with no usable network connection, which is
  what validates the offline-first investment.

Technical baselines already measured in the development environment, which will
serve as the performance reference during the pilot:

- Initial data transfer to a newly enrolled device: a facility-sized dataset
  transfers in under one second.
- A device already up to date completes a sync check in under one second.
- 45 automated tests pass, covering the no-loss and no-duplication guarantees.
```

## 23. Key Performance Indicators (KPIs)

```
Adoption and operational

1. Proportion of patient encounters captured digitally at the pilot site,
   trending toward full capture within the pilot window.
2. Median time to register a new patient, and to retrieve a returning patient's
   record, against the paper baseline.
3. Proportion of working time the application is used with no network, which
   validates the offline-first design.

Clinical and programme

4. Antenatal follow-up: proportion of expected ANC visits attended, and the trend
   in the defaulter list.
5. Immunization: proportion of children up to date for age, and the dropout rate
   between the first Penta dose and the first Measles dose.
6. Once SMS reminders are live, the conversion from reminder sent to visit
   attended.

Reporting and data quality

7. Time taken to produce the monthly facility report, against the paper baseline.
8. Field completeness on key clinical forms.
9. Monthly DHIS2 export completed with no manual re-entry.

Reliability, which is the offline-first claim itself

10. Sync success rate, and median time from reconnection to fully reconciled.
11. Count of unresolved data conflicts, with a target of zero.
12. Confirmed incidents of clinical data loss, with a target of zero. This is the
    project's cardinal measure.
```

## 24. Measurement Methodology

```
Mixed methods, combining measurement the system produces automatically with
observation and staff feedback.

1. System-generated measurement. The platform records timing and completeness as
   a by-product of use: when a record was created, by whom, at which facility,
   and whether the device was offline at the time. Adoption, timing, completeness
   and reliability indicators are read from this rather than from a separate data
   collection exercise. All comparisons are made against the paper baseline
   captured before deployment.

2. Before-and-after comparison at the pilot site. Baseline measured in the
   pilot's first weeks, then the same indicators re-measured at defined intervals
   during the pilot, so each indicator is compared against itself.

3. Direct timing observation. Registration and record-retrieval times are timed
   directly for a sample of patient interactions on paper, then repeated on the
   system, because self-reported timings are unreliable.

4. Register reconciliation. Digital records are reconciled against the paper
   register during the pilot, since paper is retained as fallback. This is the
   check on the no-data-loss claim: any record present on paper and absent
   digitally is an incident to be investigated, not a statistic.

5. Clinical programme indicators. Antenatal attendance and immunization coverage
   follow standard NHMIS definitions, so figures remain comparable with routine
   LGA reporting rather than being project-specific.

6. Staff feedback. Structured feedback from the health workers using the system,
   covering usability, time burden, and confidence in the record. A system that
   measures well but is disliked by staff will not survive past the pilot.

7. Technical reliability. Sync success, time to reconcile, and conflict counts
   are read from the system's own logs and administrator queue. Any conflict
   needing human resolution is reviewed individually rather than counted only.

Ethical position: all reporting uses aggregate figures. No identifiable patient
record leaves the facility for monitoring purposes, in line with the data
minimisation and purpose limitation principles of the Nigeria Data Protection
Act 2023.
```

## 25. Sustainability Strategy

```
1. Low and predictable running cost. The system is self-hosted and runs on
   commodity infrastructure. There is no per-user licence and no external service
   the platform depends on to keep functioning. A facility device is a low-end
   Android tablet, not specialised hardware.

2. No dependence on connectivity. Because the system works offline by design, it
   does not fail when a facility's connectivity degrades, which is the usual
   reason digital health tools are abandoned after a pilot.

3. Data stays in the country and under local control. Self-hosted in Nigeria in
   line with the Nigeria Data Protection Act 2023, so the LGA is not dependent on
   a foreign provider's terms or continued operation.

4. Fits the existing workflow and the existing reporting obligation. The system
   mirrors how PHC staff already work and produces the NHMIS returns they are
   already required to file, so it reduces work rather than adding a parallel
   process. Ownership is far more likely where the tool removes a burden.

5. Configuration rather than code. Immunization and antenatal schedules and
   message templates are editable configuration, so guidance changes do not
   require a developer.

6. Maintainability. The codebase is documented, automatically tested, and
   packaged for deployment, so it can be handed to another team without relying
   on its original author.

7. Staged rollout. Pilot at one or two facilities, learn, then extend across the
   LGA, rather than an LGA-wide launch that cannot be supported.
```

**`[YOUR INPUT NEEDED]`** The form is likely to expect institutional
sustainability as well: who owns the system after the fellowship, who funds
hosting, and who maintains it. Those are recorded in the project plan as
unresolved. If you have a view or an agreement, state it. If not, say it is under
discussion, which is honest and is a legitimate thing to raise with mentors.

## 26. Stakeholder Support Received

```
[YOUR INPUT NEEDED]
```

Nothing in the project files records support received. Name the individuals or
institutions, what they provided (guidance, access, data, endorsement, funding,
time), and when. If the honest answer is that support so far has been limited to
the mentorship programme, say that.

## 27. Support Needed (Optional)

```
1. Introduction to and endorsement from the Nnewi North LGA health authority, to
   agree a pilot site and secure formal approval for a supervised pilot.

2. Guidance on the data protection obligations for a live deployment, and help
   identifying who should be named as data controller and Data Protection
   Officer. The pilot cannot lawfully begin without this.

3. Verification of the routine immunization schedule and the antenatal contact
   model against current NPHCDA guidance, by someone qualified to confirm it.
   These are stored as editable configuration for exactly this reason.

4. Access to one or two Primary Health Centres for the pilot, including the
   officer-in-charge's agreement and staff time for training.

5. Modest funding for pilot hardware and hosting: Android tablets for the pilot
   facilities and a server hosted in Nigeria.

6. Guidance on the institutional home for the platform after the fellowship, so
   it is maintained rather than becoming an orphaned pilot.

7. Review of the monthly report format against what the LGA actually files, so
   that the export is accepted without manual rework.
```

## 28. Project Evidence (up to 5 images)

Fifteen screenshots are in [`docs/evidence/screenshots/`](evidence/screenshots/).
For a five-image limit, upload these, in this order:

| Order | File | Why this one |
|-------|------|--------------|
| 1 | `01-facility-selection-all-phcs.png` | Shows all 76 LGA facilities, so the scope is LGA-wide |
| 2 | `04-facility-dashboard.png` | The working product a health worker sees |
| 3 | `13-offline-patient-registration.png` | Registering a patient with the network cut |
| 4 | `15-reconciled-with-sync-hub.png` | The same record reconciled after reconnection |
| 5 | `11-nhmis-reporting-dhis2-export.png` | The NHMIS and DHIS2 output the health system needs |

Images 3 and 4 are the pair that carries the project's central claim. Keep them
adjacent.

All data shown is synthetic demonstration data. No real patient data appears in
any image.

## 29. Video Evidence Upload

```
docs/evidence/video/phc-track-offline-sync-demo.webm
```

A single unedited take: sign in at a Primary Health Centre, cut the network,
register a patient with no connectivity, reconnect, and watch the record
reconcile with the central hub.

**`[CONFIRM]`** The file is WebM. If the portal accepts only MP4, convert it
first. The command is in [`docs/evidence/README.md`](evidence/README.md).

## 30. Supporting Evidence URL (Optional)

```
https://github.com/OG-001/Nnewi-North-Medtrack
```

**`[CONFIRM]`** Same caution as field 5: the repository is public. It contains
the full technical documentation set, which is strong supporting evidence, but
confirm you want it visible.

## 31. Declaration

```
[YOUR INPUT NEEDED]
```

This is your declaration to make, not a field to be drafted. Read the completed
form first and satisfy yourself that every figure in it is one you could defend
if a mentor asked how it was measured.

## 32. Additional Comments (Optional)

```
This submission covers a build-stage capstone. The software is substantially
complete and internally tested, and it has not yet been deployed in a health
facility. Fields concerning beneficiaries reached and baseline data reflect that
honestly: no patient has yet been served, and no baseline has yet been measured,
because both are pilot activities.

The engineering has been held to a deliberately strict standard, given that the
system will hold patient health records. Cross-facility data isolation is
enforced in three independent layers. Clinical data is never hard-deleted. Every
change is audited. The guarantees that matter clinically, that no record is lost
and none is duplicated, are covered by automated tests that must pass before any
release.

Three defects found during testing are worth mentioning, because how they were
found is the point. Each passed unit testing and was caught only by running the
complete system against a real database: a retried transmission being treated as
a new edit, a field-ordering assumption that defeated duplicate detection, and a
naming mismatch that caused the server to reject every clinical record. All three
are fixed, and each now has a test that fails if the fault returns. In a system
holding patient records, the discipline that catches this class of fault before
deployment matters more than the feature list.
```

---

## Fields still needing your input, at a glance

| Field | What is needed |
|-------|----------------|
| 6. Pitch Video URL | A pitch video, if one is expected |
| 9. Prototype/Demo URL | Whether to host a demo |
| 16. Key Stakeholders Engaged | Who you actually engaged, and when |
| 17. Challenges | Any non-technical challenges |
| 19. Next Steps | Target dates |
| 20. Expected Completion Date | Build date and pilot date |
| 25. Sustainability | Institutional owner, funder, maintainer |
| 26. Stakeholder Support Received | What support you actually received |
| 31. Declaration | Yours to make |

Also confirm, in fields 5 and 30, that you are content for the repository to be
viewed, since it is currently public.
