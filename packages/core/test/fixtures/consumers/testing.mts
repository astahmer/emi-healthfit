// @ts-ignore R0 target entrypoint is implemented in a later packet.
import {
  createDeterministicDependencies,
  createInMemoryRepositories,
  createTestChatRuntime,
} from "@emi/core/testing";
// @ts-ignore R0 target entrypoint is implemented in a later packet.
import type { ChatRuntimeOptions } from "@emi/core/runtime";

declare const options: ChatRuntimeOptions;
const dependencies = createDeterministicDependencies();
const repositories = createInMemoryRepositories();
const runtime = createTestChatRuntime(options);

void dependencies;
void repositories;
void runtime;
