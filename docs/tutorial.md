# Tutorial: Your First Deck

This walkthrough takes you from an empty note to a styled, multi-page presentation with `reveal-for-obsidian`.

## 1. Enable the plugin

Install the plugin (see the README), then enable it under **Settings → Community plugins**. The preview server starts automatically on `127.0.0.1:3000`. If that port is taken, the plugin moves to the next free one and tells you which.

## 2. Create a note and split it into slides

Create a note called `my-first-deck.md`:

```markdown
# My First Deck

Welcome to my talk.

---

# Agenda

- Why slides in Obsidian
- Layout with grid
- Export
```

- `---` on its own line starts a new **horizontal** slide.
- `xxx` on its own line starts a **vertical** (stacked) slide.

Open the preview with the command palette: **Reveal: Show Slide Preview** (`Ctrl/Cmd + Shift + E`). Use the arrow keys to navigate.

## 3. Add frontmatter configuration

Add a YAML block at the very top of the note:

```markdown
---
title: My First Deck
size: 16:9
transition: fade
bg: '#1e1e2e'
---
```

This sets the deck title, canvas aspect ratio, slide transition, and a global background color. All frontmatter options are documented in the README.

## 4. Position content with `<grid>`

Regular Markdown flows top-to-bottom. To place things precisely, wrap them in `<grid>`:

```markdown
<grid dimension="40 30" position="5 10" style="background: #e74c3c; border-radius: 12px; color: white;">
## Left box
</grid>

<grid dimension="40 30" position="-5 10" style="background: #3498db; border-radius: 12px; color: white;">
## Right box
</grid>
```

- `dimension="W H"` is the size in percent of the canvas.
- `position="L T"` is the top-left corner in percent. A **negative** value anchors to the right/bottom edge: `-5` means "5% from the right edge".
- Keywords also work: `position="center"`, `position="bottomright"`, …
- `style` is plain inline CSS — this is how all styling is done.

Grid content is rendered as Markdown, so `## Left box` becomes a real heading.

## 5. Two columns with `<split>`

```markdown
<split even gap="2">
### Pros

- fast
- simple

### Cons

- still learning
</split>
```

Columns are separated by a blank line. `even` makes them equal width; `gap="2"` adds a 2em gap.

## 6. Fragments (step-by-step reveals)

Add `frag` to a grid to turn it into a reveal.js fragment:

```markdown
<grid dimension="60 20" position="center" frag="1" style="font-size: 1.5em;">
This appears on the first click.
</grid>

<grid dimension="60 20" position="20 60" frag="2" style="font-size: 1.5em;">
This appears on the second click.
</grid>
```

## 7. Speaker notes

```markdown
# Wrap up

Thanks for listening!

note:
Remember to mention the Q&A session afterwards.
```

Press `S` in the preview to open the speaker view.

## 8. Export

- **PDF**: run **Export Slides as PDF**, then in the browser choose **Print → Save as PDF**.
- **HTML**: run **Export Slides as HTML** — a self-contained `.html` file (plus a `files/` image folder) is written to `/export` in your vault. Double-click it to present offline.

## 9. Next steps

- Browse [examples/demo.md](../examples/demo.md) for a deck covering every feature (shapes, Mermaid, charts, emoji, code blocks, backgrounds).
- Read the README's syntax reference for the full `<grid>`/`<split>` attribute list.
