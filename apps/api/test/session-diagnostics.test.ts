import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import * as Schema from "effect/Schema";
import {
  diagnosticBundleSchema,
  redactDiagnosticBundle,
  type DiagnosticBundle,
} from "../src/diagnostics/bundle.ts";
import { analyzeDiagnosticBundle } from "../src/diagnostics/analyzer.ts";
import { decodeJson } from "../src/json-codec.ts";

const timestamp = "2026-07-16T12:00:00.000Z";
const SessionFixture = Schema.Struct({
  expectedFindings: Schema.Array(Schema.String),
  sevenSqlShapes: Schema.Array(Schema.String),
});
const ScenarioFixture = Schema.Struct({
  scenario: Schema.String,
  events: Schema.Array(Schema.String),
});

const session9745Bundle = (): DiagnosticBundle =>
  Schema.decodeUnknownSync(diagnosticBundleSchema)({
    schemaVersion: 1,
    exportedAt: timestamp,
    redacted: false,
    conversation: {
      id: "9745e022-7b85-400c-83cb-db3ae60f8121",
      title: "Workout details",
      status: "regular",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    messages: [
      {
        id: "assistant-failed",
        parentId: null,
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "query_database",
            state: "output-available",
            outcome: "success",
            output: { type: "error-text", value: "Only one SELECT query is allowed." },
          },
          {
            type: "text",
            text: "Joins are forbidden, GROUP BY is not allowed, and filters are forbidden. Send a screenshot. Let me pull the raw recent sets next.",
          },
        ],
        promptTokens: 60_000,
        completionTokens: 6_053,
        totalTokens: 66_053,
        model: "test-model",
        createdAt: timestamp,
      },
      {
        id: "user-orphan",
        parentId: null,
        role: "user",
        parts: [{ type: "text", text: "fais moi un programme pour demain" }],
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        model: null,
        createdAt: timestamp,
      },
    ],
    generations: [
      {
        id: "generation-9745",
        requestId: "request-9745",
        traceId: "trace-9745",
        status: "timed_out",
        error: "Generation timed out",
        finishReason: null,
        model: "test-model",
        inputTokens: 60_000,
        outputTokens: 6_053,
        retryCount: 0,
        startedAt: timestamp,
        finishedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    events: [
      ...Array.from({ length: 7 }, (_, index) => ({
        id: `tool-${index}`,
        generationId: "generation-9745",
        requestId: "request-9745",
        traceId: "trace-9745",
        type: "tool.failed",
        schemaVersion: 1,
        payload: { tool: "query_database", code: "ONLY_ONE_SELECT" },
        createdAt: timestamp,
      })),
      {
        id: "component-invalid",
        generationId: "generation-9745",
        requestId: "request-9745",
        traceId: "trace-9745",
        type: "component.invalid",
        schemaVersion: 1,
        payload: { component: "WorkoutTable" },
        createdAt: timestamp,
      },
    ],
  });

describe("session diagnostics", () => {
  it("flags the deterministic session-9745 findings", () => {
    const fixture = Schema.decodeUnknownSync(SessionFixture)(
      decodeJson(
        readFileSync(
          resolve(import.meta.dirname, "fixtures/session-diagnostics/session-9745.json"),
          "utf8",
        ),
      ),
    );
    const analysis = analyzeDiagnosticBundle(session9745Bundle());
    const codes = new Set(analysis.findings.map((finding) => finding.code));

    assert.strictEqual(fixture.sevenSqlShapes.length, 7);
    for (const expected of fixture.expectedFindings) assert.ok(codes.has(expected), expected);
  });

  it("redacts secrets and owned tool payloads by default", () => {
    const bundle = session9745Bundle();
    const redacted = redactDiagnosticBundle({
      ...bundle,
      events: bundle.events.map((event, index) =>
        index === 0
          ? {
              ...event,
              payload: {
                authorization: "Bearer secret",
                args: { sessionId: "private-health-session" },
              },
            }
          : event,
      ),
    });
    const serialized = JSON.stringify(redacted);

    assert.strictEqual(redacted.redacted, true);
    assert.ok(!serialized.includes("Bearer secret"));
    assert.ok(!serialized.includes("private-health-session"));
  });

  it("keeps success, failure, disconnect, timeout, provider, and persistence fixtures", () => {
    const names = [
      "success",
      "tool-failure",
      "disconnect",
      "timeout",
      "provider-failure",
      "persistence-failure",
    ];
    for (const name of names) {
      const fixture = Schema.decodeUnknownSync(ScenarioFixture)(
        decodeJson(
          readFileSync(
            resolve(import.meta.dirname, `fixtures/session-diagnostics/${name}.json`),
            "utf8",
          ),
        ),
      );
      assert.strictEqual(fixture.scenario, name);
      assert.ok(fixture.events.length > 0);
    }
  });
});
