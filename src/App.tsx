import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Copy,
  Factory,
  FilePenLine,
  Gauge,
  GitCompareArrows,
  Map,
  PackageOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Printer,
  RotateCcw,
  Route,
  Save,
  Settings2,
  Trash2,
  Truck,
  UserRound,
  X,
} from 'lucide-react';
import {
  cloneAsFuture,
  createDefaultScenario,
  DEFAULT_PROJECT,
  newStep,
  simulate,
} from './simulation';
import type { ProcessStep, ProjectInfo, Scenario, ScenarioKind, SimulationResults } from './types';

type AppData = { project: ProjectInfo; current: Scenario; future: Scenario };
type View = ScenarioKind | 'comparison';
type EditorTab = 'project' | 'scenario' | 'processes';

const STORAGE_KEY = 'mfv-simulation:v2';

function initialData(): AppData {
  const current = createDefaultScenario('current');
  return { project: DEFAULT_PROJECT, current, future: cloneAsFuture(current) };
}

function loadData(): AppData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as AppData) : initialData();
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
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
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

function Field({ label, value, onChange, type = 'text', suffix, min, max, step }: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: 'text' | 'number' | 'date';
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="editor-field">
      <span>{label}</span>
      <div className="editor-input-wrap">
        <input type={type} value={value} min={min} max={max} step={step} onChange={(event) => onChange(event.target.value)} />
        {suffix && <small>{suffix}</small>}
      </div>
    </label>
  );
}

function ScenarioPill({ kind }: { kind: ScenarioKind }) {
  return <span className={`scenario-pill ${kind}`}>{kind === 'current' ? 'Estado atual' : 'Estado futuro'}</span>;
}

function FlowArrow({ caption }: { caption?: string }) {
  return (
    <div className="map-arrow">
      {caption && <span>{caption}</span>}
      <div><i /><ArrowRight size={15} strokeWidth={1.5} /></div>
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

function ProcessBox({ step, metrics, index }: {
  step: ProcessStep;
  metrics: SimulationResults['stepMetrics'][string];
  index: number;
}) {
  return (
    <div className={`map-process ${metrics.isBottleneck ? 'bottleneck' : ''}`}>
      <div className="process-title">
        <span>{String(index + 1).padStart(2, '0')}</span>
        <strong>{step.name}</strong>
      </div>
      <dl>
        <div><dt>Nº operador</dt><dd>{formatNumber(step.operators, 0)}</dd></div>
        <div><dt>T/C</dt><dd>{formatSeconds(step.cycleTimeSec)}</dd></div>
        <div><dt>Setup</dt><dd>{formatNumber(step.setupTimeMin, 1)} min</dd></div>
        <div><dt>Recurso</dt><dd>{formatNumber(step.batchSize, 0)}</dd></div>
        <div><dt>Disponibilidade</dt><dd>{formatNumber(step.availabilityPercent, 0)}%</dd></div>
      </dl>
      {metrics.isBottleneck && <span className="map-bottleneck">Gargalo</span>}
    </div>
  );
}

function MfvDiagram({ project, scenario, results, print = false }: {
  project: ProjectInfo;
  scenario: Scenario;
  results: SimulationResults;
  print?: boolean;
}) {
  const width = Math.max(1420, 520 + scenario.steps.length * 210);
  return (
    <div className={`mfv-sheet ${print ? 'for-print' : ''}`} style={{ width }}>
      <div className="map-family-bar">
        <span>Família de produto</span>
        <strong>{project.family || 'Não informada'}</strong>
        <small>{scenario.name}</small>
      </div>

      <div className="map-information-row">
        <div className="map-party supplier"><Truck size={22} /><strong>{project.supplier || 'Fornecedor'}</strong></div>
        <FlowArrow caption="Programação" />
        <div className="map-planning">
          <div><Factory size={17} /><strong>Controle da produção</strong></div>
          <span>Programação semanal</span>
          <dl>
            <div><dt>Demanda mensal</dt><dd>{formatNumber(scenario.monthlyDemand, 0)} un</dd></div>
            <div><dt>Demanda diária</dt><dd>{formatNumber(results.dailyDemand, 2)} un</dd></div>
            <div><dt>Takt time</dt><dd>{formatSeconds(results.taktTimeSec)}</dd></div>
            <div><dt>Tempo disponível</dt><dd>{formatNumber(scenario.availableMinutesPerDay, 0)} min/dia</dd></div>
          </dl>
        </div>
        <FlowArrow caption="Demanda" />
        <div className="map-party customer"><UserRound size={22} /><strong>{project.customer || 'Cliente final'}</strong></div>
      </div>

      <div className="map-material-row">
        <div className="map-origin">
          <PackageOpen size={25} />
          <strong>Matéria-prima</strong>
          <span>{project.area || 'Área não informada'}</span>
        </div>
        <FlowArrow />
        {scenario.steps.map((step, index) => (
          <div className="map-process-group" key={step.id}>
            <ProcessBox step={step} metrics={results.stepMetrics[step.id]} index={index} />
            <div className="inventory-after">
              <FlowArrow />
              <InventorySymbol units={step.wipUnits} days={results.stepMetrics[step.id].inventoryDays} />
            </div>
          </div>
        ))}
        <div className="map-shipping"><Truck size={34} /><strong>Expedição</strong><span>{project.product || 'Produto'}</span></div>
      </div>

      <div className="map-time-ladder">
        <div className="ladder-labels"><span>Estoque em dias</span><span>T/C</span></div>
        <div className="ladder-track">
          {scenario.steps.map((step) => (
            <div className="ladder-step" key={step.id}>
              <div><span>{formatNumber(results.stepMetrics[step.id].inventoryDays, 2)} dias</span></div>
              <div><span>{formatSeconds(step.cycleTimeSec)}</span></div>
            </div>
          ))}
        </div>
        <div className="lead-summary">
          <div><span>Lead time</span><strong>{formatNumber(results.leadTimeDays, 2)} dias</strong></div>
          <div><span>Processamento</span><strong>{formatNumber(results.processingTimeMin, 1)} min</strong></div>
        </div>
      </div>

      <div className="map-footer-meta">
        <span>Produto: <strong>{project.product || '—'}</strong></span>
        <span>Responsável: <strong>{project.owner || '—'}</strong></span>
        <span>Referência: <strong>{formatDate(project.referenceDate)}</strong></span>
      </div>
    </div>
  );
}

function MetricsStrip({ results }: { results: SimulationResults }) {
  const metrics = [
    { icon: <Clock3 size={17} />, label: 'Takt time', value: formatSeconds(results.taktTimeSec) },
    { icon: <Gauge size={17} />, label: 'Capacidade', value: `${formatNumber(results.capacityPerDay, 1)} un/dia` },
    { icon: <Route size={17} />, label: 'Lead time', value: `${formatNumber(results.leadTimeDays, 2)} dias` },
    { icon: <Activity size={17} />, label: 'Balanceamento', value: `${formatNumber(results.lineBalance * 100, 0)}%` },
  ];
  return <div className="metrics-strip">{metrics.map((metric) => <div key={metric.label}>{metric.icon}<span>{metric.label}</span><strong>{metric.value}</strong></div>)}</div>;
}

function Comparison({ current, future, currentResults, futureResults }: {
  current: Scenario;
  future: Scenario;
  currentResults: SimulationResults;
  futureResults: SimulationResults;
}) {
  const metrics = [
    { label: 'Capacidade', current: currentResults.capacityPerDay, future: futureResults.capacityPerDay, suffix: ' un/dia', inverse: false },
    { label: 'Lead time', current: currentResults.leadTimeDays, future: futureResults.leadTimeDays, suffix: ' dias', inverse: true },
    { label: 'Estoque total', current: currentResults.totalWip, future: futureResults.totalWip, suffix: ' un', inverse: true },
    { label: 'Processamento', current: currentResults.processingTimeMin, future: futureResults.processingTimeMin, suffix: ' min', inverse: true },
  ];
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
          <thead><tr><th>Processo</th><th>TC atual</th><th>TC futuro</th><th>Estoque atual</th><th>Estoque futuro</th></tr></thead>
          <tbody>{Array.from({ length: Math.max(current.steps.length, future.steps.length) }, (_, index) => {
            const before = current.steps[index];
            const after = future.steps[index];
            return <tr key={`${before?.id}-${after?.id}`}><td>{after?.name || before?.name || '—'}</td><td>{before ? formatSeconds(before.cycleTimeSec) : '—'}</td><td>{after ? formatSeconds(after.cycleTimeSec) : '—'}</td><td>{before ? `${formatNumber(before.wipUnits, 0)} un` : '—'}</td><td>{after ? `${formatNumber(after.wipUnits, 0)} un` : '—'}</td></tr>;
          })}</tbody>
        </table>
      </div>
    </section>
  );
}

function ProcessEditor({ scenario, onChange }: { scenario: Scenario; onChange: (scenario: Scenario) => void }) {
  const updateStep = (id: string, patch: Partial<ProcessStep>) => onChange({ ...scenario, steps: scenario.steps.map((step) => step.id === id ? { ...step, ...patch } : step) });
  const moveStep = (index: number, direction: -1 | 1) => {
    const next = index + direction;
    if (next < 0 || next >= scenario.steps.length) return;
    const steps = [...scenario.steps];
    [steps[index], steps[next]] = [steps[next], steps[index]];
    onChange({ ...scenario, steps });
  };
  return (
    <div className="process-editor">
      {scenario.steps.map((step, index) => (
        <article key={step.id}>
          <div className="process-editor-title">
            <span>{String(index + 1).padStart(2, '0')}</span>
            <input aria-label={`Nome do processo ${index + 1}`} value={step.name} onChange={(event) => updateStep(step.id, { name: event.target.value })} />
            <div><button onClick={() => moveStep(index, -1)} disabled={index === 0} aria-label="Mover para cima"><ChevronUp size={16} /></button><button onClick={() => moveStep(index, 1)} disabled={index === scenario.steps.length - 1} aria-label="Mover para baixo"><ChevronDown size={16} /></button><button className="delete" onClick={() => onChange({ ...scenario, steps: scenario.steps.filter((item) => item.id !== step.id) })} disabled={scenario.steps.length === 1} aria-label="Excluir processo"><Trash2 size={16} /></button></div>
          </div>
          <div className="process-editor-fields">
            <Field label="Tempo de ciclo" type="number" suffix="s" value={step.cycleTimeSec} onChange={(value) => updateStep(step.id, { cycleTimeSec: clampNumber(value) })} />
            <Field label="Setup" type="number" suffix="min" value={step.setupTimeMin} onChange={(value) => updateStep(step.id, { setupTimeMin: clampNumber(value) })} />
            <Field label="Lote / recurso" type="number" suffix="un" value={step.batchSize} onChange={(value) => updateStep(step.id, { batchSize: clampNumber(value, 1) })} />
            <Field label="Operadores" type="number" suffix="pess." value={step.operators} onChange={(value) => updateStep(step.id, { operators: clampNumber(value, 1) })} />
            <Field label="Disponibilidade" type="number" suffix="%" value={step.availabilityPercent} onChange={(value) => updateStep(step.id, { availabilityPercent: Math.min(100, clampNumber(value, 100)) })} />
            <Field label="Estoque após processo" type="number" suffix="un" value={step.wipUnits} onChange={(value) => updateStep(step.id, { wipUnits: clampNumber(value) })} />
          </div>
        </article>
      ))}
      <button className="add-row" onClick={() => onChange({ ...scenario, steps: [...scenario.steps, newStep(scenario.id, scenario.steps.length + 1)] })}><Plus size={16} />Adicionar processo</button>
    </div>
  );
}

function DataEditor({ project, scenario, tab, onTab, onProjectChange, onScenarioChange, onClose }: {
  project: ProjectInfo;
  scenario: Scenario;
  tab: EditorTab;
  onTab: (tab: EditorTab) => void;
  onProjectChange: (patch: Partial<ProjectInfo>) => void;
  onScenarioChange: (scenario: Scenario) => void;
  onClose: () => void;
}) {
  return (
    <div className="editor-overlay" role="dialog" aria-modal="true" aria-label="Editar dados do MFV">
      <button className="editor-backdrop" onClick={onClose} aria-label="Fechar edição" />
      <section className="editor-window">
        <header><div><ScenarioPill kind={scenario.id} /><h2>Editar dados do MFV</h2><p>As alterações são salvas automaticamente.</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></header>
        <nav><button className={tab === 'project' ? 'active' : ''} onClick={() => onTab('project')}>Identificação</button><button className={tab === 'scenario' ? 'active' : ''} onClick={() => onTab('scenario')}>Premissas</button><button className={tab === 'processes' ? 'active' : ''} onClick={() => onTab('processes')}>Processos</button></nav>
        <div className="editor-body">
          {tab === 'project' && <div className="editor-grid"><Field label="Área" value={project.area} onChange={(area) => onProjectChange({ area })} /><Field label="Família" value={project.family} onChange={(family) => onProjectChange({ family })} /><Field label="Produto" value={project.product} onChange={(product) => onProjectChange({ product })} /><Field label="Fornecedor" value={project.supplier} onChange={(supplier) => onProjectChange({ supplier })} /><Field label="Cliente" value={project.customer} onChange={(customer) => onProjectChange({ customer })} /><Field label="Responsável" value={project.owner} onChange={(owner) => onProjectChange({ owner })} /><Field label="Data de referência" type="date" value={project.referenceDate} onChange={(referenceDate) => onProjectChange({ referenceDate })} /></div>}
          {tab === 'scenario' && <div className="editor-grid scenario-fields"><Field label="Demanda mensal" type="number" suffix="un/mês" value={scenario.monthlyDemand} onChange={(value) => onScenarioChange({ ...scenario, monthlyDemand: clampNumber(value) })} /><Field label="Dias úteis" type="number" suffix="dias/mês" value={scenario.workdaysPerMonth} onChange={(value) => onScenarioChange({ ...scenario, workdaysPerMonth: clampNumber(value, 1) })} /><Field label="Tempo disponível" type="number" suffix="min/dia" value={scenario.availableMinutesPerDay} onChange={(value) => onScenarioChange({ ...scenario, availableMinutesPerDay: clampNumber(value, 1) })} /><div className="editor-explanation"><CheckCircle2 size={18} /><p>Essas três premissas alimentam a demanda diária e o takt time do mapa.</p></div></div>}
          {tab === 'processes' && <ProcessEditor scenario={scenario} onChange={onScenarioChange} />}
        </div>
        <footer><button className="primary-button" onClick={onClose}>Concluir</button></footer>
      </section>
    </div>
  );
}

function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [view, setView] = useState<View>('current');
  const [lastScenario, setLastScenario] = useState<ScenarioKind>('current');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>('project');
  const [saved, setSaved] = useState(true);

  const currentResults = simulate(data.current);
  const futureResults = simulate(data.future);
  const activeKind = view === 'comparison' ? lastScenario : view;
  const activeScenario = data[activeKind];
  const activeResults = activeKind === 'current' ? currentResults : futureResults;

  useEffect(() => {
    setSaved(false);
    const timer = window.setTimeout(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); setSaved(true); }, 350);
    return () => window.clearTimeout(timer);
  }, [data]);

  useEffect(() => {
    if (!editorOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setEditorOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [editorOpen]);

  const updateProject = useCallback((patch: Partial<ProjectInfo>) => setData((previous) => ({ ...previous, project: { ...previous.project, ...patch } })), []);
  const updateScenario = useCallback((kind: ScenarioKind, scenario: Scenario) => setData((previous) => ({ ...previous, [kind]: scenario })), []);
  const selectView = (next: View) => { setView(next); if (next !== 'comparison') setLastScenario(next); };
  const openEditor = (tab: EditorTab) => { setEditorTab(tab); setEditorOpen(true); };
  const resetAll = () => { if (window.confirm('Restaurar os dados originais do modelo?')) { setData(initialData()); setView('current'); setLastScenario('current'); } };
  const copyCurrentToFuture = () => { if (window.confirm('Substituir o Estado futuro por uma cópia do Estado atual?')) { setData((previous) => ({ ...previous, future: cloneAsFuture(previous.current) })); selectView('future'); } };

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="app-sidebar no-print">
        <div className="sidebar-brand"><div className="app-symbol"><Route size={20} /></div><div className="sidebar-brand-text"><strong>MFV</strong><span>Simulador</span></div><button className="collapse-button" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}>{sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button></div>
        <nav className="sidebar-nav">
          <button className={view === 'current' ? 'active' : ''} onClick={() => selectView('current')} title="Estado atual"><Map size={19} /><span>Estado atual</span></button>
          <button className={view === 'future' ? 'active' : ''} onClick={() => selectView('future')} title="Estado futuro"><Route size={19} /><span>Estado futuro</span></button>
          <button className={view === 'comparison' ? 'active' : ''} onClick={() => selectView('comparison')} title="Comparativo"><GitCompareArrows size={19} /><span>Comparativo</span></button>
        </nav>
        <div className="sidebar-section-label"><span>Dados</span></div>
        <nav className="sidebar-nav secondary">
          <button onClick={() => openEditor('project')} title="Identificação"><FilePenLine size={19} /><span>Identificação</span></button>
          <button onClick={() => openEditor('scenario')} title="Premissas"><Settings2 size={19} /><span>Premissas</span></button>
          <button onClick={() => openEditor('processes')} title="Processos"><Factory size={19} /><span>Processos</span></button>
        </nav>
        <div className="sidebar-bottom"><div className="save-state"><Save size={15} /><span>{saved ? 'Salvo' : 'Salvando…'}</span></div><button onClick={resetAll} title="Restaurar dados"><RotateCcw size={17} /><span>Restaurar</span></button></div>
      </aside>

      <main className="app-main no-print">
        <header className="app-header">
          <div><ScenarioPill kind={activeKind} /><h1>{view === 'comparison' ? 'Comparativo' : activeScenario.name}</h1><p>{data.project.family || 'Família não informada'} <span>·</span> {data.project.product || 'Produto não informado'}</p></div>
          <div className="header-actions">
            {view === 'current' && <button className="quiet-button" onClick={copyCurrentToFuture}><Copy size={17} />Copiar para futuro</button>}
            <button className="quiet-button" onClick={() => openEditor(view === 'comparison' ? 'project' : 'processes')}><FilePenLine size={17} />Editar dados</button>
            <button className="primary-button" onClick={() => window.print()}><Printer size={17} />Imprimir MFV</button>
          </div>
        </header>

        <div className="app-content">
          {view === 'comparison' ? (
            <Comparison current={data.current} future={data.future} currentResults={currentResults} futureResults={futureResults} />
          ) : (
            <>
              <MetricsStrip results={activeResults} />
              <section className="map-stage">
                <div className="stage-toolbar"><div><span>MFV convencional</span><strong>{activeScenario.name}</strong></div><button onClick={() => openEditor('processes')}><FilePenLine size={15} />Editar processos</button></div>
                <div className="map-viewport"><MfvDiagram project={data.project} scenario={activeScenario} results={activeResults} /></div>
              </section>
            </>
          )}
        </div>
      </main>

      {editorOpen && <DataEditor project={data.project} scenario={activeScenario} tab={editorTab} onTab={setEditorTab} onProjectChange={updateProject} onScenarioChange={(scenario) => updateScenario(activeKind, scenario)} onClose={() => setEditorOpen(false)} />}

      <div className="print-only"><MfvDiagram project={data.project} scenario={activeScenario} results={activeResults} print /></div>
    </div>
  );
}

export default App;
