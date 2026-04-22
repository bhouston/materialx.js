import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseMaterialX } from '@materialx-js/materialx';
import { compileMaterialXToTSL, createThreeMaterialFromDocument } from './compiler.js';

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const standardSurfaceFixture = path.resolve(
  sourceDir,
  '../../../../MaterialX/resources/Materials/Examples/StandardSurface/standard_surface_brick_procedural.mtlx',
);
const greysphereCalibrationFixture = path.resolve(
  sourceDir,
  '../../../../MaterialX/resources/Materials/Examples/StandardSurface/standard_surface_greysphere_calibration.mtlx',
);
const marbleFixture = path.resolve(
  sourceDir,
  '../../../../MaterialX/resources/Materials/Examples/StandardSurface/standard_surface_marble_solid.mtlx',
);
const onyxFixture = path.resolve(
  sourceDir,
  '../../../../MaterialX/resources/Materials/Examples/StandardSurface/standard_surface_onyx_hextiled.mtlx',
);
const copperFixture = path.resolve(
  sourceDir,
  '../../../../MaterialX/resources/Materials/Examples/StandardSurface/standard_surface_copper.mtlx',
);
const openPbrFixture = path.resolve(
  sourceDir,
  '../../../../MaterialX/resources/Materials/Examples/OpenPbr/open_pbr_default.mtlx',
);
const openPbrGlassFixture = path.resolve(
  sourceDir,
  '../../../../MaterialX/resources/Materials/Examples/OpenPbr/open_pbr_glass.mtlx',
);
const openPbrKetchupFixture = path.resolve(
  sourceDir,
  '../../../../MaterialX/resources/Materials/Examples/OpenPbr/open_pbr_ketchup.mtlx',
);
const openPbrSoapBubbleFixture = path.resolve(
  sourceDir,
  '../../../../MaterialX/resources/Materials/Examples/OpenPbr/open_pbr_soapbubble.mtlx',
);
const conditionalLogicFixture = path.resolve(
  sourceDir,
  '../../../../MaterialX/resources/Materials/TestSuite/stdlib/conditional/conditional_logic.mtlx',
);
const compositingFixture = path.resolve(
  sourceDir,
  '../../../../MaterialX/resources/Materials/TestSuite/stdlib/compositing/compositing.mtlx',
);
const matrixFixture = path.resolve(
  sourceDir,
  '../../../../MaterialX/resources/Materials/TestSuite/stdlib/math/matrix.mtlx',
);
const vectorMathFixture = path.resolve(
  sourceDir,
  '../../../../MaterialX/resources/Materials/TestSuite/stdlib/math/vector_math.mtlx',
);
const transformFixture = path.resolve(
  sourceDir,
  '../../../../MaterialX/resources/Materials/TestSuite/stdlib/math/transform.mtlx',
);
const blackbodyFixture = path.resolve(
  sourceDir,
  '../../../../MaterialX/resources/Materials/TestSuite/pbrlib/bsdf/blackbody.mtlx',
);
const artisticIorFixture = path.resolve(
  sourceDir,
  '../../../../MaterialX/resources/Materials/TestSuite/pbrlib/multioutput/multioutput.mtlx',
);
const streamsFixture = path.resolve(
  sourceDir,
  '../../../../MaterialX/resources/Materials/TestSuite/stdlib/geometric/streams.mtlx',
);
const toonShadeFixture = path.resolve(
  sourceDir,
  '../../../../MaterialX/resources/Materials/TestSuite/nprlib/toon_shade.mtlx',
);
const gltfPbrDefaultFixture = path.resolve(
  sourceDir,
  '../../../../MaterialX/resources/Materials/Examples/GltfPbr/gltf_pbr_default.mtlx',
);
const gltfPbrBoomBoxFixture = path.resolve(
  sourceDir,
  '../../../../MaterialX/resources/Materials/Examples/GltfPbr/gltf_pbr_boombox.mtlx',
);

const compileFixture = (fixturePath: string) => {
  const xml = readFileSync(fixturePath, 'utf8');
  const document = parseMaterialX(xml);
  return compileMaterialXToTSL(document);
};

const readNumberLiteral = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return value;
  }
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const nodeValue = (value as { value?: unknown }).value;
  if (typeof nodeValue === 'number') {
    return nodeValue;
  }
  const nestedNodeValue = (value as { node?: { value?: unknown } }).node?.value;
  if (typeof nestedNodeValue === 'number') {
    return nestedNodeValue;
  }
  return undefined;
};

const expectCategoriesSupported = (result: ReturnType<typeof compileMaterialXToTSL>, categories: string[]) => {
  for (const category of categories) {
    expect(result.unsupportedCategories).not.toContain(category);
    expect(result.warnings.some((entry) => entry.code === 'unsupported-node' && entry.category === category)).toBe(
      false,
    );
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

  it('maps standard_surface ior as a fallback when specular_IOR is absent', () => {
    const xml = `<?xml version="1.0"?>
<materialx version="1.39" colorspace="lin_rec709">
  <standard_surface name="SR_IorFallback" type="surfaceshader">
    <input name="base_color" type="color3" value="1.0, 1.0, 1.0" />
    <input name="ior" type="float" value="1.7" />
  </standard_surface>
  <surfacematerial name="M_IorFallback" type="material">
    <input name="surfaceshader" type="surfaceshader" nodename="SR_IorFallback" />
  </surfacematerial>
</materialx>`;

    const result = compileMaterialXToTSL(parseMaterialX(xml));
    expect(readNumberLiteral(result.assignments.iorNode)).toBe(1.7);
    expect(result.warnings.some((entry) => entry.message.includes('input "ior"'))).toBe(false);
  });

  it('prefers standard_surface specular_IOR over ior fallback', () => {
    const xml = `<?xml version="1.0"?>
<materialx version="1.39" colorspace="lin_rec709">
  <standard_surface name="SR_IorPreferred" type="surfaceshader">
    <input name="base_color" type="color3" value="1.0, 1.0, 1.0" />
    <input name="ior" type="float" value="1.1" />
    <input name="specular_IOR" type="float" value="1.9" />
  </standard_surface>
  <surfacematerial name="M_IorPreferred" type="material">
    <input name="surfaceshader" type="surfaceshader" nodename="SR_IorPreferred" />
  </surfacematerial>
</materialx>`;

    const result = compileMaterialXToTSL(parseMaterialX(xml));
    expect(readNumberLiteral(result.assignments.iorNode)).toBe(1.9);
    expect(result.warnings.some((entry) => entry.message.includes('input "ior"'))).toBe(false);
  });

  it('maps low-hanging standard_surface physical controls to material slots', () => {
    const xml = `<?xml version="1.0"?>
<materialx version="1.39" colorspace="lin_rec709">
  <standard_surface name="SR_PhysicalControls" type="surfaceshader">
    <input name="specular" type="float" value="0.85" />
    <input name="specular_color" type="color3" value="1.0, 0.85, 0.75" />
    <input name="specular_anisotropy" type="float" value="0.4" />
    <input name="specular_rotation" type="float" value="0.2" />
    <input name="coat" type="float" value="0.6" />
    <input name="coat_roughness" type="float" value="0.2" />
    <input name="coat_normal" type="vector3" value="0.0, 0.0, 1.0" />
    <input name="sheen" type="float" value="0.5" />
    <input name="sheen_color" type="color3" value="0.9, 0.2, 0.2" />
    <input name="sheen_roughness" type="float" value="0.45" />
    <input name="opacity" type="color3" value="0.5, 0.5, 0.5" />
    <input name="transmission" type="float" value="0.7" />
    <input name="transmission_color" type="color3" value="0.8, 0.9, 1.0" />
    <input name="transmission_depth" type="float" value="0.35" />
  </standard_surface>
  <surfacematerial name="M_PhysicalControls" type="material">
    <input name="surfaceshader" type="surfaceshader" nodename="SR_PhysicalControls" />
  </surfacematerial>
</materialx>`;

    const document = parseMaterialX(xml);
    const result = compileMaterialXToTSL(document);

    expect(result.assignments.specularIntensityNode).toBeDefined();
    expect(result.assignments.specularColorNode).toBeDefined();
    expect(result.assignments.anisotropyNode).toBeDefined();
    expect(result.assignments.anisotropyRotation).toBeDefined();
    expect(result.assignments.clearcoatNormalNode).toBeDefined();
    expect(result.assignments.sheenNode).toBeDefined();
    expect(result.assignments.sheenRoughnessNode).toBeDefined();
    expect(result.assignments.opacityNode).toBeDefined();
    expect(result.assignments.attenuationColorNode).toBeDefined();
    expect(result.assignments.attenuationDistanceNode).toBeDefined();

    const compiled = createThreeMaterialFromDocument(document);
    expect(compiled.material.specularIntensityNode).toBeDefined();
    expect(compiled.material.specularColorNode).toBeDefined();
    expect(compiled.material.anisotropyNode).toBeDefined();
    expect(compiled.material.anisotropyRotation).toBe(0);
    expect(compiled.material.clearcoatNormalNode).toBeDefined();
    expect(compiled.material.sheenNode).toBeDefined();
    expect(compiled.material.sheenRoughnessNode).toBeDefined();
    expect(compiled.material.opacityNode).toBeDefined();
    expect(compiled.material.transparent).toBe(true);
    expect(compiled.material.attenuationColorNode).toBeDefined();
    expect(compiled.material.attenuationDistanceNode).toBeDefined();
  });

  it('enables transparent blending for opacity-only materials', () => {
    const xml = `<?xml version="1.0"?>
<materialx version="1.39" colorspace="lin_rec709">
  <standard_surface name="SR_OpacityOnly" type="surfaceshader">
    <input name="base_color" type="color3" value="0.8, 0.2, 0.2" />
    <input name="opacity" type="color3" value="0.35, 0.35, 0.35" />
  </standard_surface>
  <surfacematerial name="M_OpacityOnly" type="material">
    <input name="surfaceshader" type="surfaceshader" nodename="SR_OpacityOnly" />
  </surfacematerial>
</materialx>`;

    const compiled = createThreeMaterialFromDocument(parseMaterialX(xml));
    expect(compiled.material.opacityNode).toBeDefined();
    expect(compiled.material.transmissionNode).toBeUndefined();
    expect(compiled.material.transparent).toBe(true);
  });

  it('compiles an open_pbr_surface material into node assignments', () => {
    const result = compileFixture(openPbrFixture);

    expect(result.surfaceShaderName).toBe('open_pbr_surface_surfaceshader');
    expect(result.assignments.colorNode).toBeDefined();
    expect(result.assignments.roughnessNode).toBeDefined();
    expect(result.assignments.metalnessNode).toBeDefined();
    expect(result.assignments.transmissionNode).toBeDefined();
    expect(result.unsupportedCategories).not.toContain('open_pbr_surface');
  });

  it('warns for each ignored open_pbr_surface input', () => {
    const result = compileFixture(openPbrKetchupFixture);

    expect(
      result.warnings.some(
        (entry) =>
          entry.code === 'unsupported-node' &&
          entry.category === 'open_pbr_surface' &&
          entry.message.includes('input "subsurface_weight"'),
      ),
    ).toBe(true);
  });

  it('warns for ignored standard_surface inputs', () => {
    const xml = `<?xml version="1.0"?>
<materialx version="1.39">
  <standard_surface name="SR_UnsupportedStandardInput" type="surfaceshader">
    <input name="base_color" type="color3" value="1.0, 0.2, 0.2" />
    <input name="diffuse_roughness" type="float" value="0.25" />
    <input name="subsurface" type="float" value="0.5" />
  </standard_surface>
  <surfacematerial name="M_UnsupportedStandardInput" type="material">
    <input name="surfaceshader" type="surfaceshader" nodename="SR_UnsupportedStandardInput" />
  </surfacematerial>
</materialx>`;

    const result = compileMaterialXToTSL(parseMaterialX(xml));

    expect(
      result.warnings.some(
        (entry) =>
          entry.code === 'unsupported-node' &&
          entry.category === 'standard_surface' &&
          entry.message.includes('input "diffuse_roughness"'),
      ),
    ).toBe(true);
    expect(
      result.warnings.some(
        (entry) =>
          entry.code === 'unsupported-node' &&
          entry.category === 'standard_surface' &&
          entry.message.includes('input "subsurface"'),
      ),
    ).toBe(true);
  });

  it('supports transmission-heavy open_pbr fixture', () => {
    const result = compileFixture(openPbrGlassFixture);
    expect(result.assignments.transmissionNode).toBeDefined();
    expect(result.assignments.iorNode).toBeDefined();
    expect(result.assignments.colorNode).toBeDefined();
  });

  it('maps open_pbr dispersion controls to glTF/Three dispersion value', () => {
    const xml = `<?xml version="1.0"?>
<materialx version="1.39" colorspace="lin_rec709">
  <open_pbr_surface name="SR_OpenPbrDispersion" type="surfaceshader">
    <input name="base_color" type="color3" value="1.0, 1.0, 1.0" />
    <input name="specular_roughness" type="float" value="0.05" />
    <input name="specular_ior" type="float" value="1.5" />
    <input name="transmission_weight" type="float" value="1.0" />
    <input name="transmission_dispersion_scale" type="float" value="0.4" />
    <input name="transmission_dispersion_abbe_number" type="float" value="40.0" />
  </open_pbr_surface>
  <surfacematerial name="M_OpenPbrDispersion" type="material">
    <input name="surfaceshader" type="surfaceshader" nodename="SR_OpenPbrDispersion" />
  </surfacematerial>
</materialx>`;

    const document = parseMaterialX(xml);
    const result = compileMaterialXToTSL(document);
    expect(readNumberLiteral(result.assignments.dispersionNode)).toBeCloseTo(0.2, 6);
    expect(result.warnings.some((entry) => entry.message.includes('input "transmission_dispersion_scale"'))).toBe(
      false,
    );
    expect(result.warnings.some((entry) => entry.message.includes('input "transmission_dispersion_abbe_number"'))).toBe(
      false,
    );

    const compiled = createThreeMaterialFromDocument(document);
    expect(readNumberLiteral(compiled.material.dispersionNode)).toBeCloseTo(0.2, 6);
  });

  it('maps open_pbr thin film inputs to physical iridescence slots', () => {
    const result = compileFixture(openPbrSoapBubbleFixture);
    expect(result.assignments.iridescenceNode).toBeDefined();
    expect(result.assignments.iridescenceIORNode).toBeDefined();
    expect(result.assignments.iridescenceThicknessNode).toBeDefined();

    const xml = readFileSync(openPbrSoapBubbleFixture, 'utf8');
    const compiled = createThreeMaterialFromDocument(parseMaterialX(xml));
    expect(compiled.material.iridescenceNode).toBeDefined();
    expect(compiled.material.iridescenceIORNode).toBeDefined();
    expect(compiled.material.iridescenceThicknessNode).toBeDefined();
  });

  it('compiles a gltf_pbr material into node assignments', () => {
    const result = compileFixture(gltfPbrDefaultFixture);
    expect(result.surfaceShaderName).toBe('SR_default');
    expect(result.assignments.colorNode).toBeDefined();
    expect(result.assignments.aoNode).toBeDefined();
    expect(result.assignments.roughnessNode).toBeDefined();
    expect(result.assignments.metalnessNode).toBeDefined();
    expect(result.assignments.opacityNode).toBeDefined();
    expect(result.assignments.transmissionNode).toBeDefined();
    expect(result.assignments.thicknessNode).toBeDefined();
    expect(result.assignments.iorNode).toBeDefined();
    expect(
      result.warnings.some((entry) => entry.code === 'unsupported-node' && entry.nodeName === result.surfaceShaderName),
    ).toBe(false);
    expectCategoriesSupported(result, ['gltf_pbr']);

    const xml = readFileSync(gltfPbrDefaultFixture, 'utf8');
    const compiled = createThreeMaterialFromDocument(parseMaterialX(xml));
    expect(compiled.material.aoNode).toBeDefined();
    expect(compiled.material.thicknessNode).toBeDefined();
  });

  it('maps gltf_pbr dispersion input to physical dispersion slot', () => {
    const xml = `<?xml version="1.0"?>
<materialx version="1.39" colorspace="lin_rec709">
  <gltf_pbr name="SR_Dispersion" type="surfaceshader">
    <input name="base_color" type="color3" value="1.0, 1.0, 1.0" />
    <input name="metallic" type="float" value="0.0" />
    <input name="roughness" type="float" value="0.2" />
    <input name="transmission" type="float" value="1.0" />
    <input name="ior" type="float" value="1.5" />
    <input name="dispersion" type="float" value="0.35" />
  </gltf_pbr>
  <surfacematerial name="M_Dispersion" type="material">
    <input name="surfaceshader" type="surfaceshader" nodename="SR_Dispersion" />
  </surfacematerial>
</materialx>`;

    const document = parseMaterialX(xml);
    const result = compileMaterialXToTSL(document);
    expect(result.assignments.dispersionNode).toBeDefined();
    expect(
      result.warnings.some((entry) => entry.code === 'unsupported-node' && entry.message.includes('dispersion')),
    ).toBe(false);

    const compiled = createThreeMaterialFromDocument(document);
    expect(compiled.material.dispersionNode).toBeDefined();
  });

  it('does not force transmissive rendering when gltf_pbr transmission is zero', () => {
    const xml = `<?xml version="1.0"?>
<materialx version="1.39" colorspace="lin_rec709">
  <gltf_pbr name="SR_TransmissionZero" type="surfaceshader">
    <input name="base_color" type="color3" value="1.0, 1.0, 1.0" />
    <input name="metallic" type="float" value="0.0" />
    <input name="roughness" type="float" value="0.4" />
    <input name="transmission" type="float" value="0.0" />
    <input name="ior" type="float" value="1.5" />
    <input name="thickness" type="float" value="1.0" />
  </gltf_pbr>
  <surfacematerial name="M_TransmissionZero" type="material">
    <input name="surfaceshader" type="surfaceshader" nodename="SR_TransmissionZero" />
  </surfacematerial>
</materialx>`;
    const compiled = createThreeMaterialFromDocument(parseMaterialX(xml));
    expect(compiled.material.transparent).toBe(false);
    expect(compiled.material.transmission).toBe(0);
  });

  it('maps open_pbr transmission_depth to thickness when authored', () => {
    const xml = `<?xml version="1.0"?>
<materialx version="1.39" colorspace="lin_rec709">
  <open_pbr_surface name="SR_OpenPbrHoneyLike" type="surfaceshader">
    <input name="base_color" type="color3" value="1.0, 1.0, 1.0" />
    <input name="specular_roughness" type="float" value="0.0" />
    <input name="specular_ior" type="float" value="1.504" />
    <input name="transmission_weight" type="float" value="1.0" />
    <input name="transmission_color" type="color3" value="0.83, 0.4, 0.04" />
    <input name="transmission_depth" type="float" value="2.0" />
  </open_pbr_surface>
  <surfacematerial name="M_OpenPbrHoneyLike" type="material">
    <input name="surfaceshader" type="surfaceshader" nodename="SR_OpenPbrHoneyLike" />
  </surfacematerial>
</materialx>`;
    const compiled = createThreeMaterialFromDocument(parseMaterialX(xml));
    expect(compiled.result.assignments.thicknessNode).toBeDefined();
    expect(compiled.material.thicknessNode).toBeDefined();
    expect(compiled.material.transmission).toBe(1);
  });

  it('defaults open_pbr thickness to 1 when transmission_depth is omitted', () => {
    const xml = `<?xml version="1.0"?>
<materialx version="1.39" colorspace="lin_rec709">
  <open_pbr_surface name="SR_OpenPbrGlassLike" type="surfaceshader">
    <input name="base_color" type="color3" value="1.0, 1.0, 1.0" />
    <input name="specular_roughness" type="float" value="0.0" />
    <input name="specular_ior" type="float" value="1.52" />
    <input name="transmission_weight" type="float" value="1.0" />
  </open_pbr_surface>
  <surfacematerial name="M_OpenPbrGlassLike" type="material">
    <input name="surfaceshader" type="surfaceshader" nodename="SR_OpenPbrGlassLike" />
  </surfacematerial>
</materialx>`;
    const compiled = createThreeMaterialFromDocument(parseMaterialX(xml));
    expect(compiled.result.assignments.thicknessNode).toBeUndefined();
    expect(compiled.material.thicknessNode).toBeNull();
    expect(compiled.material.thickness).toBe(1);
    expect(compiled.material.transmission).toBe(1);
  });

  it('defaults standard_surface attenuation distance to 1 when transmission_color is authored without transmission_depth', () => {
    const xml = `<?xml version="1.0"?>
<materialx version="1.39" colorspace="lin_rec709">
  <standard_surface name="SR_StdTintedTransmission" type="surfaceshader">
    <input name="base" type="float" value="0.0" />
    <input name="specular" type="float" value="1.0" />
    <input name="specular_roughness" type="float" value="0.05" />
    <input name="transmission" type="float" value="1.0" />
    <input name="transmission_color" type="color3" value="0.9, 0.6, 0.2" />
  </standard_surface>
  <surfacematerial name="M_StdTintedTransmission" type="material">
    <input name="surfaceshader" type="surfaceshader" nodename="SR_StdTintedTransmission" />
  </surfacematerial>
</materialx>`;
    const compiled = createThreeMaterialFromDocument(parseMaterialX(xml));
    expect(compiled.result.assignments.attenuationColorNode).toBeDefined();
    expect(compiled.result.assignments.attenuationDistanceNode).toBe(1);
    expect(compiled.material.attenuationDistanceNode).toBe(1);
  });

  it('defaults gltf_pbr attenuation distance to 1 when attenuation_color is authored without attenuation_distance', () => {
    const xml = `<?xml version="1.0"?>
<materialx version="1.39" colorspace="lin_rec709">
  <gltf_pbr name="SR_GltfTintedTransmission" type="surfaceshader">
    <input name="base_color" type="color3" value="1.0, 1.0, 1.0" />
    <input name="metallic" type="float" value="0.0" />
    <input name="roughness" type="float" value="0.0" />
    <input name="transmission" type="float" value="1.0" />
    <input name="attenuation_color" type="color3" value="0.95, 0.7, 0.3" />
  </gltf_pbr>
  <surfacematerial name="M_GltfTintedTransmission" type="material">
    <input name="surfaceshader" type="surfaceshader" nodename="SR_GltfTintedTransmission" />
  </surfacematerial>
</materialx>`;
    const compiled = createThreeMaterialFromDocument(parseMaterialX(xml));
    expect(compiled.result.assignments.attenuationColorNode).toBeDefined();
    expect(compiled.result.assignments.attenuationDistanceNode).toBe(1);
    expect(compiled.material.attenuationDistanceNode).toBe(1);
  });

  it('supports broad gltf_* texture node coverage used by boombox fixture', () => {
    const result = compileFixture(gltfPbrBoomBoxFixture);
    expectCategoriesSupported(result, ['gltf_pbr', 'gltf_colorimage', 'gltf_image', 'gltf_normalmap', 'separate3']);
    expect(result.assignments.colorNode).toBeDefined();
    expect(result.assignments.metalnessNode).toBeDefined();
    expect(result.assignments.roughnessNode).toBeDefined();
    expect(result.assignments.normalNode).toBeDefined();
    expect(result.assignments.emissiveNode).toBeDefined();
    expect(result.assignments.opacityNode).toBeDefined();
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

  it('supports rotate2d category used by three.js MaterialX sample', () => {
    const xml = `<?xml version="1.0"?>
<materialx version="1.39">
  <surfacematerial name="mat_rotate2d_test" type="material" nodedef="ND_surfacematerial">
    <input name="surfaceshader" type="surfaceshader" nodename="surface_shader1" />
  </surfacematerial>
  <standard_surface name="surface_shader1" type="surfaceshader" nodedef="ND_standard_surface_surfaceshader">
    <input name="base_color" type="color3" output="out" nodegraph="rotate2d_test" />
  </standard_surface>
  <nodegraph name="rotate2d_test">
    <texcoord name="texcoord1" type="vector2" />
    <rotate2d name="rotate2d_1" type="vector2">
      <input name="in" type="vector2" nodename="texcoord1" />
      <input name="amount" type="float" value="45.0" unittype="angle" unit="degree" />
      <input name="pivot" type="vector2" value="0.5, 0.5" />
    </rotate2d>
    <image name="rotated_image" type="color3">
      <input name="file" type="filename" value="resources/Images/grid.png" />
      <input name="default" type="color3" value="0.5, 0.5, 0.5" />
      <input name="texcoord" type="vector2" nodename="rotate2d_1" />
    </image>
    <output name="out" type="color3" nodename="rotated_image" />
  </nodegraph>
</materialx>`;

    const result = compileMaterialXToTSL(parseMaterialX(xml));
    expectCategoriesSupported(result, ['rotate2d']);
    expect(result.assignments.colorNode).toBeDefined();
  });

  it('supports rotate3d and time categories used by animated three.js sample', () => {
    const xml = `<?xml version="1.0"?>
<materialx version="1.39">
  <surfacematerial name="mat_rotate3d_test" type="material" nodedef="ND_surfacematerial">
    <input name="surfaceshader" type="surfaceshader" nodename="surface_shader1" />
  </surfacematerial>
  <standard_surface name="surface_shader1" type="surfaceshader" nodedef="ND_standard_surface_surfaceshader">
    <input name="base_color" type="color3" output="out" nodegraph="rotate3d_test" />
  </standard_surface>
  <nodegraph name="rotate3d_test">
    <texcoord name="texcoord1" type="vector2" />
    <separate2 name="separate_texcoord" type="vector2">
      <input name="in" type="vector2" nodename="texcoord1" />
    </separate2>
    <combine3 name="texcoord_3d" type="vector3">
      <input name="in1" type="float" nodename="separate_texcoord" output="x" />
      <input name="in2" type="float" nodename="separate_texcoord" output="y" />
      <input name="in3" type="float" value="0.0" />
    </combine3>
    <time name="time1" type="float" />
    <multiply name="multiply1" type="float">
      <input name="in1" type="float" nodename="time1" />
      <input name="in2" type="float" value="10.0" />
    </multiply>
    <rotate3d name="rotate3d_1" type="vector3">
      <input name="in" type="vector3" nodename="texcoord_3d" />
      <input name="amount" type="float" nodename="multiply1" />
      <input name="axis" type="vector3" value="0.0, 0.0, 1.0" />
    </rotate3d>
    <separate3 name="separate_rotated" type="vector3">
      <input name="in" type="vector3" nodename="rotate3d_1" />
    </separate3>
    <combine3 name="rotated_texcoord" type="vector3">
      <input name="in1" type="float" nodename="separate_rotated" output="x" />
      <input name="in2" type="float" nodename="separate_rotated" output="y" />
      <input name="in3" type="float" nodename="separate_rotated" output="z" />
    </combine3>
    <image name="rotated_image" type="color3">
      <input name="file" type="filename" value="resources/Images/grid.png" />
      <input name="default" type="color3" value="0.5, 0.5, 0.5" />
      <input name="texcoord" type="vector2" nodename="rotated_texcoord" />
    </image>
    <output name="out" type="color3" nodename="rotated_image" />
  </nodegraph>
</materialx>`;

    const result = compileMaterialXToTSL(parseMaterialX(xml));
    expectCategoriesSupported(result, ['rotate3d', 'time']);
    expect(result.assignments.colorNode).toBeDefined();
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

  it('supports logical and compositing categories in upstream fixtures', () => {
    const conditionalResult = compileFixture(conditionalLogicFixture);
    expectCategoriesSupported(conditionalResult, ['and', 'or', 'xor']);

    const compositingResult = compileFixture(compositingFixture);
    expectCategoriesSupported(compositingResult, ['minus', 'difference', 'burn', 'dodge', 'unpremult']);
  });

  it('supports matrix and transform categories in upstream fixtures', () => {
    const matrixResult = compileFixture(matrixFixture);
    expectCategoriesSupported(matrixResult, ['creatematrix', 'transformmatrix']);

    const vectorMathResult = compileFixture(vectorMathFixture);
    expectCategoriesSupported(vectorMathResult, ['transpose', 'determinant']);

    const transformResult = compileFixture(transformFixture);
    expectCategoriesSupported(transformResult, [
      'transformpoint',
      'transformvector',
      'transformnormal',
      'transformmatrix',
    ]);
  });

  it('supports geometric and pbr helper categories in upstream fixtures', () => {
    const blackbodyResult = compileFixture(blackbodyFixture);
    expectCategoriesSupported(blackbodyResult, ['blackbody']);

    const artisticIorResult = compileFixture(artisticIorFixture);
    expectCategoriesSupported(artisticIorResult, ['artistic_ior']);

    const streamsResult = compileFixture(streamsFixture);
    expectCategoriesSupported(streamsResult, ['tangent']);

    const toonShadeResult = compileFixture(toonShadeFixture);
    expectCategoriesSupported(toonShadeResult, ['viewdirection']);
  });

  it('supports newly added utility and helper node categories', () => {
    const xml = `<?xml version="1.0"?>
<materialx version="1.39">
  <nodegraph name="NG_NewNodes">
    <circle name="circle_mask" type="float">
      <input name="radius" type="float" value="0.35" />
    </circle>
    <blackbody name="bb_color" type="color3">
      <input name="temperature" type="float" value="5600" />
    </blackbody>
    <colorcorrect name="cc_color" type="color3">
      <input name="in" type="color3" nodename="bb_color" />
      <input name="hue" type="float" value="0.1" />
      <input name="saturation" type="float" value="1.2" />
      <input name="gamma" type="float" value="0.95" />
      <input name="lift" type="float" value="0.05" />
      <input name="gain" type="float" value="1.1" />
      <input name="contrast" type="float" value="1.15" />
      <input name="contrastpivot" type="float" value="0.5" />
      <input name="exposure" type="float" value="0.2" />
    </colorcorrect>
    <open_pbr_anisotropy name="aniso_pair" type="vector2">
      <input name="roughness" type="float" value="0.3" />
      <input name="anisotropy" type="float" value="0.4" />
    </open_pbr_anisotropy>
    <separate2 name="aniso_sep" type="multioutput">
      <input name="in" type="vector2" nodename="aniso_pair" />
    </separate2>
    <creatematrix name="basis" type="matrix33" nodedef="ND_creatematrix_vector3_matrix33">
      <input name="in1" type="vector3" value="1.0, 0.0, 0.0" />
      <input name="in2" type="vector3" value="0.0, 1.0, 0.0" />
      <input name="in3" type="vector3" value="0.0, 0.0, 1.0" />
    </creatematrix>
    <transpose name="basis_t" type="matrix33">
      <input name="in" type="matrix33" nodename="basis" />
    </transpose>
    <determinant name="basis_det" type="float">
      <input name="in" type="matrix33" nodename="basis_t" />
    </determinant>
    <transformmatrix name="tm_vec3" type="vector3" nodedef="ND_transformmatrix_vector3">
      <input name="in" type="vector3" value="0.2, 0.4, 0.8" />
      <input name="mat" type="matrix33" nodename="basis_t" />
    </transformmatrix>
    <transformpoint name="tp" type="vector3">
      <input name="in" type="vector3" nodename="tm_vec3" />
      <input name="fromspace" type="string" value="world" />
      <input name="tospace" type="string" value="object" />
    </transformpoint>
    <transformvector name="tv" type="vector3">
      <input name="in" type="vector3" nodename="tp" />
      <input name="fromspace" type="string" value="world" />
      <input name="tospace" type="string" value="object" />
    </transformvector>
    <transformnormal name="tn" type="vector3">
      <input name="in" type="vector3" nodename="tv" />
      <input name="fromspace" type="string" value="world" />
      <input name="tospace" type="string" value="object" />
    </transformnormal>
    <tangent name="tan_ws" type="vector3" />
    <viewdirection name="view_ws" type="vector3" />
    <bump name="bump_n" type="vector3">
      <input name="height" type="float" nodename="circle_mask" />
      <input name="scale" type="float" value="0.5" />
      <input name="normal" type="vector3" nodename="tn" />
      <input name="tangent" type="vector3" nodename="tan_ws" />
      <input name="bitangent" type="vector3" nodename="tv" />
    </bump>
    <dotproduct name="tan_view_dot" type="float">
      <input name="in1" type="vector3" nodename="tan_ws" />
      <input name="in2" type="vector3" nodename="view_ws" />
    </dotproduct>
    <artistic_ior name="art" type="multioutput">
      <input name="reflectivity" type="color3" value="0.85, 0.7, 0.6" />
      <input name="edge_color" type="color3" value="0.9, 0.95, 1.0" />
    </artistic_ior>
    <luminance name="ior_luma" type="float">
      <input name="in" type="color3" nodename="art" output="ior" />
    </luminance>
    <luminance name="ext_luma" type="float">
      <input name="in" type="color3" nodename="art" output="extinction" />
    </luminance>
    <combine4 name="premult_src" type="color4">
      <input name="in1" type="float" value="0.3" />
      <input name="in2" type="float" value="0.4" />
      <input name="in3" type="float" value="0.6" />
      <input name="in4" type="float" value="0.5" />
    </combine4>
    <unpremult name="unpremult_color" type="color4">
      <input name="in" type="color4" nodename="premult_src" />
    </unpremult>
    <minus name="minus_out" type="float">
      <input name="fg" type="float" nodename="tan_view_dot" />
      <input name="bg" type="float" nodename="ior_luma" />
      <input name="mix" type="float" value="0.5" />
    </minus>
    <difference name="difference_out" type="float">
      <input name="fg" type="float" nodename="minus_out" />
      <input name="bg" type="float" nodename="ext_luma" />
      <input name="mix" type="float" value="0.5" />
    </difference>
    <burn name="burn_out" type="float">
      <input name="fg" type="float" nodename="difference_out" />
      <input name="bg" type="float" nodename="circle_mask" />
      <input name="mix" type="float" value="0.5" />
    </burn>
    <dodge name="dodge_out" type="float">
      <input name="fg" type="float" nodename="burn_out" />
      <input name="bg" type="float" nodename="ior_luma" />
      <input name="mix" type="float" value="0.5" />
    </dodge>
    <ifgreater name="bool_left" type="boolean">
      <input name="value1" type="float" nodename="dodge_out" />
      <input name="value2" type="float" value="0.2" />
      <input name="in1" type="boolean" value="true" />
      <input name="in2" type="boolean" value="false" />
    </ifgreater>
    <ifgreater name="bool_right" type="boolean">
      <input name="value1" type="float" nodename="basis_det" />
      <input name="value2" type="float" value="0.0" />
      <input name="in1" type="boolean" value="true" />
      <input name="in2" type="boolean" value="false" />
    </ifgreater>
    <and name="logic_and" type="boolean">
      <input name="in1" type="boolean" nodename="bool_left" />
      <input name="in2" type="boolean" nodename="bool_right" />
    </and>
    <or name="logic_or" type="boolean">
      <input name="in1" type="boolean" nodename="bool_left" />
      <input name="in2" type="boolean" nodename="bool_right" />
    </or>
    <xor name="logic_xor" type="boolean">
      <input name="in1" type="boolean" nodename="logic_and" />
      <input name="in2" type="boolean" nodename="logic_or" />
    </xor>
    <output name="base_out" type="color3" nodename="cc_color" />
    <output name="rough_out" type="float" nodename="aniso_sep" output="x" />
    <output name="normal_out" type="vector3" nodename="bump_n" />
  </nodegraph>
  <standard_surface name="SR_NewNodes" type="surfaceshader">
    <input name="base_color" type="color3" nodegraph="NG_NewNodes" output="base_out" />
    <input name="specular_roughness" type="float" nodegraph="NG_NewNodes" output="rough_out" />
    <input name="normal" type="vector3" nodegraph="NG_NewNodes" output="normal_out" />
  </standard_surface>
  <surfacematerial name="M_NewNodes" type="material">
    <input name="surfaceshader" type="surfaceshader" nodename="SR_NewNodes" />
  </surfacematerial>
</materialx>`;
    const result = compileMaterialXToTSL(parseMaterialX(xml));

    expectCategoriesSupported(result, [
      'open_pbr_anisotropy',
      'and',
      'or',
      'xor',
      'minus',
      'dodge',
      'difference',
      'colorcorrect',
      'circle',
      'burn',
      'bump',
      'blackbody',
      'artistic_ior',
      'tangent',
      'creatematrix',
      'transpose',
      'determinant',
      'transformmatrix',
      'transformnormal',
      'transformpoint',
      'transformvector',
      'unpremult',
      'viewdirection',
    ]);
    expect(result.assignments.colorNode).toBeDefined();
    expect(result.assignments.roughnessNode).toBeDefined();
    expect(result.assignments.normalNode).toBeDefined();
  });
});
