import { createActor } from "xstate";
import { describe, expect, it } from "vitest";
import { chatModels } from "../models";
import { composerConfigMachine } from "./composer-config-machine";

describe("composerConfigMachine", () => {
  it("starts with provided config", () => {
    const actor = createActor(composerConfigMachine, {
      input: { models: chatModels, model: "gpt-4o", coachMode: true, webSearch: false },
    });
    actor.start();

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.model).toBe("gpt-4o");
    expect(snapshot.context.coachMode).toBe(true);
    expect(snapshot.context.webSearch).toBe(false);
  });

  it("selects a new model", () => {
    const actor = createActor(composerConfigMachine, {
      input: { models: chatModels, model: "gpt-4o", coachMode: false, webSearch: false },
    });
    actor.start();

    actor.send({ type: "model.select", model: "gpt-5" });

    expect(actor.getSnapshot().context.model).toBe("gpt-5");
  });

  it("toggles coach mode", () => {
    const actor = createActor(composerConfigMachine, {
      input: { models: chatModels, model: "gpt-4o", coachMode: false, webSearch: false },
    });
    actor.start();

    actor.send({ type: "coach.toggle" });
    expect(actor.getSnapshot().context.coachMode).toBe(true);

    actor.send({ type: "coach.toggle" });
    expect(actor.getSnapshot().context.coachMode).toBe(false);
  });

  it("toggles temporary mode", () => {
    const actor = createActor(composerConfigMachine, {
      input: { models: chatModels, model: "gpt-4o", coachMode: false, webSearch: false },
    });
    actor.start();

    actor.send({ type: "temporary.toggle", value: true });
    expect(actor.getSnapshot().context.temporary).toBe(true);

    actor.send({ type: "temporary.toggle", value: false });
    expect(actor.getSnapshot().context.temporary).toBe(false);
  });

  it("switches to a web-search model when enabling web search on an unsupported model", () => {
    const actor = createActor(composerConfigMachine, {
      input: { models: chatModels, model: "gpt-4o-mini", coachMode: false, webSearch: false },
    });
    actor.start();

    actor.send({ type: "web.toggle", value: true });

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.webSearch).toBe(true);
    expect(snapshot.context.model).toBe("gpt-5");
    expect(snapshot.context.savedModelRef).toBe("gpt-4o-mini");
  });

  it("keeps the current model when it already supports web search", () => {
    const actor = createActor(composerConfigMachine, {
      input: { models: chatModels, model: "gpt-5", coachMode: false, webSearch: false },
    });
    actor.start();

    actor.send({ type: "web.toggle", value: true });

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.webSearch).toBe(true);
    expect(snapshot.context.model).toBe("gpt-5");
    expect(snapshot.context.savedModelRef).toBeNull();
  });

  it("restores the previous model when disabling web search", () => {
    const actor = createActor(composerConfigMachine, {
      input: { models: chatModels, model: "gpt-4o-mini", coachMode: false, webSearch: false },
    });
    actor.start();

    actor.send({ type: "web.toggle", value: true });
    actor.send({ type: "web.toggle", value: false });

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.webSearch).toBe(false);
    expect(snapshot.context.model).toBe("gpt-4o-mini");
    expect(snapshot.context.savedModelRef).toBeNull();
  });

  it("clears savedModelRef when selecting a model that supports web search", () => {
    const actor = createActor(composerConfigMachine, {
      input: { models: chatModels, model: "gpt-4o-mini", coachMode: false, webSearch: false },
    });
    actor.start();

    actor.send({ type: "web.toggle", value: true });
    actor.send({ type: "model.select", model: "gpt-5.2" });

    expect(actor.getSnapshot().context.savedModelRef).toBeNull();
  });
});
