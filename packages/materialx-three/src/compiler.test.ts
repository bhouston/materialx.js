import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseMaterialX } from '@materialx-js/materialx';
import { compileMaterialXToTSL, createThreeMaterialFromDocument } from './compiler.js';

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const standardSurfaceFixture = path.resolve(
  sourceDir,
  '../../../../MaterialX/resources/Materials/Examples/StandardSurface/standard_surface_brick_procedural.mtlx'
);
const openPbrFixture = path.resolve(sourceDir, '../../../../MaterialX/resources/Materials/Examples/OpenPbr/open_pbr_default.mtlx');

describe('materialx-three compiler', () => {
  it('compiles a standard_surface material into node assignments', () => {
    const xml = readFileSync(standardSurfaceFixture, 'utf8');
    const document = parseMaterialX(xml);
    const result = compileMaterialXToTSL(document);

    expect(result.materialName).toBe('M_BrickPattern');
    expect(result.surfaceShaderName).toBe('N_StandardSurface');
    expect(result.assignments.colorNode).toBeDefined();
    expect(result.assignments.roughnessNode).toBeDefined();
    expect(result.unsupportedCategories).not.toContain('standard_surface');
  });

  it('creates a MeshPhysicalNodeMaterial wrapper', () => {
    const xml = readFileSync(standardSurfaceFixture, 'utf8');
    const document = parseMaterialX(xml);
    const compiled = createThreeMaterialFromDocument(document);
    expect(compiled.material).toBeDefined();
    expect(compiled.result.assignments.colorNode).toBeDefined();
  });

  it('reports unsupported surface shader graphs', () => {
    const xml = readFileSync(openPbrFixture, 'utf8');
    const document = parseMaterialX(xml);
    const result = compileMaterialXToTSL(document);
    expect(result.warnings.some((entry) => entry.code === 'unsupported-node')).toBe(true);
  });
});
