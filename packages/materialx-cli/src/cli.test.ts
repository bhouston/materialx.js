import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { commandLine, extendMatchers } from 'vitest-command-line';

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const cliDir = path.resolve(sourceDir, '..');
const repoRoot = path.resolve(cliDir, '../..');
const materialXRoot = path.resolve(repoRoot, '../MaterialX');
const fixturePath = path.join(
  materialXRoot,
  'resources/Materials/Examples/OpenPbr/open_pbr_default.mtlx',
);

extendMatchers();

describe('materialx-cli', () => {
  beforeAll(() => {
    execSync('pnpm --filter @materialx-js/materialx build && pnpm --filter @materialx-js/materialx-cli build', {
      cwd: repoRoot,
      stdio: 'inherit',
    });
  });

  const cli = commandLine({
    command: ['node', 'bin/cli.js'],
    name: 'materialx-cli',
    cwd: cliDir,
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  it('prints version with --version', async () => {
    const result = await cli.run(['--version'], { timeout: 8_000 });
    expect(result).toSucceed();
    expect(result).toHaveStdout(/^\d+\.\d+\.\d+/);
  });

  it('shows available commands in --help', async () => {
    const result = await cli.run(['--help'], { timeout: 8_000 });
    expect(result).toSucceed();
    expect(result).toHaveStdout(/read/);
    expect(result).toHaveStdout(/write/);
    expect(result).toHaveStdout(/validate/);
  });

  it('reads a fixture and prints document summary', async () => {
    const result = await cli.run(['read', fixturePath], { timeout: 8_000 });
    expect(result).toSucceed();
    expect(result).toHaveStdout(/topLevelNodes/);
    expect(result).toHaveStdout(/nodeGraphs/);
  });

  it('writes a normalized output file', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'materialx-cli-'));
    const outputPath = path.join(tempDir, 'out.mtlx');
    try {
      const result = await cli.run(['write', fixturePath, outputPath], { timeout: 8_000 });
      expect(result).toSucceed();
      expect(readFileSync(outputPath, 'utf8')).toMatch(/<materialx/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('lists known categories', async () => {
    const result = await cli.run(['nodes', 'list'], { timeout: 8_000 });
    expect(result).toSucceed();
    expect(result).toHaveStdout(/open_pbr_surface/);
    expect(result).toHaveStdout(/surfacematerial/);
  });

  it('validate command succeeds on known fixture', async () => {
    const result = await cli.run(['validate', fixturePath], { timeout: 8_000 });
    expect(result).toSucceed();
    expect(result).toHaveStdout(/Validation passed|WARNING/);
  });

  it('validate command fails on malformed XML', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'materialx-cli-invalid-'));
    const invalidPath = path.join(tempDir, 'invalid.mtlx');
    try {
      writeFileSync(invalidPath, '<materialx><nodegraph></materialx>', 'utf8');
      const result = await cli.run(['validate', invalidPath], { timeout: 8_000 });
      expect(result).toFail();
      expect(result).toHaveStderr(/Invalid MaterialX XML/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
