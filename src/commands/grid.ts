import { TendError } from "../services/errors";
import type { Space } from "../db/repo";

/** Parse a coordinate like "A1" to { row: 0, col: 0 } */
export function parseCoord(coord: string): { row: number; col: number } {
  const match = coord.trim().toUpperCase().match(/^([A-Z])(\d+)$/);
  if (!match) throw new TendError("INVALID_INPUT", `Invalid coordinate: '${coord}'. Use format like A1, B3.`);
  const row = match[1].charCodeAt(0) - 65; // A=0, B=1, ...
  const col = parseInt(match[2]) - 1;       // 1=0, 2=1, ...
  if (col < 0) throw new TendError("INVALID_INPUT", `Invalid column in coordinate: '${coord}'. Columns start at 1.`);
  return { row, col };
}

/** Parse comma-separated coordinates: "A1,A2,B1,B2" */
export function parseCoords(input: string): { row: number; col: number }[] {
  const parts = input.split(",").map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) throw new TendError("INVALID_INPUT", "No coordinates provided.");
  return parts.map(parseCoord);
}

/** Format a cell back to display: { row: 0, col: 0 } → "A1" */
export function formatCoord(row: number, col: number): string {
  return `${String.fromCharCode(65 + row)}${col + 1}`;
}

/** Validate coordinates fit within a space's dimensions */
export function validateCoords(space: Space, cells: { row: number; col: number }[]): void {
  if (!space.width || !space.length) {
    throw new TendError("INVALID_INPUT", `Space '${space.name}' has no dimensions set. Add width/length first.`);
  }
  const maxRows = Math.floor(space.length);
  const maxCols = Math.floor(space.width);
  for (const cell of cells) {
    if (cell.row < 0 || cell.row >= maxRows || cell.col < 0 || cell.col >= maxCols) {
      throw new TendError("INVALID_INPUT",
        `Coordinate ${formatCoord(cell.row, cell.col)} is out of bounds for ${space.name} (${maxRows} rows × ${maxCols} cols, valid range A1–${formatCoord(maxRows - 1, maxCols - 1)}).`
      );
    }
  }
}

/** Generate a short label (max 3 chars) from a crop name */
function makeLabel(crop: string): string {
  return crop.slice(0, 3).toUpperCase();
}

interface GridCell {
  crop: string;
  variety: string | null;
  stage: string;
  health: string;
  planting_id: string;
}

export interface GridData {
  space: Space;
  grid: (GridCell | null)[][];
  plantings: { planting_id: string; crop: string; variety: string | null; stage: string; health: string; cells: string[] }[];
}

/** Build grid data structure from placements */
export function buildGridData(
  space: Space,
  placements: { row: number; col: number; crop: string; variety: string | null; stage: string; health: string; planting_id: string }[]
): GridData {
  const rows = Math.floor(space.length ?? 0);
  const cols = Math.floor(space.width ?? 0);

  // Initialize empty grid
  const grid: (GridCell | null)[][] = [];
  for (let r = 0; r < rows; r++) {
    grid.push(new Array(cols).fill(null));
  }

  // Fill in placements
  const plantingMap = new Map<string, { planting_id: string; crop: string; variety: string | null; stage: string; health: string; cells: string[] }>();

  for (const p of placements) {
    if (p.row < rows && p.col < cols) {
      grid[p.row][p.col] = { crop: p.crop, variety: p.variety, stage: p.stage, health: p.health, planting_id: p.planting_id };
    }
    if (!plantingMap.has(p.planting_id)) {
      plantingMap.set(p.planting_id, { planting_id: p.planting_id, crop: p.crop, variety: p.variety, stage: p.stage, health: p.health, cells: [] });
    }
    plantingMap.get(p.planting_id)!.cells.push(formatCoord(p.row, p.col));
  }

  return { space, grid, plantings: Array.from(plantingMap.values()) };
}

/** Render ASCII grid map */
export function renderAsciiMap(data: GridData): string {
  const { space, grid, plantings } = data;
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;
  if (rows === 0 || cols === 0) return `${space.name} — no dimensions set`;

  const cellWidth = 7;
  const lines: string[] = [];

  // Header
  const dims = space.width && space.length ? `${space.length}×${space.width} ${space.unit ?? ""}`.trim() : "";
  const layout = space.layout_mode !== "none" ? `, ${humanizeLayout(space.layout_mode)}` : "";
  lines.push(`${space.name} (${dims}${layout})`);

  // Column headers
  const colHeaders = "    " + Array.from({ length: cols }, (_, i) =>
    centerPad(String(i + 1), cellWidth)
  ).join(" ");
  lines.push(colHeaders);

  // Build label map (unique short label per crop)
  const labelMap = new Map<string, string>();
  const usedLabels = new Set<string>();
  for (const p of plantings) {
    let label = makeLabel(p.crop);
    if (usedLabels.has(label)) {
      // Try first 3 chars of variety or add number
      label = p.variety ? makeLabel(p.variety) : label + "2";
    }
    usedLabels.add(label);
    labelMap.set(p.planting_id, label);
  }

  // Grid rows
  const separator = "  +" + Array(cols).fill("-".repeat(cellWidth)).join("+") + "+";

  for (let r = 0; r < rows; r++) {
    lines.push(separator);
    const rowLabel = String.fromCharCode(65 + r);
    const cells = grid[r].map(cell => {
      if (!cell) return centerPad("", cellWidth);
      const label = labelMap.get(cell.planting_id) ?? makeLabel(cell.crop);
      return centerPad(label, cellWidth);
    });
    lines.push(`${rowLabel} |${cells.join("|")}|`);
  }
  lines.push(separator);

  // Legend
  if (plantings.length > 0) {
    lines.push("");
    lines.push("Legend:");
    for (const p of plantings) {
      const label = labelMap.get(p.planting_id) ?? makeLabel(p.crop);
      const name = p.variety ? `${p.crop} (${p.variety})` : p.crop;
      lines.push(`  ${padRight(label, 4)} ${name} — ${humanizeLayout(p.stage)}, ${humanizeLayout(p.health)}`);
    }
  }

  return lines.join("\n");
}

/** Build JSON output for spaces map --json */
export function buildMapJson(data: GridData) {
  const rows = data.grid.length;
  const cols = rows > 0 ? data.grid[0].length : 0;

  const cells: { coord: string; row: number; col: number; planting_id: string | null; crop: string | null }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = data.grid[r][c];
      cells.push({
        coord: formatCoord(r, c),
        row: r,
        col: c,
        planting_id: cell?.planting_id ?? null,
        crop: cell?.crop ?? null,
      });
    }
  }

  return {
    space: {
      id: data.space.id,
      name: data.space.name,
      type: data.space.type,
      layout_mode: data.space.layout_mode,
      width: data.space.width,
      length: data.space.length,
      unit: data.space.unit,
    },
    dimensions: { rows, cols },
    cells,
    plantings: data.plantings,
  };
}

function centerPad(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width);
  const left = Math.floor((width - s.length) / 2);
  const right = width - s.length - left;
  return " ".repeat(left) + s + " ".repeat(right);
}

function padRight(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

function humanizeLayout(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
