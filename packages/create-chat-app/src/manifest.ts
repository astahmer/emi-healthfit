import { createHash } from "node:crypto";

import * as Schema from "effect/Schema";

export const GENERATED_MANIFEST_PATH = "emi.generated.json";

export const GeneratedManifestSchema = Schema.Struct({
  manifestVersion: Schema.Literal(1),
  generator: Schema.Literal("@emi/create-chat-app"),
  application: Schema.Struct({ name: Schema.String, slug: Schema.String }),
  distributionMode: Schema.Literals(["dependency", "owned"]),
  coreVersion: Schema.String,
  manifestPath: Schema.Literal(GENERATED_MANIFEST_PATH),
  managedFiles: Schema.Array(Schema.Struct({ path: Schema.String, sha256: Schema.String })),
});

export type GeneratedManifest = typeof GeneratedManifestSchema.Type;

export const hashGeneratedFileContents = (contents: string): string =>
  createHash("sha256").update(contents).digest("hex");

export const serializeGeneratedManifest = (manifest: GeneratedManifest): string =>
  `${JSON.stringify(
    {
      ...manifest,
      managedFiles: manifest.managedFiles.toSorted((left, right) =>
        left.path.localeCompare(right.path),
      ),
    },
    null,
    2,
  )}\n`;

export const decodeGeneratedManifest = (contents: string): GeneratedManifest => {
  try {
    return Schema.decodeUnknownSync(Schema.fromJsonString(GeneratedManifestSchema))(contents);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Invalid ${GENERATED_MANIFEST_PATH}: ${message}`, { cause });
  }
};
