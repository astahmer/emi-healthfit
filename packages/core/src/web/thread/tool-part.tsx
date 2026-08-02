"use client";

import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { ReactNode } from "react";
import { useToolRenderer } from "../contributions.tsx";
import { ToolResultContent } from "./tool-result-content.tsx";

export type MessagePartValue = {
  type: string;
  text?: string;
  url?: string;
  filename?: string;
  mediaType?: string;
  [key: string]: unknown;
};

const ToolMessagePart = Schema.Struct({
  type: Schema.String,
  toolName: Schema.optional(Schema.String),
  input: Schema.optional(Schema.Unknown),
  args: Schema.optional(Schema.Unknown),
  argsText: Schema.optional(Schema.Unknown),
  output: Schema.optional(Schema.Unknown),
  result: Schema.optional(Schema.Unknown),
  state: Schema.optional(Schema.String),
  outcome: Schema.optional(Schema.String),
});
const ToolErrorOutput = Schema.Union([
  Schema.Struct({ type: Schema.Literal("error-text"), value: Schema.String }),
  Schema.Struct({ error: Schema.String }),
]);

export const ToolPart = ({
  part,
  isStreaming,
  renderToolResult,
}: {
  part: MessagePartValue;
  isStreaming: boolean;
  renderToolResult?: (args: { toolName: string; result: unknown }) => ReactNode;
}): ReactNode => {
  const toolPart = Schema.decodeUnknownOption(ToolMessagePart)(part);
  const type = Option.isSome(toolPart) ? toolPart.value.type : "";
  const isTool =
    type === "dynamic-tool" ||
    type === "tool-invocation" ||
    type === "tool-call" ||
    type.startsWith("tool-");
  const configuredToolName = Option.isSome(toolPart) ? toolPart.value.toolName : undefined;
  const toolName =
    configuredToolName !== undefined
      ? configuredToolName
      : type.startsWith("tool-")
        ? type.slice(5)
        : "tool";
  const registeredRenderer = useToolRenderer(toolName);
  if (Option.isNone(toolPart) || !isTool) return null;

  const input = toolPart.value.input ?? toolPart.value.args ?? toolPart.value.argsText;
  const output = toolPart.value.output ?? toolPart.value.result;
  const state = toolPart.value.state;
  const outcome = toolPart.value.outcome;
  const errorOutput = Option.isSome(Schema.decodeUnknownOption(ToolErrorOutput)(output));
  const isFailed = state === "output-error" || outcome === "error" || errorOutput;
  const hasOutput =
    output !== undefined || state === "output-available" || state === "output-error";
  const shouldRenderInput = input !== undefined && toolName !== "render_component";
  const isRunning = isStreaming && !hasOutput;
  const opensByDefault =
    isRunning || registeredRenderer !== undefined || toolName === "render_component";

  return (
    <details className="group/tool rounded-lg border bg-muted/15" open={opensByDefault}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground marker:content-none">
        {isRunning ? (
          <span
            aria-hidden
            className="inline-block size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
        ) : (
          <span aria-hidden className="text-[0.9rem] leading-none">
            ⚒
          </span>
        )}
        <span>{toolName.replaceAll("_", " ")}</span>
        <span className="ms-auto font-normal opacity-70">
          {isRunning ? "Running" : isFailed ? "Failed" : "Completed"}
        </span>
      </summary>
      <div className="border-t px-3 py-2">
        {shouldRenderInput && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Input</summary>
            <pre className="mt-1 overflow-auto whitespace-pre-wrap">
              {typeof input === "string" ? input : JSON.stringify(input, null, 2)}
            </pre>
          </details>
        )}
        {hasOutput &&
          (renderToolResult !== undefined ? (
            renderToolResult({ toolName, result: output })
          ) : (
            <ToolResultContent toolName={toolName} result={output} className="mt-2" />
          ))}
      </div>
    </details>
  );
};
