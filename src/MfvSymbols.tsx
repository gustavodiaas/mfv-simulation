import type { CanvasElement } from './canvas-types';
import truckThreeQuarter from './assets/truck-three-quarter.png';

interface SymProps {
  el: CanvasElement;
  selected: boolean;
  onEdit: () => void;
  taktTimeSec?: number;
  dailyDemand?: number;
  availableMinutesPerDay?: number;
  leadTimeDays?: number;
  processingTimeMin?: number;
  timelineSteps?: {
    inventoryDays: number;
    processTimeMin: number;
    inventoryWidth?: number;
    processWidth?: number;
  }[];
}

function sel(selected: boolean, base: string) { return selected ? '#0071e3' : base; }
function selW(selected: boolean) { return selected ? 2.5 : 1.5; }

function EditBtn({ onEdit, x = 0, y = 0 }: { onEdit: () => void; x?: number; y?: number }) {
  return (
    <g className="edit-btn-group" transform={`translate(${x},${y})`}
      onClick={(e) => { e.stopPropagation(); onEdit(); }} style={{ cursor: 'pointer' }}>
      <rect x={-11} y={-11} width={22} height={22} rx={5} fill="white" stroke="#d0d0d8" strokeWidth={1} opacity={0.95} />
      <path d="M-4,4 L0,0 M-4,4 L-5,5 M0,0 L3,3 M-5,5 L-4,6 L-5,5 M-4,6 L-1,5 M0,0 C1,-1 2,-1 3,0 C4,1 4,2 3,3"
        stroke="#0071e3" strokeWidth={1.3} fill="none" strokeLinecap="round" />
    </g>
  );
}

function SelectionRect({ w, h }: { w: number; h: number }) {
  return <rect className="selection-rect" x={-2} y={-2} width={w + 4} height={h + 4} rx={4}
    fill="none" stroke="#0071e3" strokeWidth={2} strokeDasharray="4 2" opacity={0.7} />;
}

// ── Processo ─────────────────────────────────────────────────────────────────
export function ProcessSymbol({ el, selected, onEdit, taktTimeSec = 0, availableMinutesPerDay = 0 }: SymProps) {
  const w = 150; const h = 160;
  const cycleTime = Math.max(0, Number(el.data.tc) || 0);
  const setupPerUnit = (Math.max(0, Number(el.data.setup) || 0) * 60) / Math.max(1, Number(el.data.lote) || 1);
  const availability = Math.min(100, Math.max(1, Number(el.data.disp) || 100)) / 100;
  const resources = Math.max(1, Number(el.data.recurso) || 1);
  const effectiveCycle = (cycleTime + setupPerUnit) / (resources * availability);
  const loadPercent = taktTimeSec > 0 ? (effectiveCycle / taktTimeSec) * 100 : 0;
  const valid = cycleTime > 0;
  const overloaded = valid && loadPercent > 100;
  const capacityPerDay = effectiveCycle > 0 ? (availableMinutesPerDay * 60) / effectiveCycle : 0;
  const rows = [
    { k: 'Nº operador', v: `${el.data.op ?? 1}` },
    { k: 'T/C', v: `${el.data.tc ?? 0} s` },
    { k: 'Setup', v: `${el.data.setup ?? 0} min` },
    { k: 'Recurso', v: `${el.data.recurso ?? 1}` },
    { k: 'Disponib.', v: `${el.data.disp ?? 100}%` },
    { k: 'Capacidade', v: effectiveCycle > 0 ? `${capacityPerDay.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/dia` : '—' },
  ];
  const label = el.label || 'Processo';
  return (
    <g>
      {selected && <SelectionRect w={w} h={h} />}
      {taktTimeSec > 0 && <g transform="translate(4,-19)">
        <rect width={92} height={16} rx={8} fill={!valid ? '#fff2cf' : overloaded ? '#ffe2df' : '#dcf6e7'} stroke={!valid ? '#d79a18' : overloaded ? '#ff3b30' : '#1f9d5a'} strokeWidth={0.8} />
        <circle cx={9} cy={8} r={3} fill={!valid ? '#d79a18' : overloaded ? '#ff3b30' : '#1f9d5a'} />
        <text x={17} y={11} fontSize={7} fontWeight="700" fontFamily="Arial" fill={!valid ? '#815a08' : overloaded ? '#a51f18' : '#126b3b'}>
          {!valid ? 'SEM TEMPO DE CICLO' : overloaded ? 'SOBRECARREGADO' : `CARGA ${loadPercent.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`}
        </text>
      </g>}
      <rect width={w} height={h} fill="white" stroke={selected ? '#0071e3' : overloaded ? '#ff3b30' : '#7a8494'} strokeWidth={selected || overloaded ? 2.5 : 1.5} />
      <rect width={w} height={38} fill={selected ? '#d6eeff' : overloaded ? '#ffd5d1' : '#bfefc0'} />
      <line x1={0} y1={38} x2={w} y2={38} stroke="#9aa0ae" strokeWidth={1} />
      <text x={w/2} y={16} textAnchor="middle" fontSize={8.5} fontWeight="700" fontFamily="Arial" fill="#1a2a1a">{label.split('\n')[0]}</text>
      {label.split('\n')[1] && <text x={w/2} y={28} textAnchor="middle" fontSize={8} fontFamily="Arial" fill="#1a2a1a">{label.split('\n')[1]}</text>}
      {rows.map((r, i) => (
        <g key={r.k}>
          {i > 0 && <line x1={0} y1={38 + i * 20} x2={w} y2={38 + i * 20} stroke="#dde0e9" strokeWidth={0.8} />}
          <text x={6} y={38 + 14 + i * 20} fontSize={6.5} fontFamily="Arial" fill="#50575f" fontWeight="700">{r.k}</text>
          <text x={w-6} y={38 + 14 + i * 20} fontSize={7} fontFamily="Arial" fill="#1d2128" fontWeight="700" textAnchor="end">{r.v}</text>
        </g>
      ))}
      <EditBtn onEdit={onEdit} x={w - 2} y={2} />
    </g>
  );
}

// ── Célula de trabalho (U-shape) ──────────────────────────────────────────────
export function WorkCellSymbol({ el, selected, onEdit }: SymProps) {
  const w = 160; const h = 100;
  return (
    <g>
      {selected && <SelectionRect w={w} h={h} />}
      <path d={`M 10,8 L ${w-10},8 L ${w-10},${h-20} Q ${w-10},${h-8} ${w-22},${h-8} L 22,${h-8} Q 10,${h-8} 10,${h-20} Z`}
        fill={selected ? '#d6eeff' : '#e8f4e8'} stroke={sel(selected,'#4a8050')} strokeWidth={selW(selected)} />
      <text x={w/2} y={32} textAnchor="middle" fontSize={9} fontWeight="700" fontFamily="Arial" fill="#1a3a1a">{el.label || 'Célula'}</text>
      <text x={w/2} y={48} textAnchor="middle" fontSize={7.5} fontFamily="Arial" fill="#2a5a2a">{el.data.op ?? 1} operador(es)</text>
      {/* mini boneco */}
      <circle cx={w/2} cy={66} r={6} fill="none" stroke="#4a8050" strokeWidth={1.5} />
      <line x1={w/2} y1={72} x2={w/2} y2={84} stroke="#4a8050" strokeWidth={1.5} />
      <line x1={w/2-8} y1={76} x2={w/2+8} y2={76} stroke="#4a8050" strokeWidth={1.5} />
      <EditBtn onEdit={onEdit} x={w-2} y={2} />
    </g>
  );
}

// ── Fornecedor / Cliente ──────────────────────────────────────────────────────
export function PartySymbol({ el, selected, onEdit }: SymProps) {
  const w = 120; const h = 80;
  const isC = el.kind === 'customer';
  const fill = isC ? '#b8ccf5' : '#a8bcf0';
  const label = el.label || (isC ? 'Cliente' : 'Fornecedor');
  return (
    <g>
      {selected && <SelectionRect w={w} h={h} />}
      <rect width={w} height={h} fill={fill} stroke={sel(selected,'#6a80cc')} strokeWidth={selW(selected)} />
      {/* fábrica */}
      <rect x={8} y={10} width={28} height={22} fill="none" stroke="#1a2560" strokeWidth={1.2} />
      <polygon points="8,10 22,3 36,10" fill="#1a2560" />
      <rect x={13} y={19} width={5} height={5} fill="#1a2560" />
      <rect x={22} y={19} width={5} height={5} fill="#1a2560" />
      <rect x={12} y={26} width={10} height={6} fill="white" />
      <rect x={30} y={4} width={4} height={8} fill="#1a2560" />
      <text x={w/2+8} y={22} textAnchor="middle" fontSize={8.5} fontWeight="700" fontFamily="Arial" fill="#122060">{label.split('\n')[0]}</text>
      {label.split('\n')[1] && <text x={w/2+8} y={33} textAnchor="middle" fontSize={7.5} fontFamily="Arial" fill="#122060">{label.split('\n')[1]}</text>}
      {el.data.freq && <text x={w/2} y={h-6} textAnchor="middle" fontSize={6.5} fontFamily="Arial" fill="#384e8a">a cada {el.data.freq} dia(s)</text>}
      <EditBtn onEdit={onEdit} x={w-2} y={2} />
    </g>
  );
}

// ── Caminhão ──────────────────────────────────────────────────────────────────
export function TruckSymbol({ el, selected, onEdit }: SymProps) {
  const w = 210; const h = 130;
  const color = String(el.data.color ?? '#eee9df');
  const filterId = `truck-tint-${el.id}`;
  return (
    <g>
      {selected && <SelectionRect w={w} h={h} />}
      <defs>
        <filter id={filterId} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
          <feFlood floodColor={color} floodOpacity={0.72} result="tint" />
          <feComposite in="tint" in2="SourceGraphic" operator="in" result="tintedShape" />
          <feBlend in="SourceGraphic" in2="tintedShape" mode="multiply" />
        </filter>
      </defs>
      <image href={truckThreeQuarter} x={2} y={2} width={206} height={108} preserveAspectRatio="xMidYMid meet" filter={`url(#${filterId})`} />
      {el.label && <text x={w/2} y={120} textAnchor="middle" fontSize={8} fontFamily="Arial" fill="#34383e" fontWeight="700">{el.label}</text>}
      {el.data.freq && <text x={w/2} y={129} textAnchor="middle" fontSize={6.5} fontFamily="Arial" fill="#6b7178">a cada {el.data.freq} dia(s)</text>}
      <EditBtn onEdit={onEdit} x={w-2} y={5} />
    </g>
  );
}

// ── Ponto de expedição ────────────────────────────────────────────────────────
export function ShippingPointSymbol({ el, selected, onEdit }: SymProps) {
  const w = 100; const h = 70;
  return (
    <g>
      {selected && <SelectionRect w={w} h={h} />}
      <rect width={w} height={h} rx={4} fill={selected ? '#d6eeff' : '#e8f0ff'} stroke={sel(selected,'#4a6ab0')} strokeWidth={selW(selected)} />
      {/* ícone caixa */}
      <rect x={30} y={10} width={40} height={30} fill="none" stroke="#2a4a90" strokeWidth={1.5} />
      <line x1={30} y1={22} x2={70} y2={22} stroke="#2a4a90" strokeWidth={1} />
      <polygon points="50,10 60,16 60,22 50,28 40,22 40,16" fill="#a8bcf0" stroke="#2a4a90" strokeWidth={0.8} />
      <text x={w/2} y={h-8} textAnchor="middle" fontSize={8} fontWeight="700" fontFamily="Arial" fill="#2a4090">{el.label || 'Expedição'}</text>
      <EditBtn onEdit={onEdit} x={w-2} y={2} />
    </g>
  );
}

// ── Estoque ───────────────────────────────────────────────────────────────────
export function InventorySymbol({ el, selected, onEdit, dailyDemand = 0 }: SymProps) {
  const w = 60; const h = 60;
  const inventoryDays = dailyDemand > 0 ? Number(el.data.qty ?? 0) / dailyDemand : 0;
  return (
    <g>
      {selected && <SelectionRect w={w} h={h} />}
      <polygon points={`${w/2},4 ${w-4},${h-18} 4,${h-18}`} fill={selected ? '#ffeaa0' : '#f0ce40'} stroke={sel(selected,'#b89020')} strokeWidth={selW(selected)} />
      <text x={w/2} y={h-22} textAnchor="middle" fontSize={8} fontFamily="Arial" fontWeight="700" fill="#363b43">{el.data.qty ?? 0}</text>
      <text x={w/2} y={h-8} textAnchor="middle" fontSize={6} fontFamily="Arial" fill="#636b73">{inventoryDays.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} dias</text>
      <EditBtn onEdit={onEdit} x={w-2} y={2} />
    </g>
  );
}

// ── Buffer ────────────────────────────────────────────────────────────────────
export function BufferSymbol({ el, selected, onEdit }: SymProps) {
  const w = 80; const h = 60;
  return (
    <g>
      {selected && <SelectionRect w={w} h={h} />}
      <rect width={w} height={h} rx={3} fill={selected ? '#ffe8b0' : '#fff3cc'} stroke={sel(selected,'#cc8800')} strokeWidth={selW(selected)} strokeDasharray="5 3" />
      <text x={w/2} y={22} textAnchor="middle" fontSize={14} fontWeight="900" fontFamily="Arial" fill="#cc8800">B</text>
      <text x={w/2} y={38} textAnchor="middle" fontSize={7} fontFamily="Arial" fontWeight="700" fill="#664400">{el.label || 'Buffer'}</text>
      {el.data.qty !== undefined && Number(el.data.qty) > 0 &&
        <text x={w/2} y={52} textAnchor="middle" fontSize={6.5} fontFamily="Arial" fill="#886600">{el.data.qty} un</text>}
      <EditBtn onEdit={onEdit} x={w-2} y={2} />
    </g>
  );
}

// ── Supermercado ──────────────────────────────────────────────────────────────
export function SupermarketSymbol({ el, selected, onEdit }: SymProps) {
  const w = 80; const h = 70;
  return (
    <g>
      {selected && <SelectionRect w={w} h={h} />}
      <rect x={2} y={2} width={w-4} height={h-24} fill="none" stroke={sel(selected,'#2c5fa8')} strokeWidth={selW(selected)} />
      <line x1={2} y1={18} x2={w-4} y2={18} stroke="#2c5fa8" strokeWidth={1} />
      <line x1={2} y1={32} x2={w-4} y2={32} stroke="#2c5fa8" strokeWidth={1} />
      {[8,22,36].map((x)=>[5,19,33].map((y)=>
        <rect key={`${x}-${y}`} x={x} y={y} width={8} height={8} fill={selected?'#b0d4ff':'#a8c4f0'} stroke="#2c5fa8" strokeWidth={0.5} rx={0.5}/>
      ))}
      {el.data.qty !== undefined && <text x={w/2} y={h-8} textAnchor="middle" fontSize={7} fontFamily="Arial" fontWeight="700" fill="#1a3a80">{el.data.qty} un</text>}
      <EditBtn onEdit={onEdit} x={w-2} y={2} />
    </g>
  );
}

// ── FIFO ──────────────────────────────────────────────────────────────────────
export function FifoSymbol({ selected, onEdit }: SymProps) {
  const w = 100; const h = 50;
  return (
    <g>
      {selected && <SelectionRect w={w} h={h} />}
      <rect x={1} y={10} width={w-2} height={26} fill={selected?'#d6eeff':'white'} stroke={sel(selected,'#555')} strokeWidth={selW(selected)} />
      <text x={w/2-8} y={25} textAnchor="middle" fontSize={8} fontWeight="700" fontFamily="Arial" fill="#333">FIFO</text>
      <polygon points={`${w-16},10 ${w-2},23 ${w-16},36`} fill={sel(selected,'#555')} />
      <EditBtn onEdit={onEdit} x={w-2} y={2} />
    </g>
  );
}

// ── Kanban de produção (cartão laranja) ───────────────────────────────────────
export function KanbanProductionSymbol({ el, selected, onEdit }: SymProps) {
  const w = 60; const h = 44;
  return (
    <g>
      {selected && <SelectionRect w={w} h={h} />}
      <rect width={w} height={h} rx={3} fill={selected?'#ffd088':'#ff9500'} stroke={sel(selected,'#cc6600')} strokeWidth={selW(selected)} />
      <rect x={4} y={4} width={w-8} height={h-8} rx={2} fill="rgba(255,255,255,0.25)" />
      <text x={w/2} y={16} textAnchor="middle" fontSize={6} fontWeight="800" fontFamily="Arial" fill="white">KANBAN</text>
      <text x={w/2} y={26} textAnchor="middle" fontSize={6} fontWeight="700" fontFamily="Arial" fill="white">PRODUÇÃO</text>
      {el.data.qty !== undefined && Number(el.data.qty) > 0 &&
        <text x={w/2} y={38} textAnchor="middle" fontSize={7} fontFamily="Arial" fill="white" fontWeight="700">{el.data.qty} un</text>}
      <EditBtn onEdit={onEdit} x={w-2} y={2} />
    </g>
  );
}

// ── Kanban de retirada (cartão verde) ─────────────────────────────────────────
export function KanbanWithdrawalSymbol({ el, selected, onEdit }: SymProps) {
  const w = 60; const h = 44;
  return (
    <g>
      {selected && <SelectionRect w={w} h={h} />}
      <rect width={w} height={h} rx={3} fill={selected?'#88dd88':'#30a830'} stroke={sel(selected,'#1a7a1a')} strokeWidth={selW(selected)} />
      <rect x={4} y={4} width={w-8} height={h-8} rx={2} fill="rgba(255,255,255,0.25)" />
      <text x={w/2} y={16} textAnchor="middle" fontSize={6} fontWeight="800" fontFamily="Arial" fill="white">KANBAN</text>
      <text x={w/2} y={26} textAnchor="middle" fontSize={6} fontWeight="700" fontFamily="Arial" fill="white">RETIRADA</text>
      {el.data.qty !== undefined && Number(el.data.qty) > 0 &&
        <text x={w/2} y={38} textAnchor="middle" fontSize={7} fontFamily="Arial" fill="white" fontWeight="700">{el.data.qty} un</text>}
      <EditBtn onEdit={onEdit} x={w-2} y={2} />
    </g>
  );
}

// ── Quadro Kanban ─────────────────────────────────────────────────────────────
export function KanbanBoardSymbol({ el, selected, onEdit }: SymProps) {
  const w = 120; const h = 100;
  const cols = Math.max(1, Number(el.data.cols) || 3);
  const rows = Math.max(1, Number(el.data.rows) || 3);
  const cw = (w - 10) / cols; const rh = (h - 22) / rows;
  return (
    <g>
      {selected && <SelectionRect w={w} h={h} />}
      <rect width={w} height={h} rx={3} fill={selected?'#d6eeff':'#f0f4ff'} stroke={sel(selected,'#4a6ab0')} strokeWidth={selW(selected)} />
      <rect width={w} height={18} rx={3} fill={selected?'#90b8e8':'#4a6ab0'} />
      <text x={w/2} y={12} textAnchor="middle" fontSize={7.5} fontWeight="700" fontFamily="Arial" fill="white">{el.label || 'Quadro Kanban'}</text>
      {Array.from({length: rows}, (_,r) => Array.from({length: cols}, (_,c) => (
        <rect key={`${r}-${c}`} x={5 + c*cw} y={20 + r*rh} width={cw-2} height={rh-2} rx={1}
          fill={Math.random() > 0.5 ? '#ff9500' : 'white'} stroke="#8090c0" strokeWidth={0.7} />
      )))}
      <EditBtn onEdit={onEdit} x={w-2} y={2} />
    </g>
  );
}

// ── Heijunka box ──────────────────────────────────────────────────────────────
export function HeijunkaSymbol({ el, selected, onEdit }: SymProps) {
  const w = 140; const h = 80;
  const cols = Math.max(1, Number(el.data.cols) || 5);
  const rows = Math.max(1, Number(el.data.rows) || 2);
  const cw = (w - 10) / cols; const rh = (h - 22) / rows;
  const colors = ['#ff9500','#30a830','#0071e3','#ff3b30','#5856d6'];
  return (
    <g>
      {selected && <SelectionRect w={w} h={h} />}
      <rect width={w} height={h} rx={3} fill={selected?'#ffe8b0':'#fffbe8'} stroke={sel(selected,'#cc8800')} strokeWidth={selW(selected)} />
      <rect width={w} height={18} rx={3} fill={selected?'#ffcc44':'#cc8800'} />
      <text x={w/2} y={12} textAnchor="middle" fontSize={7.5} fontWeight="700" fontFamily="Arial" fill="white">{el.label || 'Heijunka'}</text>
      {Array.from({length: rows}, (_,r) => Array.from({length: cols}, (_,c) => (
        <rect key={`${r}-${c}`} x={5 + c*cw} y={20 + r*rh} width={cw-2} height={rh-2} rx={1}
          fill={r === 0 ? colors[c % colors.length] : 'white'} stroke="#cc8800" strokeWidth={0.7} />
      )))}
      <EditBtn onEdit={onEdit} x={w-2} y={2} />
    </g>
  );
}

// ── Caixa de sequenciamento ───────────────────────────────────────────────────
export function SequencingBoxSymbol({ el, selected, onEdit }: SymProps) {
  const w = 120; const h = 60;
  const slots = Math.max(1, Number(el.data.slots) || 6);
  const sw = (w - 10) / slots;
  return (
    <g>
      {selected && <SelectionRect w={w} h={h} />}
      <rect width={w} height={h} rx={3} fill={selected?'#e8d8ff':'#f5eeff'} stroke={sel(selected,'#6040b0')} strokeWidth={selW(selected)} />
      <rect width={w} height={18} rx={3} fill={selected?'#9070d8':'#6040b0'} />
      <text x={w/2} y={12} textAnchor="middle" fontSize={7} fontWeight="700" fontFamily="Arial" fill="white">{el.label || 'Sequenciamento'}</text>
      {Array.from({length: slots}, (_,i) => (
        <rect key={i} x={5 + i*sw} y={22} width={sw-2} height={30} rx={1} fill="white" stroke="#8060c0" strokeWidth={0.8} />
      ))}
      <EditBtn onEdit={onEdit} x={w-2} y={2} />
    </g>
  );
}

// ── Controle de produção ──────────────────────────────────────────────────────
export function IdentificationSymbol({ el, selected, onEdit }: SymProps) {
  const w = 390; const h = 100;
  const companyImage = String(el.data.companyImage ?? '');
  const productImage = String(el.data.productImage ?? '');
  const family = String(el.data.family ?? '').trim() || 'Família não informada';
  const companyName = String(el.data.companyName ?? '').trim();
  const productName = String(el.data.productName ?? '').trim();
  const imageSlot = (x: number, image: string, title: string, fallback: string) => (
    <g>
      <rect x={x} y={0} width={90} height={h} fill="#f7f8fb" stroke="#8a93a8" strokeWidth={1} />
      {image ? (
        <image href={image} x={x + 5} y={17} width={80} height={66} preserveAspectRatio="xMidYMid meet" />
      ) : (
        <>
          <rect x={x + 17} y={27} width={56} height={38} rx={4} fill="white" stroke="#bdc4cf" strokeDasharray="4 3" />
          <path d={`M${x + 26},57 L${x + 39},44 L${x + 48},52 L${x + 58},39 L${x + 66},57 Z`} fill="#dbe1ea" />
          <text x={x + 45} y={75} textAnchor="middle" fontSize={6.5} fontFamily="Arial" fill="#7a8494">{fallback}</text>
        </>
      )}
      <text x={x + 45} y={11} textAnchor="middle" fontSize={6.5} fontWeight="700" fontFamily="Arial" fill="#536176">{title}</text>
    </g>
  );
  return (
    <g>
      {selected && <SelectionRect w={w} h={h} />}
      <rect width={w} height={h} fill="white" stroke={sel(selected, '#66758c')} strokeWidth={selW(selected)} />
      {imageSlot(0, companyImage, 'EMPRESA', 'Logo ou foto')}
      <rect x={90} y={0} width={210} height={h} fill="#eef2ff" stroke="#8a93a8" strokeWidth={1} />
      <rect x={90} y={0} width={210} height={24} fill="#9baded" />
      <text x={195} y={16} textAnchor="middle" fontSize={8} fontWeight="800" fontFamily="Arial" fill="#172452">FAMÍLIA DE PRODUTOS</text>
      <text x={195} y={51} textAnchor="middle" fontSize={12} fontWeight="800" fontFamily="Arial" fill="#172452">{family.slice(0, 30)}</text>
      {companyName && <text x={195} y={70} textAnchor="middle" fontSize={7.5} fontFamily="Arial" fill="#536176">Empresa: {companyName.slice(0, 34)}</text>}
      {productName && <text x={195} y={85} textAnchor="middle" fontSize={7.5} fontFamily="Arial" fill="#536176">Produto: {productName.slice(0, 34)}</text>}
      {imageSlot(300, productImage, 'PRODUTO', 'Foto do produto')}
      <EditBtn onEdit={onEdit} x={w - 2} y={2} />
    </g>
  );
}

export function PlanningSymbol({ el, selected, onEdit }: SymProps) {
  const w = 190; const h = 142;
  const label = el.label || 'Controle da\nProdução';
  const format = (value: string | number | undefined, digits = 1) => Number(value ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: digits });
  const rows = [
    { k: 'Demanda mensal', v: `${format(el.data.demanda, 2)} un` },
    { k: 'Demanda diária', v: `${format(el.data.demandaDiaria, 2)} un` },
    { k: 'TAKT time', v: `${format(Number(el.data.takt ?? 0) / 60, 2)} min` },
    { k: 'Tempo disponível', v: `${format(el.data.minutosDia, 0)} min/dia` },
  ];
  return (
    <g>
      {selected && <SelectionRect w={w} h={h} />}
      <rect width={w} height={h} fill="white" stroke={sel(selected,'#8a93a8')} strokeWidth={selW(selected)} />
      <rect width={w} height={28} fill={selected?'#b0ccf0':'#a8bcf0'} />
      <line x1={0} y1={28} x2={w} y2={28} stroke="#8a93a8" strokeWidth={1} />
      {label.split('\n').map((ln,i) =>
        <text key={i} x={w/2} y={13+i*12} textAnchor="middle" fontSize={8} fontWeight="700" fontFamily="Arial" fill="#122060">{ln}</text>
      )}
      {rows.map((r,i)=>(
        <g key={r.k}>
          <line x1={0} y1={28+(i+1)*28} x2={w} y2={28+(i+1)*28} stroke="#dde0e9" strokeWidth={0.8} />
          <text x={7} y={28+18+i*28} fontSize={7} fontFamily="Arial" fill="#50575f" fontWeight="700">{r.k}</text>
          <text x={w-7} y={28+18+i*28} fontSize={7.5} fontFamily="Arial" fill="#1d2128" fontWeight="700" textAnchor="end">{r.v}</text>
        </g>
      ))}
      <EditBtn onEdit={onEdit} x={w-2} y={4} />
    </g>
  );
}

// ── Caixa de dados ────────────────────────────────────────────────────────────
export function DataBoxSymbol({ el, selected, onEdit }: SymProps) {
  const w = 130; const h = 90;
  const rows = [
    { k: 'T/C', v: `${el.data.tc ?? 0} s` },
    { k: 'TCP', v: `${el.data.tcp ?? 0} s` },
    { k: 'Disponib.', v: `${el.data.disp ?? 100}%` },
    { k: 'Turnos', v: `${el.data.turnos ?? 1}` },
  ];
  return (
    <g>
      {selected && <SelectionRect w={w} h={h} />}
      <rect width={w} height={h} fill="white" stroke={sel(selected,'#606878')} strokeWidth={selW(selected)} />
      <rect width={w} height={20} fill={selected?'#d0d8e8':'#c0c8d8'} />
      <text x={w/2} y={13} textAnchor="middle" fontSize={7.5} fontWeight="700" fontFamily="Arial" fill="#202838">{el.label || 'Dados'}</text>
      {rows.map((r,i)=>(
        <g key={r.k}>
          <line x1={0} y1={20+(i+1)*17} x2={w} y2={20+(i+1)*17} stroke="#dde0e9" strokeWidth={0.8} />
          <text x={6} y={20+12+i*17} fontSize={6.5} fontFamily="Arial" fill="#50575f" fontWeight="700">{r.k}</text>
          <text x={w-6} y={20+12+i*17} fontSize={7} fontFamily="Arial" fill="#1d2128" fontWeight="700" textAnchor="end">{r.v}</text>
        </g>
      ))}
      <EditBtn onEdit={onEdit} x={w-2} y={2} />
    </g>
  );
}

// ── Demanda do cliente ────────────────────────────────────────────────────────
export function CustomerDemandSymbol({ el, selected, onEdit }: SymProps) {
  const w = 100; const h = 80;
  return (
    <g>
      {selected && <SelectionRect w={w} h={h} />}
      <polygon points={`${w/2},${h-4} 4,4 ${w-4},4`} fill={selected?'#b0d0ff':'#c8dcff'} stroke={sel(selected,'#2a50a0')} strokeWidth={selW(selected)} />
      <text x={w/2} y={22} textAnchor="middle" fontSize={7} fontWeight="700" fontFamily="Arial" fill="#0a1a60">DEMANDA</text>
      <text x={w/2} y={36} textAnchor="middle" fontSize={10} fontWeight="800" fontFamily="Arial" fill="#0a1a60">{el.data.qty ?? 0}</text>
      <text x={w/2} y={50} textAnchor="middle" fontSize={6.5} fontFamily="Arial" fill="#2a3a80">un / {el.data.periodo ?? 0} dias</text>
      <EditBtn onEdit={onEdit} x={w-2} y={2} />
    </g>
  );
}

// ── Programação de produção (documento) ──────────────────────────────────────
export function ProductionScheduleSymbol({ el, selected, onEdit }: SymProps) {
  const w = 110; const h = 70;
  return (
    <g>
      {selected && <SelectionRect w={w} h={h} />}
      {/* forma de documento com dobra */}
      <path d={`M 4,4 L ${w-14},4 L ${w-4},14 L ${w-4},${h-4} L 4,${h-4} Z`}
        fill={selected?'#e8eeff':'#f0f2ff'} stroke={sel(selected,'#4a5ab0')} strokeWidth={selW(selected)} />
      <path d={`M ${w-14},4 L ${w-14},14 L ${w-4},14`} fill="none" stroke={sel(selected,'#4a5ab0')} strokeWidth={selW(selected)} />
      {/* linhas de texto */}
      {[18,28,38,48].map((y,i) => (
        <line key={i} x1={10} y1={y} x2={w-16} y2={y} stroke="#8090c0" strokeWidth={i===0?1.5:0.8} />
      ))}
      <text x={w/2-4} y={14} textAnchor="middle" fontSize={7} fontWeight="700" fontFamily="Arial" fill="#2a3a90">{el.label||'Programação'}</text>
      <EditBtn onEdit={onEdit} x={w-2} y={2} />
    </g>
  );
}

// ── Operador ──────────────────────────────────────────────────────────────────
export function OperatorSymbol({ el, selected, onEdit }: SymProps) {
  const w = 40; const h = 60;
  return (
    <g>
      {selected && <SelectionRect w={w} h={h} />}
      {/* cabeça */}
      <circle cx={w/2} cy={12} r={9} fill={selected?'#c0d8ff':'#e8f0ff'} stroke={sel(selected,'#2a50a0')} strokeWidth={selW(selected)} />
      {/* corpo */}
      <line x1={w/2} y1={21} x2={w/2} y2={42} stroke={sel(selected,'#2a50a0')} strokeWidth={2} />
      {/* braços */}
      <line x1={w/2-12} y1={30} x2={w/2+12} y2={30} stroke={sel(selected,'#2a50a0')} strokeWidth={2} />
      {/* pernas */}
      <line x1={w/2} y1={42} x2={w/2-10} y2={56} stroke={sel(selected,'#2a50a0')} strokeWidth={2} />
      <line x1={w/2} y1={42} x2={w/2+10} y2={56} stroke={sel(selected,'#2a50a0')} strokeWidth={2} />
      {el.data.qty !== undefined && Number(el.data.qty) > 1 &&
        <text x={w/2} y={h-1} textAnchor="middle" fontSize={7} fontFamily="Arial" fontWeight="700" fill="#2a50a0">×{el.data.qty}</text>}
      <EditBtn onEdit={onEdit} x={w} y={2} />
    </g>
  );
}

// ── Kaizen burst ──────────────────────────────────────────────────────────────
export function KaizenSymbol({ el, selected, onEdit }: SymProps) {
  const r = 34;
  const pts = Array.from({length:16},(_,i)=>{const a=(i/16)*Math.PI*2;const rad=i%2===0?r:r*.64;return `${r+4+rad*Math.cos(a)},${r+4+rad*Math.sin(a)}`;}).join(' ');
  const label = el.label || 'Kaizen';
  return (
    <g>
      {selected && <rect x={-2} y={-2} width={78+4} height={78+4} rx={4} fill="none" stroke="#0071e3" strokeWidth={2} strokeDasharray="4 2" opacity={0.7} />}
      <polygon points={pts} fill={selected?'#ffe888':'#ffe04b'} stroke={sel(selected,'#b8930f')} strokeWidth={selW(selected)} />
      {label.split('\n').map((ln,i) =>
        <text key={i} x={r+4} y={r+2+(i-(label.split('\n').length-1)/2)*10} textAnchor="middle" fontSize={7.5} fontWeight="800" fontFamily="Arial" fill="#6b4c00">{ln}</text>
      )}
      <EditBtn onEdit={onEdit} x={r*2+2} y={2} />
    </g>
  );
}

// ── Ponto de intervenção (círculo com raios) ──────────────────────────────────
export function InterventionSymbol({ el, selected, onEdit }: SymProps) {
  const cx = 35; const cy = 35; const r = 24;
  const rays = Array.from({length:8},(_,i)=>{
    const a=(i/8)*Math.PI*2;
    const x1=cx+r*Math.cos(a); const y1=cy+r*Math.sin(a);
    const x2=cx+(r+10)*Math.cos(a); const y2=cy+(r+10)*Math.sin(a);
    return {x1,y1,x2,y2};
  });
  const label = el.label || 'Melhoria';
  return (
    <g>
      {selected && <rect x={-2} y={-2} width={74} height={74} rx={4} fill="none" stroke="#0071e3" strokeWidth={2} strokeDasharray="4 2" opacity={0.7} />}
      {rays.map((ray,i) => (
        <line key={i} x1={ray.x1} y1={ray.y1} x2={ray.x2} y2={ray.y2} stroke={sel(selected,'#e03030')} strokeWidth={2} />
      ))}
      <circle cx={cx} cy={cy} r={r} fill={selected?'#ffd0d0':'#ffebeb'} stroke={sel(selected,'#e03030')} strokeWidth={selW(selected)} />
      {label.split('\n').map((ln,i) =>
        <text key={i} x={cx} y={cy+2+(i-(label.split('\n').length-1)/2)*10} textAnchor="middle" fontSize={7} fontWeight="800" fontFamily="Arial" fill="#b01010">{ln}</text>
      )}
      <EditBtn onEdit={onEdit} x={68} y={2} />
    </g>
  );
}

// ── Nota / Post-it ────────────────────────────────────────────────────────────
export function NoteSymbol({ el, selected, onEdit }: SymProps) {
  const w = 120; const h = 80;
  return (
    <g>
      {selected && <SelectionRect w={w} h={h} />}
      {/* sombra */}
      <rect x={4} y={4} width={w} height={h} rx={3} fill="rgba(0,0,0,.08)" />
      {/* corpo */}
      <rect width={w} height={h} rx={3} fill={selected?'#fffaaa':'#fff9c4'} stroke={sel(selected,'#c8b800')} strokeWidth={selW(selected)} />
      {/* dobra */}
      <path d={`M ${w-16},0 L ${w},16 L ${w-16},16 Z`} fill={selected?'#e8d000':'#e8cc00'} />
      <path d={`M ${w-16},0 L ${w},16`} fill="none" stroke={sel(selected,'#c8b800')} strokeWidth={1} />
      {/* linhas de texto */}
      {[20,32,44,56].map((y,i) => <line key={i} x1={8} y1={y} x2={w-20} y2={y} stroke="#d4c400" strokeWidth={0.8} />)}
      <text x={w/2-8} y={15} textAnchor="middle" fontSize={7.5} fontFamily="Arial" fontWeight="600" fill="#665c00">{(el.label||'Nota...').slice(0,18)}</text>
      <EditBtn onEdit={onEdit} x={w-2} y={2} />
    </g>
  );
}

// ── Linha do tempo (dente de serra) ──────────────────────────────────────────
export function TimelineSymbol({ selected, leadTimeDays = 0, processingTimeMin = 0, timelineSteps = [] }: SymProps) {
  const labelWidth = 150;
  const summaryWidth = 220;
  const topY = 24;
  const bottomY = 56;
  const steps = timelineSteps.length ? timelineSteps : [{ inventoryDays: 0, processTimeMin: 0 }];
  const stepWidths = steps.map((step) => ({
    inventory: Math.max(60, step.inventoryWidth ?? 60),
    process: Math.max(100, step.processWidth ?? 150),
  }));
  const summaryX = labelWidth + stepWidths.reduce((total, widths) => total + widths.inventory + widths.process, 0);
  const w = summaryX + summaryWidth;
  const h = 78;
  const format = (value: number, digits: number) => value.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return (
    <g>
      {selected && <SelectionRect w={w} h={h} />}
      <text x={labelWidth - 12} y={topY - 6} textAnchor="end" fontSize={10} fontWeight="700" fontFamily="Arial" fill="#1d2128">ESTOQUE EM DIAS</text>
      <text x={labelWidth - 12} y={bottomY + 16} textAnchor="end" fontSize={10} fontWeight="700" fontFamily="Arial" fill="#1d2128">T/C (MIN)</text>

      {steps.map((step, index) => {
        const widths = stepWidths[index];
        const startX = labelWidth + stepWidths
          .slice(0, index)
          .reduce((total, previous) => total + previous.inventory + previous.process, 0);
        const middleX = startX + widths.process;
        const endX = middleX + widths.inventory;
        return (
          <g key={index}>
            <path d={`M${startX},${bottomY} H${middleX} V${topY} H${endX} V${bottomY}`}
              fill="none" stroke="#24262b" strokeWidth={1.4} />
            <text x={middleX + widths.inventory / 2} y={topY - 7} textAnchor="middle" fontSize={9} fontWeight="700" fontFamily="Arial" fill="#1d2128">
              {format(step.inventoryDays, 2)}
            </text>
            <text x={middleX + widths.inventory / 2} y={topY + 10} textAnchor="middle" fontSize={7.5} fontFamily="Arial" fill="#35383e">Dias</text>
            <text x={startX + widths.process / 2} y={bottomY - 7} textAnchor="middle" fontSize={9} fontWeight="700" fontFamily="Arial" fill="#1d2128">
              {format(step.processTimeMin, 1)}
            </text>
            <text x={startX + widths.process / 2} y={bottomY + 15} textAnchor="middle" fontSize={7.5} fontFamily="Arial" fill="#35383e">Minutos</text>
          </g>
        );
      })}

      <g transform={`translate(${summaryX},4)`}>
        <rect width={summaryWidth} height={52} fill="white" stroke="#24262b" strokeWidth={1.4} />
        <line x1={0} y1={26} x2={summaryWidth} y2={26} stroke="#24262b" strokeWidth={1.1} />
        <line x1={92} y1={0} x2={92} y2={52} stroke="#24262b" strokeWidth={1.1} />
        <text x={46} y={17} textAnchor="middle" fontSize={9} fontWeight="700" fontFamily="Arial" fill="#1d2128">{format(leadTimeDays, 2)}</text>
        <text x={46} y={43} textAnchor="middle" fontSize={9} fontWeight="700" fontFamily="Arial" fill="#1d2128">{format(processingTimeMin, 1)}</text>
        <text x={99} y={17} fontSize={9} fontWeight="700" fontFamily="Arial" fill="#1d2128">LEAD TIME DIAS</text>
        <text x={99} y={43} fontSize={9} fontWeight="700" fontFamily="Arial" fill="#1d2128">AGV (Min)</text>
      </g>
    </g>
  );
}

// ── Legenda ───────────────────────────────────────────────────────────────────
export function LegendSymbol({ el, selected, onEdit }: SymProps) {
  const w = 160; const h = 120;
  const items = [
    { color: '#3d4451', label: 'Fluxo empurrado' },
    { color: '#0071e3', label: 'Fluxo puxado' },
    { color: '#333', label: 'Info manual' },
    { color: '#0071e3', label: 'Info eletrônica', dash: true },
  ];
  return (
    <g>
      {selected && <SelectionRect w={w} h={h} />}
      <rect width={w} height={h} rx={3} fill="white" stroke={sel(selected,'#8a9099')} strokeWidth={selW(selected)} />
      <rect width={w} height={20} rx={3} fill={selected?'#c0c8d8':'#9aa0ae'} />
      <text x={w/2} y={13} textAnchor="middle" fontSize={8} fontWeight="700" fontFamily="Arial" fill="white">{el.label||'Legenda'}</text>
      {items.map((item,i) => (
        <g key={i} transform={`translate(8,${26+i*23})`}>
          <line x1={0} y1={8} x2={28} y2={8} stroke={item.color} strokeWidth={2.5} strokeDasharray={item.dash?'4 2':'none'} />
          {!item.dash && <polygon points="22,4 30,8 22,12" fill={item.color} />}
          {item.dash && <polygon points="22,4 30,8 22,12" fill={item.color} />}
          <text x={34} y={12} fontSize={7} fontFamily="Arial" fill="#363b43">{item.label}</text>
        </g>
      ))}
      <EditBtn onEdit={onEdit} x={w-2} y={4} />
    </g>
  );
}

// ── Símbolos complementares do MFV ──────────────────────────────────────────
export function ExtendedSymbol(props: SymProps) {
  const { el, selected, onEdit } = props;
  const stroke = sel(selected, '#526074');
  const strokeWidth = selW(selected);
  const edit = (x: number, y = 2) => <EditBtn onEdit={onEdit} x={x} y={y} />;
  const label = (x: number, y: number, text = el.label, color = '#263548') => (
    <text x={x} y={y} textAnchor="middle" fontSize={8} fontWeight="700" fontFamily="Arial" fill={color}>{text}</text>
  );

  if (el.kind === 'shared-process') {
    return <g><ProcessSymbol {...props} /><rect x={4} y={4} width={142} height={152} fill="none" stroke="#65748a" strokeWidth={1} strokeDasharray="5 3" pointerEvents="none" /></g>;
  }

  if (el.kind === 'raw-material' || el.kind === 'finished-goods' || el.kind === 'warehouse') {
    const w = el.kind === 'warehouse' ? 120 : 110; const h = el.kind === 'warehouse' ? 82 : 72;
    const fill = el.kind === 'raw-material' ? '#d9e4fb' : el.kind === 'finished-goods' ? '#d9f1e1' : '#edf0f5';
    return <g>
      {selected && <SelectionRect w={w} h={h} />}
      <rect width={w} height={h} rx={3} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      {el.kind === 'warehouse' ? <>
        <path d={`M12,30 L${w/2},8 L${w-12},30`} fill="none" stroke={stroke} strokeWidth={2} />
        <rect x={18} y={30} width={w-36} height={27} fill="white" stroke={stroke} strokeWidth={1.4} />
        {[0,1,2].map((i)=><line key={i} x1={30+i*24} y1={31} x2={30+i*24} y2={57} stroke="#9ba7b7" />)}
      </> : <>
        <path d={`M${w/2-18},12 l18,-8 18,8 -18,8 z`} fill="#8fa8d8" stroke={stroke} />
        <path d={`M${w/2-18},12 v20 l18,9 18,-9 v-20`} fill="none" stroke={stroke} strokeWidth={1.4} />
        <line x1={w/2} y1={20} x2={w/2} y2={41} stroke={stroke} />
      </>}
      {label(w/2,h-8)}
      {Number(el.data.qty ?? 0) > 0 && <text x={w-7} y={13} textAnchor="end" fontSize={7} fontFamily="Arial" fill="#526074">{el.data.qty} un</text>}
      {edit(w-2)}
    </g>;
  }

  if (el.kind === 'machine') {
    const w=120,h=82;
    return <g>{selected && <SelectionRect w={w} h={h}/>}<rect width={w} height={h} rx={4} fill="#eef2f7" stroke={stroke} strokeWidth={strokeWidth}/>
      <rect x={15} y={17} width={90} height={34} rx={3} fill="white" stroke={stroke}/><circle cx={45} cy={34} r={11} fill="#d4deed" stroke={stroke}/><circle cx={45} cy={34} r={4} fill="#718096"/>
      <rect x={68} y={25} width={23} height={18} fill="#d4deed" stroke={stroke}/>{label(w/2,70)}{edit(w-2)}</g>;
  }

  if (el.kind === 'inspection') {
    const w=100,h=86;
    return <g>{selected && <SelectionRect w={w} h={h}/>}<polygon points={`${w/2},5 ${w-5},${h/2} ${w/2},${h-5} 5,${h/2}`} fill="#fff4cf" stroke={stroke} strokeWidth={strokeWidth}/>
      <text x={w/2} y={h/2-2} textAnchor="middle" fontSize={18} fontWeight="800" fontFamily="Arial" fill="#9a6b00">Q</text>{label(w/2,h/2+15)}{edit(w-2)}</g>;
  }

  if (el.kind === 'safety-stock') {
    const w=76,h=64;
    return <g>{selected && <SelectionRect w={w} h={h}/>}<polygon points="22,7 40,40 4,40" fill="#f7dc62" stroke={stroke} strokeWidth={strokeWidth}/><polygon points="54,7 72,40 36,40" fill="#ffd044" stroke={stroke} strokeWidth={strokeWidth}/>
      <text x={38} y={35} textAnchor="middle" fontSize={9} fontWeight="800" fontFamily="Arial" fill="#604c00">SS</text><text x={38} y={55} textAnchor="middle" fontSize={7} fontFamily="Arial" fill="#4d5663">{el.data.qty ?? 0} un</text>{edit(w-2)}</g>;
  }

  if (['transport-air','transport-ship','forklift','milk-run'].includes(el.kind)) {
    const w=el.kind==='milk-run'?120:el.kind==='transport-ship'?105:el.kind==='transport-air'?100:90; const h=el.kind==='milk-run'?64:58;
    return <g>{selected && <SelectionRect w={w} h={h}/>}<rect width={w} height={h} rx={8} fill="#eef3fb" stroke={stroke} strokeWidth={strokeWidth}/>
      {el.kind==='transport-air' && <path d="M12,29 L43,24 L56,8 L64,8 L59,23 L84,21 L88,27 L58,33 L62,47 L56,47 L45,35 L15,39 Z" fill="#7890b5" stroke={stroke}/>}
      {el.kind==='transport-ship' && <><path d="M12,34 H92 L80,48 H28 Z" fill="#8eb8d8" stroke={stroke}/><rect x={37} y={19} width={33} height={15} fill="#dbe8f4" stroke={stroke}/><line x1={52} y1={19} x2={52} y2={8} stroke={stroke}/></>}
      {el.kind==='forklift' && <><circle cx={27} cy={44} r={6} fill="#39485c"/><circle cx={63} cy={44} r={6} fill="#39485c"/><rect x={18} y={24} width={42} height={18} fill="#f0b84b" stroke={stroke}/><path d="M58,13 V44 H80 M72,13 V39" fill="none" stroke={stroke} strokeWidth={3}/></>}
      {el.kind==='milk-run' && <><path d="M14,29 H105" fill="none" stroke="#0071e3" strokeWidth={2} strokeDasharray="5 3"/><circle cx={23} cy={29} r={9} fill="#dcecff" stroke="#0071e3"/><circle cx={60} cy={29} r={9} fill="#dcecff" stroke="#0071e3"/><circle cx={97} cy={29} r={9} fill="#dcecff" stroke="#0071e3"/></>}
      {label(w/2,h-6)}{edit(w-2)}</g>;
  }

  if (el.kind === 'signal-kanban') {
    const w=64,h=56;
    return <g>{selected && <SelectionRect w={w} h={h}/>}<polygon points={`${w/2},4 ${w-5},${h-8} 5,${h-8}`} fill="#ffb23f" stroke={stroke} strokeWidth={strokeWidth}/><text x={w/2} y={34} textAnchor="middle" fontSize={9} fontWeight="800" fontFamily="Arial" fill="#6d3b00">K</text>{edit(w-2)}</g>;
  }

  if (el.kind === 'kanban-post') {
    const w=88,h=72;
    return <g>{selected && <SelectionRect w={w} h={h}/>}<rect x={18} y={8} width={52} height={48} rx={3} fill="#fff7dd" stroke={stroke} strokeWidth={strokeWidth}/><line x1={27} y1={20} x2={61} y2={20} stroke="#d59a25"/><line x1={27} y1={31} x2={61} y2={31} stroke="#d59a25"/><line x1={27} y1={42} x2={61} y2={42} stroke="#d59a25"/>{label(w/2,68)}{edit(w-2)}</g>;
  }

  if (el.kind === 'sequenced-pull') {
    const w=150,h=62;
    return <g>{selected && <SelectionRect w={w} h={h}/>}<path d="M8,31 H134" stroke="#0071e3" strokeWidth={2.5}/><polygon points="134,24 146,31 134,38" fill="#0071e3"/>{[20,48,76,104].map((x,i)=><rect key={i} x={x} y={16} width={15} height={22} rx={2} fill={i%2?'#ffb347':'#62b987'} stroke="#526074"/>)}{label(w/2,55)}{edit(w-2)}</g>;
  }

  if (el.kind === 'erp-system' || el.kind === 'go-see') {
    const w=el.kind==='erp-system'?120:130,h=el.kind==='erp-system'?76:72;
    return <g>{selected && <SelectionRect w={w} h={h}/>}<rect width={w} height={h} rx={6} fill={el.kind==='erp-system'?'#e9e4fb':'#e5f2ff'} stroke={stroke} strokeWidth={strokeWidth}/>
      {el.kind==='erp-system'?<><rect x={22} y={13} width={76} height={32} rx={3} fill="white" stroke="#6751a3"/><path d="M33,23 H87 M33,31 H74 M33,39 H81" stroke="#8a78bd"/><rect x={48} y={48} width={24} height={4} fill="#6751a3"/></>:<><circle cx={43} cy={27} r={9} fill="white" stroke="#23659c"/><circle cx={74} cy={27} r={9} fill="white" stroke="#23659c"/><path d="M52,27 H65 M34,27 H22 M83,27 H100" stroke="#23659c" strokeWidth={2}/></>}
      {label(w/2,h-9)}{edit(w-2)}</g>;
  }

  if (el.kind === 'quality-problem') {
    const w=82,h=72;
    return <g>{selected && <SelectionRect w={w} h={h}/>}<path d="M41,4 L51,16 L68,13 L66,30 L78,40 L64,50 L65,67 L48,63 L37,71 L27,58 L10,61 L12,44 L2,33 L17,24 L17,8 L34,12 Z" fill="#ffd9d5" stroke="#d43d32" strokeWidth={strokeWidth}/><text x={41} y={38} textAnchor="middle" fontSize={17} fontWeight="900" fontFamily="Arial" fill="#a2221a">Q!</text>{edit(w-2)}</g>;
  }

  if (el.kind === 'bottleneck') {
    const w=92,h=66;
    return <g>{selected && <SelectionRect w={w} h={h}/>}<path d="M20,7 H72 L62,25 V41 L72,59 H20 L30,41 V25 Z" fill="#ffe2df" stroke="#d43d32" strokeWidth={strokeWidth}/><text x={46} y={37} textAnchor="middle" fontSize={9} fontWeight="900" fontFamily="Arial" fill="#a2221a">GARGALO</text>{edit(w-2)}</g>;
  }

  if (el.kind === 'distance') {
    const w=150,h=42;
    return <g>{selected && <SelectionRect w={w} h={h}/>}<line x1={10} y1={18} x2={140} y2={18} stroke={stroke} strokeWidth={2}/><polygon points="10,18 20,12 20,24" fill={stroke}/><polygon points="140,18 130,12 130,24" fill={stroke}/><text x={75} y={36} textAnchor="middle" fontSize={8} fontWeight="700" fontFamily="Arial" fill="#39485c">{Number(el.data.distance ?? 0).toLocaleString('pt-BR')} m</text>{edit(w-2)}</g>;
  }

  return null;
}
