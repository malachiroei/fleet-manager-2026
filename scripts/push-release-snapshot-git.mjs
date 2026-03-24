#!/usr/bin/env node
/**
 * שימוש: node scripts/push-release-snapshot-git.mjs <path-to-downloaded-release_snapshot.json>
 * מעתיק ל-src/config/release_snapshot.json, git add/commit/push.
 */
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const target = join(root, 'src', 'config', 'release_snapshot.json');
const input = process.argv[2];

if (!input || !existsSync(input)) {
  console.error('Usage: node scripts/push-release-snapshot-git.mjs <path-to-release_snapshot.json>');
  process.exit(1);
}

const raw = readFileSync(input, 'utf8');
JSON.parse(raw); // validate
writeFileSync(target, raw, 'utf8');

const ver = JSON.parse(raw).version ?? 'snapshot';
execSync('git add src/config/release_snapshot.json', { cwd: root, stdio: 'inherit' });
execSync(`git commit -m "chore(release): release_snapshot ${ver}"`, { cwd: root, stdio: 'inherit' });
execSync('git push', { cwd: root, stdio: 'inherit' });
console.log('Pushed release_snapshot', ver);
