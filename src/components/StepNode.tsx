import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { AlertTriangle, Package, Truck, User, Scissors, ClipboardCheck, Boxes } from 'lucide-react';
import type { ProcessStep, StepMetrics } from '../types';

interface StepNodeData {
  step: ProcessStep;
  metrics: StepMetrics;
  taktTime: number;
  onCycleTimeChange: (id: string, value: number) => void;
  onWipChange: (id: string, value: number) => void;
  onSetupTimeChange: (id: string, value: number) => void;
}

function getIcon(category: string) {
  switch (category) {
    case 'supplier':
      return <Truck size={16} />;
    case 'customer':
      return <User size={16} />;
    case 'shipping':
      return <Package size={16} />;
    case 'process':
      return <Scissors size={16} />;
    default:
      return <Boxes size={16} />;
  }
}

function StepNode({ data }: NodeProps<StepNodeData>) {
  const { step, metrics, taktTime, onCycleTimeChange, onWipChange, onSetupTimeChange } = data;
  const isBottleneck = metrics.isBottleneck;
  const isEndpoint = step.category === 'supplier' || step.category === 'customer';
  const isOverTakt = step.cycleTime > taktTime;

  return (
    <div
      className={`relative rounded-xl border-2 px-4 py-3 transition-all duration-500 ${
        isBottleneck
          ? 'border-amber-400 bg-amber-950/30 shadow-[0_0_24px_rgba(251,191,36,0.25)]'
          : isOverTakt
          ? 'border-rose-500/60 bg-rose-950/15'
          : 'border-slate-700 bg-slate-900/80'
      }`}
      style={{ width: 220 }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-slate-500 !border-slate-700"
      />

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`flex items-center justify-center w-7 h-7 rounded-lg ${
            isBottleneck
              ? 'bg-amber-500/20 text-amber-400'
              : 'bg-slate-700/50 text-slate-300'
          }`}
        >
          {step.name === 'Inspeção' ? <ClipboardCheck size={16} /> : getIcon(step.category)}
        </div>
        <span className="text-sm font-semibold text-slate-100">{step.name}</span>
        {isBottleneck && (
          <div className="ml-auto flex items-center gap-1 text-amber-400 text-[10px] font-bold uppercase tracking-wider">
            <AlertTriangle size={12} />
            Gargalo
          </div>
        )}
      </div>

      {isEndpoint ? (
        <div className="text-xs text-slate-400 py-2 text-center">
          {step.category === 'supplier' ? 'Matéria-prima' : 'Entrega final'}
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* Cycle Time Slider */}
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-slate-400">TC (Tempo de Ciclo)</span>
              <span
                className={`font-mono font-semibold ${
                  isOverTakt ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {step.cycleTime.toFixed(0)}s
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={120}
              step={1}
              value={step.cycleTime}
              onChange={(e) => onCycleTimeChange(step.id, Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-amber-400 bg-slate-700"
            />
          </div>

          {/* Setup Time Slider */}
          {step.setupTime > 0 && (
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-400">TRF (Setup)</span>
                <span className="font-mono font-semibold text-slate-300">
                  {step.setupTime.toFixed(0)}s
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1800}
                step={30}
                value={step.setupTime}
                onChange={(e) => onSetupTimeChange(step.id, Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-sky-400 bg-slate-700"
              />
            </div>
          )}

          {/* WIP Slider */}
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-slate-400">WIP (Estoque)</span>
              <span className="font-mono font-semibold text-slate-300">
                {step.wip} un
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={500}
              step={10}
              value={step.wip}
              onChange={(e) => onWipChange(step.id, Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-emerald-400 bg-slate-700"
            />
          </div>

          {/* Capacity indicator */}
          <div className="flex items-center justify-between pt-1.5 border-t border-slate-700/50">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Capacidade</span>
            <span
              className={`text-xs font-mono font-semibold ${
                metrics.capacity === Infinity
                  ? 'text-slate-500'
                  : metrics.capacity >= taktTime
                  ? 'text-emerald-400'
                  : 'text-rose-400'
              }`}
            >
              {metrics.capacity === Infinity
                ? '—'
                : `${metrics.capacity.toFixed(0)}/t`}
            </span>
          </div>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-slate-500 !border-slate-700"
      />
    </div>
  );
}

export default memo(StepNode);
