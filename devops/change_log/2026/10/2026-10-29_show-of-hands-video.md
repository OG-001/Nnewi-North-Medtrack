# Show of Hands 3.0 video, and a residency claim still in the UI

| Field     | Value                          |
|-----------|--------------------------------|
| Date      | 2026-10-29                     |
| Time      | 11:20 WAT                      |
| Author    | OG-001                         |
| Phase     | n/a (outreach)                 |
| Module    | n/a                            |

## Summary

The National Health Fellows programme requires a Show of Hands 3.0 video by 31 October 2026.
This adds a two-minute silent video, the slide deck it is generated from, the stills it
uses, and a timed voice-over script.

Making it surfaced a live defect: **three screens still displayed "Patient data stays in
Nigeria"**, the claim removed from the compliance endpoint on 2026-10-16 as misleading. It
was about to be broadcast publicly.

## Decisions taken

### The residency claim in the UI

`2b5f467` removed the claim from `GET /api/v1/system/compliance`, the client type and the
governance rules. It missed the UI, because the search was for the word `residency` and the
screens use the sentence instead. Three places rendered it:

| Screen | File |
|--------|------|
| Every signed-in page | `apps/web/src/components/AppShell.tsx` |
| Facility door screen | `apps/web/src/pages/FacilitySelect.tsx` |
| Sign-in screen | `apps/web/src/pages/Login.tsx` |

All three now read "Protected under the NDPA 2023", stating the governing law without
asserting a location. A comment at the AppShell site records why, because the next person to
write a reassuring footer will reach for the same sentence.

This is the second time this claim has had to be removed. The first search was for an
identifier; the thing to search for was the sentence a user reads.

### The video

Rendered from `docs/show-of-hands-video.html`, a self-playing deck, captured with the
Playwright browser already installed. `ffmpeg` and ImageMagick are not available and
installing a static build was refused, so this was the available route. It produces WebM at
1280x720, about 7 MB for 2:14.

**Silent, deliberately.** The owner is recording the voice-over, so the video carries slides
only and the cues match the script's timings.

**Stills re-captured from the running app, not reused.** The existing evidence screenshots
all carry the old footer, so using them would have published the retracted claim. The new
stills come from the corrected build.

### The script

Three drafts. The first ran 412 spoken words, about three minutes against a two-minute brief;
the final is 301 words at 2:13, with slide timings computed from the per-section word counts
rather than guessed.

**Every number is sourced and conservative.** Two figures appear: 76 facilities, verified
against the registry, and "more than 220,000 people", the 2022 projection for Nnewi North.
The script file lists the three competing population figures and warns against the one most
likely to be reached for by mistake, 391,227, which is Nnewi city across both LGAs.

**It states the project is not yet in service.** A fellowship audience will ask when it went
live, and the honest answer paired with a clear ask is a stronger position than an
overstatement that one question would demolish. The script file argues this explicitly, so
the line does not get quietly dropped.

No claim of lives saved, visits increased or defaulters traced. There is no data yet.

### The video is gitignored

About 7 MB that git cannot diff, in every clone forever, when the three text files that
generate it are committed. Same reasoning as the evidence archives on 2026-10-16. It stays
on disk in `docs/` where it was asked for.

## Deviations from the plan

The request was a video and a script. The UI fix was unplanned and is the reason the stills
had to be re-captured. Shipping a video that broadcast a retracted compliance claim was not
an option.

## Open questions surfaced

- **WebM carries no duration header**, because it is captured live. Some editors show the
  length as unknown until they scan the file. Noted in the script.
- **`APP_CONFIG.country` now has no reader in the web app.** Left in place because the hub
  and documentation may still use it; worth a look before it becomes dead config.

## Files changed

| File                                                | Change type |
|-----------------------------------------------------|-------------|
| `apps/web/src/components/AppShell.tsx`              | modified    |
| `apps/web/src/pages/FacilitySelect.tsx`             | modified    |
| `apps/web/src/pages/Login.tsx`                      | modified    |
| `docs/show-of-hands-voiceover.md`                   | added       |
| `docs/show-of-hands-video.html`                     | added       |
| `docs/video-stills/` (8 PNG)                        | added       |
| `.gitignore`                                        | modified    |

## Change details

### The three screens

```diff
-  {APP_CONFIG.complianceBaseline} · Patient data stays in {APP_CONFIG.country}
+  Protected under the {APP_CONFIG.complianceBaseline}
```

```diff
-  Works offline · {APP_CONFIG.complianceBaseline} · Data stays in {APP_CONFIG.country}
+  Works offline · Protected under the {APP_CONFIG.complianceBaseline}
```

### `docs/show-of-hands-video.html`

Twelve slides on a self-advancing clock, cues in `data-at` seconds matching the script.
Fixed 1280x720 so the capture is exactly 16:9.

## Verification

Every slide was rendered and inspected, not just generated. The first pass showed the old
footer in a still, which is how the UI defect was found.

A grep for the sentence, the word "residency" and "in Nigeria" across `apps/web/src` returns
only the explanatory comment.

Video: valid WebM header, 35 clusters across its length, 6.9 MB.

Script: 301 spoken words, 2:13 at 135 words a minute, timings derived from section word
counts.

`pnpm lint`, `pnpm typecheck` and `pnpm build` clean. The offline end-to-end suite passes 7
of 7 against the rebuilt app, confirming the footer change broke nothing.
