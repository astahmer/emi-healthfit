export const healthFitQueryKeys = {
  analytics: {
    overview: ({ days }: { days: number }) => ["analytics-overview", days] as const,
  },
  workouts: {
    all: ["workouts"] as const,
  },
};
