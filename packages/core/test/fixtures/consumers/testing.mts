import { ChatTesting } from "@emi/core/testing";
import type { ChatRuntimeOptions } from "@emi/core/runtime";

declare const options: ChatRuntimeOptions;
const dependencies = ChatTesting.deterministicDependencies();
const repositories = ChatTesting.inMemoryRepositories();
const runtime = ChatTesting.createRuntime(options);

void dependencies;
void repositories;
void runtime;
