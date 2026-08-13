const tokenPattern = /[\p{L}\p{N}]+/gu;

export const maxSearchTokens = 16;

export const tokenize = (text: string): ReadonlyArray<string> =>
  (text.toLocaleLowerCase().match(tokenPattern) ?? []).filter((token) => token.length >= 2);

const matchStrength = ({
  content,
  contentTokens,
  token,
}: {
  readonly content: string;
  readonly contentTokens: ReadonlyArray<string>;
  readonly token: string;
}): number => {
  if (contentTokens.includes(token)) return 3;
  if (contentTokens.some((candidate) => candidate.startsWith(token))) return 2;
  if (content.includes(token)) return 1;
  return 0;
};

export const scoreMemorySearch = ({
  query,
  content,
}: {
  readonly query: string;
  readonly content: string;
}): number => {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return 0;
  const normalizedContent = content.toLocaleLowerCase();
  const contentTokens = tokenize(content);
  let matched = 0;
  let score = 0;
  for (const token of queryTokens) {
    const strength = matchStrength({ content: normalizedContent, contentTokens, token });
    if (strength > 0) matched += 1;
    score += strength;
  }
  if (matched === 0) return 0;
  const coverage = matched / queryTokens.length;
  const phraseBonus =
    queryTokens.length >= 2 && normalizedContent.includes(queryTokens.join(" ")) ? 2 : 0;
  return score * (0.5 + 0.5 * coverage) + phraseBonus;
};
