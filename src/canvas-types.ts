export type ElementKind =
  // Material
  | 'process'
  | 'supplier'
  | 'customer'
  | 'truck'
  | 'inventory'
  | 'supermarket'
  | 'fifo'
  | 'buffer'
  | 'shipping-point'
  | 'kanban-production'
  | 'kanban-withdrawal'
  | 'kanban-board'
  | 'heijunka'
  | 'sequencing-box'
  // Informação
  | 'planning'
  | 'data-box'
  | 'customer-demand'
  | 'production-schedule'
  // Operador
  | 'operator'
  | 'work-cell'
  // Setas (fluxo)
  | 'arrow-push'
  | 'arrow-pull'
  | 'arrow-info-manual'
  | 'arrow-info-electronic'
  | 'arrow-adjustment'
  // Anotação
  | 'kaizen'
  | 'intervention'
  | 'note'
  | 'timeline'
  | 'legend';

export interface CanvasElement {
  id: string;
  kind: ElementKind;
  x: number;
  y: number;
  label: string;
  data: Record<string, string | number>;
}

export interface CanvasArrow {
  id: string;
  kind: 'arrow-push' | 'arrow-pull' | 'arrow-info-manual' | 'arrow-info-electronic' | 'arrow-adjustment';
  x1: number; y1: number;
  x2: number; y2: number;
  label?: string;
}

export interface ScenarioAssumptions {
  monthlyDemand: number;
  workdaysPerMonth: number;
  availableMinutesPerDay: number;
}

export interface CanvasState {
  elements: CanvasElement[];
  arrows: CanvasArrow[];
  assumptions: ScenarioAssumptions;
}

export interface LibraryItem {
  kind: ElementKind;
  label: string;
  group: 'material' | 'kanban' | 'informacao' | 'operador' | 'fluxo' | 'anotacao';
  defaultData: Record<string, string | number>;
  defaultLabel: string;
  w: number;
  h: number;
}

export const ARROW_KINDS: ElementKind[] = [
  'arrow-push', 'arrow-pull', 'arrow-info-manual', 'arrow-info-electronic', 'arrow-adjustment',
];

export const LIBRARY: LibraryItem[] = [
  // ── Material
  { kind: 'supplier',          label: 'Fornecedor',         group: 'material',   defaultLabel: 'Fornecedor',          defaultData: { freq: 1 },                                      w: 120, h: 80  },
  { kind: 'customer',          label: 'Cliente',            group: 'material',   defaultLabel: 'Cliente',             defaultData: { freq: 1 },                                      w: 120, h: 80  },
  { kind: 'truck',             label: 'Caminhão',           group: 'material',   defaultLabel: 'Entrega',             defaultData: { freq: 1 },                                      w: 90,  h: 50  },
  { kind: 'shipping-point',    label: 'Expedição',          group: 'material',   defaultLabel: 'Expedição',           defaultData: {},                                               w: 100, h: 70  },
  { kind: 'process',           label: 'Processo',           group: 'material',   defaultLabel: 'Processo',            defaultData: { tc: 0, setup: 0, lote: 1, op: 1, disp: 100, wip: 0 }, w: 150, h: 160 },
  { kind: 'work-cell',         label: 'Célula de trabalho', group: 'material',   defaultLabel: 'Célula',              defaultData: { op: 1 },                                        w: 160, h: 100 },
  { kind: 'inventory',         label: 'Estoque',            group: 'material',   defaultLabel: 'Estoque',             defaultData: { qty: 0, dias: 0 },                              w: 60,  h: 60  },
  { kind: 'buffer',            label: 'Buffer / Pulmão',    group: 'material',   defaultLabel: 'Buffer',              defaultData: { qty: 0 },                                       w: 80,  h: 60  },
  { kind: 'supermarket',       label: 'Supermercado',       group: 'material',   defaultLabel: 'Supermercado',        defaultData: { qty: 0 },                                       w: 80,  h: 70  },
  { kind: 'fifo',              label: 'Fila FIFO',          group: 'material',   defaultLabel: 'FIFO',                defaultData: { qty: 0 },                                       w: 100, h: 50  },
  // ── Kanban
  { kind: 'kanban-production', label: 'Kanban produção',    group: 'kanban',     defaultLabel: 'Kanban\nprodução',    defaultData: { qty: 0 },                                       w: 60,  h: 44  },
  { kind: 'kanban-withdrawal', label: 'Kanban retirada',    group: 'kanban',     defaultLabel: 'Kanban\nretirada',   defaultData: { qty: 0 },                                       w: 60,  h: 44  },
  { kind: 'kanban-board',      label: 'Quadro kanban',      group: 'kanban',     defaultLabel: 'Quadro\nKanban',     defaultData: { cols: 3, rows: 3 },                             w: 120, h: 100 },
  { kind: 'heijunka',          label: 'Heijunka box',       group: 'kanban',     defaultLabel: 'Heijunka',           defaultData: { cols: 5, rows: 2 },                             w: 140, h: 80  },
  { kind: 'sequencing-box',    label: 'Caixa sequenciamento', group: 'kanban',   defaultLabel: 'Sequenciamento',     defaultData: { slots: 6 },                                     w: 120, h: 60  },
  // ── Informação
  { kind: 'planning',          label: 'Controle produção',  group: 'informacao', defaultLabel: 'Controle da\nProdução', defaultData: { demanda: 0, takt: 0 },                     w: 160, h: 110 },
  { kind: 'data-box',          label: 'Caixa de dados',     group: 'informacao', defaultLabel: 'Dados',               defaultData: { tc: 0, tcp: 0, disp: 100, turnos: 1 },        w: 130, h: 90  },
  { kind: 'customer-demand',   label: 'Demanda do cliente', group: 'informacao', defaultLabel: 'Demanda',             defaultData: { qty: 0, periodo: 0 },                          w: 100, h: 80  },
  { kind: 'production-schedule', label: 'Prog. produção',   group: 'informacao', defaultLabel: 'Programação',         defaultData: {},                                               w: 110, h: 70  },
  // ── Operador
  { kind: 'operator',          label: 'Operador',           group: 'operador',   defaultLabel: 'Op.',                 defaultData: { qty: 1 },                                       w: 40,  h: 60  },
  // ── Setas
  { kind: 'arrow-push',            label: 'Fluxo empurrado',  group: 'fluxo', defaultLabel: '', defaultData: {}, w: 0, h: 0 },
  { kind: 'arrow-pull',            label: 'Fluxo puxado',     group: 'fluxo', defaultLabel: '', defaultData: {}, w: 0, h: 0 },
  { kind: 'arrow-info-manual',     label: 'Info manual',      group: 'fluxo', defaultLabel: '', defaultData: {}, w: 0, h: 0 },
  { kind: 'arrow-info-electronic', label: 'Info eletrônica',  group: 'fluxo', defaultLabel: '', defaultData: {}, w: 0, h: 0 },
  { kind: 'arrow-adjustment',      label: 'Seta ajuste',      group: 'fluxo', defaultLabel: '', defaultData: {}, w: 0, h: 0 },
  // ── Anotação
  { kind: 'kaizen',            label: 'Kaizen burst',       group: 'anotacao',   defaultLabel: 'Kaizen',              defaultData: {},                                               w: 78,  h: 78  },
  { kind: 'intervention',      label: 'Ponto intervenção',  group: 'anotacao',   defaultLabel: 'Melhoria',            defaultData: {},                                               w: 70,  h: 70  },
  { kind: 'note',              label: 'Nota / Post-it',     group: 'anotacao',   defaultLabel: 'Nota...',             defaultData: {},                                               w: 120, h: 80  },
  { kind: 'timeline',          label: 'Linha do tempo',     group: 'anotacao',   defaultLabel: '',                    defaultData: { leadtime: 0, tprocess: 0 },                    w: 400, h: 70  },
  { kind: 'legend',            label: 'Legenda',            group: 'anotacao',   defaultLabel: 'Legenda',             defaultData: {},                                               w: 160, h: 120 },
];

export function makeId() {
  return Math.random().toString(36).slice(2, 10);
}
