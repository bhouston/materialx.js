import { float, vec2, vec3, vec4 } from 'three/tsl';
import { parseFloatValue, parseVector2Value, parseVector3Value, parseVector4Value } from '../runtime/value-parsing.js';
import type { MatrixValue } from './internal-types.js';

export const isMatrixValue = (value: unknown): value is MatrixValue => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const matrix = value as Partial<MatrixValue>;
  return (matrix.kind === 'matrix33' || matrix.kind === 'matrix44') && Array.isArray(matrix.values);
};

const parseMatrixEntries = (value: string | undefined, expectedCount: number): number[] | undefined => {
  if (!value) {
    return undefined;
  }
  const entries = value
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry));
  if (entries.length !== expectedCount) {
    return undefined;
  }
  return entries;
};

export const matrixFromEntries = (kind: 'matrix33' | 'matrix44', entries: number[]): MatrixValue => {
  const size = kind === 'matrix33' ? 3 : 4;
  const values: unknown[][] = [];
  for (let row = 0; row < size; row += 1) {
    values.push(entries.slice(row * size, (row + 1) * size));
  }
  return { kind, values };
};

export const matrixIdentity = (kind: 'matrix33' | 'matrix44'): MatrixValue => {
  const size = kind === 'matrix33' ? 3 : 4;
  const values: unknown[][] = [];
  for (let row = 0; row < size; row += 1) {
    const rowValues: unknown[] = [];
    for (let column = 0; column < size; column += 1) {
      rowValues.push(row === column ? 1 : 0);
    }
    values.push(rowValues);
  }
  return { kind, values };
};

export const asMatrixValue = (value: unknown, kind: 'matrix33' | 'matrix44'): MatrixValue => {
  if (isMatrixValue(value) && value.kind === kind) {
    return value;
  }
  return matrixIdentity(kind);
};

export const toNodeValue = (value: unknown, typeHint?: string): unknown => {
  if (isMatrixValue(value)) {
    return value;
  }
  if (typeof value === 'number') {
    return float(value);
  }
  if (typeof value === 'boolean') {
    return float(value ? 1 : 0);
  }
  if (Array.isArray(value)) {
    if (typeHint === 'matrix33' && value.length === 9) {
      const entries = value.map((entry) => (typeof entry === 'number' ? entry : Number(entry)));
      if (entries.every((entry) => Number.isFinite(entry))) {
        return matrixFromEntries('matrix33', entries as number[]);
      }
    }
    if (typeHint === 'matrix44' && value.length === 16) {
      const entries = value.map((entry) => (typeof entry === 'number' ? entry : Number(entry)));
      if (entries.every((entry) => Number.isFinite(entry))) {
        return matrixFromEntries('matrix44', entries as number[]);
      }
    }
    if (value.length === 2) {
      return vec2(value[0] ?? 0, value[1] ?? 0);
    }
    if (value.length === 3) {
      return vec3(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0);
    }
    if (value.length >= 4) {
      return vec4(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0, value[3] ?? 1);
    }
  }
  if (typeof value === 'string') {
    if (typeHint === 'boolean') {
      const normalized = value.trim().toLowerCase();
      return float(normalized === 'true' || normalized === '1' ? 1 : 0);
    }
    if (typeHint === 'matrix33') {
      const entries = parseMatrixEntries(value, 9);
      return entries ? matrixFromEntries('matrix33', entries) : matrixIdentity('matrix33');
    }
    if (typeHint === 'matrix44') {
      const entries = parseMatrixEntries(value, 16);
      return entries ? matrixFromEntries('matrix44', entries) : matrixIdentity('matrix44');
    }
    if (typeHint === 'color3' || typeHint === 'vector3') {
      const [x, y, z] = parseVector3Value(value, [0, 0, 0]);
      return vec3(x, y, z);
    }
    if (typeHint === 'color4' || typeHint === 'vector4') {
      const [x, y, z, w] = parseVector4Value(value, [0, 0, 0, 1]);
      return vec4(x, y, z, w);
    }
    if (typeHint === 'vector2') {
      const [x, y] = parseVector2Value(value, [0, 0]);
      return vec2(x, y);
    }
    return float(parseFloatValue(value, 0));
  }
  return value;
};
