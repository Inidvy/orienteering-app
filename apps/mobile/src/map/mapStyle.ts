// Feature styling for the vector renderer. Preferred source: per-feature
// style EMBEDDED by the pipeline from the .omap's own color/symbol tables
// (exactly what OpenOrienteering Mapper renders — 2026-07-12); styleFor() is
// the code-prefix fallback for assets built before that.
export interface FeatureStyle {
  fill: string | null;
  stroke: string | null;
  /** stroke width in METRES (scales with zoom, like a real map) */
  w: number;
  z: number; // paint order (low first)
}

export interface FeatureProps {
  code: string;
  /** fill color from the map's color table */
  c?: string | null;
  /** stroke color from the map's color table */
  s?: string | null;
  w?: number;
  z?: number;
}

export function styleOf(p: FeatureProps): FeatureStyle {
  if (p.c != null || p.s != null) {
    return { fill: p.c ?? null, stroke: p.s ?? null, w: p.w ?? 0, z: p.z ?? 0 };
  }
  return styleFor(p.code);
}

export function styleFor(code: string): FeatureStyle {
  const cls = code[0];
  if (cls === "3") return { fill: "#7fd8ff", stroke: "#2196c8", w: 0.8, z: 3 }; // water
  if (code.startsWith("401") || code.startsWith("403"))
    return { fill: "#ffc400", stroke: null, w: 0, z: 0 }; // open yellow
  if (code.startsWith("406")) return { fill: "#c6efb4", stroke: null, w: 0, z: 0 };
  if (code.startsWith("408")) return { fill: "#7ed67a", stroke: null, w: 0, z: 0 };
  if (code.startsWith("410") || code.startsWith("411") || code.startsWith("413"))
    return { fill: "#38b34a", stroke: null, w: 0, z: 0 };
  if (cls === "4") return { fill: "#e6f5da", stroke: null, w: 0, z: 0 }; // forest = light
  if (code.startsWith("521") || code.startsWith("526"))
    return { fill: "#4d4d4d", stroke: "#000", w: 0.5, z: 5 }; // buildings
  if (code.startsWith("520") || code.startsWith("501.7") || code.startsWith("501.8"))
    return { fill: "#d9c7a8", stroke: null, w: 0, z: 1 }; // paved area
  if (cls === "5") return { fill: null, stroke: "#111", w: 1.0, z: 4 }; // walls/paths/roads
  if (cls === "1") return { fill: null, stroke: "#b06a2c", w: 0.7, z: 2 }; // landform
  if (cls === "2") return { fill: "#000", stroke: "#000", w: 0.5, z: 4 }; // rock
  return { fill: null, stroke: "#999", w: 0.5, z: 4 };
}
