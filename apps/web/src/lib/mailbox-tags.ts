export const parseMailboxTagInput = (value: string) => [
  ...new Set(
    value
      .split(/[,\s]+/)
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean),
  ),
];

export const formatMailboxTagsInput = (tags: string[]) => tags.join(" ");
