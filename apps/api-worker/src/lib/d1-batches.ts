export const D1_IN_QUERY_BATCH_SIZE = 50;

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
