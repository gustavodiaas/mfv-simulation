import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Copy,
  Download,
  Factory,
  FileImage,
  FilePenLine,
  FileText,
  Gauge,
  GitCompareArrows,
  ImageDown,
  Loader2,
  Map,
  PackageOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Route,
  Save,
  Settings2,
  Trash2,
  UserRound,
  X,
  Zap,
} from 'lucide-react';
import {
  cloneAsFuture,
  createDefaultScenario,
  DEFAULT_PROJECT,
  newStep,
  simulate,
} from './simulation';
import { exportJPEG, exportPDF, exportSVG } from './export';
import type {
  FlowType,
  InfoFlowType,
  ProcessStep,
  ProjectInfo,
  Scenario,
  ScenarioKind,
  SimulationResults,
} from './types';

type AppData = { project: ProjectInfo; current: Scenario; future: Scenario };
type View = ScenarioKind | 'comparison';
type EditorTab = 'project' | 'scenario';
type ExportFormat = 'pdf' | 'jpeg' | 'svg';

const STORAGE_KEY = 'mfv-simulation:v4';

function initialData(): AppData {
  const current = createDefaultScenario('current');
  return { project: DEFAULT_PROJECT, current, future: cloneAsFuture(current) };
}

function loadData(): AppData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as AppData;
      const migrate = (s: Scenario): Scenario => ({
        ...s,
        infoSupplierFlow: s.infoSupplierFlow ?? 'manual',
        infoShopFloorFlow: s.infoShopFloorFlow ?? 'manual',
        infoCustomerFlow: s.infoCustomerFlow ?? 'electronic',
        steps: s.steps.map((st) => ({ ...st, flowAfter: st.flowAfter ?? 'push' })),
      });
      return { ...parsed, current: migrate(parsed.current), future: migrate(parsed.future) };
    }
    return initialData();
  } catch {
    return initialData();
  }
}

function formatNumber(value: number, maximumFractionDigits = 1): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits }).format(value);
}
function formatSeconds(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return value < 60 ? `${formatNumber(value, 1)} s` : `${formatNumber(value / 60, 1)} min`;
}
function formatDate(value: string): string {
  if (!value) return '—';
  const [y, m, d] = value.split('-');
  return y && m && d ? `${d}/${m}/${y}` : value;
}
function clampNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}
function deltaPercent(current: number, future: number, inverse = false): number | null {
  if (!Number.isFinite(current) || current === 0 || !Number.isFinite(future)) return null;
  const delta = ((future - current) / current) * 100;
  const adjusted = inverse ? -delta : delta;
  return Math.abs(adjusted) < 0.0001 ? 0 : adjusted;
}

// ─── SVG Symbols ─────────────────────────────────────────────────────────────

function PushArrow({ label }: { label?: string }) {
  return (
    <div className="mfv-flow-connector push">
      {label && <span className="flow-label">{label}</span>}
      <svg viewBox="0 0 52 24" width="52" height="24">
        <polygon points="0,6 36,6 36,0 52,12 36,24 36,18 0,18" fill="#3d4451" />
      </svg>
    </div>
  );
}

function PullArrow({ label }: { label?: string }) {
  return (
    <div className="mfv-flow-connector pull">
      {label && <span className="flow-label">{label}</span>}
      <svg viewBox="0 0 52 28" width="52" height="28">
        <path d="M4,14 Q4,4 26,4 Q48,4 48,14 Q48,24 26,24 Q12,24 8,18" fill="none" stroke="#0071e3" strokeWidth="2" />
        <polygon points="4,8 4,20 -1,14" fill="#0071e3" />
        <circle cx="8" cy="18" r="2.5" fill="#0071e3" />
      </svg>
    </div>
  );
}

function FifoArrow() {
  return (
    <div className="mfv-flow-connector fifo">
      <svg viewBox="0 0 60 28" width="60" height="28">
        <rect x="1" y="6" width="58" height="16" fill="none" stroke="#555" strokeWidth="1.5" />
        <text x="30" y="17" textAnchor="middle" fontSize="7" fontWeight="700" fill="#333" fontFamily="Arial">FIFO</text>
        <polygon points="48,6 58,14 48,22" fill="#555" />
      </svg>
      <span className="flow-label">FIFO</span>
    </div>
  );
}

function SupermarketSymbol({ units }: { units?: number }) {
  return (
    <div className="mfv-supermarket">
      <svg viewBox="0 0 44 36" width="44" height="36">
        <rect x="2" y="2" width="40" height="32" fill="none" stroke="#2c5fa8" strokeWidth="1.5" />
        <line x1="2" y1="13" x2="42" y2="13" stroke="#2c5fa8" strokeWidth="1" />
        <line x1="2" y1="24" x2="42" y2="24" stroke="#2c5fa8" strokeWidth="1" />
        {[5, 15, 25].map((x) => (
          <g key={x}>
            <rect x={x} y="4" width="6" height="7" fill="#a8c4f0" stroke="#2c5fa8" strokeWidth="0.5" rx="0.5" />
            <rect x={x} y="15" width="6" height="7" fill="#a8c4f0" stroke="#2c5fa8" strokeWidth="0.5" rx="0.5" />
            <rect x={x} y="26" width="6" height="7" fill="#a8c4f0" stroke="#2c5fa8" strokeWidth="0.5" rx="0.5" />
          </g>
        ))}
      </svg>
      {units !== undefined && <strong className="supermarket-qty">{formatNumber(units, 0)} un</strong>}
    </div>
  );
}

function KaizenBurst({ label }: { label?: string }) {
  const pts = Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * Math.PI * 2;
    const r = i % 2 === 0 ? 17 : 11;
    return `${18 + r * Math.cos(angle)},${18 + r * Math.sin(angle)}`;
  }).join(' ');
  return (
    <div className="kaizen-burst">
      <svg viewBox="0 0 36 36" width="36" height="36">
        <polygon points={pts} fill="#ffe04b" stroke="#b8930f" strokeWidth="1" />
        {label && <text x="18" y="21" textAnchor="middle" fontSize="6" fontWeight="800" fill="#6b4c00" fontFamily="Arial">{label}</text>}
      </svg>
    </div>
  );
}

function InfoArrowManual({ label }: { label?: string }) {
  return (
    <div className="info-arrow manual">
      <svg viewBox="0 0 80 32" width="80" height="32">
        <path d="M4,26 Q40,2 76,14" fill="none" stroke="#333" strokeWidth="1.5" />
        <polygon points="70,10 80,16 70,20" fill="#333" />
      </svg>
      {label && <span className="info-label">{label}</span>}
    </div>
  );
}

function InfoArrowElectronic({ label }: { label?: string }) {
  return (
    <div className="info-arrow electronic">
      <svg viewBox="0 0 80 32" width="80" height="32">
        <path d="M4,26 Q40,2 76,14" fill="none" stroke="#0071e3" strokeWidth="1.5" strokeDasharray="4 3" />
        <polygon points="38,8 34,18 39,18 35,26 44,14 39,14" fill="#0071e3" opacity="0.85" />
        <polygon points="70,10 80,16 70,20" fill="#0071e3" />
      </svg>
      {label && <span className="info-label electronic">{label}</span>}
    </div>
  );
}

function TruckSymbol({ direction = 'right' }: { direction?: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 52 30" width="52" height="30" style={{ transform: direction === 'left' ? 'scaleX(-1)' : undefined }}>
      <rect x="28" y="6" width="22" height="18" rx="2" fill="#5d6470" />
      <rect x="32" y="9" width="8" height="7" rx="1" fill="#a8d4f5" />
      <rect x="2" y="4" width="30" height="20" rx="1" fill="#8a9099" />
      <circle cx="12" cy="26" r="4" fill="#2c2f35" />
      <circle cx="12" cy="26" r="2" fill="#555" />
      <circle cx="40" cy="26" r="4" fill="#2c2f35" />
      <circle cx="40" cy="26" r="2" fill="#555" />
    </svg>
  );
}

function FlowConnector({ type, units }: { type: FlowType; units: number }) {
  switch (type) {
    case 'pull': return <PullArrow label="Puxada" />;
    case 'fifo': return <FifoArrow />;
    case 'supermarket': return (
      <div className="mfv-flow-supermarket">
        <SupermarketSymbol units={units} />
        <PullArrow label="Retirada" />
      </div>
    );
    default: return <PushArrow label="Empurrado" />;
  }
}

function InfoFlowArrow({ type, label }: { type: InfoFlowType; label?: string }) {
  if (type === 'electronic') return <InfoArrowElectronic label={label} />;
  return <InfoArrowManual label={label} />;
}

// ─── Field components ────────────────────────────────────────────────────────

function Field({ label, value, onChange, type = 'text', suffix, min, max }: {
  label: string; value: string | number; onChange: (v: string) => void;
  type?: 'text' | 'number' | 'date'; suffix?: string; min?: number; max?: number;
}) {
  return (
    <label className="editor-field">
      <span>{label}</span>
      <div className="editor-input-wrap">
        <input type={type} value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} />
        {suffix && <small>{suffix}</small>}
      </div>
    </label>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="editor-field">
      <span>{label}</span>
      <div className="editor-input-wrap">
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    </label>
  );
}

function ScenarioPill({ kind }: { kind: ScenarioKind }) {
  return <span className={`scenario-pill ${kind}`}>{kind === 'current' ? 'Estado atual' : 'Estado futuro'}</span>;
}

// ─── Popover edição inline ───────────────────────────────────────────────────

const FLOW_OPTIONS = [
  { value: 'push', label: 'Empurrado' },
  { value: 'pull', label: 'Puxado' },
  { value: 'fifo', label: 'FIFO' },
  { value: 'supermarket', label: 'Supermercado' },
];

const INFO_FLOW_OPTIONS = [
  { value: 'manual', label: 'Manual (papel)' },
  { value: 'electronic', label: 'Eletrônico (EDI/ERP)' },
  { value: 'kanban-production', label: 'Kanban de produção' },
  { value: 'kanban-withdrawal', label: 'Kanban de retirada' },
];

function ProcessPopover({ step, isLast, onUpdate, onDelete, onClose, anchorRef }: {
  step: ProcessStep; isLast: boolean;
  onUpdate: (patch: Partial<ProcessStep>) => void;
  onDelete: () => void; onClose: () => void;
  anchorRef: React.RefObject<HTMLDivElement>;
}) {
  const popRef = useRef<HTMLDivElement>(null);

  const reposition = useCallback(() => {
    const pop = popRef.current;
    const anchor = anchorRef.current;
    if (!pop || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const popW = 320;
    const popH = pop.offsetHeight;
    const margin = 12;
    let left = rect.left + rect.width / 2 - popW / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - popW - margin));
    // abre abaixo se couber, senão abre acima
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const top = spaceBelow >= popH || spaceBelow > rect.top
      ? rect.bottom + 8
      : rect.top - popH - 8;
    pop.style.left = `${left}px`;
    pop.style.top = `${Math.max(margin, top)}px`;
  }, [anchorRef]);

  // posiciona na montagem e re-posiciona ao scroll/resize
  useEffect(() => {
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [reposition]);

  // fecha ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) onClose();
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, anchorRef]);

  // fecha com Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(
    <div className="process-popover" ref={popRef}>
      <div className="popover-header">
        <strong>Editar processo</strong>
        <button className="popover-close" onClick={onClose}><X size={15} /></button>
      </div>
      <div className="popover-field">
        <label>Nome</label>
        <input value={step.name} onChange={(e) => onUpdate({ name: e.target.value })} />
      </div>
      <div className="popover-grid">
        <div className="popover-field">
          <label>Tempo de ciclo</label>
          <div className="popover-input-wrap">
            <input type="number" min={0} value={step.cycleTimeSec} onChange={(e) => onUpdate({ cycleTimeSec: clampNumber(e.target.value) })} />
            <span>s</span>
          </div>
        </div>
        <div className="popover-field">
          <label>Setup</label>
          <div className="popover-input-wrap">
            <input type="number" min={0} value={step.setupTimeMin} onChange={(e) => onUpdate({ setupTimeMin: clampNumber(e.target.value) })} />
            <span>min</span>
          </div>
        </div>
        <div className="popover-field">
          <label>Operadores</label>
          <div className="popover-input-wrap">
            <input type="number" min={1} value={step.operators} onChange={(e) => onUpdate({ operators: clampNumber(e.target.value, 1) })} />
            <span>pess.</span>
          </div>
        </div>
        <div className="popover-field">
          <label>Lote / recurso</label>
          <div className="popover-input-wrap">
            <input type="number" min={1} value={step.batchSize} onChange={(e) => onUpdate({ batchSize: clampNumber(e.target.value, 1) })} />
            <span>un</span>
          </div>
        </div>
        <div className="popover-field">
          <label>Disponibilidade</label>
          <div className="popover-input-wrap">
            <input type="number" min={1} max={100} value={step.availabilityPercent} onChange={(e) => onUpdate({ availabilityPercent: Math.min(100, clampNumber(e.target.value, 100)) })} />
            <span>%</span>
          </div>
        </div>
        <div className="popover-field">
          <label>Estoque após</label>
          <div className="popover-input-wrap">
            <input type="number" min={0} value={step.wipUnits} onChange={(e) => onUpdate({ wipUnits: clampNumber(e.target.value) })} />
            <span>un</span>
          </div>
        </div>
      </div>
      {!isLast && (
        <div className="popover-field" style={{ marginTop: 8 }}>
          <label>Fluxo após este processo</label>
          <select value={step.flowAfter} onChange={(e) => onUpdate({ flowAfter: e.target.value as FlowType })}>
            {FLOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )}
      <div className="popover-footer">
        <button className="popover-delete" onClick={onDelete}><Trash2 size={13} />Excluir</button>
      </div>
    </div>,
    document.body
  );
}

// ─── Process box ─────────────────────────────────────────────────────────────

function ProcessBox({ step, metrics, index, isLast, onUpdate, onDelete }: {
  step: ProcessStep; metrics: SimulationResults['stepMetrics'][string];
  index: number; isLast: boolean;
  onUpdate: (patch: Partial<ProcessStep>) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  return (
    <div className={`map-process ${metrics.isBottleneck ? 'bottleneck' : ''} ${metrics.isOverTakt ? 'over-takt' : ''} ${open ? 'editing' : ''}`} ref={boxRef}>
      <button className="process-edit-btn" onClick={() => setOpen((v) => !v)} title="Editar processo"><Pencil size={11} /></button>
      <div className="process-title">
        <span>{String(index + 1).padStart(2, '0')}</span>
        <strong>{step.name}</strong>
      </div>
      <dl>
        <div><dt>Operadores</dt><dd>{formatNumber(step.operators, 0)}</dd></div>
        <div><dt>T/C</dt><dd className={metrics.isOverTakt ? 'over-takt-value' : ''}>{formatSeconds(step.cycleTimeSec)}</dd></div>
        <div><dt>Setup</dt><dd>{formatNumber(step.setupTimeMin, 1)} min</dd></div>
        <div><dt>Lote</dt><dd>{formatNumber(step.batchSize, 0)}</dd></div>
        <div><dt>Disponibilidade</dt><dd>{formatNumber(step.availabilityPercent, 0)}%</dd></div>
        <div className="takt-ratio-row">
          <dt>T/C vs Takt</dt>
          <dd>
            <div className="takt-bar-wrap">
              <div className={`takt-bar ${metrics.isOverTakt ? 'over' : 'ok'}`} style={{ width: `${Math.min(100, metrics.taktRatio * 100)}%` }} />
            </div>
            <span>{formatNumber(metrics.taktRatio * 100, 0)}%</span>
          </dd>
        </div>
      </dl>
      {metrics.isBottleneck && <span className="map-bottleneck">Gargalo</span>}
      {open && (
        <ProcessPopover
          step={step} isLast={isLast}
          onUpdate={onUpdate}
          onDelete={() => { onDelete(); setOpen(false); }}
          onClose={() => setOpen(false)}
          anchorRef={boxRef}
        />
      )}
    </div>
  );
}

function InventorySymbol({ units, days }: { units: number; days: number }) {
  return (
    <div className="map-inventory">
      <div className="inventory-triangle" />
      <strong>{formatNumber(units, 0)}</strong>
      <span>{formatNumber(days, 2)} dias</span>
    </div>
  );
}

// ─── Diagrama MFV ────────────────────────────────────────────────────────────

function MfvDiagram({ project, scenario, results, print = false, onScenarioChange }: {
  project: ProjectInfo; scenario: Scenario; results: SimulationResults;
  print?: boolean; onScenarioChange?: (s: Scenario) => void;
}) {
  const editable = !print && !!onScenarioChange;

  const updateStep = (id: string, patch: Partial<ProcessStep>) => {
    if (!onScenarioChange) return;
    onScenarioChange({ ...scenario, steps: scenario.steps.map((s) => s.id === id ? { ...s, ...patch } : s) });
  };
  const deleteStep = (id: string) => {
    if (!onScenarioChange || scenario.steps.length === 1) return;
    onScenarioChange({ ...scenario, steps: scenario.steps.filter((s) => s.id !== id) });
  };
  const addStep = () => {
    if (!onScenarioChange) return;
    onScenarioChange({ ...scenario, steps: [...scenario.steps, newStep(scenario.id, scenario.steps.length + 1)] });
  };

  const effPct = (results.processingTimeMin / (results.leadTimeDays * (scenario.availableMinutesPerDay || 558))) * 100;

  return (
    <div className="mfv-sheet">
      {/* Cabeçalho */}
      <div className="mfv-header-block">
        <div className="mfv-header-left">
          <div className="mfv-header-row"><span>Empresa / Área</span><strong>{project.area || '—'}</strong></div>
          <div className="mfv-header-row"><span>Família de produto</span><strong>{project.family || '—'}</strong></div>
          <div className="mfv-header-row"><span>Produto</span><strong>{project.product || '—'}</strong></div>
        </div>
        <div className="mfv-header-center">
          <div className="mfv-title-block">
            <strong>MAPEAMENTO DO FLUXO DE VALOR</strong>
            <span className={`scenario-badge ${scenario.id}`}>{scenario.name.toUpperCase()}</span>
          </div>
        </div>
        <div className="mfv-header-right">
          <div className="mfv-header-row"><span>Responsável</span><strong>{project.owner || '—'}</strong></div>
          <div className="mfv-header-row"><span>Data</span><strong>{formatDate(project.referenceDate)}</strong></div>
          <div className="mfv-header-row"><span>Demanda</span><strong>{formatNumber(scenario.monthlyDemand, 0)} un/mês</strong></div>
        </div>
      </div>

      {/* Linha de informação */}
      <div className="map-information-row">
        <div className="map-party supplier">
          <TruckSymbol direction="right" />
          <strong>{project.supplier || 'Fornecedor'}</strong>
          <span className="party-freq">Entrega a cada {project.deliveryFrequencyDays ?? 1} dia(s)</span>
        </div>
        <div className="info-flow-col">
          <InfoFlowArrow type={scenario.infoSupplierFlow} label="Pedido / Forecast" />
        </div>
        <div className="map-planning">
          <div className="planning-header"><Factory size={13} /><strong>Controle da produção</strong></div>
          <div className="planning-mode">{scenario.infoShopFloorFlow === 'electronic' ? 'Programação eletrônica' : 'Programação manual'}</div>
          <dl>
            <div><dt>Demanda mensal</dt><dd>{formatNumber(scenario.monthlyDemand, 0)} un</dd></div>
            <div><dt>Demanda diária</dt><dd>{formatNumber(results.dailyDemand, 2)} un</dd></div>
            <div className="takt-highlight"><dt>Takt time</dt><dd>{formatSeconds(results.taktTimeSec)}</dd></div>
            <div><dt>Tempo disponível</dt><dd>{formatNumber(scenario.availableMinutesPerDay, 0)} min/dia</dd></div>
          </dl>
        </div>
        <div className="info-flow-col">
          <InfoFlowArrow type={scenario.infoCustomerFlow} label="Previsão / Pedido" />
        </div>
        <div className="map-party customer">
          <UserRound size={18} />
          <strong>{project.customer || 'Cliente'}</strong>
          <span className="party-freq">Expedição a cada {project.shipmentFrequencyDays ?? 1} dia(s)</span>
        </div>
      </div>

      {/* Seta chão de fábrica */}
      <div className="map-shopfloor-info-row">
        <div className="shopfloor-info-arrow">
          <InfoFlowArrow type={scenario.infoShopFloorFlow}
            label={scenario.infoShopFloorFlow === 'electronic' ? 'Ordem eletrônica' : 'Ordem de produção'} />
        </div>
      </div>

      {/* Linha de material */}
      <div className="map-material-row">
        <div className="map-origin">
          <PackageOpen size={20} />
          <strong>Mat. Prima</strong>
        </div>
        <PushArrow />
        {scenario.steps.map((step, index) => {
          const isLast = index === scenario.steps.length - 1;
          return (
            <div className="map-process-group" key={step.id}>
              <ProcessBox
                step={step} metrics={results.stepMetrics[step.id]}
                index={index} isLast={isLast}
                onUpdate={(patch) => updateStep(step.id, patch)}
                onDelete={() => deleteStep(step.id)}
              />
              <div className="inventory-connector">
                <InventorySymbol units={step.wipUnits} days={results.stepMetrics[step.id].inventoryDays} />
                {!isLast && <FlowConnector type={step.flowAfter} units={step.wipUnits} />}
              </div>
            </div>
          );
        })}
        {editable && (
          <div className="add-step-wrapper">
            <button className="add-step-btn" onClick={addStep} title="Adicionar operação">
              <Plus size={16} /><span>Nova operação</span>
            </button>
          </div>
        )}
        <div className="map-shipping">
          <TruckSymbol direction="right" />
          <strong>Expedição</strong>
          <span>{project.product || 'Produto'}</span>
        </div>
      </div>

      {/* Linha do tempo */}
      <div className="map-time-ladder">
        <div className="ladder-labels">
          <span>Estoque</span>
          <span>T/C</span>
        </div>
        <div className="ladder-track">
          {scenario.steps.map((step) => (
            <div className="ladder-step" key={step.id}>
              <div className="ladder-top"><span>{formatNumber(results.stepMetrics[step.id].inventoryDays, 2)} d</span></div>
              <div className="ladder-bottom"><span>{formatSeconds(step.cycleTimeSec)}</span></div>
            </div>
          ))}
        </div>
        <div className="lead-summary">
          <div><span>Lead time total</span><strong>{formatNumber(results.leadTimeDays, 2)} dias</strong></div>
          <div><span>Tempo de processo</span><strong>{formatNumber(results.processingTimeMin, 1)} min</strong></div>
          <div className={effPct < 5 ? 'lead-alert' : ''}><span>Eficiência do fluxo</span><strong>{formatNumber(effPct, 1)}%</strong></div>
        </div>
      </div>
    </div>
  );
}

// ─── Metrics strip ────────────────────────────────────────────────────────────

function MetricsStrip({ results, scenario }: { results: SimulationResults; scenario: Scenario }) {
  const effPct = (results.processingTimeMin / (results.leadTimeDays * (scenario.availableMinutesPerDay || 558))) * 100;
  const metrics = [
    { icon: <Clock3 size={17} />, label: 'Takt time', value: formatSeconds(results.taktTimeSec) },
    { icon: <Gauge size={17} />, label: 'Capacidade', value: `${formatNumber(results.capacityPerDay, 1)} un/dia` },
    { icon: <Route size={17} />, label: 'Lead time', value: `${formatNumber(results.leadTimeDays, 2)} dias` },
    { icon: <Activity size={17} />, label: 'Eficiência fluxo', value: `${formatNumber(effPct, 1)}%`, alert: effPct < 10 },
  ];
  return (
    <div className="metrics-strip">
      {metrics.map((m) => (
        <div key={m.label} className={m.alert ? 'metric-alert' : ''}>
          {m.icon}<span>{m.label}</span><strong>{m.value}</strong>
        </div>
      ))}
    </div>
  );
}

// ─── Comparison ──────────────────────────────────────────────────────────────

function Comparison({ current, future, currentResults, futureResults }: {
  current: Scenario; future: Scenario;
  currentResults: SimulationResults; futureResults: SimulationResults;
}) {
  const metrics = [
    { label: 'Capacidade', current: currentResults.capacityPerDay, future: futureResults.capacityPerDay, suffix: ' un/dia', inverse: false },
    { label: 'Lead time', current: currentResults.leadTimeDays, future: futureResults.leadTimeDays, suffix: ' dias', inverse: true },
    { label: 'Estoque total', current: currentResults.totalWip, future: futureResults.totalWip, suffix: ' un', inverse: true },
    { label: 'Processamento', current: currentResults.processingTimeMin, future: futureResults.processingTimeMin, suffix: ' min', inverse: true },
  ];
  const flowLabels: Record<FlowType, string> = { push: 'Empurrado', pull: 'Puxado', fifo: 'FIFO', supermarket: 'Supermercado' };
  return (
    <section className="comparison-view">
      <div className="comparison-intro"><ScenarioPill kind="current" /><ArrowRight size={18} /><ScenarioPill kind="future" /></div>
      <div className="comparison-cards">
        {metrics.map((metric) => {
          const delta = deltaPercent(metric.current, metric.future, metric.inverse);
          return (
            <article key={metric.label}>
              <span>{metric.label}</span>
              <div><small>Atual</small><strong>{formatNumber(metric.current, 1)}{metric.suffix}</strong></div>
              <div><small>Futuro</small><strong>{formatNumber(metric.future, 1)}{metric.suffix}</strong></div>
              <em className={delta !== null && delta < 0 ? 'negative' : ''}>{delta === null ? 'Sem base' : `${delta >= 0 ? '+' : ''}${formatNumber(delta, 1)}%`}</em>
            </article>
          );
        })}
      </div>
      <div className="comparison-table-wrap">
        <table>
          <thead><tr><th>Processo</th><th>TC atual</th><th>TC futuro</th><th>WIP atual</th><th>WIP futuro</th><th>Fluxo futuro</th></tr></thead>
          <tbody>{Array.from({ length: Math.max(current.steps.length, future.steps.length) }, (_, i) => {
            const before = current.steps[i];
            const after = future.steps[i];
            return (
              <tr key={i}>
                <td>{after?.name || before?.name || '—'}</td>
                <td>{before ? formatSeconds(before.cycleTimeSec) : '—'}</td>
                <td>{after ? formatSeconds(after.cycleTimeSec) : '—'}</td>
                <td>{before ? `${formatNumber(before.wipUnits, 0)} un` : '—'}</td>
                <td>{after ? `${formatNumber(after.wipUnits, 0)} un` : '—'}</td>
                <td>{after ? flowLabels[after.flowAfter] : '—'}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Legenda ──────────────────────────────────────────────────────────────────

function LegendPanel() {
  return (
    <div className="legend-panel">
      <div className="legend-section">
        <p className="legend-title">Fluxo de material</p>
        <div className="legend-item"><PushArrow /><span>Empurrado</span></div>
        <div className="legend-item"><PullArrow /><span>Puxado</span></div>
        <div className="legend-item"><FifoArrow /><span>FIFO</span></div>
        <div className="legend-item"><SupermarketSymbol /><span>Supermercado</span></div>
        <div className="legend-item"><div className="map-inventory-mini"><div className="inventory-triangle-mini" /></div><span>Estoque</span></div>
      </div>
      <div className="legend-section">
        <p className="legend-title">Fluxo de informação</p>
        <div className="legend-item"><InfoArrowManual /><span>Manual</span></div>
        <div className="legend-item"><InfoArrowElectronic /><span>Eletrônico</span></div>
      </div>
      <div className="legend-section">
        <p className="legend-title">Outros</p>
        <div className="legend-item"><KaizenBurst label="Kaizen" /><span>Kaizen burst</span></div>
        <div className="legend-item"><TruckSymbol /><span>Transporte</span></div>
      </div>
    </div>
  );
}

// ─── Modal exportação ─────────────────────────────────────────────────────────

function ExportModal({ printRef, scenarioName, onClose }: {
  printRef: React.RefObject<HTMLDivElement>;
  scenarioName: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState<ExportFormat | null>(null);

  const run = async (format: ExportFormat) => {
    if (!printRef.current) return;
    setLoading(format);
    try {
      const name = `MFV_${scenarioName.replace(/\s+/g, '_')}`;
      if (format === 'pdf') await exportPDF(printRef.current, name);
      else if (format === 'jpeg') await exportJPEG(printRef.current, name);
      else await exportSVG(printRef.current, name);
    } finally {
      setLoading(null);
    }
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const formats: { fmt: ExportFormat; icon: React.ReactNode; label: string; desc: string }[] = [
    { fmt: 'pdf', icon: <FileText size={22} />, label: 'PDF', desc: 'A3 landscape · alta qualidade · ideal para impressão' },
    { fmt: 'jpeg', icon: <FileImage size={22} />, label: 'JPEG', desc: 'Imagem rasterizada · compatível com qualquer app' },
    { fmt: 'svg', icon: <ImageDown size={22} />, label: 'SVG', desc: 'Vetorial · escalável · editável no Illustrator / Figma' },
  ];

  return (
    <div className="editor-overlay" role="dialog" aria-modal="true">
      <button className="editor-backdrop" onClick={onClose} />
      <section className="editor-window export-modal">
        <header>
          <div><Download size={20} /><h2>Exportar MFV</h2><p>Escolha o formato de saída.</p></div>
          <button className="icon-button" onClick={onClose}><X size={20} /></button>
        </header>
        <div className="export-options">
          {formats.map(({ fmt, icon, label, desc }) => (
            <button key={fmt} className={`export-option ${loading === fmt ? 'loading' : ''}`} onClick={() => run(fmt)} disabled={!!loading}>
              <div className="export-icon">{loading === fmt ? <Loader2 size={22} className="spin" /> : icon}</div>
              <div>
                <strong>{label}</strong>
                <span>{desc}</span>
              </div>
            </button>
          ))}
        </div>
        <div className="export-hint">
          <Printer size={13} />
          <span>Para imprimir, use PDF e abra no leitor de PDF do sistema.</span>
        </div>
      </section>
    </div>
  );
}

// ─── Modal dados gerais ───────────────────────────────────────────────────────

function DataEditor({ project, scenario, tab, onTab, onProjectChange, onScenarioChange, onClose }: {
  project: ProjectInfo; scenario: Scenario; tab: EditorTab;
  onTab: (t: EditorTab) => void;
  onProjectChange: (patch: Partial<ProjectInfo>) => void;
  onScenarioChange: (s: Scenario) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="editor-overlay" role="dialog" aria-modal="true">
      <button className="editor-backdrop" onClick={onClose} />
      <section className="editor-window">
        <header>
          <div><ScenarioPill kind={scenario.id} /><h2>Configurar MFV</h2><p>Dados gerais do mapeamento.</p></div>
          <button className="icon-button" onClick={onClose}><X size={20} /></button>
        </header>
        <nav>
          <button className={tab === 'project' ? 'active' : ''} onClick={() => onTab('project')}>Identificação</button>
          <button className={tab === 'scenario' ? 'active' : ''} onClick={() => onTab('scenario')}>Premissas e fluxos</button>
        </nav>
        <div className="editor-body">
          {tab === 'project' && (
            <div className="editor-grid">
              <Field label="Área" value={project.area} onChange={(v) => onProjectChange({ area: v })} />
              <Field label="Família" value={project.family} onChange={(v) => onProjectChange({ family: v })} />
              <Field label="Produto" value={project.product} onChange={(v) => onProjectChange({ product: v })} />
              <Field label="Fornecedor" value={project.supplier} onChange={(v) => onProjectChange({ supplier: v })} />
              <Field label="Cliente" value={project.customer} onChange={(v) => onProjectChange({ customer: v })} />
              <Field label="Responsável" value={project.owner} onChange={(v) => onProjectChange({ owner: v })} />
              <Field label="Data de referência" type="date" value={project.referenceDate} onChange={(v) => onProjectChange({ referenceDate: v })} />
              <Field label="Freq. entrega fornecedor" type="number" suffix="dias" value={project.deliveryFrequencyDays ?? 1} onChange={(v) => onProjectChange({ deliveryFrequencyDays: clampNumber(v, 1) })} />
              <Field label="Freq. expedição cliente" type="number" suffix="dias" value={project.shipmentFrequencyDays ?? 1} onChange={(v) => onProjectChange({ shipmentFrequencyDays: clampNumber(v, 1) })} />
            </div>
          )}
          {tab === 'scenario' && (
            <div className="editor-grid scenario-fields">
              <Field label="Demanda mensal" type="number" suffix="un/mês" value={scenario.monthlyDemand} onChange={(v) => onScenarioChange({ ...scenario, monthlyDemand: clampNumber(v) })} />
              <Field label="Dias úteis" type="number" suffix="dias/mês" value={scenario.workdaysPerMonth} onChange={(v) => onScenarioChange({ ...scenario, workdaysPerMonth: clampNumber(v, 1) })} />
              <Field label="Tempo disponível" type="number" suffix="min/dia" value={scenario.availableMinutesPerDay} onChange={(v) => onScenarioChange({ ...scenario, availableMinutesPerDay: clampNumber(v, 1) })} />
              <div className="editor-explanation"><CheckCircle2 size={18} /><p>Essas três premissas alimentam a demanda diária e o takt time.</p></div>
              <SelectField label="Info: fornecedor → controle" value={scenario.infoSupplierFlow} onChange={(v) => onScenarioChange({ ...scenario, infoSupplierFlow: v as InfoFlowType })} options={INFO_FLOW_OPTIONS} />
              <SelectField label="Info: controle → chão de fábrica" value={scenario.infoShopFloorFlow} onChange={(v) => onScenarioChange({ ...scenario, infoShopFloorFlow: v as InfoFlowType })} options={INFO_FLOW_OPTIONS} />
              <SelectField label="Info: cliente → controle" value={scenario.infoCustomerFlow} onChange={(v) => onScenarioChange({ ...scenario, infoCustomerFlow: v as InfoFlowType })} options={INFO_FLOW_OPTIONS} />
              <div className="editor-explanation"><Zap size={18} /><p>Seta sólida = ordem manual em papel. Seta tracejada = eletrônica (EDI, ERP).</p></div>
            </div>
          )}
        </div>
        <footer><button className="primary-button" onClick={onClose}>Concluir</button></footer>
      </section>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [view, setView] = useState<View>('current');
  const [lastScenario, setLastScenario] = useState<ScenarioKind>('current');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>('project');
  const [exportOpen, setExportOpen] = useState(false);
  const [saved, setSaved] = useState(true);

  // Ref para o elemento que será exportado
  const printRef = useRef<HTMLDivElement>(null);

  const currentResults = simulate(data.current);
  const futureResults = simulate(data.future);
  const activeKind = view === 'comparison' ? lastScenario : view;
  const activeScenario = data[activeKind];
  const activeResults = activeKind === 'current' ? currentResults : futureResults;

  useEffect(() => {
    setSaved(false);
    const t = window.setTimeout(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); setSaved(true); }, 350);
    return () => window.clearTimeout(t);
  }, [data]);

  const updateProject = useCallback((patch: Partial<ProjectInfo>) =>
    setData((p) => ({ ...p, project: { ...p.project, ...patch } })), []);
  const updateScenario = useCallback((kind: ScenarioKind, s: Scenario) =>
    setData((p) => ({ ...p, [kind]: s })), []);
  const selectView = (next: View) => { setView(next); if (next !== 'comparison') setLastScenario(next); };
  const resetAll = () => { if (window.confirm('Restaurar os dados originais do modelo?')) { setData(initialData()); setView('current'); setLastScenario('current'); } };
  const copyCurrentToFuture = () => {
    if (window.confirm('Substituir o Estado futuro por uma cópia do Estado atual?')) {
      setData((p) => ({ ...p, future: cloneAsFuture(p.current) }));
      selectView('future');
    }
  };

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="app-sidebar no-print">
        <div className="sidebar-brand">
          <div className="app-symbol"><Route size={20} /></div>
          <div className="sidebar-brand-text"><strong>MFV</strong><span>Simulador</span></div>
          <button className="collapse-button" onClick={() => setSidebarCollapsed((v) => !v)}>
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <div className="sidebar-section-label"><span>Cenários</span></div>
        <nav className="sidebar-nav">
          <button className={view === 'current' ? 'active current' : ''} onClick={() => selectView('current')} title="Estado atual">
            <Map size={18} /><span>Estado atual</span>
          </button>
          <button className={view === 'future' ? 'active future' : ''} onClick={() => selectView('future')} title="Estado futuro">
            <Route size={18} /><span>Estado futuro</span>
          </button>
          <button className={view === 'comparison' ? 'active' : ''} onClick={() => selectView('comparison')} title="Comparativo">
            <GitCompareArrows size={18} /><span>Comparativo</span>
          </button>
        </nav>

        <div className="sidebar-section-label"><span>Configurar</span></div>
        <nav className="sidebar-nav secondary">
          <button onClick={() => { setEditorTab('project'); setEditorOpen(true); }} title="Identificação">
            <FilePenLine size={18} /><span>Identificação</span>
          </button>
          <button onClick={() => { setEditorTab('scenario'); setEditorOpen(true); }} title="Premissas">
            <Settings2 size={18} /><span>Premissas</span>
          </button>
        </nav>

        <div className="sidebar-section-label"><span>Referência</span></div>
        <nav className="sidebar-nav secondary">
          <button onClick={() => setLegendOpen((v) => !v)} className={legendOpen ? 'active' : ''} title="Legenda MFV">
            <BookOpen size={18} /><span>Legenda MFV</span>
          </button>
        </nav>

        {legendOpen && !sidebarCollapsed && <LegendPanel />}

        <div className="sidebar-bottom">
          <div className="save-state"><Save size={14} /><span>{saved ? 'Salvo' : 'Salvando…'}</span></div>
          <button onClick={() => setExportOpen(true)} title="Exportar / Imprimir">
            <Download size={17} /><span>Exportar</span>
          </button>
          {view === 'current' && (
            <button onClick={copyCurrentToFuture} title="Copiar para futuro">
              <Copy size={17} /><span>Copiar para futuro</span>
            </button>
          )}
          <button onClick={resetAll} title="Restaurar"><RotateCcw size={17} /><span>Restaurar</span></button>
        </div>
      </aside>

      <main className="app-main no-print">
        <header className="app-header">
          <div>
            <ScenarioPill kind={activeKind} />
            <h1>{view === 'comparison' ? 'Comparativo' : activeScenario.name}</h1>
            <p>{data.project.family || 'Família não informada'} <span>·</span> {data.project.product || 'Produto não informado'}</p>
          </div>
          <div className="header-actions">
            <button className="quiet-button" onClick={() => { setEditorTab('project'); setEditorOpen(true); }}>
              <FilePenLine size={17} />Configurar
            </button>
            <button className="primary-button" onClick={() => setExportOpen(true)}>
              <Download size={17} />Exportar
            </button>
          </div>
        </header>

        <div className="app-content">
          {view === 'comparison' ? (
            <Comparison current={data.current} future={data.future} currentResults={currentResults} futureResults={futureResults} />
          ) : (
            <>
              <MetricsStrip results={activeResults} scenario={activeScenario} />
              <section className="map-stage">
                <div className="stage-toolbar">
                  <div><span>MFV convencional</span><strong>{activeScenario.name}</strong></div>
                  <span className="stage-hint"><Pencil size={12} />Clique no lápis de cada processo para editar</span>
                </div>
                <div className="map-viewport">
                  <MfvDiagram
                    project={data.project}
                    scenario={activeScenario}
                    results={activeResults}
                    onScenarioChange={(s) => updateScenario(activeKind, s)}
                  />
                </div>
              </section>
            </>
          )}
        </div>
      </main>

      {/* Elemento oculto usado como fonte para exportação */}
      <div className="export-source" aria-hidden="true">
        <div ref={printRef}>
          <MfvDiagram
            project={data.project}
            scenario={activeScenario}
            results={activeResults}
            print
          />
        </div>
      </div>

      {editorOpen && (
        <DataEditor
          project={data.project} scenario={activeScenario}
          tab={editorTab} onTab={setEditorTab}
          onProjectChange={updateProject}
          onScenarioChange={(s) => updateScenario(activeKind, s)}
          onClose={() => setEditorOpen(false)}
        />
      )}

      {exportOpen && (
        <ExportModal
          printRef={printRef}
          scenarioName={activeScenario.name}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
