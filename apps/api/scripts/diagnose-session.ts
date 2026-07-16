import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import {
  diagnosticBundleSchema,
  redactDiagnosticBundle,
  type DiagnosticBundle,
} from "../src/diagnostics/bundle.ts";
import { analyzeDiagnosticBundle, renderDiagnosticMarkdown } from "../src/diagnostics/analyzer.ts";

const optionsSchema = z.object({
  url: z.string().min(1),
  env: z.string().min(1),
  output: z.string().min(1).default(".diagnostics"),
  includeSensitive: z.boolean().default(false),
});

const parseOptions = () => {
  const values: Record<string, string | boolean> = {};
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument === "--include-sensitive") {
      values.includeSensitive = true;
      continue;
    }
    if (argument !== "--url" && argument !== "--env" && argument !== "--output") continue;
    const value = process.argv[index + 1];
    if (value === undefined) throw new Error(`${argument} requires a value.`);
    values[argument.slice(2)] = value;
    index += 1;
  }
  return optionsSchema.parse(values);
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
        cwd: resolve(import.meta.dirname, "../../.."),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    return JSON.parse(output);
  } catch (error) {
    const stderr =
      typeof error === "object" && error !== null && "stderr" in error
        ? String(Reflect.get(error, "stderr"))
        : String(error);
    throw new Error(
      `Wrangler D1 access failed. Run 'pnpm --filter @emi/api exec wrangler login' and verify the requested environment. ${stderr.trim()}`,
      { cause: error },
    );
  }
};

const resultRows = (value: unknown): Record<string, unknown>[] => {
  const commands = z
    .array(z.object({ results: z.array(z.record(z.string(), z.unknown())).default([]) }))
    .parse(value);
  return commands.flatMap((command) => command.results);
};

const selectDatabase = (environment: string): string => {
  const databases = z
    .array(z.object({ name: z.string() }))
    .parse(wrangler(["d1", "list", "--json"]));
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

const query = ({
  database,
  environment,
  sql,
}: {
  database: string;
  environment: string;
  sql: string;
}): Record<string, unknown>[] =>
  resultRows(
    wrangler([
      "d1",
      "execute",
      database,
      "--remote",
      "--env",
      environment,
      "--command",
      sql,
      "--json",
      "--yes",
    ]),
  );

const buildBundle = ({
  database,
  environment,
  conversationId,
}: {
  database: string;
  environment: string;
  conversationId: string;
}): DiagnosticBundle => {
  const id = escapeSql(conversationId);
  const owner = `user_id = (SELECT user_id FROM conversations WHERE id = '${id}')`;
  const conversation = query({
    database,
    environment,
    sql: `SELECT id, title, status, created_at, updated_at FROM conversations WHERE id = '${id}' LIMIT 1`,
  })[0];
  if (conversation === undefined) throw new Error(`Conversation '${conversationId}' not found.`);
  const messages = query({
    database,
    environment,
    sql: `SELECT id, parent_id, role, parts, prompt_tokens, completion_tokens, total_tokens, model, created_at FROM messages WHERE conversation_id = '${id}' AND ${owner} ORDER BY created_at, id`,
  });
  const generations = query({
    database,
    environment,
    sql: `SELECT id, request_id, trace_id, status, error, finish_reason, model, input_tokens, output_tokens, retry_count, started_at, finished_at, created_at, updated_at FROM chat_generations WHERE conversation_id = '${id}' AND ${owner} ORDER BY created_at, id`,
  });
  const events = query({
    database,
    environment,
    sql: `SELECT id, generation_id, request_id, trace_id, type, schema_version, payload, created_at FROM chat_events WHERE conversation_id = '${id}' AND ${owner} ORDER BY created_at, id`,
  });

  return diagnosticBundleSchema.parse({
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
      parts: JSON.parse(String(message.parts)),
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
      status: generation.status,
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
      payload: JSON.parse(String(event.payload)),
      createdAt: event.created_at,
    })),
  });
};

const main = () => {
  const options = parseOptions();
  const conversationId = conversationIdFrom(options.url);
  const database = selectDatabase(options.env);
  const rawBundle = buildBundle({ database, environment: options.env, conversationId });
  const bundle = options.includeSensitive ? rawBundle : redactDiagnosticBundle(rawBundle);
  const analysis = analyzeDiagnosticBundle(bundle);
  const directory = resolve(options.output, conversationId);
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
