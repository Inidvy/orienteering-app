// Georeferenced O-map backdrop + course overlay. The map PNG was rendered from
// the .omap at known WGS84 bounds (tools/map-pipeline), so lat/lon -> pixel is
// exact. Svg viewBox crops to the course's flags + margin. Sport-pure: no live
// position dot, course drawn in ISOM magenta.

import Svg, {
  Circle,
  G,
  Image as SvgImage,
  Line,
  Polygon,
} from "react-native-svg";
import type { LatLon } from "@orienteering/verification-core";
import bounds from "../../assets/hadiko-bounds.json";
import { color } from "../theme";

const MAP = require("../../assets/hadiko-map.png");

// lat/lon -> map-pixel (matches render.mjs px/py)
const toPx = (p: LatLon) => ({
  x: ((p.lon - bounds.west) / (bounds.east - bounds.west)) * bounds.width,
  y: ((bounds.north - p.lat) / (bounds.north - bounds.south)) * bounds.height,
});

export interface CourseMapProps {
  /** flags in course order: [start, controls..., finish] */
  flags: LatLon[];
  /** which leg is next (0 = to first control); undefined pre-start */
  nextIndex?: number;
  width: number;
  height: number;
}

export function CourseMap({ flags, nextIndex, width, height }: CourseMapProps) {
  const pts = flags.map(toPx);

  // course bbox + margin -> viewBox (crop the big map to the course)
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const pad = 90; // map pixels (~65 m)
  let minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
  let minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
  // keep the viewBox aspect matching the screen so nothing is stretched
  const vbW = maxX - minX, vbH = maxY - minY;
  const screenAR = width / height;
  if (vbW / vbH > screenAR) {
    const need = vbW / screenAR;
    const cy = (minY + maxY) / 2;
    minY = cy - need / 2; maxY = cy + need / 2;
  } else {
    const need = vbH * screenAR;
    const cx = (minX + maxX) / 2;
    minX = cx - need / 2; maxX = cx + need / 2;
  }

  return (
    <Svg width={width} height={height} viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}>
      <SvgImage x={0} y={0} width={bounds.width} height={bounds.height} href={MAP} />
      <G>
        {/* legs */}
        {pts.slice(1).map((p, i) => {
          const a = pts[i]!;
          return (
            <Line
              key={`l${i}`}
              x1={a.x} y1={a.y} x2={p.x} y2={p.y}
              stroke={color.accent}
              strokeWidth={3}
            />
          );
        })}
        {/* start triangle */}
        {pts[0] && (
          <Polygon
            points={`${pts[0].x},${pts[0].y - 14} ${pts[0].x - 12},${pts[0].y + 8} ${pts[0].x + 12},${pts[0].y + 8}`}
            fill="none"
            stroke={color.accent}
            strokeWidth={3}
          />
        )}
        {/* controls */}
        {pts.slice(1, -1).map((p, i) => (
          <Circle
            key={`c${i}`}
            cx={p.x} cy={p.y} r={13}
            fill="none"
            stroke={color.accent}
            strokeWidth={nextIndex === i + 1 ? 5 : 3}
          />
        ))}
        {/* finish double circle */}
        {pts.length > 1 && (
          <>
            <Circle cx={pts[pts.length - 1]!.x} cy={pts[pts.length - 1]!.y} r={11}
              fill="none" stroke={color.accent} strokeWidth={3} />
            <Circle cx={pts[pts.length - 1]!.x} cy={pts[pts.length - 1]!.y} r={16}
              fill="none" stroke={color.accent} strokeWidth={3} />
          </>
        )}
      </G>
    </Svg>
  );
}
