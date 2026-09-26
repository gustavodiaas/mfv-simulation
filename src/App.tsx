import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Copy,
  Factory,
  FileDown,
  PackageOpen,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Truck,
  UserRound,
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
    <label className="field">
      <span>{label}</span>
      <div className="field-control">
        <input type={type} value={value} min={min} max={max} step={step} onChange={(event) => onChange(event.target.value)} />
        {suffix && <small>{suffix}</small>}
      </div>
    </label>
  );
}

function MetricCard({ label, value, detail, tone = 'blue' }: {
  label: string;
  value: string;
  detail: string;
  tone?: 'blue' | 'green' | 'amber' | 'red';
}) {
  return (
    <div className={`metric-card metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function ProcessCard({ step, metrics, index, total, onChange, onMove, onRemove }: {
  step: ProcessStep;
  metrics: SimulationResults['stepMetrics'][string];
  index: number;
  total: number;
  onChange: (patch: Partial<ProcessStep>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <article className={`process-card ${metrics.isBottleneck ? 'is-bottleneck' : ''}`}>
      <div className="process-card-head">
        <div className="process-index">{String(index + 1).padStart(2, '0')}</div>
        <input className="process-name" aria-label={`Nome do processo ${index + 1}`} value={step.name} onChange={(event) => onChange({ name: event.target.value })} />
        {metrics.isBottleneck && <span className="bottleneck-tag">Gargalo</span>}
      </div>
      <div className="process-fields">
        <Field label="Tempo de ciclo" type="number" min={0} step={1} suffix="s" value={step.cycleTimeSec} onChange={(value) => onChange({ cycleTimeSec: clampNumber(value) })} />
        <Field label="Setup" type="number" min={0} step={1} suffix="min" value={step.setupTimeMin} onChange={(value) => onChange({ setupTimeMin: clampNumber(value) })} />
        <Field label="Lote" type="number" min={1} step={1} suffix="un" value={step.batchSize} onChange={(value) => onChange({ batchSize: clampNumber(value, 1) })} />
        <Field label="Operadores" type="number" min={1} step={1} suffix="pess." value={step.operators} onChange={(value) => onChange({ operators: clampNumber(value, 1) })} />
        <Field label="Disponibilidade" type="number" min={1} max={100} step={1} suffix="%" value={step.availabilityPercent} onChange={(value) => onChange({ availabilityPercent: Math.min(100, clampNumber(value, 100)) })} />
        <Field label="Estoque após processo" type="number" min={0} step={1} suffix="un" value={step.wipUnits} onChange={(value) => onChange({ wipUnits: clampNumber(value) })} />
      </div>
      <div className="process-card-foot">
        <div><span>Capacidade</span><strong>{formatNumber(metrics.capacityPerDay, 1)} un/dia</strong></div>
        <div><span>Estoque</span><strong>{formatNumber(metrics.inventoryDays, 2)} dias</strong></div>
        <div className="card-actions">
          <button onClick={() => onMove(-1)} disabled={index === 0} aria-label="Mover processo para a esquerda"><ChevronUp size={15} /></button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Mover processo para a direita"><ChevronDown size={15} /></button>
          <button className="danger" onClick={onRemove} disabled={total <= 1} aria-label="Excluir processo"><Trash2 size={15} /></button>
        </div>
      </div>
    </article>
  );
}

function FlowMap({ project, scenario, results, onScenarioChange }: {
  project: ProjectInfo;
  scenario: Scenario;
  results: SimulationResults;
  onScenarioChange: (scenario: Scenario) => void;
}) {
  const updateStep = (id: string, patch: Partial<ProcessStep>) => {
    onScenarioChange({ ...scenario, steps: scenario.steps.map((step) => step.id === id ? { ...step, ...patch } : step) });
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= scenario.steps.length) return;
    const steps = [...scenario.steps];
    [steps[index], steps[nextIndex]] = [steps[nextIndex], steps[index]];
    onScenarioChange({ ...scenario, steps });
  };

  const removeStep = (id: string) => {
    if (scenario.steps.length <= 1) return;
    onScenarioChange({ ...scenario, steps: scenario.steps.filter((step) => step.id !== id) });
  };

  return (
    <>
      <section className="metrics-grid">
        <MetricCard label="Takt time" value={formatSeconds(results.taktTimeSec)} detail={`${formatNumber(results.dailyDemand, 2)} un/dia`} />
        <MetricCard label="Capacidade da linha" value={`${formatNumber(results.capacityPerDay, 1)} un/dia`} detail={results.meetsDemand ? 'Atende à demanda' : 'Abaixo da demanda'} tone={results.meetsDemand ? 'green' : 'red'} />
        <MetricCard label="Lead time" value={`${formatNumber(results.leadTimeDays, 2)} dias`} detail={`${formatNumber(results.totalWip, 0)} unidades em estoque`} tone="amber" />
        <MetricCard label="Balanceamento" value={`${formatNumber(results.lineBalance * 100, 0)}%`} detail={`${formatNumber(results.processingTimeMin, 1)} min de processamento`} tone={results.lineBalance >= 0.8 ? 'green' : 'amber'} />
      </section>

      <section className="map-shell">
        <div className="section-title-row">
          <div><span className="eyebrow">Mapa do fluxo</span><h2>{scenario.name}</h2></div>
          <p>{project.family || 'Família não informada'} · {project.product || 'Produto não informado'}</p>
        </div>
        <div className="information-flow">
          <div className="endpoint"><Truck size={18} /><span>{project.supplier || 'Fornecedor'}</span></div>
          <div className="info-line"><span>Fluxo de informação e programação</span><ArrowRight size={18} /></div>
          <div className="planning-box"><Factory size={18} /><span>Planejamento</span><strong>{formatNumber(scenario.monthlyDemand, 0)} un/mês</strong></div>
          <div className="info-line"><ArrowRight size={18} /><span>Demanda</span></div>
          <div className="endpoint"><UserRound size={18} /><span>{project.customer || 'Cliente final'}</span></div>
        </div>
        <div className="flow-scroll">
          <div className="flow-row">
            <div className="material-endpoint"><PackageOpen size={22} /><span>Matéria-prima</span></div>
            {scenario.steps.map((step, index) => (
              <div className="flow-segment" key={step.id}>
                <ArrowRight className="material-arrow" size={26} />
                <ProcessCard step={step} metrics={results.stepMetrics[step.id]} index={index} total={scenario.steps.length} onChange={(patch) => updateStep(step.id, patch)} onMove={(direction) => moveStep(index, direction)} onRemove={() => removeStep(step.id)} />
                <div className="inventory-marker" title="Estoque após o processo"><span className="triangle" /><strong>{formatNumber(step.wipUnits, 0)} un</strong><small>{formatNumber(results.stepMetrics[step.id].inventoryDays, 2)} dias</small></div>
              </div>
            ))}
            <ArrowRight className="material-arrow" size={26} />
            <div className="material-endpoint customer"><Truck size={22} /><span>Expedição</span></div>
          </div>
        </div>
        <button className="add-process" onClick={() => onScenarioChange({ ...scenario, steps: [...scenario.steps, newStep(scenario.id, scenario.steps.length + 1)] })}><Plus size={16} />Adicionar processo</button>
        <div className="timeline">
          <div><span>Tempo em estoque</span><strong>{formatNumber(results.inventoryLeadTimeDays, 2)} dias</strong></div><ArrowDown size={16} />
          <div><span>Tempo de processamento</span><strong>{formatNumber(results.processingTimeMin, 1)} min</strong></div><ArrowDown size={16} />
          <div className="timeline-total"><span>Lead time total</span><strong>{formatNumber(results.leadTimeDays, 2)} dias</strong></div>
        </div>
      </section>
    </>
  );
}

function Comparison({ current, future, currentResults, futureResults }: {
  current: Scenario;
  future: Scenario;
  currentResults: SimulationResults;
  futureResults: SimulationResults;
}) {
  const metrics = [
    { label: 'Capacidade da linha', current: currentResults.capacityPerDay, future: futureResults.capacityPerDay, suffix: ' un/dia', inverse: false },
    { label: 'Lead time', current: currentResults.leadTimeDays, future: futureResults.leadTimeDays, suffix: ' dias', inverse: true },
    { label: 'Estoque total', current: currentResults.totalWip, future: futureResults.totalWip, suffix: ' un', inverse: true },
    { label: 'Tempo de processamento', current: currentResults.processingTimeMin, future: futureResults.processingTimeMin, suffix: ' min', inverse: true },
    { label: 'Balanceamento', current: currentResults.lineBalance * 100, future: futureResults.lineBalance * 100, suffix: '%', inverse: false },
  ];
  return (
    <section className="comparison-shell">
      <div className="section-title-row"><div><span className="eyebrow">Estado atual x Estado futuro</span><h2>Comparativo de cenários</h2></div><p>Os ganhos são calculados com as mesmas regras nos dois cenários.</p></div>
      <div className="comparison-grid">
        {metrics.map((metric) => {
          const delta = deltaPercent(metric.current, metric.future, metric.inverse);
          const positive = delta !== null && delta >= 0;
          return <article className="comparison-card" key={metric.label}><span>{metric.label}</span><div className="comparison-values"><div><small>Atual</small><strong>{formatNumber(metric.current, metric.suffix === '%' ? 0 : 1)}{metric.suffix}</strong></div><ArrowRight size={18} /><div><small>Futuro</small><strong>{formatNumber(metric.future, metric.suffix === '%' ? 0 : 1)}{metric.suffix}</strong></div></div><div className={`delta ${delta === null ? 'neutral' : positive ? 'positive' : 'negative'}`}>{delta === null ? 'Sem base para comparação' : `${delta >= 0 ? '+' : ''}${formatNumber(delta, 1)}% de ganho`}</div></article>;
        })}
      </div>
      <div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th>Processo</th><th>TC atual</th><th>TC futuro</th><th>Estoque atual</th><th>Estoque futuro</th><th>Variação do TC</th></tr></thead><tbody>
        {Array.from({ length: Math.max(current.steps.length, future.steps.length) }, (_, index) => {
          const currentStep = current.steps[index];
          const futureStep = future.steps[index];
          const delta = currentStep && futureStep ? deltaPercent(currentStep.cycleTimeSec, futureStep.cycleTimeSec, true) : null;
          return <tr key={`${currentStep?.id ?? 'none'}-${futureStep?.id ?? 'none'}`}><td>{futureStep?.name || currentStep?.name || '—'}</td><td>{currentStep ? formatSeconds(currentStep.cycleTimeSec) : '—'}</td><td>{futureStep ? formatSeconds(futureStep.cycleTimeSec) : '—'}</td><td>{currentStep ? `${formatNumber(currentStep.wipUnits, 0)} un` : '—'}</td><td>{futureStep ? `${formatNumber(futureStep.wipUnits, 0)} un` : '—'}</td><td>{delta === null ? '—' : `${delta >= 0 ? '+' : ''}${formatNumber(delta, 1)}%`}</td></tr>;
        })}
      </tbody></table></div>
    </section>
  );
}

function PrintScenario({ project, scenario, results }: { project: ProjectInfo; scenario: Scenario; results: SimulationResults }) {
  return (
    <section className="print-page">
      <header className="print-header"><div><span>MFV convencional</span><h1>{scenario.name}</h1></div><div><strong>{project.family || 'Família não informada'}</strong><span>{project.product || 'Produto não informado'}</span></div></header>
      <div className="print-meta"><span>Área: <strong>{project.area || '—'}</strong></span><span>Responsável: <strong>{project.owner || '—'}</strong></span><span>Referência: <strong>{formatDate(project.referenceDate)}</strong></span></div>
      <div className="print-kpis"><div><span>Demanda</span><strong>{formatNumber(scenario.monthlyDemand, 0)} un/mês</strong></div><div><span>Takt time</span><strong>{formatSeconds(results.taktTimeSec)}</strong></div><div><span>Capacidade</span><strong>{formatNumber(results.capacityPerDay, 1)} un/dia</strong></div><div><span>Lead time</span><strong>{formatNumber(results.leadTimeDays, 2)} dias</strong></div></div>
      <div className="print-flow"><div className="print-endpoint">{project.supplier || 'Fornecedor'}</div>{scenario.steps.map((step) => <div className="print-step-wrap" key={step.id}><ArrowRight size={16} /><div className={`print-step ${results.stepMetrics[step.id].isBottleneck ? 'is-bottleneck' : ''}`}><strong>{step.name}</strong><span>TC: {formatSeconds(step.cycleTimeSec)}</span><span>Setup: {formatNumber(step.setupTimeMin, 1)} min</span><span>Operadores: {formatNumber(step.operators, 0)}</span><span>Disponibilidade: {formatNumber(step.availabilityPercent, 0)}%</span><span>Estoque: {formatNumber(step.wipUnits, 0)} un</span></div></div>)}<ArrowRight size={16} /><div className="print-endpoint">{project.customer || 'Cliente final'}</div></div>
      <table className="print-table"><thead><tr><th>Processo</th><th>TC</th><th>TC efetivo</th><th>Capacidade/dia</th><th>Estoque</th><th>Estoque em dias</th></tr></thead><tbody>{scenario.steps.map((step) => <tr key={step.id}><td>{step.name}</td><td>{formatSeconds(step.cycleTimeSec)}</td><td>{formatSeconds(results.stepMetrics[step.id].effectiveCycleTimeSec)}</td><td>{formatNumber(results.stepMetrics[step.id].capacityPerDay, 1)}</td><td>{formatNumber(step.wipUnits, 0)}</td><td>{formatNumber(results.stepMetrics[step.id].inventoryDays, 2)}</td></tr>)}</tbody></table>
      <footer className="print-footer"><span>Tempo de processamento: {formatNumber(results.processingTimeMin, 1)} min</span><strong>Lead time total: {formatNumber(results.leadTimeDays, 2)} dias</strong></footer>
    </section>
  );
}

function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [view, setView] = useState<View>('current');
  const [saved, setSaved] = useState(true);
  const currentResults = simulate(data.current);
  const futureResults = simulate(data.future);

  useEffect(() => {
    setSaved(false);
    const timer = window.setTimeout(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); setSaved(true); }, 350);
    return () => window.clearTimeout(timer);
  }, [data]);

  const updateProject = useCallback((patch: Partial<ProjectInfo>) => setData((previous) => ({ ...previous, project: { ...previous.project, ...patch } })), []);
  const updateScenario = useCallback((kind: ScenarioKind, scenario: Scenario) => setData((previous) => ({ ...previous, [kind]: scenario })), []);
  const resetAll = () => { if (window.confirm('Restaurar o modelo inicial? As alterações salvas neste navegador serão substituídas.')) { setData(initialData()); setView('current'); } };
  const copyCurrentToFuture = () => { setData((previous) => ({ ...previous, future: cloneAsFuture(previous.current) })); setView('future'); };
  const activeScenario = view === 'future' ? data.future : data.current;
  const activeResults = view === 'future' ? futureResults : currentResults;

  return (
    <div className="app-shell">
      <header className="topbar no-print"><div className="brand"><div className="brand-mark"><BarChart3 size={22} /></div><div><span>Mapeamento de Fluxo de Valor</span><h1>Simulador MFV</h1></div></div><div className="header-actions"><span className={`save-status ${saved ? 'is-saved' : ''}`}><Save size={14} />{saved ? 'Salvo neste navegador' : 'Salvando…'}</span><button className="button button-secondary" onClick={resetAll}><RotateCcw size={16} />Restaurar</button><button className="button button-primary" onClick={() => window.print()}><FileDown size={16} />Imprimir / salvar PDF</button></div></header>
      <main className="workspace no-print">
        <aside className="sidebar">
          <section className="sidebar-section"><div className="sidebar-heading"><span>01</span><h2>Identificação</h2></div><Field label="Área" value={data.project.area} onChange={(area) => updateProject({ area })} /><Field label="Família" value={data.project.family} onChange={(family) => updateProject({ family })} /><Field label="Produto" value={data.project.product} onChange={(product) => updateProject({ product })} /><Field label="Fornecedor" value={data.project.supplier} onChange={(supplier) => updateProject({ supplier })} /><Field label="Cliente" value={data.project.customer} onChange={(customer) => updateProject({ customer })} /><Field label="Responsável" value={data.project.owner} onChange={(owner) => updateProject({ owner })} /><Field label="Data de referência" type="date" value={data.project.referenceDate} onChange={(referenceDate) => updateProject({ referenceDate })} /></section>
          {view !== 'comparison' && <section className="sidebar-section"><div className="sidebar-heading"><span>02</span><h2>Premissas do cenário</h2></div><Field label="Demanda mensal" type="number" min={0} step={1} suffix="un/mês" value={activeScenario.monthlyDemand} onChange={(value) => updateScenario(activeScenario.id, { ...activeScenario, monthlyDemand: clampNumber(value) })} /><Field label="Dias úteis" type="number" min={1} step={1} suffix="dias/mês" value={activeScenario.workdaysPerMonth} onChange={(value) => updateScenario(activeScenario.id, { ...activeScenario, workdaysPerMonth: clampNumber(value, 1) })} /><Field label="Tempo disponível" type="number" min={1} step={1} suffix="min/dia" value={activeScenario.availableMinutesPerDay} onChange={(value) => updateScenario(activeScenario.id, { ...activeScenario, availableMinutesPerDay: clampNumber(value, 1) })} /><div className="formula-note"><CircleAlert size={15} /><p>O takt time é calculado pela divisão do tempo disponível pela demanda diária.</p></div></section>}
          <section className="sidebar-section sidebar-guide"><div className="sidebar-heading"><span>03</span><h2>Como usar</h2></div><ol><li>Revise o Estado atual.</li><li>Copie para o Estado futuro.</li><li>Altere processos e estoques.</li><li>Compare os ganhos e gere o PDF.</li></ol></section>
        </aside>
        <div className="content">
          <nav className="view-tabs"><button className={view === 'current' ? 'active' : ''} onClick={() => setView('current')}>Estado atual</button><button className={view === 'future' ? 'active' : ''} onClick={() => setView('future')}>Estado futuro</button><button className={view === 'comparison' ? 'active' : ''} onClick={() => setView('comparison')}>Comparativo</button><button className="copy-action" onClick={copyCurrentToFuture}><Copy size={15} />Copiar atual para futuro</button></nav>
          {view === 'comparison' ? <Comparison current={data.current} future={data.future} currentResults={currentResults} futureResults={futureResults} /> : <FlowMap project={data.project} scenario={activeScenario} results={activeResults} onScenarioChange={(scenario) => updateScenario(activeScenario.id, scenario)} />}
          <section className="calculation-note">{activeResults.meetsDemand ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}<p><strong>Leitura do cenário:</strong> a capacidade considera tempo de ciclo, setup por lote, disponibilidade e quantidade de operadores. O lead time soma estoque em dias e tempo de processamento.</p></section>
        </div>
      </main>
      <div className="print-report"><PrintScenario project={data.project} scenario={data.current} results={currentResults} /><PrintScenario project={data.project} scenario={data.future} results={futureResults} /><section className="print-page print-comparison"><Comparison current={data.current} future={data.future} currentResults={currentResults} futureResults={futureResults} /></section></div>
    </div>
  );
}

export default App;
