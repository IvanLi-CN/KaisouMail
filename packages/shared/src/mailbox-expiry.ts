const longTermMailboxExpiryTimestamp = Number.POSITIVE_INFINITY;

const toMailboxExpiryTimestamp = (expiresAt: string | null | undefined) => {
  if (expiresAt === null) return longTermMailboxExpiryTimestamp;
  if (expiresAt === undefined) return null;

  const timestamp = new Date(expiresAt).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
};

export const resolveMailboxExpiresAtFromMinutes = (
  expiresInMinutes: number | null | undefined,
  nowMs = Date.now(),
) => {
  if (expiresInMinutes === undefined) return undefined;
  if (expiresInMinutes === null) return null;
  return new Date(nowMs + expiresInMinutes * 60_000).toISOString();
};

export const wouldExtendMailboxExpiry = ({
  currentExpiresAt,
  requestedExpiresInMinutes,
  nowMs = Date.now(),
}: {
  currentExpiresAt: string | null | undefined;
  requestedExpiresInMinutes: number | null | undefined;
  nowMs?: number;
}) => {
  const currentTimestamp = toMailboxExpiryTimestamp(currentExpiresAt);
  const requestedExpiresAt = resolveMailboxExpiresAtFromMinutes(
    requestedExpiresInMinutes,
    nowMs,
  );
  const requestedTimestamp = toMailboxExpiryTimestamp(requestedExpiresAt);

  if (requestedTimestamp === null) return false;
  if (currentTimestamp === null) return true;
  return requestedTimestamp > currentTimestamp;
};

export const mergeMailboxExpiryByExtension = ({
  currentExpiresAt,
  requestedExpiresInMinutes,
  nowMs = Date.now(),
}: {
  currentExpiresAt: string | null | undefined;
  requestedExpiresInMinutes: number | null | undefined;
  nowMs?: number;
}) => {
  const requestedExpiresAt = resolveMailboxExpiresAtFromMinutes(
    requestedExpiresInMinutes,
    nowMs,
  );

  if (requestedExpiresAt === undefined) {
    return {
      expiresAt: currentExpiresAt,
      changed: false,
      extended: false,
      requestedExpiresAt,
    };
  }

  const currentTimestamp = toMailboxExpiryTimestamp(currentExpiresAt);
  const requestedTimestamp = toMailboxExpiryTimestamp(requestedExpiresAt);

  if (requestedTimestamp === null) {
    return {
      expiresAt: currentExpiresAt,
      changed: false,
      extended: false,
      requestedExpiresAt,
    };
  }

  if (currentTimestamp === null) {
    return {
      expiresAt: requestedExpiresAt,
      changed: true,
      extended: true,
      requestedExpiresAt,
    };
  }

  if (requestedTimestamp > currentTimestamp) {
    return {
      expiresAt: requestedExpiresAt,
      changed: requestedExpiresAt !== currentExpiresAt,
      extended: true,
      requestedExpiresAt,
    };
  }

  return {
    expiresAt: currentExpiresAt,
    changed: false,
    extended: false,
    requestedExpiresAt,
  };
};

export const didMailboxExpiryExtend = ({
  previousExpiresAt,
  nextExpiresAt,
}: {
  previousExpiresAt: string | null | undefined;
  nextExpiresAt: string | null | undefined;
}) => {
  const previousTimestamp = toMailboxExpiryTimestamp(previousExpiresAt);
  const nextTimestamp = toMailboxExpiryTimestamp(nextExpiresAt);

  if (previousTimestamp === null || nextTimestamp === null) return false;
  return nextTimestamp > previousTimestamp;
};
