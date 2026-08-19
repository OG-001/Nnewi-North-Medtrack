# Markdown output standards

Applies to every markdown file any agent writes: plans and specs in `docs/`, change-log
entries in `devops/change_log/`, reports, and docs. Also applies to markdown in chat
responses.

---

## 1. Tables

Tables are the most common formatting failure. Four rules:

1. **Prefer 2 or 3 columns.** Split a wide table into several themed tables rather than
   letting one sprawl.
2. **Keep rows short**, roughly 60 characters per cell. If a cell needs a paragraph, the
   content wants a bulleted list or subheadings, not a table.
3. **Pad columns so the pipes align** in the raw source. An unaligned table is unreadable
   before it renders.
4. **The separator row must have exactly the same number of columns as the header.** A
   mismatch silently breaks rendering.

Run an align, measure, split, wrap check as an active pre-emit step on every markdown file,
not as an afterthought.

Good:

```md
| Field   | Meaning                        |
|---------|--------------------------------|
| trigger | When this lesson applies       |
| mistake | The wrong action or decision   |
```

Bad: one table with eight columns, unpadded pipes, and a 200-character cell.

## 2. Prose

- Do not aggressively hard-wrap prose. Wrap at a sensible column, and never mid-sentence in
  a way that fights the renderer.
- Lists, quotes, and code blocks keep their own conventions; the wrap rule is about
  paragraphs.
- Preserve exact technical meaning. Never paraphrase an API name, a field name, an error
  string, or a path.

## 3. Punctuation

- **Avoid the em dash.** Restructure with a full stop, a comma, a colon, or parentheses.
  Do not simply substitute a different dash glyph; rewrite the sentence.
- Use ISO 8601 for dates: `YYYY-MM-DD`. Timestamps include a timezone.

## 4. Code and paths

- Every file or directory reference is a **full repo-relative path** from the git root, for
  example `apps/web/src/db/repository.ts`, never a bare `repository.ts`.
- Fence code blocks with the language tag.
- Diff excerpts in change-log entries use ```` ```diff ```` and include line numbers.

## 5. Shorthand

When a document uses plan, phase, stage, or decision-id shorthand, open it with a
**Reference Locator** table mapping each shorthand to its full repo-relative path and its
plain meaning. A reader who does not already know the repo layout must be able to follow
the document.

Gloss any acronym, endpoint, flag, table name, or internal term on first use.
