import type {
  ProcessStep,
  SimulationResults,
  StepMetrics,
  Recommendation,
} from './types';

export const DEFAULT_STEPS: ProcessStep[] = [
  {
    id: 'supplier',
    name: 'Fornecedor',
    category: 'supplier',
    cycleTime: 5,
    setupTime: 0,
    wip: 0,
  },
  {
    id: 'cutting',
    name: 'Corte',
    category: 'process',
    cycleTime: 45,
    setupTime: 600,
    wip: 200,
  },
  {
    id: 'assembly',
    name: 'Montagem',
    category: 'process',
    cycleTime: 60,
    setupTime: 300,
    wip: 150,
  },
  {
    id: 'inspection',
    name: 'Inspeção',
    category: 'process',
    cycleTime: 30,
    setupTime: 0,
    wip: 80,
  },
  {
    id: 'shipping',
    name: 'Expedição',
    category: 'shipping',
    cycleTime: 20,
    setupTime: 0,
    wip: 50,
  },
  {
    id: 'customer',
    name: 'Cliente',
    category: 'customer',
    cycleTime: 0,
    setupTime: 0,
    wip: 0,
  },
];

export const DEFAULT_DEMAND = 400;
export const DEFAULT_AVAILABLE_TIME = 28800; // 8 horas em segundos

export function calculateTaktTime(
  availableTime: number,
  customerDemand: number
): number {
  if (customerDemand <= 0) return Infinity;
  return availableTime / customerDemand;
}

export function calculateStepCapacity(
  step: ProcessStep,
  availableTime: number
): number {
  if (step.category === 'supplier' || step.category === 'customer') {
    return Infinity;
  }
  if (step.cycleTime <= 0) return Infinity;
  // Capacidade considerando TC e TRF amortizado por lote de 100 unidades
  const effectiveTime = step.cycleTime + step.setupTime / 100;
  return availableTime / effectiveTime;
}

export function simulate(
  steps: ProcessStep[],
  customerDemand: number,
  availableTime: number
): SimulationResults {
  const taktTime = calculateTaktTime(availableTime, customerDemand);

  // Encontrar gargalo: maior TC entre etapas de processo
  const processSteps = steps.filter(
    (s) => s.category === 'process' || s.category === 'shipping'
  );

  let bottleneckId = '';
  let maxCycleTime = -1;

  for (const step of processSteps) {
    if (step.cycleTime > maxCycleTime) {
      maxCycleTime = step.cycleTime;
      bottleneckId = step.id;
    }
  }

  const stepMetrics: Record<string, StepMetrics> = {};
  let minCapacity = Infinity;
  let totalCycleTime = 0;
  let totalWip = 0;
  let processCount = 0;

  for (const step of steps) {
    const capacity = calculateStepCapacity(step, availableTime);
    const taktRatio = taktTime === Infinity ? 0 : step.cycleTime / taktTime;
    const taktGap = step.cycleTime - taktTime;
    const isBottleneck = step.id === bottleneckId;

    stepMetrics[step.id] = {
      id: step.id,
      capacity,
      taktRatio,
      taktGap,
      isBottleneck,
    };

    if (step.category === 'process' || step.category === 'shipping') {
      if (capacity < minCapacity) minCapacity = capacity;
      totalCycleTime += step.cycleTime;
      totalWip += step.wip;
      processCount++;
    }
  }

  const lineCapacity = minCapacity === Infinity ? 0 : minCapacity;
  const leadTime = totalCycleTime + (totalWip * taktTime) / 60;
  const bottleneckStep = steps.find((s) => s.id === bottleneckId);
  const bottleneckCT = bottleneckStep?.cycleTime ?? 0;
  const avgCT = processCount > 0 ? totalCycleTime / processCount : 0;
  const lineBalance = bottleneckCT > 0 ? avgCT / bottleneckCT : 0;
  const meetsDemand = lineCapacity >= customerDemand;

  return {
    taktTime,
    lineCapacity,
    leadTime,
    lineBalance,
    bottleneckId,
    stepMetrics,
    meetsDemand,
  };
}

export function getRecommendations(
  bottleneck: ProcessStep | undefined,
  results: SimulationResults
): Recommendation[] {
  if (!bottleneck) return [];

  const recs: Recommendation[] = [];

  if (bottleneck.cycleTime > results.taktTime) {
    recs.push({
      title: 'Balanceamento de Linha',
      description: `Redistribua parte do trabalho da etapa "${bottleneck.name}" para etapas vizinhas com capacidade ociosa. O TC atual (${bottleneck.cycleTime.toFixed(0)}s) excede o Takt Time (${results.taktTime.toFixed(1)}s).`,
      icon: 'scale',
    });
  }

  if (bottleneck.setupTime > 0) {
    recs.push({
      title: 'Kaizen de Setup (SMED)',
      description: `A etapa "${bottleneck.name}" tem TRF de ${bottleneck.setupTime.toFixed(0)}s. Aplique a metodologia SMED para reduzir o tempo de setup, convertendo atividades internas em externas e padronizando trocas.`,
      icon: 'wrench',
    });
  }

  recs.push({
    title: 'Trabalho Padronizado',
    description: `Documente e padronize a operação da etapa "${bottleneck.name}". Crie folhas de trabalho padronizado definindo sequência, tempo e estoque em processo para eliminar variações.`,
    icon: 'clipboard',
  });

  if (bottleneck.wip > 100) {
    recs.push({
      title: 'Redução de WIP',
      description: `O estoque intermediário de "${bottleneck.name}" é de ${bottleneck.wip} unidades. Reduza o WIP para enxergar problemas ocultos e encurtar o lead time.`,
      icon: 'box',
    });
  }

  if (results.lineBalance < 0.7) {
    recs.push({
      title: 'Balanceamento de Linha Crítico',
      description: `O índice de balanceamento é de ${(results.lineBalance * 100).toFixed(0)}%. A linha está desbalanceada — considere realocar recursos ou combinar etapas subutilizadas.`,
      icon: 'alert',
    });
  }

  return recs;
}
