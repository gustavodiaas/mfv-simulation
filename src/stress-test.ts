import type { CanvasElement, ScenarioAssumptions } from './canvas-types';

export interface StressTestSettings {
  days: number;
  demandPercent: number;
  cycleVariationPercent: number;
  extraDowntimePercent: number;
}

export interface StressProcessResult {
  id: string;
  label: string;
  produced: number;
  goodOutput: number;
  utilizationPercent: number;
  maxQueue: number;
  starvationMinutes: number;
  blockedMinutes: number;
  lostMinutes: number;
  effectiveCycleSec: number;
}

export interface StressDayResult {
  day: number;
  required: number;
  delivered: number;
  backlog: number;
  serviceLevelPercent: number;
  wip: number;
}

export interface StressTestResult {
  status: 'stable' | 'attention' | 'rupture' | 'invalid';
  requestedUnits: number;
  deliveredUnits: number;
  backlogUnits: number;
  serviceLevelPercent: number;
  maxWip: number;
  ruptureDay: number | null;
  constraintId: string | null;
  constraintLabel: string;
  headline: string;
  explanation: string;
  recommendation: string;
  processResults: StressProcessResult[];
  dayResults: StressDayResult[];
}

interface PreparedProcess {
  element: CanvasElement;
  effectiveCycleSec: number;
  capacityPerMinute: number;
  quality: number;
  bufferLimit: number;
  initialQueue: number;
}

const STOCK_KINDS = ['inventory', 'safety-stock', 'buffer', 'supermarket', 'fifo'] as const;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function elementWidth(element: CanvasElement) {
  return Math.max(30, Number(element.data.width) || (element.kind === 'shared-process' ? 170 : 150));
}

function prepareProcesses(elements: CanvasElement[]) {
  const rawProcesses = elements
    .filter((element) => element.kind === 'process' || element.kind === 'shared-process')
    .sort((left, right) => left.x - right.x);
  const stocks = elements.filter((element) => STOCK_KINDS.includes(element.kind as typeof STOCK_KINDS[number]));

  return rawProcesses.map((element, index): PreparedProcess => {
    const cycleTime = Math.max(0, Number(element.data.tc) || 0);
    const setupPerUnitSec = (Math.max(0, Number(element.data.setup) || 0) * 60)
      / Math.max(1, Number(element.data.lote) || 1);
    const resources = Math.max(1, Number(element.data.recurso) || 1);
    const availability = clamp(Number(element.data.disp) || 100, 1, 100) / 100;
    const quality = clamp(Number(element.data.qualidade) || 100, 0.1, 100) / 100;
    const effectiveCycleSec = cycleTime > 0 ? (cycleTime + setupPerUnitSec) / (resources * availability) : 0;
    const next = rawProcesses[index + 1];
    const processEnd = element.x + elementWidth(element);
    const nextStart = next?.x ?? Infinity;
    const stockBetween = stocks.filter((stock) => {
      const center = stock.x + Math.max(30, Number(stock.data.width) || 70) / 2;
      return center > processEnd && center < nextStart;
    });
    const initialQueue = stockBetween.reduce((sum, stock) => sum + Math.max(0, Number(stock.data.qty) || 0), 0);
    const controlledLimits = stockBetween
      .filter((stock) => stock.kind === 'supermarket' || stock.kind === 'fifo' || stock.kind === 'buffer')
      .map((stock) => Math.max(0, Number(stock.data.qty) || 0))
      .filter((quantity) => quantity > 0);
    const bufferLimit = controlledLimits.length ? Math.min(...controlledLimits) : Infinity;
    return {
      element,
      effectiveCycleSec,
      capacityPerMinute: effectiveCycleSec > 0 ? 60 / effectiveCycleSec : 0,
      quality,
      bufferLimit,
      initialQueue: index === rawProcesses.length - 1 ? 0 : initialQueue,
    };
  });
}

export function runStressTest(
  elements: CanvasElement[],
  assumptions: ScenarioAssumptions,
  settings: StressTestSettings,
): StressTestResult {
  const days = clamp(Math.round(settings.days) || 1, 1, 30);
  const minutesPerDay = clamp(Math.round(assumptions.availableMinutesPerDay) || 1, 1, 1440);
  const workdays = Math.max(1, assumptions.workdaysPerMonth);
  const baseDailyDemand = Math.max(0, assumptions.productMix.reduce((sum, product) => sum + Math.max(0, product.monthlyDemand), 0)) / workdays;
  const dailyDemand = baseDailyDemand * clamp(settings.demandPercent, 10, 300) / 100;
  const variation = clamp(settings.cycleVariationPercent, 0, 100) / 100;
  const downtime = clamp(settings.extraDowntimePercent, 0, 80) / 100;
  const processes = prepareProcesses(elements);

  if (!processes.length || processes.some((process) => process.effectiveCycleSec <= 0) || dailyDemand <= 0) {
    return {
      status: 'invalid', requestedUnits: 0, deliveredUnits: 0, backlogUnits: 0,
      serviceLevelPercent: 0, maxWip: 0, ruptureDay: null, constraintId: null,
      constraintLabel: 'Dados incompletos',
      headline: 'O teste ainda não pode ser executado',
      explanation: dailyDemand <= 0
        ? 'Informe uma demanda maior que zero para gerar a carga do cenário.'
        : 'Preencha o tempo de ciclo de todos os processos produtivos antes de testar o fluxo.',
      recommendation: 'Complete os dados destacados no MFV e execute o teste novamente.',
      processResults: [], dayResults: [],
    };
  }

  const totalMinutes = days * minutesPerDay;
  const queues = Array.from({ length: processes.length }, (_, index) => index === 0 ? 0 : processes[index - 1].initialQueue);
  const produced = processes.map(() => 0);
  const goodOutput = processes.map(() => 0);
  const busyMinutes = processes.map(() => 0);
  const starvationMinutes = processes.map(() => 0);
  const blockedMinutes = processes.map(() => 0);
  const lostMinutes = processes.map(() => 0);
  const maxQueues = processes.map((_, index) => queues[index]);
  const dailyReleaseRate = dailyDemand / minutesPerDay;
  let delivered = 0;
  let maxWip = queues.reduce((sum, queue) => sum + queue, 0);
  let ruptureDay: number | null = null;
  const dayResults: StressDayResult[] = [];

  for (let minute = 0; minute < totalMinutes; minute += 1) {
    const minuteInDay = minute % minutesPerDay;
    queues[0] += dailyReleaseRate;

    for (let index = processes.length - 1; index >= 0; index -= 1) {
      const process = processes[index];
      const stopWindow = Math.round(minutesPerDay * downtime);
      const stopStart = stopWindow > 0
        ? Math.floor(((index + 1) * minutesPerDay) / (processes.length + 2))
        : -1;
      const stopped = stopWindow > 0 && minuteInDay >= stopStart && minuteInDay < stopStart + stopWindow;
      if (stopped) {
        lostMinutes[index] += 1;
        continue;
      }

      const wave = Math.sin((minute + 1) * (0.071 + index * 0.013) + index * 1.7);
      const cycleMultiplier = Math.max(0.2, 1 + variation * wave);
      const minuteCapacity = process.capacityPerMinute / cycleMultiplier;
      if (queues[index] <= 0.0001) {
        starvationMinutes[index] += 1;
        continue;
      }

      const downstreamSpace = index === processes.length - 1
        ? Infinity
        : Math.max(0, process.bufferLimit - queues[index + 1]);
      const maximumInputBySpace = Number.isFinite(downstreamSpace)
        ? downstreamSpace / process.quality
        : Infinity;
      const processed = Math.min(queues[index], minuteCapacity, maximumInputBySpace);
      if (processed <= 0.0001) {
        blockedMinutes[index] += 1;
        continue;
      }
      if (processed + 0.0001 < Math.min(queues[index], minuteCapacity)) blockedMinutes[index] += 1;
      queues[index] -= processed;
      const good = processed * process.quality;
      produced[index] += processed;
      goodOutput[index] += good;
      busyMinutes[index] += processed / Math.max(minuteCapacity, 0.0001);
      if (index === processes.length - 1) delivered += good;
      else queues[index + 1] += good;
    }

    queues.forEach((queue, index) => { maxQueues[index] = Math.max(maxQueues[index], queue); });
    maxWip = Math.max(maxWip, queues.reduce((sum, queue) => sum + queue, 0));

    if (minuteInDay === minutesPerDay - 1) {
      const day = Math.floor(minute / minutesPerDay) + 1;
      const required = dailyDemand * day;
      const backlog = Math.max(0, required - delivered);
      const serviceLevelPercent = required > 0 ? Math.min(100, delivered / required * 100) : 100;
      if (backlog >= Math.max(1, dailyDemand * 0.05) && ruptureDay === null) ruptureDay = day;
      dayResults.push({
        day,
        required,
        delivered,
        backlog,
        serviceLevelPercent,
        wip: queues.reduce((sum, queue) => sum + queue, 0),
      });
    }
  }

  const requestedUnits = dailyDemand * days;
  const backlogUnits = Math.max(0, requestedUnits - delivered);
  const serviceLevelPercent = requestedUnits > 0 ? Math.min(100, delivered / requestedUnits * 100) : 100;
  const processResults = processes.map((process, index): StressProcessResult => ({
    id: process.element.id,
    label: process.element.label,
    produced: produced[index],
    goodOutput: goodOutput[index],
    utilizationPercent: totalMinutes > 0 ? Math.min(100, busyMinutes[index] / totalMinutes * 100) : 0,
    maxQueue: maxQueues[index],
    starvationMinutes: starvationMinutes[index],
    blockedMinutes: blockedMinutes[index],
    lostMinutes: lostMinutes[index],
    effectiveCycleSec: process.effectiveCycleSec,
  }));
  const constraint = processResults.reduce((worst, process, index) => {
    const upstreamQueue = maxQueues[index];
    const score = process.utilizationPercent + upstreamQueue * 2 + process.blockedMinutes / Math.max(1, totalMinutes) * 30;
    return !worst || score > worst.score ? { process, score } : worst;
  }, undefined as { process: StressProcessResult; score: number } | undefined)?.process;
  const status: StressTestResult['status'] = backlogUnits >= Math.max(1, requestedUnits * 0.05)
    ? 'rupture'
    : (maxWip > dailyDemand || serviceLevelPercent < 99 ? 'attention' : 'stable');
  const bottleneckQueue = constraint ? processResults.find((process) => process.id === constraint.id)?.maxQueue ?? 0 : 0;
  const headline = status === 'rupture'
    ? `O fluxo rompe no dia ${ruptureDay ?? days}`
    : status === 'attention'
      ? 'O fluxo atende, mas opera sob pressão'
      : 'O fluxo permanece estável no teste';
  const explanation = status === 'rupture'
    ? `${constraint?.label ?? 'A linha'} limita a vazão. Ao final, ${backlogUnits.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} unidade(s) ficam atrasadas e a maior fila chega a ${bottleneckQueue.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}.`
    : status === 'attention'
      ? `A demanda foi atendida em ${serviceLevelPercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%, porém o WIP chegou a ${maxWip.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} unidade(s).`
      : `A linha entregou ${delivered.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} unidade(s), sem atraso relevante e com WIP máximo de ${maxWip.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}.`;
  const recommendation = status === 'rupture'
    ? `Atue primeiro em ${constraint?.label ?? 'processo restritivo'}: teste redução de ciclo/setup, disponibilidade ou recurso adicional antes de aumentar estoques.`
    : status === 'attention'
      ? `Observe ${constraint?.label ?? 'o processo mais carregado'} e reduza a liberação excessiva antes que a fila se transforme em atraso.`
      : 'O cenário suporta esta pressão. Aumente gradualmente a demanda ou as perdas para descobrir a margem real de segurança.';

  return {
    status,
    requestedUnits,
    deliveredUnits: delivered,
    backlogUnits,
    serviceLevelPercent,
    maxWip,
    ruptureDay,
    constraintId: constraint?.id ?? null,
    constraintLabel: constraint?.label ?? '—',
    headline,
    explanation,
    recommendation,
    processResults,
    dayResults,
  };
}
