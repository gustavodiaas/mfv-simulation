export type ScenarioKind = 'current' | 'future';

export interface ProcessStep {
  id: string;
  name: string;
  cycleTimeSec: number;
  setupTimeMin: number;
  batchSize: number;
  operators: number;
  availabilityPercent: number;
  wipUnits: number;
}

export interface ProjectInfo {
  area: string;
  family: string;
  product: string;
  supplier: string;
  customer: string;
  owner: string;
  referenceDate: string;
}

export interface Scenario {
  id: ScenarioKind;
  name: string;
  monthlyDemand: number;
  workdaysPerMonth: number;
  availableMinutesPerDay: number;
  steps: ProcessStep[];
}

export interface StepMetrics {
  effectiveCycleTimeSec: number;
  capacityPerDay: number;
  taktRatio: number;
  inventoryDays: number;
  isBottleneck: boolean;
  isOverTakt: boolean;
}

export interface SimulationResults {
  dailyDemand: number;
  taktTimeSec: number;
  capacityPerDay: number;
  leadTimeDays: number;
  inventoryLeadTimeDays: number;
  processingTimeMin: number;
  lineBalance: number;
  totalWip: number;
  bottleneckId: string;
  meetsDemand: boolean;
  stepMetrics: Record<string, StepMetrics>;
}
