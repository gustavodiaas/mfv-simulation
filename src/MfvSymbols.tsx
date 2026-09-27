// Renderizadores SVG inline de cada símbolo MFV
// Cada um recebe (w, h, label, data, selected, onEdit)

import type { CanvasElement } from './canvas-types';

interface SymProps {
  el: CanvasElement;
  selected: boolean;
  onEdit: () => void;
}

/* ── utilitários ── */
function wrap(text: string, maxW: number, fontSize: number): string[] {
  // quebra em \n explícito primeiro, depois por espaço
  const lines: string[] = [];
  for (const part of text.split('\n')) {
    const words = part.split(' ');
    let cur = '';
    const charsPerLine = Math.floor(maxW / (fontSize * 0.55));
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > charsPerLine && cur) {
        lines.push(cur.trim());
        cur = w;
      } else {
        cur = (cur + ' ' + w).trim();
      }
    }
    if (cur) lines.push(cur.trim());
  }
  return lines;
}

function EditBtn({ onEdit }: { onEdit: () => void }) {
  return (
    <g className="edit-btn-group" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
      <rect x={-10} y={-10} width={22} height={22} rx={4} fill="white" stroke="#d0d0d8" strokeWidth={1} opacity={0.9} />
      <path d="M-3,3 L1,-1 M-3,3 L-4,4 M1,-1 L4,2 M-4,4 L-3,5 L-4,4 M-3,5 L0,4 L-3,5 M1,-1 C2,-2 3,-2 4,-1 C5,0 5,1 4,2" stroke="#0071e3" strokeWidth={1.2} fill="none" strokeLinecap="round" />
    </g>
  );
}

/* ── Processo ── */
export function ProcessSymbol({ el, selected, onEdit }: SymProps) {
  const w = 150; const h = 160;
  const d = el.data;
  const rows = [
    { k: 'Operadores', v: `${d.op ?? 1}` },
    { k: 'T/C', v: `${d.tc ?? 0} s` },
    { k: 'Setup', v: `${d.setup ?? 0} min` },
    { k: 'Lote', v: `${d.lote ?? 1}` },
    { k: 'Disponib.', v: `${d.disp ?? 100}%` },
    { k: 'WIP', v: `${d.wip ?? 0} un` },
  ];
  const titleLines = wrap(el.label || 'Processo', w - 24, 8);
  const titleH = Math.max(36, titleLines.length * 11 + 14);
  return (
    <g>
      <rect width={w} height={h} fill="white" stroke={selected ? '#0071e3' : '#7a8494'} strokeWidth={selected ? 2 : 1.5} />
      {/* cabeçalho verde */}
      <rect width={w} height={titleH} fill={selected ? '#c5e8ff' : '#bfefc0'} />
      {titleLines.map((ln, i) => (
        <text key={i} x={w / 2} y={14 + i * 11} textAnchor="middle" fontSize={8} fontWeight="700" fontFamily="Arial" fill="#1a2a1a">{ln}</text>
      ))}
      <line x1={0} y1={titleH} x2={w} y2={titleH} stroke="#7a8494" strokeWidth={1} />
      {rows.map((r, i) => (
        <g key={r.k}>
          <line x1={0} y1={titleH + 1 + (i + 1) * 17} x2={w} y2={titleH + 1 + (i + 1) * 17} stroke="#dde0e9" strokeWidth={0.8} />
          <text x={6} y={titleH + 12 + i * 17} fontSize={6.5} fontFamily="Arial" fill="#50575f" fontWeight="700" textAnchor="start">{r.k}</text>
          <text x={w - 6} y={titleH + 12 + i * 17} fontSize={7} fontFamily="Arial" fill="#1d2128" fontWeight="700" textAnchor="end">{r.v}</text>
        </g>
      ))}
      <g transform={`translate(${w - 4}, 4)`}><EditBtn onEdit={onEdit} /></g>
    </g>
  );
}

/* ── Fornecedor / Cliente (fábrica) ── */
export function PartySymbol({ el, selected, onEdit }: SymProps) {
  const w = 120; const h = 80;
  const isCustomer = el.kind === 'customer';
  const fill = isCustomer ? '#b8ccf5' : '#a8bcf0';
  const label = el.label || (isCustomer ? 'Cliente' : 'Fornecedor');
  const lines = wrap(label, w - 12, 9);
  return (
    <g>
      <rect width={w} height={h} fill={fill} stroke={selected ? '#0071e3' : '#6a80cc'} strokeWidth={selected ? 2 : 1.5} />
      {/* ícone fábrica simplificado */}
      <rect x={10} y={12} width={28} height={22} fill="none" stroke="#1a2560" strokeWidth={1.2} />
      <polygon points="10,12 24,4 38,12" fill="#1a2560" />
      <rect x={15} y={20} width={5} height={5} fill="#1a2560" />
      <rect x={24} y={20} width={5} height={5} fill="#1a2560" />
      <rect x={14} y={28} width={10} height={6} fill="white" />
      {/* chaminé */}
      <rect x={30} y={6} width={4} height={8} fill="#1a2560" />
      {lines.map((ln, i) => (
        <text key={i} x={w / 2 + 8} y={22 + i * 11} textAnchor="middle" fontSize={9} fontWeight="700" fontFamily="Arial" fill="#122060">{ln}</text>
      ))}
      {el.data.freq && <text x={w / 2} y={h - 6} textAnchor="middle" fontSize={6.5} fontFamily="Arial" fill="#384e8a">a cada {el.data.freq} dia(s)</text>}
      <g transform={`translate(${w - 4}, 4)`}><EditBtn onEdit={onEdit} /></g>
    </g>
  );
}

/* ── Caminhão ── */
export function TruckSymbol({ el, selected, onEdit }: SymProps) {
  const w = 90; const h = 50;
  return (
    <g>
      {/* carroceria */}
      <rect x={2} y={6} width={52} height={28} rx={1} fill="#8a9099" stroke={selected ? '#0071e3' : '#6a6e78'} strokeWidth={selected ? 2 : 1} />
      {/* cabine */}
      <rect x={54} y={10} width={30} height={24} rx={2} fill="#5d6470" stroke={selected ? '#0071e3' : '#6a6e78'} strokeWidth={selected ? 2 : 1} />
      {/* janela */}
      <rect x={57} y={13} width={12} height={9} rx={1} fill="#a8d4f5" />
      {/* rodas */}
      <circle cx={18} cy={38} r={6} fill="#2c2f35" /><circle cx={18} cy={38} r={3} fill="#555" />
      <circle cx={68} cy={38} r={6} fill="#2c2f35" /><circle cx={68} cy={38} r={3} fill="#555" />
      {el.label && <text x={28} y={24} textAnchor="middle" fontSize={6.5} fontFamily="Arial" fill="white" fontWeight="700">{el.label}</text>}
      <g transform={`translate(${w - 6}, 2)`}><EditBtn onEdit={onEdit} /></g>
    </g>
  );
}

/* ── Estoque (triângulo) ── */
export function InventorySymbol({ el, selected, onEdit }: SymProps) {
  const w = 60; const h = 60;
  return (
    <g>
      <polygon points={`${w / 2},4 ${w - 4},${h - 20} 4,${h - 20}`} fill="#f0ce40" stroke={selected ? '#0071e3' : '#b89020'} strokeWidth={selected ? 2 : 1.5} />
      <text x={w / 2} y={h - 22} textAnchor="middle" fontSize={7.5} fontFamily="Arial" fontWeight="700" fill="#363b43">{el.data.qty ?? 0}</text>
      <text x={w / 2} y={h - 8} textAnchor="middle" fontSize={6} fontFamily="Arial" fill="#636b73">{el.data.dias ?? 0} dias</text>
      <g transform={`translate(${w - 4}, 2)`}><EditBtn onEdit={onEdit} /></g>
    </g>
  );
}

/* ── Supermercado ── */
export function SupermarketSymbol({ el, selected, onEdit }: SymProps) {
  const w = 80; const h = 70;
  return (
    <g>
      <rect x={2} y={2} width={w - 4} height={h - 22} fill="none" stroke={selected ? '#0071e3' : '#2c5fa8'} strokeWidth={selected ? 2 : 1.5} />
      <line x1={2} y1={18} x2={w - 4} y2={18} stroke="#2c5fa8" strokeWidth={1} />
      <line x1={2} y1={32} x2={w - 4} y2={32} stroke="#2c5fa8" strokeWidth={1} />
      {[8, 22, 36].map((x) => [5, 19, 33].map((y) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={8} height={8} fill="#a8c4f0" stroke="#2c5fa8" strokeWidth={0.5} rx={0.5} />
      )))}
      {el.data.qty !== undefined && <text x={w / 2} y={h - 6} textAnchor="middle" fontSize={7} fontFamily="Arial" fontWeight="700" fill="#1a3a80">{el.data.qty} un</text>}
      <g transform={`translate(${w - 4}, 2)`}><EditBtn onEdit={onEdit} /></g>
    </g>
  );
}

/* ── FIFO ── */
export function FifoSymbol({ el, selected, onEdit }: SymProps) {
  const w = 100; const h = 50;
  return (
    <g>
      <rect x={1} y={10} width={w - 2} height={26} fill="none" stroke={selected ? '#0071e3' : '#555'} strokeWidth={selected ? 2 : 1.5} />
      <text x={w / 2} y={25} textAnchor="middle" fontSize={8} fontWeight="700" fontFamily="Arial" fill="#333">FIFO</text>
      <polygon points={`${w - 16},10 ${w - 2},23 ${w - 16},36`} fill={selected ? '#0071e3' : '#555'} />
      {el.data.qty !== undefined && Number(el.data.qty) > 0 && <text x={w / 2 - 10} y={42} textAnchor="middle" fontSize={6} fontFamily="Arial" fill="#636b73">{el.data.qty} un</text>}
      <g transform={`translate(${w - 4}, 2)`}><EditBtn onEdit={onEdit} /></g>
    </g>
  );
}

/* ── Controle de produção ── */
export function PlanningSymbol({ el, selected, onEdit }: SymProps) {
  const w = 160; const h = 110;
  const lines = wrap(el.label || 'Controle da\nProdução', w - 20, 8);
  return (
    <g>
      <rect width={w} height={h} fill="white" stroke={selected ? '#0071e3' : '#8a93a8'} strokeWidth={selected ? 2 : 1.5} />
      <rect width={w} height={28} fill="#a8bcf0" />
      <line x1={0} y1={28} x2={w} y2={28} stroke="#8a93a8" strokeWidth={1} />
      {lines.map((ln, i) => (
        <text key={i} x={w / 2} y={13 + i * 11} textAnchor="middle" fontSize={8} fontWeight="700" fontFamily="Arial" fill="#122060">{ln}</text>
      ))}
      {[
        { k: 'Demanda', v: `${el.data.demanda ?? '—'} un/mês` },
        { k: 'Takt time', v: `${el.data.takt ?? '—'} s` },
      ].map((r, i) => (
        <g key={r.k}>
          <line x1={0} y1={28 + (i + 1) * 22} x2={w} y2={28 + (i + 1) * 22} stroke="#dde0e9" strokeWidth={0.8} />
          <text x={6} y={28 + 15 + i * 22} fontSize={7} fontFamily="Arial" fill="#50575f" fontWeight="700">{r.k}</text>
          <text x={w - 6} y={28 + 15 + i * 22} fontSize={7} fontFamily="Arial" fill="#1d2128" fontWeight="700" textAnchor="end">{r.v}</text>
        </g>
      ))}
      <g transform={`translate(${w - 4}, 4)`}><EditBtn onEdit={onEdit} /></g>
    </g>
  );
}

/* ── Kaizen burst ── */
export function KaizenSymbol({ el, selected, onEdit }: SymProps) {
  const r = 35;
  const pts = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const rad = i % 2 === 0 ? r : r * 0.65;
    return `${r + 4 + rad * Math.cos(a)},${r + 4 + rad * Math.sin(a)}`;
  }).join(' ');
  const lines = wrap(el.label || 'Kaizen', 52, 7);
  return (
    <g>
      <polygon points={pts} fill="#ffe04b" stroke={selected ? '#0071e3' : '#b8930f'} strokeWidth={selected ? 2 : 1} />
      {lines.map((ln, i) => (
        <text key={i} x={r + 4} y={r + 2 + (i - (lines.length - 1) / 2) * 10} textAnchor="middle" fontSize={7} fontWeight="800" fontFamily="Arial" fill="#6b4c00">{ln}</text>
      ))}
      <g transform={`translate(${r * 2 + 2}, 2)`}><EditBtn onEdit={onEdit} /></g>
    </g>
  );
}

/* ── Linha do tempo ── */
export function TimelineSymbol({ el, selected, onEdit }: SymProps) {
  const w = 400; const h = 60;
  return (
    <g>
      <rect width={w} height={h} fill="#f8f9fc" stroke={selected ? '#0071e3' : '#9aa0ae'} strokeWidth={selected ? 2 : 1.5} strokeDasharray={selected ? '0' : '4 3'} />
      <text x={10} y={18} fontSize={8} fontWeight="700" fontFamily="Arial" fill="#363b43">Lead time total: <tspan fill="#0d3d8c">{el.data.leadtime ?? 0} dias</tspan></text>
      <text x={10} y={34} fontSize={8} fontWeight="700" fontFamily="Arial" fill="#363b43">Tempo de processo: <tspan fill="#0d3d8c">{el.data.tprocess ?? 0} min</tspan></text>
      <text x={10} y={50} fontSize={7} fontFamily="Arial" fill="#636b73">{el.label}</text>
      <g transform={`translate(${w - 4}, 4)`}><EditBtn onEdit={onEdit} /></g>
    </g>
  );
}
