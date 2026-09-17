import { Locale } from './types';
import enUS from '../locales/en-US.json';
import enGB from '../locales/en-GB.json';
import uk from '../locales/uk.json';

type LocaleData = Record<string, unknown>;

const LOCALES: Record<Locale, LocaleData> = {
  'en-US': enUS,
  'en-GB': enGB,
  uk: uk,
};

let currentLocale: Locale = 'en-US';
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  if (currentLocale !== locale) {
    currentLocale = locale;
    listeners.forEach((fn) => fn());
  }
}

export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function resolveNested(obj: LocaleData, path: string): string | undefined {
  const parts = path.split('.');
  let curr: unknown = obj;
  for (const part of parts) {
    if (!curr || typeof curr !== 'object') return undefined;
    curr = (curr as Record<string, unknown>)[part];
  }
  return typeof curr === 'string' ? curr : undefined;
}

/**
 * ICU Plural rule helper for Ukrainian and English.
 */
function getPluralCategory(count: number, locale: Locale): Intl.LDMLPluralRule {
  const pr = new Intl.PluralRules(locale);
  return pr.select(count);
}

/**
 * Parses simple ICU plural string `{count, plural, one {# clip} other {# clips}}`
 */
function parsePlural(template: string, count: number, locale: Locale): string {
  const pluralRegex = /\{(\w+),\s*plural,\s*((?:(one|few|many|zero|two|other)\s*\{[^{}]*\}\s*)+)\}/g;
  return template.replace(pluralRegex, (_match, _varName, cases) => {
    const category = getPluralCategory(count, locale);
    // Parse cases: e.g. "one {# кліп} few {# кліпи} many {# кліпів} other {# кліпів}"
    const caseMap: Record<string, string> = {};
    const caseRegex = /(one|few|many|zero|two|other)\s*\{([^}]+)\}/g;
    let m;
    while ((m = caseRegex.exec(cases)) !== null) {
      caseMap[m[1]] = m[2];
    }

    let pattern = caseMap[category] ?? caseMap['other'] ?? '';
    pattern = pattern.replace('#', count.toString());
    return pattern;
  });
}

/**
 * Translate a key with optional fallback and parameters.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  // 1. Try active locale
  let raw = resolveNested(LOCALES[currentLocale], key);

  // 2. Fallback to en-US if missing in en-GB or uk
  if (!raw && currentLocale !== 'en-US') {
    raw = resolveNested(LOCALES['en-US'], key);
  }

  if (!raw) {
    return key;
  }

  // Handle pluralization if template contains {count, plural, ...}
  if (params && 'count' in params && typeof params.count === 'number') {
    raw = parsePlural(raw, params.count, currentLocale);
  }

  // Replace normal variable placeholders: {name}
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      raw = raw.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }

  return raw;
}

/**
 * Format milliseconds to strict 00:00:00.000 timecode.
 */
export function formatTimecode(ms: number): string {
  if (isNaN(ms) || ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const milliseconds = Math.floor(ms % 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  const pad2 = (n: number) => n.toString().padStart(2, '0');
  const pad3 = (n: number) => n.toString().padStart(3, '0');

  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}.${pad3(milliseconds)}`;
}

/**
 * Format file size in bytes into human readable MB/GB using Intl.NumberFormat
 */
export function formatFileSize(bytes: number, locale: Locale = currentLocale): string {
  if (bytes < 1024 * 1024) {
    const kb = (bytes / 1024).toFixed(1);
    return `${new Intl.NumberFormat(locale).format(parseFloat(kb))} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    const mb = (bytes / (1024 * 1024)).toFixed(1);
    return `${new Intl.NumberFormat(locale).format(parseFloat(mb))} MB`;
  }
  const gb = (bytes / (1024 * 1024 * 1024)).toFixed(2);
  return `${new Intl.NumberFormat(locale).format(parseFloat(gb))} GB`;
}

/**
 * Format date using Intl.DateTimeFormat
 */
export function formatDate(isoDate: string, locale: Locale = currentLocale): string {
  const date = new Date(isoDate);
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}
