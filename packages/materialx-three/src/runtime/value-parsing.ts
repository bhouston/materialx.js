export const parseNumber = (value: string | undefined, fallback = 0): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseList = (value: string | undefined): number[] =>
  (value ?? '')
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry));

export const parseFloatValue = (value: string | undefined, fallback = 0): number => parseNumber(value, fallback);

export const parseVector2Value = (value: string | undefined, fallback: [number, number] = [0, 0]): [number, number] => {
  const parsed = parseList(value);
  return [parsed[0] ?? fallback[0], parsed[1] ?? fallback[1]];
};

export const parseVector3Value = (
  value: string | undefined,
  fallback: [number, number, number] = [0, 0, 0]
): [number, number, number] => {
  const parsed = parseList(value);
  return [parsed[0] ?? fallback[0], parsed[1] ?? fallback[1], parsed[2] ?? fallback[2]];
};

export const parseVector4Value = (
  value: string | undefined,
  fallback: [number, number, number, number] = [0, 0, 0, 1]
): [number, number, number, number] => {
  const parsed = parseList(value);
  return [parsed[0] ?? fallback[0], parsed[1] ?? fallback[1], parsed[2] ?? fallback[2], parsed[3] ?? fallback[3]];
};
