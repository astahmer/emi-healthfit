"use client";

import { useState, type ReactNode } from "react";
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  Columns3Icon,
  GitBranchIcon,
  ListTreeIcon,
  PanelBottomIcon,
  Rows3Icon,
  SmartphoneIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const rootMessages = [
  { role: "You", text: "Build me a four-day strength plan." },
  {
    role: "Coach",
    text: "Upper/lower split, moderate volume, with recovery days between sessions.",
  },
];

const branches = [
  {
    id: "hypertrophy",
    title: "More hypertrophy",
    description: "Higher accessory volume",
    messages: [
      { role: "You", text: "Bias this toward hypertrophy." },
      { role: "Coach", text: "Add two accessory supersets and use 8–12 reps on secondary lifts." },
    ],
  },
  {
    id: "short",
    title: "Keep it under 45 min",
    description: "Tighter sessions",
    messages: [
      { role: "You", text: "Every workout must fit in 45 minutes." },
      {
        role: "Coach",
        text: "Use paired accessories, three work sets, and hard 90-second rest caps.",
      },
    ],
  },
  {
    id: "home",
    title: "Home equipment",
    description: "Dumbbells and bands",
    messages: [
      { role: "You", text: "Make a home version with dumbbells." },
      {
        role: "Coach",
        text: "Swap barbell lifts for goblet squats, floor press, and one-arm rows.",
      },
    ],
  },
];

const MessageCard = ({ role, text }: { role: string; text: string }) => (
  <div
    className={`rounded-xl p-3 text-sm ${role === "You" ? "ms-8 bg-muted" : "me-8 border bg-card"}`}
  >
    <p className="mb-1 text-[11px] font-medium text-muted-foreground">{role}</p>
    <p>{text}</p>
  </div>
);

const Transcript = ({ branchId }: { branchId?: string }) => {
  const branch = branches.find((candidate) => candidate.id === branchId);
  return (
    <div className="space-y-3">
      {rootMessages.map((message) => (
        <MessageCard key={message.text} {...message} />
      ))}
      {branch?.messages.map((message) => (
        <MessageCard key={message.text} {...message} />
      ))}
    </div>
  );
};

const BranchButton = ({
  branch,
  active,
  onClick,
}: {
  branch: (typeof branches)[number];
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex w-full items-center gap-2 rounded-lg border p-3 text-left ${active ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/40"}`}
  >
    <GitBranchIcon className="size-4 shrink-0" />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium">{branch.title}</span>
      <span className="block truncate text-xs text-muted-foreground">{branch.description}</span>
    </span>
    <ChevronRightIcon className="size-4" />
  </button>
);

const InlineDemo = () => {
  const [expanded, setExpanded] = useState("hypertrophy");
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <Transcript />
      <div className="border-s-2 border-primary/30 ps-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">3 replies branch from here</p>
        <div className="space-y-2">
          {branches.map((branch) => (
            <div key={branch.id}>
              <BranchButton
                branch={branch}
                active={expanded === branch.id}
                onClick={() => setExpanded(branch.id)}
              />
              {expanded === branch.id && (
                <div className="mt-2 ps-4">
                  <Transcript branchId={branch.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const TreeDemo = () => {
  const [selected, setSelected] = useState("hypertrophy");
  return (
    <div className="grid min-h-[30rem] overflow-hidden rounded-xl border md:grid-cols-[16rem_1fr]">
      <aside className="space-y-2 border-b bg-muted/20 p-3 md:border-e md:border-b-0">
        <p className="px-2 text-xs font-medium text-muted-foreground">Conversation tree</p>
        <button
          type="button"
          className="w-full rounded-lg bg-card p-3 text-left text-sm font-medium"
        >
          Main plan
        </button>
        <div className="ms-4 space-y-2 border-s ps-3">
          {branches.map((branch) => (
            <BranchButton
              key={branch.id}
              branch={branch}
              active={selected === branch.id}
              onClick={() => setSelected(branch.id)}
            />
          ))}
        </div>
      </aside>
      <main className="p-5">
        <Transcript branchId={selected} />
      </main>
    </div>
  );
};

const ColumnsDemo = () => (
  <div className="grid min-h-[30rem] gap-3 overflow-x-auto lg:grid-cols-3">
    <section className="min-w-64 rounded-xl border bg-card p-4">
      <p className="mb-3 text-sm font-medium">Main plan</p>
      <Transcript />
    </section>
    {branches.slice(0, 2).map((branch) => (
      <section key={branch.id} className="min-w-64 rounded-xl border bg-card p-4">
        <p className="mb-3 text-sm font-medium">{branch.title}</p>
        <Transcript branchId={branch.id} />
      </section>
    ))}
  </div>
);

const PhoneFrame = ({ children }: { children: ReactNode }) => (
  <div className="mx-auto min-h-[34rem] w-full max-w-sm overflow-hidden rounded-[2rem] border-4 bg-background shadow-xl">
    {children}
  </div>
);

const DrillDownDemo = () => {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <PhoneFrame>
      <div className="flex items-center border-b p-3">
        {selected !== null && (
          <button type="button" onClick={() => setSelected(null)} aria-label="Back">
            <ArrowLeftIcon className="size-5" />
          </button>
        )}
        <p className="ms-3 text-sm font-medium">
          {branches.find((branch) => branch.id === selected)?.title ?? "Main plan"}
        </p>
      </div>
      <div className="space-y-3 p-4">
        {selected === null ? (
          <>
            <Transcript />
            <p className="pt-2 text-xs font-medium text-muted-foreground">Branches</p>
            {branches.map((branch) => (
              <BranchButton
                key={branch.id}
                branch={branch}
                active={false}
                onClick={() => setSelected(branch.id)}
              />
            ))}
          </>
        ) : (
          <Transcript branchId={selected} />
        )}
      </div>
    </PhoneFrame>
  );
};

const SwipeDemo = () => (
  <PhoneFrame>
    <div className="border-b p-3 text-center text-sm font-medium">Swipe between branches</div>
    <div className="flex snap-x snap-mandatory overflow-x-auto">
      {[undefined, ...branches.map((branch) => branch.id)].map((branchId) => (
        <section key={branchId ?? "main"} className="w-full shrink-0 snap-center p-4">
          <p className="mb-3 text-sm font-medium">
            {branches.find((branch) => branch.id === branchId)?.title ?? "Main plan"}
          </p>
          <Transcript branchId={branchId} />
        </section>
      ))}
    </div>
    <p className="p-3 text-center text-xs text-muted-foreground">● ○ ○ ○</p>
  </PhoneFrame>
);

const BottomSheetDemo = () => {
  const [selected, setSelected] = useState("hypertrophy");
  const [open, setOpen] = useState(true);
  return (
    <PhoneFrame>
      <div className="border-b p-3 text-center text-sm font-medium">
        {branches.find((branch) => branch.id === selected)?.title}
      </div>
      <div className="p-4 pb-24">
        <Transcript branchId={selected} />
      </div>
      <div className="sticky bottom-0 rounded-t-2xl border-t bg-background p-3 shadow-2xl">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="mb-2 flex w-full items-center justify-center gap-2 text-sm font-medium"
        >
          <PanelBottomIcon className="size-4" />
          {open ? "Hide branches" : "Choose branch"}
        </button>
        {open && (
          <div className="space-y-2">
            {branches.map((branch) => (
              <BranchButton
                key={branch.id}
                branch={branch}
                active={selected === branch.id}
                onClick={() => setSelected(branch.id)}
              />
            ))}
          </div>
        )}
      </div>
    </PhoneFrame>
  );
};

const layouts = [
  { id: "inline", label: "Inline accordion", icon: Rows3Icon, component: InlineDemo },
  { id: "tree", label: "Tree + pane", icon: ListTreeIcon, component: TreeDemo },
  { id: "columns", label: "Desktop columns", icon: Columns3Icon, component: ColumnsDemo },
  { id: "drill", label: "Mobile drill-down", icon: SmartphoneIcon, component: DrillDownDemo },
  { id: "swipe", label: "Mobile swipe", icon: SmartphoneIcon, component: SwipeDemo },
  { id: "sheet", label: "Bottom sheet", icon: PanelBottomIcon, component: BottomSheetDemo },
];

export const ThreadLayoutDemos = () => {
  const [selected, setSelected] = useState("inline");
  const layout = layouts.find((candidate) => candidate.id === selected) ?? layouts[0];
  const Demo = layout.component;
  return (
    <div className="mx-auto h-full max-w-7xl overflow-y-auto p-4 md:p-6">
      <div className="mb-5">
        <h2 className="text-xl font-semibold">Thread layout prototypes</h2>
        <p className="text-sm text-muted-foreground">
          Fake-data interaction demos only. Compare behavior here before production integration.
        </p>
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        {layouts.map((candidate) => (
          <Button
            key={candidate.id}
            size="sm"
            variant={selected === candidate.id ? "default" : "outline"}
            onClick={() => setSelected(candidate.id)}
          >
            <candidate.icon className="size-4" />
            {candidate.label}
          </Button>
        ))}
      </div>
      <div className="rounded-2xl border bg-muted/10 p-3 sm:p-5">
        <Demo />
      </div>
    </div>
  );
};
