import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { materialXNodeRegistry } from './registry.js';
import { readMaterialX, writeMaterialX } from './io.js';
import { validateDocument } from './validate.js';
import { parseMaterialX, serializeMaterialX } from './xml.js';

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const materialXRoot = path.resolve(sourceDir, '../../../../MaterialX');

const fixturePaths = [
  'resources/Materials/Examples/StandardSurface/standard_surface_brick_procedural.mtlx',
  'resources/Materials/Examples/OpenPbr/open_pbr_default.mtlx',
  'resources/Materials/TestSuite/stdlib/texture/image.mtlx',
  'resources/Materials/TestSuite/stdlib/texture/tiledimage.mtlx',
  'resources/Materials/TestSuite/stdlib/math/math_operators.mtlx',
  'resources/Materials/TestSuite/stdlib/compositing/compositing.mtlx',
  'resources/Materials/TestSuite/pbrlib/surfaceshader/normalmapped_surfaceshader.mtlx',
  'resources/Materials/TestSuite/pbrlib/surfaceshader/surface_ops.mtlx',
  'resources/Materials/TestSuite/pbrlib/surfaceshader/surfacematerial_with_graph.mtlx',
  'resources/Materials/TestSuite/stdlib/nodegraphs/nodegraph_multioutput.mtlx',
].map((fixturePath) => path.join(materialXRoot, fixturePath));

const passthroughFixturePath = path.join(materialXRoot, 'libraries/stdlib/stdlib_defs.mtlx');

const expectedCategories = [
  'surfacematerial',
  'nodegraph',
  'output',
  'image',
  'tiledimage',
  'open_pbr_surface',
  'multiply',
  'mix',
  'normalmap',
  'convert',
];

describe('MaterialX parsing and serialization', () => {
  it('parses all selected upstream fixtures', async () => {
    for (const fixturePath of fixturePaths) {
      expect(existsSync(fixturePath), `${fixturePath} should exist`).toBe(true);
      const document = await readMaterialX(fixturePath);
      expect(document.attributes).toBeDefined();
      expect(document.elements.length).toBeGreaterThan(0);
    }
  });

  it('round-trips all selected fixtures', () => {
    for (const fixturePath of fixturePaths) {
      const originalXml = readFileSync(fixturePath, 'utf8');
      const parsed = parseMaterialX(originalXml);
      const serialized = serializeMaterialX(parsed);
      const reparsed = parseMaterialX(serialized);
      expect(reparsed).toEqual(parsed);
    }
  });

  it('preserves arbitrary top-level elements through the passthrough tree', () => {
    expect(existsSync(passthroughFixturePath), `${passthroughFixturePath} should exist`).toBe(true);
    const xml = readFileSync(passthroughFixturePath, 'utf8');
    const parsed = parseMaterialX(xml);
    const elementNames = new Set(parsed.elements.map((entry) => entry.name));
    expect(elementNames.has('nodedef')).toBe(true);

    const serialized = serializeMaterialX(parsed);
    const reparsed = parseMaterialX(serialized);
    expect(reparsed.elements).toEqual(parsed.elements);
  });

  it('covers the expected node categories from fixtures', async () => {
    const foundCategories = new Set<string>();

    for (const fixturePath of fixturePaths) {
      const document = await readMaterialX(fixturePath);
      for (const node of document.nodes) {
        foundCategories.add(node.category);
      }
      for (const nodeGraph of document.nodeGraphs) {
        foundCategories.add('nodegraph');
        for (const node of nodeGraph.nodes) {
          foundCategories.add(node.category);
        }
        if (nodeGraph.outputs.length > 0) {
          foundCategories.add('output');
        }
      }
    }

    for (const category of expectedCategories) {
      expect(foundCategories.has(category), `Expected category ${category} to be found`).toBe(true);
    }
  });

  it('validates parsed fixture documents', async () => {
    for (const fixturePath of fixturePaths) {
      const document = await readMaterialX(fixturePath);
      const issues = validateDocument(document, materialXNodeRegistry);
      const hardErrors = issues.filter((issue) => issue.level === 'error');
      expect(hardErrors).toHaveLength(0);
    }
  });

  it('writes and reads serialized XML through filesystem APIs', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'materialx-test-'));
    const outputPath = path.join(tempDir, 'roundtrip.mtlx');
    const sourceFixture = fixturePaths[1];
    if (!sourceFixture) {
      throw new Error('Expected at least one fixture');
    }
    const xml = readFileSync(sourceFixture, 'utf8');
    const document = parseMaterialX(xml);

    await writeMaterialX(outputPath, document);
    const loadedDocument = await readMaterialX(outputPath);
    expect(loadedDocument).toEqual(document);

    await writeFile(outputPath, xml, 'utf8');
    await rm(tempDir, { recursive: true, force: true });
  });

  it('rejects malformed XML', () => {
    expect(() => parseMaterialX('<materialx><nodegraph></materialx>')).toThrow(/Invalid MaterialX XML/);
  });

  it('rejects documents without a materialx root', () => {
    expect(() => parseMaterialX('<document></document>')).toThrow(/missing <materialx> root/);
  });
});
