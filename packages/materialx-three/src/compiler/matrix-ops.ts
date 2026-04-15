import { add, mul, sub, vec2, vec3, vec4 } from 'three/tsl';
import type { MatrixValue } from './internal-types.js';
import { asMatrixValue } from './value-coercion.js';

export const outputNameToChannelIndex = (outputName?: string): number => {
  if (!outputName) {
    return 0;
  }
  const normalized = outputName.toLowerCase();
  if (normalized.endsWith('x') || normalized.endsWith('r')) {
    return 0;
  }
  if (normalized.endsWith('y') || normalized.endsWith('g')) {
    return 1;
  }
  if (normalized.endsWith('z') || normalized.endsWith('b')) {
    return 2;
  }
  if (normalized.endsWith('w') || normalized.endsWith('a')) {
    return 3;
  }
  return 0;
};

export const getNodeChannel = (node: unknown, index: number): unknown => {
  const channels = ['x', 'y', 'z', 'w'];
  const channel = channels[index];
  if (!channel) {
    return node;
  }
  const entry = node as Record<string, unknown>;
  return entry[channel] ?? node;
};

export const toVectorComponents = (value: unknown, size: number, fallback: number[]): unknown[] => {
  if (Array.isArray(value)) {
    const result: unknown[] = [];
    for (let index = 0; index < size; index += 1) {
      result.push(value[index] ?? fallback[index] ?? 0);
    }
    return result;
  }
  const result: unknown[] = [];
  for (let index = 0; index < size; index += 1) {
    result.push(getNodeChannel(value, index) ?? fallback[index] ?? 0);
  }
  return result;
};

export const makeVectorFromComponents = (components: unknown[], size: 2 | 3 | 4): unknown => {
  if (size === 2) {
    return vec2(components[0] as never, components[1] as never);
  }
  if (size === 3) {
    return vec3(components[0] as never, components[1] as never, components[2] as never);
  }
  return vec4(components[0] as never, components[1] as never, components[2] as never, components[3] as never);
};

const dotRow = (row: unknown[], vector: unknown[]): unknown => {
  let sum = mul(row[0] as never, vector[0] as never);
  for (let index = 1; index < row.length; index += 1) {
    sum = add(sum as never, mul(row[index] as never, vector[index] as never) as never);
  }
  return sum;
};

const multiplyMatrixVector = (matrix: MatrixValue, vector: unknown[]): unknown[] => matrix.values.map((row) => dotRow(row, vector));

export const transposeMatrix = (matrix: MatrixValue): MatrixValue => {
  const size = matrix.kind === 'matrix33' ? 3 : 4;
  const values: unknown[][] = [];
  for (let row = 0; row < size; row += 1) {
    const transposedRow: unknown[] = [];
    for (let column = 0; column < size; column += 1) {
      transposedRow.push(matrix.values[column]?.[row] ?? 0);
    }
    values.push(transposedRow);
  }
  return {
    kind: matrix.kind,
    values,
  };
};

const det2 = (a: unknown, b: unknown, c: unknown, d: unknown): unknown =>
  sub(mul(a as never, d as never) as never, mul(b as never, c as never) as never);

export const det3 = (matrix: unknown[][]): unknown => {
  const a = matrix[0]?.[0] ?? 0;
  const b = matrix[0]?.[1] ?? 0;
  const c = matrix[0]?.[2] ?? 0;
  const d = matrix[1]?.[0] ?? 0;
  const e = matrix[1]?.[1] ?? 0;
  const f = matrix[1]?.[2] ?? 0;
  const g = matrix[2]?.[0] ?? 0;
  const h = matrix[2]?.[1] ?? 0;
  const i = matrix[2]?.[2] ?? 0;

  const eiMinusFh = det2(e, f, h, i);
  const diMinusFg = det2(d, f, g, i);
  const dhMinusEg = det2(d, e, g, h);

  return add(
    sub(mul(a as never, eiMinusFh as never) as never, mul(b as never, diMinusFg as never) as never) as never,
    mul(c as never, dhMinusEg as never) as never
  );
};

export const det4 = (matrix: unknown[][]): unknown => {
  const m00 = matrix[0]?.[0] ?? 0;
  const m01 = matrix[0]?.[1] ?? 0;
  const m02 = matrix[0]?.[2] ?? 0;
  const m03 = matrix[0]?.[3] ?? 0;
  const minor0 = det3([
    [matrix[1]?.[1] ?? 0, matrix[1]?.[2] ?? 0, matrix[1]?.[3] ?? 0],
    [matrix[2]?.[1] ?? 0, matrix[2]?.[2] ?? 0, matrix[2]?.[3] ?? 0],
    [matrix[3]?.[1] ?? 0, matrix[3]?.[2] ?? 0, matrix[3]?.[3] ?? 0],
  ]);
  const minor1 = det3([
    [matrix[1]?.[0] ?? 0, matrix[1]?.[2] ?? 0, matrix[1]?.[3] ?? 0],
    [matrix[2]?.[0] ?? 0, matrix[2]?.[2] ?? 0, matrix[2]?.[3] ?? 0],
    [matrix[3]?.[0] ?? 0, matrix[3]?.[2] ?? 0, matrix[3]?.[3] ?? 0],
  ]);
  const minor2 = det3([
    [matrix[1]?.[0] ?? 0, matrix[1]?.[1] ?? 0, matrix[1]?.[3] ?? 0],
    [matrix[2]?.[0] ?? 0, matrix[2]?.[1] ?? 0, matrix[2]?.[3] ?? 0],
    [matrix[3]?.[0] ?? 0, matrix[3]?.[1] ?? 0, matrix[3]?.[3] ?? 0],
  ]);
  const minor3 = det3([
    [matrix[1]?.[0] ?? 0, matrix[1]?.[1] ?? 0, matrix[1]?.[2] ?? 0],
    [matrix[2]?.[0] ?? 0, matrix[2]?.[1] ?? 0, matrix[2]?.[2] ?? 0],
    [matrix[3]?.[0] ?? 0, matrix[3]?.[1] ?? 0, matrix[3]?.[2] ?? 0],
  ]);

  const term0 = mul(m00 as never, minor0 as never);
  const term1 = mul(m01 as never, minor1 as never);
  const term2 = mul(m02 as never, minor2 as never);
  const term3 = mul(m03 as never, minor3 as never);
  return sub(add(sub(term0 as never, term1 as never) as never, term2 as never) as never, term3 as never);
};

export const applyMatrixTransform = (
  inputValue: unknown,
  matrixValue: unknown,
  variant: 'vector2M3' | 'vector3' | 'vector3M4' | 'vector4'
): unknown => {
  if (variant === 'vector2M3') {
    const matrix = asMatrixValue(matrixValue, 'matrix33');
    const [x, y] = toVectorComponents(inputValue, 2, [0, 0]);
    const transformed = multiplyMatrixVector(matrix, [x, y, 1]);
    return makeVectorFromComponents(transformed.slice(0, 2), 2);
  }
  if (variant === 'vector3') {
    const matrix = asMatrixValue(matrixValue, 'matrix33');
    const vector = toVectorComponents(inputValue, 3, [0, 0, 0]);
    const transformed = multiplyMatrixVector(matrix, vector);
    return makeVectorFromComponents(transformed, 3);
  }
  if (variant === 'vector3M4') {
    const matrix = asMatrixValue(matrixValue, 'matrix44');
    const [x, y, z] = toVectorComponents(inputValue, 3, [0, 0, 0]);
    const transformed = multiplyMatrixVector(matrix, [x, y, z, 1]);
    return makeVectorFromComponents(transformed.slice(0, 3), 3);
  }
  const matrix = asMatrixValue(matrixValue, 'matrix44');
  const vector = toVectorComponents(inputValue, 4, [0, 0, 0, 1]);
  const transformed = multiplyMatrixVector(matrix, vector);
  return makeVectorFromComponents(transformed, 4);
};
