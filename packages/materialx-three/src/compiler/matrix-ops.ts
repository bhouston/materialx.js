import { add, div, mat3, mat4, mul, sub, vec2, vec3, vec4 } from 'three/tsl';
import type { MatrixValue } from './internal-types.js';
import { isMatrixValue } from './value-coercion.js';

export const outputNameToChannelIndex = (outputName?: string): number => {
  if (!outputName) {
    return 0;
  }
  const normalized = outputName.toLowerCase();
  if (normalized === 'outx' || normalized === 'outr' || normalized === 'r') {
    return 0;
  }
  if (normalized === 'outy' || normalized === 'outg' || normalized === 'g') {
    return 1;
  }
  if (normalized === 'outz' || normalized === 'outb' || normalized === 'b') {
    return 2;
  }
  if (normalized === 'outw' || normalized === 'outa' || normalized === 'a') {
    return 3;
  }
  return 0;
};

export const getNodeChannel = (node: unknown, index: number): unknown => {
  const xyzwChannels = ['x', 'y', 'z', 'w'];
  const rgbaChannels = ['r', 'g', 'b', 'a'];
  const xyzwChannel = xyzwChannels[index];
  const rgbaChannel = rgbaChannels[index];
  if (!xyzwChannel) {
    return node;
  }
  const entry = node as Record<string, unknown>;
  return entry[xyzwChannel] ?? (rgbaChannel ? entry[rgbaChannel] : undefined) ?? node;
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

export const matrixValueToNode = (matrix: MatrixValue): unknown => {
  const flat = matrix.values.flat();
  if (matrix.kind === 'matrix33') {
    return mat3(
      flat[0] as never,
      flat[1] as never,
      flat[2] as never,
      flat[3] as never,
      flat[4] as never,
      flat[5] as never,
      flat[6] as never,
      flat[7] as never,
      flat[8] as never,
    );
  }
  return mat4(
    flat[0] as never,
    flat[1] as never,
    flat[2] as never,
    flat[3] as never,
    flat[4] as never,
    flat[5] as never,
    flat[6] as never,
    flat[7] as never,
    flat[8] as never,
    flat[9] as never,
    flat[10] as never,
    flat[11] as never,
    flat[12] as never,
    flat[13] as never,
    flat[14] as never,
    flat[15] as never,
  );
};

const dotRow = (row: unknown[], vector: unknown[]): unknown => {
  let sum = mul(row[0] as never, vector[0] as never);
  for (let index = 1; index < row.length; index += 1) {
    sum = add(sum as never, mul(row[index] as never, vector[index] as never) as never);
  }
  return sum;
};

const multiplyMatrixVector = (matrix: MatrixValue, vector: unknown[]): unknown[] =>
  matrix.values.map((row) => dotRow(row, vector));

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
    mul(c as never, dhMinusEg as never) as never,
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

const invertMatrix3 = (matrix: MatrixValue): MatrixValue => {
  const m = matrix.values;
  const a = m[0]?.[0] ?? 0;
  const b = m[0]?.[1] ?? 0;
  const c = m[0]?.[2] ?? 0;
  const d = m[1]?.[0] ?? 0;
  const e = m[1]?.[1] ?? 0;
  const f = m[1]?.[2] ?? 0;
  const g = m[2]?.[0] ?? 0;
  const h = m[2]?.[1] ?? 0;
  const i = m[2]?.[2] ?? 0;

  const determinant = det3(m);

  const cofactor00 = det2(e, f, h, i);
  const cofactor01 = sub(0 as never, det2(d, f, g, i) as never);
  const cofactor02 = det2(d, e, g, h);
  const cofactor10 = sub(0 as never, det2(b, c, h, i) as never);
  const cofactor11 = det2(a, c, g, i);
  const cofactor12 = sub(0 as never, det2(a, b, g, h) as never);
  const cofactor20 = det2(b, c, e, f);
  const cofactor21 = sub(0 as never, det2(a, c, d, f) as never);
  const cofactor22 = det2(a, b, d, e);

  const invDet = div(1 as never, determinant as never);
  return {
    kind: 'matrix33',
    values: [
      [
        mul(cofactor00 as never, invDet as never),
        mul(cofactor10 as never, invDet as never),
        mul(cofactor20 as never, invDet as never),
      ],
      [
        mul(cofactor01 as never, invDet as never),
        mul(cofactor11 as never, invDet as never),
        mul(cofactor21 as never, invDet as never),
      ],
      [
        mul(cofactor02 as never, invDet as never),
        mul(cofactor12 as never, invDet as never),
        mul(cofactor22 as never, invDet as never),
      ],
    ],
  };
};

const minor3 = (m: unknown[][], row: number, col: number): unknown => {
  const rows: unknown[][] = [];
  for (let r = 0; r < 4; r += 1) {
    if (r === row) continue;
    const rowVals: unknown[] = [];
    for (let c = 0; c < 4; c += 1) {
      if (c === col) continue;
      rowVals.push(m[r]?.[c] ?? 0);
    }
    rows.push(rowVals);
  }
  return det3(rows);
};

const invertMatrix4 = (matrix: MatrixValue): MatrixValue => {
  const m = matrix.values;
  const determinant = det4(m);
  const invDet = div(1 as never, determinant as never);

  const values: unknown[][] = [];
  for (let row = 0; row < 4; row += 1) {
    const resultRow: unknown[] = [];
    for (let col = 0; col < 4; col += 1) {
      const cofactor = minor3(m, col, row);
      const sign = (col + row) % 2 === 0 ? cofactor : sub(0 as never, cofactor as never);
      resultRow.push(mul(sign as never, invDet as never));
    }
    values.push(resultRow);
  }
  return { kind: 'matrix44', values };
};

export const invertMatrix = (matrix: MatrixValue): MatrixValue =>
  matrix.kind === 'matrix33' ? invertMatrix3(matrix) : invertMatrix4(matrix);

export const applyMatrixTransform = (
  inputValue: unknown,
  matrixValue: unknown,
  variant: 'vector2M3' | 'vector3' | 'vector3M4' | 'vector4',
): unknown => {
  if (variant === 'vector2M3') {
    const [x, y] = toVectorComponents(inputValue, 2, [0, 0]);
    if (isMatrixValue(matrixValue) && matrixValue.kind === 'matrix33') {
      const transformed = multiplyMatrixVector(matrixValue, [x, y, 1]);
      return makeVectorFromComponents(transformed.slice(0, 2), 2);
    }
    const transformed = mul(matrixValue as never, vec3(x as never, y as never, 1 as never) as never);
    return vec2(getNodeChannel(transformed, 0) as never, getNodeChannel(transformed, 1) as never);
  }
  if (variant === 'vector3') {
    const vector = toVectorComponents(inputValue, 3, [0, 0, 0]);
    if (isMatrixValue(matrixValue) && matrixValue.kind === 'matrix33') {
      const transformed = multiplyMatrixVector(matrixValue, vector);
      return makeVectorFromComponents(transformed, 3);
    }
    return mul(matrixValue as never, vec3(vector[0] as never, vector[1] as never, vector[2] as never) as never);
  }
  if (variant === 'vector3M4') {
    const [x, y, z] = toVectorComponents(inputValue, 3, [0, 0, 0]);
    if (isMatrixValue(matrixValue) && matrixValue.kind === 'matrix44') {
      const transformed = multiplyMatrixVector(matrixValue, [x, y, z, 1]);
      return makeVectorFromComponents(transformed.slice(0, 3), 3);
    }
    const transformed = mul(matrixValue as never, vec4(x as never, y as never, z as never, 1 as never) as never);
    return vec3(
      getNodeChannel(transformed, 0) as never,
      getNodeChannel(transformed, 1) as never,
      getNodeChannel(transformed, 2) as never,
    );
  }
  const vector = toVectorComponents(inputValue, 4, [0, 0, 0, 1]);
  if (isMatrixValue(matrixValue) && matrixValue.kind === 'matrix44') {
    const transformed = multiplyMatrixVector(matrixValue, vector);
    return makeVectorFromComponents(transformed, 4);
  }
  return mul(
    matrixValue as never,
    vec4(vector[0] as never, vector[1] as never, vector[2] as never, vector[3] as never) as never,
  );
};
