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
const greysphereCalibrationFixture = path.resolve(
  sourceDir,
  '../../../../MaterialX/resources/Materials/Examples/StandardSurface/standard_surface_greysphere_calibration.mtlx'
);
const marbleFixture = path.resolve(
  sourceDir,
  '../../../../MaterialX/resources/Materials/Examples/StandardSurface/standard_surface_marble_solid.mtlx'
);
const onyxFixture = path.resolve(
  sourceDir,
  '../../../../MaterialX/resources/Materials/Examples/StandardSurface/standard_surface_onyx_hextiled.mtlx'
);
const copperFixture = path.resolve(
  sourceDir,
  '../../../../MaterialX/resources/Materials/Examples/StandardSurface/standard_surface_copper.mtlx'
);
const openPbrFixture = path.resolve(sourceDir, '../../../../MaterialX/resources/Materials/Examples/OpenPbr/open_pbr_default.mtlx');

const compileFixture = (fixturePath: string) => {
  const xml = readFileSync(fixturePath, 'utf8');
  const document = parseMaterialX(xml);
  return compileMaterialXToTSL(document);
};

const expectCategoriesSupported = (
  result: ReturnType<typeof compileMaterialXToTSL>,
  categories: string[]
) => {
  for (const category of categories) {
    expect(result.unsupportedCategories).not.toContain(category);
    expect(
      result.warnings.some((entry) => entry.code === 'unsupported-node' && entry.category === category)
    ).toBe(false);
  }
};

describe('materialx-three compiler', () => {
  it('compiles a standard_surface material into node assignments', () => {
    const result = compileFixture(standardSurfaceFixture);

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

  it('maps thin_film inputs to physical iridescence slots', () => {
    const xml = `<?xml version="1.0"?>
<materialx version="1.39" colorspace="lin_rec709">
  <standard_surface name="SR_thin_film" type="surfaceshader">
    <input name="base" type="float" value="0.0" />
    <input name="specular" type="float" value="1.0" />
    <input name="specular_roughness" type="float" value="0.02" />
    <input name="specular_IOR" type="float" value="2.5" />
    <input name="thin_film_thickness" type="float" value="550" />
    <input name="thin_film_IOR" type="float" value="1.5" />
  </standard_surface>
  <surfacematerial name="ThinFilm" type="material">
    <input name="surfaceshader" type="surfaceshader" nodename="SR_thin_film" />
  </surfacematerial>
</materialx>`;

    const document = parseMaterialX(xml);
    const result = compileMaterialXToTSL(document);
    expect(result.assignments.iridescenceNode).toBeDefined();
    expect(result.assignments.iridescenceIORNode).toBeDefined();
    expect(result.assignments.iridescenceThicknessNode).toBeDefined();

    const compiled = createThreeMaterialFromDocument(document);
    expect(compiled.material.iridescenceNode).toBeDefined();
    expect(compiled.material.iridescenceIORNode).toBeDefined();
    expect(compiled.material.iridescenceThicknessNode).toBeDefined();
  });

  it('reports unsupported surface shader graphs', () => {
    const result = compileFixture(openPbrFixture);
    expect(result.warnings.some((entry) => entry.code === 'unsupported-node')).toBe(true);
  });

  it('supports place2d texture transforms in greysphere calibration fixture', () => {
    const result = compileFixture(greysphereCalibrationFixture);
    expectCategoriesSupported(result, ['place2d']);
    expect(result.assignments.colorNode).toBeDefined();
  });

  it('supports procedural math stack used by marble fixture', () => {
    const result = compileFixture(marbleFixture);
    expectCategoriesSupported(result, ['fractal3d', 'sin', 'power']);
    expect(result.assignments.colorNode).toBeDefined();
  });

  it('supports hextiled image sampling used by onyx fixture', () => {
    const result = compileFixture(onyxFixture);
    expectCategoriesSupported(result, ['hextiledimage']);
    expect(result.assignments.colorNode).toBeDefined();
    expect(result.assignments.roughnessNode).toBeDefined();
  });

  it('maps coat inputs used by copper fixture to clearcoat assignments', () => {
    const result = compileFixture(copperFixture);
    expect(result.assignments.colorNode).toBeDefined();
    expect(result.assignments.clearcoatNode).toBeDefined();
    expect(result.assignments.clearcoatRoughnessNode).toBeDefined();
  });

  it('supports hextilednormalmap category for normal input wiring', () => {
    const xml = `<?xml version="1.0"?>
<materialx version="1.39">
  <nodegraph name="NG_HexNormal">
    <hextilednormalmap name="hex_normal" type="vector3">
      <input name="file" type="filename" value="dummy_normal.png" />
    </hextilednormalmap>
    <output name="normal_out" type="vector3" nodename="hex_normal" />
  </nodegraph>
  <standard_surface name="SR_HexNormal" type="surfaceshader">
    <input name="normal" type="vector3" nodegraph="NG_HexNormal" output="normal_out" />
  </standard_surface>
  <surfacematerial name="M_HexNormal" type="material">
    <input name="surfaceshader" type="surfaceshader" nodename="SR_HexNormal" />
  </surfacematerial>
</materialx>`;
    const result = compileMaterialXToTSL(parseMaterialX(xml));
    expectCategoriesSupported(result, ['hextilednormalmap']);
    expect(result.assignments.normalNode).toBeDefined();
  });

  it('supports extended math and procedural utility categories', () => {
    const xml = `<?xml version="1.0"?>
<materialx version="1.39">
  <nodegraph name="NG_Extended">
    <checkerboard name="checker" type="color3">
      <input name="uvtiling" type="vector2" value="4, 4" />
    </checkerboard>
    <ramplr name="left_right" type="color3">
      <input name="valuel" type="color3" value="0.2, 0.2, 0.2" />
      <input name="valuer" type="color3" value="1.0, 0.5, 0.1" />
    </ramplr>
    <splitlr name="split" type="color3">
      <input name="valuel" type="color3" value="1.0, 1.0, 1.0" />
      <input name="valuer" type="color3" value="0.5, 0.5, 0.5" />
      <input name="center" type="float" value="0.3" />
    </splitlr>
    <ramptb name="top_bottom" type="color3">
      <input name="valuet" type="color3" value="0.1, 0.3, 0.8" />
      <input name="valueb" type="color3" value="0.9, 0.2, 0.2" />
    </ramptb>
    <splittb name="split_tb" type="color3">
      <input name="valuet" type="color3" value="1.0, 1.0, 1.0" />
      <input name="valueb" type="color3" value="0.25, 0.25, 0.25" />
      <input name="center" type="float" value="0.6" />
    </splittb>
    <add name="combined" type="color3">
      <input name="in1" type="color3" nodename="checker" />
      <input name="in2" type="color3" nodename="left_right" />
    </add>
    <screen name="screened" type="color3">
      <input name="fg" type="color3" nodename="combined" />
      <input name="bg" type="color3" nodename="top_bottom" />
      <input name="mix" type="float" value="0.5" />
    </screen>
    <overlay name="overlayed" type="color3">
      <input name="fg" type="color3" nodename="split" />
      <input name="bg" type="color3" nodename="screened" />
      <input name="mix" type="float" value="0.5" />
    </overlay>
    <multiply name="combined_tb" type="color3">
      <input name="in1" type="color3" nodename="top_bottom" />
      <input name="in2" type="color3" nodename="split_tb" />
    </multiply>
    <multiply name="base_color" type="color3">
      <input name="in1" type="color3" nodename="overlayed" />
      <input name="in2" type="color3" nodename="combined_tb" />
    </multiply>

    <fract name="frac" type="float">
      <input name="in" type="float" value="1.35" />
    </fract>
    <atan2 name="angle" type="float">
      <input name="iny" type="float" nodename="frac" />
      <input name="inx" type="float" value="1.0" />
    </atan2>
    <safepower name="pow_safe" type="float">
      <input name="in1" type="float" nodename="angle" />
      <input name="in2" type="float" value="2.0" />
    </safepower>
    <range name="roughness_range" type="float">
      <input name="in" type="float" nodename="pow_safe" />
      <input name="inlow" type="float" value="0.0" />
      <input name="inhigh" type="float" value="1.0" />
      <input name="gamma" type="float" value="1.0" />
      <input name="outlow" type="float" value="0.1" />
      <input name="outhigh" type="float" value="0.9" />
      <input name="doclamp" type="boolean" value="true" />
    </range>
    <combine3 name="vec_for_magnitude" type="vector3">
      <input name="in1" type="float" value="1.0" />
      <input name="in2" type="float" value="2.0" />
      <input name="in3" type="float" value="3.0" />
    </combine3>
    <magnitude name="vec_length" type="float">
      <input name="in" type="vector3" nodename="vec_for_magnitude" />
    </magnitude>

    <output name="color_out" type="color3" nodename="base_color" />
    <output name="roughness_out" type="float" nodename="roughness_range" />
  </nodegraph>
  <standard_surface name="SR_Extended" type="surfaceshader">
    <input name="base_color" type="color3" nodegraph="NG_Extended" output="color_out" />
    <input name="specular_roughness" type="float" nodegraph="NG_Extended" output="roughness_out" />
  </standard_surface>
  <surfacematerial name="M_Extended" type="material">
    <input name="surfaceshader" type="surfaceshader" nodename="SR_Extended" />
  </surfacematerial>
</materialx>`;
    const result = compileMaterialXToTSL(parseMaterialX(xml));

    expectCategoriesSupported(result, [
      'checkerboard',
      'ramplr',
      'ramptb',
      'splitlr',
      'splittb',
      'screen',
      'overlay',
      'fract',
      'atan2',
      'safepower',
      'range',
      'magnitude',
    ]);
    expect(result.assignments.colorNode).toBeDefined();
    expect(result.assignments.roughnessNode).toBeDefined();
  });
});
