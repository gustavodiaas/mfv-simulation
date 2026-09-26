export type ScenarioKind = 'current' | 'future';

export type FlowType =
  | 'push'       // fluxo empurrado (seta larga)
  | 'pull'       // fluxo puxado (seta com loop)
  | 'fifo'       // FIFO lane
  | 'supermarket'; // supermercado + kanban de retirada

export type InfoFlowType =
  | 'manual'     // seta sólida — ordem manual em papel
  | 'electronic' // seta relâmpago tracejada — EDI/sistema
  | 'kanban-production' // kanban de produção
  | 'kanban-withdrawal'; // kanban de retirada

export interface ProcessStep {
  id: string;
  name: string;
  cycleTimeSec: number;
  setupTimeMin: number;
  batchSize: number;
  operators: number;
  availabilityPercent: number;
  wipUnits: number;
  /** Tipo de conexão APÓS este processo (antes do próximo) */
  flowAfter: FlowType;
}

export interface ProjectInfo {
  area: string;
  family: string;
  product: string;
  supplier: string;
  customer: string;
  owner: string;
  referenceDate: string;
  deliveryFrequencyDays: number;   // frequência de entrega do fornecedor (dias)
  shipmentFrequencyDays: number;   // frequência de expedição ao cliente (dias)
}

export interface Scenario {
  id: ScenarioKind;
  name: string;
  monthlyDemand: number;
  workdaysPerMonth: number;
  availableMinutesPerDay: number;
  steps: ProcessStep[];
  /** Fluxo de informação: controle de produção → fornecedor */
  infoSupplierFlow: InfoFlowType;
  /** Fluxo de informação: controle de produção → chão de fábrica */
  infoShopFloorFlow: InfoFlowType;
  /** Fluxo de informação: cliente → controle de produção */
  infoCustomerFlow: InfoFlowType;
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
