import type { MaterialXNode, MaterialXNodeGraph } from '@materialx-js/materialx';
import { resolveInputReference } from '../graph/resolve.js';
import type { CompileContext } from './internal-types.js';
import { toNodeValue } from './value-coercion.js';
import { warn } from './warnings.js';

export const readInput = (node: MaterialXNode, name: string) => node.inputs.find((entry) => entry.name === name);

export const resolveInterfaceValue = (scopeGraph: MaterialXNodeGraph | undefined, interfaceName: string): unknown => {
  if (!scopeGraph) {
    return undefined;
  }
  const interfaceInput = scopeGraph.inputs.find((entry) => entry.name === interfaceName);
  if (!interfaceInput) {
    return undefined;
  }
  return interfaceInput.value;
};

export const cacheKey = (node: MaterialXNode, scopeGraph?: MaterialXNodeGraph, outputName?: string): string =>
  `${scopeGraph?.name ?? 'document'}:${node.name ?? node.category}:${outputName ?? 'out'}`;

export const createResolveInputNode =
  (
    compileNode: (
      node: MaterialXNode,
      context: CompileContext,
      scopeGraph?: MaterialXNodeGraph,
      outputName?: string,
    ) => unknown,
  ) =>
  (
    node: MaterialXNode,
    inputName: string,
    fallback: unknown,
    context: CompileContext,
    scopeGraph?: MaterialXNodeGraph,
  ): unknown => {
    const input = readInput(node, inputName);
    if (!input) {
      return toNodeValue(fallback, undefined);
    }

    if (input.value !== undefined) {
      return toNodeValue(input.value, input.type);
    }

    const interfaceName = input.attributes.interfacename;
    if (interfaceName) {
      const interfaceValue = resolveInterfaceValue(scopeGraph, interfaceName);
      if (interfaceValue !== undefined) {
        return toNodeValue(interfaceValue, input.type);
      }
    }

    const reference = resolveInputReference(input, scopeGraph, context.index);
    if (reference?.fromNode) {
      const requestedOutput =
        reference.fromOutput?.attributes.output ??
        input.output ??
        input.attributes.output ??
        reference.fromOutput?.name;
      return compileNode(reference.fromNode, context, reference.fromGraph ?? scopeGraph, requestedOutput);
    }

    if (input.attributes.value !== undefined) {
      return toNodeValue(input.attributes.value, input.type);
    }

    if (input.attributes.nodename || input.attributes.nodegraph) {
      warn(context, {
        code: 'missing-reference',
        message: `Could not resolve input reference "${inputName}" on node "${node.name ?? node.category}"`,
        category: node.category,
        nodeName: node.name,
      });
    }

    return toNodeValue(fallback, input.type);
  };
