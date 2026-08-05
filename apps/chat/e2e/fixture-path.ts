import { existsSync } from "node:fs";
import { join } from "node:path";

export const fixturePath = (name: string): string => {
  const fromChatRoot = join(process.cwd(), "e2e/features-worker/fixtures", name);
  if (existsSync(fromChatRoot)) return fromChatRoot;
  return join(process.cwd(), "apps/chat/e2e/features-worker/fixtures", name);
};
