"use client";

import { createContext, useContext, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../cn.ts";

const ReferenceMessageContext = createContext<((messageId: string) => void) | undefined>(undefined);

const MarkdownLink: NonNullable<Components["a"]> = ({ children, href, ...props }) => {
  const onReferenceMessage = useContext(ReferenceMessageContext);
  if (href?.startsWith("message:") === true) {
    const messageId = href.slice("message:".length);
    return (
      <button
        type="button"
        onClick={() => onReferenceMessage?.(messageId)}
        className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs font-medium text-foreground hover:bg-accent"
      >
        {children}
      </button>
    );
  }
  return (
    <a
      {...props}
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-primary underline underline-offset-4"
    >
      {children}
    </a>
  );
};

const markdownPlugins = [remarkGfm];

const markdownComponents: Components = {
  a: MarkdownLink,
  code: ({ className, children, ...props }) => (
    <code
      {...props}
      className={cn("rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]", className)}
    >
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg border bg-muted/50 p-3 text-sm leading-6">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border bg-muted px-2 py-1 text-left">{children}</th>,
  td: ({ children }) => <td className="border px-2 py-1 align-top">{children}</td>,
  h1: ({ children }) => <h1 className="mt-6 mb-2 text-xl font-semibold">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-5 mb-2 text-lg font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-4 mb-1.5 font-semibold">{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-2 border-primary/30 pl-4 text-muted-foreground">
      {children}
    </blockquote>
  ),
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
  hr: () => <hr className="my-5 border-border/70" />,
};

export const MarkdownText = ({
  text,
  onReferenceMessage,
}: {
  text: string;
  onReferenceMessage?: (messageId: string) => void;
}): ReactNode => (
  <div className="max-w-3xl text-[15px] leading-7 text-foreground/95">
    <ReferenceMessageContext.Provider value={onReferenceMessage}>
      <ReactMarkdown remarkPlugins={markdownPlugins} components={markdownComponents}>
        {text.replace(
          /<message\s+id=["']([^"']+)["']\s*\/?\s*>/g,
          (_match, messageId: string) => `[Referenced message](message:${messageId})`,
        )}
      </ReactMarkdown>
    </ReferenceMessageContext.Provider>
  </div>
);
