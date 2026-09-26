import type { ProcessStep, ProjectInfo, Scenario, SimulationResults } from './types';

export const DEFAULT_PROJECT: ProjectInfo = {
  area: '',
  family: 'CAMAS INFANTIS',
  product: 'MÓVEL SERIADO',
  supplier: 'Fornecedor',
  customer: 'Cliente final',
  owner: '',
  referenceDate: new Date().toISOString().slice(0, 10),
  deliveryFrequencyDays: 1,
  shipmentFrequencyDays: 1,
};

const TEMPLATE_STEPS: ProcessStep[] = [
  { id: 'posicionar-caixa', name: 'Posicionar caixa na esteira', cycleTimeSec: 690, setupTimeMin: 0, batchSize: 1, operators: 1, availabilityPercent: 100, wipUnits: 0, flowAfter: 'push' },
  { id: 'iniciar-montagem', name: 'Início da montagem da caixa', cycleTimeSec: 1620, setupTimeMin: 0, batchSize: 1, operators: 1, availabilityPercent: 100, wipUnits: 0, flowAfter: 'push' },
  { id: 'finalizar-montagem', name: 'Finalizar montagem e fechamento', cycleTimeSec: 2160, setupTimeMin: 0, batchSize: 1, operators: 1, availabilityPercent: 100, wipUnits: 0, flowAfter: 'push' },
  { id: 'passar-fita', name: 'Passar fita de fechamento', cycleTimeSec: 450, setupTimeMin: 0, batchSize: 1, operators: 1, availabilityPercent: 100, wipUnits: 0, flowAfter: 'push' },
  { id: 'tunel-embalamento', name: 'Túnel de embalamento', cycleTimeSec: 1980, setupTimeMin: 0, batchSize: 1, operators: 1, availabilityPercent: 100, wipUnits: 0, flowAfter: 'push' },
  { id: 'adesivo-empilhamento', name: 'Colagem de adesivo e empilhamento', cycleTimeSec: 900, setupTimeMin: 0, batchSize: 1, operators: 1, availabilityPercent: 100, wipUnits: 0, flowAfter: 'push' },
];

export function createDefaultScenario(id: 'current' | 'future'): Scenario {
  return {
    id,
    name: id === 'current' ? 'Estado atual' : 'Estado futuro',
    monthlyDemand: 5,
    workdaysPerMonth: 21,
    availableMinutesPerDay: 558,
    steps: TEMPLATE_STEPS.map((step) => ({ ...step, id: `${id}-${step.id}` })),
    infoSupplierFlow: 'manual',
    infoShopFloorFlow: 'manual',
    infoCustomerFlow: 'electronic',
  };
}

export function cloneAsFuture(current: Scenario): Scenario {
  return {
    ...current,
    id: 'future',
    name: 'Estado futuro',
    steps: current.steps.map((step) => ({
      ...step,
      id: step.id.replace(/^current-/, 'future-'),
    })),
  };
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function simulate(scenario: Scenario): SimulationResults {
  const workdays = finitePositive(scenario.workdaysPerMonth, 1);
  const availableMinutes = finitePositive(scenario.availableMinutesPerDay, 1);
  const availableSeconds = availableMinutes * 60;
  const dailyDemand = Math.max(0, scenario.monthlyDemand) / workdays;
  const taktTimeSec = dailyDemand > 0 ? availableSeconds / dailyDemand : Infinity;

  let bottleneckId = '';
  let minCapacity = Infinity;
  let maxEffectiveCycle = -1;
  let totalCycleTime = 0;
  let totalWip = 0;

  const provisional = scenario.steps.map((step) => {
    const availability = Math.min(100, Math.max(1, finitePositive(step.availabilityPercent, 100))) / 100;
    const batchSize = finitePositive(step.batchSize, 1);
    const operators = finitePositive(step.operators, 1);
    const baseCycle = Math.max(0, step.cycleTimeSec);
    const setupPerUnitSec = (Math.max(0, step.setupTimeMin) * 60) / batchSize;
    const effectiveCycleTimeSec = (baseCycle + setupPerUnitSec) / availability;
    const capacityPerDay = effectiveCycleTimeSec > 0
      ? (availableSeconds * operators) / effectiveCycleTimeSec
      : Infinity;

    if (effectiveCycleTimeSec > maxEffectiveCycle) {
      maxEffectiveCycle = effectiveCycleTimeSec;
      bottleneckId = step.id;
    }
    if (capacityPerDay < minCapacity) minCapacity = capacityPerDay;
    totalCycleTime += baseCycle;
    totalWip += Math.max(0, step.wipUnits);

    return { step, effectiveCycleTimeSec, capacityPerDay };
  });

  const inventoryLeadTimeDays = dailyDemand > 0 ? totalWip / dailyDemand : 0;
  const processingTimeMin = totalCycleTime / 60;
  const processingLeadTimeDays = processingTimeMin / availableMinutes;
  const leadTimeDays = inventoryLeadTimeDays + processingLeadTimeDays;
  const finiteCapacity = minCapacity === Infinity ? 0 : minCapacity;
  const lineBalance = maxEffectiveCycle > 0 && scenario.steps.length > 0
    ? provisional.reduce((sum, item) => sum + item.effectiveCycleTimeSec, 0) /
      (maxEffectiveCycle * scenario.steps.length)
    : 0;

  const stepMetrics = Object.fromEntries(
    provisional.map(({ step, effectiveCycleTimeSec, capacityPerDay }) => [
      step.id,
      {
        effectiveCycleTimeSec,
        capacityPerDay,
        taktRatio: taktTimeSec === Infinity ? 0 : effectiveCycleTimeSec / taktTimeSec,
        inventoryDays: dailyDemand > 0 ? Math.max(0, step.wipUnits) / dailyDemand : 0,
        isBottleneck: step.id === bottleneckId,
        isOverTakt: taktTimeSec !== Infinity && effectiveCycleTimeSec > taktTimeSec * finitePositive(step.operators, 1),
      },
    ])
  );

  return {
    dailyDemand,
    taktTimeSec,
    capacityPerDay: finiteCapacity,
    leadTimeDays,
    inventoryLeadTimeDays,
    processingTimeMin,
    lineBalance,
    totalWip,
    bottleneckId,
    meetsDemand: dailyDemand > 0 && finiteCapacity >= dailyDemand,
    stepMetrics,
  };
}

export function newStep(scenarioId: 'current' | 'future', index: number): ProcessStep {
  return {
    id: `${scenarioId}-process-${Date.now()}-${index}`,
    name: `Processo ${index}`,
    cycleTimeSec: 60,
    setupTimeMin: 0,
    batchSize: 1,
    operators: 1,
    availabilityPercent: 100,
    wipUnits: 0,
    flowAfter: 'push',
  };
}
