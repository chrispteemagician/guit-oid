'use strict';

/**
 * security-log.js — Centralised threat logging
 * FeelFamous Ecosystem — Node + browser
 *
 * Server: logs via console.error (Netlify captures as error events)
 * Browser: stores last 10 events in sessionStorage['ff_security_log']
 * Never sends data anywhere external.
 */

const SESSION_KEY = 'ff_security_log';
const MAX_SESSION_ENTRIES = 10;

/**
 * Log a threat event.
 * @param {string}   appName   — e.g. 'cannabin-oid', 'sail-oid'
 * @param {string}   fieldName — which input field triggered it
 * @param {string[]} threats   — array of threat names from sanitize()
 */
function logThreat(appName, fieldName, threats) {
  const entry = {
    ts: new Date().toISOString(),
    app: appName,
    field: fieldName,
    threats,
  };

  // Server-side (Netlify functions)
  if (typeof process !== 'undefined' && process.env) {
    console.error(JSON.stringify({ ff_security_threat: true, ...entry }));
    return;
  }

  // Browser-side
  if (typeof sessionStorage !== 'undefined') {
    let log = [];
    try {
      log = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]');
    } catch (_) {
      log = [];
    }
    log.push(entry);
    if (log.length > MAX_SESSION_ENTRIES) log = log.slice(-MAX_SESSION_ENTRIES);
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(log));
    } catch (_) { /* storage full — drop silently */ }
  }
}

/**
 * Retrieve all threat events stored in this browser session.
 * Returns [] on server or if nothing stored.
 */
function getSessionThreats() {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]');
  } catch (_) {
    return [];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { logThreat, getSessionThreats };
} else if (typeof window !== 'undefined') {
  window.FFSecurityLog = { logThreat, getSessionThreats };
}
