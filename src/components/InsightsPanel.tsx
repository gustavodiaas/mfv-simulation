import { AlertTriangle, Scale, Wrench, ClipboardList, Box, Gauge, Clock, TrendingUp } from 'lucide-react';
import type { ProcessStep, SimulationResults, Recommendation } from '../types';

interface InsightsPanelProps {
  results: SimulationResults;
  steps: ProcessStep[];
  recommendations: Recommendation[];
  bottleneck: ProcessStep | undefined;
}

function formatTime(seconds: number): string {
  if (seconds === Infinity) return '∞';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}

function getRecIcon(icon: string) {
  const map: Record<string, React.ReactNode> = {
    scale: <Scale size={16} />,
    wrench: <Wrench size={16} />,
    clipboard: <ClipboardList size={16} />,
    box: <Box size={16} />,
    alert: <AlertTriangle size={16} />,
  };
  return map[icon] ?? <AlertTriangle size={16} />;
}

export default function InsightsPanel({
  results,
  steps,
  recommendations,
  bottleneck,
}: InsightsPanelProps) {
  const taktTime = results.taktTime;
  const bottleneckCT = bottleneck?.cycleTime ?? 0;
  const gap = bottleneckCT - taktTime;
  const reductionNeeded = gap > 0 ? (gap / bottleneckCT) * 100 : 0;
  const processSteps = steps.filter((s) => s.category !== 'supplier' && s.category !== 'customer');

  return (
    <div className="flex flex-col gap-4 overflow-y-auto h-full">
      {/* Line Status */}
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Gauge size={16} className="text-sky-400" />
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Status da Linha
          </h3>
        </div>
        <div className="space-y-2.5">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">Takt Time</span>
            <span className="text-sm font-mono font-bold text-sky-400">
              {formatTime(taktTime)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">Capacidade da Linha</span>
            <span className="text-sm font-mono font-bold text-slate-200">
              {results.lineCapacity.toFixed(0)} un/turno
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">Lead Time Total</span>
            <span className="text-sm font-mono font-bold text-slate-200">
              {formatTime(results.leadTime)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">Balanceamento</span>
            <span
              className={`text-sm font-mono font-bold ${
                results.lineBalance >= 0.8
                  ? 'text-emerald-400'
                  : results.lineBalance >= 0.6
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
            >
              {(results.lineBalance * 100).toFixed(0)}%
            </span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
            <span className="text-xs text-slate-400">Atende Demanda?</span>
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                results.meetsDemand
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-rose-500/15 text-rose-400'
              }`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  results.meetsDemand ? 'bg-emerald-400' : 'bg-rose-400'
                }`}
              />
              {results.meetsDemand ? 'Sim' : 'Não'}
            </div>
          </div>
        </div>
      </div>

      {/* Bottleneck Detail */}
      {bottleneck && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/15 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-amber-400" />
            <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
              Gargalo Atual
            </h3>
          </div>
          <div className="mb-3">
            <div className="text-lg font-bold text-slate-100">{bottleneck.name}</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Maior Tempo de Ciclo da linha
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400">TC do Gargalo</span>
              <span className="text-sm font-mono font-bold text-amber-400">
                {bottleneck.cycleTime.toFixed(0)}s
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400">vs. Takt Time</span>
              <span
                className={`text-sm font-mono font-bold ${
                  gap > 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {gap > 0 ? `+${gap.toFixed(1)}s` : `${gap.toFixed(1)}s`}
              </span>
            </div>
            {gap > 0 && (
              <div className="pt-2">
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>Redução necessária</span>
                  <span className="font-mono text-amber-400">
                    {reductionNeeded.toFixed(0)}%
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all duration-500"
                    style={{ width: `${Math.min(reductionNeeded, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cycle Time Ranking */}
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={16} className="text-slate-400" />
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Ranking de TC
          </h3>
        </div>
        <div className="space-y-2">
          {[...processSteps]
            .sort((a, b) => b.cycleTime - a.cycleTime)
            .map((step, idx) => {
              const maxCT = Math.max(...processSteps.map((s) => s.cycleTime), 1);
              const width = (step.cycleTime / maxCT) * 100;
              return (
                <div key={step.id} className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 w-20 truncate">{step.name}</span>
                  <div className="flex-1 h-4 rounded bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded transition-all duration-500 ${
                        idx === 0
                          ? 'bg-gradient-to-r from-amber-500/70 to-amber-400'
                          : 'bg-slate-600'
                      }`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <span
                    className={`text-xs font-mono font-semibold w-10 text-right ${
                      idx === 0 ? 'text-amber-400' : 'text-slate-400'
                    }`}
                  >
                    {step.cycleTime}s
                  </span>
                </div>
              );
            })}
        </div>
      </div>

      {/* Recommendations */}
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock size={16} className="text-emerald-400" />
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Recomendações Táticas
          </h3>
        </div>
        <div className="space-y-3">
          {recommendations.length === 0 ? (
            <p className="text-xs text-slate-500 py-2">Nenhuma recomendação no momento.</p>
          ) : (
            recommendations.map((rec, idx) => (
              <div
                key={idx}
                className="flex gap-3 p-3 rounded-lg bg-slate-800/40 border border-slate-700/40 hover:border-slate-600/60 transition-colors"
              >
                <div className="flex-shrink-0 text-emerald-400 mt-0.5">
                  {getRecIcon(rec.icon)}
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-200 mb-1">
                    {rec.title}
                  </div>
                  <div className="text-[11px] text-slate-400 leading-relaxed">
                    {rec.description}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
