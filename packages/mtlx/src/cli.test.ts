import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { commandLine, extendMatchers } from 'vitest-command-line';

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const cliDir = path.resolve(sourceDir, '..');
const repoRoot = path.resolve(cliDir, '../..');

extendMatchers();

const packFixtureXml = `<?xml version="1.0"?>
<materialx version="1.39">
  <nodegraph name="NG_test">
    <image name="albedo" type="color3">
      <input name="file" type="filename" value="textures/albedo.png" />
    </image>
  </nodegraph>
</materialx>`;

const makePackFixture = async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'mtlx-cli-pack-'));
  await mkdir(path.join(tempDir, 'textures'), { recursive: true });
  const materialPath = path.join(tempDir, 'material.mtlx');
  const texturePath = path.join(tempDir, 'textures/albedo.png');
  writeFileSync(materialPath, packFixtureXml, 'utf8');
  writeFileSync(texturePath, new Uint8Array([137, 80, 78, 71]));
  return { tempDir, materialPath, archivePath: path.join(tempDir, 'material.mtlz') };
};

describe('mtlx', () => {
  beforeAll(() => {
    execSync('pnpm --filter @material-viewer/mtlx-core build && pnpm --filter @material-viewer/mtlx build', {
      cwd: repoRoot,
      stdio: 'inherit',
    });
  });

  const cli = commandLine({
    command: ['node', 'bin/cli.js'],
    name: 'mtlx',
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
    expect(result).toHaveStdout(/info/);
    expect(result).toHaveStdout(/check/);
    expect(result).toHaveStdout(/pack/);
    expect(result).toHaveStdout(/unpack/);
    expect(result).not.toHaveStdout(/nodes/);
    expect(result).not.toHaveStdout(/validate/);
    expect(result).not.toHaveStdout(/write/);
  });

  it('prints material info for a fixture', async () => {
    const fixture = await makePackFixture();
    try {
      const result = await cli.run(['info', fixture.materialPath], { timeout: 8_000 });
      expect(result).toSucceed();
      expect(result).toHaveStdout(/topLevelNodes/);
      expect(result).toHaveStdout(/nodeGraphs/);
    } finally {
      await rm(fixture.tempDir, { recursive: true, force: true });
    }
  });

  it('check command succeeds on known fixture', async () => {
    const fixture = await makePackFixture();
    try {
      const result = await cli.run(['check', fixture.materialPath], { timeout: 8_000 });
      expect(result).toSucceed();
      expect(result).toHaveStdout(/Check passed|WARNING/);
    } finally {
      await rm(fixture.tempDir, { recursive: true, force: true });
    }
  });

  it('check command fails on malformed XML', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'mtlx-cli-invalid-'));
    const invalidPath = path.join(tempDir, 'invalid.mtlx');
    try {
      writeFileSync(invalidPath, '<materialx><nodegraph></materialx>', 'utf8');
      const result = await cli.run(['check', invalidPath], { timeout: 8_000 });
      expect(result).toFail();
      expect(result).toHaveStderr(/Invalid MaterialX XML/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('packs, checks, and unpacks a .mtlz archive', async () => {
    const fixture = await makePackFixture();
    const outputDir = path.join(fixture.tempDir, 'out');
    try {
      const packResult = await cli.run(['pack', fixture.materialPath, '--output', fixture.archivePath], {
        timeout: 8_000,
      });
      expect(packResult).toSucceed();
      expect(packResult).toHaveStdout(/Packed/);
      expect(existsSync(fixture.archivePath)).toBe(true);

      const checkResult = await cli.run(['check', fixture.archivePath], { timeout: 8_000 });
      expect(checkResult).toSucceed();
      expect(checkResult).toHaveStdout(/Check passed|WARNING/);

      const unpackResult = await cli.run(['unpack', fixture.archivePath, '--output-dir', outputDir], {
        timeout: 8_000,
      });
      expect(unpackResult).toSucceed();
      expect(unpackResult).toHaveStdout(/Unpacked/);
      expect(existsSync(path.join(outputDir, 'material.mtlx'))).toBe(true);
      expect(existsSync(path.join(outputDir, 'textures/albedo.png'))).toBe(true);
    } finally {
      await rm(fixture.tempDir, { recursive: true, force: true });
    }
  });
});
