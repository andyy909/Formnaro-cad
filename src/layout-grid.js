import { LAYOUT_GRID_LAST_CELL } from '../backend/layout-data.mjs';

export const layoutGridStep = 44;
const margin = 6;

export function layoutGridPosition([column, row], {width, height}, {usableWidth, usableHeight}) {
  const place = (index, size, available) => {
    const last = Math.floor((available - size - 2 * margin) / layoutGridStep);
    return margin + Math.min(index, Math.max(0, last)) * layoutGridStep;
  };
  return {left: place(column, width, usableWidth), top: place(row, height, usableHeight), width, height};
}

export function snapLayoutGrid(x, y, size, viewport) {
  const index = value => Math.min(LAYOUT_GRID_LAST_CELL, Math.max(0, Math.round((value - margin) / layoutGridStep)));
  const rect = layoutGridPosition([index(x), index(y)], size, viewport);
  const cell = [index(rect.left), index(rect.top)];
  return {cell, rect};
}
