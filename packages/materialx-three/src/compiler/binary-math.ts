import type { MaterialXNode, MaterialXNodeGraph } from '@materialx-js/materialx';
import type { CompileContext } from './internal-types.js';

type ResolveInputNode = (
  node: MaterialXNode,
  inputName: string,
  fallback: unknown,
  context: CompileContext,
  scopeGraph?: MaterialXNodeGraph
) => unknown;

export const compileBinaryMath = (
  resolveInputNode: ResolveInputNode,
  node: MaterialXNode,
  leftName: string,
  rightName: string,
  context: CompileContext,
  scopeGraph: MaterialXNodeGraph | undefined,
  operator: (left: unknown, right: unknown) => unknown
): unknown => {
  const left = resolveInputNode(node, leftName, 0, context, scopeGraph);
  const right = resolveInputNode(node, rightName, 0, context, scopeGraph);
  return operator(left, right);
};
