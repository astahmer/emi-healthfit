const minutesToHours = (minutes: number): string => `${(minutes / 60).toFixed(1)}h`;

export const estimateRecovery = ({
  sleepAverageMinutes,
  strain48Hours,
}: {
  sleepAverageMinutes: number | null;
  strain48Hours: number;
}): { label: string; explanation: string } => {
  if (sleepAverageMinutes === null) {
    return {
      label: "Insufficient data",
      explanation: `Sleep data is unavailable. Recent 48h strength volume is ${Math.round(strain48Hours)} kg·reps; readiness cannot be estimated reliably.`,
    };
  }

  const sleepScore = Math.min(sleepAverageMinutes / 480, 1);
  const strainScore = Math.min(strain48Hours / 10_000, 1);
  const recoveryEstimate = sleepScore * 0.7 + (1 - strainScore) * 0.3;
  const evidence = `Sleep avg ${minutesToHours(sleepAverageMinutes)} last 7 days, strain 48h ${Math.round(strain48Hours)} kg·reps.`;

  if (recoveryEstimate >= 0.75) {
    return { label: "Favorable signals", explanation: evidence };
  }
  if (recoveryEstimate >= 0.45) {
    return {
      label: "Mixed signals",
      explanation: `${evidence} Consider current symptoms and perceived exertion before adjusting training.`,
    };
  }
  return {
    label: "Recovery may be limited",
    explanation: `${evidence} A lighter session or rest may be appropriate if fatigue or other symptoms are present.`,
  };
};
