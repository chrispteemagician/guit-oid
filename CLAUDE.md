# Guit-Oid — CLAUDE.md
*For Trinity. Read this first.*

---

## What Guit-Oid Is

Free AI-powered identification tool for guitars, amps, pedals, and pickups —
"if it's got strings and a story." Upload a photo — Guit-Oid identifies it,
or roasts it. Ask Fretboard Fred anything about setup, repair, spotting a
fake, or what that attic find is actually worth.

Part of the FeelFamous -Oid Ecosystem.

**Live at:** guit-oid.co.uk | **Netlify:** auto-deploy on push to main

---

## The Character

**Fretboard Fred** — 58-year-old guitar tech, setting up and repairing
guitars since he was 14. Worked backstage at festivals, ran a repair shop in
Camden, now fixes guitars from his garage. '72 Tele Deluxe is the love of his
life. Warm, funny, zero pretension, hates guitar snobbery. Does two things:

1. **Identify mode** — photo in, make/model/era/value out (`analyze-image.js`, `mode: 'identify'`)
2. **Roast My Guitar mode** — same upload flow, honest Camden opinions instead of a verdict (`mode: 'roast'`)
3. **Ask Fred** (`chat-fred.js`) — free-form chat, workshop voice

---

## Stack

- **Static HTML** — single page (`index.html`), no framework, no build step
- **Netlify** — hosting + serverless `/netlify/functions/`
- **Gemini** — `gemini-2.0-flash` (`analyze-image.js`), `gemini-2.5-flash`
  (`chat-fred.js`) — never the Anthropic API in deployed code
- **Patreon** — OAuth badge/tier check only (`patreon-auth.js`), never a
  gate on the identify/chat tools
- Security layer copied from the shared -Oid pattern: `gemini-secure-wrapper.js`,
  `ipi-sanitize.js`, `security-log.js`

---

## File Map

```
/
├── CLAUDE.md
├── LICENSE                          ← AGPL v3
├── index.html                       ← entire app: identify/roast, Learn, Q&A, Ask Fred, Gear, Meet, Village
├── netlify.toml
└── netlify/functions/
    ├── analyze-image.js             ← Gemini vision — identify + roast modes (ungated)
    ├── chat-fred.js                 ← Fretboard Fred chatbot (ungated)
    ├── patreon-auth.js              ← Patreon OAuth token exchange + tier check (badge only)
    ├── gemini-secure-wrapper.js     ← prompt security, EXIF strip, history cap
    ├── ipi-sanitize.js              ← indirect prompt injection detection
    └── security-log.js              ← threat logging
```

---

## Free-to-use philosophy (Chris, 2026-07-13 — read before adding any gate)

The core tool is free for everyone, no sign-in, no lock icon, no "Villager+
only" banner. Don't gate the tool itself behind Patreon.

**What Patreon/paid tiers are for:** genuine extras that cost ongoing hosting/
upkeep and aren't required to use the tool. Frame honestly, never as a
shame-lock ("🔒 ... Unlock →"). No tier-comparison shop windows.

**The ask, when there is one:** one honest, low-key line after the task
completes — free to use, tell a mate if it helped, buy-me-a-coffee if you
want to say thanks (one-off, `buymeacoffee.com/chrispteemagician`), Patreon
if you want to be a regular. Not a gate. Not gamified.

**Repo-specific facts (don't relitigate):**
- Audited 2026-07-29: `analyze-image.js` and `chat-fred.js` have never had a
  hard `isPro`/tier gate — neither function reads `isPro`/`patron_status` at
  all. `patreon-auth.js` only ever returns `{isPro, tier}` to drive a badge
  and the honesty-box hide/show — it does not block `handleUpload()` or the
  Ask Fred chat flow anywhere in `index.html`.
- Found and fixed one piece of misleading copy: the signed-in-but-not-a-patron
  status line read "Signed in — upgrade for Pro" and the patron status line
  read "Pro unlocked" — implying a locked Pro feature that doesn't exist
  anywhere server-side. Reworded to "join the village" / "thanks for being a
  supporter".
- Honesty box (`#honestyBox`/`#honestyAsk` in `#resultView`) already existed
  and already hides its payment-links line for signed-in Patreon supporters
  via `patreonSession.isPro` — left as-is, it already matches the standard
  pattern.
- No false-scarcity banner found (no "first 1,000 only" / "door goes up"
  pattern in this repo).
- Old ecosystem tagline "World Domination Through Kindness. One ember at a
  time." in the footer — this is the exact phrase already softened across
  sibling -oids (see radi-oid/sail-oid session history) — updated to "Just
  trying to be useful. One ember at a time."
- Pricing table already correct: £4.95 Villager / Earned Elder / £14.95
  Founder, matching `patreon-auth.js`'s ≥300¢/≥700¢/≥1500¢ thresholds — no
  fix needed.
- Gemini gotchas already correct: no `thinkingConfig`/`thinkingBudget: 0`
  anywhere; `analyze-image.js` already extracts the real MIME type from the
  data URL (`image.match(/^data:(image\/\w+);base64,/)`) rather than
  hardcoding `image/jpeg`.

Full doctrine: `[[concepts/the-tip-jar-doctrine]]`, mechanical pattern:
`[[tech/free-to-use-degate-skill]]` (DocBrain).

---

## Membership Tiers (Patreon — chrisptee campaign)

| Tier | Price | Pence threshold |
|------|-------|----------------|
| 🏡 Villager | £4.95/mo | ≥300¢ |
| ⭐ Elder | Earned | ≥700¢ |
| 👑 Founder | £14.95/mo | ≥1500¢ |

Checked in `netlify/functions/patreon-auth.js`. All Patreon links go to
`https://www.patreon.com/chrisptee`.

---

## Voice & Tone (read before writing any outward-facing copy)

State the plain fact once, let it carry the weight. No cast villain, no
combat or movement verbs (fight, arm yourself, disrupt), no word bigger than
what's true (domination, extraction, manifesto, revolution). Fretboard Fred's
character voice is a feature, not marketing copy — leave his personality
alone.

Full rationale/history: DocBrain `concepts/ecosystem-voice-and-tone.md`.

---

## Gemini API Rules (Ecosystem-Wide)

1. **Do NOT set `thinkingBudget: 0`** — Gemini 2.5 Flash rejects it with a
   silent 400. Omit `thinkingConfig` entirely.
2. **Do NOT hardcode `mime_type: "image/jpeg"`** — always extract the real
   type from the data URL first. Already correct in `analyze-image.js`.

---

## Deploy

Push to `main` → Netlify auto-deploys. Never drag-to-Netlify. `git pull`
before every push.

---

## Session History

### 2026-07-29 — Claude (de-gate audit)
- Grepped for `isPro`/`patron_status`/shame-lock copy/false-scarcity banners
  across `index.html` and `netlify/` — no hard gate on core tool found.
- Fixed misleading "Pro unlocked"/"upgrade for Pro" status-line copy that
  implied a locked Pro feature which doesn't exist.
- Softened the old "World Domination Through Kindness" footer tagline to
  "Just trying to be useful. One ember at a time." (ecosystem-wide pattern).
- Confirmed honesty box, pricing table, and Gemini MIME-type handling were
  already correct — no changes needed there.
- Wrote this CLAUDE.md (none existed before).
