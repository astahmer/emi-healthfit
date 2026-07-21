import { ChatShell, CoreWebProvider, type CoreWebContributions } from "@emi/core/web";
import type { Note } from "@emi/core/contract";

/**
 * Empty contributions prove `@emi/core/web` renders a usable shell with no
 * product flavor registered. A real flavor adds nav, pages, and tool
 * renderers through this same `CoreWebContributions` shape.
 */
const genericContributions: CoreWebContributions = {
  nav: [{ id: "home", label: "Home", href: "/" }],
};

type SmokeNote = Pick<Note, "id" | "content">;

const smokeNote: SmokeNote = { id: "smoke", content: "Generic core chat shell is running." };

export const App = () => (
  <CoreWebProvider contributions={genericContributions}>
    <ChatShell title="Generic Core Chat">
      <main style={{ padding: "2rem" }}>
        <h1>Generic Core Chat</h1>
        <p>
          This composition root depends only on <code>@emi/core/web</code> and{" "}
          <code>@emi/core/contract</code> — no product-specific flavor code.
        </p>
        <p data-testid="smoke-note">{smokeNote.content}</p>
      </main>
    </ChatShell>
  </CoreWebProvider>
);
