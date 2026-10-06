import assert from 'node:assert/strict';
import test from 'node:test';
import { cloneCanvas, syncCanvasForward } from '../src/canvas-sync.ts';

const assumptions = {
  monthlyDemand: 100,
  workdaysPerMonth: 20,
  availableMinutesPerDay: 480,
  productMix: [{ id: 'a', name: 'A', monthlyDemand: 100, packSize: 1 }],
};

function process(id = 'p1') {
  return { id, kind: 'process', x: 100, y: 200, label: 'Processo', data: { tc: 60, recurso: 1 } };
}

function canvas(elements = [process()], arrows = []) {
  return { elements, arrows, assumptions: cloneCanvas({ elements: [], arrows: [], assumptions, themeColor: '#0071e3' }).assumptions, themeColor: '#0071e3' };
}

test('alterações do Estado Atual avançam quando o futuro ainda não divergiu', () => {
  const previous = canvas();
  const current = cloneCanvas(previous);
  current.elements[0].x = 180;
  current.elements[0].label = 'Corte';
  current.elements[0].data.tc = 45;
  const future = cloneCanvas(previous);
  const result = syncCanvasForward(previous, current, future);
  assert.equal(result.elements[0].x, 180);
  assert.equal(result.elements[0].label, 'Corte');
  assert.equal(result.elements[0].data.tc, 45);
});

test('sobrescritas locais do Estado Futuro são preservadas', () => {
  const previous = canvas();
  const current = cloneCanvas(previous);
  current.elements[0].x = 180;
  current.elements[0].data.tc = 45;
  const future = cloneCanvas(previous);
  future.elements[0].x = 320;
  future.elements[0].data.tc = 30;
  const result = syncCanvasForward(previous, current, future);
  assert.equal(result.elements[0].x, 320);
  assert.equal(result.elements[0].data.tc, 30);
});

test('adições e remoções do Atual avançam sem apagar elementos exclusivos do Futuro', () => {
  const previous = canvas([process('removed')]);
  const current = canvas([process('added')]);
  const futureOnly = { id: 'future-note', kind: 'note', x: 400, y: 50, label: 'Hipótese', data: {} };
  const future = canvas([process('removed'), futureOnly]);
  const result = syncCanvasForward(previous, current, future);
  assert.equal(result.elements.some((element) => element.id === 'removed'), false);
  assert.equal(result.elements.some((element) => element.id === 'added'), true);
  assert.equal(result.elements.some((element) => element.id === 'future-note'), true);
});

test('setas sincronizam geometria sem substituir ajuste futuro', () => {
  const arrow = { id: 'a1', kind: 'arrow-push', x1: 0, y1: 0, x2: 100, y2: 0 };
  const previous = canvas([], [arrow]);
  const current = canvas([], [{ ...arrow, x2: 150 }]);
  const following = syncCanvasForward(previous, current, canvas([], [arrow]));
  assert.equal(following.arrows[0].x2, 150);
  const overridden = syncCanvasForward(previous, current, canvas([], [{ ...arrow, x2: 220 }]));
  assert.equal(overridden.arrows[0].x2, 220);
});

test('demanda e cor seguem o Atual somente quando não há sobrescrita futura', () => {
  const previous = canvas();
  const current = cloneCanvas(previous);
  current.assumptions.productMix[0].monthlyDemand = 140;
  current.assumptions.monthlyDemand = 140;
  current.themeColor = '#112233';
  const inherited = syncCanvasForward(previous, current, cloneCanvas(previous));
  assert.equal(inherited.assumptions.monthlyDemand, 140);
  assert.equal(inherited.themeColor, '#112233');
  const future = cloneCanvas(previous);
  future.assumptions.productMix[0].monthlyDemand = 80;
  future.assumptions.monthlyDemand = 80;
  future.themeColor = '#445566';
  const overridden = syncCanvasForward(previous, current, future);
  assert.equal(overridden.assumptions.monthlyDemand, 80);
  assert.equal(overridden.themeColor, '#445566');
});

test('clone do canvas não compartilha dados mutáveis', () => {
  const original = canvas();
  const copy = cloneCanvas(original);
  copy.elements[0].data.tc = 10;
  copy.assumptions.productMix[0].monthlyDemand = 10;
  assert.equal(original.elements[0].data.tc, 60);
  assert.equal(original.assumptions.productMix[0].monthlyDemand, 100);
});
