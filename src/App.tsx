import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen, Download, FilePenLine, GitCompareArrows,
  Map, Minus, PanelLeftClose, PanelLeftOpen, Plus,
  RotateCcw, Route, Save, Trash2, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import {
  LIBRARY, makeId,
  type CanvasArrow, type CanvasElement, type CanvasState, type ElementKind, type LibraryItem,
} from './canvas-types';
import {
  FifoSymbol, InventorySymbol, KaizenSymbol, PartySymbol,
  PlanningSymbol, ProcessSymbol, SupermarketSymbol, TimelineSymbol, TruckSymbol,
} from './MfvSymbols';
import { exportJPEG, exportPDF, exportSVG } from './export';

// ─── Constantes ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'mfv-canvas:v1';
const ELEMENT_SIZES: Partial<Record<ElementKind, { w: number; h: number }>> = {
  process: { w: 150, h: 160 }, supplier: { w: 120, h: 80 }, customer: { w: 120, h: 80 },
  truck: { w: 90, h: 50 }, inventory: { w: 60, h: 60 }, supermarket: { w: 80, h: 70 },
  fifo: { w: 100, h: 50 }, planning: { w: 160, h: 110 }, kaizen: { w: 78, h: 78 },
  timeline: { w: 400, h: 60 },
};

// ─── Persistência ─────────────────────────────────────────────────────────────

function loadCanvas(): CanvasState {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) return JSON.parse(s);
  } catch { /* ignore */ }
  return { elements: [], arrows: [] };
}
function saveCanvas(s: CanvasState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

// ─── helpers ──────────────────────────────────────────────────────────────────

type ScenarioKind = 'current' | 'future';

function ScenarioPill({ kind }: { kind: ScenarioKind }) {
  return <span className={`scenario-pill ${kind}`}>{kind === 'current' ? 'Estado atual' : 'Estado futuro'}</span>;
}

// ─── Setas SVG ───────────────────────────────────────────────────────────────

function ArrowShape({ arrow, selected, onClick }: {
  arrow: CanvasArrow; selected: boolean; onClick: (e: React.MouseEvent) => void;
}) {
  const dx = arrow.x2 - arrow.x1;
  const dy = arrow.y2 - arrow.y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const mx = (arrow.x1 + arrow.x2) / 2;
  const my = (arrow.y1 + arrow.y2) / 2;

  const stroke = selected ? '#0071e3' : arrow.kind === 'arrow-push' ? '#3d4451' : arrow.kind === 'arrow-pull' ? '#0071e3' : '#333';
  const dash = arrow.kind === 'arrow-info-electronic' ? '5 3' : 'none';
  const strokeW = selected ? 2.5 : 2;

  // ponto final recuado 10px para a ponta da seta não ultrapassar
  const ux = len > 0 ? dx / len : 1;
  const uy = len > 0 ? dy / len : 0;
  const ex = arrow.x2 - ux * 10;
  const ey = arrow.y2 - uy * 10;

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      {/* hitbox mais larga */}
      <line x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2}
        stroke="transparent" strokeWidth={16} />

      {arrow.kind === 'arrow-push' ? (
        // seta larga empurrado
        <>
          <defs>
            <marker id={`push-${arrow.id}`} markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
              <polygon points="0,0 10,4 0,8" fill={stroke} />
            </marker>
          </defs>
          <line x1={arrow.x1} y1={arrow.y1} x2={ex} y2={ey}
            stroke={stroke} strokeWidth={strokeW + 3}
            markerEnd={`url(#push-${arrow.id})`} />
        </>
      ) : arrow.kind === 'arrow-pull' ? (
        // seta curva puxado
        <>
          <defs>
            <marker id={`pull-${arrow.id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <polygon points="0,0 8,4 0,8" fill={stroke} />
            </marker>
          </defs>
          <path d={`M${arrow.x1},${arrow.y1} Q${mx - dy * 0.25},${my + dx * 0.25} ${ex},${ey}`}
            fill="none" stroke={stroke} strokeWidth={strokeW}
            markerEnd={`url(#pull-${arrow.id})`} />
          <circle cx={arrow.x1} cy={arrow.y1} r={4} fill={stroke} />
        </>
      ) : arrow.kind === 'arrow-info-electronic' ? (
        // seta eletrônica com zig-zag no meio
        <>
          <defs>
            <marker id={`ielec-${arrow.id}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <polygon points="0,0 7,3.5 0,7" fill={stroke} />
            </marker>
          </defs>
          <path d={`M${arrow.x1},${arrow.y1} Q${mx},${my - 30} ${ex},${ey}`}
            fill="none" stroke={stroke} strokeWidth={strokeW} strokeDasharray={dash}
            markerEnd={`url(#ielec-${arrow.id})`} />
          {/* ícone relâmpago no meio */}
          <polygon points={`${mx - 4},${my - 16} ${mx - 7},${my - 8} ${mx - 2},${my - 8} ${mx - 6},${my} ${mx + 4},${my - 10} ${mx - 1},${my - 10}`}
            fill="#0071e3" opacity={0.85} />
        </>
      ) : (
        // seta manual
        <>
          <defs>
            <marker id={`man-${arrow.id}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <polygon points="0,0 7,3.5 0,7" fill={stroke} />
            </marker>
          </defs>
          <path d={`M${arrow.x1},${arrow.y1} Q${mx},${my - 30} ${ex},${ey}`}
            fill="none" stroke={stroke} strokeWidth={strokeW}
            markerEnd={`url(#man-${arrow.id})`} />
        </>
      )}

      {arrow.label && (
        <text x={mx} y={my - 10} textAnchor="middle" fontSize={8} fontFamily="Arial" fill="#444">{arrow.label}</text>
      )}

      {/* handles nos extremos quando selecionado */}
      {selected && <>
        <circle cx={arrow.x1} cy={arrow.y1} r={6} fill="white" stroke="#0071e3" strokeWidth={1.5} style={{ cursor: 'nwse-resize' }} />
        <circle cx={arrow.x2} cy={arrow.y2} r={6} fill="white" stroke="#0071e3" strokeWidth={1.5} style={{ cursor: 'nwse-resize' }} />
      </>}
    </g>
  );
}

// ─── Popover de edição de elemento ───────────────────────────────────────────

const FIELD_DEFS: Partial<Record<ElementKind, { key: string; label: string; suffix?: string; type?: string }[]>> = {
  process: [
    { key: 'label-field', label: 'Nome', type: 'text' },
    { key: 'tc',    label: 'Tempo de ciclo', suffix: 's' },
    { key: 'setup', label: 'Setup', suffix: 'min' },
    { key: 'lote',  label: 'Lote', suffix: 'un' },
    { key: 'op',    label: 'Operadores', suffix: 'pess.' },
    { key: 'disp',  label: 'Disponibilidade', suffix: '%' },
    { key: 'wip',   label: 'Estoque após', suffix: 'un' },
  ],
  supplier:    [{ key: 'label-field', label: 'Nome', type: 'text' }, { key: 'freq', label: 'Frequência', suffix: 'dias' }],
  customer:    [{ key: 'label-field', label: 'Nome', type: 'text' }, { key: 'freq', label: 'Frequência', suffix: 'dias' }],
  truck:       [{ key: 'label-field', label: 'Rótulo', type: 'text' }, { key: 'freq', label: 'Frequência', suffix: 'dias' }],
  inventory:   [{ key: 'qty', label: 'Quantidade', suffix: 'un' }, { key: 'dias', label: 'Cobertura', suffix: 'dias' }],
  supermarket: [{ key: 'label-field', label: 'Rótulo', type: 'text' }, { key: 'qty', label: 'Quantidade', suffix: 'un' }],
  fifo:        [{ key: 'label-field', label: 'Rótulo', type: 'text' }, { key: 'qty', label: 'Quantidade', suffix: 'un' }],
  planning:    [{ key: 'label-field', label: 'Título', type: 'text' }, { key: 'demanda', label: 'Demanda', suffix: 'un/mês' }, { key: 'takt', label: 'Takt time', suffix: 's' }],
  kaizen:      [{ key: 'label-field', label: 'Texto', type: 'text' }],
  timeline:    [{ key: 'label-field', label: 'Descrição', type: 'text' }, { key: 'leadtime', label: 'Lead time', suffix: 'dias' }, { key: 'tprocess', label: 'Tempo processo', suffix: 'min' }],
};

function ElementPopover({ el, onUpdate, onDelete, onClose }: {
  el: CanvasElement;
  onUpdate: (patch: Partial<CanvasElement>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const popRef = useRef<HTMLDivElement>(null);
  const fields = FIELD_DEFS[el.kind] ?? [{ key: 'label-field', label: 'Rótulo', type: 'text' }];

  useEffect(() => {
    const pop = popRef.current;
    if (!pop) return;
    const popW = 300;
    const popH = pop.offsetHeight || 300;
    const left = Math.max(12, Math.min(window.innerWidth / 2 - popW / 2, window.innerWidth - popW - 12));
    const top = Math.max(12, (window.innerHeight - popH) / 2);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => document.addEventListener('mousedown', h), 0);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  return createPortal(
    <div className="process-popover" ref={popRef} style={{ width: 300, position: 'fixed', zIndex: 9999 }}>
      <div className="popover-header">
        <strong>Editar elemento</strong>
        <button className="popover-close" onClick={onClose}><X size={15} /></button>
      </div>
      <div style={{ padding: '4px 0 8px' }}>
        {fields.map((f) => (
          <div key={f.key} className="popover-field" style={{ marginTop: 8 }}>
            <label>{f.label}</label>
            {f.type === 'text' ? (
              <input
                value={el.label}
                onChange={(e) => onUpdate({ label: e.target.value })}
              />
            ) : (
              <div className="popover-input-wrap">
                <input
                  type="number" min={0}
                  value={el.data[f.key] ?? 0}
                  onChange={(e) => onUpdate({ data: { ...el.data, [f.key]: Number(e.target.value) } })}
                />
                {f.suffix && <span>{f.suffix}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="popover-footer">
        <button className="popover-delete" onClick={onDelete}><Trash2 size={13} />Excluir elemento</button>
      </div>
    </div>,
    document.body
  );
}

// ─── Popover de edição de seta ────────────────────────────────────────────────

function ArrowPopover({ arrow, onUpdate, onDelete, onClose }: {
  arrow: CanvasArrow;
  onUpdate: (patch: Partial<CanvasArrow>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pop = popRef.current;
    if (!pop) return;
    pop.style.left = `${Math.max(12, window.innerWidth / 2 - 140)}px`;
    pop.style.top = `${Math.max(12, window.innerHeight / 2 - 80)}px`;
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => document.addEventListener('mousedown', h), 0);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const kinds: { value: CanvasArrow['kind']; label: string }[] = [
    { value: 'arrow-push', label: 'Fluxo empurrado' },
    { value: 'arrow-pull', label: 'Fluxo puxado' },
    { value: 'arrow-info-manual', label: 'Info manual' },
    { value: 'arrow-info-electronic', label: 'Info eletrônica' },
  ];

  return createPortal(
    <div className="process-popover" ref={popRef} style={{ width: 280, position: 'fixed', zIndex: 9999 }}>
      <div className="popover-header">
        <strong>Editar seta</strong>
        <button className="popover-close" onClick={onClose}><X size={15} /></button>
      </div>
      <div style={{ padding: '4px 0 8px' }}>
        <div className="popover-field" style={{ marginTop: 8 }}>
          <label>Tipo</label>
          <select value={arrow.kind} onChange={(e) => onUpdate({ kind: e.target.value as CanvasArrow['kind'] })}
            style={{ width: '100%', height: 34, padding: '0 10px', background: '#f5f5f7', border: '1px solid transparent', borderRadius: 8, font: 'inherit', fontSize: 12, outline: 'none' }}>
            {kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>
        <div className="popover-field" style={{ marginTop: 8 }}>
          <label>Rótulo (opcional)</label>
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

// ─── Biblioteca lateral ───────────────────────────────────────────────────────

const GROUP_LABELS = { material: 'Material', informacao: 'Informação', fluxo: 'Setas', anotacao: 'Anotação' } as const;
const ARROW_KINDS: ElementKind[] = ['arrow-push', 'arrow-pull', 'arrow-info-manual', 'arrow-info-electronic'];

function LibraryPanel({ onDragStart }: {
  onDragStart: (item: LibraryItem, e: React.DragEvent) => void;
}) {
  const groups = ['material', 'informacao', 'fluxo', 'anotacao'] as const;

  return (
    <div className="library-panel">
      <div className="library-title">Elementos MFV</div>
      {groups.map((g) => {
        const items = LIBRARY.filter((i) => i.group === g);
        return (
          <div key={g} className="library-group">
            <div className="library-group-label">{GROUP_LABELS[g]}</div>
            <div className="library-items">
              {items.map((item) => (
                <div
                  key={item.kind}
                  className="library-item"
                  draggable
                  onDragStart={(e) => onDragStart(item, e)}
                  title={item.label}
                >
                  <LibraryThumb kind={item.kind} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LibraryThumb({ kind }: { kind: ElementKind }) {
  const size = 44;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {kind === 'process' && (
        <g transform="scale(0.28) translate(2,2)">
          <rect width={150} height={100} fill="white" stroke="#7a8494" strokeWidth={1.5} />
          <rect width={150} height={32} fill="#bfefc0" />
          <text x={75} y={20} textAnchor="middle" fontSize={14} fontWeight="700" fontFamily="Arial" fill="#1a2a1a">Processo</text>
        </g>
      )}
      {(kind === 'supplier' || kind === 'customer') && (
        <g transform="scale(0.35) translate(2,2)">
          <rect width={120} height={80} fill={kind === 'customer' ? '#b8ccf5' : '#a8bcf0'} stroke="#6a80cc" strokeWidth={1.5} />
          <rect x={8} y={10} width={22} height={18} fill="none" stroke="#1a2560" strokeWidth={1} />
          <polygon points="8,10 19,4 30,10" fill="#1a2560" />
          <text x={60} y={52} textAnchor="middle" fontSize={14} fontWeight="700" fontFamily="Arial" fill="#122060">{kind === 'customer' ? 'Cliente' : 'Fornec.'}</text>
        </g>
      )}
      {kind === 'truck' && (
        <g transform="scale(0.46) translate(2,6)">
          <rect x={2} y={5} width={44} height={22} rx={1} fill="#8a9099" stroke="#6a6e78" strokeWidth={1} />
          <rect x={46} y={8} width={24} height={18} rx={2} fill="#5d6470" stroke="#6a6e78" strokeWidth={1} />
          <circle cx={14} cy={30} r={5} fill="#2c2f35" /><circle cx={60} cy={30} r={5} fill="#2c2f35" />
        </g>
      )}
      {kind === 'inventory' && (
        <polygon points="22,4 42,38 2,38" fill="#f0ce40" stroke="#b89020" strokeWidth={1.5} />
      )}
      {kind === 'supermarket' && (
        <g transform="translate(2,3)">
          <rect x={1} y={1} width={40} height={34} fill="none" stroke="#2c5fa8" strokeWidth={1.5} />
          <line x1={1} y1={12} x2={41} y2={12} stroke="#2c5fa8" strokeWidth={1} />
          <line x1={1} y1={23} x2={41} y2={23} stroke="#2c5fa8" strokeWidth={1} />
          {[4,14,24].map((x)=>[2,13,24].map((y)=><rect key={`${x}-${y}`} x={x} y={y} width={6} height={7} fill="#a8c4f0" stroke="#2c5fa8" strokeWidth={0.5} rx={0.5}/>))}
        </g>
      )}
      {kind === 'fifo' && (
        <g transform="translate(2,14)">
          <rect x={1} y={0} width={40} height={16} fill="none" stroke="#555" strokeWidth={1.5} />
          <text x={20} y={11} textAnchor="middle" fontSize={8} fontWeight="700" fontFamily="Arial" fill="#333">FIFO</text>
          <polygon points="34,0 42,8 34,16" fill="#555" />
        </g>
      )}
      {kind === 'planning' && (
        <g transform="scale(0.27) translate(2,2)">
          <rect width={160} height={110} fill="white" stroke="#8a93a8" strokeWidth={1.5} />
          <rect width={160} height={28} fill="#a8bcf0" />
          <text x={80} y={18} textAnchor="middle" fontSize={13} fontWeight="700" fontFamily="Arial" fill="#122060">Controle</text>
        </g>
      )}
      {kind === 'kaizen' && (() => {
        const pts = Array.from({length:16},(_,i)=>{const a=(i/16)*Math.PI*2;const r=i%2===0?20:13;return `${22+r*Math.cos(a)},${22+r*Math.sin(a)}`;}).join(' ');
        return <polygon points={pts} fill="#ffe04b" stroke="#b8930f" strokeWidth={1} />;
      })()}
      {kind === 'timeline' && (
        <g transform="translate(2,14)">
          <rect x={0} y={0} width={40} height={16} fill="#f8f9fc" stroke="#9aa0ae" strokeWidth={1} strokeDasharray="3 2" />
          <text x={20} y={11} textAnchor="middle" fontSize={7} fontFamily="Arial" fill="#363b43">Timeline</text>
        </g>
      )}
      {kind === 'arrow-push' && (
        <polygon points="2,18 30,18 30,12 42,22 30,32 30,26 2,26" fill="#3d4451" />
      )}
      {kind === 'arrow-pull' && (
        <g>
          <path d="M4,22 Q4,8 22,8 Q40,8 40,22 Q40,36 22,36 Q12,36 8,30" fill="none" stroke="#0071e3" strokeWidth={2} />
          <polygon points="4,16 4,28 -1,22" fill="#0071e3" />
          <circle cx={8} cy={30} r={3} fill="#0071e3" />
        </g>
      )}
      {kind === 'arrow-info-manual' && (
        <g>
          <path d="M4,36 Q22,4 40,16" fill="none" stroke="#333" strokeWidth={2} />
          <polygon points="34,12 42,18 34,22" fill="#333" />
        </g>
      )}
      {kind === 'arrow-info-electronic' && (
        <g>
          <path d="M4,36 Q22,4 40,16" fill="none" stroke="#0071e3" strokeWidth={2} strokeDasharray="4 3" />
          <polygon points="19,10 16,19 20,19 17,28 25,17 21,17" fill="#0071e3" />
          <polygon points="34,12 42,18 34,22" fill="#0071e3" />
        </g>
      )}
    </svg>
  );
}

// ─── Canvas ───────────────────────────────────────────────────────────────────

function renderElement(el: CanvasElement, selected: boolean, onEdit: () => void) {
  const props = { el, selected, onEdit };
  switch (el.kind) {
    case 'process':     return <ProcessSymbol {...props} />;
    case 'supplier':
    case 'customer':    return <PartySymbol {...props} />;
    case 'truck':       return <TruckSymbol {...props} />;
    case 'inventory':   return <InventorySymbol {...props} />;
    case 'supermarket': return <SupermarketSymbol {...props} />;
    case 'fifo':        return <FifoSymbol {...props} />;
    case 'planning':    return <PlanningSymbol {...props} />;
    case 'kaizen':      return <KaizenSymbol {...props} />;
    case 'timeline':    return <TimelineSymbol {...props} />;
    default:            return null;
  }
}

// ─── App ──────────────────────────────────────────────────────────────────────

type Dragging =
  | { type: 'element'; id: string; startX: number; startY: number; origX: number; origY: number }
  | { type: 'arrow-point'; id: string; point: 'start' | 'end' }
  | { type: 'new-arrow'; kind: CanvasArrow['kind']; x1: number; y1: number; x2: number; y2: number }
  | { type: 'pan'; startX: number; startY: number; origX: number; origY: number };

type ActiveKind = 'current' | 'future';

export default function App() {
  const [activeKind, setActiveKind] = useState<ActiveKind>('current');
  const [canvases, setCanvases] = useState<Record<ActiveKind, CanvasState>>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) return JSON.parse(s);
    } catch { /* ignore */ }
    return { current: { elements: [], arrows: [] }, future: { elements: [], arrows: [] } };
  });

  const canvas = canvases[activeKind];
  const setCanvas = useCallback((next: CanvasState | ((prev: CanvasState) => CanvasState)) => {
    setCanvases((prev) => {
      const updated = typeof next === 'function' ? next(prev[activeKind]) : next;
      const result = { ...prev, [activeKind]: updated };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
      return result;
    });
  }, [activeKind]);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 60, y: 60 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingEl, setEditingEl] = useState<CanvasElement | null>(null);
  const [editingArrow, setEditingArrow] = useState<CanvasArrow | null>(null);
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [saved, setSaved] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // auto-save
  useEffect(() => {
    setSaved(false);
    const t = setTimeout(() => setSaved(true), 600);
    return () => clearTimeout(t);
  }, [canvases]);

  // client coords → canvas coords
  const toCanvas = useCallback((cx: number, cy: number) => ({
    x: (cx - pan.x) / zoom,
    y: (cy - pan.y) / zoom,
  }), [pan, zoom]);

  const svgPoint = useCallback((e: React.MouseEvent | MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return toCanvas(e.clientX - rect.left, e.clientY - rect.top);
  }, [toCanvas]);

  // ── drag from library ──
  const onLibraryDragStart = (item: LibraryItem, e: React.DragEvent) => {
    e.dataTransfer.setData('mfv/kind', item.kind);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const onCanvasDrop = (e: React.DragEvent<SVGSVGElement>) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData('mfv/kind') as ElementKind;
    if (!kind) return;
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const { x, y } = toCanvas(e.clientX - rect.left, e.clientY - rect.top);
    const lib = LIBRARY.find((l) => l.kind === kind)!;

    if (ARROW_KINDS.includes(kind)) {
      // setas: começa a desenhar
      const arrowKind = kind as CanvasArrow['kind'];
      const newArrow: CanvasArrow = { id: makeId(), kind: arrowKind, x1: x, y1: y, x2: x + 120, y2: y };
      setCanvas((prev) => ({ ...prev, arrows: [...prev.arrows, newArrow] }));
      setSelectedId(newArrow.id);
    } else {
      const newEl: CanvasElement = {
        id: makeId(), kind, x: x - lib.w / 2, y: y - lib.h / 2,
        label: lib.defaultLabel, data: { ...lib.defaultData },
      };
      setCanvas((prev) => ({ ...prev, elements: [...prev.elements, newEl] }));
      setSelectedId(newEl.id);
    }
  };

  // ── mouse down no SVG ──
  const onSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const target = e.target as SVGElement;
    // click em fundo = pan
    if (target === svgRef.current || target.classList.contains('canvas-bg')) {
      setSelectedId(null);
      setDragging({ type: 'pan', startX: e.clientX, startY: e.clientY, origX: pan.x, origY: pan.y });
      e.preventDefault();
    }
  };

  const onElementMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedId(id);
    const el = canvas.elements.find((el) => el.id === id)!;
    setDragging({ type: 'element', id, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y });
  };

  const onArrowHandleMouseDown = (e: React.MouseEvent, id: string, point: 'start' | 'end') => {
    e.stopPropagation();
    setDragging({ type: 'arrow-point', id, point });
  };

  // ── mouse move ──
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      if (dragging.type === 'pan') {
        setPan({ x: dragging.origX + e.clientX - dragging.startX, y: dragging.origY + e.clientY - dragging.startY });
      } else if (dragging.type === 'element') {
        const dx = (e.clientX - dragging.startX) / zoom;
        const dy = (e.clientY - dragging.startY) / zoom;
        setCanvas((prev) => ({
          ...prev,
          elements: prev.elements.map((el) =>
            el.id === dragging.id ? { ...el, x: dragging.origX + dx, y: dragging.origY + dy } : el
          ),
        }));
      } else if (dragging.type === 'arrow-point') {
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const { x, y } = toCanvas(e.clientX - rect.left, e.clientY - rect.top);
        setCanvas((prev) => ({
          ...prev,
          arrows: prev.arrows.map((a) => {
            if (a.id !== dragging.id) return a;
            return dragging.point === 'start' ? { ...a, x1: x, y1: y } : { ...a, x2: x, y2: y };
          }),
        }));
      }
    };
    const onUp = () => setDragging(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging, zoom, toCanvas, setCanvas]);

  // ── zoom com scroll ──
  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.91;
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setZoom((z) => {
      const nz = Math.min(3, Math.max(0.2, z * factor));
      setPan((p) => ({ x: mx - (mx - p.x) * (nz / z), y: my - (my - p.y) * (nz / z) }));
      return nz;
    });
  };

  // ── delete com tecla ──
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!selectedId) return;
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
      setCanvas((prev) => ({
        elements: prev.elements.filter((el) => el.id !== selectedId),
        arrows: prev.arrows.filter((a) => a.id !== selectedId),
      }));
      setSelectedId(null);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selectedId, setCanvas]);

  const updateElement = (id: string, patch: Partial<CanvasElement>) => {
    setCanvas((prev) => ({ ...prev, elements: prev.elements.map((el) => el.id === id ? { ...el, ...patch } : el) }));
    if (editingEl?.id === id) setEditingEl((prev) => prev ? { ...prev, ...patch } : prev);
  };

  const deleteElement = (id: string) => {
    setCanvas((prev) => ({ elements: prev.elements.filter((el) => el.id !== id), arrows: prev.arrows.filter((a) => a.id !== id) }));
    setEditingEl(null); setSelectedId(null);
  };

  const updateArrow = (id: string, patch: Partial<CanvasArrow>) => {
    setCanvas((prev) => ({ ...prev, arrows: prev.arrows.map((a) => a.id === id ? { ...a, ...patch } : a) }));
    if (editingArrow?.id === id) setEditingArrow((prev) => prev ? { ...prev, ...patch } : prev);
  };

  const deleteArrow = (id: string) => {
    setCanvas((prev) => ({ ...prev, arrows: prev.arrows.filter((a) => a.id !== id) }));
    setEditingArrow(null); setSelectedId(null);
  };

  const resetCanvas = () => {
    if (window.confirm('Limpar todo o canvas do cenário atual?')) {
      setCanvas({ elements: [], arrows: [] });
      setSelectedId(null);
    }
  };

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* ── Sidebar ── */}
      <aside className="app-sidebar no-print">
        <div className="sidebar-brand">
          <div className="app-symbol"><Route size={20} /></div>
          <div className="sidebar-brand-text"><strong>MFV</strong><span>Simulador</span></div>
          <button className="collapse-button" onClick={() => setSidebarCollapsed((v) => !v)}>
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <div className="sidebar-section-label"><span>Cenário</span></div>
        <nav className="sidebar-nav">
          <button className={activeKind === 'current' ? 'active current' : ''} onClick={() => setActiveKind('current')} title="Estado atual">
            <Map size={18} /><span>Estado atual</span>
          </button>
          <button className={activeKind === 'future' ? 'active future' : ''} onClick={() => setActiveKind('future')} title="Estado futuro">
            <GitCompareArrows size={18} /><span>Estado futuro</span>
          </button>
        </nav>

        {!sidebarCollapsed && (
          <LibraryPanel onDragStart={onLibraryDragStart} />
        )}

        <div className="sidebar-bottom">
          <div className="save-state"><Save size={14} /><span>{saved ? 'Salvo' : 'Salvando…'}</span></div>
          <button onClick={() => setExportOpen(true)} title="Exportar"><Download size={17} /><span>Exportar</span></button>
          <button onClick={resetCanvas} title="Limpar canvas"><RotateCcw size={17} /><span>Limpar</span></button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="app-main no-print" style={{ display: 'flex', flexDirection: 'column' }}>
        {/* header */}
        <header className="app-header">
          <div>
            <ScenarioPill kind={activeKind} />
            <h1>{activeKind === 'current' ? 'Estado atual' : 'Estado futuro'}</h1>
            <p>Arraste elementos da biblioteca para o canvas · clique para selecionar · lápis para editar</p>
          </div>
          <div className="header-actions">
            {/* Zoom */}
            <div className="zoom-controls">
              <button onClick={() => setZoom((z) => Math.max(0.2, z * 0.85))} title="Reduzir"><ZoomOut size={15} /></button>
              <span>{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(3, z * 1.15))} title="Ampliar"><ZoomIn size={15} /></button>
              <button onClick={() => { setZoom(1); setPan({ x: 60, y: 60 }); }} title="Resetar zoom"><Minus size={13} /></button>
            </div>
            <button className="primary-button" onClick={() => setExportOpen(true)}>
              <Download size={17} />Exportar
            </button>
          </div>
        </header>

        {/* hint quando vazio */}
        {canvas.elements.length === 0 && canvas.arrows.length === 0 && (
          <div className="canvas-empty-hint">
            <BookOpen size={32} />
            <strong>Canvas em branco</strong>
            <p>Arraste elementos da biblioteca à esquerda para começar o mapeamento.</p>
          </div>
        )}

        {/* Canvas SVG */}
        <svg
          ref={svgRef}
          className="mfv-canvas"
          style={{ flex: 1, cursor: dragging?.type === 'pan' ? 'grabbing' : 'default' }}
          onMouseDown={onSvgMouseDown}
          onWheel={onWheel}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onCanvasDrop}
        >
          {/* grade de fundo */}
          <defs>
            <pattern id="grid" width={20 * zoom} height={20 * zoom} patternUnits="userSpaceOnUse"
              x={pan.x % (20 * zoom)} y={pan.y % (20 * zoom)}>
              <circle cx={1} cy={1} r={0.8} fill="#d5d5db" />
            </pattern>
          </defs>
          <rect className="canvas-bg" width="100%" height="100%" fill="url(#grid)" />

          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {/* setas */}
            {canvas.arrows.map((arrow) => (
              <ArrowShape
                key={arrow.id}
                arrow={arrow}
                selected={selectedId === arrow.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(arrow.id);
                  // duplo clique = editar
                  if (e.detail === 2) setEditingArrow(arrow);
                }}
              />
            ))}
            {/* handles de setas selecionadas */}
            {canvas.arrows.filter((a) => a.id === selectedId).map((arrow) => (
              <g key={`handles-${arrow.id}`}>
                <circle cx={arrow.x1} cy={arrow.y1} r={7} fill="white" stroke="#0071e3" strokeWidth={1.5}
                  style={{ cursor: 'move' }}
                  onMouseDown={(e) => { e.stopPropagation(); onArrowHandleMouseDown(e, arrow.id, 'start'); }} />
                <circle cx={arrow.x2} cy={arrow.y2} r={7} fill="white" stroke="#0071e3" strokeWidth={1.5}
                  style={{ cursor: 'move' }}
                  onMouseDown={(e) => { e.stopPropagation(); onArrowHandleMouseDown(e, arrow.id, 'end'); }} />
              </g>
            ))}

            {/* elementos */}
            {canvas.elements.map((el) => (
              <g
                key={el.id}
                transform={`translate(${el.x},${el.y})`}
                style={{ cursor: 'move', userSelect: 'none' }}
                onMouseDown={(e) => onElementMouseDown(e, el.id)}
                onDoubleClick={(e) => { e.stopPropagation(); setEditingEl(el); }}
              >
                {renderElement(
                  el,
                  selectedId === el.id,
                  () => setEditingEl(el)
                )}
              </g>
            ))}
          </g>
        </svg>

        {/* instrução de tecla */}
        {selectedId && (
          <div className="canvas-delete-hint">
            Pressione <kbd>Delete</kbd> para remover · duplo clique para editar
          </div>
        )}
      </main>

      {/* ── Popovers de edição ── */}
      {editingEl && (
        <ElementPopover
          el={editingEl}
          onUpdate={(patch) => updateElement(editingEl.id, patch)}
          onDelete={() => deleteElement(editingEl.id)}
          onClose={() => setEditingEl(null)}
        />
      )}
      {editingArrow && (
        <ArrowPopover
          arrow={editingArrow}
          onUpdate={(patch) => updateArrow(editingArrow.id, patch)}
          onDelete={() => deleteArrow(editingArrow.id)}
          onClose={() => setEditingArrow(null)}
        />
      )}

      {/* ── Modal exportação ── */}
      {exportOpen && (
        <ExportModal printRef={printRef} scenarioName={activeKind === 'current' ? 'Estado_Atual' : 'Estado_Futuro'} onClose={() => setExportOpen(false)} svgRef={svgRef} />
      )}

      {/* elemento oculto para exportação */}
      <div className="export-source" ref={printRef} aria-hidden />
    </div>
  );
}

// ─── Modal exportação ─────────────────────────────────────────────────────────

type ExportFormat = 'pdf' | 'jpeg' | 'svg';
import { FileImage, FileText, ImageDown, Loader2 } from 'lucide-react';

function ExportModal({ printRef, scenarioName, onClose, svgRef }: {
  printRef: React.RefObject<HTMLDivElement>;
  scenarioName: string;
  onClose: () => void;
  svgRef: React.RefObject<SVGSVGElement>;
}) {
  const [loading, setLoading] = useState<ExportFormat | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const run = async (format: ExportFormat) => {
    setLoading(format);
    try {
      const svg = svgRef.current;
      if (!svg) return;
      const name = `MFV_${scenarioName}`;
      // Para SVG e imagem, usamos o SVG do canvas diretamente
      if (format === 'svg') {
        const serializer = new XMLSerializer();
        const svgStr = serializer.serializeToString(svg);
        const blob = new Blob([svgStr], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.download = `${name}.svg`; a.href = url; a.click();
        URL.revokeObjectURL(url);
      } else {
        // rasteriza o SVG
        const bbox = svg.getBoundingClientRect();
        const canvas2d = document.createElement('canvas');
        canvas2d.width = bbox.width * 2; canvas2d.height = bbox.height * 2;
        const ctx = canvas2d.getContext('2d')!;
        ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas2d.width, canvas2d.height);
        const serializer = new XMLSerializer();
        const svgStr = serializer.serializeToString(svg);
        const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = async () => {
          ctx.drawImage(img, 0, 0, canvas2d.width, canvas2d.height);
          URL.revokeObjectURL(url);
          if (format === 'jpeg') {
            const a = document.createElement('a'); a.download = `${name}.jpg`;
            a.href = canvas2d.toDataURL('image/jpeg', 0.95); a.click();
          } else {
            const { default: jsPDF } = await import('jspdf');
            const pdf = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a3' });
            const pw = pdf.internal.pageSize.getWidth() - 16;
            const ph = (canvas2d.height / canvas2d.width) * pw;
            pdf.addImage(canvas2d.toDataURL('image/png'), 'PNG', 8, 8, pw, ph);
            pdf.save(`${name}.pdf`);
          }
          setLoading(null);
        };
        img.src = url;
        return;
      }
    } finally {
      if (format === 'svg') setLoading(null);
    }
  };

  const formats = [
    { fmt: 'pdf' as ExportFormat, icon: <FileText size={22} />, label: 'PDF', desc: 'A3 landscape · ideal para impressão' },
    { fmt: 'jpeg' as ExportFormat, icon: <FileImage size={22} />, label: 'JPEG', desc: 'Imagem · compatível com qualquer app' },
    { fmt: 'svg' as ExportFormat, icon: <ImageDown size={22} />, label: 'SVG', desc: 'Vetorial · editável no Illustrator / Figma' },
  ];

  return (
    <div className="editor-overlay" role="dialog" aria-modal="true">
      <button className="editor-backdrop" onClick={onClose} />
      <section className="editor-window export-modal">
        <header>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Download size={20} /><div><h2 style={{ margin: '0 0 2px' }}>Exportar MFV</h2><p style={{ margin: 0, color: '#8e8e93', fontSize: 11 }}>Escolha o formato.</p></div>
          </div>
          <button className="icon-button" onClick={onClose}><X size={20} /></button>
        </header>
        <div className="export-options">
          {formats.map(({ fmt, icon, label, desc }) => (
            <button key={fmt} className={`export-option ${loading === fmt ? 'loading' : ''}`} onClick={() => run(fmt)} disabled={!!loading}>
              <div className="export-icon">{loading === fmt ? <Loader2 size={22} className="spin" /> : icon}</div>
              <div><strong>{label}</strong><span>{desc}</span></div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
