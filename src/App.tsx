import { useCallback, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  type Edge,
  type Node,
  type NodeTypes,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { RotateCcw, Users, Clock4, Zap, Activity } from 'lucide-react';
import StepNode from './components/StepNode';
import InsightsPanel from './components/InsightsPanel';
import {
  DEFAULT_STEPS,
  DEFAULT_DEMAND,
  DEFAULT_AVAILABLE_TIME,
  simulate,
  getRecommendations,
} from './simulation';
import type { ProcessStep } from './types';

const nodeTypes: NodeTypes = { stepNode: StepNode };

const nodePositions: Record<string, { x: number; y: number }> = {
  supplier: { x: 0, y: 200 },
  cutting: { x: 320, y: 200 },
  assembly: { x: 640, y: 200 },
  inspection: { x: 960, y: 200 },
  shipping: { x: 1280, y: 200 },
  customer: { x: 1600, y: 200 },
};

function formatTime(seconds: number): string {
  if (seconds === Infinity) return '∞';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}

function formatAvailableTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function App() {
  const [steps, setSteps] = useState<ProcessStep[]>(DEFAULT_STEPS);
  const [customerDemand, setCustomerDemand] = useState(DEFAULT_DEMAND);
  const [availableTime, setAvailableTime] = useState(DEFAULT_AVAILABLE_TIME);

  const results = useMemo(
    () => simulate(steps, customerDemand, availableTime),
    [steps, customerDemand, availableTime]
  );

  const bottleneck = useMemo(
    () => steps.find((s) => s.id === results.bottleneckId),
    [steps, results.bottleneckId]
  );

  const recommendations = useMemo(
    () => getRecommendations(bottleneck, results),
    [bottleneck, results]
  );

  const handleCycleTimeChange = useCallback((id: string, value: number) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, cycleTime: value } : s))
    );
  }, []);

  const handleWipChange = useCallback((id: string, value: number) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, wip: value } : s))
    );
  }, []);

  const handleSetupTimeChange = useCallback((id: string, value: number) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, setupTime: value } : s))
    );
  }, []);

  const handleReset = useCallback(() => {
    setSteps(DEFAULT_STEPS);
    setCustomerDemand(DEFAULT_DEMAND);
    setAvailableTime(DEFAULT_AVAILABLE_TIME);
  }, []);

  const nodes: Node[] = useMemo(
    () =>
      steps.map((step) => ({
        id: step.id,
        type: 'stepNode',
        position: nodePositions[step.id] ?? { x: 0, y: 0 },
        data: {
          step,
          metrics: results.stepMetrics[step.id],
          taktTime: results.taktTime,
          onCycleTimeChange: handleCycleTimeChange,
          onWipChange: handleWipChange,
          onSetupTimeChange: handleSetupTimeChange,
        },
        draggable: false,
        targetPosition: Position.Left,
        sourcePosition: Position.Right,
      })),
    [steps, results, handleCycleTimeChange, handleWipChange, handleSetupTimeChange]
  );

  const edges: Edge[] = useMemo(() => {
    const edgeList: Edge[] = [];
    for (let i = 0; i < steps.length - 1; i++) {
      const source = steps[i];
      const target = steps[i + 1];
      const wip = target.wip;
      const isBottleneckEdge =
        source.id === results.bottleneckId || target.id === results.bottleneckId;

      edgeList.push({
        id: `e-${source.id}-${target.id}`,
        source: source.id,
        target: target.id,
        type: 'smoothstep',
        animated: isBottleneckEdge,
        style: {
          stroke: isBottleneckEdge ? '#f59e0b' : '#475569',
          strokeWidth: wip > 200 ? 4 : wip > 100 ? 3 : 2,
          opacity: 0.8,
        },
      });
    }
    return edgeList;
  }, [steps, results.bottleneckId]);

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Bar */}
      <header className="flex-shrink-0 border-b border-slate-800 bg-slate-900/60 backdrop-blur-md px-6 py-3">
        <div className="flex items-center gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 shadow-lg shadow-amber-500/20">
              <Activity size={20} className="text-slate-950" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight">Simulador MFV</h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                Mapeamento de Fluxo de Valor
              </p>
            </div>
          </div>

          {/* Global Controls */}
          <div className="flex items-center gap-6 ml-4">
            {/* Customer Demand */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase tracking-wider">
                <Users size={12} />
                Demanda
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={50}
                  max={1000}
                  step={50}
                  value={customerDemand}
                  onChange={(e) => setCustomerDemand(Number(e.target.value))}
                  className="w-32 h-1.5 rounded-full appearance-none cursor-pointer accent-sky-400 bg-slate-700"
                />
                <span className="text-sm font-mono font-bold text-sky-400 w-16">
                  {customerDemand} un
                </span>
              </div>
            </div>

            {/* Available Time */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase tracking-wider">
                <Clock4 size={12} />
                Tempo Disponível
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={14400}
                  max={43200}
                  step={1800}
                  value={availableTime}
                  onChange={(e) => setAvailableTime(Number(e.target.value))}
                  className="w-32 h-1.5 rounded-full appearance-none cursor-pointer accent-sky-400 bg-slate-700"
                />
                <span className="text-sm font-mono font-bold text-sky-400 w-16">
                  {formatAvailableTime(availableTime)}
                </span>
              </div>
            </div>

            {/* Takt Time Display */}
            <div className="flex flex-col gap-1 px-4 py-2 rounded-xl bg-slate-800/50 border border-slate-700/50">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase tracking-wider">
                <Zap size={12} className="text-amber-400" />
                Takt Time
              </div>
              <span className="text-lg font-mono font-bold text-amber-400">
                {formatTime(results.taktTime)}
              </span>
            </div>
          </div>

          {/* Reset */}
          <button
            onClick={handleReset}
            className="ml-auto flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors border border-slate-700/50 hover:border-slate-600"
          >
            <RotateCcw size={14} />
            Resetar
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Flow Canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            panOnDrag={false}
            zoomOnScroll={true}
            zoomOnDoubleClick={false}
            panOnScroll={false}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#1e293b" gap={24} size={1.5} />
            <Controls
              showInteractive={false}
              className="!bg-slate-800/80 !border-slate-700 !rounded-lg [&_button]:!bg-slate-800 [&_button]:!border-slate-700 [&_button]:!text-slate-400 [&_button:hover]:!bg-slate-700"
            />
          </ReactFlow>
        </div>

        {/* Insights Panel */}
        <aside className="w-[340px] flex-shrink-0 border-l border-slate-800 bg-slate-900/40 p-4 overflow-hidden">
          <InsightsPanel
            results={results}
            steps={steps}
            recommendations={recommendations}
            bottleneck={bottleneck}
          />
        </aside>
      </div>
    </div>
  );
}

export default App;
