# Project evidence

Screenshots and a screen recording captured from the running application on
2026-08-22, for the National Health Fellows capstone progress submission.

All data shown is **seeded demo data**, not real patient data. Names, phone
numbers and Medical Record Numbers are synthetic, per
[`.claude/rules/ndpa-compliance.md`](../../.claude/rules/ndpa-compliance.md).

## How these were produced

Both scripts drive the real application through a headless browser. Nothing is
mocked up or drawn.

```bash
# Terminal 1: the sync hub
docker compose -f infra/docker-compose.yml up -d postgres
pnpm db:migrate && pnpm db:seed
pnpm --filter @phc/api build && pnpm dev:api

# Terminal 2: the PWA, built against that hub
VITE_API_BASE_URL="http://localhost:3000/api/v1" pnpm build
pnpm preview

# Terminal 3: capture
cd apps/web
node scripts/capture-evidence.mjs        # screenshots 01 to 11
node scripts/capture-offline-demo.mjs    # screenshots 12 to 15, plus the video
```

## Screenshot index

| File | Shows |
|------|-------|
| `01-facility-selection-all-phcs.png` | Door screen listing the LGA facility registry |
| `02-facility-search.png` | Search narrowing the facility list |
| `03-facility-scoped-login.png` | Sign-in scoped to the chosen PHC |
| `04-facility-dashboard.png` | Facility dashboard, live sync status |
| `05-patient-register-search.png` | Patient register with search |
| `06-patient-registration-form.png` | Structured registration form |
| `07-patient-record-emr.png` | Patient record and visit history |
| `08-maternal-anc-tracking.png` | Antenatal care schedule and defaulters |
| `09-immunization-epi-schedule.png` | Childhood immunization due and overdue |
| `10-clinic-queue.png` | Clinic queue by station |
| `11-nhmis-reporting-dhis2-export.png` | NHMIS monthly summary, DHIS2 and CSV export |
| `12-offline-indicator.png` | Connectivity indicator showing Offline |
| `13-offline-patient-registration.png` | Registering a patient with the network cut |
| `14-offline-record-saved.png` | Record saved offline, Medical Record Number issued on device |
| `15-reconciled-with-sync-hub.png` | Back online, reconciled, patient count increased |

## Video

`video/phc-track-offline-sync-demo.webm` is a single unedited take of the
sequence in screenshots 12 to 15: sign in, cut the network, register a patient,
reconnect, and watch the record reconcile with the sync hub.

> **Format note.** Playwright records WebM. If the submission portal rejects it,
> convert with `ffmpeg -i phc-track-offline-sync-demo.webm -c:v libx264 phc-track-offline-sync-demo.mp4`.

## Suggested five for a five-image limit

1. `01-facility-selection-all-phcs.png`, the LGA-wide scope.
2. `04-facility-dashboard.png`, the working product.
3. `13-offline-patient-registration.png`, the core differentiator.
4. `15-reconciled-with-sync-hub.png`, the differentiator proven end to end.
5. `11-nhmis-reporting-dhis2-export.png`, the reporting outcome the health system needs.
