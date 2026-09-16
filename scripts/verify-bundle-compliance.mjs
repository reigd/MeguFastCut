import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const binariesDir = path.resolve(rootDir, 'src-tauri/binaries');

const EXPECTED_BINARIES = [
  'ffmpeg-x86_64-pc-windows-msvc.exe',
  'ffprobe-x86_64-pc-windows-msvc.exe',
];

const REQUIRED_DOCS = [
  path.join(rootDir, 'COPYING.GPLv3'),
  path.join(rootDir, 'ffmpeg-build.txt'),
  path.join(binariesDir, 'COPYING.GPLv3'),
  path.join(binariesDir, 'ffmpeg-build.txt'),
];

let errors = [];

// 1. Verify required documentation files exist and are not empty
for (const doc of REQUIRED_DOCS) {
  if (!fs.existsSync(doc)) {
    errors.push(`Missing compliance file: ${path.relative(rootDir, doc)}`);
  } else {
    const stat = fs.statSync(doc);
    if (stat.size < 100) {
      errors.push(`Compliance file appears corrupted or empty: ${path.relative(rootDir, doc)} (${stat.size} bytes)`);
    }
  }
}

// 2. Verify binaries exist and are valid executables (> 1 MB)
for (const binName of EXPECTED_BINARIES) {
  const binPath = path.join(binariesDir, binName);
  if (!fs.existsSync(binPath)) {
    errors.push(`Missing sidecar binary: ${binName}`);
  } else {
    const size = fs.statSync(binPath).size;
    if (size < 1024 * 1024) {
      errors.push(`Sidecar binary ${binName} is too small (${size} bytes)`);
    } else {
      const hash = crypto.createHash('sha256').update(fs.readFileSync(binPath)).digest('hex').toUpperCase();
      console.log(`[compliance] Verified ${binName}: ${(size / (1024 * 1024)).toFixed(1)} MB (SHA-256: ${hash.substring(0, 16)}...)`);
    }
  }
}

// 3. Verify README contains Licensing section
const readmePath = path.join(rootDir, 'README.md');
if (fs.existsSync(readmePath)) {
  const readme = fs.readFileSync(readmePath, 'utf8');
  if (!readme.includes('## Licensing') || !readme.includes('GPL') || !readme.includes('aggregation')) {
    errors.push('README.md is missing compliant Licensing section explaining MIT + GPL aggregation');
  }
} else {
  errors.push('README.md not found');
}

if (errors.length > 0) {
  console.error('\x1b[31m[compliance-check] FAILED:\x1b[0m');
  for (const err of errors) {
    console.error(`  ❌ ${err}`);
  }
  process.exit(1);
} else {
  console.log('\x1b[32m[compliance-check] PASSED: All sidecar binaries and GPL compliance obligations verified.\x1b[0m');
}
