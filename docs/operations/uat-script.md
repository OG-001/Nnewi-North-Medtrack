# User acceptance testing script

**Run on:** staging, with synthetic data only. Never run UAT against real
patient records.

**Purpose:** each role confirms the system does their actual job before the
pilot. Automated tests prove the code behaves; UAT proves the workflow fits.

Sign-off is per role. A tester who cannot complete their script has found a
blocker, and recording it as such is the point of the exercise.

---

## How to record a result

| Field | Value |
|-------|-------|
| Tester | Name and role |
| Date | YYYY-MM-DD |
| Result | Pass, Pass with comment, or Fail |
| Comment | What was confusing, slow, or wrong |

---

## 1. Records clerk

1. Open the app. Choose your facility from the door screen.
2. Sign in with your username and PIN.
3. Register a new patient with full details. Confirm an MRN is issued.
4. Register a second patient using the **same phone number**. Confirm the
   duplicate warning appears and that you must acknowledge it to continue.
5. Search for the first patient by name, then by phone, then by MRN.
6. Add a patient to today's queue.
7. **Turn off the network.** Register a third patient. Confirm it saves and the
   indicator reads Offline.
8. Turn the network back on. Confirm the indicator returns to Synced.

## 2. Nurse or midwife

1. Sign in. Open a patient with an active pregnancy.
2. Record an ANC contact with vitals, TT, IPTp and IFA.
3. Confirm the next contact is scheduled automatically.
4. Open the ANC defaulter list. Confirm overdue patients appear.
5. Send a reminder to a defaulter who has SMS consent.
6. Find a patient **without** consent. Confirm you are told no consent is on
   file rather than the message being sent.
7. Open a child's immunization card. Record a dose. Confirm the card updates and
   the next dose is scheduled.
8. **Turn off the network.** Record a visit. Confirm it saves.

## 3. CHEW

1. Sign in. Open the immunization overdue recall list.
2. Confirm you can see which children are overdue and for what.
3. Send a recall message to one of them.
4. Confirm the send is recorded.

## 4. Doctor or medical officer

1. Sign in. Open a patient from the queue.
2. Review the full visit history on one screen.
3. Record a consultation with a diagnosis and a prescription.
4. Create a referral. Confirm it appears in the patient's history.

## 5. Facility administrator (officer-in-charge)

1. Sign in. Open the admin dashboard.
2. Review facilities, staff, and the audit log.
3. Open the SMS tab. Edit a template and confirm the preview updates. Save it.
4. Confirm a template with an invalid merge field is refused.
5. Open Reports. Select last month.
6. Check a figure against your paper register. **This is the most important
   step in the whole script.**
7. Lock the month. Confirm it reads Locked and cannot be locked twice.
8. Export CSV and DHIS2. Open both files.
9. Confirm a correction after locking is recorded as an adjustment and that the
   original figure is still visible.

## 6. LGA authority / M&E

1. Sign in with the oversight account.
2. Confirm you can see across facilities.
3. Open the LGA rollup for a month.
4. Confirm it reports how many facilities are included, and that facilities which
   have not locked their month are excluded.
5. Confirm you **cannot** edit clinical data.

## 7. Cross-facility isolation (any two clinical testers)

Run this together. It is the guarantee patients are owed.

1. Tester A signs in at facility A and registers a patient.
2. Tester B signs in at facility B.
3. Confirm tester B **cannot** see that patient.
4. Confirm tester A's account **cannot** sign in at facility B.

## 8. The offline guarantee (all testers together)

1. Everyone works normally for ten minutes with the network off: register,
   record visits, record doses.
2. Confirm nothing blocks and nothing is lost.
3. Reconnect. Confirm every device reaches Synced.
4. Confirm each tester's work is visible to the others at the same facility.
5. Count the records created and confirm the count at the hub matches. **No
   loss and no duplication is the cardinal requirement.**

---

## Sign-off

| Role | Tester | Date | Result |
|------|--------|------|--------|
| Records clerk | | | |
| Nurse / midwife | | | |
| CHEW | | | |
| Doctor / MO | | | |
| Facility administrator | | | |
| LGA authority / M&E | | | |

**Owner approval to begin the pilot:** ______________________  Date: __________
