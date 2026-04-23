import type {
  MaterialXDocument,
  MaterialXInput,
  MaterialXNode,
  MaterialXNodeGraph,
  MaterialXOutput,
} from '@material-viewer/materialx';

export interface GraphReference {
  sourceNode: MaterialXNode;
  fromNode?: MaterialXNode;
  fromOutput?: MaterialXOutput;
  fromGraph?: MaterialXNodeGraph;
}

interface GraphIndex {
  documentNodes: Map<string, MaterialXNode>;
  nodeGraphs: Map<string, MaterialXNodeGraph>;
  nodeGraphNodes: Map<string, Map<string, MaterialXNode>>;
}

const nodeName = (node: MaterialXNode): string => node.name ?? '';

export const buildGraphIndex = (document: MaterialXDocument): GraphIndex => {
  const documentNodes = new Map<string, MaterialXNode>();
  for (const node of document.nodes) {
    if (node.name) {
      documentNodes.set(node.name, node);
    }
  }

  const nodeGraphs = new Map<string, MaterialXNodeGraph>();
  const nodeGraphNodes = new Map<string, Map<string, MaterialXNode>>();
  for (const nodeGraph of document.nodeGraphs) {
    if (!nodeGraph.name) {
      continue;
    }
    nodeGraphs.set(nodeGraph.name, nodeGraph);
    const nodesByName = new Map<string, MaterialXNode>();
    for (const node of nodeGraph.nodes) {
      if (node.name) {
        nodesByName.set(node.name, node);
      }
    }
    nodeGraphNodes.set(nodeGraph.name, nodesByName);
  }

  return { documentNodes, nodeGraphs, nodeGraphNodes };
};

const resolveNodeGraphOutput = (nodeGraph: MaterialXNodeGraph, outputName?: string): MaterialXOutput | undefined => {
  if (outputName) {
    return nodeGraph.outputs.find((entry) => entry.name === outputName);
  }
  return nodeGraph.outputs[0];
};

const resolveNodeInScope = (
  input: MaterialXInput,
  scopeGraph: MaterialXNodeGraph | undefined,
  index: GraphIndex,
): GraphReference | undefined => {
  const referencedName = input.nodeName ?? input.attributes.nodename;
  if (!referencedName) {
    return undefined;
  }

  if (scopeGraph?.name) {
    const scoped = index.nodeGraphNodes.get(scopeGraph.name)?.get(referencedName);
    if (scoped) {
      return { sourceNode: scoped, fromNode: scoped };
    }
  }

  const documentNode = index.documentNodes.get(referencedName);
  if (documentNode) {
    return { sourceNode: documentNode, fromNode: documentNode };
  }

  return undefined;
};

export const resolveInputReference = (
  input: MaterialXInput,
  scopeGraph: MaterialXNodeGraph | undefined,
  index: GraphIndex,
): GraphReference | undefined => {
  const scopedNodeReference = resolveNodeInScope(input, scopeGraph, index);
  if (scopedNodeReference) {
    return scopedNodeReference;
  }

  const nodeGraphName = input.attributes.nodegraph;
  if (!nodeGraphName) {
    return undefined;
  }
  const nodeGraph = index.nodeGraphs.get(nodeGraphName);
  if (!nodeGraph) {
    return undefined;
  }

  const output = resolveNodeGraphOutput(nodeGraph, input.output ?? input.attributes.output);
  if (!output) {
    return undefined;
  }
  const outputNodeName = output.attributes.nodename;
  if (!outputNodeName) {
    return undefined;
  }
  const fromNode = index.nodeGraphNodes.get(nodeGraphName)?.get(outputNodeName);
  if (!fromNode) {
    return undefined;
  }

  return {
    sourceNode: fromNode,
    fromNode,
    fromOutput: output,
    fromGraph: nodeGraph,
  };
};

const visitNode = (
  node: MaterialXNode,
  scopeGraph: MaterialXNodeGraph | undefined,
  index: GraphIndex,
  active: Set<string>,
  visited: Set<string>,
  order: MaterialXNode[],
): void => {
  const key = `${scopeGraph?.name ?? 'document'}:${nodeName(node)}`;
  if (visited.has(key)) {
    return;
  }
  if (active.has(key)) {
    return;
  }
  active.add(key);

  for (const input of node.inputs) {
    const resolved = resolveInputReference(input, scopeGraph, index);
    if (!resolved?.fromNode) {
      continue;
    }
    visitNode(resolved.fromNode, resolved.fromGraph ?? scopeGraph, index, active, visited, order);
  }

  active.delete(key);
  visited.add(key);
  order.push(node);
};

export const topologicallySortFromNode = (
  node: MaterialXNode,
  scopeGraph: MaterialXNodeGraph | undefined,
  index: GraphIndex,
): MaterialXNode[] => {
  const visited = new Set<string>();
  const active = new Set<string>();
  const order: MaterialXNode[] = [];
  visitNode(node, scopeGraph, index, active, visited, order);
  return order;
};
