const {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  existsSync,
  watch,
} = require("fs");
const { join } = require("path");
const http = require("http");

const ROOT     = __dirname;
const WATCH    = process.argv.includes("--watch");
const CLIENT   = process.argv.slice(2).find(a => !a.startsWith('--')) || null;
const DECK_DIR = CLIENT ? join(ROOT, 'decks', CLIENT) : ROOT;
const DIST_DIR = join(ROOT, 'dist');
const OUT_DIR  = CLIENT ? join(ROOT, 'decks', CLIENT) : DIST_DIR;
const SEQUENCE = ['blue','emerald','violet','sky','amber','rust','pink','red'];
const seqColor = i => `var(--color-${SEQUENCE[i % SEQUENCE.length]})`;

function findBlock(template, tag) {
  const open = new RegExp(`\\{\\{#${tag}[\\s\\w]*\\}\\}`);
  const close = `{{/${tag}}}`;
  let depth = 1,
    i = 0;
  while (i < template.length && depth > 0) {
    const co = template.indexOf(close, i);
    if (co === -1) break;
    const mo = open.exec(template.slice(i));
    const oo = mo ? i + mo.index : -1;
    if (oo !== -1 && oo < co) {
      depth++;
      i = oo + mo[0].length;
    } else {
      depth--;
      if (depth === 0)
        return {
          block: template.slice(0, co),
          rest: template.slice(co + close.length),
        };
      i = co + close.length;
    }
  }
  return { block: template, rest: "" };
}

function processTag(template, tag, handler) {
  const openRe = new RegExp(`\\{\\{#${tag} (\\w+)\\}\\}`);
  let result = "",
    rest = template;
  while (true) {
    const m = openRe.exec(rest);
    if (!m) {
      result += rest;
      break;
    }
    result += rest.slice(0, m.index);
    const { block, rest: after } = findBlock(
      rest.slice(m.index + m[0].length),
      tag,
    );
    result += handler(m[1], block);
    rest = after;
  }
  return result;
}

function render(template, data) {
  // {{> partialName}}
  template = template.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => {
    const p = join(ROOT, "components", name, `${name}.html`);
    return existsSync(p) ? readFileSync(p, "utf8") : "";
  });
  // {{#each key}}...{{/each}} (supports nesting)
  template = processTag(template, "each", (key, block) => {
    const items = data[key];
    if (!Array.isArray(items)) return "";
    return items
      .map((item) => {
        const ctx =
          typeof item === "object" && item !== null
            ? { ...data, ...item }
            : { ...data, this: item };
        return render(block, ctx);
      })
      .join("");
  });
  // {{#if key}}...{{/if}} (supports nesting)
  template = processTag(template, "if", (key, block) => {
    return data[key] ? render(block, data) : "";
  });
  // {{variable}}
  template = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return data[key] !== undefined && data[key] !== null
      ? String(data[key])
      : "";
  });
  return template;
}

function collectUI() {
  const uiDir = join(ROOT, "ui");
  return readdirSync(uiDir)
    .filter((d) => statSync(join(uiDir, d)).isDirectory())
    .sort()
    .reduce((acc, dir) => {
      const files = readdirSync(join(uiDir, dir));
      const htmlFile = files.find((f) => f.endsWith(".html"));
      if (htmlFile)
        acc += readFileSync(join(uiDir, dir, htmlFile), "utf8").trim() + "\n";
      return acc;
    }, "");
}

// ── Validation helpers ────────────────────────────────────────────────────────

const PALETTE_KEYS = new Set(['rust','amber','emerald','sky','blue','violet','pink','red']);

const isStr     = v => typeof v === 'string' && v.length > 0;
const isNum     = v => typeof v === 'number' && isFinite(v);
const isPctStr  = v => typeof v === 'string' && /^\d+(\.\d+)?%$/.test(v.trim());
const isPalette      = v => PALETTE_KEYS.has(v);
const isHex          = v => typeof v === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim());
const isHexOrPalette = v => isHex(v) || isPalette(v);

function e(idx, tpl, msg) { return { severity: 'error',   message: `slide ${idx} (${tpl}): ${msg}` }; }
function w(idx, tpl, msg) { return { severity: 'warning', message: `slide ${idx} (${tpl}): ${msg}` }; }

function requireStr(s, idx, ...fields) {
  return fields
    .filter(f => !isStr(s[f]))
    .map(f => e(idx, s.template, `"${f}" is required (non-empty string)`));
}

function checkMetrics(metrics, idx, tpl) {
  if (!Array.isArray(metrics)) return [e(idx, tpl, '"metrics" must be an array')];
  return metrics.flatMap((m, mi) => {
    const issues = [];
    if (!isStr(m.value)) issues.push(e(idx, tpl, `metrics[${mi+1}]: "value" is required`));
    if (!isStr(m.label)) issues.push(e(idx, tpl, `metrics[${mi+1}]: "label" is required`));
    return issues;
  });
}

// ── Validators ────────────────────────────────────────────────────────────────
// Canonical contracts for each template. Each function receives (slide, 1-based index)
// and returns [{severity: "error"|"warning", message}].
// CLAUDE.md schemas should agree with what's here, not the other way around.

const VALIDATORS = {

  cover(s, i) {
    const issues = requireStr(s, i, 'headline', 'sharedDate', 'partner');
    if (!s.client || typeof s.client !== 'object') {
      issues.push(e(i, 'cover', '"client" is required (object with name, logo, color)'));
    } else {
      if (!isStr(s.client.name))
        issues.push(e(i, 'cover', '"client.name" is required (non-empty string)'));
      if (!isStr(s.client.logo)) {
        issues.push(w(i, 'cover', '"client.logo" is missing; client name will render as text fallback'));
      } else {
        const raw = s.client.logo.trimStart();
        const isSvgMarkup = raw.startsWith('<svg') || raw.startsWith('<SVG');
        const isUrl = raw.startsWith('http://') || raw.startsWith('https://');
        if (!isSvgMarkup && !isUrl && !existsSync(join(DECK_DIR, 'assets', raw))) {
          issues.push(w(i, 'cover', `"client.logo": file "assets/${raw}" not found; client name will render as text fallback`));
        }
      }
      if (!isStr(s.client.color)) {
        issues.push(e(i, 'cover', '"client.color" is required (palette key or hex #RGB / #RRGGBB)'));
      } else if (!isHexOrPalette(s.client.color)) {
        issues.push(e(i, 'cover', `"client.color" must be a palette key or hex, got "${s.client.color}"`));
      }
    }
    return issues;
  },

  statement(s, i) {
    const VALID_VARIANTS = ['text', 'center', 'media', 'feature'];
    const BUILT_VARIANTS = ['center', 'text', 'media', 'feature'];
    const issues = [];
    if (!isStr(s.variant)) {
      issues.push(e(i, 'statement', '"variant" is required'));
    } else if (!VALID_VARIANTS.includes(s.variant)) {
      issues.push(e(i, 'statement', `"variant" must be one of ${VALID_VARIANTS.map(v => `"${v}"`).join(', ')}, got "${s.variant}"`));
    } else if (!BUILT_VARIANTS.includes(s.variant)) {
      issues.push(e(i, 'statement', `variant "${s.variant}" is defined but not yet implemented`));
    }
    // headline is required for all variants except media, which carries no text
    if (s.variant !== 'media' && !isStr(s.headline)) issues.push(e(i, 'statement', '"headline" is required'));
    if (s.variant === 'center') {
      if (isStr(s.body))         issues.push(w(i, 'statement', '"body" is unused on variant "center" and will be ignored'));
      if (s.media !== undefined) issues.push(w(i, 'statement', '"media" is unused on variant "center" and will be ignored'));
    }
    if (s.variant === 'text') {
      const TEXT_BODY_MIN_CHARS = 400;
      const VALID_MEDIA_TYPES   = ['image', 'video', 'embed'];
      const VALID_FIT_VALUES    = ['cover', 'contain'];
      if (!isStr(s.body)) {
        issues.push(e(i, 'statement', '"body" is required for variant "text"'));
      } else if (s.body.length < TEXT_BODY_MIN_CHARS) {
        issues.push(w(i, 'statement', `variant "text" body is only ${s.body.length} chars (minimum ${TEXT_BODY_MIN_CHARS}): "text" is for long-form prose; use "center" if the headline stands alone or "feature" for a point with a supporting visual`));
      }
      if (s.media !== undefined) {
        if (typeof s.media !== 'object' || Array.isArray(s.media)) {
          issues.push(e(i, 'statement', '"media" must be an object with "type" and "url" when present'));
        } else {
          if (!isStr(s.media.type)) {
            issues.push(e(i, 'statement', '"media.type" is required: must be "image", "video", or "embed"'));
          } else if (!VALID_MEDIA_TYPES.includes(s.media.type)) {
            issues.push(e(i, 'statement', `"media.type" must be "image", "video", or "embed", got "${s.media.type}"`));
          }
          if (!isStr(s.media.url)) {
            issues.push(w(i, 'statement', '"media.url" is missing (placeholder will render)'));
          }
          if (s.media.fit !== undefined && !VALID_FIT_VALUES.includes(s.media.fit)) {
            issues.push(e(i, 'statement', `"media.fit" must be "cover" or "contain" (or omit to use the type default), got "${s.media.fit}"`));
          }
          const VALID_ANCHOR_VALUES = ['top','bottom','left','right','top left','top right','bottom left','bottom right'];
          if (s.media.anchor !== undefined && !VALID_ANCHOR_VALUES.includes(s.media.anchor)) {
            issues.push(e(i, 'statement', `"media.anchor" must be one of: top, bottom, left, right, top left, top right, bottom left, bottom right, got "${s.media.anchor}"`));
          }
          if (s.media.type === 'embed' && !isStr(s.media.poster)) {
            issues.push(w(i, 'statement', '"media.poster" is missing on embed (thumbnails and inactive slides will show nothing)'));
          }
        }
      }
      const hasMedia = s.media !== undefined;
      const hasAfter = isStr(s.after);
      if (!hasMedia && !hasAfter) {
        issues.push(w(i, 'statement', 'variant "text": right column is a single body block with nothing else; the slide risks rendering bland. Three ways out: add a visual ("media"), develop the prose into two parts ("after" plus a longer body), or re-route to a template that fits shorter content ("center" for a single line, "feature" for a point with a visual, "number" for a figure, "list" for peer points, "compare" for a contrast)'));
      }
    }
    if (s.variant === 'media') {
      if (isStr(s.label))    issues.push(w(i, 'statement', '"label" is unused on variant "media" and will be ignored'));
      if (isStr(s.headline)) issues.push(w(i, 'statement', '"headline" is unused on variant "media" and will be ignored'));
      if (s.body !== undefined) issues.push(w(i, 'statement', '"body" is unused on variant "media" and will be ignored'));
      const VALID_MEDIA_TYPES = ['image', 'video', 'embed'];
      const VALID_FIT_VALUES  = ['cover', 'contain'];
      if (!s.media || typeof s.media !== 'object' || Array.isArray(s.media)) {
        issues.push(e(i, 'statement', '"media" is required for variant "media" and must be an object with "type" and "url"'));
      } else {
        if (!isStr(s.media.type)) {
          issues.push(e(i, 'statement', '"media.type" is required: must be "image", "video", or "embed"'));
        } else if (!VALID_MEDIA_TYPES.includes(s.media.type)) {
          issues.push(e(i, 'statement', `"media.type" must be "image", "video", or "embed", got "${s.media.type}"`));
        }
        if (!isStr(s.media.url)) {
          issues.push(w(i, 'statement', '"media.url" is missing (placeholder will render)'));
        }
        if (s.media.fit !== undefined && !VALID_FIT_VALUES.includes(s.media.fit)) {
          issues.push(e(i, 'statement', `"media.fit" must be "cover" or "contain" (or omit to use the type default), got "${s.media.fit}"`));
        }
        const VALID_ANCHOR_VALUES_M = ['top','bottom','left','right','top left','top right','bottom left','bottom right'];
        if (s.media.anchor !== undefined && !VALID_ANCHOR_VALUES_M.includes(s.media.anchor)) {
          issues.push(e(i, 'statement', `"media.anchor" must be one of: top, bottom, left, right, top left, top right, bottom left, bottom right, got "${s.media.anchor}"`));
        }
        if (s.media.type === 'embed' && !isStr(s.media.poster)) {
          issues.push(w(i, 'statement', '"media.poster" is missing on embed (thumbnails and inactive slides will show nothing)'));
        }
      }
    }
    if (s.variant === 'feature') {
      const VALID_ORIENTATIONS = ['side', 'below'];
      const VALID_MEDIA_TYPES  = ['image', 'video', 'embed'];
      const VALID_FIT_VALUES   = ['cover', 'contain'];
      if (s.orientation !== undefined && !VALID_ORIENTATIONS.includes(s.orientation)) {
        issues.push(e(i, 'statement', `"orientation" must be "side" or "below" (or omit for the default "side"), got "${s.orientation}"`));
      }
      if (!s.media || typeof s.media !== 'object' || Array.isArray(s.media)) {
        issues.push(e(i, 'statement', '"media" is required for variant "feature"; without media, use variant "text" instead'));
      } else {
        if (!isStr(s.media.type)) {
          issues.push(e(i, 'statement', '"media.type" is required: must be "image", "video", or "embed"'));
        } else if (!VALID_MEDIA_TYPES.includes(s.media.type)) {
          issues.push(e(i, 'statement', `"media.type" must be "image", "video", or "embed", got "${s.media.type}"`));
        }
        if (!isStr(s.media.url)) {
          issues.push(w(i, 'statement', '"media.url" is missing (placeholder will render)'));
        }
        if (s.media.fit !== undefined && !VALID_FIT_VALUES.includes(s.media.fit)) {
          issues.push(e(i, 'statement', `"media.fit" must be "cover" or "contain" (or omit to use the type default), got "${s.media.fit}"`));
        }
        const VALID_ANCHOR_VALUES_F = ['top','bottom','left','right','top left','top right','bottom left','bottom right'];
        if (s.media.anchor !== undefined && !VALID_ANCHOR_VALUES_F.includes(s.media.anchor)) {
          issues.push(e(i, 'statement', `"media.anchor" must be one of: top, bottom, left, right, top left, top right, bottom left, bottom right, got "${s.media.anchor}"`));
        }
        if (s.media.type === 'embed' && !isStr(s.media.poster)) {
          issues.push(w(i, 'statement', '"media.poster" is missing on embed (thumbnails and inactive slides will show nothing)'));
        }
      }
    }
    return issues;
  },

  end(s, i) {
    const issues = requireStr(s, i, 'headline', 'sharedDate', 'partner');
    if (!s.client || typeof s.client !== 'object') {
      issues.push(e(i, 'end', '"client" is required (object with name, logo, color)'));
    } else {
      if (!isStr(s.client.name))
        issues.push(e(i, 'end', '"client.name" is required (non-empty string)'));
      if (!isStr(s.client.logo)) {
        issues.push(w(i, 'end', '"client.logo" is missing; client name will render as text fallback'));
      } else {
        const raw = s.client.logo.trimStart();
        const isSvgMarkup = raw.startsWith('<svg') || raw.startsWith('<SVG');
        const isUrl = raw.startsWith('http://') || raw.startsWith('https://');
        if (!isSvgMarkup && !isUrl && !existsSync(join(DECK_DIR, 'assets', raw))) {
          issues.push(w(i, 'end', `"client.logo": file "assets/${raw}" not found; client name will render as text fallback`));
        }
      }
      if (!isStr(s.client.color)) {
        issues.push(e(i, 'end', '"client.color" is required (palette key or hex #RGB / #RRGGBB)'));
      } else if (!isHexOrPalette(s.client.color)) {
        issues.push(e(i, 'end', `"client.color" must be a palette key or hex, got "${s.client.color}"`));
      }
    }
    return issues;
  },

  table(s, i) {
    const issues = requireStr(s, i, 'headline');
    if (!Array.isArray(s.rows) || s.rows.length === 0)
      issues.push(e(i, 'table', '"rows" is required (non-empty array)'));
    const colCount = Array.isArray(s.columns) ? s.columns.length : (s.rows?.[0]?.cells?.length || 0);
    if (colCount > 4)
      issues.push(w(i, 'table', `columns: ${colCount} columns exceeds the recommended maximum of 4; the table will be hard to scan`));
    if (Array.isArray(s.columns)) {
      s.columns.forEach((col, ci) => {
        if (!isStr(col.label)) issues.push(e(i, 'table', `columns[${ci}].label: required (non-empty string)`));
        if (col.accent !== undefined && !isPalette(col.accent))
          issues.push(e(i, 'table', `columns[${ci}].accent: unknown palette key "${col.accent}"; must be one of ${[...PALETTE_KEYS].join(', ')}`));
      });
    }
    if (Array.isArray(s.rows)) {
      const maxRows = colCount === 2 ? 10 : 8;
      if (s.rows.length > maxRows)
        issues.push(w(i, 'table', `rows: ${s.rows.length} rows exceeds the recommended maximum of ${maxRows} for a ${colCount}-column table; content will overflow`));
      s.rows.forEach((row, ri) => {
        if (!Array.isArray(row.cells) || row.cells.length === 0)
          issues.push(e(i, 'table', `rows[${ri}].cells: required (non-empty array)`));
        else if (colCount > 0 && row.cells.length !== colCount)
          issues.push(w(i, 'table', `rows[${ri}].cells: has ${row.cells.length} cells but there are ${colCount} columns`));
        if (row.accent !== undefined && !isPalette(row.accent))
          issues.push(e(i, 'table', `rows[${ri}].accent: unknown palette key "${row.accent}"; must be one of ${[...PALETTE_KEYS].join(', ')}`));
      });
    }
    return issues;
  },

  bar(s, i) {
    const issues = requireStr(s, i, 'headline', 'value');
    if (isStr(s.value) && !isPctStr(s.value))
      issues.push(e(i, 'bar', `"value" must be a percentage string (e.g. "96%"), got "${s.value}"`));
    if (!isNum(s.fill)) {
      issues.push(e(i, 'bar', '"fill" is required (number 0–100)'));
    } else {
      if (s.fill < 0 || s.fill > 100)
        issues.push(e(i, 'bar', `"fill" must be 0–100, got ${s.fill}`));
      if (isPctStr(s.value) && Math.round(s.fill) !== parseInt(s.value, 10))
        issues.push(w(i, 'bar', `"fill" (${s.fill}) doesn't match the integer in "value" ("${s.value}"); they should agree`));
    }
    if (s.color !== undefined && !isPalette(s.color))
      issues.push(e(i, 'bar', `"color" must be a palette key (${[...PALETTE_KEYS].join(', ')}), got "${s.color}"`));
    return issues;
  },

  waffle(s, i) {
    const issues = [];
    if (!Array.isArray(s.segments) || s.segments.length === 0) {
      issues.push(e(i, 'waffle', '"segments" is required (non-empty array)'));
      return issues;
    }
    if (s.sentiment !== undefined && !['positive','negative'].includes(s.sentiment))
      issues.push(e(i, 'waffle', `"sentiment" must be "positive" or "negative", got "${s.sentiment}"`));
    let totalFill = 0;
    s.segments.forEach((seg, si) => {
      const p = `segment ${si+1}`;
      if (!isStr(seg.value)) issues.push(e(i, 'waffle', `${p}: "value" is required (string)`));
      if (!isStr(seg.label)) issues.push(e(i, 'waffle', `${p}: "label" is required (string)`));
      if (!isNum(seg.fill)) {
        issues.push(e(i, 'waffle', `${p}: "fill" must be a number 0–100, got ${JSON.stringify(seg.fill)}`));
      } else {
        if (seg.fill < 0 || seg.fill > 100) issues.push(e(i, 'waffle', `${p}: "fill" must be 0–100, got ${seg.fill}`));
        totalFill += seg.fill;
      }
      if (seg.color !== undefined && !isPalette(seg.color))
        issues.push(e(i, 'waffle', `${p}: "color" must be a palette key, got "${seg.color}"`));
    });
    if (totalFill > 100)
      issues.push(e(i, 'waffle', `total fill across all segments is ${totalFill}; must not exceed 100`));
    // Warn on mild splits when grid is full. The waffle earns its place on extreme ratios;
    // a near-equal split across a full grid communicates nothing a pie chart wouldn't do better.
    if (totalFill >= 95) {
      s.segments.forEach((seg, si) => {
        if (isNum(seg.fill) && seg.fill >= 35 && seg.fill <= 65)
          issues.push(w(i, 'waffle', `segment ${si+1}: fill ${seg.fill}% is a mild split on a full grid; waffle is most powerful for extreme ratios, consider a different format`));
      });
    }
    return issues;
  },

  treemap(s, i) {
    const issues = requireStr(s, i, 'headline');
    if (!Array.isArray(s.segments) || s.segments.length === 0) {
      issues.push(e(i, 'treemap', '"segments" is required (non-empty array)'));
      return issues;
    }
    // Max 6 segments. Above this the squarified cells become too small for legible labels.
    if (s.segments.length > 6)
      issues.push(e(i, 'treemap', `too many segments (${s.segments.length}); max is 6 (group smaller ones into "Other" first)`));
    s.segments.forEach((seg, si) => {
      const p = `segment ${si+1}`;
      if (!isStr(seg.value)) issues.push(e(i, 'treemap', `${p}: "value" is required (string)`));
      if (!isNum(seg.fill))  issues.push(e(i, 'treemap', `${p}: "fill" must be a number, got ${JSON.stringify(seg.fill)}`));
      if (!isStr(seg.label)) issues.push(e(i, 'treemap', `${p}: "label" is required (string)`));
      if (seg.color !== undefined && !isPalette(seg.color))
        issues.push(e(i, 'treemap', `${p}: "color" must be a palette key, got "${seg.color}"`));
    });
    return issues;
  },

  timeline(s, i) {
    const issues = requireStr(s, i, 'headline', 'unit');
    if (!Array.isArray(s.phases) || s.phases.length === 0) {
      issues.push(e(i, 'timeline', '"phases" is required (non-empty array)'));
      return issues;
    }
    let maxEnd = 0;
    s.phases.forEach((p, pi) => {
      const ph = `phase ${pi+1}`;
      if (!isStr(p.label))    issues.push(e(i, 'timeline', `${ph}: "label" is required`));
      if (!isNum(p.duration)) issues.push(e(i, 'timeline', `${ph}: "duration" must be a number`));
      if (p.offset !== undefined && !isNum(p.offset)) issues.push(e(i, 'timeline', `${ph}: "offset" must be a number`));
      maxEnd = Math.max(maxEnd, (p.offset || 0) + (isNum(p.duration) ? p.duration : 0));
    });
    if (s.total !== undefined && isNum(s.total) && s.total < maxEnd)
      issues.push(w(i, 'timeline', `"total" (${s.total}) is less than max(offset+duration) (${maxEnd}); phases will overflow the timeline bar`));
    return issues;
  },

  budget(s, i) {
    const issues = requireStr(s, i, 'headline');
    if (!isNum(s.totalBudget)) issues.push(e(i, 'budget', '"totalBudget" is required (number)'));
    if (!Array.isArray(s.phases) || s.phases.length === 0) {
      issues.push(e(i, 'budget', '"phases" is required (non-empty array)'));
      return issues;
    }
    s.phases.forEach((p, pi) => {
      const ph = `phase ${pi+1}`;
      if (!isStr(p.label)) issues.push(e(i, 'budget', `${ph}: "label" is required`));
      if (p.amount === undefined || p.amount === null)
        issues.push(e(i, 'budget', `${ph}: "amount" is required`));
      else if (isPctStr(String(p.amount)) && (!isNum(s.totalBudget) || s.totalBudget === 0))
        issues.push(e(i, 'budget', `${ph}: "amount" is a percentage but "totalBudget" is missing or zero; cannot calculate absolute value`));
    });
    return issues;
  },

  payment(s, i) {
    const issues = requireStr(s, i, 'headline');
    if (!isNum(s.totalBudget)) issues.push(e(i, 'payment', '"totalBudget" is required (number)'));
    if (!Array.isArray(s.payments) || s.payments.length === 0) {
      issues.push(e(i, 'payment', '"payments" is required (non-empty array)'));
      return issues;
    }
    s.payments.forEach((p, pi) => {
      const pm = `payment ${pi+1}`;
      if (!isStr(p.label))  issues.push(e(i, 'payment', `${pm}: "label" is required`));
      if (p.amount === undefined || p.amount === null) issues.push(e(i, 'payment', `${pm}: "amount" is required`));
      if (p.split !== undefined) {
        if (!Number.isInteger(p.split) || p.split < 1)
          issues.push(e(i, 'payment', `${pm}: "split" must be a positive integer, got ${JSON.stringify(p.split)}`));
        // Installment copy can't be generated by the build script; the author must write it
        if (!isStr(p.description))
          issues.push(w(i, 'payment', `${pm}: has "split" but no "description"; per-installment copy should explain the schedule and amount`));
      }
    });
    return issues;
  },

  tabs(s, i) {
    const issues = requireStr(s, i, 'headline');
    if (!Array.isArray(s.tabs) || s.tabs.length === 0) {
      issues.push(e(i, 'tabs', '"tabs" is required (non-empty array)'));
      return issues;
    }
    s.tabs.forEach((p, pi) => {
      const ph = `tab ${pi+1}`;
      if (!isStr(p.label)) issues.push(e(i, 'tabs', `${ph}: "label" is required`));
      // A tab with no content renders as a blank panel, which is always a mistake
      const hasContent = (Array.isArray(p.body) && p.body.length > 0) ||
                         (Array.isArray(p.deliverables) && p.deliverables.length > 0) ||
                         (Array.isArray(p.team) && p.team.length > 0);
      if (!hasContent) issues.push(w(i, 'tabs', `${ph}: has no body, deliverables, or team; panel will render empty`));
    });
    return issues;
  },


  list(s, i) {
    const issues = requireStr(s, i, 'headline');
    if (!Array.isArray(s.items) || s.items.length === 0) {
      issues.push(e(i, 'list', '"items" is required (non-empty array)'));
      return issues;
    }
    if (s.items.length > 6)
      issues.push(w(i, 'list', `${s.items.length} items (recommended maximum is 6; more will feel cramped)`));
    const hasValue = s.items.some(it => it.value !== undefined);
    const noValue  = s.items.some(it => it.value === undefined);
    if (hasValue && noValue)
      issues.push(w(i, 'list', 'mixed list: some items have "value" and some do not; use value consistently or omit it across all items'));
    s.items.forEach((item, ii) => {
      if (!isStr(item.heading))
        issues.push(e(i, 'list', `item ${ii + 1}: "heading" is required (non-empty string)`));
      if (item.color !== undefined && !isPalette(item.color))
        issues.push(e(i, 'list', `item ${ii + 1}: "color" must be a palette key, got "${item.color}"`));
    });
    // Color marks the row that matters most; using it on most rows emphasizes nothing
    const coloredCount = s.items.filter(it => it.color !== undefined).length;
    if (coloredCount > 2)
      issues.push(w(i, 'list', `${coloredCount} items carry a color; color marks the row that matters most, and using it on more than 2 items dilutes the emphasis`));
    return issues;
  },

  number(s, i) {
    const issues = [];
    if (!isStr(s.value))
      issues.push(e(i, 'number', '"value" is required (non-empty string)'));
    if (s.trend !== undefined && s.trend !== 'up' && s.trend !== 'down')
      issues.push(e(i, 'number', `"trend" must be "up" or "down", got "${s.trend}"`));
    if (s.color !== undefined && !isPalette(s.color))
      issues.push(e(i, 'number', `"color" must be a palette key, got "${s.color}"`));
    if (s.steps !== undefined) {
      if (!Array.isArray(s.steps) || s.steps.length === 0)
        issues.push(e(i, 'number', '"steps" must be a non-empty array when present'));
      else {
        if (s.steps.length > 4)
          issues.push(w(i, 'number', `${s.steps.length} steps (recommended maximum is 4; more will feel crowded)`));
        s.steps.forEach((step, ii) => {
          if (isStr(step)) return;
          if (step && typeof step === 'object' && isStr(step.text)) return;
          issues.push(e(i, 'number', `step ${ii + 1}: must be a non-empty string or an object with a "text" field`));
        });
      }
    }
    return issues;
  },

  compare(s, i) {
    const issues = requireStr(s, i, 'headline');
    if (!Array.isArray(s.bars) || s.bars.length === 0) {
      issues.push(e(i, 'compare', '"bars" is required (non-empty array)'));
      return issues;
    }
    if (s.bars.length !== 2)
      issues.push(e(i, 'compare', `"bars" must have exactly 2 entries, got ${s.bars.length}`));
    s.bars.forEach((bar, bi) => {
      const b = `bar ${bi + 1}`;
      if (!isStr(bar.value))
        issues.push(e(i, 'compare', `${b}: "value" is required (non-empty string)`));
      if (!isNum(bar.amount) || bar.amount <= 0)
        issues.push(e(i, 'compare', `${b}: "amount" must be a positive number, got ${JSON.stringify(bar.amount)}`));
      if (bar.color !== undefined && !isPalette(bar.color))
        issues.push(e(i, 'compare', `${b}: "color" must be a palette key, got "${bar.color}"`));
    });
    // Extreme ratios (< 5% of the taller) produce an unreadable sliver. The contrast
    // is better stated as a ratio in a number slide than shown visually at that scale.
    if (s.bars.length === 2 && isNum(s.bars[0].amount) && isNum(s.bars[1].amount)) {
      const max = Math.max(s.bars[0].amount, s.bars[1].amount);
      const min = Math.min(s.bars[0].amount, s.bars[1].amount);
      if (min / max < 0.05)
        issues.push(w(i, 'compare', `the smaller bar is less than 5% of the taller (${min} vs ${max}); it will render as an unreadable sliver, so state the ratio as text in a number slide instead`));
    }
    return issues;
  },

  team(s, i) {
    const issues = requireStr(s, i, 'headline');
    if (!Array.isArray(s.members) || s.members.length === 0) {
      issues.push(e(i, 'team', '"members" is required (non-empty array)'));
      return issues;
    }
    s.members.forEach((m, mi) => {
      if (!isStr(m.name))  issues.push(e(i, 'team', `member ${mi+1}: "name" is required`));
      // photo degrades gracefully (broken img) but is always a content mistake, not a hard error
      if (!isStr(m.photo)) issues.push(w(i, 'team', `member ${mi+1}: "photo" is missing (placeholder will render)`));
    });
    return issues;
  },

  showcase(s, i) {
    const issues = requireStr(s, i, 'headline');
    if (!Array.isArray(s.media)) {
      issues.push(e(i, 'showcase', '"media" must be an array of URL strings'));
    } else if (s.media.length === 0) {
      issues.push(w(i, 'showcase', '"media" is empty (placeholder will render in the media panel)'));
    } else {
      s.media.forEach((url, ui) => {
        if (!isStr(url)) issues.push(w(i, 'showcase', `media item ${ui + 1}: expected a URL string (placeholder will render)`));
      });
    }
    if (s.metrics !== undefined) {
      if (!Array.isArray(s.metrics)) {
        issues.push(e(i, 'showcase', '"metrics" must be an array'));
      } else {
        // Layout is a fixed 2×2 grid; more than 4 will overflow
        if (s.metrics.length > 4)
          issues.push(e(i, 'showcase', `too many metrics (${s.metrics.length}); max is 4 (2×2 grid)`));
        s.metrics.forEach((m, mi) => {
          const mt = `metric ${mi+1}`;
          if (!isStr(m.value)) issues.push(e(i, 'showcase', `${mt}: "value" is required`));
          if (!isStr(m.label)) issues.push(e(i, 'showcase', `${mt}: "label" is required`));
          if (m.trend !== undefined && !['up','down'].includes(m.trend))
            issues.push(e(i, 'showcase', `${mt}: "trend" must be "up" or "down", got "${m.trend}"`));
          // The trend arrow carries direction; a sign in the value is redundant and breaks formatting
          if (isStr(m.value)      && /[+\-]/.test(m.value))
            issues.push(w(i, 'showcase', `${mt}: "value" contains + or - ("${m.value}"); the trend arrow carries direction, remove the sign`));
          if (isStr(m.trendValue) && /[+\-]/.test(m.trendValue))
            issues.push(w(i, 'showcase', `${mt}: "trendValue" contains + or - ("${m.trendValue}"); the trend arrow carries direction, remove the sign`));
        });
      }
    }
    return issues;
  },

};

// ── Validation runner ─────────────────────────────────────────────────────────

function validate(deck) {
  const issues = [];
  if (!Array.isArray(deck.slides) || deck.slides.length === 0) {
    issues.push({ severity: 'error', message: 'deck.json: "slides" must be a non-empty array' });
    return issues;
  }
  deck.slides.forEach((slide, idx) => {
    const i   = idx + 1;
    const tpl = slide.template;
    if (!isStr(tpl)) {
      issues.push({ severity: 'error', message: `slide ${i}: "template" field is required (string)` });
      return;
    }
    if (!VALIDATORS[tpl]) {
      issues.push({ severity: 'error', message: `slide ${i} (${tpl}): unknown template; not in VALIDATORS map` });
      return;
    }
    if (!existsSync(join(ROOT, 'slides', tpl))) {
      issues.push({ severity: 'error', message: `slide ${i} (${tpl}): slides/${tpl}/ directory is missing; template cannot be rendered` });
      return;
    }
    issues.push(...VALIDATORS[tpl](slide, i));
  });
  const textCount = deck.slides.filter(s => s.template === 'statement' && s.variant === 'text').length;
  if (textCount > 1) {
    issues.push({ severity: 'warning', message: `deck contains ${textCount} "text" statement slides: long-prose slides should stay rare; verify each earns a full-slide beat` });
  }
  return issues;
}

function printIssues(issues) {
  const errors   = issues.filter(x => x.severity === 'error');
  const warnings = issues.filter(x => x.severity === 'warning');
  errors.forEach(x   => console.error(`  ✗ ${x.message}`));
  if (errors.length && warnings.length) console.error('');
  warnings.forEach(x => console.warn(`  ⚠ ${x.message}`));
}

// ─────────────────────────────────────────────────────────────────────────────

function build() {
  try {
    // Parse deck.json first so we can validate before touching dist/
    const deck = JSON.parse(readFileSync(join(DECK_DIR, "deck.json"), "utf8"));

    const issues  = validate(deck);
    const errors  = issues.filter(x => x.severity === 'error');
    const warnings = issues.filter(x => x.severity === 'warning');

    if (errors.length > 0) {
      const eLabel = `${errors.length} error${errors.length > 1 ? 's' : ''}`;
      const wLabel = warnings.length ? `, ${warnings.length} warning${warnings.length > 1 ? 's' : ''}` : '';
      console.error(`\n✗ BUILD FAILED: ${eLabel}${wLabel}, dist/ NOT updated\n`);
      printIssues(issues);
      console.error('');
      if (!WATCH) process.exit(1);
      return;
    }

    let html = readFileSync(join(ROOT, "index.html"), "utf8");

    const uiHTML = collectUI();
    let slidesHTML = "";

    for (const slide of deck.slides) {
      // Enrich payment items with calculatedAmount
      if (slide.template === "payment" && slide.payments) {
        const total = slide.totalBudget || 0;
        const currency = slide.currency || "€";
        slide.gridRows = ""; // will be set after map
        slide.payments = slide.payments.map((p) => {
          let calculatedAmount, flexGrow;
          if (String(p.amount).includes("%")) {
            const pct = parseFloat(p.amount);
            const abs = Math.round((total * pct) / 100);
            calculatedAmount = `${abs.toLocaleString("de-DE")}${currency}`;
            flexGrow = pct;
          } else {
            calculatedAmount = p.amount;
            const raw = parseFloat(String(p.amount).replace(/[^0-9.]/g, ""));
            flexGrow = total ? +((raw / total) * 100).toFixed(2) : 1;
          }
          const labelLine = p.split
            ? `in ${p.split} ${p.label.toLowerCase()}`
            : `${calculatedAmount} ${p.label}`;
          const enriched = { ...p, calculatedAmount, flexGrow, labelLine };
          if (p.split) {
            const abs = Math.round((total * parseFloat(p.amount)) / 100);
            enriched.perInstallment = `${Math.round(abs / p.split).toLocaleString("de-DE")}${currency}`;
            enriched.installmentRows = `repeat(${p.split}, 1fr)`;
            enriched.installments = Array.from({ length: p.split }, (_, i) => ({
              amount: enriched.perInstallment,
              month: `Month ${i + 1}`,
            }));
          }
          return enriched;
        });
        slide.gridRows = slide.payments.map((p) => `${p.flexGrow}fr`).join(" ");

        const totalRevealMs = 800;
        const textFadeMs = 200;
        const startDelay = 300;
        const textExtraDelay = 150;
        let cursor = startDelay;
        slide.payments = slide.payments.map((p, i) => {
          const revealDuration = Math.round((p.flexGrow / 100) * totalRevealMs);
          const revealDelay = cursor;
          const textDelay = cursor + revealDuration + textExtraDelay;
          cursor += revealDuration + textExtraDelay + textFadeMs;
          return { ...p, revealDelay, revealDuration, textDelay, itemColor: seqColor(i) };
        });
      }

      // Enrich budget phases with calculatedAmount, flexGrow, and sequential animation delays
      if (slide.template === "budget" && slide.phases) {
        const total = slide.totalBudget || 0;
        const currency = slide.currency || "€";
        const barDuration = 700;
        const infoDuration = 300;
        let cursor = 100;
        slide.phases = slide.phases.map((p, i) => {
          let calculatedAmount, flexGrow;
          if (String(p.amount).includes("%")) {
            const pct = parseFloat(p.amount);
            const abs = Math.round((total * pct) / 100);
            calculatedAmount = `${abs.toLocaleString("de-DE")}${currency}`;
            flexGrow = pct;
          } else {
            const abs = Number(p.amount);
            calculatedAmount = `${abs.toLocaleString("de-DE")}${currency}`;
            flexGrow = total ? +((abs / total) * 100).toFixed(2) : 1;
          }
          const barDelay = cursor;
          const infoDelay = cursor + Math.round(barDuration * 0.75);
          cursor += Math.round(barDuration * 0.75) + infoDuration;
          return { ...p, calculatedAmount, flexGrow, itemColor: seqColor(i), barDelay, infoDelay };
        });
        slide.totalDelay = cursor;
      }

      // Enrich compare bars: proportional heights and payment-style sequential delays
      if (slide.template === 'compare' && Array.isArray(slide.bars)) {
        slide.bars = [...slide.bars].sort((a, b) => a.amount - b.amount);
        const maxAmount    = Math.max(...slide.bars.map(b => b.amount));
        const BAR_DUR_1    = 700;   // bar 1 growth duration (ms)
        const BAR_DUR_2    = 1100;  // bar 2 grows slower (creates anticipation)
        const LABEL_DUR    = 350;   // matches CSS compare-label-in duration
        const INITIAL      = 100;
        // Text fires at 75% through its bar's growth (payment pattern)
        const label1Delay  = INITIAL + Math.round(BAR_DUR_1 * 0.75);
        const bar2Delay    = label1Delay + LABEL_DUR;
        const label2Delay  = bar2Delay + Math.round(BAR_DUR_2 * 0.75);
        const durations    = [BAR_DUR_1, BAR_DUR_2];
        const barDelays    = [INITIAL, bar2Delay];
        const labelDelays  = [label1Delay, label2Delay];
        slide.bars = slide.bars.map((bar, i) => {
          const ratio     = bar.amount / maxAmount;
          const barPct    = `${(ratio * 100).toFixed(1)}%`;
          // Below 40% the column is too short to hold 120px value + title + caption + padding
          const isShort   = ratio < 0.40;
          const itemColor = bar.color ? `var(--color-${bar.color})` : seqColor(i);
          return { ...bar, barPct, isShort, itemColor, barDuration: durations[i], barDelay: barDelays[i], labelDelay: labelDelays[i] };
        });
      }

      // Enrich waffle slides: assign colors and generate 100 cells
      if (slide.template === "waffle" && slide.segments) {
        const POSITIVE = ['emerald', 'blue', 'sky', 'violet'];
        const NEGATIVE = ['rust', 'amber', 'pink', 'red'];
        const palette = slide.sentiment === 'positive' ? POSITIVE
                      : slide.sentiment === 'negative' ? NEGATIVE
                      : SEQUENCE;
        const waffleColor = i => `var(--color-${palette[i % palette.length]})`;
        const CELL_STAGGER = 22;       // ms between each cell within a segment
        const CELL_DURATION = 500;     // ms used for timing (CSS is 800ms but easing looks done ~500ms in)
        const LEGEND_GAP = 0;          // ms after last cell ENDS before legend slides in
        const LABEL_DURATION = 400;    // ms legend animation duration
        const INTER_SEGMENT_GAP = 180; // ms after legend finishes before next segment starts
        let cellIdx = 0;
        let segmentOffset = 300;
        const cells = [];
        slide.segments = slide.segments.map((seg, i) => {
          const itemColor = seg.color ? `var(--color-${seg.color})` : waffleColor(i);
          const count = seg.fill;
          for (let j = 0; j < count; j++) {
            cells.push({ color: itemColor, index: cellIdx++, cellDelay: segmentOffset + j * CELL_STAGGER });
          }
          const lastCellStart = segmentOffset + (count - 1) * CELL_STAGGER;
          const legendDelay = lastCellStart + CELL_DURATION + LEGEND_GAP;
          segmentOffset = legendDelay + LABEL_DURATION + INTER_SEGMENT_GAP;
          return { ...seg, itemColor, legendDelay };
        });
        while (cells.length < 100) {
          cells.push({ color: "", index: cellIdx++ });
        }
        slide.cells = cells;
        if (slide.emptyLabel) {
          const filled = slide.segments.reduce((sum, s) => sum + s.fill, 0);
          slide.emptyValue = `${100 - filled}%`;
          slide.emptyLabelDelay = segmentOffset;
        }
      }

      // Enrich treemap slides: squarified layout + animation delays
      if (slide.template === "treemap" && slide.segments) {
        const CELL_REVEAL_MS    = 500;
        const TEXT_EXTRA_DELAY  = 150; // ms after reveal ENDS before text fires (matches payment timing)
        const TEXT_DURATION_MS  = 200; // ms text animation takes (matches payment)
        const NUMBER_DELAY_MS   = CELL_REVEAL_MS + TEXT_EXTRA_DELAY;
        const LABEL_DELAY_MS    = CELL_REVEAL_MS + TEXT_EXTRA_DELAY + 60;
        const BETWEEN_MS        = CELL_REVEAL_MS + TEXT_EXTRA_DELAY + TEXT_DURATION_MS;

        // Squarified treemap: produces {x,y,w,h} in % for a 100×100 space
        function worstRatio(row, rowLen, shortSide) {
          const max = Math.max(...row.map(i => i.norm));
          const min = Math.min(...row.map(i => i.norm));
          const s2 = shortSide * shortSide;
          return Math.max((s2 * max) / (rowLen * rowLen), (rowLen * rowLen) / (s2 * min));
        }

        function placeRow(row, rowLen, rect, isH) {
          const placed = [];
          if (isH) {
            const rowW = rowLen / rect.h;
            let y = rect.y;
            for (const item of row) {
              const h = item.norm / rowW;
              placed.push({ ...item, x: rect.x, y, w: rowW, h });
              y += h;
            }
            return { placed, rest: { x: rect.x + rowW, y: rect.y, w: rect.w - rowW, h: rect.h } };
          } else {
            const rowH = rowLen / rect.w;
            let x = rect.x;
            for (const item of row) {
              const w = item.norm / rowH;
              placed.push({ ...item, x, y: rect.y, w, h: rowH });
              x += w;
            }
            return { placed, rest: { x: rect.x, y: rect.y + rowH, w: rect.w, h: rect.h - rowH } };
          }
        }

        function squarify(items, rect) {
          if (items.length === 0) return [];
          if (items.length === 1) return [{ ...items[0], x: rect.x, y: rect.y, w: rect.w, h: rect.h }];
          const isH = rect.w >= rect.h;
          const shortSide = isH ? rect.h : rect.w;
          let row = [], rowLen = 0, best = Infinity;
          let splitAt = 0;
          for (let i = 0; i < items.length; i++) {
            const next = items[i].norm;
            const newRow = [...row, items[i]];
            const newLen = rowLen + next;
            const ratio = worstRatio(newRow, newLen, shortSide);
            if (ratio <= best) { best = ratio; row = newRow; rowLen = newLen; splitAt = i + 1; }
            else break;
          }
          const { placed, rest } = placeRow(row, rowLen, rect, isH);
          return [...placed, ...squarify(items.slice(splitAt), rest)];
        }

        const OTHER_THRESHOLD = 8; // segments below this % are auto-grouped into "Other"
        const total = slide.segments.reduce((s, seg) => s + seg.fill, 0);
        const large = slide.segments.filter(s => (s.fill / total) * 100 >= OTHER_THRESHOLD);
        const small = slide.segments.filter(s => (s.fill / total) * 100 < OTHER_THRESHOLD);
        const otherFill = small.reduce((s, seg) => s + seg.fill, 0);
        const segments = otherFill > 0
          ? [...large, { value: `${Math.round((otherFill / total) * 100)}%`, fill: otherFill, label: "Other" }]
          : large;
        const normalized = segments
          .map((seg, i) => ({ ...seg, norm: (seg.fill / total) * 10000 }))
          .sort((a, b) => b.norm - a.norm);

        const laid = squarify(normalized, { x: 0, y: 0, w: 100, h: 100 });

        // Re-sort back to original order for animation (biggest first feels right)
        let cursor = 200;
        slide.cells = laid.map((cell, i) => {
          const itemColor = cell.color ? `var(--color-${cell.color})` : seqColor(i);
          const revealDelay  = cursor;
          const numberDelay  = cursor + NUMBER_DELAY_MS;
          const labelDelay   = cursor + LABEL_DELAY_MS;
          cursor += BETWEEN_MS;
          return {
            ...cell,
            itemColor,
            showText: true,
            x: +cell.x.toFixed(4),
            y: +cell.y.toFixed(4),
            w: +cell.w.toFixed(4),
            h: +cell.h.toFixed(4),
            revealDelay,
            numberDelay,
            labelDelay,
          };
        });
      }

      // Enrich statement: compute variant booleans for template conditionals
      if (slide.template === 'statement') {
        slide.variantIsCenter  = slide.variant === 'center';
        slide.variantIsText    = slide.variant === 'text';
        slide.variantIsMedia   = slide.variant === 'media';
        slide.variantIsFeature = slide.variant === 'feature';
        // For text: body is a prose string. Save it as textBody and null body so the
        // slide-header partial (which expects body to be a string) does not render it.
        if (slide.variant === 'text') {
          slide.textBody    = slide.body || '';
          slide.body        = null;
          slide.textHasMedia = !!(slide.media && typeof slide.media === 'object' && !Array.isArray(slide.media));
        }
        // For media, feature, and text (when media present): flatten the media object.
        if (slide.variant === 'media' || slide.variant === 'feature' || slide.variant === 'text') {
          const m = (slide.media && typeof slide.media === 'object' && !Array.isArray(slide.media))
            ? slide.media : {};
          slide.mediaType        = m.type || '';
          slide.mediaUrl         = m.url  || '';
          const fitDefault       = m.type === 'embed' ? 'contain' : 'cover';
          slide.mediaFit         = (m.fit === 'cover' || m.fit === 'contain') ? m.fit : fitDefault;
          slide.mediaPoster      = m.poster || '';
          slide.mediaPosterStyle = m.poster
            ? `background-image: url('${m.poster.replace(/'/g, '%27')}')`
            : '';
          slide.mediaIsImage     = m.type === 'image';
          slide.mediaIsVideo     = m.type === 'video';
          slide.mediaIsEmbed     = m.type === 'embed';
          slide.mediaUrlPresent  = !!m.url;
          slide.mediaUrlMissing  = !m.url;
          const VALID_ANCHORS = ['top','bottom','left','right','top left','top right','bottom left','bottom right'];
          slide.mediaAnchorStyle = (m.anchor && VALID_ANCHORS.includes(m.anchor)) ? `object-position: ${m.anchor}` : '';
        }
        if (slide.variant === 'feature') {
          const orientation           = slide.orientation === 'below' ? 'below' : 'side';
          slide.featureOrientation    = orientation;
          slide.featureTextClass      = orientation === 'side' ? 'slide-left' : '';
          slide.featureOrientationIsSide  = orientation === 'side';
          slide.featureOrientationIsBelow = orientation === 'below';
        }
      }

      // Enrich bar slide with itemColor
      if (slide.template === "bar") {
        slide.itemColor = `var(--color-${slide.color || "blue"})`;
      }

      if (slide.template === "number") {
        const BAND_SLIDE_DELAY    = 100;   // pause before band slides up
        const BAND_SLIDE_DURATION = 500;   // matches CSS number-band-slide duration
        const INITIAL      = BAND_SLIDE_DELAY + BAND_SLIDE_DURATION + 150; // first step after band settles
        const STEP_DUR     = 400;  // matches CSS number-step-in duration
        const STEP_PAUSE   = 250;  // pause after step settles before its arrow starts
        const ARROW_DUR    = 280;  // matches CSS number-sep-in duration
        const ARROW_PAUSE  = 150;  // pause after arrow before next step starts
        const BEAT         = 150;  // deliberate pause after last step before payoff
        const VALUE_OFFSET = 50;   // value starts this many ms after payoff begins
        const ARROW_OFF    = 750;  // trend arrow starts this many ms after value starts
        const CAPTION_OFF  = 650;  // caption starts this many ms after arrow starts

        const defaultColor = slide.trend === 'up' ? 'emerald' : slide.trend === 'down' ? 'rust' : 'blue';
        slide.bandColor      = `var(--color-${slide.color || defaultColor})`;
        slide.bandSlideDelay = BAND_SLIDE_DELAY;
        slide.trendIcon  = slide.trend === 'up' ? 'arrow-up-right' : slide.trend === 'down' ? 'arrow-down-right' : null;
        slide.trendUp    = slide.trend === 'up';
        slide.trendDown  = slide.trend === 'down';

        let cursor = INITIAL;
        const stepsWithArrows = [];
        if (Array.isArray(slide.steps)) {
          slide.steps.forEach((step, idx) => {
            const isObj = step && typeof step === 'object';
            stepsWithArrows.push({ isStep: true, stepLabel: isObj ? (step.label || null) : null, stepText: isObj ? step.text : step, delay: cursor });
            cursor += STEP_DUR + STEP_PAUSE;
            const isLastStep = idx === slide.steps.length - 1;
            stepsWithArrows.push({ isArrow: true, isFinalArrow: isLastStep, delay: cursor });
            cursor += ARROW_DUR + ARROW_PAUSE;
          });
        }
        slide.stepsWithArrows = stepsWithArrows;
        slide.hasSteps = stepsWithArrows.length > 0;

        const payoffStart   = stepsWithArrows.length > 0 ? cursor + BEAT : INITIAL;
        slide.valueDelay    = payoffStart + VALUE_OFFSET;
        slide.arrowDelay    = payoffStart + VALUE_OFFSET + ARROW_OFF;
        slide.captionDelay  = payoffStart + VALUE_OFFSET + ARROW_OFF + CAPTION_OFF;
      }

      // Enrich cover: flatten client fields and base64-encode logo
      if ((slide.template === 'cover' || slide.template === 'end') && slide.client && typeof slide.client === 'object') {
        slide.clientName  = slide.client.name || '';
        const color       = slide.client.color || '';
        slide.clientColor = isPalette(color) ? `var(--color-${color})` : color;
        slide.clientLogoSrc = '';
        slide.clientLogoSvg = '';
        if (isStr(slide.client.logo)) {
          const raw = slide.client.logo.trimStart();
          if (raw.startsWith('<svg') || raw.startsWith('<SVG')) {
            // Inline SVG: rendered directly, scales perfectly
            slide.clientLogoSvg = raw;
          } else if (raw.startsWith('http://') || raw.startsWith('https://')) {
            slide.clientLogoSrc = raw;
          } else {
            const logoPath = join(DECK_DIR, 'assets', raw);
            if (existsSync(logoPath)) {
              const logoData = readFileSync(logoPath);
              const ext  = raw.split('.').pop().toLowerCase();
              const mime = ext === 'svg' ? 'image/svg+xml'
                         : ext === 'png' ? 'image/png'
                         : (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg'
                         : 'image/png';
              slide.clientLogoSrc = `data:${mime};base64,${logoData.toString('base64')}`;
            }
          }
        }
        slide.clientLogoFallback = !slide.clientLogoSrc && !slide.clientLogoSvg;
      }

      // Enrich team members with photoMissing flag for placeholder rendering
      if (slide.template === 'team' && Array.isArray(slide.members)) {
        slide.members = slide.members.map(m => ({
          ...m,
          photoMissing: !isStr(m.photo),
        }));
      }

      // Enrich showcase: mediaIsEmpty flag for placeholder rendering + trendIcon
      if (slide.template === "showcase") {
        slide.mediaIsEmpty = !Array.isArray(slide.media) || slide.media.length === 0;
        if (slide.metrics) {
          slide.metrics = slide.metrics.map((m) => ({
            ...m,
            trendIcon: m.trend === "up" ? "arrow-up-right" : m.trend === "down" ? "arrow-down-right" : null,
          }));
        }
      }

      // Enrich table columns and cells with highlight colors and header flags
      if (slide.template === "table" && Array.isArray(slide.rows)) {
        const accentColor = a => a ? `var(--color-${a})` : null;
        const colCount = Array.isArray(slide.columns) ? slide.columns.length : (slide.rows[0]?.cells?.length || 1);
        const colWidth = (100 / colCount).toFixed(4);
        slide.twoColumn = colCount === 2;
        if (Array.isArray(slide.columns)) {
          slide.columns = slide.columns.map(col => ({
            ...col,
            width: colWidth,
            highlightColor: accentColor(col.accent),
            hasAccent: !!col.accent,
          }));
        }
        slide.rows = slide.rows.map(row => {
          const rowColor = accentColor(row.accent);
          return {
            ...row,
            cells: (row.cells || []).map((cell, ci) => {
              const colColor = Array.isArray(slide.columns) ? accentColor(slide.columns[ci]?.accent) : null;
              const highlightColor = rowColor || colColor || null;
              return { ...cell, highlight: !!highlightColor, highlightColor, isHeader: slide.headerColumn === true && ci === 0 };
            }),
          };
        });
      }

      // Enrich list items: cumulative delays so each item waits for the previous to finish
      if (slide.template === "list" && slide.items) {
        const INITIAL_DELAY   = 200;  // pause before first item
        const NORMAL_DURATION = 360;  // slide-in duration for a normal item
        const BG_DURATION     = 500;  // bg fill animation duration
        const TEXT_OFFSET     = 380;  // when text fires into the fill (easing looks done ~380ms in)
        const TEXT_DURATION   = 200;  // text fade-in duration
        const INTER_ITEM_GAP  = 200;  // extra pause after each item so users can read before the next appears
        slide.noValues = !slide.items.some(item => item.value);
        let cursor = INITIAL_DELAY;
        slide.items = slide.items.map((item) => {
          const isHighlighted = !!item.color;
          const itemColor     = item.color ? `var(--color-${item.color})` : null;
          const delay         = cursor;
          const bgDelay       = isHighlighted ? cursor + TEXT_OFFSET : null;
          cursor += (isHighlighted ? BG_DURATION + TEXT_DURATION : NORMAL_DURATION) + INTER_ITEM_GAP;
          return { ...item, delay, isHighlighted, itemColor, bgDelay };
        });
      }

      // Add tab index + itemColor to tabs
      if (slide.template === "tabs" && slide.tabs) {
        slide.tabs = slide.tabs.map((p, i) => ({
          ...p,
          sublabel: p.sublabel || `${i + 1}`,
          itemColor: seqColor(i),
        }));
      }

      // Inject total + staggered animation delays into each phase
      if (slide.template === "timeline" && slide.phases) {
        const total =
          slide.total ||
          Math.max(...slide.phases.map((p) => (p.offset || 0) + p.duration));
        const animMs = 500;
        const enriched = [];
        let delay = 0;

        for (let i = 0; i < slide.phases.length; i++) {
          const p = slide.phases[i];
          const next = slide.phases[i + 1];
          enriched.push({ ...p, total, barDelay: Math.round(delay) });

          if (next) {
            const gap = (next.offset || 0) - (p.offset || 0);
            delay +=
              gap > 0 && gap < p.duration
                ? (animMs * gap) / p.duration
                : animMs;
          }
        }
        slide.phases = enriched.map((p, i) => ({ ...p, itemColor: seqColor(i) }));
      }

      const { template, ...data } = slide;
      const templateDir = join(ROOT, "slides", template);
      const templateHTML = readFileSync(
        join(templateDir, `${template}.html`),
        "utf8",
      );

      slidesHTML += render(templateHTML, data).trim() + "\n";
    }

    // Assemble the deck HTML: reference source files directly via relative path
    const base = CLIENT ? "../../" : "../";

    // Per-deck override CSS: appended after the shared sheet so it wins by source order
    const deckOverridePath = join(DECK_DIR, "deck.css");
    const deckOverrideCSS  = existsSync(deckOverridePath)
      ? readFileSync(deckOverridePath, "utf8")
      : null;

    html = html
      .replace('<link rel="stylesheet" href="deck.css" />', `<link rel="stylesheet" href="${base}deck.css" />`)
      .replace(
        '<link rel="stylesheet" href="styles.css" />',
        `<link rel="stylesheet" href="${base}styles.css" />${deckOverrideCSS ? `\n        <style>\n${deckOverrideCSS}\n        </style>` : ""}`,
      )
      .replace("<!-- UI -->", uiHTML)
      .replace("<!-- SLIDES -->", slidesHTML);
    html = html.replace('<script src="deck.js"></script>', `<script src="${base}deck.js"></script>`);

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, "index.html"), html);
    if (warnings.length > 0) {
      console.warn(`\n⚠ ${warnings.length} warning${warnings.length > 1 ? 's' : ''} (deck written):\n`);
      warnings.forEach(x => console.warn(`  ⚠ ${x.message}`));
      console.warn('');
    }
    const outPath = CLIENT ? `decks/${CLIENT}/index.html` : 'dist/index.html';
    console.log(`✓ Built ${deck.slides.length} slides → ${outPath}`);
    if (onBuildComplete) onBuildComplete();
  } catch (err) {
    console.error("Build failed:", err.message);
  }
}

let onBuildComplete = null;

build();

if (WATCH) {
  console.log("Watching for changes…");
  let debounce;
  const trigger = () => {
    clearTimeout(debounce);
    debounce = setTimeout(build, 100);
  };
  ["slides", "components", "ui"].forEach((dir) => {
    watch(join(ROOT, dir), { recursive: true }, trigger);
  });
  ["deck.css", "styles.css", "deck.js", "index.html"].forEach((file) => {
    watch(join(ROOT, file), trigger);
  });
  watch(DECK_DIR, (_, filename) => { if (filename === 'deck.json' || filename === 'deck.css') trigger(); });
  // Dev server with live reload via SSE
  let sseClients = [];
  onBuildComplete = () => sseClients.forEach(res => res.write('data: reload\n\n'));

  const MIME = { html:'text/html', css:'text/css', js:'application/javascript', svg:'image/svg+xml', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', mov:'video/quicktime', mp4:'video/mp4', woff2:'font/woff2' };
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (url === '/__reload') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
      sseClients.push(res);
      req.on('close', () => { sseClients = sseClients.filter(c => c !== res); });
      return;
    }
    const filePath = (url === '/' || url === '/index.html')
      ? join(OUT_DIR, 'index.html')
      : join(ROOT, url.slice(1));
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) { res.writeHead(404); res.end(); return; }
    const ext = filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase();
    if (ext === 'html') {
      const html = readFileSync(filePath, 'utf8')
        .replace('</body>', '<script>new EventSource("/__reload").onmessage=()=>location.reload()</script></body>');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } else {
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(readFileSync(filePath));
    }
  });
  const PORT = 3000;
  server.listen(PORT, () => console.log(`  Dev server → http://localhost:${PORT}\n`));

  watch(join(ROOT, "build.js"), () => {
    console.log("build.js changed, restarting…");
    require("child_process")
      .spawn(process.execPath, process.argv.slice(1), {
        stdio: "inherit",
        detached: true,
      })
      .unref();
    process.exit(0);
  });
}
