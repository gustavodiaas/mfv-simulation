// ─── Tipos do canvas MFV ────────────────────────────────────────────────────

export type ElementKind =
  | 'process'
  | 'inventory'
  | 'supermarket'
  | 'fifo'
  | 'truck'
  | 'planning'
  | 'customer'
  | 'supplier'
  | 'kaizen'
  | 'arrow-push'
  | 'arrow-pull'
  | 'arrow-info-manual'
  | 'arrow-info-electronic'
  | 'timeline';

export interface Position { x: number; y: number; }

export interface CanvasElement {
  id: string;
  kind: ElementKind;
  x: number;
  y: number;
  // dados editáveis por kind
  label: string;
  data: Record<string, string | number>;
}

// Setas têm dois pontos livres
export interface CanvasArrow {
  id: string;
  kind: 'arrow-push' | 'arrow-pull' | 'arrow-info-manual' | 'arrow-info-electronic';
  x1: number; y1: number;
  x2: number; y2: number;
  label?: string;
}

export interface CanvasState {
  elements: CanvasElement[];
  arrows: CanvasArrow[];
}

// Metadados de cada tipo de elemento da biblioteca
export interface LibraryItem {
  kind: ElementKind;
  label: string;
  group: 'material' | 'informacao' | 'fluxo' | 'anotacao';
  defaultData: Record<string, string | number>;
  defaultLabel: string;
  w: number; // largura padrão no canvas
  h: number; // altura padrão no canvas
}

export const LIBRARY: LibraryItem[] = [
  // Fluxo de material
  { kind: 'supplier',     label: 'Fornecedor',           group: 'material',   defaultLabel: 'Fornecedor',       defaultData: { freq: 1 },                                                              w: 120, h: 80 },
  { kind: 'customer',     label: 'Cliente',              group: 'material',   defaultLabel: 'Cliente',           defaultData: { freq: 1 },                                                              w: 120, h: 80 },
  { kind: 'truck',        label: 'Caminhão',             group: 'material',   defaultLabel: 'Entrega',           defaultData: { freq: 1 },                                                              w: 90,  h: 50 },
  { kind: 'process',      label: 'Processo',             group: 'material',   defaultLabel: 'Processo',          defaultData: { tc: 0, setup: 0, lote: 1, op: 1, disp: 100, wip: 0 },                 w: 150, h: 160 },
  { kind: 'inventory',    label: 'Estoque',              group: 'material',   defaultLabel: 'Estoque',           defaultData: { qty: 0, dias: 0 },                                                      w: 60,  h: 60 },
  { kind: 'supermarket',  label: 'Supermercado',         group: 'material',   defaultLabel: 'Supermercado',      defaultData: { qty: 0 },                                                               w: 80,  h: 70 },
  { kind: 'fifo',         label: 'Fila FIFO',            group: 'material',   defaultLabel: 'FIFO',              defaultData: { qty: 0 },                                                               w: 100, h: 50 },
  // Fluxo de informação
  { kind: 'planning',     label: 'Controle produção',    group: 'informacao', defaultLabel: 'Controle da\nProdução', defaultData: { demanda: 0, takt: 0 },                                           w: 160, h: 110 },
  // Setas
  { kind: 'arrow-push',           label: 'Fluxo empurrado',     group: 'fluxo',      defaultLabel: '',   defaultData: {}, w: 0, h: 0 },
  { kind: 'arrow-pull',           label: 'Fluxo puxado',        group: 'fluxo',      defaultLabel: '',   defaultData: {}, w: 0, h: 0 },
  { kind: 'arrow-info-manual',    label: 'Info manual',         group: 'fluxo',      defaultLabel: '',   defaultData: {}, w: 0, h: 0 },
  { kind: 'arrow-info-electronic',label: 'Info eletrônica',     group: 'fluxo',      defaultLabel: '',   defaultData: {}, w: 0, h: 0 },
  // Anotação
  { kind: 'kaizen',       label: 'Kaizen burst',         group: 'anotacao',   defaultLabel: 'Kaizen',            defaultData: {},                                                                       w: 70,  h: 70 },
  { kind: 'timeline',     label: 'Linha do tempo',       group: 'anotacao',   defaultLabel: 'Lead time:\nT. processo:', defaultData: { leadtime: 0, tprocess: 0 },                                   w: 400, h: 60 },
];

export function makeId() {
  return Math.random().toString(36).slice(2, 10);
}
