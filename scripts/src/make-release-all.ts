#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootPath = resolve(__dirname, '../..');
const makeReleasePath = join(rootPath, 'scripts/src/make-release.ts');

const releaseOrder = [
  'packages/materialx',
  'packages/materialx-cli',
  'packages/materialx-three',
];

function main(): void {
  const dryRun = process.argv.includes('--dry-run');

  for (const packagePath of releaseOrder) {
    const args = ['node', makeReleasePath, packagePath];
    if (dryRun) {
      args.push('--dry-run');
    }

    console.log(`Running make-release for ${packagePath}`);
    execSync(args.join(' '), {
      cwd: rootPath,
      stdio: 'inherit',
    });
  }
}

try {
  main();
} catch (error) {
  console.error(`Release-all failed: ${error}`);
  process.exit(1);
}
