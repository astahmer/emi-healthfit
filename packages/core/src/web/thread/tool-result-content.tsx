"use client";

import { memo, type FC, type ReactNode } from "react";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { useToolRenderer } from "../contributions.tsx";
import { cn } from "../cn.ts";
import { decodeDynamicComponent, DynamicComponentRenderer } from "../dynamic-components.tsx";
import { isSafeMarkdownHref } from "./markdown-url-policy.ts";

interface Citation {
  readonly title?: string;
  readonly url?: string;
  readonly content?: string;
}

const Citations = Schema.Array(
  Schema.Struct({
    title: Schema.optional(Schema.String),
    url: Schema.optional(Schema.String),
    content: Schema.optional(Schema.String),
  }),
);
const CitationContainer = Schema.Struct({
  results: Schema.optional(Citations),
  sources: Schema.optional(Citations),
  citations: Schema.optional(Citations),
});
const ErrorText = Schema.Struct({
  type: Schema.Literal("error-text"),
  value: Schema.optional(Schema.Unknown),
});
const JsonResult = Schema.fromJsonString(Schema.Unknown);

const parseResult = (result: unknown): unknown =>
  Option.getOrElse(Schema.decodeUnknownOption(JsonResult)(result), () => result);

const getCitations = (value: unknown): ReadonlyArray<Citation> | undefined => {
  const container = Schema.decodeUnknownOption(CitationContainer)(value);
  if (Option.isNone(container)) return undefined;
  return container.value.results ?? container.value.sources ?? container.value.citations;
};

const WebSearchCitations: FC<{ citations: ReadonlyArray<Citation> }> = ({ citations }) => (
  <div className="flex flex-col gap-2">
    {citations.map((citation) => (
      <div
        key={citation.url ?? citation.title ?? citation.content ?? "citation"}
        className="rounded-lg border p-3"
      >
        {citation.title !== undefined && (
          <p className="font-medium text-sm">
            {citation.url !== undefined && isSafeMarkdownHref(citation.url) ? (
              <a
                href={citation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {citation.title}
              </a>
            ) : (
              citation.title
            )}
          </p>
        )}
        {citation.content !== undefined && (
          <p className="text-muted-foreground mt-1 text-xs">{citation.content}</p>
        )}
      </div>
    ))}
  </div>
);

const FallbackResult: FC<{ value: unknown; className?: string }> = ({ value, className }) => (
  <pre
    className={cn(
      "bg-muted/50 text-foreground/90 mt-1 rounded-md p-2.5 text-xs whitespace-pre-wrap",
      className,
    )}
  >
    {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
  </pre>
);

export interface ToolResultContentProps {
  toolName: string;
  result?: unknown;
  className?: string;
  renderComponent?: (spec: unknown) => ReactNode;
}

const ToolResultContentImpl: FC<ToolResultContentProps> = ({
  toolName,
  result,
  className,
  renderComponent,
}) => {
  const registeredRenderer = useToolRenderer(toolName);
  const parsed = parseResult(result);
  const errorText = Schema.decodeUnknownOption(ErrorText)(parsed);
  if (Option.isSome(errorText)) {
    return (
      <p className={cn("text-sm text-destructive", className)}>
        {String(errorText.value.value ?? "Tool failed")}
      </p>
    );
  }

  if (registeredRenderer !== undefined) {
    const RegisteredRenderer = registeredRenderer;
    return <RegisteredRenderer result={parsed} className={className} />;
  }

  const citations = getCitations(parsed);
  if ((toolName === "web_search" || toolName === "web-search") && citations !== undefined) {
    return <WebSearchCitations citations={citations} />;
  }

  if (toolName === "render_component") {
    const dynamicComponent = decodeDynamicComponent(parsed);
    if (dynamicComponent === undefined) {
      return (
        <FallbackResult value={{ type: "dynamic-component-fallback", reason: "invalid-spec" }} />
      );
    }
    if (renderComponent !== undefined) return <>{renderComponent(dynamicComponent.spec)}</>;
    return <DynamicComponentRenderer className={className} value={dynamicComponent} />;
  }

  return <FallbackResult value={parsed} className={className} />;
};

export const ToolResultContent = memo(ToolResultContentImpl);
ToolResultContent.displayName = "ToolResultContent";
