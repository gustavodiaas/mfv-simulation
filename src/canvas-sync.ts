import type { ArrowAnchor, CanvasArrow, CanvasElement, CanvasState, ScenarioAssumptions } from './canvas-types';

export function cloneCanvas(canvas: CanvasState): CanvasState {
  return JSON.parse(JSON.stringify(canvas)) as CanvasState;
}

function mergeForwardData(
  previous: Record<string, string | number>,
  current: Record<string, string | number>,
  future: Record<string, string | number>,
) {
  const merged = { ...future };
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
  keys.forEach((key) => {
    const existedBefore = Object.prototype.hasOwnProperty.call(previous, key);
    const existsNow = Object.prototype.hasOwnProperty.call(current, key);
    const existsInFuture = Object.prototype.hasOwnProperty.call(future, key);
    if ((!existedBefore && !existsInFuture) || (existedBefore && Object.is(future[key], previous[key]))) {
      if (existsNow) merged[key] = current[key];
      else delete merged[key];
    }
  });
  return merged;
}

function mergeForwardElement(previous: CanvasElement, current: CanvasElement, future: CanvasElement): CanvasElement {
  return {
    ...future,
    kind: future.kind === previous.kind ? current.kind : future.kind,
    x: future.x === previous.x ? current.x : future.x,
    y: future.y === previous.y ? current.y : future.y,
    label: future.label === previous.label ? current.label : future.label,
    data: mergeForwardData(previous.data, current.data, future.data),
  };
}

function mergeForwardArrow(previous: CanvasArrow, current: CanvasArrow, future: CanvasArrow): CanvasArrow {
  const sameAnchor = (left?: ArrowAnchor, right?: ArrowAnchor) =>
    left?.elementId === right?.elementId && left?.x === right?.x && left?.y === right?.y;
  return {
    ...future,
    kind: future.kind === previous.kind ? current.kind : future.kind,
    x1: future.x1 === previous.x1 ? current.x1 : future.x1,
    y1: future.y1 === previous.y1 ? current.y1 : future.y1,
    x2: future.x2 === previous.x2 ? current.x2 : future.x2,
    y2: future.y2 === previous.y2 ? current.y2 : future.y2,
    label: future.label === previous.label ? current.label : future.label,
    startAnchor: sameAnchor(future.startAnchor, previous.startAnchor) ? current.startAnchor : future.startAnchor,
    endAnchor: sameAnchor(future.endAnchor, previous.endAnchor) ? current.endAnchor : future.endAnchor,
  };
}

export function syncCanvasForward(previousCurrent: CanvasState, current: CanvasState, future: CanvasState): CanvasState {
  const previousElements = new Map(previousCurrent.elements.map((element) => [element.id, element]));
  const currentElements = new Map(current.elements.map((element) => [element.id, element]));
  const futureElements = future.elements
    .filter((element) => !previousElements.has(element.id) || currentElements.has(element.id))
    .map((element) => {
      const previous = previousElements.get(element.id);
      const next = currentElements.get(element.id);
      return previous && next ? mergeForwardElement(previous, next, element) : element;
    });
  const futureElementIds = new Set(futureElements.map((element) => element.id));
  current.elements.forEach((element) => {
    if (!previousElements.has(element.id) && !futureElementIds.has(element.id)) futureElements.push(JSON.parse(JSON.stringify(element)) as CanvasElement);
  });

  const previousArrows = new Map(previousCurrent.arrows.map((arrow) => [arrow.id, arrow]));
  const currentArrows = new Map(current.arrows.map((arrow) => [arrow.id, arrow]));
  const futureArrows = future.arrows
    .filter((arrow) => !previousArrows.has(arrow.id) || currentArrows.has(arrow.id))
    .map((arrow) => {
      const previous = previousArrows.get(arrow.id);
      const next = currentArrows.get(arrow.id);
      return previous && next ? mergeForwardArrow(previous, next, arrow) : arrow;
    });
  const futureArrowIds = new Set(futureArrows.map((arrow) => arrow.id));
  current.arrows.forEach((arrow) => {
    if (!previousArrows.has(arrow.id) && !futureArrowIds.has(arrow.id)) futureArrows.push({ ...arrow });
  });

  const assumptions: ScenarioAssumptions = { ...future.assumptions };
  const scalarKeys: (keyof Pick<ScenarioAssumptions, 'monthlyDemand' | 'workdaysPerMonth' | 'availableMinutesPerDay'>)[] = [
    'monthlyDemand', 'workdaysPerMonth', 'availableMinutesPerDay',
  ];
  scalarKeys.forEach((key) => {
    if (future.assumptions[key] === previousCurrent.assumptions[key]) assumptions[key] = current.assumptions[key];
  });
  if (JSON.stringify(future.assumptions.productMix) === JSON.stringify(previousCurrent.assumptions.productMix)) {
    assumptions.productMix = current.assumptions.productMix.map((item) => ({ ...item }));
    assumptions.monthlyDemand = assumptions.productMix.reduce((sum, item) => sum + item.monthlyDemand, 0);
  }

  const themeColor = future.themeColor === previousCurrent.themeColor ? current.themeColor : future.themeColor;
  return { ...future, elements: futureElements, arrows: futureArrows, assumptions, themeColor };
}
