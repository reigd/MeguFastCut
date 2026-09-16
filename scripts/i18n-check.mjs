import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localesDir = path.resolve(__dirname, '../src/locales');

function loadJson(file) {
  const filePath = path.join(localesDir, file);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function flatten(obj, prefix = '') {
  const res = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(res, flatten(v, key));
    } else {
      res[key] = v;
    }
  }
  return res;
}

const enUS = flatten(loadJson('en-US.json'));
const enGB = flatten(loadJson('en-GB.json'));
const uk = flatten(loadJson('uk.json'));

let errors = [];

// 1. Check Ukrainian keys
for (const key of Object.keys(enUS)) {
  if (!(key in uk)) {
    errors.push(`[uk.json] Missing key: "${key}"`);
  }
}

for (const key of Object.keys(uk)) {
  if (!(key in enUS)) {
    errors.push(`[uk.json] Extraneous key not in en-US: "${key}"`);
  }
}

// 2. Check British English differences
for (const [key, value] of Object.entries(enGB)) {
  if (!(key in enUS)) {
    errors.push(`[en-GB.json] Unknown key not in en-US: "${key}"`);
    continue;
  }
  if (value === enUS[key]) {
    errors.push(`[en-GB.json] Duplicate value identical to en-US for key "${key}": "${value}"`);
  }
}

if (errors.length > 0) {
  console.error('\x1b[31m[i18n-check] FAILED with the following errors:\x1b[0m');
  for (const err of errors) {
    console.error(`  ❌ ${err}`);
  }
  process.exit(1);
} else {
  console.log('\x1b[32m[i18n-check] PASSED: All locales verified successfully.\x1b[0m');
  console.log(`  - en-US (base): ${Object.keys(enUS).length} keys`);
  console.log(`  - uk (complete translation): ${Object.keys(uk).length} keys`);
  console.log(`  - en-GB (distinct overrides only): ${Object.keys(enGB).length} keys`);
}
