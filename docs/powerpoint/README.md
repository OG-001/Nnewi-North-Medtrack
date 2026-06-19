# Stakeholder PowerPoint

`PHC-Track-Stakeholder-Overview.pptx` — a 16-slide overview of the platform for
LGA / facility stakeholders, with live UI screenshots.

## Regenerating

1. Start the app: `pnpm build && pnpm preview` (serves on http://localhost:4173).
2. Re-capture screenshots into `screenshots/` (a headless-Chrome capture script
   was used; any tool works — 1400×900 viewport, 2× scale).
3. Rebuild the deck:

```bash
python3 generate_deck.py   # needs: pip install python-pptx
```

The deck design (dark-green brand, slide order, talking points) lives entirely
in `generate_deck.py` — edit it and re-run.
