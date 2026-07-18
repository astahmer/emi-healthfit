import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { DiagnosticBundle } from "./bundle.ts";

export interface DiagnosticFinding {
  code: string;
  severity: "info" | "warning" | "error";
  evidence: string;
}

export interface DiagnosticAnalysis {
  conversationId: string;
  findings: DiagnosticFinding[];
  totalTokens: number;
}

const textOf = (value: unknown): string => JSON.stringify(value).toLowerCase();

const PersistedPart = Schema.Struct({
  type: Schema.optional(Schema.String),
  text: Schema.optional(Schema.String),
  state: Schema.optional(Schema.String),
  output: Schema.optional(Schema.Unknown),
});

const ErrorOutput = Schema.Struct({ type: Schema.Literal("error-text") });

const decodePersistedPart = Schema.decodeUnknownOption(PersistedPart);
const decodeErrorOutput = Schema.decodeUnknownOption(ErrorOutput);

const isToolPart = (part: typeof PersistedPart.Type): boolean =>
  part.type === "dynamic-tool" || part.type?.startsWith("tool-") === true;

const decodeParts = (parts: ReadonlyArray<unknown>): (typeof PersistedPart.Type)[] =>
  parts.flatMap((part) => {
    const decoded = decodePersistedPart(part);
    return Option.isSome(decoded) ? [decoded.value] : [];
  });

export const analyzeDiagnosticBundle = (bundle: DiagnosticBundle): DiagnosticAnalysis => {
  const findings: DiagnosticFinding[] = [];
  const totalTokens = bundle.messages.reduce(
    (total, message) => total + (message.totalTokens ?? 0),
    0,
  );
  const messages = bundle.messages;

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const parts = decodeParts(message.parts);
    const assistantText = parts
      .filter((part) => part.type === "text" && part.text !== undefined)
      .map((part) => part.text)
      .join(" ");
    const toolParts = parts.filter(isToolPart);
    if (
      toolParts.some(
        (part) =>
          part.state === "output-available" && Option.isSome(decodeErrorOutput(part.output)),
      )
    ) {
      findings.push({
        code: "error-tool-persisted-as-success",
        severity: "error",
        evidence: `Assistant message ${message.id} persisted an error-text result as success.`,
      });
    }
    if (/paste|screenshot|capture d[’']écran/i.test(assistantText)) {
      findings.push({
        code: "owned-data-shifted-to-user",
        severity: "warning",
        evidence: `Assistant message ${message.id} requested user-supplied data for an owned-data workflow.`,
      });
    }
    const promiseIndex = parts.findIndex(
      (part) =>
        part.type === "text" &&
        part.text !== undefined &&
        /let me (try|pull)|je vais (essayer|récupérer)/i.test(part.text),
    );
    const toolAfterPromise = promiseIndex >= 0 && parts.slice(promiseIndex + 1).some(isToolPart);
    if (promiseIndex >= 0 && !toolAfterPromise) {
      findings.push({
        code: "unfulfilled-tool-promise",
        severity: "warning",
        evidence: `Assistant message ${message.id} promised another tool action without a tool call.`,
      });
    }
  }

  messages.forEach((message, index) => {
    if (message.role !== "user") return;
    const following = messages[index + 1];
    if (following === undefined || following.role === "user") {
      findings.push({
        code: "orphan-user-turn",
        severity: "error",
        evidence: `User message ${message.id} has no following assistant message.`,
      });
    }
  });

  for (const generation of bundle.generations) {
    if (generation.status === "pending" || generation.status === "streaming") {
      findings.push({
        code: "generation-without-terminal-state",
        severity: "error",
        evidence: `Generation ${generation.id} remains ${generation.status}.`,
      });
    }
    if (
      generation.status === "failed" ||
      generation.status === "timed_out" ||
      generation.status === "cancelled"
    ) {
      findings.push({
        code: "generation-failed",
        severity: "error",
        evidence: `Generation ${generation.id} ended as ${generation.status}: ${generation.error ?? "No error was recorded."}`,
      });
    }
    if (generation.status === "completed" && generation.finishReason === null) {
      findings.push({
        code: "missing-finish-reason",
        severity: "warning",
        evidence: `Generation ${generation.id} has no provider finish reason.`,
      });
    }
  }

  const failedCalls = new Map<string, number>();
  for (const event of bundle.events) {
    const payloadText = textOf(event.payload);
    if (event.type === "tool.failed") {
      const key = payloadText;
      failedCalls.set(key, (failedCalls.get(key) ?? 0) + 1);
    }
    if (event.type === "persistence.failed") {
      findings.push({
        code: "persistence-gap",
        severity: "error",
        evidence: `Persistence failed for generation ${event.generationId}.`,
      });
    }
    if (
      event.type === "client.disconnected" &&
      !bundle.events.some(
        (candidate) =>
          candidate.type === "client.reconnected" && candidate.generationId === event.generationId,
      )
    ) {
      findings.push({
        code: "reconnect-gap",
        severity: "warning",
        evidence: `Generation ${event.generationId} disconnected without reconnect.`,
      });
    }
    if (event.type === "component.invalid") {
      findings.push({
        code: "invalid-component-props",
        severity: "error",
        evidence: `A render_component payload failed its registered schema.`,
      });
    }
  }

  for (const [payload, count] of failedCalls) {
    if (count < 2) continue;
    findings.push({
      code: "repeated-equivalent-tool-failure",
      severity: "error",
      evidence: `Equivalent tool failure repeated ${count} times: ${payload.slice(0, 160)}.`,
    });
  }

  const transcript = textOf(messages.map((message) => message.parts));
  const observedSingleSelectError = bundle.events.some(
    (event) =>
      event.type === "tool.failed" &&
      /only_one_select|only one select/i.test(textOf(event.payload)),
  );
  if (
    observedSingleSelectError &&
    /joins?.*(forbidden|not allowed)|group by.*(forbidden|not allowed)|filters?.*(forbidden|not allowed)/i.test(
      transcript,
    )
  ) {
    findings.push({
      code: "unsupported-tool-capability-claim",
      severity: "error",
      evidence:
        "Assistant inferred capability restrictions not present in the observed tool error.",
    });
  }
  if (totalTokens > 32_000 || messages.some((message) => (message.totalTokens ?? 0) > 12_000)) {
    findings.push({
      code: "abnormal-token-growth",
      severity: "warning",
      evidence: `Conversation used ${totalTokens} persisted tokens.`,
    });
  }
  if (!bundle.events.some((event) => event.type.startsWith("client."))) {
    findings.push({
      code: "missing-client-recovery-telemetry",
      severity: "info",
      evidence:
        "No durable client refresh, disconnect, reconnect, stop, or retry event is available.",
    });
  }

  return { conversationId: bundle.conversation.id, findings, totalTokens };
};

export const renderDiagnosticMarkdown = ({
  analysis,
  bundle,
}: {
  analysis: DiagnosticAnalysis;
  bundle: DiagnosticBundle;
}): string => {
  const findings =
    analysis.findings.length === 0
      ? "No deterministic findings."
      : analysis.findings
          .map(
            (finding) =>
              `- **${finding.severity.toUpperCase()} ${finding.code}** — ${finding.evidence}`,
          )
          .join("\n");
  return `# Session diagnostics: ${analysis.conversationId}\n\n- Schema: ${bundle.schemaVersion}\n- Redacted: ${bundle.redacted}\n- Messages: ${bundle.messages.length}\n- Generations: ${bundle.generations.length}\n- Events: ${bundle.events.length}\n- Persisted tokens: ${analysis.totalTokens}\n\n## Findings\n\n${findings}\n`;
};
