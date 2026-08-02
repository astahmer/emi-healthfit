// @ts-expect-error Generic core must not publish HealthFit product APIs.
import type { AnalyticsApi, HealthFitApi, WorkoutsApi } from "@emi/core/protocol";
// @ts-expect-error Generic core must not publish HealthFit product APIs.
import type { HealthFitApi as RootHealthFitApi } from "@emi/core";

declare const analyticsApi: AnalyticsApi;
declare const healthFitApi: HealthFitApi;
declare const workoutsApi: WorkoutsApi;
declare const rootHealthFitApi: RootHealthFitApi;

void analyticsApi;
void healthFitApi;
void workoutsApi;
void rootHealthFitApi;
