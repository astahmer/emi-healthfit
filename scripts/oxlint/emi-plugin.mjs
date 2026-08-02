const normalizePath = (path) => path.replaceAll("\\", "/");

const isCoreSource = (filename) => normalizePath(filename).includes("/packages/core/src/");

const isGenericContract = (filename) => {
  const normalizedFilename = normalizePath(filename);
  return (
    normalizedFilename.includes("/packages/core/src/protocol/") ||
    normalizedFilename.includes("/packages/core/src/contract/") ||
    normalizedFilename.includes("/packages/core/src/server/ports/") ||
    normalizedFilename.includes("/packages/core/src/server/use-cases/") ||
    normalizedFilename.endsWith("/packages/core/src/server.export.ts") ||
    normalizedFilename.endsWith("/packages/core/src/server-effect.export.ts") ||
    normalizedFilename.endsWith("/packages/core/src/server-fetch.export.ts")
  );
};

const isEffectDomain = (filename) => {
  const normalizedFilename = normalizePath(filename);
  return (
    normalizedFilename.includes("/packages/core/src/server/ports/") ||
    normalizedFilename.includes("/packages/core/src/server/use-cases/")
  );
};

const forbiddenPlatformImports =
  /^(?:ai|drizzle-orm|kysely|kysely-d1|@cloudflare\/workers-types)$|^@ai-sdk\//;

const memberName = (node) => {
  if (node.computed) return undefined;
  if (node.property?.type === "Identifier") return node.property.name;
  return undefined;
};

const isEffectExecution = (node) => {
  if (node.callee?.type !== "MemberExpression") return false;
  if (node.callee.object?.type !== "Identifier" || node.callee.object.name !== "Effect")
    return false;
  return new Set(["runPromise", "runPromiseExit", "runSync", "runSyncExit"]).has(
    memberName(node.callee),
  );
};

const plugin = {
  meta: {
    name: "emi",
  },
  rules: {
    "no-abstract-domain-class": {
      create(context) {
        return {
          ClassDeclaration(node) {
            if (!isCoreSource(context.getFilename())) return;
            const source = context.sourceCode.getText(node);
            if (!/\babstract\s+class\b/.test(source)) return;
            context.report({
              node,
              message:
                "Generic core domain owners must be ordinary named classes; use an Effect Context.Service for dependency contracts, never an abstract class.",
            });
          },
        };
      },
    },
    "no-empty-private-constructor": {
      create(context) {
        return {
          MethodDefinition(node) {
            if (!isCoreSource(context.getFilename())) return;
            if (node.kind !== "constructor") return;
            const source = context.sourceCode.getText(node);
            if (!/\bprivate\s+constructor\s*\(\s*\)\s*\{\s*\}/s.test(source)) return;
            context.report({
              node,
              message:
                "Static-only domain classes do not need an empty private constructor; dependency-bearing services belong in Context.Service and Layer.",
            });
          },
        };
      },
    },
    "no-generic-platform-import": {
      create(context) {
        return {
          ImportDeclaration(node) {
            if (!isGenericContract(context.getFilename())) return;
            const source = node.source?.value;
            if (typeof source !== "string" || !forbiddenPlatformImports.test(source)) return;
            context.report({
              node,
              message:
                "Generic protocol and server contracts cannot import raw database, platform, or AI SDK types; keep them in an adapter or explicit advanced boundary.",
            });
          },
        };
      },
    },
    "no-domain-effect-run": {
      create(context) {
        return {
          CallExpression(node) {
            if (!isEffectDomain(context.getFilename()) || !isEffectExecution(node)) return;
            context.report({
              node,
              message:
                "Generic ports and use cases must preserve Effect programs; run them only at an HTTP, browser, or platform edge.",
            });
          },
        };
      },
    },
    "no-export-forwarding": {
      create(context) {
        return {
          ExportNamedDeclaration(node) {
            if (!isCoreSource(context.getFilename()) || node.source === null) return;
            context.report({
              node,
              message:
                "Core modules must own their explicit bindings; do not forward exports from another implementation file.",
            });
          },
          ExportAllDeclaration(node) {
            if (!isCoreSource(context.getFilename())) return;
            context.report({
              node,
              message:
                "Core public boundaries must enumerate exports explicitly; wildcard forwarding hides the contract.",
            });
          },
        };
      },
    },
  },
};

export default plugin;
