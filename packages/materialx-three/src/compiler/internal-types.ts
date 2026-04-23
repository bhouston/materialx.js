import type { MaterialXDocument, MaterialXNode, MaterialXNodeGraph } from '@material-viewer/materialx';
import type { buildGraphIndex } from '../graph/resolve.js';
import type { MaterialXThreeCompileOptions, MaterialXThreeWarning } from '../types.js';

export interface CompileContext {
  document: MaterialXDocument;
  warnings: MaterialXThreeWarning[];
  index: ReturnType<typeof buildGraphIndex>;
  options: MaterialXThreeCompileOptions;
  cache: Map<string, unknown>;
}

export interface MatrixValue {
  kind: 'matrix33' | 'matrix44';
  values: unknown[][];
}

export type NodeHandler = (
  node: MaterialXNode,
  context: CompileContext,
  scopeGraph: MaterialXNodeGraph | undefined,
  outputName: string | undefined,
) => unknown;
