'use strict';

/**
 * ipi-sanitize.js — Indirect Prompt Injection sanitiser
 * FeelFamous Ecosystem — universal (Node 18+ and browser)
 *
 * Usage: const { sanitize } = require('./ipi-sanitize');
 *        const { clean, threats, highRisk } = sanitize(userInput, 'fieldName');
 *
 * If highRisk is true, clean is '' — do NOT send to Gemini.
 */

// ─── Zero-width / invisible character strip ────────────────────────────────
const ZWC_RE = /[​‌‍﻿­]/g;

// ─── L33t + homoglyph normalisation (1-to-1, position-preserving) ──────────
// Applied to a copy for phrase detection; positions map exactly to original.
function _normalise(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    const cp = str.codePointAt(i);
    const ch = str[i].toLowerCase();
    switch (ch) {
      case '@': case '4': out.push('a'); break;
      case '3':           out.push('e'); break;
      case '1': case '!': out.push('i'); break;
      case '0':           out.push('o'); break;
      case '$': case '5': out.push('s'); break;
      case '7':           out.push('t'); break;
      case '+':           out.push('t'); break;
      case '8':           out.push('b'); break;
      case '6':           out.push('g'); break;
      default:
        // Cyrillic homoglyphs
        if (cp === 0x0430) { out.push('a'); break; }
        if (cp === 0x0435) { out.push('e'); break; }
        if (cp === 0x0456) { out.push('i'); break; }
        if (cp === 0x043E) { out.push('o'); break; }
        if (cp === 0x0440) { out.push('r'); break; }
        if (cp === 0x0441) { out.push('c'); break; }
        if (cp === 0x0445) { out.push('x'); break; }
        // Greek homoglyphs
        if (cp === 0x03B1) { out.push('a'); break; }
        if (cp === 0x03B5) { out.push('e'); break; }
        if (cp === 0x03BF) { out.push('o'); break; }
        out.push(ch);
    }
  }
  return out.join('');
}

// ─── Homoglyph density check ────────────────────────────────────────────────
const HOMO_RE = /[Ѐ-ӿͰ-Ͽ]/g;
function _homoglyphDense(text) {
  if (text.length < 20) return false;
  const hits = (text.match(HOMO_RE) || []).length;
  return hits > 10 && hits / text.length > 0.05;
}

// ─── IPI phrase rules — matched against normalised copy ─────────────────────
// Phrases are normalised too (lowercase, no l33t). Word-boundary via \b or
// short bounded whitespace gaps in the compiled regex.
const PHRASE_RULES = [
  {
    name: 'ignore_previous_instructions',
    re:   /ignore[\W]{0,4}previous[\W]{0,4}instructions/i
  },
  {
    name: 'ignore_all_instructions',
    re:   /ignore[\W]{0,4}all[\W]{0,4}instructions/i
  },
  {
    name: 'disregard_the_above',
    re:   /disregard[\W]{0,4}the[\W]{0,4}above/i
  },
  {
    name: 'forget_your_instructions',
    re:   /forget[\W]{0,4}your[\W]{0,4}instructions/i
  },
  {
    name: 'new_instructions',
    re:   /new[\W]{0,4}instructions[\W]{0,4}:/i
  },
  {
    name: 'system_prompt',
    re:   /system[\W]{0,4}prompt[\W]{0,4}:/i
  },
  {
    name: 'you_are_now',
    re:   /\byou[\W]{0,4}are[\W]{0,4}now\b/i
  },
  {
    name: 'act_as',
    re:   /\bact[\W]{0,3}as\b/i
  },
  {
    name: 'pretend_you_are',
    re:   /pretend[\W]{0,4}you[\W]{0,4}are/i
  },
  {
    name: 'jailbreak',
    re:   /\bjailbreak\b/i
  },
  {
    name: 'ultrathink',
    re:   /\bultrathink\b/i
  },
  {
    name: 'if_you_are_llm',
    re:   /if[\W]{0,4}you[\W]{0,4}are[\W]{0,4}an[\W]{0,4}llm/i
  },
  {
    name: 'if_you_are_ai',
    re:   /if[\W]{0,4}you[\W]{0,4}are[\W]{0,4}an[\W]{0,4}ai/i
  },
  {
    name: 'do_anything_now',
    re:   /do[\W]{0,4}anything[\W]{0,4}now/i
  },
  {
    // DAN as standalone: not followed by common name suffixes
    name: 'DAN_prompt',
    re:   /\bDAN\b(?!\s*(?:ielle?|ny|cing|ce|ger|ish|ube))/
  },
];

// ─── Regex rules applied directly to clean (original) text ─────────────────
// All patterns use bounded quantifiers to prevent catastrophic backtracking.
const REGEX_RULES = [
  // HTML attack vectors
  { name: 'script_tag',        re: /<script[^>]{0,300}>/gi },
  { name: 'meta_tag',          re: /<meta[^>]{0,300}>/gi },
  { name: 'style_tag',         re: /<style[^>]{0,300}>/gi },
  { name: 'iframe_tag',        re: /<iframe[^>]{0,300}>/gi },
  { name: 'html_comment',      re: /<!--[\s\S]{0,500}?-->/g },
  { name: 'generic_html_tag',  re: /<[a-zA-Z][a-zA-Z0-9]{0,20}[^>]{0,200}>/g },
  // CSS steganography
  { name: 'display_none',      re: /display\s{0,5}:\s{0,5}none/gi },
  { name: 'visibility_hidden', re: /visibility\s{0,5}:\s{0,5}hidden/gi },
  { name: 'opacity_zero',      re: /opacity\s{0,5}:\s{0,5}0(?:\.\d{1,3})?(?!\d)/gi },
  { name: 'font_size_zero',    re: /font-size\s{0,5}:\s{0,5}0(?:px|em|rem|pt)?/gi },
  { name: 'color_transparent', re: /color\s{0,5}:\s{0,5}transparent/gi },
  // Structural injection
  { name: 'json_role_block',   re: /\{"role"\s{0,5}:\s{0,5}"(?:system|user|assistant)"/gi },
  { name: 'base64_blob',       re: /(?:^|[\s,;])([A-Za-z0-9+/]{50,}={0,2})(?=[\s,;]|$)/gm },
  // Fake structural headers (can be used to inject new sections into a prompt)
  { name: 'markdown_h3_plus',  re: /^#{3,}[ \t].{0,200}/mg },
  { name: 'triple_dash',       re: /^-{3,}$/mg },
  { name: 'triple_equals',     re: /^={3,}$/mg },
  // Financial fraud
  { name: 'send_money_to',     re: /send\s{0,5}(?:\w{0,10}\s{0,5})?money\s{0,5}to/gi },
  { name: 'paypal_me',         re: /paypal\.me\//gi },
  { name: 'donation_inject',   re: /(?:click|tap|go)\s{0,10}(?:here\s{0,10})?to\s{0,10}donate/gi },
  { name: 'initiate_payment',  re: /initiate\s{0,5}(?:a\s{0,5})?(?:transaction|payment)/gi },
  { name: 'stripe_pay_link',   re: /stripe\.com\/pay/gi },
];

// URLs — logged and stripped but not counted as threats
const URL_RE = /https?:\/\/[^\s"'<>]{10,}/gi;

// ─── Core replacement helper ─────────────────────────────────────────────────
// Applies all matches of re to text, replacing with sub. Handles global regex
// state correctly.
function _applyRe(text, re, sub) {
  re.lastIndex = 0;
  const result = text.replace(re, sub);
  re.lastIndex = 0;
  return result;
}

// ─── Public sanitize function ────────────────────────────────────────────────
/**
 * @param {any}    input     — raw user input (string coerced if needed)
 * @param {string} fieldName — label for logging ("userDescription", "question", etc.)
 * @returns {{ clean: string, threats: string[], highRisk: boolean }}
 */
function sanitize(input, fieldName) {
  if (input == null) return { clean: '', threats: [], highRisk: false };
  if (typeof input !== 'string') input = String(input);
  // Reject absurdly long input without processing (DoS guard)
  if (input.length > 200000) {
    _logThreat(new Date().toISOString(), 'input_too_long', fieldName, `len=${input.length}`);
    return { clean: '', threats: ['input_too_long'], highRisk: true };
  }

  const ts = new Date().toISOString();
  const threats = [];

  // 1. Strip zero-width / invisible chars
  let clean = input.replace(ZWC_RE, '');

  // 2. Homoglyph density
  if (_homoglyphDense(clean)) {
    threats.push('homoglyph_density');
    _logThreat(ts, 'homoglyph_density', fieldName, clean.slice(0, 50));
  }

  // 3. Phrase rules — run against normalised copy (1:1 length → same indices)
  const norm = _normalise(clean);
  for (const rule of PHRASE_RULES) {
    rule.re.lastIndex = 0;
    const m = rule.re.exec(norm);
    if (m) {
      rule.re.lastIndex = 0;
      if (!threats.includes(rule.name)) {
        threats.push(rule.name);
        _logThreat(ts, rule.name, fieldName, clean.slice(m.index, m.index + 50));
      }
      // Replace the matched range in clean using same indices (1:1 normalisation)
      clean =
        clean.slice(0, m.index) + '[removed]' + clean.slice(m.index + m[0].length);
      // Re-normalise the updated clean for subsequent phrase checks
      // (Avoid re-normalising the whole string — just patch the norm string too)
    }
    rule.re.lastIndex = 0;
  }

  // 4. Regex rules on clean text
  for (const rule of REGEX_RULES) {
    rule.re.lastIndex = 0;
    if (rule.re.test(clean)) {
      rule.re.lastIndex = 0;
      const firstMatch = clean.match(rule.re);
      if (!threats.includes(rule.name)) {
        threats.push(rule.name);
        _logThreat(ts, rule.name, fieldName, (firstMatch ? firstMatch[0] : '').slice(0, 50));
      }
      rule.re.lastIndex = 0;
      clean = _applyRe(clean, rule.re, '[removed]');
    }
    rule.re.lastIndex = 0;
  }

  // 5. URL strip (log only — not a threat count)
  URL_RE.lastIndex = 0;
  if (URL_RE.test(clean)) {
    URL_RE.lastIndex = 0;
    const urlMatches = clean.match(URL_RE) || [];
    const urlSample = urlMatches[0] ? urlMatches[0].slice(0, 50) : '';
    _logThreat(ts, 'url_stripped', fieldName, urlSample + (urlMatches.length > 1 ? ` (+${urlMatches.length - 1})` : ''));
    clean = _applyRe(clean, URL_RE, '[url-removed]');
  }

  // 6. High-risk threshold
  const highRisk = threats.length > 3;
  if (highRisk) {
    _logThreat(ts, 'HIGH_RISK_BLOCKED', fieldName, threats.join(', '));
    return { clean: '', threats, highRisk: true };
  }

  return { clean, threats, highRisk: false };
}

// ─── Internal logger (structured JSON → stderr so Netlify captures it) ───────
function _logThreat(ts, rule, field, matched) {
  const entry = JSON.stringify({
    ff_security: true,
    ts,
    rule,
    field,
    match: String(matched).slice(0, 50),
  });
  if (typeof console !== 'undefined') {
    // console.error so Netlify function logs capture it as an error event
    console.error(entry);
  }
}

// ─── Universal export ────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sanitize };
} else if (typeof window !== 'undefined') {
  window.IPISanitize = { sanitize };
}
