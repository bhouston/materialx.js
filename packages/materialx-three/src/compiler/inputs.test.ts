import { describe, expect, it } from 'vitest';
import { parseMaterialX } from '@materialx-js/materialx';
import { buildGraphIndex } from '../graph/resolve.js';
import { createResolveInputNode } from './inputs.js';

describe('createResolveInputNode', () => {
  it('uses nodegraph output channel when resolving references', () => {
    const xml = `<?xml version="1.0"?>
<materialx version="1.39">
  <nodegraph name="NG_Test">
    <texcoord name="uv0" type="vector2" />
    <separate2 name="split_uv" type="multioutput">
      <input name="in" type="vector2" nodename="uv0" />
    </separate2>
    <output name="channel_output" type="float" nodename="split_uv" output="y" />
  </nodegraph>
  <gltf_pbr name="SR_Test" type="surfaceshader">
    <input name="base" type="float" nodegraph="NG_Test" output="channel_output" />
  </gltf_pbr>
</materialx>`;
    const document = parseMaterialX(xml);
    const surfaceNode = document.nodes.find((entry) => entry.name === 'SR_Test');
    expect(surfaceNode).toBeDefined();

    const compileCalls: Array<{ outputName: string | undefined }> = [];
    const resolveInputNode = createResolveInputNode((node, _context, _scopeGraph, outputName) => {
      compileCalls.push({ outputName });
      return `${node.name ?? node.category}:${outputName ?? 'out'}`;
    });

    const context = {
      document,
      warnings: [],
      index: buildGraphIndex(document),
      options: {},
      cache: new Map(),
    };

    const result = resolveInputNode(surfaceNode!, 'base', 0, context, undefined);
    expect(result).toBe('split_uv:y');
    expect(compileCalls).toEqual([{ outputName: 'y' }]);
  });
});
