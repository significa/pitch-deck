# Pitch Deck

> **IMPORTANT: keep this file up to date.**
> Any structural change that affects how slides are created, ordered, built, or deployed **must be documented here before the task is considered done.** This is the only source of truth Claude has when generating decks. If it's not here, Claude won't know about it.

> **Currency formatting rule:** The currency symbol always goes **after** the number. Never before. `120.000€` ✓, not `€120.000`. This applies everywhere: `deck.json` content, `build.js` formatted strings, schema examples, and any copy written for slides.

A template system for generating client pitch decks. The AI writes a single `deck.json` file with content. The build script renders it into a self-contained HTML file using slide templates.

## How it works

- **`deck.json`**: the only file the AI writes. An ordered array of slides, each with a `template` name and content fields.
- **`slides/{type}/`**: reusable HTML templates with `{{placeholders}}`. The AI never edits these.
- **`build.js`**: reads `deck.json`, renders each slide by injecting content into the matching template, bundles everything into `dist/index.html`.

The AI's job: read the brief → write `deck.json`. Nothing else.

## Workflow

Each client deck lives in `decks/[client-name]/`. The build reads `deck.json` from that folder and writes `dist/[client]/index.html`. Opening that file in any browser is all that is needed to present. CSS and JS are shared across all decks via `dist/styles.css` and `dist/deck.js`.

1. Receive the brief (markdown, notes, JSON from the strategist skill)
2. Create `decks/[client]/` and write `deck.json` inside it
3. Run `node build.js [client]` → produces `dist/[client]/index.html`
4. Open `dist/[client]/index.html` in the browser to present

If the client has a logo file, place it in `decks/[client]/assets/` and reference it by filename in `deck.json`.

## What to edit and when

**`deck.json` (in `decks/[client]/`):** the only file that changes per client. Slide content, order, and template choices all live here. This is the AI's primary output.

**`decks/[client]/deck.css` (optional):** per-deck CSS override. Create this file when a specific client deck needs a visual adjustment that does not apply to other decks: a colour tweak, a layout nudge, a font override for a particular slide. The build inlines it after the shared stylesheet so it wins by source order. Do not use it to work around a broken template — fix the template instead. Anything written here that turns out to be generally useful should be upstreamed to the global template.

**`slides/[type]/` and `components/`:** shared templates, edited only when a change should apply to every deck. A bug fix, a new slide type, a layout improvement — these go here. Never edit these for a single client's needs.

The decision rule: client-specific tweak → `decks/[client]/deck.css`. Structural or reusable change → global template.

## Validation

`build.js` validates every slide against its template's contract before rendering anything. This is the safeguard for the AI-driven pipeline; silent failures are not acceptable.

**Severity levels:**
- **Error**: a required field is missing, a type is wrong, or a semantic rule is violated (e.g. `fill > 100`, unknown template, too many segments). The deck is NOT written. `dist/` is left unchanged so the browser always shows the last good build.
- **Warning**: a non-blocking issue the author should know about (e.g. a `bar` slide where `fill` and `value` don't agree, a `tabs` tab with no content, a missing team photo). The deck IS written, warnings are printed as advisory.

**One-shot build (`npm run build`):** exits non-zero on errors. The terminal output is unmissable:
```
✗ BUILD FAILED: 2 errors, 1 warning, dist/ NOT updated (browser is showing your last good build)
  ✗ slide 4 (waffle): segment 2: "fill" must be a number 0–100, got "12"
  ✗ slide 7 (bar): "color" must be a palette key, got "magenta"
  ⚠ slide 4 (bar): "fill" (95) doesn't match the integer in "value" ("96%"); they should agree
```

**Watch mode (`npm run dev`):** on error, prints the same banner, does NOT write `dist/`, and continues watching. Fix `deck.json` and the next save retriggers the build.

The `VALIDATORS` map in `build.js` is the canonical contract for each template. Field lists and semantic rules there are authoritative; CLAUDE.md schemas describe the same contract in prose.

## File structure

```
decks/                    ← one subfolder per client
  [client]/
    deck.json             ← THE file the AI writes for this client
    deck.css              ← optional per-deck CSS overrides (client-specific tweaks only)
    assets/               ← client logo and any local image assets
dist/                     ← all build output lives here
  styles.css              ← shared CSS for every slide template (rebuilt on every build)
  deck.js                 ← shared JS engine (rebuilt on every build)
  [client]/
    index.html            ← the deck for that client (open to present)
slides/                   ← shared slide templates (HTML + CSS, never edited by AI)
  cover/
    cover.html            ← template with {{placeholders}}
    cover.css             ← layout and visual rules
  ...
components/               ← UI primitives (typography, colors, reusable partials)
  colors.css              ← palette: --color-rust, --color-amber, --color-emerald, --color-sky, --color-blue, --color-violet, --color-pink, --color-red
  slide-header/           ← reusable label + headline + body block used on most slides
    slide-header.html     ← partial, included via {{> slide-header}}
    slide-header.css
ui/                       ← deck engine chrome (nav, sidebar)
deck.css                  ← structural engine
styles.css                ← imports component CSS
build.js                  ← template engine + bundler
index.html                ← HTML shell (do not edit)
deck.json                 ← root deck, used for template development only
dist/                     ← root build output, used for template development only
```

## Imagery rules

These rules apply to all content image slots across the templates: `team` member photos, `showcase` media, and the `statement` `media` variant. They do **not** apply to the `cover`/`end` client logo, which has its own rule: supplied by the user from `assets/`, never invented.

**Exception: the `statement` media slot is a polymorphic object, not a plain URL string.** The `statement` variant `"media"` takes `{ "type": "image"|"video"|"embed", "url": "string", "fit": "cover"|"contain", "anchor": "top"|"bottom"|"left"|"right"|"top left"|"top right"|"bottom left"|"bottom right", "poster": "string?" }`. This is the only slot in the system that accepts a media object. All other image/media fields remain plain URL strings.

**All photos and media are URL strings.** Every photo or media field in `deck.json` takes a plain URL string (e.g. `"https://example.com/photo.jpg"`). No local file paths, no base64, no inline data. Schemas that carry image fields document them as `"URL string"`.

**Never drop an image slot when no URL is supplied: render a placeholder.** If a slide has a media or photo slot and no URL is given, the slot is not skipped. The build script renders a neutral placeholder block in the exact footprint the real image will occupy: a hairline border (`rgba(0,0,0,0.1)`) on the warm canvas with a small centred label naming what belongs there ("image", "team photo"). Dropping in a real URL later does not reflow the slide. Missing assets are flagged with a build WARNING, one per missing slot, so the build output doubles as a sourcing checklist. Missing images are never a build error.

**Team photos follow the same rule.** A placeholder avatar stands in when a member's `photo` URL is absent. Never fabricate or generate a photo of a real person. The placeholder holds until a real URL is provided.

**Proactively suggest images.** When populating a deck, suggest an image wherever a slide would land better with one, rather than defaulting to no image. An unfilled slot with a placeholder is always better than silently omitting the slot.

## Template syntax

Templates use a minimal Mustache-like syntax:

| Syntax | Meaning |
|---|---|
| `{{variable}}` | Insert string value |
| `{{#if field}}...{{/if}}` | Render block only if field exists |
| `{{#each items}}...{{/each}}` | Repeat block for each item in array |

## Slide schemas

Each entry in `deck.json` must have a `template` field. All other fields depend on the template. Fields marked `?` are optional.

### `table`
```json
{
  "template": "table",
  "headline": "string",
  "label": "string?",
  "body": "string?",
  "columns": [{ "label": "string", "accent": "palette key? (rust | amber | emerald | sky | blue | violet | pink | red)" }],
  "headerColumn": "boolean? (if true, first cell of every row is styled as a header; no description shown)",
  "rows": [{
    "accent": "palette key?",
    "cells": [{ "label": "string", "description": "string?" }]
  }]
}
```
Layout: slide-header spans full width at top, table fills the remaining height. Columns are equal width (`100% / N`). With exactly 2 columns the layout switches automatically: slide-header moves to a left panel and the table fills the right side.

**Header row (`columns`):** Optional. When present, renders a `<thead>` row in `content__label` style (monospace, small caps, muted). Omit for a flat table with no header row.

**Header column (`headerColumn: true`):** Optional. When true, the first cell of every row renders in `content__label` style. Descriptions are hidden on header column cells. Use when the leftmost column names the row (criteria, feature, category).

Both can be combined, used independently, or omitted for a fully flat table.

**Accent encodes judgement, not decoration.** Use `accent` on a column or row to mark a genuine verdict (the strong option, the weak one). The accent color appears on the column/row header label and as a subtle tint on all cells in that column or row. Multiple columns can carry independent accents (e.g. `"emerald"` on the best option, `"rust"` on the weakest, neutral for the rest). `accent` must be a palette key: `rust`, `amber`, `emerald`, `sky`, `blue`, `violet`, `pink`, `red`. Do not use accent for emphasis or decoration; only use it when the column or row represents a clear positive or negative verdict.

**No animation** on this slide.

**Size limits (enforced by the validator):**
- Max 4 columns. Above that the table is too wide to scan.
- Max 8 rows for 3–4 column tables. Max 10 rows for 2-column tables.
- Cell `description` is capped at 2 lines. There is no scroll.

**When to use:** Side-by-side comparisons where the columns are the argument and each cell is a scannable verdict. The core case is "us vs. the alternatives" (Significa vs. boutique agency vs. freelancer) with rows as decision criteria and `accent` marking the strong and weak options. Also valid for tier or option comparisons where one option is clearly better.

**When NOT to use:**
- When a cell's value would be a full sentence. A sentence belongs in other slides (tabs, showcase), not a table cell.
- When there are more than ~4 columns or ~8 rows (2-column: ~10 rows).
- Reference tables (feature matrices, spec sheets, technical comparisons). Those belong in the proposal document, not the deck.
- The test: if the value row can't be scanned across in a few seconds, it's the wrong format.

**table vs list:** a table compares the same criteria across two or more columns. If there's only one subject and each row stands alone, use `list`. A one-column table is just a list with extra lines.

### `cover`
```json
{
  "template": "cover",
  "headline": "string",
  "body": "string?",
  "client": {
    "name": "string",
    "logo": "string (inline SVG markup | URL | filename in assets/)",
    "color": "string (#RGB, #RRGGBB, or palette key: the client's brand colour, fills their brand cell)"
  },
  "sharedDate": "string (e.g. \"9 June 2026\")",
  "partner": "string (the Significa team member presenting the deck)"
}
```

**`client.logo`** accepts three formats, resolved in this order:
1. **Inline SVG markup**: starts with `<svg`. Injected directly into the HTML. Best quality; scales infinitely during the zoom transition. Preferred format.
2. **URL**: starts with `http://` or `https://`. Rendered as an `<img>` tag. Network required at viewing time.
3. **Filename in `assets/`**: e.g. `"superbock.png"`. The build script reads the file, base64-encodes it, and injects it as a data URI so `dist/index.html` is fully self-contained.

If none of the above resolves, or if `logo` is absent or an empty string, the logo area shows the client name as a text fallback. A missing logo is a build WARNING, not an error.

**`client.color`** accepts either a palette key (`rust`, `amber`, `emerald`, `sky`, `blue`, `violet`, `pink`, `red`) or a hex value (`#RGB` or `#RRGGBB`). Palette keys resolve to `var(--color-key)`; hex values are used directly.

**When to use:** always, as the first slide of every deck. `cover` is a required bookend. A deck without it has no moment of arrival. One per deck, first position only.

### `end`
```json
{
  "template": "end",
  "headline": "string",
  "body": "string?",
  "client": {
    "name": "string",
    "logo": "string (inline SVG markup | URL | filename in assets/)",
    "color": "string (#RGB, #RRGGBB, or palette key: the client's brand colour, fills their brand cell)"
  },
  "sharedDate": "string (e.g. \"9 June 2026\")",
  "partner": "string (the Significa team member presenting the deck)"
}
```

The closing slide of the deck. Identical layout to `cover` (two dark halves side by side, Significa mark in amber on the left, client logo on the right) but fully independent template files (`slides/end/`). Use it as the last slide with a farewell headline and contact copy. All `client.logo` and `client.color` rules from `cover` apply equally here, including the missing-logo warning and text fallback.

**When to use:** always, as the last slide of every deck. `end` is a required bookend. Use a farewell headline ("Let's build it." / "Obrigado." / "Ready when you are.") and minimal body copy with a contact prompt. One per deck, last position only.

### `statement`

**`variant` is required** for all statement slides. Accepted values: `"text"`, `"center"`, `"media"`, `"feature"`. A value in the set but not yet built is a build-blocking ERROR. A value outside the set is also a build-blocking ERROR.

**Currently built:** all four variants: `center`, `text`, `media`, and `feature`.

**`headline` is required for `text`, `center`, and `feature`.** Missing is a build-blocking ERROR. For `media`, `label`, `headline`, and `body` are all ignored; if present, the build emits a WARNING.

---

#### variant: `media`

```json
{
  "template": "statement",
  "variant": "media",
  "media": {
    "type": "image | video | embed",
    "url": "string",
    "fit": "\"cover\" | \"contain\" (optional, defaults by type: image/video use cover, embed uses contain)",
    "anchor": "\"top\" | \"bottom\" | \"left\" | \"right\" | \"top left\" | \"top right\" | \"bottom left\" | \"bottom right\" (optional, sets object-position; omit to centre)",
    "poster": "string? (image URL, required for embed, optional for video)"
  }
}
```

A full-bleed media slide. No headline, no copy; the image, video, or embed fills the entire slide. `label`, `headline`, and `body` are unused and trigger warnings if present.

**`media.type`** is required. One of `"image"`, `"video"`, or `"embed"`:
- `"image"`: rendered as an `<img>` tag, `object-fit` set by `fit`.
- `"video"`: rendered as a `<video>` element. No native controls. Click to play/pause. Auto-plays 1s after slide activation. Loops on end. Pauses and resets on slide deactivation.
- `"embed"`: rendered as an `<iframe>` with `data-src` lazy loading (src only set on first activation). A `poster` image covers the frame until the iframe loads; thumbnails never load the iframe. Always supply `poster` for embed; without it, thumbnails and inactive slides show nothing.

**`media.url`** is optional from the validator's perspective; if absent, a placeholder renders and a WARNING is emitted.

**`media.fit`** is optional. The default is type-driven: `"cover"` for `image` and `video`, `"contain"` for `embed`. Only set it to override the default (a portrait image to letterbox, or a wide desktop prototype that should bleed). Accepted values: `"cover"` or `"contain"`.

**`media.poster`** is an image URL shown as the video poster frame, or as the background behind an embed before it loads. Required for `embed` (warning if absent); optional for `video`.

**Animation:** the media block fades in over 700ms on slide activation. Thumbnails snap to the final state and never load iframes.

**When to use:** when a single image, video, or embedded piece of content carries the entire argument with no words needed. Use sparingly; the blank canvas effect only works if the medium itself is striking enough to justify a full slide. The most common cases are: a product screenshot or video that speaks for itself, a photo that sets the emotional register for the section, or an embedded prototype or demo.

**When NOT to use:**
- When the media needs a caption or context. Use `showcase` (left panel + metrics) or `text` (with body paragraphs) instead.
- When the media is decorative. Every `media` slide must earn its place.

---

#### variant: `feature`

```json
{
  "template": "statement",
  "variant": "feature",
  "label": "string?",
  "headline": "string",
  "body": "string?",
  "orientation": "\"side\" | \"below\" (optional, default: side)",
  "media": {
    "type": "image | video | embed",
    "url": "string",
    "fit": "\"cover\" | \"contain\" (optional, defaults by type: image/video use cover, embed uses contain)",
    "anchor": "\"top\" | \"bottom\" | \"left\" | \"right\" | \"top left\" | \"top right\" | \"bottom left\" | \"bottom right\" (optional, sets object-position; omit to centre)",
    "poster": "string? (image URL, required for embed, optional for video)"
  }
}
```

Text and media sharing the work. `headline` is required; `body` and `label` are optional. `media` is required; if absent, the build errors (without media this is just a `text` slide).

**`orientation`** controls the layout. Default is `"side"`. Accepted values: `"side"` or `"below"`.

- **`side`** (default): text in a left column (the standard `slide-left` panel, max-width 660px, with the 1px divider on its right), media filling the remaining width. Use for portrait or square media, or when text and media should hold equal weight.
- **`below`**: text as a top band across the full width (with a 1px bottom border), media filling the full width below it. Use for wide landscape media: desktop screenshots, wide videos, full-width prototypes.

All `media` object rules from the `media` variant apply: same type discrimination (image/video/embed), same per-type `fit` default, same video state machine (1s delayed play, click to toggle, loop, pause on leave), same eager embed pre-loading, same missing-url placeholder and warning.

**Animation:** the text block enters first (opacity 0 to 1, translateY(16px) to 0, 700ms, 80ms delay). The media fades in 120ms after the text starts (200ms total delay). Thumbnails snap to the final state.

**When to use:** `feature` is the default for any point that has a supporting visual. Prefer it over `text` whenever a relevant image, video, or embed exists: in `feature` the media carries the visual mass so the text does not need to fill a full slide alone. Use `media` instead when the visual is the entire argument and needs no words at all.

**When NOT to use:**
- When there is no relevant visual. Use `text` (last resort, prose only) or `center` (single headline).
- When the visual IS the entire argument with no supporting words. Use `media`.
- When the media is decorative. Every visual in a `feature` slide must genuinely support the point being made.

---

#### variant: `text`

```json
{
  "template": "statement",
  "variant": "text",
  "label": "string?",
  "headline": "string",
  "lede": "string?",
  "body": "string",
  "media": {
    "type": "image | video | embed",
    "url": "URL string?",
    "fit": "cover | contain (optional, per-type default)",
    "anchor": "top | bottom | left | right | top left | top right | bottom left | bottom right (optional, sets object-position; omit to centre)",
    "poster": "URL string? (required for embed)"
  },
  "after": "string?"
}
```

**Field rules (validator is canonical):**
- `headline`: required. ERROR if missing.
- `body`: required string. ERROR if missing. WARNING if shorter than 400 characters: at that length use `center` (headline stands alone) or `feature` (point with a co-star visual).
- `label`, `lede`, `after`: optional strings. No validation beyond presence. `after` renders by position whether or not `media` is present; without `media`, it is simply a second paragraph below `body`.
- `media`: optional. If present, must be an object (ERROR if not). `media.type` is required, one of `"image"`, `"video"`, `"embed"` (ERROR if absent or invalid). `media.url` is optional (WARNING if absent, placeholder renders). `media.fit` is optional, `"cover"` or `"contain"`, per-type default applies (`"cover"` for image/video, `"contain"` for embed), ERROR if an invalid value is given. `media.poster` is optional for video, WARNING if absent on embed.

**Deck-level warning:** the build emits a WARNING when more than one `text` slide is in the deck.

**Layout:** two columns. The left column (`max-width: 660px`, top-anchored) contains the `slide-header` block: `label`, `headline`, and `lede` if present (rendered as a body-style line directly below the headline). The right column (`max-width: 50%`, `padding: 32px`, top-anchored) is separated from the left by a 1px `rgba(0,0,0,0.1)` border on its left edge. Inside the right column the rendering order is always: `body` at the top, `media` below it filling the remaining height (32px gap above), `after` below the media (24px gap above). Both `body` and `after` use the same text element; the distinction is positional. When both `media` and `after` are present, the prose brackets the visual: a lead-in paragraph above and a closing line below the image or video.

**Animation:** the right column fades in and rises from `translateY(16px)` to 0, 700ms, 80ms delay. The left column is static, consistent with how `slide-header` text behaves on every other slide. Thumbnails snap to final state. All statement media behaviour applies to the right-column media slot: video state machine (1s delayed play, click to toggle, loop on end, pause and reset on slide deactivation), embed eager pre-load, per-type `fit` default, missing-url placeholder and WARNING.

**When to use:** the two-column editorial slide for a genuinely text-heavy beat. The prose is the argument; it needs a full slide and a substantive paragraph (400+ chars). Use it for the approach, the philosophy, the cost of inaction: any point that earns a developed passage rather than a bullet or a short caption. Add `media` when a supporting image, video, or prototype belongs alongside the prose without needing to dominate the slide. Add `after` to bracket the visual with a closing sentence or attribution. `text` stays rare and deliberate; one per deck is typical, multiple means the deck is turning into a document.

**`text` vs `feature`:** in `feature` the visual occupies a full panel and is a co-star; the text block is compact. In `text` the prose is the argument and the visual, if present, is a secondary note living inside the text column. If the visual should carry visual mass, use `feature`. If the prose needs room and the visual is incidental, use `text`.

**When NOT to use:**
- When the headline stands alone. Use `center`.
- When the visual should dominate and the text is a caption. Use `feature`.
- When the content is a list of peer items. Use `list`.
- When `body` is shorter than 400 characters. Compress it or use a denser slide type.
- When the right column would be a single body block with nothing else (no `media`, no `after`). A wall of prose on a half-slide reads poorly; add a visual, split the prose with `after`, or re-route to `center`, `feature`, `number`, `list`, or `compare`.
- More than once per deck unless each slide genuinely earns the long-form treatment.

---

#### variant: `center`

```json
{
  "template": "statement",
  "variant": "center",
  "label": "string?",
  "headline": "string"
}
```

`body` and `media` are unused by `center`; if present, the build emits a WARNING and ignores them.

**Layout:** one oversized headline centred on both axes of a near-empty linen canvas, with an optional small label above it. No `slide-left` column, no border. The label reuses `content__label` (JetBrains Mono, 12px, uppercase). The headline is ~110px, weight 500, line-height tight, letter-spacing -5px, visibly louder than `text`.

**Animation:** the block fades in and rises from `translateY(24px)` to 0, 700ms, 80ms delay. One entrance, no stagger. Thumbnails show the final state instantly.

**When to use:** the single loudest beat in the deck: one line on a near-empty canvas. At most one `center` per deck; two usually means one should be `text`.

**When NOT to use:**
- More than one or two sentences. A `center` headline that wraps past two lines loses its impact.
- When the slide needs supporting body text, metrics, or media. Those belong in `text`, `showcase`, or `feature`.
- As a section divider for every chapter. Overuse kills the effect; it works because it is rare.

### `team`
```json
{
  "template": "team",
  "headline": "string",
  "label": "string?",
  "members": [{ "name": "string", "role": "string?", "bio": "string?", "photo": "URL string?" }]
}
```
Note: the first item (Significa brand block) is hardcoded in the template. `members` contains only the individual people. `photo` is a URL string; if absent, the build renders a "team photo" placeholder in the card's image slot and emits a WARNING. Never leave the field out and expect the card to look finished; the placeholder is a sourcing prompt, not a final state.

**When to use:** when the people delivering the project are a key part of the pitch. Use it to make the team feel real before the proposal lands, because faces and roles signal that this is not an anonymous agency. One `team` slide per deck is the norm; it typically lives just before or just after the scope.

**When NOT to use:** when the team is large and would need more cards than fit comfortably on screen, or when the pitch is purely capability-focused and the specific people are not yet assigned. In those cases, describe the team in a `tabs` or `list` slide by role rather than by person.

### `timeline`
```json
{
  "template": "timeline",
  "headline": "string",
  "label": "string?",
  "body": "string?",
  "unit": "string (e.g. \"weeks\" or \"months\"; used as the label after each duration)",
  "total": "number? (auto-calculated if omitted)",
  "phases": [{ "label": "string", "duration": "number", "offset": "number" }]
}
```
Note: `total` is auto-calculated as `max(offset + duration)` across all phases. Set it explicitly to add trailing space on the timeline. `offset` defaults to 0 if omitted.

**When to use:** when the delivery schedule is itself an argument: showing the client how long things take, which phases overlap, and when they can expect to see results. Use `offset` to model parallel or overlapping tracks (e.g. design and infrastructure running concurrently). A timeline answers "when does this land?", not "what will it cost?"

**When NOT to use:** when the phases have no meaningful duration distinction and a simple list of steps would do. If the schedule is just "Phase 1 → Phase 2 → Phase 3" with no parallelism and duration is not the point, use `tabs` to describe what happens in each phase rather than when.

**timeline vs tabs:** `timeline` is a schedule (it communicates duration and sequence). `tabs` is a scope breakdown (it communicates what happens and what is delivered). A project deck often needs both: `tabs` to present the scope, `timeline` to show the calendar.

### `budget`
```json
{
  "template": "budget",
  "headline": "string",
  "label": "string?",
  "body": "string?",
  "total": "string (formatted total shown as large overlay after all phases, e.g. \"120.000€\")",
  "totalBudget": "number (used to calculate proportional column widths)",
  "currency": "string (e.g. \"€\", \"$\")",
  "phases": [{ "label": "string", "amount": "number | string%" }]
}
```
Layout: slide-header (top, grows to fill), phase columns (bottom, `16rem` tall). Each column's width is proportional to its `amount` relative to `totalBudget`. Each column shows a 15px label + amount above a colored bar with grain texture. Uses the same color sequence as tabs and payment. Bars animate in with a staggered clip-path reveal from bottom.

**When to use:** when the investment needs to be shown as a breakdown, not just a lump sum. The proportional columns make the weighting of each phase visible (a large discovery column signals that thinking is a significant part of the work). Use it to answer "where does the money go?" in a single glance.

**When NOT to use:** when there is only one phase (nothing to decompose) or when the point is the total figure rather than its parts. A single figure belongs in `number`. If the argument is "our price vs. the alternative", use `compare`.

**budget vs payment:** `budget` shows what each phase costs. `payment` shows when each payment is due. A deck that has both is normal: `budget` explains the investment, `payment` explains the schedule. Do not conflate them into one slide.

**budget vs compare:** `budget` decomposes one total into its parts (phases that sum to the project cost). `compare` sets two independent totals side by side to make the gap between them the argument.

### `bar`
```json
{
  "template": "bar",
  "headline": "string",
  "label": "string?",
  "body": "string?",
  "value": "string (always a percentage, e.g. \"96%\", \"78%\")",
  "valueTitle": "string? (names the figure; if derived from a ratio, include it here, e.g. \"458 of 478 projects delivered on time\")",
  "valueLabel": "string? (one sentence of supporting context)",
  "fill": "number (0–100, must match value)",
  "color": "string? (color key from palette, e.g. \"emerald\", \"blue\"; defaults to \"blue\")"
}
```
Layout: slide-header at top, then a full-height colored bar that grows from the left to `fill`% of the slide width. The bar has grain texture. `value` and `valueLabel` are anchored to the bar's right edge in white text. The bar animates in with a left-to-right clip-path reveal; the value fades in after.

**When to use:** Reserve this template for a single percentage that carries strategic weight in the deck: a figure you want to stop the presentation on and let land. Retention rate, delivery rate, satisfaction score, completion rate. The bar physically fills the slide to the proportion, making the number feel present rather than just stated. Do not use it for every metric; only for the ones that earn the full-slide treatment. `value` is always a percentage; `fill` is always the matching integer (0–100).

**bar vs number:** `bar` is for a percentage where the physical fill is the argument. If the hero figure is not a percentage, or doesn't map naturally to a 0–100 fill (absolute values, ratios, scores), use `number` instead.

**bar vs compare:** `bar` is one value as a proportion of a whole (0–100 fill). `compare` is two independent absolute magnitudes at relative height, where the contrast between them is the point.

### `waffle`
```json
{
  "template": "waffle",
  "headline": "string",
  "label": "string?",
  "body": "string?",
  "sentiment": "\"positive\" | \"negative\" (optional; omit for neutral)",
  "segments": [{ "value": "string (the argument: make the point here, not just the number. Prefer ratio phrasing over bare percentages: \"4 in 100\", \"1 in 25\", \"9 of 10\". The label adds context; the value makes the claim.)", "fill": "number (integer 0–100, how many squares to color)", "label": "string (supporting context shown below the value; explains what the figure represents)", "color": "string? (optional; explicit color key from the palette, e.g. \"rust\", \"emerald\", \"amber\". Overrides the sentiment palette for this segment. Use when segments need different color families, e.g. investment vs. return.)" }],
  "emptyLabel": "string? (description for the unfilled squares; use when empty space represents an opportunity or gap worth calling out)"
}
```
Layout: left panel with slide-header and a legend (color swatch + value title + label per segment). Right panel: 10×10 grid of 100 squares, each representing 1%. Segments fill the grid left-to-right, top-to-bottom in order. Cells beyond the segment total render as empty (muted linen squares). Colors are auto-assigned from the sentiment palette; order of segments controls color. Filled cells animate in with a staggered reveal.

`segments[].value` is the **argument**: write it to make the point land, not just to report the number. "4 in 100" is stronger than "4%"; "9 of 10" is stronger than "90%". `segments[].fill` is the **integer cell count** (0–100) used to color squares. `segments[].label` adds context to explain what the figure represents. `segments[].color` overrides the auto-assigned palette color for that segment; use a key from the palette (`rust`, `amber`, `emerald`, `blue`, `sky`, `violet`, `pink`, `red`). `emptyValue` is auto-computed by the build script as `(100 - total fill)%`.

**When to sum to 100:** Full breakdowns where every part is named and meaningful (device split, age groups, category distribution). All squares filled, every segment in the legend.

**When to leave squares empty:** When the unfilled space is the argument (adoption rate, market penetration, coverage). Write only the segment(s) you are highlighting. Do NOT add a second segment for "the rest": the emptiness communicates the gap more powerfully than a label would. E.g. for "12% market adoption", write one segment with `value: "12 in 100", fill: 12`. The 88 empty squares do the work.

**`sentiment` controls the auto-assigned color palette.** Set it when all segments share the same emotional register:
- `"positive"` → emerald, blue, sky. Use when the data is something to celebrate or an opportunity to seize.
- `"negative"` → rust, amber, pink. Use when the data shows a problem, a failure, or something alarming.
- Omit for neutral/informational breakdowns with no clear positive or negative framing.

When segments need **different color families** (e.g. cost vs. return), omit `sentiment` and set `color` explicitly on each segment instead.

**When to use:** When the difference between filled and empty is so extreme that the number alone fails to land. The grid makes disparity physical: 4 colored squares against 96 empty ones hits the audience in the gut in a way that "4%" does not. Reserve this slide for data where the gap is the argument.

- **Catastrophic failure rate**: only a handful of squares filled shows how rare something good is, or how common something bad is. E.g. 4 rust squares: "only 4 in 100 digital products are still in use 2 years after launch." The 96 empty squares do the work.
- **Untapped opportunity**: a tiny filled fraction against a vast empty field shows the scale of what hasn't been captured yet. E.g. 7 emerald squares: "7 in 100 of the market has adopted this; the rest is open."
- **Investment vs. return**: two segments summing to 100, where one is the cost and the other is the payoff. Frame as a proportion of the total value created: "of every 100€ this generates, 2€ is what you pay." Set `color: "amber"` on the cost segment and `color: "emerald"` on the return segment. Omit `sentiment`. Example:
```json
{
  "template": "waffle",
  "headline": "The return dwarfs the investment.",
  "label": "ROI breakdown",
  "body": "For every euro you put in, you get back fifty. The grid speaks for itself.",
  "segments": [
    { "value": "2 squares is what you pay", "fill": 2, "label": "Total project investment", "color": "amber" },
    { "value": "98 squares is what you gain", "fill": 98, "label": "Projected return over 3 years", "color": "emerald" }
  ]
}
```

The more extreme the ratio, the more powerful the slide. If the split is 45/55, the grid is just noise: use a different format. The waffle earns its place when a glance at the grid makes someone's stomach drop or their eyes light up.

Only use when all segments belong to the same whole (one population, one total). Do not use when comparing two separate datasets.

**waffle vs compare:** `waffle` is parts of a single whole summing to 100. `compare` is two magnitudes not part of the same whole: two independent totals shown side by side at true scale.

### `treemap`
```json
{
  "template": "treemap",
  "headline": "string",
  "label": "string?",
  "body": "string?",
  "segments": [{ "value": "string (display title: the percentage or figure shown large, e.g. \"50%\")", "fill": "number (numeric share used to size the rectangle; does NOT need to be integer, e.g. 12.5)", "label": "string (short name for this segment)", "description": "string? (one sentence of context)", "color": "string? (optional explicit palette key; omit to use auto-assigned sequence)" }]
}
```
Layout: left panel with slide-header; right panel is a squarified treemap filling 100% of the space. Each rectangle is sized proportionally to its `fill` value. Segments always fill the full panel (`fill` values are normalized so their total doesn't need to equal 100 exactly, but should represent shares of a whole). Each cell shows a large value, a bold label, and an optional description, with grain texture and a colored background matching the palette.

**Constraints. Do not use this template if:**
- More than 6 segments. Above that the rectangles become too small to hold legible text and the layout looks cluttered.

**Auto-grouping:** Any segment below 8% of the total is automatically merged into a single "Other" tile by the build script. You do not need to handle this manually; write every segment as-is. The "Other" tile shows the combined percentage and the label "Other". This means you can write granular data freely; the build script will keep the treemap legible.

**When to use:** When a whole is divided into named parts and the relative size of each part is the story. Revenue by product line, budget allocation by team, traffic by source, customer mix by tier. Every part is meaningful and labeled. The area encoding makes proportional differences immediately visible.

**Do NOT use** when comparing two separate datasets, or when you want to highlight an extreme gap. Use `waffle` for that instead.

### `payment`
```json
{
  "template": "payment",
  "headline": "string",
  "label": "string?",
  "totalBudget": "number (e.g. 50000; plain number, no currency symbol)",
  "currency": "string (e.g. \"€\", \"$\")",
  "paymentTerms": "string?",
  "projectDuration": "number (months)",
  "payments": [{
    "label": "string",
    "amount": "string: percentage (\"30%\") or absolute (\"15.000€\")",
    "split": "number? (if present, divides this payment into N equal installments)",
    "description": "string? (the condition/trigger for THIS payment, e.g. \"Project starts once received\", \"Due before development begins\". NOT generic terms.)"
  }]
```

**Important distinctions:**
- `paymentTerms` = generic administrative terms applying to the whole invoice (due dates, payment method, late fees). E.g. "Invoices due within 14 days. Bank transfer only."
- `payments[].description` = the specific condition or trigger for that individual payment. E.g. "Project kicks off once this payment is received."

**Installment payments:** For items with `split`, the AI must include the per-installment amount and number of months in `description`. The build script computes `perInstallment` and `split` for reference, but the AI is responsible for writing the copy. Example:
- ✓ `"Equal monthly payments over the project duration. First invoice on project start date. 30.000€ per month, billed equally over 4 months."`

> **Golden rule: ALL visible content must come from `deck.json`. The build script never generates or invents copy. JSON is the single source of truth for content.**

```json
}
```

#### Payment models

**Milestone**: each item is a single payment tied to an event. No `split` field:
```json
"payments": [
  { "label": "Upfront", "amount": "25%", "description": "Due on signing" },
  { "label": "Design sign-off", "amount": "25%" },
  { "label": "Final delivery", "amount": "50%" }
]
```

**Installments**: use `split: N` to divide a payment equally over N periods:
```json
"payments": [
  { "label": "Upfront", "amount": "20%", "description": "Due on signing" },
  { "label": "Monthly installments", "amount": "80%", "split": 4 }
]
```

**Mixed**: combine both in the same array:
```json
"payments": [
  { "label": "Upfront", "amount": "20%" },
  { "label": "Monthly installments", "amount": "60%", "split": 4 },
  { "label": "Final delivery", "amount": "20%" }
]
```

#### Build script behaviour
- If `amount` contains `%` → `calculatedAmount` is auto-computed from `totalBudget × percent`
- If `amount` is absolute → `calculatedAmount` equals `amount`
- If `split` is present → `perInstallment` is computed as `calculatedAmount / split`

**When to use:** when the client needs to understand the payment schedule: which invoices land at which milestone, and how much each one is. This is the commercial logistics slide, not the investment rationale slide. Use it after `budget` (which explains what the money covers) to close out the commercial section.

**When NOT to use:** when payment terms are trivial or irrelevant to the pitch (internal work, already agreed terms). Also not a replacement for `budget`; the two serve different questions. If the schedule is already covered by a simple note in the proposal document and the deck is not a commercial pitch, skip it.

### `showcase`
```json
{
  "template": "showcase",
  "headline": "string",
  "label": "string?",
  "body": "string?",
  "metrics": [{
    "value": "string",
    "label": "string",
    "trend": "\"up\" | \"down\" (optional)",
    "trendValue": "string? (shown next to the arrow, e.g. \"24 pts\", \"vs. last year\")"
  }],
  "media": ["URL string", "URL string", "..."]
}
```
`media` is an array of URL strings. If the array is empty or absent, the build renders an "image" placeholder in the media panel and emits a WARNING. A non-array `media` field is a build-blocking ERROR.

Layout: two-column row. Left panel (~45%) uses `slide-left` class and contains `slide-header` at top, then an optional 2×2 metrics grid at the bottom with 1px rgba borders between cells. Right panel fills the remaining width with a full-bleed image/GIF slider. Multiple images create an auto-advancing Stories-style slider with a timer bar per image at the top of the panel (5 s each); clicking the media panel advances to the next image manually. Supports 1–N images. `metrics` is optional. Supports up to 4 metrics (2×2 grid).

**Metric value formatting rules:**
- Never use `+` or `-` in `value`. The number stands alone: `"38%"` ✓, not `"+38%"`.
- Never use `+` or `-` in `trendValue`. The arrow already communicates direction: `"24 pts"` ✓, not `"+24 pts"`.
- Use `trend: "up"` / `trend: "down"` whenever the brief provides a before/after or comparative figure. The arrow is the signal; the number is the magnitude.

**When to use:** when a past project or case study needs to be presented with proof. The right panel shows the work visually; the left panel grounds it in outcomes. This is the primary slide for portfolio evidence: it gives the client something to look at and something to remember. Use one `showcase` per case study referenced in the deck.

**When NOT to use:** when there is no media (visual evidence). Without the right-panel images, `showcase` is just a metrics grid; use `list` instead and lead each row with the figure. Also not the right slide for introducing the Significa team; that is `team`.

**showcase vs team:** `showcase` is about past work and outcomes. `team` is about the people delivering the work. Both can appear in the same deck; they answer different questions.

**showcase vs compare:** `showcase` presents one project's results. `compare` sets two independent magnitudes side by side. If the argument is "before vs. after" in a single project, use `showcase` with trend arrows on the metrics; if the argument is "our results vs. theirs" as a direct scale comparison, use `compare`.

### `tabs`
```json
{
  "template": "tabs",
  "headline": "string",
  "label": "string?",
  "body": "string?",
  "tabs": [{
    "label": "string",
    "sublabel": "string? (small muted text above the tab title, e.g. \"Phase 1\", \"Step 2\", \"01\". Omit to show only the label.)",
    "body": ["string"],
    "deliverables": [{ "label": "string", "description": "string?" }],
    "team": [{ "role": "string", "description": "string" }]
  }]
}
```
Layout: left column contains the slide header and a vertical list of tab triggers. Clicking a trigger reveals its content in the right panel. Each tab can hold any combination of `body` paragraphs, `deliverables`, and `team` (all optional). `sublabel` appears as small muted text above the tab title; use it for sequence labels ("Phase 1", "Step 2") or category labels.

**When to use:** scope of work is the primary case (phases, what happens in each, deliverables, and team). Also valid for any content-heavy topic where the sections are clearly related and the audience benefits from navigating between them: process explanations, how-we-work breakdowns, service offering details. The key test: can each section stand alone as a distinct panel? If yes, `tabs`. If the content reads better as a vertical stack, use `list` or `statement`. Keep the number of tabs to what fits the left column without scrolling (typically 3–6).

**When NOT to use:**
- When the items are independent peer points with no grouping above them. Use `list`.
- When the sections have meaningful durations and the schedule is the argument. Use `timeline`.
- When there are only two tabs. Two tabs is often a before/after or a choice; `compare`, `table`, or two `feature` slides will communicate it more directly.
- When tab content would be a single sentence per tab. If there's not enough to fill a panel, the content belongs on a `list` or `statement` slide instead.

**tabs vs timeline:** `tabs` describes what happens in each phase (scope). `timeline` shows when (schedule). A full project deck typically needs both: `tabs` for the scope breakdown, `timeline` for the delivery calendar.

### `list`
```json
{
  "template": "list",
  "headline": "string",
  "label": "string?",
  "body": "string?",
  "items": [{
    "value": "string? (large leading figure, verbatim string, e.g. \"96%\", \"4.9\", \"3×\". Omit to render with no value gutter.)",
    "heading": "string (the main claim or title for this row)",
    "body": "string? (one sentence of supporting context)",
    "color": "palette key? (e.g. \"emerald\", \"rust\"; fills the row with an animated colored background that slides in left-to-right after the item enters; text flips to white)"
  }]
}
```
Layout: left `slide-left` panel with slide-header. Right panel: items as full-width rows separated by hairlines, filling the remaining space. Each row shows an optional large `value` figure (56px, near-black) on the left, then `heading` and optional `body` stacked to the right. When no item has a `value`, the gutter is omitted entirely.

**Animation:** items slide in right-to-left with opacity, staggered sequentially. Re-fires on slide activation.

**Color encodes emphasis, not decoration.** Use `color` on an item to mark the single row that matters most: the standout figure, the key commitment, the one to remember. The background fill draws the eye and signals priority. Never use it on more than one or two rows; a list where most rows are colored has emphasized nothing. Do not use it for visual variety.

**When to use:** A vertical list where each item stands alone and deserves its own row. Works best as a set of commitments, key facts, or supporting points, especially when some or all items have a standout figure to lead with. Keep to 6 items maximum; more rows feel like a table that forgot to be a table.

**list vs tabs:** list is flat and unphased. If the items hang off phases or stages (discovery, design, development, launch), use `tabs` instead. `list` is for items that each stand alone with no grouping structure above them.

**list vs table:** a list presents items that each stand alone, read top to bottom. If you're comparing the same criteria across two or more options (us vs. them, tier vs. tier), that cross-comparison is what table columns are for. A single column of figures is always a list, never a one-column table.

**Value consistency:** either all items have a `value` or none do. Mixing the two creates visual inconsistency; the validator will warn about it.

### `number`
```json
{
  "template": "number",
  "label": "string?",
  "headline": "string?",
  "steps": [
    "string (plain step, renders as a single line)",
    { "label": "string (monospace small-caps line above the value)", "text": "string (the value, large)" }
  ],
  "value": "string (the hero figure, verbatim, e.g. \"550M\", \"96%\", \"4.9\")",
  "trend": "\"up\" | \"down\" (optional; direction of the figure, also sets the default band color)",
  "valueTitle": "string? (names the figure; appears above caption in bold. E.g. \"Average return on design investment\")",
  "caption": "string? (one sentence of supporting context, shown beneath valueTitle)",
  "color": "string? (palette key; overrides the trend-derived default band color)"
}
```
Layout: top area holds slide-header on linen (`flex: 1`). Full-width colored band at the bottom (~42% height, `flex: 0 0 42%`). Steps row at the top of the band animates in before the payoff; the band color then sweeps left-to-right as the hero value rises in simultaneously. Caption and trend arrow follow.

**Band color** defaults from `trend`: `"up"` → emerald, `"down"` → rust, neither → blue. Override with `color`.

**Text color is white throughout the band**, same as the treemap. `valueTitle` renders at 500 weight (treemap label style); `caption` renders at regular weight with reduced opacity (treemap description style).

**Animation sequence:**
1. Steps build left-to-right, one at a time: each step, then its arrow separator, then the next step.
2. A deliberate beat after the last step.
3. Band color sweeps left-to-right; simultaneously, the hero value rises in from below.
4. Caption fades in.
5. Trend arrow fades in last.

The payoff (band + value) must feel choreographically distinct from the steps, not just a bigger step.

**`steps`** build the derivation leading to the hero figure. Use them when the argument behind the number is worth showing: "180k visitors → 0.5% conversion → 660 leads". Omit when the number stands alone. Maximum 4 steps. Each step is either a plain string (single line) or an object `{ "label": "...", "text": "..." }` for a two-line step: `label` renders in monospace small-caps above `text`, which uses the standard large step style. Use the object form when each step needs a named context line above the value (e.g. `"label": "Website standalone", "text": "3.905.000€"`).

**`trend`** sets direction only (up-right SVG arrow for `"up"`, down-right for `"down"`). Not a binary good/bad: a `"down"` trend on cost or churn can be positive. Write `caption` to make the direction's meaning explicit.

**When to use:** When a single figure is the entire argument and deserves a full slide. Not a supporting metric; the one number that changes how the audience understands the opportunity, the risk, or the outcome. Works best for large concrete figures: revenue, user numbers, market size, key performance data.

**number vs bar:** `bar` is for a percentage that physically fills to its proportion (the bar's size IS the argument). Use `bar` when the number maps to a 0–100 fill. Use `number` for any other hero figure: absolute values (`550M`, `2.900€`), ratios (`4.9`, `3×`), and percentages where the proportion itself doesn't need to be physical.

**number vs compare:** `number` is one hero figure, singular. `compare` is when the relationship between two figures is the point and you need to see both at scale. One figure goes to `number`; the gap between two goes to `compare`.

**number vs budget:** `budget` breaks a total down into its parts: the figure is a sum, and showing the components and how they add up is the point (`148.200€` = Discovery + Build + Integration). `number` shows a single figure that doesn't decompose; one standalone result, shown whole. If the figure is a sum you want to show the parts of, use `budget`; if it's a standalone result with no breakdown, use `number`. Note the intent edge case: the same euro figure can go either way. A project total shown broken into phases is `budget`; the same total shown as one whole investment against a larger return is `number`. Decomposition vs singularity decides, not the figure itself.

**number vs list:** `number` is one hero figure; if it has steps, they derive into that figure, each feeding the next and ending at a single payoff. `list` is several independent peer figures with no derivation between them. If the figures build toward one result → `number` cascade; if they stand alone as peers → `list`.

### `compare`
```json
{
  "template": "compare",
  "label": "string?",
  "headline": "string",
  "body": "string?",
  "bars": [
    {
      "value": "string (the displayed figure, verbatim: \"100€\", \"550M\", \"2.9k\")",
      "amount": "number (true magnitude used to compute column height, e.g. 100, 20)",
      "title": "string? (bold label naming the figure; appears below the value)",
      "caption": "string? (one supporting line below the title)",
      "color": "palette key? (emerald, amber, rust, sky, blue, violet, pink, red)"
    }
  ]
}
```
Exactly two bars. Not one, not three.

Layout: slide-header on the bordered `slide-left` column (~38%). The two bars fill the right area, sitting on a shared baseline at the bottom and growing upward. Each bar carries a palette color fill with grain texture. Inside the bar, `value` renders large at the top in white (payment-bar style: 120px, 500 weight, -8px tracking), with `title` in bold near-black and `caption` in regular near-black beneath it. If a bar is too short to hold its label inside (height < 40% of the taller), the label sits just above the bar on the linen background instead, in near-black text.

**Critical rule on `value` vs `amount`:** `value` is a display string rendered verbatim; write currency symbols, separators, and suffixes exactly as they should appear (`"2.900€"`, `"550M"`). Never parse or reformat it. `amount` is a plain number used solely to compute column height proportions. The taller bar (highest `amount`) fills the full available height; the shorter scales as `amount / max(amount)`. Columns are always drawn to true scale, because a magnitude comparison that isn't to scale is misleading.

**Animation:** On slide activation, bars grow upward from the shared baseline, slightly staggered (bar 1 then bar 2), so the room watches one dwarf the other. Labels fade in after the bars have grown.

**When to use:** A head-to-head between exactly two absolute figures where the visible size difference is the argument (cost vs return, before vs after, us vs them in absolute terms). The two amounts must be the same unit and genuinely comparable (`100€` vs `20€` works; `100€` vs `92%` is meaningless at relative scale). The gap is the argument: if the bars would be roughly the same height, the slide communicates nothing.

**Validator warning:** The build script warns when the smaller bar is below 5% of the taller; at that ratio it renders as an unreadable sliver. State the contrast as a ratio in a `number` slide instead.

**compare vs bar:** `bar` is one value as a proportion of a whole (0–100 fill). `compare` is two independent absolute magnitudes at relative height, where the contrast between them is the point.

**compare vs number:** `number` is one hero figure. `compare` is when the relationship between two figures is the point and you need to see both at scale.

**compare vs budget:** `budget` decomposes one total into its parts. `compare` sets two independent totals side by side.

**compare vs waffle:** `waffle` is parts of a single whole summing to 100. `compare` is two magnitudes not part of the same whole.

## Adding a new slide type

1. Create `slides/<type>/` directory
2. Add `<type>.html` with `{{placeholders}}` for injectable content
3. Add `<type>.css` with layout rules scoped to `[data-slide-type="<type>"]`
4. Document its schema in this file
5. Add it to `deck.json` to use it

## Commands

```bash
node build.js [client]          # build a client deck: decks/[client]/deck.json → decks/[client]/dist/index.html
node build.js [client] --watch  # same, rebuilds on every save to deck.json

npm run build    # build the root template deck (development only)
npm run dev      # build + watch the root template deck
npm run preview  # serve an already-built root dist/
```
