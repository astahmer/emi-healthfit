import { mkdir, readdir, writeFile } from "node:fs/promises";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as Schema from "effect/Schema";

import {
  GENERATED_MANIFEST_PATH,
  hashGeneratedFileContents,
  serializeGeneratedManifest,
} from "./manifest.ts";
import { toSlug } from "./slug.ts";
import * as templates from "./templates.ts";
import type { TemplateContext } from "./templates.ts";

export const DEFAULT_CORE_VERSION = "workspace:*";
export const DEFAULT_DISTRIBUTION_MODE = "owned";

export type DistributionMode = "dependency" | "owned";

export interface BuildFilesOptions {
  appName: string;
  coreVersion?: string;
  distributionMode?: DistributionMode;
}

export interface GenerateAppOptions extends BuildFilesOptions {
  targetDir: string;
  dryRun?: boolean;
  force?: boolean;
}

export interface GeneratedFile {
  path: string;
  contents: string;
}

export interface GenerateAppResult {
  files: GeneratedFile[];
  context: TemplateContext;
}

const toContext = (options: BuildFilesOptions): TemplateContext => ({
  appName: options.appName,
  slug: toSlug(options.appName),
  coreVersion: options.coreVersion ?? DEFAULT_CORE_VERSION,
  distributionMode: options.distributionMode ?? DEFAULT_DISTRIBUTION_MODE,
});

const genericSourceFile = (path: string): string =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const JsonRecord = Schema.Record(Schema.String, Schema.Json);

const decodePackageJson = (path: string) =>
  Schema.decodeUnknownSync(Schema.fromJsonString(JsonRecord))(genericSourceFile(path));

const decodeRecord = (value: unknown) => Schema.decodeUnknownSync(JsonRecord)(value);

const PublicApi = Schema.Struct({
  version: Schema.String,
  entrypointPaths: Schema.Record(Schema.String, Schema.String),
});

const coreSourcePackageJson = (): string => {
  const packageJson = decodePackageJson("packages/core/package.json");
  const emi = decodeRecord(packageJson.emi);
  const publicApi = Schema.decodeUnknownSync(PublicApi)(emi.publicApi);
  const sourcePaths = publicApi.entrypointPaths;
  const exports = decodeRecord(packageJson.exports);
  const targetExports = Object.fromEntries(
    Object.keys(exports).map((entrypoint) => {
      const sourcePath = sourcePaths[entrypoint];
      return [entrypoint, sourcePath ?? exports[entrypoint]];
    }),
  );
  return `${JSON.stringify(
    {
      ...packageJson,
      private: true,
      files: ["src", "test", "PUBLISH.md", "source-manifest.json"],
      exports: targetExports,
      emi: {
        ...emi,
        sourceDistribution: {
          manifest: "./source-manifest.json",
          provenance: `@emi/core source catalog ${publicApi.version}`,
          generatedFrom: "./package.json > emi.publicApi",
        },
      },
    },
    null,
    2,
  )}\n`;
};

const generatedWorkspaceLockfile = (): string =>
  readFileSync(new URL("./generated-workspace-pnpm-lock.yaml", import.meta.url), "utf8");

const corePackageFiles = ({
  sourcePath,
  targetPath,
}: {
  sourcePath: string;
  targetPath: string;
}): GeneratedFile[] =>
  readdirSync(new URL(`../../../${sourcePath}`, import.meta.url), { withFileTypes: true }).flatMap(
    (entry) => {
      const nextSourcePath = `${sourcePath}/${entry.name}`;
      const nextTargetPath = `${targetPath}/${entry.name}`;
      if (entry.isDirectory())
        return corePackageFiles({ sourcePath: nextSourcePath, targetPath: nextTargetPath });
      return [{ path: nextTargetPath, contents: genericSourceFile(nextSourcePath) }];
    },
  );

const generatedManifest = ({
  context,
  files,
}: {
  context: TemplateContext;
  files: GeneratedFile[];
}): string =>
  serializeGeneratedManifest({
    manifestVersion: 1,
    generator: "@emi/create-chat-app",
    application: { name: context.appName, slug: context.slug },
    distributionMode: context.distributionMode,
    coreVersion: context.coreVersion,
    manifestPath: GENERATED_MANIFEST_PATH,
    managedFiles: files.map((file) => ({
      path: file.path,
      sha256: hashGeneratedFileContents(file.contents),
    })),
  });

const genericWebDirectoryFiles = ({
  sourcePath,
  targetPath,
}: {
  sourcePath: string;
  targetPath: string;
}): GeneratedFile[] =>
  readdirSync(new URL(`../../../${sourcePath}`, import.meta.url), { withFileTypes: true }).flatMap(
    (entry) => {
      const nextSourcePath = `${sourcePath}/${entry.name}`;
      const nextTargetPath = `${targetPath}/${entry.name}`;
      if (entry.isDirectory())
        return genericWebDirectoryFiles({ sourcePath: nextSourcePath, targetPath: nextTargetPath });
      return [{ path: nextTargetPath, contents: genericSourceFile(nextSourcePath) }];
    },
  );

/**
 * Builds a generated app from the canonical generic fixtures. Only the small
 * app configuration and package metadata are rendered here; chat behavior is
 * copied verbatim from the fixture source.
 */
export const buildGeneratedFiles = (options: BuildFilesOptions): GeneratedFile[] => {
  const context = toContext(options);
  const ownedCoreFiles =
    context.distributionMode === "owned"
      ? [
          { path: "package.json", contents: templates.workspacePackageJson(context) },
          { path: "pnpm-workspace.yaml", contents: templates.workspaceConfig() },
          { path: "pnpm-lock.yaml", contents: generatedWorkspaceLockfile() },
          { path: ".oxfmtrc.json", contents: templates.workspaceFormatConfig() },
          { path: "core/package.json", contents: coreSourcePackageJson() },
          {
            path: "core/source-manifest.json",
            contents: genericSourceFile("packages/core/source-manifest.json"),
          },
          {
            path: "core/tsconfig.json",
            contents: genericSourceFile("packages/core/tsconfig.json"),
          },
          ...corePackageFiles({ sourcePath: "packages/core/src", targetPath: "core/src" }),
          ...corePackageFiles({ sourcePath: "packages/core/test", targetPath: "core/test" }),
        ]
      : [];
  const files = [
    ...ownedCoreFiles,
    { path: "README.md", contents: templates.readme(context) },
    { path: ".env.example", contents: templates.envExample() },
    { path: ".gitignore", contents: templates.gitignore() },
    { path: "web/package.json", contents: templates.webPackageJson(context) },
    { path: "web/index.html", contents: templates.webIndexHtml(context) },
    { path: "web/public/manifest.webmanifest", contents: templates.webManifest(context) },
    {
      path: "web/public/service-worker.js",
      contents: genericSourceFile("apps/generic-web/public/service-worker.js"),
    },
    {
      path: "web/public/icon.svg",
      contents: genericSourceFile("apps/generic-web/public/icon.svg"),
    },
    {
      path: "web/vite-env.d.ts",
      contents: genericSourceFile("apps/generic-web/vite-env.d.ts"),
    },
    { path: "web/vite.config.ts", contents: genericSourceFile("apps/generic-web/vite.config.ts") },
    {
      path: "web/postcss.config.mjs",
      contents: genericSourceFile("apps/generic-web/postcss.config.mjs"),
    },
    {
      path: "web/playwright.config.ts",
      contents: genericSourceFile("apps/generic-web/playwright.config.ts"),
    },
    {
      path: "web/vitest.integration.config.ts",
      contents: genericSourceFile("apps/generic-web/vitest.integration.config.ts"),
    },
    { path: "web/tsconfig.json", contents: genericSourceFile("apps/generic-web/tsconfig.json") },
    { path: "web/src/app-config.ts", contents: templates.webAppConfig(context) },
    { path: "web/src/app.css", contents: genericSourceFile("apps/generic-web/src/app.css") },
    { path: "web/src/app.tsx", contents: genericSourceFile("apps/generic-web/src/app.tsx") },
    { path: "web/src/main.tsx", contents: genericSourceFile("apps/generic-web/src/main.tsx") },
    {
      path: "web/test/api.integration.test.ts",
      contents: genericSourceFile("apps/generic-web/test/api.integration.test.ts"),
    },
    ...genericWebDirectoryFiles({
      sourcePath: "apps/generic-web/test/e2e",
      targetPath: "web/test/e2e",
    }),
    { path: "worker/package.json", contents: templates.workerPackageJson(context) },
    {
      path: "worker/alchemy.run.ts",
      contents: genericSourceFile("apps/generic-worker/alchemy.run.ts"),
    },
    {
      path: "worker/drizzle.config.ts",
      contents: genericSourceFile("apps/generic-worker/drizzle.config.ts"),
    },
    {
      path: "worker/tsconfig.json",
      contents: genericSourceFile("apps/generic-worker/tsconfig.json"),
    },
    { path: "worker/src/app-config.ts", contents: templates.workerAppConfig(context) },
    {
      path: "worker/src/db/schema.ts",
      contents: genericSourceFile("apps/generic-worker/src/db/schema.ts"),
    },
    {
      path: "worker/src/generic.worker.ts",
      contents: genericSourceFile("apps/generic-worker/src/generic.worker.ts"),
    },
    { path: "worker/migrations/.gitkeep", contents: "" },
  ];
  return [
    ...files,
    { path: GENERATED_MANIFEST_PATH, contents: generatedManifest({ context, files }) },
  ];
};

const assertTargetIsWritable = async (targetDir: string, force: boolean): Promise<void> => {
  if (!existsSync(targetDir)) return;
  const existing = await readdir(targetDir);
  if (existing.length > 0 && !force) {
    throw new Error(`Target directory "${targetDir}" is not empty. Pass force to overwrite.`);
  }
};

/**
 * Writes either an owned source workspace or thin dependency composition roots.
 */
export const generateApp = async (options: GenerateAppOptions): Promise<GenerateAppResult> => {
  const context = toContext(options);
  const files = buildGeneratedFiles(options);
  if (options.dryRun === true) return { files, context };

  await assertTargetIsWritable(options.targetDir, options.force === true);
  await Promise.all(
    files.map(async (file) => {
      const fullPath = join(options.targetDir, ...file.path.split("/"));
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, file.contents);
    }),
  );
  return { files, context };
};
