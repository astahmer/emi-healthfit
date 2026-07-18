import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  diagnosticBundleSchema,
  redactDiagnosticBundle,
  type DiagnosticBundle,
} from "../src/diagnostics/bundle.ts";
import { analyzeDiagnosticBundle, renderDiagnosticMarkdown } from "../src/diagnostics/analyzer.ts";
import { decodeJson } from "../src/json-codec.ts";

const Options = Schema.Struct({
  url: Schema.String.check(Schema.isMinLength(1)),
  env: Schema.String.check(Schema.isMinLength(1)),
  envFile: Schema.optional(Schema.String.check(Schema.isMinLength(1))),
  output: Schema.optional(Schema.String.check(Schema.isMinLength(1))),
  includeSensitive: Schema.optional(Schema.Boolean),
});
const WranglerError = Schema.Struct({ stderr: Schema.optional(Schema.Unknown) });
const QueryCommands = Schema.Array(
  Schema.Struct({
    results: Schema.optional(Schema.Array(Schema.Record(Schema.String, Schema.Unknown))),
  }),
);
const Databases = Schema.Array(Schema.Struct({ name: Schema.String }));

const parseOptions = () => {
  const values: Record<string, string | boolean> = {};
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument === "--include-sensitive") {
      values.includeSensitive = true;
      continue;
    }
    if (
      argument !== "--url" &&
      argument !== "--env" &&
      argument !== "--env-file" &&
      argument !== "--output"
    )
      continue;
    const value = process.argv[index + 1];
    if (value === undefined) throw new Error(`${argument} requires a value.`);
    values[argument.slice(2)] = value;
    index += 1;
  }
  const options = Schema.decodeUnknownSync(Options)(values);
  return {
    ...options,
    output: options.output ?? ".diagnostics",
    includeSensitive: options.includeSensitive ?? false,
  };
};

const workspaceRoot = resolve(import.meta.dirname, "../../..");

const loadEnvironment = ({ env, envFile }: { env: string; envFile?: string }) => {
  const environmentPath = resolve(workspaceRoot, envFile ?? `.env.${env}`);
  if (envFile === undefined && !existsSync(environmentPath)) return;
  loadEnvFile(environmentPath);
};

const conversationIdFrom = (value: string): string => {
  const url = URL.canParse(value) ? new URL(value) : null;
  const pathname = url?.pathname ?? value;
  const chatId = pathname.match(/\/chat\/([^/]+)/)?.[1];
  const candidate =
    chatId === undefined ? pathname.split("/").findLast((segment) => segment !== "") : chatId;
  if (candidate === undefined || candidate === "")
    throw new Error("Could not extract conversation id.");
  return decodeURIComponent(candidate);
};

const wrangler = (arguments_: string[]): unknown => {
  try {
    const output = execFileSync(
      "pnpm",
      ["--filter", "@emi/api", "exec", "wrangler", ...arguments_],
      {
        cwd: workspaceRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    return decodeJson(output);
  } catch (error) {
    const parsed = Schema.decodeUnknownOption(WranglerError)(error);
    const stderr = Option.isSome(parsed) ? String(parsed.value.stderr ?? error) : String(error);
    throw new Error(
      `Wrangler D1 access failed. Verify the requested environment and its credentials, or run 'pnpm --filter @emi/api exec wrangler login'. ${stderr.trim()}`,
      { cause: error },
    );
  }
};

const resultRows = (value: unknown): Record<string, unknown>[] => {
  const commands = Schema.decodeUnknownSync(QueryCommands)(value);
  return commands.flatMap((command) => command.results ?? []);
};

const selectDatabase = (environment: string): string => {
  const databases = Schema.decodeUnknownSync(Databases)(wrangler(["d1", "list", "--json"]));
  const candidates = databases.filter((database) => /gymdata/i.test(database.name));
  const selected =
    candidates.find((database) => database.name === "GymData") ??
    candidates.find((database) => database.name.toLowerCase().includes(environment.toLowerCase()));
  if (selected === undefined) {
    throw new Error(`No GymData D1 database found for environment '${environment}'.`);
  }
  return selected.name;
};

const escapeSql = (value: string): string => value.replaceAll("'", "''");

const query = ({ database, sql }: { database: string; sql: string }): Record<string, unknown>[] =>
  resultRows(
    wrangler(["d1", "execute", database, "--remote", "--command", sql, "--json", "--yes"]),
  );

const tableColumns = ({ database, table }: { database: string; table: string }): Set<string> =>
  new Set(
    query({ database, sql: `PRAGMA table_info('${table}')` })
      .map((column) => column.name)
      .filter((name): name is string => typeof name === "string"),
  );

const ownerPredicate = ({ columns, id }: { columns: Set<string>; id: string }): string =>
  columns.has("user_id")
    ? ` AND user_id = (SELECT user_id FROM conversations WHERE id = '${id}')`
    : "";

const selectedColumn = ({
  columns,
  name,
  fallback,
}: {
  columns: Set<string>;
  name: string;
  fallback: string;
}): string => (columns.has(name) ? name : `${fallback} AS ${name}`);

const buildBundle = ({
  database,
  conversationId,
}: {
  database: string;
  conversationId: string;
}): DiagnosticBundle => {
  const id = escapeSql(conversationId);
  const messageColumns = tableColumns({ database, table: "messages" });
  const generationColumns = tableColumns({ database, table: "chat_generations" });
  const eventColumns = tableColumns({ database, table: "chat_events" });
  const conversation = query({
    database,
    sql: `SELECT id, title, status, created_at, updated_at FROM conversations WHERE id = '${id}' LIMIT 1`,
  })[0];
  if (conversation === undefined) throw new Error(`Conversation '${conversationId}' not found.`);
  const messages = query({
    database,
    sql: `SELECT id, parent_id, role, parts, prompt_tokens, completion_tokens, total_tokens, model, created_at FROM messages WHERE conversation_id = '${id}'${ownerPredicate({ columns: messageColumns, id })} ORDER BY created_at, id`,
  });
  const generations = query({
    database,
    sql: `SELECT id, ${selectedColumn({ columns: generationColumns, name: "request_id", fallback: "id" })}, ${selectedColumn({ columns: generationColumns, name: "trace_id", fallback: "id" })}, status, error, ${selectedColumn({ columns: generationColumns, name: "finish_reason", fallback: "CASE WHEN EXISTS (SELECT 1 FROM chat_generation_chunks chunk WHERE chunk.generation_id = chat_generations.id AND json_extract(chunk.chunk, '$.type') = 'finish') THEN 'stop' WHEN status = 'failed' THEN 'error' ELSE NULL END" })}, ${selectedColumn({ columns: generationColumns, name: "model", fallback: "NULL" })}, ${selectedColumn({ columns: generationColumns, name: "input_tokens", fallback: "NULL" })}, ${selectedColumn({ columns: generationColumns, name: "output_tokens", fallback: "NULL" })}, ${selectedColumn({ columns: generationColumns, name: "retry_count", fallback: "0" })}, ${selectedColumn({ columns: generationColumns, name: "started_at", fallback: "created_at" })}, ${selectedColumn({ columns: generationColumns, name: "finished_at", fallback: "CASE WHEN status = 'running' THEN NULL ELSE updated_at END" })}, created_at, updated_at FROM chat_generations WHERE conversation_id = '${id}'${ownerPredicate({ columns: generationColumns, id })} ORDER BY created_at, id`,
  });
  const events =
    eventColumns.size === 0
      ? []
      : query({
          database,
          sql: `SELECT id, generation_id, request_id, trace_id, type, schema_version, payload, created_at FROM chat_events WHERE conversation_id = '${id}'${ownerPredicate({ columns: eventColumns, id })} ORDER BY created_at, id`,
        });

  return Schema.decodeUnknownSync(diagnosticBundleSchema)({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    redacted: false,
    conversation: {
      id: conversation.id,
      title: conversation.title,
      status: conversation.status,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
    },
    messages: messages.map((message) => ({
      id: message.id,
      parentId: message.parent_id,
      role: message.role,
      parts: decodeJson(String(message.parts)),
      promptTokens: message.prompt_tokens,
      completionTokens: message.completion_tokens,
      totalTokens: message.total_tokens,
      model: message.model,
      createdAt: message.created_at,
    })),
    generations: generations.map((generation) => ({
      id: generation.id,
      requestId: generation.request_id,
      traceId: generation.trace_id,
      status: generation.status === "running" ? "streaming" : generation.status,
      error: generation.error,
      finishReason: generation.finish_reason,
      model: generation.model,
      inputTokens: generation.input_tokens,
      outputTokens: generation.output_tokens,
      retryCount: generation.retry_count,
      startedAt: generation.started_at,
      finishedAt: generation.finished_at,
      createdAt: generation.created_at,
      updatedAt: generation.updated_at,
    })),
    events: events.map((event) => ({
      id: event.id,
      generationId: event.generation_id,
      requestId: event.request_id,
      traceId: event.trace_id,
      type: event.type,
      schemaVersion: event.schema_version,
      payload: decodeJson(String(event.payload)),
      createdAt: event.created_at,
    })),
  });
};

const main = () => {
  const options = parseOptions();
  loadEnvironment(options);
  const conversationId = conversationIdFrom(options.url);
  const database = selectDatabase(options.env);
  const rawBundle = buildBundle({ database, conversationId });
  const bundle = options.includeSensitive ? rawBundle : redactDiagnosticBundle(rawBundle);
  const analysis = analyzeDiagnosticBundle(bundle);
  const directory = resolve(workspaceRoot, options.output, conversationId);
  mkdirSync(directory, { recursive: true });
  const bundlePath = resolve(directory, "bundle.json");
  const findingsPath = resolve(directory, "findings.json");
  const reportPath = resolve(directory, "report.md");
  writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(findingsPath, `${JSON.stringify(analysis, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(reportPath, renderDiagnosticMarkdown({ analysis, bundle }), { mode: 0o600 });
  process.stdout.write(`${reportPath}\n${analysis.findings.length} deterministic finding(s)\n`);
};

main();
