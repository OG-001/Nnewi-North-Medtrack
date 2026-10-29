# Show of Hands 3.0: voice-over script

**For:** Ogechukwu Eleodimuo, National Health Fellow, Nnewi North LGA, Anambra State
**Deadline:** 31 October 2026
**Runs:** 2 minutes 13 seconds at 135 words a minute, an unhurried pace
**Pairs with:** `docs/show-of-hands-video.html`, whose slides change on the timings below

---

## How to use this

Read it aloud once before recording. The timings are where each slide changes, so if you
run slightly ahead or behind, the slide is still close enough. Pause at the paragraph
breaks: they are written in, not accidental.

Numbers are deliberately conservative. Every one is sourced in section 3 below, so you can
answer a challenge on the spot.

---

## 1. The script

> **[0:00 – 0:13]  Title**

I am Ogechukwu Eleodimuo, a National Health Fellow in Nnewi North, Anambra State. My
capstone project is PHC-Track, a health record built for how our primary health centres
actually work.

> **[0:13 – 0:40]  The problem**

Nnewi North has seventy-six primary health centres. Almost all keep records on paper, so a
patient's history lives in one register, in one building. When she travels, it does not
follow her. Monthly returns are counted by hand and arrive late.

And a system that needs the internet fails here. A nurse cannot ask a mother to wait for a
signal.

> **[0:40 – 1:03]  What it does**

So PHC-Track works offline first. Every record is written on the device immediately,
connection or not. Registration, antenatal care, immunisation, the clinic queue.

When a connection returns, the device reconciles with a central hub on its own. Care does not
wait for the network; the network catches up to care.

> **[1:02 – 1:23]  What it changes**

A child's immunisation schedule then follows the child, not the register. A mother booked at
one centre can be seen at another. And the monthly summaries our national health information
system needs come from the records themselves, instead of being counted by hand weeks later.

> **[1:22 – 1:40]  Privacy**

This is sensitive health data. Every account sees only its own facility. Opening another
centre's record asks for a reason and is audited. Nothing clinical is ever truly deleted, and
the design follows the Nigeria Data Protection Act.

> **[1:39 – 2:02]  Reach and the ask**

Those seventy-six centres serve more than two hundred and twenty thousand people. The system
is built and tested, ready for a pilot. It is not yet in service. I am asking for the chance
to prove it in a few centres, and let the evidence decide how far it goes.

> **[2:01 – 2:14]  Close**

Primary health care is where most Nigerians meet the health system. Make the record reliable
there, and everything built on it becomes more reliable too. Thank you.

---

## 2. If you need a shorter cut

Drop the "Privacy" paragraph. That takes it to roughly a hundred seconds and leaves the
argument intact. Keep it if any clinician, data officer or ministry staff will watch, because
it is the part they will ask about.

To shorten further, cut the sentence about a mother booked at one centre being seen at
another.

---

## 3. Every number, and where it comes from

Say nothing in this video you cannot defend. These are the only figures in the script.

| Claim in the script | Value | Basis |
|---------------------|-------|-------|
| Primary health centres | 76 | The facility registry in this repository, `packages/shared/src/facilities.ts`. Verified: a fresh database seed loads exactly 76. |
| People served | more than 220,000 | 2022 projection for Nnewi North LGA, 221,500, from citypopulation.de and Wikipedia. |

**On the population figure.** Three numbers circulate and they are not interchangeable:

| Figure | What it is |
|--------|------------|
| 155,443 | Nnewi North LGA, 2006 census |
| 221,500 | Nnewi North LGA, 2022 projection |
| 241,713 | Nnewi North LGA, the LGA's own published estimate |
| 391,227 | **Nnewi city, both LGAs together, 2006.** Not Nnewi North |

The script says "more than two hundred and twenty thousand", which is true of all three LGA
figures and is the most conservative. If you would rather use the LGA's own 241,713, say
"almost two hundred and fifty thousand" and be ready to name the source.

**Do not use 391,227.** It covers Nnewi North and Nnewi South together, and someone in the
room will know.

Nigerian census figures are disputed and carry high error rates. That is a reason to use the
conservative number and to say "more than", not a reason to avoid the figure.

---

## 4. What the script deliberately does not claim

The project is **built and tested, not deployed.** No patient data has been entered by a
real clinician, and no centre is using it. The script says so, in the "Reach" paragraph.

Resist the temptation to remove that line. A fellowship audience includes people who will
ask when it went live, and the answer "it has not yet" is a strong position when paired with
a clear ask. Claiming otherwise is the one thing that would damage the project.

Likewise, the script does not claim lives saved, visits increased or defaulters traced.
Those are what the pilot would measure. There is no data yet.

The SMS reminder feature is built but switched off for cost reasons, so it is not mentioned.

---

## 5. The files, and how to finish the video

| File | What it is |
|------|------------|
| `docs/phc-track-show-of-hands.webm` | The finished silent video, 1280x720, about 2:14 |
| `docs/show-of-hands-video.html` | The slides it was made from, which play themselves |
| `docs/video-stills/` | The screenshots the slides use |

**The video has no sound.** That is deliberate: you are adding the voice-over. Open it in
any video editor, drop your recording underneath, and export. The slide changes already land
on the timings in section 1.

**It is WebM, not MP4.** WebM uploads to X, LinkedIn, Facebook and YouTube directly. If
something insists on MP4, any editor exports one, and so will a free converter. The file is
about 7 MB, which is well inside WhatsApp's limit.

**One quirk to expect.** The file carries no duration in its header, because it was captured
live. Some editors will show its length as unknown until they finish reading it. The video
itself is complete; let the editor scan it and the length appears.

**To change a slide**, edit `docs/show-of-hands-video.html` and re-record it by opening the
file in a browser and screen-recording the window at 1280x720. The slide cues live in the
`data-at` attributes, in seconds, and must stay in step with section 1.

**Everyone shown is invented.** The patients in the screenshots are seeded demonstration
records, not real people. No patient data exists in this system yet.

---

## 6. Recording notes

- Record in a quiet room, phone or laptop microphone close to you, no echo.
- Read slightly slower than feels natural. Two minutes is longer than it sounds.
- "PHC-Track" is said as "P-H-C Track".
- If you fluff a line, stop, pause for two seconds, and repeat the whole sentence. It is far
  easier to cut a clean pause than a half-word.
