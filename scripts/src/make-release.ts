#!/usr/bin/env node

import { execSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type DependencyField =
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies';

type PackageJson = {
  name?: string;
  version?: string;
  bin?: string | Record<string, string>;
  files?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_PATH = resolve(__dirname, '../..');

function main(): void {
  const { packagePath, dryRun } = parseArgs(process.argv.slice(2));
  const resolvedPackagePath = resolve(packagePath);
  const publishPath = join(resolvedPackagePath, 'publish');

  assertPathExists(resolvedPackagePath, `Package directory does not exist: ${resolvedPackagePath}`);
  const packageJsonPath = join(resolvedPackagePath, 'package.json');
  assertPathExists(packageJsonPath, `package.json not found in: ${resolvedPackagePath}`);

  const rootLicensePath = join(ROOT_PATH, 'LICENSE');
  assertPathExists(rootLicensePath, `LICENSE not found at ${rootLicensePath}`);

  console.log(`Cleaning publish dir for ${resolvedPackagePath}`);
  if (existsSync(publishPath)) {
    rmSync(publishPath, { recursive: true, force: true });
  }
  mkdirSync(publishPath, { recursive: true });

  console.log('Building package');
  execSync('pnpm -s build', { cwd: resolvedPackagePath, stdio: 'inherit' });

  console.log('Copying dist directory');
  const distPath = join(resolvedPackagePath, 'dist');
  assertPathExists(distPath, `dist directory not found at ${distPath}`);
  cpSync(distPath, join(publishPath, 'dist'), { recursive: true });

  console.log('Copying package.json (processing for publish)');
  const packageJson = readJson<PackageJson>(packageJsonPath);
  const { files: _files, ...packageJsonWithoutFiles } = packageJson;
  rewriteWorkspaceDependencies(packageJsonWithoutFiles, ROOT_PATH);
  writeFileSync(join(publishPath, 'package.json'), `${JSON.stringify(packageJsonWithoutFiles, null, 2)}\n`);

  copyBinIfPresent(packageJson, resolvedPackagePath, publishPath);

  console.log('Copying .npmignore');
  const npmignorePath = join(resolvedPackagePath, '.npmignore');
  if (existsSync(npmignorePath)) {
    cpSync(npmignorePath, join(publishPath, '.npmignore'));
  }

  console.log('Copying LICENSE');
  cpSync(rootLicensePath, join(publishPath, 'LICENSE'));

  console.log('Copying README');
  const packageReadmePath = join(resolvedPackagePath, 'README.md');
  const rootReadmePath = join(ROOT_PATH, 'README.md');
  if (existsSync(packageReadmePath)) {
    cpSync(packageReadmePath, join(publishPath, 'README.md'));
  } else if (existsSync(rootReadmePath)) {
    cpSync(rootReadmePath, join(publishPath, 'README.md'));
  } else {
    throw new Error('No README.md found for package');
  }

  if (dryRun) {
    console.log('Dry run enabled: skipping npm publish');
    return;
  }

  console.log('Publishing package');
  execSync('npm publish ./publish --access public', {
    cwd: resolvedPackagePath,
    stdio: 'inherit',
  });
  console.log('Release completed successfully');
}

function parseArgs(args: string[]): { packagePath: string; dryRun: boolean } {
  if (args.length === 0) {
    throw new Error(
      'Package path is required. Usage: node scripts/src/make-release.ts <package-path> [--dry-run]',
    );
  }

  const dryRun = args.includes('--dry-run');
  const packagePath = args.find((arg) => !arg.startsWith('--'));

  if (!packagePath) {
    throw new Error('Package path is required.');
  }

  return { packagePath, dryRun };
}

function copyBinIfPresent(packageJson: PackageJson, resolvedPackagePath: string, publishPath: string): void {
  if (!packageJson.bin) {
    return;
  }

  const binPaths = typeof packageJson.bin === 'string' ? [packageJson.bin] : Object.values(packageJson.bin);
  for (const binPath of binPaths) {
    const srcPath = join(resolvedPackagePath, binPath);
    assertPathExists(srcPath, `bin file not found at ${srcPath}`);
    const destPath = join(publishPath, binPath);
    const destDir = dirname(destPath);
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }
    cpSync(srcPath, destPath);
  }
}

function rewriteWorkspaceDependencies(packageJson: PackageJson, rootPath: string): void {
  const workspaceVersions = getWorkspaceVersions(rootPath);
  const dependencyFields: DependencyField[] = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ];

  for (const field of dependencyFields) {
    const dependencies = packageJson[field];
    if (!dependencies) {
      continue;
    }

    for (const [depName, depVersion] of Object.entries(dependencies)) {
      if (!depVersion.startsWith('workspace:')) {
        continue;
      }

      const resolvedVersion = workspaceVersions[depName];
      if (!resolvedVersion) {
        throw new Error(`Could not resolve workspace version for ${depName}`);
      }

      const convertedVersion = convertWorkspaceRange(depVersion, resolvedVersion);
      console.log(`  Converting ${depName}: ${depVersion} -> ${convertedVersion}`);
      dependencies[depName] = convertedVersion;
    }
  }
}

function getWorkspaceVersions(rootPath: string): Record<string, string> {
  const packagesDir = join(rootPath, 'packages');
  assertPathExists(packagesDir, `Packages directory not found: ${packagesDir}`);
  if (!statSync(packagesDir).isDirectory()) {
    throw new Error(`Packages path is not a directory: ${packagesDir}`);
  }

  const versions: Record<string, string> = {};
  for (const entry of readdirSync(packagesDir)) {
    const packageJsonPath = join(packagesDir, entry, 'package.json');
    if (!existsSync(packageJsonPath)) {
      continue;
    }
    const workspacePackageJson = readJson<PackageJson>(packageJsonPath);
    if (!workspacePackageJson.name || !workspacePackageJson.version) {
      continue;
    }
    versions[workspacePackageJson.name] = workspacePackageJson.version;
  }

  return versions;
}

function convertWorkspaceRange(specifier: string, resolvedVersion: string): string {
  if (specifier === 'workspace:*') {
    return resolvedVersion;
  }
  if (specifier === 'workspace:^') {
    return `^${resolvedVersion}`;
  }
  if (specifier === 'workspace:~') {
    return `~${resolvedVersion}`;
  }
  if (specifier.startsWith('workspace:')) {
    const value = specifier.slice('workspace:'.length);
    if (value.startsWith('^') || value.startsWith('~')) {
      return `${value[0]}${resolvedVersion}`;
    }
    if (value === '*') {
      return resolvedVersion;
    }
    return value || resolvedVersion;
  }
  return specifier;
}

function assertPathExists(path: string, errorMessage: string): void {
  if (!existsSync(path)) {
    throw new Error(errorMessage);
  }
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

try {
  main();
} catch (error) {
  console.error(`Release failed: ${error}`);
  process.exit(1);
}
