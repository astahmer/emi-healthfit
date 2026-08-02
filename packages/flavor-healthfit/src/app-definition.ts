import { ServerDatabase } from "@emi/core/server/database";
import { fitnessCoachV1 } from "./chat/prompts/fitness-coach-v1.ts";
import { tools } from "./tools/api.ts";

const healthFitOwnDefinition: ServerDatabase.AppDefinition = {
  identity: {
    name: "HealthFit",
    description: "Personal fitness coach grounded in Apple Health and Hevy workout data.",
  },
  promptContributors: [{ id: "fitness-coach-v1", text: fitnessCoachV1 }],
  tools,
};

export const healthFitAppDefinition: ServerDatabase.AppDefinition = ServerDatabase.app.merge(
  ServerDatabase.app.core,
  healthFitOwnDefinition,
);
