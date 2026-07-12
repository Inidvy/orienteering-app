// Vector O-map backdrop + course overlay. Crisp at any zoom (no raster blur),
// pinch to zoom, two-finger rotate, drag to pan. Sport-pure: no live position
// dot. Start triangle rotates so a vertex points at the first control; control
// circles are large and legible.

import { useMemo, useRef, useState } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Circle, G, Path, Polygon } from "react-native-svg";
import type { LatLon } from "@orienteering/verification-core";
import area from "../../assets/hadiko-area.json";
import { styleFor } from "./mapStyle";
import { color } from "../theme";

const meta = (area as any).meta as {
  center: { lat: number; lon: number };
};
const M_PER_LAT = 111132;
const M_PER_LON = 111320 * Math.cos((meta.center.lat * Math.PI) / 180);

// lat/lon -> local metres, north-up (SVG y grows down, so north = -y)
const toXY = (p: LatLon): [number, number] => [
  (p.lon - meta.center.lon) * M_PER_LON,
  -(p.lat - meta.center.lat) * M_PER_LAT,
];

function ringPath(coords: number[][]): string {
  return coords
    .map((c, i) => {
      const [x, y] = toXY({ lon: c[0]!, lat: c[1]! });
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join("");
}

export interface CourseMapProps {
  flags: LatLon[]; // [start, controls..., finish]
  nextIndex?: number;
  width: number;
  height: number;
}

export function CourseMap({ flags, nextIndex, width, height }: CourseMapProps) {
  // --- static map layer (memoised: rendered once, never re-created) ---
  const mapLayer = useMemo(() => {
    const feats = (area as any).features as {
      properties: { code: string };
      geometry: { type: string; coordinates: any };
    }[];
    return [...feats]
      .map((f, idx) => ({ f, st: styleFor(f.properties.code), idx }))
      .sort((a, b) => a.st.z - b.st.z)
      .map(({ f, st, idx }) => {
        const g = f.geometry;
        if (g.type === "Polygon") {
          return (
            <Path
              key={idx}
              d={ringPath(g.coordinates[0]) + "Z"}
              fill={st.fill ?? "none"}
              stroke={st.stroke ?? "none"}
              strokeWidth={st.w}
            />
          );
        }
        if (g.type === "LineString") {
          return (
            <Path
              key={idx}
              d={ringPath(g.coordinates)}
              fill="none"
              stroke={st.stroke ?? "#999"}
              strokeWidth={st.w || 1}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        }
        if (g.type === "Point") {
          const [x, y] = toXY({ lon: g.coordinates[0], lat: g.coordinates[1] });
          return <Circle key={idx} cx={x} cy={y} r={1.2} fill={st.fill ?? st.stroke ?? "#000"} />;
        }
        return null;
      });
  }, []);

  // --- course overlay in the same metre space ---
  const pts = flags.map(toXY);
  const overlay = useMemo(() => {
    const els: React.ReactNode[] = [];
    // legs
    for (let i = 1; i < pts.length; i++) {
      els.push(
        <Path key={`leg${i}`}
          d={`M${pts[i - 1]![0]} ${pts[i - 1]![1]}L${pts[i]![0]} ${pts[i]![1]}`}
          stroke={color.accent} strokeWidth={2} fill="none" />,
      );
    }
    // start triangle: apex points at the first control
    if (pts.length >= 2) {
      const [sx, sy] = pts[0]!;
      const [cx, cy] = pts[1]!;
      const ang = (Math.atan2(cy - sy, cx - sx) * 180) / Math.PI + 90; // apex up -> control
      const r = 12;
      els.push(
        <Polygon key="start"
          points={`0,${-r} ${-r * 0.87},${r * 0.5} ${r * 0.87},${r * 0.5}`}
          fill="none" stroke={color.accent} strokeWidth={2.2}
          transform={`translate(${sx} ${sy}) rotate(${ang})`} />,
      );
    }
    // controls (big circles)
    for (let i = 1; i < pts.length - 1; i++) {
      els.push(
        <Circle key={`ctrl${i}`} cx={pts[i]![0]} cy={pts[i]![1]} r={11}
          fill="none" stroke={color.accent}
          strokeWidth={nextIndex === i ? 3.4 : 2.2} />,
      );
    }
    // finish double circle
    if (pts.length > 1) {
      const [fx, fy] = pts[pts.length - 1]!;
      els.push(<Circle key="f1" cx={fx} cy={fy} r={9} fill="none" stroke={color.accent} strokeWidth={2.2} />);
      els.push(<Circle key="f2" cx={fx} cy={fy} r={14} fill="none" stroke={color.accent} strokeWidth={2.2} />);
    }
    return els;
  }, [flags, nextIndex]);

  // --- fit course to screen initially ---
  const fit = useMemo(() => {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const spanX = Math.max(...xs) - Math.min(...xs) + 120;
    const spanY = Math.max(...ys) - Math.min(...ys) + 120;
    const scale = Math.min(width / spanX, height / spanY);
    return { cx, cy, scale };
  }, [flags, width, height]);

  // --- gesture transform state ---
  const [t, setT] = useState({ k: 1, rot: 0, px: 0, py: 0 });
  const base = useRef(t);

  const pan = Gesture.Pan()
    .onBegin(() => (base.current = t))
    .onUpdate((e) =>
      setT((s) => ({ ...s, px: base.current.px + e.translationX, py: base.current.py + e.translationY })),
    );
  const pinch = Gesture.Pinch()
    .onBegin(() => (base.current = t))
    .onUpdate((e) => setT((s) => ({ ...s, k: Math.max(0.4, Math.min(6, base.current.k * e.scale)) })));
  const rotate = Gesture.Rotation()
    .onBegin(() => (base.current = t))
    .onUpdate((e) => setT((s) => ({ ...s, rot: base.current.rot + (e.rotation * 180) / Math.PI })));
  const gesture = Gesture.Simultaneous(pan, pinch, rotate);

  const scale = fit.scale * t.k;
  const transform =
    `translate(${width / 2 + t.px} ${height / 2 + t.py}) ` +
    `scale(${scale}) rotate(${t.rot}) translate(${-fit.cx} ${-fit.cy})`;

  return (
    <GestureDetector gesture={gesture}>
      <Svg width={width} height={height}>
        <G transform={transform}>
          {mapLayer}
          {overlay}
        </G>
      </Svg>
    </GestureDetector>
  );
}
