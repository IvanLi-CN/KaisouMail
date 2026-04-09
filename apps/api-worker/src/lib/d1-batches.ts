export const D1_IN_QUERY_BATCH_SIZE = 50;
export const D1_MAX_BOUND_PARAMETERS = 100;

export const chunkD1InValues = <T>(
  values: T[],
  chunkSize = D1_IN_QUERY_BATCH_SIZE,
) => {
  if (values.length === 0) return [] as T[][];

  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
};

export const resolveD1InsertChunkSize = <T extends Record<string, unknown>>(
  values: T[],
) => {
  if (values.length === 0) return 1;
  const maxColumnsPerRow = values.reduce(
    (currentMax, row) => Math.max(currentMax, Object.keys(row).length),
    0,
  );

  return Math.max(
    1,
    Math.floor(D1_MAX_BOUND_PARAMETERS / Math.max(maxColumnsPerRow, 1)),
  );
};

export const chunkD1InsertValues = <T extends Record<string, unknown>>(
  values: T[],
) => chunkD1InValues(values, resolveD1InsertChunkSize(values));
