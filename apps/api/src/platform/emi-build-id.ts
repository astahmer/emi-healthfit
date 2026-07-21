export const resolveEmiBuildId = ({
  stage,
  env = process.env,
}: {
  stage: string;
  env?: Record<string, string | undefined>;
}): string => {
  const explicit = env.EMI_BUILD_ID?.trim();
  if (explicit) return explicit;

  const cloudflarePages = env.CF_PAGES_COMMIT_SHA?.trim();
  if (cloudflarePages) return cloudflarePages.slice(0, 7);

  const github = env.GITHUB_SHA?.trim();
  if (github) return github.slice(0, 7);

  return stage;
};
