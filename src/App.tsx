import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity, AlertTriangle, BarChart3, BookOpen, Calculator, CheckCircle2, Copy, Download, FileImage, FileText, GitCompareArrows,
  ImageDown, LayoutTemplate, Loader2, Map, Palette, PanelLeftClose, PanelLeftOpen, Pencil, Plus,
  Pause, Play, RotateCcw, Route, Save, Square, Trash2, X, ZoomIn, ZoomOut, Minus,
} from 'lucide-react';
import {
  ARROW_KINDS, DEFAULT_TRUCK_COLOR, LIBRARY, makeId,
  type CanvasArrow, type CanvasElement, type CanvasState,
  type ElementKind, type LibraryItem, type ScenarioAssumptions,
} from './canvas-types';
import {
  BufferSymbol, CustomerDemandSymbol, DataBoxSymbol, ExtendedSymbol, FifoSymbol,
  HeijunkaSymbol, InterventionSymbol, InventorySymbol, KaizenSymbol,
  IdentificationSymbol,
  KanbanBoardSymbol, KanbanProductionSymbol, KanbanWithdrawalSymbol,
  LegendSymbol, NoteSymbol, OperatorSymbol, PartySymbol, PlanningSymbol,
  ProcessSymbol, ProductionScheduleSymbol, SequencingBoxSymbol,
  ShippingPointSymbol, SupermarketSymbol, TimelineSymbol, TruckSymbol,
  WorkCellSymbol,
} from './MfvSymbols';
import { exportJPEG, exportPDF, exportSVG, type PaperSize } from './export';
import type { Scenario } from './types';
import truckThreeQuarter from './assets/truck-three-quarter.png';

// ─── Storage ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'mfv-canvas:v5';
const PREVIOUS_STORAGE_KEY = 'mfv-canvas:v4';
const OLDER_STORAGE_KEY = 'mfv-canvas:v3';
const OLDEST_STORAGE_KEY = 'mfv-canvas:v2';
const LEGACY_STORAGE_KEY = 'mfv-simulation:v2';
const FIXED_PLANNING_ID = '__mfv-demand-planning__';
const FIXED_IDENTIFICATION_ID = '__mfv-identification__';
const GRID_SIZE = 20;
const ALIGN_THRESHOLD = 8;
const DEFAULT_THEME_COLOR = '#0071e3';
type ActiveKind = 'current' | 'future';
type ScenarioPreset = 'current' | 'demand-up' | 'demand-down' | 'setup-half' | 'availability-up' | 'bottleneck-resource' | 'quality-up';

interface FutureVariant {
  id: string;
  name: string;
  canvas: CanvasState;
}

interface CanvasWorkspace {
  current: CanvasState;
  futures: FutureVariant[];
  activeFutureId: string;
}

function validThemeColor(value: unknown) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_THEME_COLOR;
}

function defaultElementDimensions(element: Pick<CanvasElement, 'kind'>) {
  if (element.kind === 'identification') return { width: 390, height: 100 };
  if (element.kind === 'planning') return { width: 190, height: 142 };
  const item = LIBRARY.find((candidate) => candidate.kind === element.kind);
  return { width: item?.w || 120, height: item?.h || 80 };
}

function elementDimensions(element: CanvasElement) {
  const defaults = defaultElementDimensions(element);
  return {
    width: Math.min(1200, Math.max(30, Number(element.data.width) || defaults.width)),
    height: Math.min(800, Math.max(30, Number(element.data.height) || defaults.height)),
  };
}

const DEFAULT_ASSUMPTIONS: ScenarioAssumptions = {
  monthlyDemand: 5,
  workdaysPerMonth: 21,
  availableMinutesPerDay: 558,
};

function positiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function calculateScenario(assumptions: ScenarioAssumptions) {
  const dailyDemand = assumptions.monthlyDemand / assumptions.workdaysPerMonth;
  const taktTimeSec = dailyDemand > 0
    ? (assumptions.availableMinutesPerDay * 60) / dailyDemand
    : 0;
  return { dailyDemand, taktTimeSec };
}

function calculateProcessLoad(element: CanvasElement, dailyDemand: number, cumulativeYield: number, availableMinutesPerDay: number) {
  const cycleTime = Math.max(0, Number(element.data.tc) || 0);
  const setupPerUnit = (Math.max(0, Number(element.data.setup) || 0) * 60)
    / Math.max(1, Number(element.data.lote) || 1);
  const resources = Math.max(1, Number(element.data.recurso) || 1);
  const availability = Math.min(100, Math.max(1, Number(element.data.disp) || 100)) / 100;
  const effectiveCycleSec = (cycleTime + setupPerUnit) / (resources * availability);
  const rawCapacityPerDay = effectiveCycleSec > 0
    ? (availableMinutesPerDay * 60) / effectiveCycleSec
    : Infinity;
  const requiredInputPerDay = cumulativeYield > 0 ? dailyDemand / cumulativeYield : Infinity;
  const capacityPerDay = rawCapacityPerDay * cumulativeYield;
  const loadPercent = rawCapacityPerDay > 0 && Number.isFinite(requiredInputPerDay)
    ? (requiredInputPerDay / rawCapacityPerDay) * 100
    : 0;
  const valid = cycleTime > 0;
  return { effectiveCycleSec, loadPercent, valid, overloaded: valid && loadPercent > 100, capacityPerDay, requiredInputPerDay };
}

function calculateCanvasSimulation(canvas: CanvasState) {
  const { dailyDemand, taktTimeSec } = calculateScenario(canvas.assumptions);
  const processElements = canvas.elements
    .filter((element) => ['process','shared-process'].includes(element.kind))
    .sort((a, b) => a.x - b.x);
  let cumulativeYield = 1;
  const processMetrics = [...processElements].reverse().map((element) => {
    const quality = Math.min(100, Math.max(0.1, Number(element.data.qualidade) || 100)) / 100;
    cumulativeYield *= quality;
    return {
      element,
      quality,
      ...calculateProcessLoad(element, dailyDemand, cumulativeYield, canvas.assumptions.availableMinutesPerDay),
    };
  }).reverse();
  const finiteCapacities = processMetrics.map((metric) => metric.capacityPerDay).filter(Number.isFinite);
  const bottleneckCapacity = finiteCapacities.length ? Math.min(...finiteCapacities) : 0;
  const bottleneck = processMetrics.find((metric) => metric.capacityPerDay === bottleneckCapacity)?.element;
  const stockKinds: ElementKind[] = ['inventory','safety-stock','buffer','supermarket','fifo','waiting-time'];
  const inventoryElements = canvas.elements
    .filter((element) => stockKinds.includes(element.kind))
    .sort((a, b) => a.x - b.x);
  const physicalInventoryElements = inventoryElements.filter((element) => element.kind !== 'waiting-time');
  const waitingElements = inventoryElements.filter((element) => element.kind === 'waiting-time');
  const totalInventory = physicalInventoryElements
    .reduce((sum, element) => sum + Math.max(0, Number(element.data.qty) || 0), 0);
  const inventoryDays = dailyDemand > 0 ? totalInventory / dailyDemand : 0;
  const waitingTimeMin = waitingElements.reduce((sum, element) => sum + Math.max(0, Number(element.data.durationMin) || 0), 0);
  const waitingLeadTimeDays = canvas.assumptions.availableMinutesPerDay > 0 ? waitingTimeMin / canvas.assumptions.availableMinutesPerDay : 0;
  const processingTimeMin = processElements.reduce((sum, element) => sum + Math.max(0, Number(element.data.tc) || 0), 0) / 60;
  const timelineItems = [
    ...processElements.map((element) => {
      const size = elementDimensions(element);
      return {
        id: element.id,
        type: 'process' as const,
        x: element.x + size.width / 2,
        width: size.width,
        value: Math.max(0, Number(element.data.tc) || 0) / 60,
      };
    }),
    ...inventoryElements.map((element) => {
      const size = elementDimensions(element);
      const value = element.kind === 'waiting-time'
        ? Math.max(0, Number(element.data.durationMin) || 0) / canvas.assumptions.availableMinutesPerDay
        : dailyDemand > 0
          ? Math.max(0, Number(element.data.qty) || 0) / dailyDemand
          : 0;
      return { id: element.id, type: 'inventory' as const, x: element.x + size.width / 2, width: size.width, value };
    }),
  ].sort((a, b) => a.x - b.x);
  return {
    dailyDemand,
    taktTimeSec,
    processElements,
    processMetrics,
    invalidProcesses: processMetrics.filter((metric) => !metric.valid),
    overloadedProcesses: processMetrics.filter((metric) => metric.overloaded),
    bottleneckCapacity,
    bottleneck,
    inventoryDays,
    waitingTimeMin,
    waitingLeadTimeDays,
    processingTimeMin,
    leadTimeDays: inventoryDays + waitingLeadTimeDays,
    timelineItems,
    inventoryElements,
  };
}

function planningData(assumptions: ScenarioAssumptions) {
  const metrics = calculateScenario(assumptions);
  return {
    demanda: assumptions.monthlyDemand,
    demandaDiaria: metrics.dailyDemand,
    diasUteis: assumptions.workdaysPerMonth,
    minutosDia: assumptions.availableMinutesPerDay,
    takt: metrics.taktTimeSec,
  };
}

function createFixedPlanning(assumptions: ScenarioAssumptions): CanvasElement {
  return {
    id: FIXED_PLANNING_ID,
    kind: 'planning',
    x: 520,
    y: 30,
    label: 'Controle da Produção',
    data: planningData(assumptions),
  };
}

function createFixedIdentification(planning: CanvasElement): CanvasElement {
  return {
    id: FIXED_IDENTIFICATION_ID,
    kind: 'identification',
    x: planning.x - 100,
    y: Math.max(-60, planning.y - 115),
    label: 'Identificação do MFV',
    data: { family: '', companyName: '', productName: '', companyImage: '', productImage: '' },
  };
}

function normalizeCanvas(raw: Partial<CanvasState> | undefined, legacy?: Partial<Scenario>, resetThemeLinkedTrucks = false): CanvasState {
  const elements = Array.isArray(raw?.elements) ? raw.elements : [];
  const existingPlanning = elements.find((element) => element.id === FIXED_PLANNING_ID)
    ?? elements.find((element) => element.kind === 'planning');
  const assumptions: ScenarioAssumptions = {
    monthlyDemand: positiveNumber(raw?.assumptions?.monthlyDemand ?? legacy?.monthlyDemand ?? existingPlanning?.data.demanda, DEFAULT_ASSUMPTIONS.monthlyDemand),
    workdaysPerMonth: positiveNumber(raw?.assumptions?.workdaysPerMonth ?? legacy?.workdaysPerMonth ?? existingPlanning?.data.diasUteis, DEFAULT_ASSUMPTIONS.workdaysPerMonth),
    availableMinutesPerDay: positiveNumber(raw?.assumptions?.availableMinutesPerDay ?? legacy?.availableMinutesPerDay ?? existingPlanning?.data.minutosDia, DEFAULT_ASSUMPTIONS.availableMinutesPerDay),
  };
  const fixedPlanning = existingPlanning
    ? { ...existingPlanning, id: FIXED_PLANNING_ID, kind: 'planning' as const, data: { ...existingPlanning.data, ...planningData(assumptions) } }
    : createFixedPlanning(assumptions);
  const existingIdentification = elements.find((element) => element.id === FIXED_IDENTIFICATION_ID)
    ?? elements.find((element) => element.kind === 'identification');
  const fixedIdentification = existingIdentification
    ? { ...existingIdentification, id: FIXED_IDENTIFICATION_ID, kind: 'identification' as const }
    : createFixedIdentification(fixedPlanning);
  const themeColor = validThemeColor(raw?.themeColor);
  return {
    elements: [
      fixedIdentification,
      fixedPlanning,
      ...elements.filter((element) => element !== existingPlanning && element !== existingIdentification
        && element.id !== FIXED_PLANNING_ID && element.id !== FIXED_IDENTIFICATION_ID && element.kind !== 'timeline')
        .map((element) => ['process','shared-process'].includes(element.kind) && element.data.qualidade === undefined
          ? { ...element, data: { ...element.data, qualidade: 100 } }
          : element)
        .map((element) => element.kind === 'resource-zone' && element.label === 'RECURSOS DA CÉLULA / MANUTENÇÃO'
          ? { ...element, label: 'ÁREA DE INTERVENÇÃO' }
          : element)
        .map((element) => element.kind === 'customer' && element.label === 'Cliente'
          ? { ...element, label: 'Cliente final' }
          : element)
        .map((element) => {
          if (element.kind !== 'truck') return element;
          const truckColor = String(element.data.color ?? '');
          const shouldRestoreDefault = !truckColor || (resetThemeLinkedTrucks && truckColor.toLowerCase() === themeColor.toLowerCase());
          return shouldRestoreDefault ? { ...element, data: { ...element.data, color: DEFAULT_TRUCK_COLOR } } : element;
        }),
    ],
    arrows: Array.isArray(raw?.arrows) ? raw.arrows : [],
    assumptions,
    themeColor,
  };
}

function cloneCanvas(canvas: CanvasState): CanvasState {
  return JSON.parse(JSON.stringify(canvas)) as CanvasState;
}

function mergeForwardData(
  previous: Record<string, string | number>,
  current: Record<string, string | number>,
  future: Record<string, string | number>,
) {
  const merged = { ...future };
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
  keys.forEach((key) => {
    const existedBefore = Object.prototype.hasOwnProperty.call(previous, key);
    const existsNow = Object.prototype.hasOwnProperty.call(current, key);
    const existsInFuture = Object.prototype.hasOwnProperty.call(future, key);
    if ((!existedBefore && !existsInFuture) || (existedBefore && Object.is(future[key], previous[key]))) {
      if (existsNow) merged[key] = current[key];
      else delete merged[key];
    }
  });
  return merged;
}

function mergeForwardElement(previous: CanvasElement, current: CanvasElement, future: CanvasElement): CanvasElement {
  return {
    ...future,
    kind: future.kind === previous.kind ? current.kind : future.kind,
    x: future.x === previous.x ? current.x : future.x,
    y: future.y === previous.y ? current.y : future.y,
    label: future.label === previous.label ? current.label : future.label,
    data: mergeForwardData(previous.data, current.data, future.data),
  };
}

function mergeForwardArrow(previous: CanvasArrow, current: CanvasArrow, future: CanvasArrow): CanvasArrow {
  return {
    ...future,
    kind: future.kind === previous.kind ? current.kind : future.kind,
    x1: future.x1 === previous.x1 ? current.x1 : future.x1,
    y1: future.y1 === previous.y1 ? current.y1 : future.y1,
    x2: future.x2 === previous.x2 ? current.x2 : future.x2,
    y2: future.y2 === previous.y2 ? current.y2 : future.y2,
    label: future.label === previous.label ? current.label : future.label,
  };
}

function syncCurrentIntoFuture(previousCurrent: CanvasState, current: CanvasState, future: CanvasState): CanvasState {
  const previousElements = new globalThis.Map(previousCurrent.elements.map((element) => [element.id, element]));
  const currentElements = new globalThis.Map(current.elements.map((element) => [element.id, element]));
  const futureElements = future.elements
    .filter((element) => !previousElements.has(element.id) || currentElements.has(element.id))
    .map((element) => {
      const previous = previousElements.get(element.id);
      const next = currentElements.get(element.id);
      return previous && next ? mergeForwardElement(previous, next, element) : element;
    });
  const futureElementIds = new Set(futureElements.map((element) => element.id));
  current.elements.forEach((element) => {
    if (!previousElements.has(element.id) && !futureElementIds.has(element.id)) futureElements.push(JSON.parse(JSON.stringify(element)) as CanvasElement);
  });

  const previousArrows = new globalThis.Map(previousCurrent.arrows.map((arrow) => [arrow.id, arrow]));
  const currentArrows = new globalThis.Map(current.arrows.map((arrow) => [arrow.id, arrow]));
  const futureArrows = future.arrows
    .filter((arrow) => !previousArrows.has(arrow.id) || currentArrows.has(arrow.id))
    .map((arrow) => {
      const previous = previousArrows.get(arrow.id);
      const next = currentArrows.get(arrow.id);
      return previous && next ? mergeForwardArrow(previous, next, arrow) : arrow;
    });
  const futureArrowIds = new Set(futureArrows.map((arrow) => arrow.id));
  current.arrows.forEach((arrow) => {
    if (!previousArrows.has(arrow.id) && !futureArrowIds.has(arrow.id)) futureArrows.push({ ...arrow });
  });

  const assumptions = { ...future.assumptions };
  (Object.keys(current.assumptions) as (keyof ScenarioAssumptions)[]).forEach((key) => {
    if (future.assumptions[key] === previousCurrent.assumptions[key]) assumptions[key] = current.assumptions[key];
  });

  const themeColor = future.themeColor === previousCurrent.themeColor ? current.themeColor : future.themeColor;
  return normalizeCanvas({ ...future, elements: futureElements, arrows: futureArrows, assumptions, themeColor });
}

function createExcelTemplate(assumptions: ScenarioAssumptions, scenario: ActiveKind): CanvasState {
  const processSpecs = [
    ['Posicionar caixa na esteira', 690],
    ['Início da montagem da caixa', 1620],
    ['Finalizar montagem e fechamento', 2160],
    ['Passar fita de fechamento', 450],
    ['Túnel de embalamento', 1980],
    ['Colagem de adesivo e empilhamento', 900],
  ] as const;
  const fixedPlanning = { ...createFixedPlanning(assumptions), x: 660, y: 20 };
  const processes = processSpecs.map(([label, tc], index): CanvasElement => ({
    id: `${scenario}-process-${index + 1}-${makeId()}`,
    kind: 'process',
    x: 220 + index * 210,
    y: 250,
    label,
    data: { tc, setup: 0, lote: 1, op: 1, recurso: 1, disp: 100, qualidade: 100 },
  }));
  const inventories = processSpecs.map((_, index): CanvasElement => ({
    id: `${scenario}-inventory-${index + 1}-${makeId()}`,
    kind: 'inventory',
    x: 382 + index * 210,
    y: 325,
    label: `Estoque ${index + 1}`,
    data: { qty: 0 },
  }));
  const supplier: CanvasElement = { id: `${scenario}-supplier-${makeId()}`, kind: 'supplier', x: 70, y: 25, label: 'Fornecedor', data: { freq: 1 } };
  const customer: CanvasElement = { id: `${scenario}-customer-${makeId()}`, kind: 'customer', x: 1380, y: 25, label: 'Cliente final', data: { freq: 1 } };
  const rawMaterial: CanvasElement = { id: `${scenario}-raw-${makeId()}`, kind: 'raw-material', x: 45, y: 275, label: 'Matéria-prima', data: { qty: 0 } };
  const shipping: CanvasElement = { id: `${scenario}-shipping-${makeId()}`, kind: 'shipping-point', x: 1510, y: 285, label: 'Expedição', data: {} };
  const materialNodes = [rawMaterial, ...processes, shipping];
  const materialArrows = materialNodes.slice(0, -1).map((node, index): CanvasArrow => {
    const next = materialNodes[index + 1];
    const nodeWidth = node.kind === 'raw-material' ? 110 : 150;
    return { id: `${scenario}-flow-${index}-${makeId()}`, kind: 'arrow-push', x1: node.x + nodeWidth, y1: node.y + 75, x2: next.x - 10, y2: next.y + 75 };
  });
  const informationArrows: CanvasArrow[] = [
    { id: `${scenario}-info-supplier-${makeId()}`, kind: 'arrow-info-manual', x1: fixedPlanning.x, y1: fixedPlanning.y + 65, x2: supplier.x + 120, y2: supplier.y + 40, label: 'Programação' },
    { id: `${scenario}-info-customer-${makeId()}`, kind: 'arrow-info-electronic', x1: customer.x, y1: customer.y + 40, x2: fixedPlanning.x + 190, y2: fixedPlanning.y + 65, label: 'Demanda' },
  ];
  return normalizeCanvas({
    assumptions,
    elements: [fixedPlanning, supplier, customer, rawMaterial, ...processes, ...inventories, shipping],
    arrows: [...materialArrows, ...informationArrows],
  });
}

function createFutureVariant(current: CanvasState, name = 'Cenário base', id = `future-${makeId()}`): FutureVariant {
  return { id, name, canvas: cloneCanvas(current) };
}

function loadWorkspace(): CanvasWorkspace {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const previousCanvasRaw = localStorage.getItem(PREVIOUS_STORAGE_KEY);
    const olderCanvasRaw = localStorage.getItem(OLDER_STORAGE_KEY);
    const oldestCanvasRaw = localStorage.getItem(OLDEST_STORAGE_KEY);
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    const legacy = legacyRaw ? JSON.parse(legacyRaw) as { current?: Scenario; future?: Scenario } : undefined;
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<CanvasWorkspace>;
      const current = normalizeCanvas(parsed.current, legacy?.current);
      const futures = Array.isArray(parsed.futures) && parsed.futures.length
        ? parsed.futures.map((variant) => ({ ...variant, canvas: normalizeCanvas(variant.canvas, legacy?.future) }))
        : [createFutureVariant(current)];
      return {
        current,
        futures,
        activeFutureId: futures.some((variant) => variant.id === parsed.activeFutureId) ? String(parsed.activeFutureId) : futures[0].id,
      };
    }
    if (previousCanvasRaw) {
      const parsed = JSON.parse(previousCanvasRaw) as Partial<CanvasWorkspace>;
      const current = normalizeCanvas(parsed.current, legacy?.current, true);
      const futures = Array.isArray(parsed.futures) && parsed.futures.length
        ? parsed.futures.map((variant) => ({ ...variant, canvas: normalizeCanvas(variant.canvas, legacy?.future, true) }))
        : [createFutureVariant(current)];
      const result: CanvasWorkspace = {
        current,
        futures,
        activeFutureId: futures.some((variant) => variant.id === parsed.activeFutureId) ? String(parsed.activeFutureId) : futures[0].id,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
      return result;
    }
    const priorRaw = olderCanvasRaw ?? oldestCanvasRaw;
    if (priorRaw) {
      const parsed = JSON.parse(priorRaw) as Partial<Record<ActiveKind, CanvasState>>;
      const current = normalizeCanvas(parsed.current, legacy?.current, true);
      const future = parsed.future ? normalizeCanvas(parsed.future, legacy?.future, true) : cloneCanvas(current);
      const result: CanvasWorkspace = { current, futures: [{ id: 'future-base', name: 'Cenário base', canvas: future }], activeFutureId: 'future-base' };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
      return result;
    }
    const current = normalizeCanvas(undefined, legacy?.current);
    const variant = createFutureVariant(current, 'Cenário base', 'future-base');
    return { current, futures: [variant], activeFutureId: variant.id };
  } catch { /* ignore */ }
  const current = normalizeCanvas(undefined);
  const variant = createFutureVariant(current, 'Cenário base', 'future-base');
  return { current, futures: [variant], activeFutureId: variant.id };
}

function canvasForPreset(current: CanvasState, preset: ScenarioPreset) {
  const next = cloneCanvas(current);
  if (preset === 'demand-up') next.assumptions.monthlyDemand *= 1.2;
  if (preset === 'demand-down') next.assumptions.monthlyDemand *= 0.8;
  if (preset === 'setup-half') next.elements = next.elements.map((element) => ['process','shared-process'].includes(element.kind)
    ? { ...element, data: { ...element.data, setup: Math.max(0, Number(element.data.setup) || 0) * 0.5 } }
    : element);
  if (preset === 'availability-up') next.elements = next.elements.map((element) => ['process','shared-process'].includes(element.kind)
    ? { ...element, data: { ...element.data, disp: Math.min(100, (Number(element.data.disp) || 100) + 10) } }
    : element);
  if (preset === 'quality-up') next.elements = next.elements.map((element) => ['process','shared-process'].includes(element.kind)
    ? { ...element, data: { ...element.data, qualidade: Math.min(100, (Number(element.data.qualidade) || 100) + 5) } }
    : element);
  if (preset === 'bottleneck-resource') {
    const bottleneckId = calculateCanvasSimulation(next).bottleneck?.id;
    if (bottleneckId) next.elements = next.elements.map((element) => element.id === bottleneckId
      ? { ...element, data: { ...element.data, recurso: Math.max(1, Number(element.data.recurso) || 1) + 1 } }
      : element);
  }
  next.elements = next.elements.map((element) => element.id === FIXED_PLANNING_ID
    ? { ...element, data: planningData(next.assumptions) }
    : element);
  return normalizeCanvas(next);
}

// ─── Field definitions para cada elemento ────────────────────────────────────

const FIELD_DEFS: Partial<Record<ElementKind, { key: string; label: string; type?: string; suffix?: string }[]>> = {
  process:              [{ key: 'label', label: 'Nome', type: 'text' },{ key: 'tc', label: 'Tempo de ciclo', suffix: 's' },{ key: 'setup', label: 'Setup / troca', suffix: 'min' },{ key: 'lote', label: 'Lote', suffix: 'un' },{ key: 'op', label: 'Operadores', suffix: 'pess.' },{ key: 'recurso', label: 'Recursos paralelos', suffix: 'un' },{ key: 'disp', label: 'Disponibilidade / OEE', suffix: '%' },{ key: 'qualidade', label: 'Qualidade na saída', suffix: '%' }],
  'shared-process':     [{ key: 'label', label: 'Nome', type: 'text' },{ key: 'tc', label: 'Tempo de ciclo', suffix: 's' },{ key: 'setup', label: 'Setup / troca', suffix: 'min' },{ key: 'lote', label: 'Lote', suffix: 'un' },{ key: 'op', label: 'Operadores', suffix: 'pess.' },{ key: 'recurso', label: 'Recursos paralelos', suffix: 'un' },{ key: 'disp', label: 'Disponibilidade / OEE', suffix: '%' },{ key: 'qualidade', label: 'Qualidade na saída', suffix: '%' }],
  machine:              [{ key: 'label', label: 'Nome', type: 'text' },{ key: 'recurso', label: 'Quantidade', suffix: 'un' },{ key: 'disp', label: 'Disponibilidade', suffix: '%' }],
  inspection:           [{ key: 'label', label: 'Nome', type: 'text' },{ key: 'tc', label: 'Tempo de ciclo', suffix: 's' },{ key: 'op', label: 'Operadores', suffix: 'pess.' }],
  'work-cell':          [{ key: 'label', label: 'Nome', type: 'text' },{ key: 'op', label: 'Operadores', suffix: 'pess.' }],
  supplier:             [{ key: 'label', label: 'Nome', type: 'text' },{ key: 'freq', label: 'Frequência entrega', suffix: 'dias' }],
  customer:             [{ key: 'label', label: 'Nome', type: 'text' },{ key: 'freq', label: 'Frequência expedição', suffix: 'dias' }],
  truck:                [{ key: 'label', label: 'Rótulo', type: 'text' },{ key: 'color', label: 'Cor do caminhão', type: 'color' },{ key: 'freq', label: 'Frequência', suffix: 'dias' }],
  'shipping-point':     [{ key: 'label', label: 'Rótulo', type: 'text' }],
  inventory:            [{ key: 'qty', label: 'Quantidade', suffix: 'un' }],
  'safety-stock':       [{ key: 'qty', label: 'Quantidade', suffix: 'un' }],
  'raw-material':       [{ key: 'label', label: 'Nome', type: 'text' },{ key: 'qty', label: 'Quantidade', suffix: 'un' }],
  'finished-goods':     [{ key: 'label', label: 'Nome', type: 'text' },{ key: 'qty', label: 'Quantidade', suffix: 'un' }],
  warehouse:            [{ key: 'label', label: 'Nome', type: 'text' },{ key: 'qty', label: 'Quantidade', suffix: 'un' }],
  buffer:               [{ key: 'label', label: 'Rótulo', type: 'text' },{ key: 'qty', label: 'Quantidade', suffix: 'un' }],
  supermarket:          [{ key: 'label', label: 'Rótulo', type: 'text' },{ key: 'qty', label: 'Quantidade', suffix: 'un' }],
  fifo:                 [{ key: 'label', label: 'Rótulo', type: 'text' },{ key: 'qty', label: 'Quantidade', suffix: 'un' }],
  'waiting-time':       [{ key: 'label', label: 'Tipo de espera', type: 'text' },{ key: 'durationMin', label: 'Duração', suffix: 'min' }],
  'resource-zone':      [{ key: 'label', label: 'Título da área', type: 'text' }],
  'kanban-production':  [{ key: 'qty', label: 'Quantidade', suffix: 'un' }],
  'kanban-withdrawal':  [{ key: 'qty', label: 'Quantidade', suffix: 'un' }],
  'kanban-board':       [{ key: 'label', label: 'Título', type: 'text' },{ key: 'cols', label: 'Colunas' },{ key: 'rows', label: 'Linhas' }],
  heijunka:             [{ key: 'label', label: 'Título', type: 'text' },{ key: 'cols', label: 'Colunas (dias)' },{ key: 'rows', label: 'Linhas (tipos)' }],
  'sequencing-box':     [{ key: 'label', label: 'Título', type: 'text' },{ key: 'slots', label: 'Slots' }],
  planning:             [{ key: 'label', label: 'Título', type: 'text' },{ key: 'demanda', label: 'Demanda', suffix: 'un/mês' },{ key: 'takt', label: 'Takt time', suffix: 's' }],
  'data-box':           [{ key: 'label', label: 'Título', type: 'text' },{ key: 'tc', label: 'T/C', suffix: 's' },{ key: 'tcp', label: 'TCP', suffix: 's' },{ key: 'disp', label: 'Disponibilidade', suffix: '%' },{ key: 'turnos', label: 'Turnos' }],
  'customer-demand':    [{ key: 'label', label: 'Rótulo', type: 'text' },{ key: 'qty', label: 'Quantidade', suffix: 'un' },{ key: 'periodo', label: 'Período', suffix: 'dias' }],
  'production-schedule':[{ key: 'label', label: 'Título', type: 'text' }],
  'erp-system':         [{ key: 'label', label: 'Nome do sistema', type: 'text' }],
  'go-see':             [{ key: 'label', label: 'Rótulo', type: 'text' },{ key: 'freq', label: 'Frequência', suffix: 'dias' }],
  'transport-air':      [{ key: 'label', label: 'Rótulo', type: 'text' },{ key: 'freq', label: 'Frequência', suffix: 'dias' }],
  'transport-ship':     [{ key: 'label', label: 'Rótulo', type: 'text' },{ key: 'freq', label: 'Frequência', suffix: 'dias' }],
  forklift:             [{ key: 'label', label: 'Rótulo', type: 'text' },{ key: 'distance', label: 'Distância', suffix: 'm' }],
  'milk-run':           [{ key: 'label', label: 'Rótulo', type: 'text' },{ key: 'freq', label: 'Frequência', suffix: 'dias' }],
  distance:             [{ key: 'distance', label: 'Distância', suffix: 'm' }],
  'quality-problem':    [{ key: 'label', label: 'Descrição', type: 'text' },{ key: 'qty', label: 'Ocorrências', suffix: 'un' }],
  bottleneck:           [{ key: 'label', label: 'Descrição', type: 'text' }],
  pacemaker:            [{ key: 'label', label: 'Processo marcapasso', type: 'text' }],
  'future-principles':  [{ key: 'label', label: 'Princípios (uma linha por item)', type: 'textarea' }],
  'signal-kanban':      [{ key: 'qty', label: 'Quantidade de cartões', suffix: 'un' }],
  'kanban-post':        [{ key: 'label', label: 'Título', type: 'text' },{ key: 'qty', label: 'Quantidade de cartões', suffix: 'un' }],
  'sequenced-pull':     [{ key: 'label', label: 'Rótulo', type: 'text' },{ key: 'pitch', label: 'Pitch', suffix: 'min' }],
  operator:             [{ key: 'qty', label: 'Quantidade', suffix: 'pess.' }],
  kaizen:               [{ key: 'label', label: 'Texto', type: 'text' }],
  intervention:         [{ key: 'label', label: 'Texto', type: 'text' }],
  note:                 [{ key: 'label', label: 'Texto', type: 'text' }],
  timeline:             [{ key: 'label', label: 'Descrição', type: 'text' }],
  legend:               [{ key: 'label', label: 'Título', type: 'text' }],
};

// ─── Render de elemento ───────────────────────────────────────────────────────

function renderElement(el: CanvasElement, selected: boolean, onEdit: () => void, simulation: ReturnType<typeof calculateCanvasSimulation>, availableMinutesPerDay: number, accentColor = DEFAULT_THEME_COLOR) {
  const processMetric = simulation.processMetrics.find((metric) => metric.element.id === el.id);
  const p = {
    el,
    selected,
    onEdit,
    taktTimeSec: simulation.taktTimeSec,
    dailyDemand: simulation.dailyDemand,
    availableMinutesPerDay,
    leadTimeDays: simulation.leadTimeDays,
    processingTimeMin: simulation.processingTimeMin,
    accentColor,
    processLoadPercent: processMetric?.loadPercent,
    processCapacityPerDay: processMetric?.capacityPerDay,
  };
  let symbol;
  switch (el.kind) {
    case 'process':             symbol = <ProcessSymbol {...p} />; break;
    case 'work-cell':           symbol = <WorkCellSymbol {...p} />; break;
    case 'supplier': case 'customer': symbol = <PartySymbol {...p} />; break;
    case 'truck':               symbol = <TruckSymbol {...p} />; break;
    case 'shipping-point':      symbol = <ShippingPointSymbol {...p} />; break;
    case 'inventory':           symbol = <InventorySymbol {...p} />; break;
    case 'buffer':              symbol = <BufferSymbol {...p} />; break;
    case 'supermarket':         symbol = <SupermarketSymbol {...p} />; break;
    case 'fifo':                symbol = <FifoSymbol {...p} />; break;
    case 'kanban-production':   symbol = <KanbanProductionSymbol {...p} />; break;
    case 'kanban-withdrawal':   symbol = <KanbanWithdrawalSymbol {...p} />; break;
    case 'kanban-board':        symbol = <KanbanBoardSymbol {...p} />; break;
    case 'heijunka':            symbol = <HeijunkaSymbol {...p} />; break;
    case 'sequencing-box':      symbol = <SequencingBoxSymbol {...p} />; break;
    case 'planning':            symbol = <PlanningSymbol {...p} />; break;
    case 'identification':      symbol = <IdentificationSymbol {...p} />; break;
    case 'data-box':            symbol = <DataBoxSymbol {...p} />; break;
    case 'customer-demand':     symbol = <CustomerDemandSymbol {...p} />; break;
    case 'production-schedule': symbol = <ProductionScheduleSymbol {...p} />; break;
    case 'operator':            symbol = <OperatorSymbol {...p} />; break;
    case 'kaizen':              symbol = <KaizenSymbol {...p} />; break;
    case 'intervention':        symbol = <InterventionSymbol {...p} />; break;
    case 'note':                symbol = <NoteSymbol {...p} />; break;
    case 'timeline':            symbol = <TimelineSymbol {...p} />; break;
    case 'legend':              symbol = <LegendSymbol {...p} />; break;
    default:                    symbol = <ExtendedSymbol {...p} />;
  }
  const defaults = defaultElementDimensions(el);
  const size = elementDimensions(el);
  if (size.width === defaults.width && size.height === defaults.height) return symbol;
  return <g transform={`scale(${size.width / defaults.width} ${size.height / defaults.height})`}>{symbol}</g>;
}

// ─── Thumbs da biblioteca ─────────────────────────────────────────────────────

function LibraryThumb({ kind, accentColor }: { kind: ElementKind; accentColor: string }) {
  const item = LIBRARY.find((candidate) => candidate.kind === kind);
  if (item && !ARROW_KINDS.includes(kind)) {
    const previewSimulation = calculateCanvasSimulation({ elements: [], arrows: [], assumptions: DEFAULT_ASSUMPTIONS, themeColor: accentColor });
    const previewElement: CanvasElement = {
      id: `preview-${kind}`,
      kind,
      x: 0,
      y: 0,
      label: item.defaultLabel,
      data: { ...item.defaultData },
    };
    return (
      <svg className="library-symbol-preview" width={52} height={52} viewBox={`${-6} ${-6} ${item.w + 12} ${item.h + 12}`} preserveAspectRatio="xMidYMid meet">
        {renderElement(previewElement, false, () => undefined, previewSimulation, DEFAULT_ASSUMPTIONS.availableMinutesPerDay, accentColor)}
      </svg>
    );
  }
  const S = 44;
  return (
    <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} style={{ overflow: 'visible' }}>
      {kind === 'process' && (<g transform="scale(0.275) translate(2,2)"><rect width={150} height={100} fill="white" stroke="#7a8494" strokeWidth={2}/><rect width={150} height={35} fill="#bfefc0"/><text x={75} y={22} textAnchor="middle" fontSize={16} fontWeight="700" fontFamily="Arial" fill="#1a2a1a">Processo</text></g>)}
      {(kind==='supplier'||kind==='customer') && (<g transform="scale(0.35) translate(2,2)"><rect width={120} height={80} fill={kind==='customer'?'#b8ccf5':'#a8bcf0'} stroke="#6a80cc" strokeWidth={2}/><rect x={8} y={10} width={22} height={18} fill="none" stroke="#1a2560" strokeWidth={1}/><polygon points="8,10 19,4 30,10" fill="#1a2560"/><text x={60} y={52} textAnchor="middle" fontSize={16} fontWeight="700" fontFamily="Arial" fill="#122060">{kind==='customer'?'Cliente':'Fornec.'}</text></g>)}
      {kind==='truck' && <image href={truckThreeQuarter} x={1} y={8} width={42} height={27} preserveAspectRatio="xMidYMid meet" />}
      {kind==='shipping-point' && (<g transform="scale(0.42) translate(2,2)"><rect width={100} height={70} rx={4} fill="#e8f0ff" stroke="#4a6ab0" strokeWidth={2}/><rect x={30} y={10} width={40} height={30} fill="none" stroke="#2a4a90" strokeWidth={2}/><polygon points="50,10 60,16 60,22 50,28 40,22 40,16" fill="#a8bcf0" stroke="#2a4a90" strokeWidth={1}/></g>)}
      {kind==='inventory' && (<polygon points="22,4 42,38 2,38" fill="#f0ce40" stroke="#b89020" strokeWidth={2}/>)}
      {kind==='buffer' && (<g><rect width={44} height={36} rx={3} fill="#fff3cc" stroke="#cc8800" strokeWidth={1.5} strokeDasharray="4 2" y={4}/><text x={22} y={26} textAnchor="middle" fontSize={16} fontWeight="900" fontFamily="Arial" fill="#cc8800">B</text></g>)}
      {kind==='supermarket' && (<g transform="translate(2,3)"><rect x={1} y={1} width={40} height={34} fill="none" stroke="#2c5fa8" strokeWidth={2}/><line x1={1} y1={12} x2={41} y2={12} stroke="#2c5fa8" strokeWidth={1}/><line x1={1} y1={23} x2={41} y2={23} stroke="#2c5fa8" strokeWidth={1}/>{[4,14,24].map(x=>[2,13,24].map(y=><rect key={`${x}-${y}`} x={x} y={y} width={6} height={7} fill="#a8c4f0" stroke="#2c5fa8" strokeWidth={0.5} rx={0.5}/>))}</g>)}
      {kind==='fifo' && (<g transform="translate(2,14)"><rect x={1} y={0} width={40} height={16} fill="none" stroke="#555" strokeWidth={2}/><text x={20} y={11} textAnchor="middle" fontSize={8} fontWeight="700" fontFamily="Arial" fill="#333">FIFO</text><polygon points="34,0 42,8 34,16" fill="#555"/></g>)}
      {kind==='kanban-production' && (<rect width={44} height={32} rx={3} y={6} fill="#ff9500" stroke="#cc6600" strokeWidth={1.5}/>)}
      {kind==='kanban-withdrawal' && (<rect width={44} height={32} rx={3} y={6} fill="#30a830" stroke="#1a7a1a" strokeWidth={1.5}/>)}
      {kind==='kanban-board' && (<g transform="scale(0.35) translate(2,2)"><rect width={120} height={100} rx={3} fill="#f0f4ff" stroke="#4a6ab0" strokeWidth={2}/><rect width={120} height={18} rx={3} fill="#4a6ab0"/><rect x={4} y={22} width={34} height={22} fill="#ff9500" stroke="#8090c0" strokeWidth={1}/><rect x={42} y={22} width={34} height={22} fill="white" stroke="#8090c0" strokeWidth={1}/><rect x={80} y={22} width={34} height={22} fill="#30a830" stroke="#8090c0" strokeWidth={1}/></g>)}
      {kind==='heijunka' && (<g transform="scale(0.3) translate(2,10)"><rect width={140} height={80} rx={3} fill="#fffbe8" stroke="#cc8800" strokeWidth={2}/><rect width={140} height={18} rx={3} fill="#cc8800"/>{[0,1,2,3,4].map(c=><rect key={c} x={5+c*26} y={20} width={24} height={24} rx={1} fill={['#ff9500','#30a830','#0071e3','#ff3b30','#5856d6'][c]} stroke="#cc8800" strokeWidth={1}/>)}</g>)}
      {kind==='sequencing-box' && (<g transform="scale(0.35) translate(2,10)"><rect width={120} height={60} rx={3} fill="#f5eeff" stroke="#6040b0" strokeWidth={2}/><rect width={120} height={18} rx={3} fill="#6040b0"/>{[0,1,2,3,4,5].map(i=><rect key={i} x={5+i*19} y={22} width={17} height={30} rx={1} fill="white" stroke="#8060c0" strokeWidth={1}/>)}</g>)}
      {kind==='planning' && (<g transform="scale(0.26) translate(2,2)"><rect width={160} height={110} fill="white" stroke="#8a93a8" strokeWidth={2}/><rect width={160} height={28} fill="#a8bcf0"/><text x={80} y={18} textAnchor="middle" fontSize={16} fontWeight="700" fontFamily="Arial" fill="#122060">Controle</text></g>)}
      {kind==='data-box' && (<g transform="scale(0.32) translate(2,2)"><rect width={130} height={90} fill="white" stroke="#606878" strokeWidth={2}/><rect width={130} height={20} fill="#c0c8d8"/><text x={65} y={13} textAnchor="middle" fontSize={13} fontWeight="700" fontFamily="Arial" fill="#202838">Dados</text>{['T/C','TCP','Disp.','Turnos'].map((k,i)=><text key={k} x={8} y={30+i*17} fontSize={11} fontFamily="Arial" fill="#50575f" fontWeight="700">{k}</text>)}</g>)}
      {kind==='customer-demand' && (<polygon points="22,4 4,40 40,40" fill="#c8dcff" stroke="#2a50a0" strokeWidth={2}/>)}
      {kind==='production-schedule' && (<g><path d="M4,4 L34,4 L40,10 L40,40 L4,40 Z" fill="#f0f2ff" stroke="#4a5ab0" strokeWidth={1.5}/><path d="M34,4 L34,10 L40,10" fill="none" stroke="#4a5ab0" strokeWidth={1.5}/>{[16,22,28,34].map(y=><line key={y} x1={8} y1={y} x2={36} y2={y} stroke="#8090c0" strokeWidth={0.8}/>)}</g>)}
      {kind==='operator' && (<g><circle cx={22} cy={10} r={7} fill="#e8f0ff" stroke="#2a50a0" strokeWidth={1.5}/><line x1={22} y1={17} x2={22} y2={30} stroke="#2a50a0" strokeWidth={2}/><line x1={12} y1={22} x2={32} y2={22} stroke="#2a50a0" strokeWidth={2}/><line x1={22} y1={30} x2={14} y2={42} stroke="#2a50a0" strokeWidth={2}/><line x1={22} y1={30} x2={30} y2={42} stroke="#2a50a0" strokeWidth={2}/></g>)}
      {kind==='kaizen' && (()=>{const pts=Array.from({length:16},(_,i)=>{const a=(i/16)*Math.PI*2;const r=i%2===0?20:13;return `${22+r*Math.cos(a)},${22+r*Math.sin(a)}`;}).join(' ');return <polygon points={pts} fill="#ffe04b" stroke="#b8930f" strokeWidth={1}/>;})()}
      {kind==='intervention' && (<g><circle cx={22} cy={22} r={16} fill="#ffebeb" stroke="#e03030" strokeWidth={2}/>{Array.from({length:8},(_,i)=>{const a=(i/8)*Math.PI*2;return <line key={i} x1={22+16*Math.cos(a)} y1={22+16*Math.sin(a)} x2={22+22*Math.cos(a)} y2={22+22*Math.sin(a)} stroke="#e03030" strokeWidth={2}/>;})} <text x={22} y={26} textAnchor="middle" fontSize={8} fontWeight="800" fontFamily="Arial" fill="#b01010">!</text></g>)}
      {kind==='note' && (<g><rect x={2} y={6} width={40} height={32} rx={2} fill="#fff9c4" stroke="#c8b800" strokeWidth={1.5}/><path d="M32,6 L42,16 L32,16 Z" fill="#e8cc00"/>{[14,20,26].map(y=><line key={y} x1={6} y1={y} x2={30} y2={y} stroke="#d4c400" strokeWidth={0.8}/>)}</g>)}
      {kind==='timeline' && (<g transform="translate(2,10)"><rect width={40} height={24} rx={2} fill="#f4f6fc" stroke="#6070a0" strokeWidth={1.5}/><path d="M0,18 L8,8 L16,18 L24,8 L32,18 L40,18" fill="none" stroke="#6070a0" strokeWidth={1.5}/></g>)}
      {kind==='legend' && (<g transform="scale(0.27) translate(2,2)"><rect width={160} height={120} rx={3} fill="white" stroke="#8a9099" strokeWidth={2}/><rect width={160} height={20} rx={3} fill="#9aa0ae"/>{['Empurrado','Puxado','Manual','Eletrônica'].map((l,i)=><text key={l} x={36} y={30+i*22} fontSize={12} fontFamily="Arial" fill="#363b43">{l}</text>)}</g>)}
      {kind==='arrow-push' && (<polygon points="2,18 30,18 30,12 42,22 30,32 30,26 2,26" fill={accentColor}/>)}
      {kind==='arrow-pull' && (<g><path d="M4,22 Q4,8 22,8 Q40,8 40,22 Q40,36 22,36 Q12,36 8,30" fill="none" stroke={accentColor} strokeWidth={2}/><polygon points="4,16 4,28 -1,22" fill={accentColor}/><circle cx={8} cy={30} r={3} fill={accentColor}/></g>)}
      {kind==='arrow-info-manual' && (<g><path d="M4,36 Q22,4 40,16" fill="none" stroke="#333" strokeWidth={2}/><polygon points="34,12 42,18 34,22" fill="#333"/></g>)}
      {kind==='arrow-info-electronic' && (<g><path d="M4,36 Q22,4 40,16" fill="none" stroke={accentColor} strokeWidth={2} strokeDasharray="4 3"/><polygon points="19,10 16,19 20,19 17,28 25,17 21,17" fill={accentColor}/><polygon points="34,12 42,18 34,22" fill={accentColor}/></g>)}
      {kind==='arrow-adjustment' && (<g><path d="M4,36 Q22,4 40,16" fill="none" stroke="#cc4400" strokeWidth={2} strokeDasharray="2 2"/><polygon points="34,12 42,18 34,22" fill="#cc4400"/><circle cx={4} cy={36} r={3} fill="#cc4400"/></g>)}
      {kind==='arrow-schedule' && (<g><path d="M3,36 Q22,1 40,18" fill="none" stroke="#333" strokeWidth={2}/><polygon points="34,13 42,19 34,23" fill="#333"/></g>)}
      {kind==='arrow-shipment' && (<g><path d="M3,22 H39" fill="none" stroke="#333" strokeWidth={2} strokeDasharray="7 4"/><polygon points="34,17 42,22 34,27" fill="#333"/></g>)}
      {kind==='arrow-physical' && (<path d="M3,16 H30 L30,11 L41,22 L30,33 L30,28 H3 Z" fill="white" stroke={accentColor} strokeWidth={2}/>)}
      <g transform="scale(.3)"><ExtendedSymbol el={{ id:'thumb', kind, x:0, y:0, label:'', data:{} }} selected={false} onEdit={() => undefined} /></g>
    </svg>
  );
}

// ─── Biblioteca lateral ───────────────────────────────────────────────────────

const GROUP_LABELS: Record<string, string> = {
  material: 'Material e processo', logistica: 'Logística', kanban: 'Kanban', informacao: 'Informação',
  operador: 'Operador', fluxo: 'Setas / Fluxo', anotacao: 'Anotação',
};

function LibraryPanel({ onDragStart, accentColor }: { onDragStart: (item: LibraryItem, e: React.DragEvent) => void; accentColor: string }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const groups = ['material','logistica','kanban','informacao','operador','fluxo','anotacao'];
  return (
    <div className="library-panel">
      {groups.map((g) => {
        const items = LIBRARY.filter((i) => i.group === g && !['planning','timeline'].includes(i.kind));
        const open = !collapsed[g];
        return (
          <div key={g} className="library-group">
            <button className="library-group-label" onClick={() => setCollapsed(p => ({ ...p, [g]: open }))}>
              <span>{GROUP_LABELS[g]}</span>
              <span style={{ fontSize: 8, color: '#aeaeb2' }}>{open ? '▲' : '▼'}</span>
            </button>
            {open && (
              <div className="library-items">
                {items.map((item) => (
                  <div key={item.kind} className="library-item" draggable
                    onDragStart={(e) => onDragStart(item, e)} title={item.label}>
                    <LibraryThumb kind={item.kind} accentColor={accentColor} />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Setas SVG ────────────────────────────────────────────────────────────────

function ArrowShape({ arrow, selected, onClick, accentColor }: {
  arrow: CanvasArrow; selected: boolean; onClick: (e: React.MouseEvent) => void; accentColor: string;
}) {
  const dx = arrow.x2 - arrow.x1; const dy = arrow.y2 - arrow.y1;
  const len = Math.sqrt(dx*dx + dy*dy);
  const mx = (arrow.x1+arrow.x2)/2; const my = (arrow.y1+arrow.y2)/2;
  const ux = len>0?dx/len:1; const uy = len>0?dy/len:0;
  const ex = arrow.x2 - ux*10; const ey = arrow.y2 - uy*10;

  const isAdj = arrow.kind === 'arrow-adjustment';
  const isElec = arrow.kind === 'arrow-info-electronic';
  const isPull = arrow.kind === 'arrow-pull';
  const isPush = arrow.kind === 'arrow-push';
  const isSchedule = arrow.kind === 'arrow-schedule';
  const isShipment = arrow.kind === 'arrow-shipment';
  const isPhysical = arrow.kind === 'arrow-physical';

  const color = (isPush||isPull||isElec||isPhysical) ? accentColor : isAdj ? '#cc4400' : '#333';
  const dash = (isElec||isAdj||isShipment) ? (isAdj?'3 3':isShipment?'9 6':'5 3') : 'none';
  const sw = selected ? 3 : 2;
  const id = arrow.id;

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      <line x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2} stroke="transparent" strokeWidth={18} />
      <defs>
        <marker id={`m-${id}`} markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
          <polygon points="0,0 9,3.5 0,7" fill={color} />
        </marker>
      </defs>
      {isPhysical ? (
        <path d={`M${arrow.x1},${arrow.y1-8} L${ex-16},${ey-8} L${ex},${ey} L${ex-16},${ey+8} L${arrow.x1},${arrow.y1+8} Z`}
          fill="white" stroke={color} strokeWidth={sw} />
      ) : isPush ? (
        <line x1={arrow.x1} y1={arrow.y1} x2={ex} y2={ey} stroke={color} strokeWidth={sw+3} markerEnd={`url(#m-${id})`} />
      ) : isPull ? (
        <>
          <path d={`M${arrow.x1},${arrow.y1} Q${mx-dy*.25},${my+dx*.25} ${ex},${ey}`}
            fill="none" stroke={color} strokeWidth={sw} markerEnd={`url(#m-${id})`} />
          <circle cx={arrow.x1} cy={arrow.y1} r={4} fill={color} />
        </>
      ) : isSchedule ? (
        <path d={`M${arrow.x1},${arrow.y1} Q${mx},${Math.min(arrow.y1, arrow.y2)-90} ${ex},${ey}`}
          fill="none" stroke={color} strokeWidth={sw} markerEnd={`url(#m-${id})`} />
      ) : (
        <>
          <path d={`M${arrow.x1},${arrow.y1} Q${mx},${my-30} ${ex},${ey}`}
            fill="none" stroke={color} strokeWidth={sw} strokeDasharray={dash} markerEnd={`url(#m-${id})`} />
          {isElec && <polygon points={`${mx-4},${my-26} ${mx-7},${my-16} ${mx-2},${my-16} ${mx-6},${my-8} ${mx+4},${my-20} ${mx-1},${my-20}`}
            fill={accentColor} opacity={0.85} />}
          {isAdj && <circle cx={arrow.x1} cy={arrow.y1} r={4} fill={color} />}
        </>
      )}
      {arrow.label && <text x={mx} y={my-12} textAnchor="middle" fontSize={8} fontFamily="Arial" fill="#444">{arrow.label}</text>}
      {selected && <>
        <circle cx={arrow.x1} cy={arrow.y1} r={7} fill="white" stroke="#0071e3" strokeWidth={2} style={{cursor:'move'}} />
        <circle cx={arrow.x2} cy={arrow.y2} r={7} fill="white" stroke="#0071e3" strokeWidth={2} style={{cursor:'move'}} />
      </>}
    </g>
  );
}

function pointAlongRoute(points: { x: number; y: number }[], progress: number) {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const segments = points.slice(1).map((point, index) => {
    const previous = points[index];
    return { from: previous, to: point, length: Math.hypot(point.x - previous.x, point.y - previous.y) };
  });
  const total = segments.reduce((sum, segment) => sum + segment.length, 0) || 1;
  let remaining = Math.min(1, Math.max(0, progress)) * total;
  for (const segment of segments) {
    if (remaining <= segment.length) {
      const ratio = segment.length > 0 ? remaining / segment.length : 0;
      return {
        x: segment.from.x + (segment.to.x - segment.from.x) * ratio,
        y: segment.from.y + (segment.to.y - segment.from.y) * ratio,
      };
    }
    remaining -= segment.length;
  }
  return points[points.length - 1];
}

function bottleneckGuidance(metric: ReturnType<typeof calculateCanvasSimulation>['processMetrics'][number], assumptions: ScenarioAssumptions) {
  const cycle = Math.max(0, Number(metric.element.data.tc) || 0);
  const setup = Math.max(0, Number(metric.element.data.setup) || 0);
  const lot = Math.max(1, Number(metric.element.data.lote) || 1);
  const setupPerUnitSec = setup * 60 / lot;
  const availability = Math.min(100, Math.max(1, Number(metric.element.data.disp) || 100));
  const quality = Math.min(100, Math.max(0.1, Number(metric.element.data.qualidade) || 100));
  const resources = Math.max(1, Number(metric.element.data.recurso) || 1);
  const setupShare = cycle + setupPerUnitSec > 0 ? setupPerUnitSec / (cycle + setupPerUnitSec) : 0;
  const load = Math.max(100, metric.loadPercent);
  const reduction = Math.max(0, (1 - 100 / load) * 100);
  const extraResources = Math.max(1, Math.ceil(resources * load / 100) - resources);
  const dailyDemand = assumptions.monthlyDemand / assumptions.workdaysPerMonth;
  const capacityGap = Math.max(0, dailyDemand - metric.capacityPerDay);

  if (setupShare >= 0.15) return {
    cause: [`Setup representa ${(setupShare * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% do tempo efetivo.`, `Capacidade ${metric.capacityPerDay.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/dia · faltam ${capacityGap.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/dia.`],
    actions: [`Reduza o setup e libere lotes menores.`, `Meta: diminuir o tempo efetivo em ${reduction.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%.`],
  };
  if (availability < 90) {
    const targetAvailability = Math.min(100, availability * load / 100);
    return {
      cause: [`Disponibilidade de ${availability.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% limita a saída.`, `Carga calculada em ${metric.loadPercent.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% do processo.`],
      actions: [`Eleve a disponibilidade para perto de ${targetAvailability.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%.`, `Atue em paradas, manutenção e abastecimento.`],
    };
  }
  if (quality < 98) return {
    cause: [`Qualidade de ${quality.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% aumenta a carga a montante.`, `Perdas acumuladas exigem produzir acima da demanda.`],
    actions: [`Reduza refugo e retrabalho neste processo.`, `Meta inicial: qualidade acima de 98%.`],
  };
  return {
    cause: [`T/C efetivo ${metric.effectiveCycleSec.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}s · carga ${metric.loadPercent.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%.`, `Capacidade ${metric.capacityPerDay.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/dia para demanda ${dailyDemand.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/dia.`],
    actions: [`Reduza o ciclo efetivo em ${reduction.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%.`, `Ou adicione ${extraResources} recurso(s) e rebalanceie o trabalho.`],
  };
}

function LiveFlowOverlay({ canvas, simulation, elapsedSec }: {
  canvas: CanvasState;
  simulation: ReturnType<typeof calculateCanvasSimulation>;
  elapsedSec: number;
}) {
  if (elapsedSec <= 0 || simulation.processElements.length === 0 || !Number.isFinite(simulation.taktTimeSec)) return null;
  const routeKinds: ElementKind[] = [
    'supplier','truck','raw-material','warehouse','inventory','safety-stock','buffer','supermarket','fifo',
    'process','shared-process','waiting-time','finished-goods','shipping-point','customer',
  ];
  const stageElements = canvas.elements
    .filter((element) => routeKinds.includes(element.kind))
    .sort((a, b) => a.x - b.x);
  if (!stageElements.length) return null;
  const centers = stageElements.map((element) => {
    const size = elementDimensions(element);
    return { x: element.x + size.width / 2, y: element.y + size.height / 2 };
  });
  const truckCenters = stageElements.filter((element) => element.kind === 'truck').map((element) => {
    const size = elementDimensions(element);
    return { id: element.id, x: element.x + size.width * 0.42, y: element.y + size.height * 0.43, element, size };
  });
  const route = [
    { x: centers[0].x - 90, y: centers[0].y },
    ...centers,
    { x: centers[centers.length - 1].x + 90, y: centers[centers.length - 1].y },
  ];
  const availableSeconds = canvas.assumptions.availableMinutesPerDay * 60;
  const completionInterval = simulation.bottleneckCapacity > 0 ? availableSeconds / simulation.bottleneckCapacity : Infinity;
  const nominalLeadSec = Math.max(20,
    simulation.processMetrics.reduce((sum, metric) => sum + metric.effectiveCycleSec, 0)
      + simulation.waitingTimeMin * 60
      + route.length * 15,
  );
  const hasThroughput = Number.isFinite(completionInterval) && completionInterval > 0;
  const flowInterval = hasThroughput
    ? Math.max(simulation.taktTimeSec, completionInterval)
    : Infinity;
  const releasedToFlow = hasThroughput
    ? Math.max(0, Math.floor(elapsedSec / flowInterval) + 1)
    : 0;
  const firstVisible = Math.max(0, releasedToFlow - 18);
  const tokens = Array.from({ length: releasedToFlow - firstVisible }, (_, offset) => {
    const index = firstVisible + offset;
    const age = Math.max(0, elapsedSec - index * flowInterval);
    const progress = Math.min(1, age / nominalLeadSec);
    const point = pointAlongRoute(route, progress);
    const truck = truckCenters.find((center) => Math.hypot(point.x - center.x, point.y - center.y) < 58);
    return { index, progress, point, truckId: truck?.id };
  }).filter((token) => token.progress < 1);
  const loadingTruckIds = new Set(tokens.map((token) => token.truckId).filter(Boolean));
  const bottleneckMetric = simulation.processMetrics.find((metric) => metric.element.id === simulation.bottleneck?.id);
  const guidance = bottleneckMetric?.overloaded ? bottleneckGuidance(bottleneckMetric, canvas.assumptions) : null;

  return (
    <g data-export-ui className="live-flow-overlay" pointerEvents="none">
      <polyline points={route.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={canvas.themeColor} strokeWidth={2} strokeDasharray="4 8" opacity={0.3} />
      {truckCenters.map((truck) => loadingTruckIds.has(truck.id) && <g key={`loading-${truck.id}`}>
        <rect x={truck.element.x - 5} y={truck.element.y - 5} width={truck.size.width + 10} height={truck.size.height + 10} rx={12} className="live-truck-loading" />
        <g transform={`translate(${truck.element.x + truck.size.width / 2 - 45},${truck.element.y - 30})`}>
          <rect width={90} height={22} rx={11} fill="#1a6b3a" />
          <text x={45} y={15} textAnchor="middle" fontSize={8} fontWeight="800" fontFamily="Arial" fill="white">CARREGANDO</text>
        </g>
      </g>)}
      {simulation.processMetrics.map((metric) => {
        const size = elementDimensions(metric.element);
        const serviceRate = metric.capacityPerDay / availableSeconds;
        const arrivalRate = 1 / simulation.taktTimeSec;
        const queue = Math.max(0, Math.floor(elapsedSec * (arrivalRate - serviceRate)));
        const critical = metric.overloaded || queue > 0;
        return <g key={`live-${metric.element.id}`}>
          <rect x={metric.element.x - 7} y={metric.element.y - 27} width={size.width + 14} height={size.height + 34} rx={9}
            className={`live-process-halo ${critical ? 'critical' : metric.element.id === simulation.bottleneck?.id ? 'bottleneck' : 'healthy'}`} />
          {queue > 0 && <g transform={`translate(${metric.element.x + size.width - 40},${metric.element.y - 38})`}>
            <rect width={80} height={22} rx={11} fill="#b42318" />
            <text x={40} y={15} textAnchor="middle" fontSize={8} fontWeight="800" fontFamily="Arial" fill="white">FILA {queue}</text>
          </g>}
        </g>;
      })}
      {guidance && bottleneckMetric && (() => {
        const size = elementDimensions(bottleneckMetric.element);
        const placeAbove = bottleneckMetric.element.y > 170;
        const cardX = bottleneckMetric.element.x + size.width / 2 - 135;
        const cardY = placeAbove ? bottleneckMetric.element.y - 168 : bottleneckMetric.element.y + size.height + 32;
        const anchorX = bottleneckMetric.element.x + size.width / 2;
        const anchorY = placeAbove ? bottleneckMetric.element.y : bottleneckMetric.element.y + size.height;
        const cardAnchorY = placeAbove ? cardY + 132 : cardY;
        return <g className="live-bottleneck-help">
          <path d={`M${anchorX},${anchorY} L${cardX + 135},${cardAnchorY}`} fill="none" stroke="#b42318" strokeWidth={2} strokeDasharray="5 3" />
          <g transform={`translate(${cardX},${cardY})`}>
            <rect width={270} height={132} rx={12} fill="white" stroke="#e6aaa5" strokeWidth={1.5} />
            <rect width={270} height={30} rx={12} fill="#fff0ee" />
            <circle cx={17} cy={15} r={7} fill="#b42318"/><text x={17} y={19} textAnchor="middle" fontSize={9} fontWeight="900" fontFamily="Arial" fill="white">!</text>
            <text x={31} y={19} fontSize={9} fontWeight="900" fontFamily="Arial" fill="#8f1f17">POR QUE ESTÁ GARGALANDO?</text>
            {guidance.cause.map((line,index)=><text key={`cause-${index}`} x={14} y={48+index*14} fontSize={7.5} fontFamily="Arial" fill="#4b5159">{line.slice(0,58)}</text>)}
            <text x={14} y={82} fontSize={7.5} fontWeight="900" fontFamily="Arial" fill="#167044">COMO ALIVIAR</text>
            {guidance.actions.map((line,index)=><text key={`action-${index}`} x={14} y={98+index*15} fontSize={7.5} fontWeight="700" fontFamily="Arial" fill="#2f3b45">• {line.slice(0,57)}</text>)}
          </g>
        </g>;
      })()}
      {tokens.map((token) => <g key={token.index} transform={`translate(${token.point.x},${token.point.y})`} className={`live-product-token ${token.truckId ? 'inside-truck' : ''}`}>
        <path d="M-13,-7 L0,-13 L13,-7 L0,-1 Z" fill={canvas.themeColor} stroke="#23415a" strokeWidth={1.2}/>
        <path d="M-13,-7 V8 L0,14 V-1 Z" fill="white" stroke="#23415a" strokeWidth={1.2}/>
        <path d="M13,-7 V8 L0,14 V-1 Z" fill="#dcecff" stroke="#23415a" strokeWidth={1.2}/>
        <path d="M0,-13 V-1" stroke="#23415a" strokeWidth={1}/>
        <text x={0} y={-18} textAnchor="middle" fontSize={7} fontWeight="800" fontFamily="Arial" fill="#34383e">CX {token.index + 1}</text>
      </g>)}
    </g>
  );
}

// ─── Popovers de edição ───────────────────────────────────────────────────────

function ElementSizeFields({ el, onUpdate }: {
  el: CanvasElement;
  onUpdate: (patch: Partial<CanvasElement>) => void;
}) {
  const defaults = defaultElementDimensions(el);
  const size = elementDimensions(el);
  const setSize = (key: 'width' | 'height', value: string) => {
    const limit = key === 'width' ? 1200 : 800;
    const fallback = key === 'width' ? defaults.width : defaults.height;
    const next = Math.min(limit, Math.max(30, Number(value) || fallback));
    onUpdate({ data: { ...el.data, [key]: next } });
  };
  const restore = () => {
    const data = { ...el.data };
    delete data.width;
    delete data.height;
    onUpdate({ data });
  };

  return (
    <div className="element-size-editor">
      <div className="element-size-heading">
        <span>Tamanho</span>
        <button type="button" onClick={restore}>Restaurar padrão</button>
      </div>
      <div className="element-size-grid">
        <label><span>Largura</span><div className="popover-input-wrap"><input type="number" min={30} max={1200} step={10} value={size.width} onChange={(event) => setSize('width', event.target.value)} /><span>px</span></div></label>
        <label><span>Altura</span><div className="popover-input-wrap"><input type="number" min={30} max={800} step={10} value={size.height} onChange={(event) => setSize('height', event.target.value)} /><span>px</span></div></label>
      </div>
    </div>
  );
}

function ElementPopover({ el, onUpdate, onDelete, onClose }: {
  el: CanvasElement; onUpdate: (p: Partial<CanvasElement>) => void;
  onDelete: () => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fields = FIELD_DEFS[el.kind] ?? [{ key: 'label', label: 'Rótulo', type: 'text' }];

  useEffect(() => {
    const pop = ref.current; if (!pop) return;
    pop.style.left = `${Math.max(12, Math.min(window.innerWidth/2 - 150, window.innerWidth - 316))}px`;
    pop.style.top  = `${Math.max(12, (window.innerHeight - pop.offsetHeight) / 2)}px`;
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key==='Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    setTimeout(() => document.addEventListener('mousedown', h), 0);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  return createPortal(
    <div className="process-popover" ref={ref} style={{ width: 300 }}>
      <div className="popover-header">
        <strong>Editar elemento</strong>
        <button className="popover-close" onClick={onClose}><X size={15} /></button>
      </div>
      <div style={{ padding: '0 0 4px' }}>
        {fields.map((f) => (
          <div key={f.key} className="popover-field" style={{ marginTop: 8 }}>
            <label>{f.label}</label>
            {f.type === 'textarea' ? (
              <textarea value={el.label} rows={6} onChange={(e) => onUpdate({ label: e.target.value })} />
            ) : f.type === 'text' ? (
              <input value={el.label} onChange={(e) => onUpdate({ label: e.target.value })} />
            ) : f.type === 'color' ? (
              <div className="popover-color-wrap">
                <input className="popover-color-input" type="color" value={String(el.data[f.key] ?? DEFAULT_TRUCK_COLOR)}
                  onChange={(e) => onUpdate({ data: { ...el.data, [f.key]: e.target.value } })} />
                <span>{String(el.data[f.key] ?? DEFAULT_TRUCK_COLOR).toUpperCase()}</span>
              </div>
            ) : (
              <div className="popover-input-wrap">
                <input type="number" min={0} value={el.data[f.key] ?? 0}
                  onChange={(e) => onUpdate({ data: { ...el.data, [f.key]: Number(e.target.value) } })} />
                {f.suffix && <span>{f.suffix}</span>}
              </div>
            )}
          </div>
        ))}
        <ElementSizeFields el={el} onUpdate={onUpdate} />
      </div>
      <div className="popover-footer">
        <button className="popover-delete" onClick={onDelete}><Trash2 size={13} />Excluir</button>
      </div>
    </div>,
    document.body
  );
}

async function prepareIdentificationImage(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Selecione um arquivo de imagem.');
  if (file.size > 10 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 10 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Não foi possível ler esta imagem.'));
      image.src = url;
    });
    const scale = Math.min(1, 800 / image.naturalWidth, 500 / image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível processar esta imagem.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    return canvas.toDataURL(outputType, outputType === 'image/jpeg' ? 0.86 : undefined);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function IdentificationEditor({ el, onUpdate, onClose }: {
  el: CanvasElement;
  onUpdate: (patch: Partial<CanvasElement>) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string|null>(null);
  const updateData = (key: string, value: string) => onUpdate({ data: { ...el.data, [key]: value } });
  const upload = async (key: 'companyImage' | 'productImage', file?: File) => {
    if (!file) return;
    setError(null);
    try {
      updateData(key, await prepareIdentificationImage(file));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Não foi possível carregar a imagem.');
    }
  };

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const imageField = (key: 'companyImage' | 'productImage', title: string, description: string) => {
    const image = String(el.data[key] ?? '');
    return (
      <div className="identification-image-field">
        <div className="identification-image-preview">
          {image ? <img src={image} alt="" /> : <FileImage size={28} />}
        </div>
        <div>
          <strong>{title}</strong>
          <span>{description}</span>
          <div className="identification-image-actions">
            <label><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => upload(key, event.target.files?.[0])} />Escolher imagem</label>
            {image && <button onClick={() => updateData(key, '')}>Remover</button>}
          </div>
        </div>
      </div>
    );
  };

  return createPortal(
    <div className="editor-overlay" role="dialog" aria-modal="true" aria-labelledby="identification-title">
      <button className="editor-backdrop" onClick={onClose} aria-label="Fechar identificação" />
      <section className="editor-window identification-editor">
        <header>
          <div><h2 id="identification-title">Identificação do MFV</h2><p>Defina a família analisada e, se quiser, adicione imagens.</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
        </header>
        <div className="identification-editor-body">
          <div className="identification-fields">
            <label><span>Família de produtos</span><input value={String(el.data.family ?? '')} onChange={(event) => updateData('family', event.target.value)} placeholder="Ex.: Camas infantis" /></label>
            <label><span>Empresa</span><input value={String(el.data.companyName ?? '')} onChange={(event) => updateData('companyName', event.target.value)} placeholder="Nome opcional" /></label>
            <label><span>Produto</span><input value={String(el.data.productName ?? '')} onChange={(event) => updateData('productName', event.target.value)} placeholder="Nome opcional" /></label>
            <ElementSizeFields el={el} onUpdate={onUpdate} />
          </div>
          <div className="identification-images">
            {imageField('companyImage', 'Empresa', 'Logotipo ou foto da empresa')}
            {imageField('productImage', 'Produto', 'Foto do produto analisado')}
          </div>
          {error && <p className="identification-error">{error}</p>}
        </div>
        <footer className="identification-editor-footer"><button className="primary-button" onClick={onClose}>Concluir</button></footer>
      </section>
    </div>,
    document.body,
  );
}

function DemandModal({ assumptions, planning, onSave, onUpdatePlanning, onClose }: {
  assumptions: ScenarioAssumptions;
  planning: CanvasElement;
  onSave: (next: ScenarioAssumptions) => void;
  onUpdatePlanning: (patch: Partial<CanvasElement>) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(assumptions);
  const metrics = calculateScenario(draft);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const setNumber = (key: keyof ScenarioAssumptions, value: string) => {
    setDraft((previous) => ({ ...previous, [key]: Math.max(0, Number(value) || 0) }));
  };

  return createPortal(
    <div className="editor-overlay demand-overlay" role="dialog" aria-modal="true" aria-labelledby="demand-modal-title">
      <button className="editor-backdrop" onClick={onClose} aria-label="Fechar dados de demanda" />
      <section className="editor-window demand-modal">
        <header>
          <div className="modal-title-row">
            <div className="modal-symbol"><Calculator size={20} /></div>
            <div>
              <span className="scenario-pill current">Simulação</span>
              <h2 id="demand-modal-title">Demanda e TAKT</h2>
              <p>Defina a necessidade do cliente e o tempo produtivo disponível.</p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
        </header>

        <div className="demand-modal-body">
          <div className="demand-fields">
            <label>
              <span>Demanda mensal</span>
              <div className="popover-input-wrap">
                <input type="number" min={0.01} step="any" value={draft.monthlyDemand}
                  onChange={(event) => setNumber('monthlyDemand', event.target.value)} />
                <span>un/mês</span>
              </div>
            </label>
            <label>
              <span>Dias úteis no mês</span>
              <div className="popover-input-wrap">
                <input type="number" min={1} step="1" value={draft.workdaysPerMonth}
                  onChange={(event) => setNumber('workdaysPerMonth', event.target.value)} />
                <span>dias</span>
              </div>
            </label>
            <label>
              <span>Tempo disponível por dia</span>
              <div className="popover-input-wrap">
                <input type="number" min={1} step="any" value={draft.availableMinutesPerDay}
                  onChange={(event) => setNumber('availableMinutesPerDay', event.target.value)} />
                <span>min/dia</span>
              </div>
            </label>
            <ElementSizeFields el={planning} onUpdate={onUpdatePlanning} />
          </div>

          <div className="takt-result-card">
            <span>TAKT calculado</span>
            <strong>{metrics.taktTimeSec > 0 ? `${metrics.taktTimeSec.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s` : '—'}</strong>
            <small>{metrics.taktTimeSec > 0 ? `${(metrics.taktTimeSec / 60).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} min por unidade` : 'Preencha valores maiores que zero'}</small>
            <div>
              <span>Demanda diária</span>
              <b>{Number.isFinite(metrics.dailyDemand) ? metrics.dailyDemand.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '—'} un/dia</b>
            </div>
          </div>
        </div>

        <footer className="demand-modal-footer">
          <p>Ao aplicar, todos os processos do cenário serão comparados automaticamente com o TAKT.</p>
          <button className="primary-button" disabled={!draft.monthlyDemand || !draft.workdaysPerMonth || !draft.availableMinutesPerDay}
            onClick={() => onSave(draft)}>
            <Calculator size={16} />Calcular e aplicar
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function ArrowPopover({ arrow, onUpdate, onDelete, onClose }: {
  arrow: CanvasArrow; onUpdate: (p: Partial<CanvasArrow>) => void;
  onDelete: () => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const pop = ref.current; if (!pop) return;
    pop.style.left = `${Math.max(12, window.innerWidth/2 - 140)}px`;
    pop.style.top  = `${Math.max(12, window.innerHeight/2 - 80)}px`;
  }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key==='Escape') onClose(); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    setTimeout(() => document.addEventListener('mousedown', h), 0);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const kinds: { value: CanvasArrow['kind']; label: string }[] = [
    { value: 'arrow-push',            label: 'Fluxo empurrado' },
    { value: 'arrow-pull',            label: 'Fluxo puxado' },
    { value: 'arrow-info-manual',     label: 'Info manual' },
    { value: 'arrow-info-electronic', label: 'Info eletrônica' },
    { value: 'arrow-adjustment',      label: 'Seta de ajuste / correção' },
    { value: 'arrow-schedule',        label: 'Programação curva' },
    { value: 'arrow-shipment',        label: 'Transporte externo' },
    { value: 'arrow-physical',        label: 'Fluxo físico (chevron)' },
  ];
  return createPortal(
    <div className="process-popover" ref={ref} style={{ width: 280 }}>
      <div className="popover-header">
        <strong>Editar seta</strong>
        <button className="popover-close" onClick={onClose}><X size={15} /></button>
      </div>
      <div style={{ padding: '0 0 4px' }}>
        <div className="popover-field" style={{ marginTop: 8 }}>
          <label>Tipo</label>
          <select value={arrow.kind} onChange={(e) => onUpdate({ kind: e.target.value as CanvasArrow['kind'] })}
            className="popover-select">
            {kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>
        <div className="popover-field" style={{ marginTop: 8 }}>
          <label>Rótulo</label>
          <input value={arrow.label ?? ''} onChange={(e) => onUpdate({ label: e.target.value })} />
        </div>
      </div>
      <div className="popover-footer">
        <button className="popover-delete" onClick={onDelete}><Trash2 size={13} />Excluir seta</button>
      </div>
    </div>,
    document.body
  );
}

// ─── App principal ────────────────────────────────────────────────────────────

type Dragging =
  | { type: 'element'; id: string; startX: number; startY: number; origX: number; origY: number }
  | { type: 'arrow-point'; id: string; point: 'start' | 'end' }
  | { type: 'pan'; startX: number; startY: number; origX: number; origY: number };

type AlignmentGuides = { x?: number; y?: number };

function snapElementPosition(target: CanvasElement, x: number, y: number, elements: CanvasElement[]) {
  const { width, height } = elementDimensions(target);
  let snappedX = Math.round(x / GRID_SIZE) * GRID_SIZE;
  let snappedY = Math.round(y / GRID_SIZE) * GRID_SIZE;
  let guideX: number | undefined;
  let guideY: number | undefined;
  let bestX = ALIGN_THRESHOLD + 1;
  let bestY = ALIGN_THRESHOLD + 1;

  for (const other of elements) {
    if (other.id === target.id) continue;
    const otherSize = elementDimensions(other);
    const xMatches = [
      { position: other.x, line: other.x },
      { position: other.x + otherSize.width / 2 - width / 2, line: other.x + otherSize.width / 2 },
      { position: other.x + otherSize.width - width, line: other.x + otherSize.width },
    ];
    const yMatches = [
      { position: other.y, line: other.y },
      { position: other.y + otherSize.height / 2 - height / 2, line: other.y + otherSize.height / 2 },
      { position: other.y + otherSize.height - height, line: other.y + otherSize.height },
    ];
    for (const match of xMatches) {
      const distance = Math.abs(x - match.position);
      if (distance <= ALIGN_THRESHOLD && distance < bestX) {
        bestX = distance;
        snappedX = match.position;
        guideX = match.line;
      }
    }
    for (const match of yMatches) {
      const distance = Math.abs(y - match.position);
      if (distance <= ALIGN_THRESHOLD && distance < bestY) {
        bestY = distance;
        snappedY = match.position;
        guideY = match.line;
      }
    }
  }

  return { x: snappedX, y: snappedY, guides: { x: guideX, y: guideY } as AlignmentGuides };
}

const SCENARIO_PRESETS: { id: ScenarioPreset; title: string; description: string }[] = [
  { id: 'current', title: 'Cópia do Estado atual', description: 'Base neutra para editar livremente.' },
  { id: 'demand-up', title: 'Demanda +20%', description: 'Testa crescimento e revela sobrecargas.' },
  { id: 'demand-down', title: 'Demanda −20%', description: 'Avalia ociosidade e consolidação.' },
  { id: 'bottleneck-resource', title: '+1 recurso no gargalo', description: 'Duplica a capacidade paralela da restrição atual.' },
  { id: 'setup-half', title: 'Setup −50%', description: 'Simula melhoria de troca e lotes menores.' },
  { id: 'availability-up', title: 'Disponibilidade +10 p.p.', description: 'Testa estabilidade e manutenção.' },
  { id: 'quality-up', title: 'Qualidade +5 p.p.', description: 'Reduz perdas acumuladas ao longo do fluxo.' },
];

function ScenarioCreateModal({ onCreate, onClose }: { onCreate: (name: string, preset: ScenarioPreset) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [preset, setPreset] = useState<ScenarioPreset>('current');
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  return createPortal(
    <div className="editor-overlay" role="dialog" aria-modal="true" aria-labelledby="scenario-create-title">
      <button className="editor-backdrop" onClick={onClose} aria-label="Fechar criação de cenário" />
      <section className="editor-window scenario-create-modal">
        <header><div><h2 id="scenario-create-title">Novo cenário futuro</h2><p>Comece sempre do Estado atual e aplique uma hipótese inicial.</p></div><button className="icon-button" onClick={onClose}><X size={20}/></button></header>
        <div className="scenario-create-body">
          <label className="scenario-name-field"><span>Nome do cenário</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Demanda alta — 2º semestre" /></label>
          <div className="scenario-preset-grid">
            {SCENARIO_PRESETS.map((item) => <button key={item.id} className={preset === item.id ? 'active' : ''} onClick={() => setPreset(item.id)}>
              <strong>{item.title}</strong><span>{item.description}</span>
            </button>)}
          </div>
        </div>
        <footer className="scenario-modal-footer"><button className="quiet-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={() => onCreate(name, preset)}>Criar cenário</button></footer>
      </section>
    </div>, document.body,
  );
}

function ComparisonModal({ workspace, onSelect, onClose }: { workspace: CanvasWorkspace; onSelect: (id: string) => void; onClose: () => void }) {
  const rows = [
    { id: '', name: 'Estado atual', kind: 'current' as const, canvas: workspace.current },
    ...workspace.futures.map((variant) => ({ id: variant.id, name: variant.name, kind: 'future' as const, canvas: variant.canvas })),
  ].map((row) => ({ ...row, result: calculateCanvasSimulation(row.canvas) }));
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  const number = (value: number, digits = 1) => Number.isFinite(value) ? value.toLocaleString('pt-BR', { maximumFractionDigits: digits }) : '—';
  return createPortal(
    <div className="editor-overlay" role="dialog" aria-modal="true" aria-labelledby="comparison-title">
      <button className="editor-backdrop" onClick={onClose} aria-label="Fechar comparação" />
      <section className="editor-window comparison-modal">
        <header><div><h2 id="comparison-title">Comparação de cenários</h2><p>Veja onde cada hipótese atende a demanda e qual processo limita o fluxo.</p></div><button className="icon-button" onClick={onClose}><X size={20}/></button></header>
        <div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th>Cenário</th><th>Demanda/dia</th><th>Capacidade/dia</th><th>TAKT</th><th>Lead time</th><th>Gargalo</th><th>Situação</th></tr></thead><tbody>
          {rows.map((row) => <tr key={row.id || 'current'} className={row.id === workspace.activeFutureId ? 'active' : ''}>
            <td><span className={`scenario-dot ${row.kind}`}/><strong>{row.name}</strong>{row.id && <button onClick={() => { onSelect(row.id); onClose(); }}>Abrir</button>}</td>
            <td>{number(row.result.dailyDemand, 2)} un</td><td>{number(row.result.bottleneckCapacity)} un</td><td>{number(row.result.taktTimeSec / 60, 2)} min</td><td>{number(row.result.leadTimeDays, 2)} dias</td><td>{row.result.bottleneck?.label || '—'}</td>
            <td><span className={`comparison-status ${row.result.invalidProcesses.length ? 'warning' : row.result.overloadedProcesses.length ? 'critical' : 'ok'}`}>{row.result.invalidProcesses.length ? 'Dados incompletos' : row.result.overloadedProcesses.length ? `${row.result.overloadedProcesses.length} quebra(m)` : 'Atende'}</span></td>
          </tr>)}
        </tbody></table></div>
      </section>
    </div>, document.body,
  );
}

function ScenarioPill({ kind }: { kind: ActiveKind }) {
  return <span className={`scenario-pill ${kind}`}>{kind==='current'?'Estado atual':'Estado futuro'}</span>;
}

export default function App() {
  const [activeKind, setActiveKind] = useState<ActiveKind>('current');
  const [workspace, setWorkspace] = useState<CanvasWorkspace>(loadWorkspace);
  const activeFuture = workspace.futures.find((variant) => variant.id === workspace.activeFutureId) ?? workspace.futures[0];
  const canvas = activeKind === 'current' ? workspace.current : activeFuture.canvas;
  const simulation = calculateCanvasSimulation(canvas);
  const simulatedDaySeconds = canvas.assumptions.availableMinutesPerDay * 60;
  const timelineSourceElements = [...simulation.processElements, ...simulation.inventoryElements];
  const automaticTimelinePosition = timelineSourceElements.length
    ? {
        x: Math.min(...timelineSourceElements.map((element) => element.x)) - 150,
        y: Math.max(...timelineSourceElements.map((element) => element.y + elementDimensions(element).height)) + 115,
      }
    : null;

  const setCanvas = useCallback((next: CanvasState | ((p: CanvasState) => CanvasState)) => {
    setWorkspace((previous) => {
      const selectedFuture = previous.futures.find((variant) => variant.id === previous.activeFutureId) ?? previous.futures[0];
      const activeCanvas = activeKind === 'current' ? previous.current : selectedFuture.canvas;
      const updated = normalizeCanvas(typeof next === 'function' ? next(activeCanvas) : next);
      const result: CanvasWorkspace = activeKind === 'current'
        ? {
            ...previous,
            current: updated,
            futures: previous.futures.map((variant) => ({
              ...variant,
              canvas: syncCurrentIntoFuture(previous.current, updated, variant.canvas),
            })),
          }
        : {
            ...previous,
            futures: previous.futures.map((variant) => variant.id === previous.activeFutureId ? { ...variant, canvas: updated } : variant),
          };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
      return result;
    });
  }, [activeKind]);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 80, y: 80 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingEl, setEditingEl] = useState<CanvasElement | null>(null);
  const [editingArrow, setEditingArrow] = useState<CanvasArrow | null>(null);
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuides>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [saved, setSaved] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [demandOpen, setDemandOpen] = useState(false);
  const [scenarioCreateOpen, setScenarioCreateOpen] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [liveRunning, setLiveRunning] = useState(false);
  const [liveElapsedSec, setLiveElapsedSec] = useState(0);
  const [liveSpeed, setLiveSpeed] = useState(300);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragMovedRef = useRef(false);
  const liveFrameRef = useRef<number | null>(null);
  const liveLastTickRef = useRef<number | null>(null);

  useEffect(() => {
    setSelectedId(null);
    setEditingEl(null);
    setEditingArrow(null);
    setLiveRunning(false);
    setLiveElapsedSec(0);
  }, [activeKind, workspace.activeFutureId]);

  useEffect(() => {
    if (!liveRunning) {
      liveLastTickRef.current = null;
      return;
    }
    const tick = (timestamp: number) => {
      if (liveLastTickRef.current !== null) {
        const deltaSeconds = Math.min(0.1, (timestamp - liveLastTickRef.current) / 1000);
        setLiveElapsedSec((previous) => Math.min(simulatedDaySeconds, previous + deltaSeconds * liveSpeed));
      }
      liveLastTickRef.current = timestamp;
      liveFrameRef.current = window.requestAnimationFrame(tick);
    };
    liveFrameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (liveFrameRef.current !== null) window.cancelAnimationFrame(liveFrameRef.current);
      liveFrameRef.current = null;
      liveLastTickRef.current = null;
    };
  }, [liveRunning, liveSpeed, simulatedDaySeconds]);

  useEffect(() => {
    if (liveElapsedSec >= simulatedDaySeconds && liveRunning) setLiveRunning(false);
  }, [liveElapsedSec, liveRunning, simulatedDaySeconds]);

  const openElementEditor = (element: CanvasElement) => {
    if (element.id === FIXED_PLANNING_ID) {
      setDemandOpen(true);
      return;
    }
    setEditingEl(element);
  };

  useEffect(() => {
    setSaved(false);
    const t = setTimeout(() => setSaved(true), 500);
    return () => clearTimeout(t);
  }, [workspace]);

  const toCanvas = useCallback((cx: number, cy: number) => ({
    x: (cx - pan.x) / zoom, y: (cy - pan.y) / zoom,
  }), [pan, zoom]);

  const onLibDragStart = (item: LibraryItem, e: React.DragEvent) => {
    e.dataTransfer.setData('mfv/kind', item.kind);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const onDrop = (e: React.DragEvent<SVGSVGElement>) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData('mfv/kind') as ElementKind;
    if (!kind) return;
    const rect = svgRef.current!.getBoundingClientRect();
    const { x, y } = toCanvas(e.clientX - rect.left, e.clientY - rect.top);
    const lib = LIBRARY.find((l) => l.kind === kind)!;
    if (ARROW_KINDS.includes(kind)) {
      const k = kind as CanvasArrow['kind'];
      const a: CanvasArrow = { id: makeId(), kind: k, x1: x, y1: y, x2: x+120, y2: y, label: lib.defaultLabel || undefined };
      setCanvas((p) => ({ ...p, arrows: [...p.arrows, a] }));
      setSelectedId(a.id);
    } else {
      const draftData = { ...lib.defaultData };
      const draft: CanvasElement = { id: makeId(), kind, x: x - lib.w/2, y: y - lib.h/2, label: lib.defaultLabel, data: draftData };
      const snapped = snapElementPosition(draft, draft.x, draft.y, canvas.elements);
      const el = { ...draft, x: snapped.x, y: snapped.y };
      setCanvas((p) => ({ ...p, elements: [...p.elements, el] }));
      setSelectedId(el.id);
    }
  };

  const onSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const t = e.target as SVGElement;
    if (t === svgRef.current || t.classList.contains('canvas-bg')) {
      setSelectedId(null);
      setDragging({ type: 'pan', startX: e.clientX, startY: e.clientY, origX: pan.x, origY: pan.y });
      e.preventDefault();
    }
  };

  const onElMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const el = canvas.elements.find((el) => el.id === id)!;
    setSelectedId(id);
    dragMovedRef.current = false;
    setDragging({ type: 'element', id, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y });
  };

  const onHandleMouseDown = (e: React.MouseEvent, id: string, point: 'start'|'end') => {
    e.stopPropagation();
    setDragging({ type: 'arrow-point', id, point });
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      if (dragging.type === 'pan') {
        setPan({ x: dragging.origX + e.clientX - dragging.startX, y: dragging.origY + e.clientY - dragging.startY });
      } else if (dragging.type === 'element') {
        const dx = (e.clientX - dragging.startX) / zoom;
        const dy = (e.clientY - dragging.startY) / zoom;
        if (Math.abs(e.clientX - dragging.startX) > 4 || Math.abs(e.clientY - dragging.startY) > 4) dragMovedRef.current = true;
        setCanvas((p) => {
          const target = p.elements.find((element) => element.id === dragging.id);
          if (!target) return p;
          const snapped = snapElementPosition(target, dragging.origX + dx, dragging.origY + dy, p.elements);
          setAlignmentGuides(snapped.guides);
          return { ...p, elements: p.elements.map((el) =>
            el.id === dragging.id ? { ...el, x: snapped.x, y: snapped.y } : el) };
        });
      } else if (dragging.type === 'arrow-point') {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const { x, y } = toCanvas(e.clientX - rect.left, e.clientY - rect.top);
        setCanvas((p) => ({ ...p, arrows: p.arrows.map((a) =>
          a.id !== dragging.id ? a : dragging.point === 'start' ? { ...a, x1:x, y1:y } : { ...a, x2:x, y2:y }) }));
      }
    };
    const onUp = () => { setDragging(null); setAlignmentGuides({}); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging, zoom, toCanvas, setCanvas]);

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.91;
    const rect = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left; const my = e.clientY - rect.top;
    setZoom((z) => {
      const nz = Math.min(4, Math.max(0.15, z * factor));
      setPan((p) => ({ x: mx - (mx - p.x) * (nz/z), y: my - (my - p.y) * (nz/z) }));
      return nz;
    });
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!selectedId) return;
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
      if ([FIXED_PLANNING_ID, FIXED_IDENTIFICATION_ID].includes(selectedId)) return;
      setCanvas((p) => ({ ...p, elements: p.elements.filter((el) => el.id !== selectedId), arrows: p.arrows.filter((a) => a.id !== selectedId) }));
      setSelectedId(null);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selectedId, setCanvas]);

  const updateEl = (id: string, patch: Partial<CanvasElement>) => {
    setCanvas((p) => ({ ...p, elements: p.elements.map((el) => el.id===id ? { ...el, ...patch } : el) }));
    if (editingEl?.id === id) setEditingEl((p) => p ? { ...p, ...patch } : p);
  };
  const deleteEl = (id: string) => {
    if ([FIXED_PLANNING_ID, FIXED_IDENTIFICATION_ID].includes(id)) return;
    setCanvas((p) => ({ ...p, elements: p.elements.filter((el) => el.id!==id), arrows: p.arrows.filter((a) => a.id!==id) }));
    setEditingEl(null); setSelectedId(null);
  };

  const guideBounds = canvas.elements.reduce((bounds, element) => {
    const size = elementDimensions(element);
    return {
      minX: Math.min(bounds.minX, element.x),
      minY: Math.min(bounds.minY, element.y),
      maxX: Math.max(bounds.maxX, element.x + size.width),
      maxY: Math.max(bounds.maxY, element.y + size.height),
    };
  }, { minX: 0, minY: 0, maxX: 1600, maxY: 700 });
  const updateArrow = (id: string, patch: Partial<CanvasArrow>) => {
    setCanvas((p) => ({ ...p, arrows: p.arrows.map((a) => a.id===id ? { ...a, ...patch } : a) }));
    if (editingArrow?.id === id) setEditingArrow((p) => p ? { ...p, ...patch } : p);
  };
  const deleteArrow = (id: string) => {
    setCanvas((p) => ({ ...p, arrows: p.arrows.filter((a) => a.id!==id) }));
    setEditingArrow(null); setSelectedId(null);
  };

  const saveAssumptions = (assumptions: ScenarioAssumptions) => {
    setCanvas((previous) => ({
      ...previous,
      assumptions,
      elements: previous.elements.map((element) => element.id === FIXED_PLANNING_ID
        ? { ...element, data: { ...element.data, ...planningData(assumptions) } }
        : element),
    }));
    setDemandOpen(false);
  };

  const applyThemeColor = (themeColor: string) => {
    const color = validThemeColor(themeColor);
    setCanvas((previous) => ({
      ...previous,
      themeColor: color,
    }));
  };

  const applyExcelTemplate = () => {
    if (!window.confirm('Substituir este cenário pelo modelo base inspirado no Excel? Os dados atuais deste cenário serão removidos.')) return;
    setCanvas((previous) => createExcelTemplate(previous.assumptions, activeKind));
    setSelectedId(null);
  };

  const selectFuture = (id: string) => {
    setWorkspace((previous) => {
      if (!previous.futures.some((variant) => variant.id === id)) return previous;
      const next = { ...previous, activeFutureId: id };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    setActiveKind('future');
  };

  const createScenario = (name: string, preset: ScenarioPreset) => {
    setWorkspace((previous) => {
      const variant: FutureVariant = {
        id: `future-${makeId()}`,
        name: name.trim() || `Cenário ${previous.futures.length + 1}`,
        canvas: canvasForPreset(previous.current, preset),
      };
      const next = { ...previous, futures: [...previous.futures, variant], activeFutureId: variant.id };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    setActiveKind('future');
    setScenarioCreateOpen(false);
  };

  const duplicateScenario = () => {
    setWorkspace((previous) => {
      const source = previous.futures.find((variant) => variant.id === previous.activeFutureId) ?? previous.futures[0];
      const variant = { id: `future-${makeId()}`, name: `${source.name} — cópia`, canvas: cloneCanvas(source.canvas) };
      const next = { ...previous, futures: [...previous.futures, variant], activeFutureId: variant.id };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    setActiveKind('future');
  };

  const renameScenario = () => {
    const name = window.prompt('Nome do cenário:', activeFuture.name)?.trim();
    if (!name) return;
    setWorkspace((previous) => {
      const next = { ...previous, futures: previous.futures.map((variant) => variant.id === previous.activeFutureId ? { ...variant, name } : variant) };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const deleteScenario = () => {
    if (workspace.futures.length === 1) {
      window.alert('Mantenha pelo menos um cenário futuro. Você pode limpar ou renomear o cenário atual.');
      return;
    }
    if (!window.confirm(`Excluir o cenário “${activeFuture.name}”?`)) return;
    setWorkspace((previous) => {
      const futures = previous.futures.filter((variant) => variant.id !== previous.activeFutureId);
      const next = { ...previous, futures, activeFutureId: futures[0].id };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const liveLaunched = liveElapsedSec > 0 && Number.isFinite(simulation.taktTimeSec) && simulation.taktTimeSec > 0
    ? Math.floor(liveElapsedSec / simulation.taktTimeSec) + 1
    : 0;
  const liveCompletionInterval = simulation.bottleneckCapacity > 0
    ? simulatedDaySeconds / simulation.bottleneckCapacity
    : Infinity;
  const liveNominalLeadSec = simulation.processMetrics.reduce((sum, metric) => sum + metric.effectiveCycleSec, 0)
    + simulation.waitingTimeMin * 60;
  const liveCompleted = Number.isFinite(liveCompletionInterval) && liveElapsedSec >= liveNominalLeadSec
    ? Math.min(liveLaunched, Math.floor((liveElapsedSec - liveNominalLeadSec) / liveCompletionInterval) + 1)
    : 0;
  const liveWip = Math.max(0, liveLaunched - liveCompleted);
  const liveClock = `${String(Math.floor(liveElapsedSec / 3600)).padStart(2, '0')}:${String(Math.floor((liveElapsedSec % 3600) / 60)).padStart(2, '0')}`;
  const toggleLiveSimulation = () => {
    if (!simulation.processElements.length) {
      window.alert('Adicione ao menos um processo com tempo de ciclo para executar a simulação.');
      return;
    }
    if (liveElapsedSec >= simulatedDaySeconds) setLiveElapsedSec(0);
    setSelectedId(null);
    setLiveRunning((running) => !running);
  };

  const resetLiveSimulation = () => {
    setLiveRunning(false);
    setLiveElapsedSec(0);
  };

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Sidebar */}
      <aside className="app-sidebar no-print">
        <div className="sidebar-brand">
          <div className="app-symbol"><Route size={20} /></div>
          <div className="sidebar-brand-text"><strong>MFV</strong><span>Simulador</span></div>
          <button className="collapse-button" onClick={() => setSidebarCollapsed(v => !v)}>
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <div className="sidebar-section-label"><span>Cenário</span></div>
        <nav className="sidebar-nav">
          <button className={activeKind==='current'?'active current':''} onClick={() => setActiveKind('current')} title="Estado atual">
            <Map size={18} /><span>Estado atual</span>
          </button>
          <button className={activeKind==='future'?'active future':''} onClick={() => setActiveKind('future')} title="Estado futuro">
            <GitCompareArrows size={18} /><span>Estado futuro <small>{workspace.futures.length}</small></span>
          </button>
          <button className="demand-nav-button" onClick={() => setDemandOpen(true)} title="Dados de demanda e TAKT">
            <Calculator size={18} /><span>Demanda e TAKT</span>
          </button>
        </nav>

        {!sidebarCollapsed && <LibraryPanel onDragStart={onLibDragStart} accentColor={DEFAULT_THEME_COLOR} />}

        <div className="sidebar-bottom">
          <div className="save-state"><Save size={14} /><span>{saved ? 'Salvo' : 'Salvando…'}</span></div>
          <button onClick={applyExcelTemplate} title="Montar o fluxo padrão usado no Excel"><LayoutTemplate size={17} /><span>Modelo base do Excel</span></button>
          <button onClick={() => { resetLiveSimulation(); setSelectedId(null); setExportOpen(true); }}><Download size={17} /><span>Exportar</span></button>
          <button onClick={() => { if (window.confirm('Limpar os elementos do canvas? As caixas de identificação e demanda serão mantidas.')) { setCanvas((previous) => ({ ...previous, elements: previous.elements.filter((element) => [FIXED_PLANNING_ID, FIXED_IDENTIFICATION_ID].includes(element.id)), arrows: [] })); setSelectedId(null); } }}>
            <RotateCcw size={17} /><span>Limpar</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="app-main" style={{ display:'flex', flexDirection:'column' }}>
        <header className="app-header">
          <div>
            <ScenarioPill kind={activeKind} />
            <h1>{activeKind==='current'?'Estado atual':activeFuture.name}</h1>
            <p>{activeKind === 'current'
              ? <>Tudo que for criado aqui avança automaticamente para o Estado futuro.</>
              : <>Simule demanda, cargas e tempos sem alterar o Estado atual.</>}
            </p>
          </div>
          <div className="header-actions">
            <div className="simulation-summary">
              <div><span>Demanda diária</span><strong>{simulation.dailyDemand.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} un</strong></div>
              <div><span>TAKT</span><strong>{(simulation.taktTimeSec / 60).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} min</strong></div>
              <div title={simulation.bottleneck ? `Gargalo: ${simulation.bottleneck.label}` : undefined}><span>Capacidade da linha</span><strong>{simulation.bottleneckCapacity ? `${simulation.bottleneckCapacity.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} un/dia` : '—'}</strong></div>
              <div className={simulation.invalidProcesses.length ? 'summary-warning' : simulation.overloadedProcesses.length ? 'summary-critical' : 'summary-ok'}>
                {simulation.invalidProcesses.length || simulation.overloadedProcesses.length ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
                <span>{simulation.invalidProcesses.length
                  ? `${simulation.invalidProcesses.length} processo(s) sem T/C`
                  : simulation.overloadedProcesses.length
                    ? `${simulation.overloadedProcesses.length} processo(s) crítico(s)`
                    : simulation.processElements.length ? 'Processos atendem' : 'Adicione processos'}</span>
              </div>
            </div>
            {activeKind === 'future' && <button className="future-sync-status" onClick={() => setComparisonOpen(true)} title="Comparar todos os cenários com o Estado atual">
              <BarChart3 size={15}/><span>Comparar</span>
            </button>}
            <button className={`live-launch-button ${liveRunning ? 'running' : ''}`} onClick={toggleLiveSimulation} title="Executar o fluxo produtivo no canvas">
              {liveRunning ? <Pause size={16}/> : <Activity size={16}/>}<span>{liveRunning ? 'Pausar' : liveElapsedSec > 0 ? 'Continuar' : 'Simular fluxo'}</span>
            </button>
            <label className="theme-color-button" title="Personalizar a cor de todo o MFV">
              <Palette size={16}/><span>Cor do MFV</span>
              <input type="color" value={canvas.themeColor} onChange={(event) => applyThemeColor(event.target.value)} aria-label="Cor do MFV" />
              <i style={{ backgroundColor: canvas.themeColor }} />
            </label>
            <div className="zoom-controls">
              <button onClick={() => setZoom(z => Math.max(0.15, z*.85))}><ZoomOut size={15}/></button>
              <span>{Math.round(zoom*100)}%</span>
              <button onClick={() => setZoom(z => Math.min(4, z*1.15))}><ZoomIn size={15}/></button>
              <button onClick={() => { setZoom(1); setPan({x:80,y:80}); }} title="Reset"><Minus size={13}/></button>
            </div>
            <button className="primary-button" onClick={() => { resetLiveSimulation(); setSelectedId(null); setExportOpen(true); }}>
              <Download size={17}/>Exportar
            </button>
          </div>
        </header>

        {(liveRunning || liveElapsedSec > 0) && <div className="live-simulation-bar no-print">
          <div className="live-playback-controls">
            <button className="live-play-button" onClick={toggleLiveSimulation} aria-label={liveRunning ? 'Pausar simulação' : 'Continuar simulação'}>
              {liveRunning ? <Pause size={16}/> : <Play size={16}/>}
            </button>
            <button onClick={resetLiveSimulation} aria-label="Reiniciar simulação"><Square size={13}/></button>
            <label><span>Velocidade</span><select value={liveSpeed} onChange={(event) => setLiveSpeed(Number(event.target.value))}>
              <option value={60}>1 min/s</option><option value={300}>5 min/s</option><option value={1200}>20 min/s</option>
            </select></label>
          </div>
          <div className="live-metrics">
            <div><span>Tempo simulado</span><strong>{liveClock}</strong></div>
            <div><span>Ordens liberadas</span><strong>{liveLaunched}</strong></div>
            <div><span>Caixas concluídas</span><strong>{liveCompleted}</strong></div>
            <div className={liveWip > 0 ? 'attention' : ''}><span>WIP em fluxo</span><strong>{liveWip}</strong></div>
            <div className={simulation.overloadedProcesses.length ? 'critical' : 'healthy'}><span>Situação</span><strong>{simulation.overloadedProcesses.length ? `${simulation.overloadedProcesses.length} quebra(m)` : 'Fluxo atende'}</strong></div>
          </div>
          <div className="live-day-progress"><i style={{ width: `${Math.min(100, (liveElapsedSec / simulatedDaySeconds) * 100)}%` }}/></div>
        </div>}

        {activeKind === 'future' && <div className="scenario-toolbar no-print">
          <div className="scenario-selector">
            <span>Cenário de simulação</span>
            <select value={workspace.activeFutureId} onChange={(event) => selectFuture(event.target.value)}>
              {workspace.futures.map((variant) => <option key={variant.id} value={variant.id}>{variant.name}</option>)}
            </select>
            <span className="future-sync-note"><CheckCircle2 size={13}/> recebe alterações do Estado atual</span>
          </div>
          <div className="scenario-actions">
            <button onClick={() => setScenarioCreateOpen(true)}><Plus size={15}/>Novo cenário</button>
            <button onClick={duplicateScenario} title="Duplicar cenário"><Copy size={15}/><span>Duplicar</span></button>
            <button onClick={renameScenario} title="Renomear cenário"><Pencil size={15}/><span>Renomear</span></button>
            <button className="danger" onClick={deleteScenario} title="Excluir cenário"><Trash2 size={15}/><span>Excluir</span></button>
          </div>
        </div>}

        {canvas.elements.every((element) => [FIXED_PLANNING_ID, FIXED_IDENTIFICATION_ID].includes(element.id)) && canvas.arrows.length===0 && (
          <div className="canvas-empty-hint">
            <BookOpen size={32}/>
            <strong>Comece pelo fluxo</strong>
            <p>Arraste elementos da biblioteca à esquerda para montar o MFV.</p>
          </div>
        )}

        <svg ref={svgRef} className="mfv-canvas"
          style={{ flex:1, cursor: dragging?.type==='pan'?'grabbing':'default' }}
          onMouseDown={onSvgMouseDown}
          onWheel={onWheel}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}>
          <defs>
            <pattern id="grid" width={20*zoom} height={20*zoom} patternUnits="userSpaceOnUse"
              x={pan.x%(20*zoom)} y={pan.y%(20*zoom)}>
              <circle cx={1} cy={1} r={0.8} fill="#d5d5db"/>
            </pattern>
          </defs>
          <rect className="canvas-bg" width="100%" height="100%" fill="url(#grid)"/>

          <g data-export-content transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {(alignmentGuides.x !== undefined || alignmentGuides.y !== undefined) && (
              <g data-export-ui pointerEvents="none">
                {alignmentGuides.x !== undefined && <line x1={alignmentGuides.x} y1={guideBounds.minY - 80} x2={alignmentGuides.x} y2={guideBounds.maxY + 140} stroke="#0071e3" strokeWidth={1.2} strokeDasharray="6 4" />}
                {alignmentGuides.y !== undefined && <line x1={guideBounds.minX - 80} y1={alignmentGuides.y} x2={guideBounds.maxX + 140} y2={alignmentGuides.y} stroke="#0071e3" strokeWidth={1.2} strokeDasharray="6 4" />}
              </g>
            )}
            {canvas.arrows.map((arrow) => (
              <ArrowShape key={arrow.id} arrow={arrow} selected={selectedId===arrow.id} accentColor={canvas.themeColor}
                onClick={(e) => { e.stopPropagation(); setSelectedId(arrow.id); if (e.detail===2) setEditingArrow(arrow); }} />
            ))}
            {canvas.arrows.filter(a => a.id===selectedId).map((arrow) => (
              <g key={`h-${arrow.id}`} data-export-ui>
                <circle cx={arrow.x1} cy={arrow.y1} r={7} fill="white" stroke="#0071e3" strokeWidth={2} style={{cursor:'move'}}
                  onMouseDown={(e) => { e.stopPropagation(); onHandleMouseDown(e, arrow.id, 'start'); }} />
                <circle cx={arrow.x2} cy={arrow.y2} r={7} fill="white" stroke="#0071e3" strokeWidth={2} style={{cursor:'move'}}
                  onMouseDown={(e) => { e.stopPropagation(); onHandleMouseDown(e, arrow.id, 'end'); }} />
              </g>
            ))}
            {canvas.elements.filter((el) => el.kind !== 'timeline').map((el) => (
              <g key={el.id} transform={`translate(${el.x},${el.y})`}
                style={{ cursor: el.kind === 'identification' ? 'pointer' : 'move', userSelect:'none' }}
                onMouseDown={(e) => onElMouseDown(e, el.id)}
                onClick={(e) => {
                  if (el.kind !== 'identification' || dragMovedRef.current) return;
                  e.stopPropagation();
                  openElementEditor(el);
                }}
                onDoubleClick={(e) => { e.stopPropagation(); openElementEditor(el); }}>
                {renderElement(el, selectedId===el.id, () => openElementEditor(el), simulation, canvas.assumptions.availableMinutesPerDay, canvas.themeColor)}
              </g>
            ))}
            <LiveFlowOverlay canvas={canvas} simulation={simulation} elapsedSec={liveElapsedSec} />
            {automaticTimelinePosition && (
              <g transform={`translate(${automaticTimelinePosition.x},${automaticTimelinePosition.y})`}>
                <TimelineSymbol
                  el={{ id: '__automatic-timeline__', kind: 'timeline', x: 0, y: 0, label: '', data: {} }}
                  selected={false}
                  onEdit={() => undefined}
                  timelineItems={simulation.timelineItems.map((item) => ({ ...item, x: item.x - automaticTimelinePosition.x }))}
                  leadTimeDays={simulation.leadTimeDays}
                  processingTimeMin={simulation.processingTimeMin}
                  accentColor={canvas.themeColor}
                />
              </g>
            )}
          </g>
        </svg>

        {selectedId && (
          <div className="canvas-delete-hint">
            {[FIXED_PLANNING_ID, FIXED_IDENTIFICATION_ID].includes(selectedId)
              ? <>Caixa fixa do cenário · arraste para mover · duplo clique para editar</>
              : <>Pressione <kbd>Delete</kbd> para remover · duplo clique para editar</>}
          </div>
        )}
      </main>

      {editingEl && editingEl.kind === 'identification' && (
        <IdentificationEditor el={editingEl}
          onUpdate={(patch) => updateEl(editingEl.id, patch)}
          onClose={() => setEditingEl(null)} />
      )}
      {editingEl && editingEl.kind !== 'identification' && (
        <ElementPopover el={editingEl}
          onUpdate={(p) => updateEl(editingEl.id, p)}
          onDelete={() => deleteEl(editingEl.id)}
          onClose={() => setEditingEl(null)} />
      )}
      {editingArrow && (
        <ArrowPopover arrow={editingArrow}
          onUpdate={(p) => updateArrow(editingArrow.id, p)}
          onDelete={() => deleteArrow(editingArrow.id)}
          onClose={() => setEditingArrow(null)} />
      )}
      {exportOpen && <ExportModal svgRef={svgRef} name={activeKind==='current'?'Estado_Atual':`Estado_Futuro_${activeFuture.name.replace(/[^a-z0-9]+/gi,'_')}`} onClose={() => setExportOpen(false)} />}
      {demandOpen && <DemandModal assumptions={canvas.assumptions}
        planning={canvas.elements.find((element) => element.id === FIXED_PLANNING_ID)!}
        onSave={saveAssumptions}
        onUpdatePlanning={(patch) => updateEl(FIXED_PLANNING_ID, patch)}
        onClose={() => setDemandOpen(false)} />}
      {scenarioCreateOpen && <ScenarioCreateModal onCreate={createScenario} onClose={() => setScenarioCreateOpen(false)} />}
      {comparisonOpen && <ComparisonModal workspace={workspace} onSelect={selectFuture} onClose={() => setComparisonOpen(false)} />}
    </div>
  );
}

// ─── Modal exportação ─────────────────────────────────────────────────────────

function ExportModal({ svgRef, name, onClose }: { svgRef: React.RefObject<SVGSVGElement>; name: string; onClose: () => void }) {
  const [loading, setLoading] = useState<string|null>(null);
  const [paperSize, setPaperSize] = useState<PaperSize>('a3');
  const [error, setError] = useState<string|null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key==='Escape') onClose(); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const run = async (fmt: 'pdf'|'jpeg'|'svg') => {
    const svg = svgRef.current; if (!svg) return;
    setLoading(fmt);
    setError(null);
    try {
      const filename = `MFV_${name}`;
      if (fmt === 'pdf') await exportPDF(svg, filename, paperSize);
      if (fmt === 'jpeg') await exportJPEG(svg, filename);
      if (fmt === 'svg') exportSVG(svg, filename);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Não foi possível exportar o MFV.');
    } finally {
      setLoading(null);
    }
  };

  const formats = [
    { fmt:'pdf' as const, icon:<FileText size={20}/>, label:'PDF para impressão', desc:`${paperSize.toUpperCase()} · orientação e escala automáticas` },
    { fmt:'jpeg' as const, icon:<FileImage size={20}/>, label:'JPEG', desc:'Imagem recortada somente no MFV' },
    { fmt:'svg' as const, icon:<ImageDown size={20}/>, label:'SVG', desc:'Vetorial recortado somente no MFV' },
  ];

  return (
    <div className="editor-overlay" role="dialog" aria-modal="true">
      <button className="editor-backdrop" onClick={onClose} />
      <section className="editor-window export-modal">
        <header>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <Download size={20}/>
            <div><h2 style={{margin:'0 0 2px'}}>Imprimir e exportar MFV</h2><p style={{margin:0,color:'#8e8e93',fontSize:11}}>Somente a área ocupada pelo mapa será exportada.</p></div>
          </div>
          <button className="icon-button" onClick={onClose}><X size={20}/></button>
        </header>

        <div className="paper-size-picker">
          <span>Tamanho da folha</span>
          <div>
            {(['a1','a2','a3','a4'] as PaperSize[]).map((size) => (
              <button key={size} className={paperSize === size ? 'active' : ''} onClick={() => setPaperSize(size)} disabled={!!loading}>
                {size.toUpperCase()}
              </button>
            ))}
          </div>
          <small>A orientação será definida automaticamente conforme o formato do MFV.</small>
        </div>
        <div className="export-options">
          {formats.map(({fmt,icon,label,desc}) => (
            <button key={fmt} className={`export-option ${loading===fmt?'loading':''}`} onClick={() => run(fmt)} disabled={!!loading}>
              <div className="export-icon">{loading===fmt?<Loader2 size={20} className="spin"/>:icon}</div>
              <div><strong>{label}</strong><span>{desc}</span></div>
            </button>
          ))}
          {error && <p className="export-error">{error}</p>}
        </div>
      </section>
    </div>
  );
}
