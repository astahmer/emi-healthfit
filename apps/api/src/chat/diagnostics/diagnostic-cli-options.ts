import * as Schema from "effect/Schema";

const DiagnosticOptions = Schema.Struct({
  url: Schema.String.check(Schema.isMinLength(1)),
  env: Schema.String.check(Schema.isMinLength(1)),
  envFile: Schema.optional(Schema.String.check(Schema.isMinLength(1))),
  output: Schema.optional(Schema.String.check(Schema.isMinLength(1))),
  includeSensitive: Schema.optional(Schema.Boolean),
});

export const parseDiagnosticOptions = ({ arguments_ }: { arguments_: string[] }) => {
  const values: Record<string, string | boolean> = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--include-sensitive") {
      values.includeSensitive = true;
      continue;
    }
    const value = arguments_[index + 1];
    if (argument === "--url") values.url = value ?? "";
    if (argument === "--env") values.env = value ?? "";
    if (argument === "--env-file") values.envFile = value ?? "";
    if (argument === "--output") values.output = value ?? "";
    if (
      argument === "--url" ||
      argument === "--env" ||
      argument === "--env-file" ||
      argument === "--output"
    ) {
      index += 1;
    }
  }
  const options = Schema.decodeUnknownSync(DiagnosticOptions)(values);
  return {
    ...options,
    output: options.output ?? ".diagnostics",
    includeSensitive: options.includeSensitive ?? false,
  };
};
