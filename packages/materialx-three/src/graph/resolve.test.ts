import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseMaterialX } from '@materialx-js/materialx';
import { buildGraphIndex, resolveInputReference, topologicallySortFromNode } from './resolve.js';

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(
  sourceDir,
  '../../../../../MaterialX/resources/Materials/Examples/StandardSurface/standard_surface_brick_procedural.mtlx'
);

describe('graph resolver', () => {
  it('resolves surfaceshader reference from surfacematerial', () => {
    const xml = readFileSync(fixturePath, 'utf8');
    const document = parseMaterialX(xml);
    const index = buildGraphIndex(document);
    const materialNode = document.nodes.find((entry) => entry.category === 'surfacematerial');
    expect(materialNode).toBeDefined();
    const surfaceshaderInput = materialNode?.inputs.find((entry) => entry.name === 'surfaceshader');
    expect(surfaceshaderInput).toBeDefined();

    const resolved = resolveInputReference(surfaceshaderInput!, undefined, index);
    expect(resolved?.fromNode?.category).toBe('standard_surface');
  });

  it('returns dependency order for standard_surface graph', () => {
    const xml = readFileSync(fixturePath, 'utf8');
    const document = parseMaterialX(xml);
    const index = buildGraphIndex(document);
    const surfaceNode = document.nodes.find((entry) => entry.category === 'standard_surface');
    expect(surfaceNode).toBeDefined();

    const sorted = topologicallySortFromNode(surfaceNode!, undefined, index);
    const names = sorted.map((entry) => entry.name).filter(Boolean);
    expect(names).toContain('N_StandardSurface');
    expect(sorted.length).toBeGreaterThan(1);
  });
});
