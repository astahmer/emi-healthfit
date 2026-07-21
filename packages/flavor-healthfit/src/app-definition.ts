import { coreAppDefinition, mergeAppDefinitions, type AppDefinition } from "@emi/core/server";
import { fitnessCoachV1 } from "./chat/prompts/fitness-coach-v1.ts";
import { tools } from "./tools/api.ts";

const healthFitOwnDefinition: AppDefinition = {
  identity: {
    name: "HealthFit",
    description: "Personal fitness coach grounded in Apple Health and Hevy workout data.",
  },
  promptContributors: [{ id: "fitness-coach-v1", text: fitnessCoachV1 }],
  tools,
};

export const healthFitAppDefinition: AppDefinition = mergeAppDefinitions(
  coreAppDefinition,
  healthFitOwnDefinition,
);
