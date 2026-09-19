export type Recommendation = {
  selectedPlanId: string;
  runnerUpPlanId?: string;
  reasonCodes: string[];
  explanation: string;
  evaluatedAt: string;
};
