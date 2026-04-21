import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { getMaterialXSamplePacksCached } from '../lib/materialx-samples.server';

const DEFAULT_VISUAL_PORT = Number.parseInt(process.env.VIEWER_VISUAL_PORT ?? '4173', 10);
const VISUAL_HOST = process.env.VIEWER_VISUAL_HOST ?? '127.0.0.1';
const WORKSPACE_ROOT = path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const EXAMPLES_ROOT = path.resolve(WORKSPACE_ROOT, 'apps/viewer/public/examples');

const sleep = async (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const findAvailablePort = async (preferredPort: number): Promise<number> => {
  const tryPort = async (port: number): Promise<number | undefined> =>
    new Promise((resolve) => {
      const server = createServer();
      server.once('error', () => resolve(undefined));
      server.listen(port, VISUAL_HOST, () => {
        const assigned = (server.address() as { port: number }).port;
        server.close(() => resolve(assigned));
      });
    });

  const preferred = await tryPort(preferredPort);
  if (preferred !== undefined) {
    return preferred;
  }
  const ephemeral = await tryPort(0);
  if (ephemeral !== undefined) {
    return ephemeral;
  }
  throw new Error('Could not find an available preview port');
};

const runPnpm = async (args: string[], cwd: string): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('pnpm', args, {
      cwd,
      env: process.env,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command "pnpm ${args.join(' ')}" failed with exit code ${code ?? -1}`));
    });
  });
};

export interface ViewerSampleEntry {
  id: string;
  label: string;
  directory: string;
}

export interface ViewerHealthReport {
  compileErrorMessage?: string;
  warningCount: number;
  unsupportedCategoryCount: number;
  unsupportedWarningCount: number;
  backgroundErrorMessage?: string;
  previewGeometryErrorMessage?: string;
  consoleErrors: string[];
  uncaughtErrors: string[];
  failedRequests: string[];
}

export interface ViewerServerHandle {
  stop: () => Promise<void>;
  url: string;
}

export const ensureViewerBuild = async (): Promise<void> => {
  await runPnpm(['--filter', 'viewer', 'build'], WORKSPACE_ROOT);
};

export const startViewerPreviewServer = async (): Promise<ViewerServerHandle> => {
  const visualPort = await findAvailablePort(DEFAULT_VISUAL_PORT);
  const preview = spawn(
    'pnpm',
    ['--filter', 'viewer', 'exec', 'vite', 'dev', '--host', VISUAL_HOST, '--port', String(visualPort), '--strictPort'],
    {
      cwd: WORKSPACE_ROOT,
      env: process.env,
      stdio: 'inherit',
    },
  );

  await sleep(6_000);

  return {
    url: `http://${VISUAL_HOST}:${visualPort}`,
    stop: async () => {
      if (preview.killed) {
        return;
      }
      preview.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        preview.once('exit', () => resolve());
        setTimeout(() => resolve(), 5_000);
      });
    },
  };
};

export const openViewerBrowserPage = async (baseUrl: string): Promise<{ browser: Browser; page: Page }> => {
  const launchBrowser = async (): Promise<Browser> => {
    try {
      return await chromium.launch({ headless: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Executable doesn't exist")) {
        throw error;
      }
      await runPnpm(['exec', 'playwright', 'install', 'chromium'], WORKSPACE_ROOT);
      return chromium.launch({ headless: true });
    }
  };

  const browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: {
      width: 512,
      height: 512,
    },
  });
  const start = Date.now();
  const embedUrl = `${baseUrl}/embed?sourceUrl=${encodeURIComponent('/api/asset/open-pbr-soapbubble.mtlx.zip')}&model=sphere&background=checkerboard&static=true`;
  for (;;) {
    try {
      await page.goto(embedUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.locator('[data-testid="viewer-render-target"]').waitFor({ timeout: 10_000 });
      break;
    } catch (error) {
      if (Date.now() - start > 180_000) {
        throw new Error(`Could not open ${embedUrl}: ${error instanceof Error ? error.message : String(error)}`, {
          cause: error,
        });
      }
      await sleep(500);
    }
  }
  return { browser, page };
};

export const getViewerSamples = async (): Promise<ViewerSampleEntry[]> => {
  const samples = await getMaterialXSamplePacksCached();
  return samples.map((sample) => ({
    id: sample.id,
    label: sample.label,
    directory: sample.directory,
  }));
};

export const resetViewerRuntimeState = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    const scopedWindow = window as Window & {
      __viewerTestState?: {
        consoleErrors: string[];
        uncaughtErrors: string[];
        failedRequests: string[];
      };
    };
    if (!scopedWindow.__viewerTestState) {
      return;
    }
    scopedWindow.__viewerTestState.consoleErrors = [];
    scopedWindow.__viewerTestState.uncaughtErrors = [];
    scopedWindow.__viewerTestState.failedRequests = [];
  });
};

const waitForDiagnosticsUpdate = async (page: Page): Promise<void> => {
  await page.waitForTimeout(250);
  await page.locator('[data-testid="compile-diagnostics"]').waitFor();
  await page.waitForTimeout(100);
};

const waitForCanvasReady = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('[data-testid="viewer-canvas"]');
    if (!(canvas instanceof HTMLCanvasElement)) {
      return false;
    }
    return canvas.width > 0 && canvas.height > 0;
  });
};

const waitForViewerSettled = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let frames = 0;
      const tick = () => {
        frames += 1;
        if (frames >= 24) {
          resolve();
          return;
        }
        window.requestAnimationFrame(tick);
      };
      window.requestAnimationFrame(tick);
    });
  });
  await page.waitForTimeout(250);
};

export const loadSampleInViewer = async (page: Page, sample: ViewerSampleEntry): Promise<void> => {
  const embedUrl = `/embed?sourceUrl=${encodeURIComponent(`/api/asset/${sample.id}.mtlx.zip`)}&model=sphere&background=checkerboard&static=true`;
  await page.goto(new URL(embedUrl, page.url()).toString(), { waitUntil: 'domcontentloaded' });
  await waitForDiagnosticsUpdate(page);
  await waitForCanvasReady(page);
  await waitForViewerSettled(page);
};

export const readViewerHealthReport = async (page: Page): Promise<ViewerHealthReport> => {
  return page.evaluate(() => {
    const scopedWindow = window as Window & {
      __viewerTestState?: {
        consoleErrors: string[];
        uncaughtErrors: string[];
        failedRequests: string[];
      };
    };
    const diagnostics = document.querySelector('[data-testid="compile-diagnostics"]');
    const compileErrorElement = document.querySelector('[data-testid="compile-error-message"]');
    const backgroundErrorElement = document.querySelector('[data-testid="background-error-message"]');
    const previewGeometryErrorElement = document.querySelector('[data-testid="preview-geometry-error-message"]');
    const compileErrorMessage = compileErrorElement ? compileErrorElement.textContent.trim() || undefined : undefined;
    const backgroundErrorMessage = backgroundErrorElement
      ? backgroundErrorElement.textContent.trim() || undefined
      : undefined;
    const previewGeometryErrorMessage = previewGeometryErrorElement
      ? previewGeometryErrorElement.textContent.trim() || undefined
      : undefined;

    return {
      compileErrorMessage,
      warningCount: Number.parseInt(diagnostics?.getAttribute('data-warning-count') ?? '0', 10),
      unsupportedCategoryCount: Number.parseInt(
        diagnostics?.getAttribute('data-unsupported-category-count') ?? '0',
        10,
      ),
      unsupportedWarningCount: Number.parseInt(diagnostics?.getAttribute('data-unsupported-warning-count') ?? '0', 10),
      backgroundErrorMessage,
      previewGeometryErrorMessage,
      consoleErrors: scopedWindow.__viewerTestState?.consoleErrors ?? [],
      uncaughtErrors: scopedWindow.__viewerTestState?.uncaughtErrors ?? [],
      failedRequests: scopedWindow.__viewerTestState?.failedRequests ?? [],
    };
  });
};

export const assertViewerHealthy = (sample: ViewerSampleEntry, report: ViewerHealthReport): void => {
  const failures: string[] = [];
  if (report.compileErrorMessage) {
    failures.push(`compile error: ${report.compileErrorMessage}`);
  }
  if (report.warningCount > 0) {
    failures.push(`warnings: ${report.warningCount}`);
  }
  if (report.unsupportedCategoryCount > 0) {
    failures.push(`unsupported categories: ${report.unsupportedCategoryCount}`);
  }
  if (report.unsupportedWarningCount > 0) {
    failures.push(`unsupported node warnings: ${report.unsupportedWarningCount}`);
  }
  if (report.backgroundErrorMessage) {
    failures.push(`background error: ${report.backgroundErrorMessage}`);
  }
  if (report.previewGeometryErrorMessage) {
    failures.push(`preview geometry error: ${report.previewGeometryErrorMessage}`);
  }
  if (report.consoleErrors.length > 0) {
    failures.push(`console errors: ${report.consoleErrors.join(' | ')}`);
  }
  if (report.uncaughtErrors.length > 0) {
    failures.push(`uncaught errors: ${report.uncaughtErrors.join(' | ')}`);
  }
  if (report.failedRequests.length > 0) {
    failures.push(`failed requests: ${report.failedRequests.join(' | ')}`);
  }
  if (failures.length > 0) {
    throw new Error(`Sample "${sample.id}" is unhealthy.\n${failures.map((entry) => `- ${entry}`).join('\n')}`);
  }
};

export const captureViewerWebp = async (page: Page): Promise<Buffer> => {
  const target = page.locator('[data-testid="viewer-render-target"]');
  await target.waitFor();
  const pngBuffer = await target.screenshot({
    type: 'png',
  });
  const webpDataUrl = await page.evaluate(async (pngBase64: string) => {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const entry = new Image();
      entry.addEventListener('load', () => resolve(entry), { once: true });
      entry.addEventListener('error', () => reject(new Error('Could not decode render target PNG')), { once: true });
      entry.src = `data:image/png;base64,${pngBase64}`;
    });

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = 512;
    outputCanvas.height = 512;
    const outputContext = outputCanvas.getContext('2d');
    if (!outputContext) {
      throw new Error('Could not create output canvas context');
    }
    outputContext.drawImage(image, 0, 0, 512, 512);
    return outputCanvas.toDataURL('image/webp', 1);
  }, pngBuffer.toString('base64'));

  const commaIndex = webpDataUrl.indexOf(',');
  if (commaIndex < 0) {
    throw new Error('Unexpected WebP data URL format');
  }
  return Buffer.from(webpDataUrl.slice(commaIndex + 1), 'base64');
};

export const writeSamplePreview = async (sample: ViewerSampleEntry, webp: Buffer): Promise<void> => {
  const destinationDir = path.resolve(EXAMPLES_ROOT, sample.directory);
  await mkdir(destinationDir, { recursive: true });
  await writeFile(path.resolve(destinationDir, 'preview.webp'), webp);
};

export const computeBaselineDiffRatio = async (page: Page, sample: ViewerSampleEntry): Promise<number> => {
  const baselineUrl = `/examples/${sample.directory}/preview.webp`;
  const currentCapture = await page.locator('[data-testid="viewer-render-target"]').screenshot({ type: 'png' });
  const currentDataUrl = `data:image/png;base64,${currentCapture.toString('base64')}`;
  return page.evaluate(
    async ({ url, currentUrl }) => {
      const baseline = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.addEventListener('load', () => resolve(image), { once: true });
        image.addEventListener('error', () => reject(new Error(`Could not load image: ${url}`)), { once: true });
        image.src = url;
      });
      const current = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.addEventListener('load', () => resolve(image), { once: true });
        image.addEventListener('error', () => reject(new Error(`Could not load image: ${currentUrl}`)), { once: true });
        image.src = currentUrl;
      });
      const baselineCanvas = document.createElement('canvas');
      baselineCanvas.width = 512;
      baselineCanvas.height = 512;
      const currentCanvas = document.createElement('canvas');
      currentCanvas.width = 512;
      currentCanvas.height = 512;
      const baselineContext = baselineCanvas.getContext('2d');
      const currentContext = currentCanvas.getContext('2d');
      if (!baselineContext || !currentContext) {
        throw new Error('Could not read canvas contexts');
      }
      baselineContext.drawImage(baseline, 0, 0, 512, 512);
      currentContext.drawImage(current, 0, 0, 512, 512);
      const baselineData = baselineContext.getImageData(0, 0, 512, 512).data;
      const currentData = currentContext.getImageData(0, 0, 512, 512).data;
      let diffPixels = 0;
      for (let i = 0; i < currentData.length; i += 4) {
        const rDiff = Math.abs(currentData[i] - baselineData[i]);
        const gDiff = Math.abs(currentData[i + 1] - baselineData[i + 1]);
        const bDiff = Math.abs(currentData[i + 2] - baselineData[i + 2]);
        const aDiff = Math.abs(currentData[i + 3] - baselineData[i + 3]);
        if (rDiff > 8 || gDiff > 8 || bDiff > 8 || aDiff > 8) {
          diffPixels += 1;
        }
      }

      return diffPixels / (512 * 512);
    },
    { url: baselineUrl, currentUrl: currentDataUrl },
  );
};
