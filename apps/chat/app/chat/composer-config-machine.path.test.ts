import { createActor } from "xstate";
import { describe, expect, it } from "vitest";
import { composerConfigMachine } from "./composer-config-machine.ts";
import type { ChatModel } from "../models";

const models: ChatModel[] = [
  {
    id: "gpt-plain",
    label: "Plain",
    description: "No web",
    supportsWebSearch: false,
    pricing: { inputUsdPerMillion: 1, outputUsdPerMillion: 2 },
  },
  {
    id: "gpt-web",
    label: "Web",
    description: "With web",
    supportsWebSearch: true,
    pricing: { inputUsdPerMillion: 1, outputUsdPerMillion: 2 },
  },
];

const input = {
  models,
  model: "gpt-plain",
  coachMode: false,
  webSearch: false,
};

describe("composerConfigMachine paths", () => {
  const sequences = [
    [{ type: "coach.toggle" as const }],
    [{ type: "temporary.toggle" as const, value: true }],
    [
      { type: "web.toggle" as const, value: true },
      { type: "web.toggle" as const, value: false },
    ],
    [{ type: "model.select" as const, model: "gpt-web" }],
    [
      { type: "web.toggle" as const, value: true },
      { type: "model.select" as const, model: "gpt-plain" },
    ],
  ];

  for (const events of sequences) {
    it(`applies ${events.map((event) => event.type).join(" → ")}`, () => {
      const actor = createActor(composerConfigMachine, { input }).start();
      for (const event of events) {
        actor.send(event);
      }
      expect(actor.getSnapshot().matches("idle")).toBe(true);
      actor.stop();
    });
  }
});
