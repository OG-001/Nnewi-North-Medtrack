#!/usr/bin/env python3
"""Generate the PHC-Track stakeholder deck.

Usage:  python3 generate_deck.py
Output: PHC-Track-Stakeholder-Overview.pptx (same folder)

Screenshots are read from ./screenshots (captured from the running app).
Re-run after re-capturing screenshots to refresh the deck.
"""
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.util import Emu, Inches, Pt

HERE = Path(__file__).parent
SHOTS = HERE / "screenshots"
OUT = HERE / "PHC-Track-Stakeholder-Overview.pptx"

# Brand palette (matches the app's Tailwind brand colours)
DARK = RGBColor(0x14, 0x53, 0x2D)      # brand.900 — primary dark green
MID = RGBColor(0x05, 0x60, 0x3A)       # brand.800
ACCENT = RGBColor(0x22, 0xC5, 0x5E)    # bright green accent
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
INK = RGBColor(0x1E, 0x29, 0x3B)       # near-black body text
MUTED = RGBColor(0x64, 0x74, 0x8B)     # slate-500
PALE = RGBColor(0xF0, 0xFD, 0xF4)      # green-50 card background

SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)

prs = Presentation()
prs.slide_width = SLIDE_W
prs.slide_height = SLIDE_H
BLANK = prs.slide_layouts[6]


def add_slide(bg=WHITE):
    s = prs.slides.add_slide(BLANK)
    s.background.fill.solid()
    s.background.fill.fore_color.rgb = bg
    return s


def box(slide, left, top, width, height, fill=None, line=None):
    sh = slide.shapes.add_shape(1, left, top, width, height)  # 1 = rectangle
    sh.shadow.inherit = False
    if fill is None:
        sh.fill.background()
    else:
        sh.fill.solid()
        sh.fill.fore_color.rgb = fill
    if line is None:
        sh.line.fill.background()
    else:
        sh.line.color.rgb = line
        sh.line.width = Pt(1)
    return sh


def text(slide, left, top, width, height, runs, align=PP_ALIGN.LEFT,
         anchor=MSO_ANCHOR.TOP, space_after=6):
    """runs: list of paragraphs; each is (text, size, bold, color) or a list of
    such tuples for mixed runs in one paragraph."""
    tb = slide.shapes.add_textbox(left, top, width, height)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    for i, para in enumerate(runs):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.space_after = Pt(space_after)
        parts = para if isinstance(para, list) else [para]
        for t, size, bold, color in parts:
            r = p.add_run()
            r.text = t
            r.font.size = Pt(size)
            r.font.bold = bold
            r.font.color.rgb = color
    return tb


def bullets(slide, left, top, width, height, items, size=15, color=INK,
            title_color=DARK, gap=10):
    """items: list of (heading, body) — heading bold dark-green, body regular."""
    tb = slide.shapes.add_textbox(left, top, width, height)
    tf = tb.text_frame
    tf.word_wrap = True
    first = True
    for heading, body in items:
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.space_after = Pt(2)
        r = p.add_run()
        r.text = "▪  " + heading
        r.font.size = Pt(size)
        r.font.bold = True
        r.font.color.rgb = title_color
        if body:
            p2 = tf.add_paragraph()
            p2.space_after = Pt(gap)
            r2 = p2.add_run()
            r2.text = "    " + body
            r2.font.size = Pt(size - 1.5)
            r2.font.bold = False
            r2.font.color.rgb = color
    return tb


def footer(slide, n, dark=False):
    c = WHITE if dark else MUTED
    text(slide, Inches(0.5), Inches(7.05), Inches(8), Inches(0.4),
         [[("PHC-Track — Nnewi North PHC Digital Health Platform", 10, False, c)]])
    text(slide, Inches(12.3), Inches(7.05), Inches(0.6), Inches(0.4),
         [(str(n), 10, False, c)], align=PP_ALIGN.RIGHT)


def screenshot_slide(n, title, subtitle, image, points, img_side="right"):
    """Standard module slide: text column + UI screenshot with caption strip."""
    s = add_slide()
    # top accent bar
    box(s, 0, 0, SLIDE_W, Inches(0.14), fill=DARK)
    text(s, Inches(0.55), Inches(0.35), Inches(12.3), Inches(0.6),
         [(title, 28, True, DARK)])
    text(s, Inches(0.55), Inches(0.95), Inches(12.3), Inches(0.45),
         [(subtitle, 14, False, MUTED)])

    img_w = Inches(7.55)
    img_h = Inches(4.85)  # 1400x900 ratio ≈ 7.55 x 4.85
    if img_side == "right":
        img_left = SLIDE_W - img_w - Inches(0.55)
        txt_left = Inches(0.55)
    else:
        img_left = Inches(0.55)
        txt_left = img_left + img_w + Inches(0.45)
    img_top = Inches(1.65)

    # framed screenshot
    box(s, img_left - Emu(38100), img_top - Emu(38100),
        img_w + Emu(76200), img_h + Emu(76200), fill=DARK)
    s.shapes.add_picture(str(SHOTS / image), img_left, img_top, img_w, img_h)

    bullets(s, txt_left, Inches(1.75), Inches(4.55), Inches(5.0), points)
    footer(s, n)
    return s


# ---------------------------------------------------------------- 1. Title
s = add_slide(DARK)
box(s, 0, Inches(6.9), SLIDE_W, Inches(0.6), fill=MID)
text(s, Inches(1.0), Inches(2.0), Inches(11.3), Inches(1.0),
     [("✚  PHC-Track", 54, True, WHITE)])
text(s, Inches(1.05), Inches(3.15), Inches(11.3), Inches(0.7),
     [("Nnewi North PHC Digital Health Platform", 26, False, ACCENT)])
text(s, Inches(1.05), Inches(3.95), Inches(10.5), Inches(1.4),
     [("A digital health record, follow-up and reporting system for every "
       "Primary Health Centre in Nnewi North LGA, Anambra State — built to "
       "work fully offline.", 16, False, WHITE)])
text(s, Inches(1.05), Inches(6.0), Inches(11), Inches(0.5),
     [("Stakeholder overview · June 2026", 13, False, RGBColor(0xB9, 0xD9, 0xC6))])

# ---------------------------------------------------------------- 2. Challenge
s = add_slide()
box(s, 0, 0, SLIDE_W, Inches(0.14), fill=DARK)
text(s, Inches(0.55), Inches(0.4), Inches(12), Inches(0.7),
     [("The challenge our PHCs face today", 30, True, DARK)])
cards = [
    ("Paper registers", "Patient folders get lost, histories are rewritten "
     "from memory, and one patient can have several conflicting records."),
    ("Missed follow-ups", "Antenatal contacts and child immunizations are "
     "missed because there is no reliable recall list — defaulters are only "
     "noticed when it is too late."),
    ("Unreliable network & power", "Most digital tools assume constant "
     "internet. In our facilities, connectivity is the exception, not the rule."),
    ("Reporting burden", "Monthly NHMIS summaries are tallied by hand from "
     "registers — slow, error-prone, and hard to verify."),
]
for i, (h, b) in enumerate(cards):
    cx = Inches(0.55) + (i % 2) * Inches(6.25)
    cy = Inches(1.55) + (i // 2) * Inches(2.6)
    box(s, cx, cy, Inches(5.95), Inches(2.3), fill=PALE)
    text(s, cx + Inches(0.3), cy + Inches(0.25), Inches(5.4), Inches(0.5),
         [(h, 18, True, DARK)])
    text(s, cx + Inches(0.3), cy + Inches(0.8), Inches(5.4), Inches(1.4),
         [(b, 13.5, False, INK)])
footer(s, 2)

# ---------------------------------------------------------------- 3. Solution
s = add_slide(DARK)
text(s, Inches(0.55), Inches(0.45), Inches(12), Inches(0.7),
     [("The solution: one offline-first platform", 30, True, WHITE)])
sol = [
    ("Works fully offline, by design", "Every screen reads and writes a secure "
     "store on the device itself. No internet is needed for a single clinic "
     "day — sync happens whenever a connection appears."),
    ("One record per patient, for life", "A unique Medical Record Number, "
     "full visit history, allergies and chronic conditions — visible the "
     "moment the patient is found."),
    ("Automatic clinical schedules", "Antenatal contact dates (WHO 8-contact) "
     "and the full childhood immunization schedule are computed automatically; "
     "overdue lists are always one tap away."),
    ("NHMIS reports without the tally sheets", "Monthly figures are computed "
     "from the actual records and exported for DHIS2 in one click."),
    ("Data stays in Nigeria, per NDPA 2023", "Self-hostable in-country; every "
     "action is recorded in a tamper-evident audit trail."),
]
y = Inches(1.45)
for h, b in sol:
    text(s, Inches(0.8), y, Inches(11.7), Inches(0.45), [(("✔  " + h), 18, True, ACCENT)])
    text(s, Inches(1.25), y + Inches(0.45), Inches(11.2), Inches(0.6),
         [(b, 13.5, False, WHITE)])
    y += Inches(1.12)
footer(s, 3, dark=True)

# ---------------------------------------------------------------- 4. Door screen
screenshot_slide(
    4, "It starts at the facility door",
    "The first screen lists all 76 health facilities in Nnewi North LGA — alphabetical, searchable, filterable.",
    "01-facility-select.png",
    [
        ("Every facility in the LGA", "All 76 facilities from the official "
         "registry, each with its national code (04/14/…)."),
        ("Pick your PHC, see only your PHC", "Staff choose their facility "
         "before signing in. Each facility's records are isolated from every "
         "other facility."),
        ("Search & filter", "Find a facility by name, code or area; filter by "
         "Public/Private and Primary/Secondary."),
    ],
)

# ---------------------------------------------------------------- 5. Login / security
screenshot_slide(
    5, "Facility-scoped sign-in",
    "Accounts belong to one facility. A nurse from another PHC cannot sign in here — by design.",
    "03-login.png",
    [
        ("Role-based access", "Records clerk, nurse/midwife, CHEW, doctor, "
         "facility admin, LGA M&E — each sees only what their role permits."),
        ("Three layers of isolation", "1) sign-in is tied to the selected "
         "facility · 2) every read is filtered to that facility · 3) the sync "
         "hub will only ever ship a facility its own records."),
        ("Offline re-entry", "A previously used device can sign in again with "
         "no network at all."),
    ],
    img_side="left",
)

# ---------------------------------------------------------------- 6. Dashboard
screenshot_slide(
    6, "A clinic-day dashboard",
    "The moment a nurse signs in: today's queue, active pregnancies, and who needs follow-up.",
    "04-dashboard.png",
    [
        ("Today at a glance", "Patients registered, people waiting now, active "
         "pregnancies, and overdue ANC/immunizations."),
        ("Follow-up panel", "ANC defaulters and overdue immunizations surface "
         "automatically — these lists will feed SMS reminders."),
        ("Sync status, always visible", "Offline / Pending / Synced indicator "
         "in the header — staff always know where their data stands."),
    ],
)

# ---------------------------------------------------------------- 7. Patients & EMR
screenshot_slide(
    7, "Patient registration & medical records",
    "One lifetime record per patient — searchable by name, phone or MRN in under a second, offline.",
    "06-patient-detail.png",
    [
        ("Offline-safe identity", "A unique MRN is generated on the device "
         "(e.g. NNW0062-26161-J54Y) — no network needed to register."),
        ("Duplicate protection", "Matching phone, name and date of birth are "
         "flagged at registration: use the existing record or create anyway."),
        ("Safety first", "Allergies and chronic conditions appear as a red "
         "banner before any care decision is made."),
        ("Full visit history", "Vitals, diagnoses and treatments build a "
         "timeline the next caregiver can trust."),
    ],
    img_side="left",
)

# ---------------------------------------------------------------- 8. Maternal
screenshot_slide(
    8, "Maternal health (ANC)",
    "Register a pregnancy with the LMP date — the platform does the rest.",
    "07-maternal.png",
    [
        ("Automatic schedule", "EDD and all WHO 8-contact ANC dates are "
         "computed instantly from the LMP."),
        ("Risk flagged early", "Age, parity, blood pressure, previous CS and "
         "danger signs raise a high-risk flag the whole team can see."),
        ("Defaulter list", "Women overdue for an ANC contact appear at the "
         "top — ready for SMS recall and CHEW outreach."),
    ],
)

# ---------------------------------------------------------------- 9. Immunization
screenshot_slide(
    9, "Immunization tracking (EPI)",
    "Every child gets the full national immunization schedule from their date of birth.",
    "08-immunization.png",
    [
        ("Per-child vaccine card", "BCG to Measles 2 — every dose due, given "
         "or overdue, with batch and lot recorded."),
        ("Recall list", "Overdue doses across the facility in one list — the "
         "starting point for outreach days."),
        ("Dropout visible", "Penta1 → Measles1 dropout is computed "
         "continuously, not discovered at year end."),
    ],
    img_side="left",
)

# ---------------------------------------------------------------- 10. Queue
screenshot_slide(
    10, "Queue & patient flow",
    "From registration to vitals to consultation — orderly, visible, and fair.",
    "09-queue.png",
    [
        ("Triage-aware", "Emergencies and priority cases move to the front "
         "automatically."),
        ("Station hand-offs", "Registration → vitals → consultation → "
         "pharmacy, with waiting counts per station."),
        ("Attendance for free", "Daily attendance figures fall out of the "
         "queue — no separate tally."),
    ],
)

# ---------------------------------------------------------------- 11. Reports
screenshot_slide(
    11, "Reporting & analytics",
    "Monthly NHMIS figures computed from the records themselves — auditable down to the source row.",
    "10-reports.png",
    [
        ("NHMIS-aligned", "Registrations, OPD, ANC, deliveries, immunization "
         "and referrals in the national format."),
        ("DHIS2-ready", "One click exports CSV or DHIS2-style JSON for the "
         "LGA M&E officer."),
        ("LGA-wide view", "Authority roles see a roll-up across all "
         "facilities; clinic roles see their own."),
    ],
    img_side="left",
)

# ---------------------------------------------------------------- 12. Admin & governance
screenshot_slide(
    12, "Administration & accountability",
    "Facilities, staff and schedules are managed in the open — and everything leaves a trace.",
    "11-admin.png",
    [
        ("Full audit trail", "Every create, update, delete and login is "
         "recorded with who, when, where and from which device."),
        ("Staff lifecycle", "Accounts are provisioned per facility and can be "
         "disabled instantly."),
        ("Configurable, not hard-coded", "Immunization and ANC schedules are "
         "configuration the LGA can verify and update — not buried in code."),
    ],
)

# ---------------------------------------------------------------- 13. LGA oversight board
screenshot_slide(
    13, "LGA oversight — every facility, one screen",
    "The LGA Health HOD sees what all 76 facilities are doing — without a physical visit.",
    "12-oversight.png",
    [
        ("The whole LGA at a glance", "Every facility on one board: today's "
         "registrations, visits, ANC, immunizations and queue — most active "
         "facilities rise to the top."),
        ("Freshness you can trust", "A status dot and 'last activity' time per "
         "facility — a PHC that hasn't reported in days is visibly different "
         "from one active an hour ago."),
        ("Today, this week, this month", "One toggle switches the whole board "
         "between reporting periods."),
        ("Restricted by role", "Only the LGA Health Authority role sees this "
         "page — facility staff never see other facilities' data."),
    ],
)

# ---------------------------------------------------------------- 14. LGA oversight drill-down
screenshot_slide(
    14, "Select a PHC, see its full story",
    "One tap on any facility opens its day: activity, programme snapshot, and who did what.",
    "13-oversight-drilldown.png",
    [
        ("Period activity", "What this facility recorded today (or this "
         "week/month): registrations, visits, ANC, doses, queue."),
        ("Programme snapshot", "Total patients, active pregnancies, and "
         "overdue ANC/immunizations highlighted in red — the 'needs "
         "attention' signal for supervision visits."),
        ("Audited activity feed", "The latest actions at the facility with "
         "who and when — supervision built on evidence, not recollection."),
        ("Live as facilities sync", "Each PHC's updates appear the moment "
         "its device syncs to the hub."),
    ],
    img_side="left",
)

# ---------------------------------------------------------------- 15. Architecture / offline
s = add_slide()
box(s, 0, 0, SLIDE_W, Inches(0.14), fill=DARK)
text(s, Inches(0.55), Inches(0.35), Inches(12.3), Inches(0.6),
     [("Built for our reality: offline-first architecture", 28, True, DARK)])
text(s, Inches(0.55), Inches(0.95), Inches(12.3), Inches(0.45),
     [("The network is an optimisation, never a requirement.", 14, False, MUTED)])

# simple flow diagram: device -> outbox -> sync hub -> LGA dashboard
steps = [
    ("Clinic device", "Tablet / phone / laptop.\nAll records stored securely "
     "on-device. The full clinic day works with zero network."),
    ("Change journal", "Every saved record also queues an entry in a local "
     "outbox — nothing is ever lost waiting for network."),
    ("Sync hub (in Nigeria)", "When connectivity appears, the outbox drains "
     "to a central server hosted in-country. Each facility receives only its "
     "own records back."),
    ("LGA view & DHIS2", "Authorities see live, LGA-wide indicators; NHMIS "
     "exports flow to DHIS2."),
]
for i, (h, b) in enumerate(steps):
    cx = Inches(0.55) + i * Inches(3.22)
    box(s, cx, Inches(1.9), Inches(2.9), Inches(3.3), fill=PALE, line=DARK)
    text(s, cx + Inches(0.2), Inches(2.1), Inches(2.5), Inches(0.8),
         [(f"{i+1}. {h}", 16, True, DARK)])
    text(s, cx + Inches(0.2), Inches(2.85), Inches(2.5), Inches(2.2),
         [(b, 12, False, INK)])
    if i < 3:
        text(s, cx + Inches(2.88), Inches(3.25), Inches(0.4), Inches(0.5),
             [("→", 22, True, DARK)])
text(s, Inches(0.55), Inches(5.6), Inches(12.3), Inches(1.1),
     [[("Status today:  ", 14, True, DARK),
       ("the clinic application (steps 1–2) is live and demonstrable. The "
        "central sync hub (steps 3–4) is the next build phase; the app was "
        "designed around it from day one.", 14, False, INK)]])
footer(s, 15)

# ---------------------------------------------------------------- 16. Security & compliance
s = add_slide()
box(s, 0, 0, SLIDE_W, Inches(0.14), fill=DARK)
text(s, Inches(0.55), Inches(0.4), Inches(12), Inches(0.7),
     [("Data protection & compliance", 30, True, DARK)])
sec = [
    ("NDPA 2023 as the baseline", "Patient data remains in Nigeria — the "
     "platform is self-hostable on an in-country server or at the LGA."),
    ("Facility data isolation", "A facility's records never appear at another "
     "facility. Oversight roles (LGA M&E) are the audited exception."),
    ("Every action attributable", "Tamper-evident audit log: who did what, "
     "to which record, when, at which facility, from which device."),
    ("No NIN required", "Patients are identified by a system MRN; the "
     "national ID is optional and never a barrier to care."),
    ("Soft delete only", "Clinical records are never physically erased — "
     "corrections preserve history."),
]
bullets(s, Inches(0.8), Inches(1.5), Inches(11.7), Inches(5.2), sec, size=17, gap=14)
footer(s, 16)

# ---------------------------------------------------------------- 17. Roadmap
s = add_slide()
box(s, 0, 0, SLIDE_W, Inches(0.14), fill=DARK)
text(s, Inches(0.55), Inches(0.4), Inches(12), Inches(0.7),
     [("Where we are, and what comes next", 30, True, DARK)])
road = [
    ("NOW — working clinic application", "All ten modules usable offline "
     "today: registration, EMR, maternal, immunization, queue, reporting, "
     "admin, and the LGA oversight board. Demonstrated with two pilot-ready "
     "facilities.", ACCENT),
    ("NEXT — central sync hub", "In-country server so facilities sync "
     "automatically and the oversight board fills with live, LGA-wide "
     "activity. Production authentication and device enrolment.", DARK),
    ("THEN — SMS reminders", "Automatic ANC and immunization recall messages "
     "to mothers (Igbo/English) via Nigerian SMS providers.", DARK),
    ("PILOT — selected PHCs", "Train staff, run paper-parallel for one month, "
     "measure: defaulter recovery, reporting time, record completeness.", DARK),
]
y = Inches(1.5)
for h, b, c in road:
    box(s, Inches(0.55), y, Inches(0.18), Inches(1.15), fill=c)
    text(s, Inches(1.0), y - Inches(0.05), Inches(11.7), Inches(0.5),
         [(h, 17, True, DARK)])
    text(s, Inches(1.0), y + Inches(0.42), Inches(11.7), Inches(0.7),
         [(b, 13.5, False, INK)])
    y += Inches(1.32)
footer(s, 17)

# ---------------------------------------------------------------- 18. Close
s = add_slide(DARK)
text(s, Inches(1.0), Inches(2.3), Inches(11.3), Inches(0.9),
     [("Better records. Fewer missed children.", 36, True, WHITE)])
text(s, Inches(1.0), Inches(3.2), Inches(11.3), Inches(0.9),
     [("Faster, truer reporting.", 36, True, ACCENT)])
text(s, Inches(1.0), Inches(4.4), Inches(10.8), Inches(1.2),
     [("PHC-Track gives every health worker in Nnewi North a tool that works "
       "where they work — with or without network — and gives the LGA numbers "
       "it can finally trust.", 16, False, WHITE)])
text(s, Inches(1.0), Inches(6.0), Inches(11), Inches(0.5),
     [("Thank you — questions & live demo welcome", 14, False, RGBColor(0xB9, 0xD9, 0xC6))])

prs.save(OUT)
print(f"Saved {OUT} ({len(prs.slides.__iter__.__self__._sldIdLst)} slides)")
