export type StepCategory = 'supplier' | 'process' | 'shipping' | 'customer';

export interface ProcessStep {
  id: string;
  name: string;
  category: StepCategory;
  /** Tempo de Ciclo em segundos */
  cycleTime: number;
  /** Tempo de Setup em segundos */
  setupTime: number;
  /** Estoque Intermediário em unidades */
  wip: number;
}

export interface SimulationState {
  steps: ProcessStep[];
  /** Demanda do Cliente em unidades por turno */
  customerDemand: number;
  /** Tempo Disponível em segundos por turno */
  availableTime: number;
}

export interface StepMetrics {
  id: string;
  /** Capacidade da etapa = tempo disponível / (TC + TRF/100) */
  capacity: number;
  /** Razão entre TC da etapa e Takt Time */
  taktRatio: number;
  /** Diferença entre TC e Takt Time (positivo = acima do takt) */
  taktGap: number;
  isBottleneck: boolean;
}

export interface SimulationResults {
  /** Takt Time = Tempo Disponível / Demanda */
  taktTime: number;
  /** Capacidade da linha = menor capacidade entre todas as etapas */
  lineCapacity: number;
  /** Tempo total de atravessamento (soma de TC + WIP * Takt) */
  leadTime: number;
  /** Índice de balanceamento = TC médio / TC do gargalo */
  lineBalance: number;
  /** ID da etapa gargalo */
  bottleneckId: string;
  /** Métricas por etapa */
  stepMetrics: Record<string, StepMetrics>;
  /** A linha atende a demanda? */
  meetsDemand: boolean;
}

export interface Recommendation {
  title: string;
  description: string;
  icon: string;
}
