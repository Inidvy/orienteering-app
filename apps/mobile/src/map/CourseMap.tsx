// Vector O-map + course overlay. Zoom / rotate / pan handled by react-native-
// gesture-handler driving core RN Animated values (useNativeDriver) applied to
// a wrapping Animated.View — smooth, and works in Expo Go (no reanimated).
// Sport-pure: no live position dot. Start triangle points at the first control.

import { useMemo, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import {
  PanGestureHandler,
  PinchGestureHandler,
  RotationGestureHandler,
  State,
  type PanGestureHandlerStateChangeEvent,
  type PinchGestureHandlerStateChangeEvent,
  type RotationGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import Svg, { Circle, G, Path, Polygon, Text as SvgText } from "react-native-svg";
import type { LatLon } from "@orienteering/verification-core";
import area from "../../assets/hadiko-area.json";
import { styleOf } from "./mapStyle";
import { color } from "../theme";

const meta = (area as any).meta as { center: { lat: number; lon: number } };
const M_PER_LAT = 111132;
const M_PER_LON = 111320 * Math.cos((meta.center.lat * Math.PI) / 180);
const toXY = (p: LatLon): [number, number] => [
  (p.lon - meta.center.lon) * M_PER_LON,
  -(p.lat - meta.center.lat) * M_PER_LAT,
];
const ringPath = (coords: number[][]): string =>
  coords
    .map((c, i) => {
      const [x, y] = toXY({ lon: c[0]!, lat: c[1]! });
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join("");

export interface CourseMapProps {
  flags: LatLon[];
  nextIndex?: number;
  width: number;
  height: number;
  /** px from the top the compass should clear (below the top bar) */
  topInset?: number;
  /** recorded GPS route to draw (finish/replay view) */
  track?: LatLon[];
}

export function CourseMap({ flags, nextIndex, width, height, topInset = 96, track }: CourseMapProps) {
  const mapLayer = useMemo(() => {
    const feats = (area as any).features as {
      properties: { code: string; c?: string | null; s?: string | null; w?: number; z?: number };
      geometry: { type: string; coordinates: any };
    }[];
    return [...feats]
      .map((f, idx) => ({ f, st: styleOf(f.properties), idx }))
      .sort((a, b) => a.st.z - b.st.z)
      .map(({ f, st, idx }) => {
        const g = f.geometry;
        if (g.type === "Polygon")
          return (
            <Path key={idx} d={ringPath(g.coordinates[0]) + "Z"}
              fill={st.fill ?? "none"} stroke={st.stroke ?? "none"} strokeWidth={st.w} />
          );
        if (g.type === "LineString")
          return (
            <Path key={idx} d={ringPath(g.coordinates)} fill="none"
              stroke={st.stroke ?? "#999"} strokeWidth={st.w || 1}
              strokeLinejoin="round" strokeLinecap="round" />
          );
        if (g.type === "Point") {
          const [x, y] = toXY({ lon: g.coordinates[0], lat: g.coordinates[1] });
          return <Circle key={idx} cx={x} cy={y} r={1.2} fill={st.fill ?? st.stroke ?? "#000"} />;
        }
        return null;
      });
  }, []);

  const pts = useMemo(() => flags.map(toXY), [flags]);

  const overlay = useMemo(() => {
    const els: React.ReactNode[] = [];
    // recorded GPS route (blue), drawn under the course
    if (track && track.length > 1) {
      const d = track
        .map((p, i) => {
          const [x, y] = toXY(p);
          return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join("");
      els.push(
        <Path key="gpstrack" d={d} stroke="#2b6fd4" strokeWidth={3} fill="none"
          strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />,
      );
    }
    // marker radius per course position (start / control / finish)
    const radiusAt = (i: number) =>
      i === 0 ? 19 : i === pts.length - 1 ? 22 : 18;
    const GAP = 5; // legs stop this far outside the circle

    // legs — trimmed so they start/end just outside each circle
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1]!, [bx, by] = pts[i]!;
      const dx = bx - ax, dy = by - ay;
      const L = Math.hypot(dx, dy) || 1;
      const ux = dx / L, uy = dy / L;
      const rA = radiusAt(i - 1) + GAP, rB = radiusAt(i) + GAP;
      if (L <= rA + rB) continue; // too close — no visible leg
      els.push(
        <Path key={`leg${i}`}
          d={`M${ax + ux * rA} ${ay + uy * rA}L${bx - ux * rB} ${by - uy * rB}`}
          stroke={color.accent} strokeWidth={2.6} fill="none" />,
      );
    }

    if (pts.length >= 1) {
      // pre-start lock passes ONLY the start flag: triangle points north then
      // (no course direction revealed); with the full course it points at C1
      const [sx, sy] = pts[0]!;
      const ang =
        pts.length >= 2
          ? (Math.atan2(pts[1]![1] - sy, pts[1]![0] - sx) * 180) / Math.PI + 90
          : 0;
      const r = 19;
      els.push(
        <Polygon key="start"
          points={`0,${-r} ${-r * 0.87},${r * 0.5} ${r * 0.87},${r * 0.5}`}
          fill="none" stroke={color.accent} strokeWidth={3.4}
          transform={`translate(${sx} ${sy}) rotate(${ang})`} />,
      );
    }
    for (let i = 1; i < pts.length - 1; i++) {
      const [x, y] = pts[i]!;
      els.push(
        <Circle key={`ctrl${i}`} cx={x} cy={y} r={18}
          fill="none" stroke={color.accent} strokeWidth={nextIndex === i ? 5 : 3.4} />,
      );
      // small control number, offset up-right so it doesn't clutter the circle
      els.push(
        <SvgText key={`num${i}`} x={x + 20} y={y - 16} fontSize={17}
          fontWeight="bold" fill={color.accent}>{i}</SvgText>,
      );
    }
    if (pts.length > 1) {
      const [fx, fy] = pts[pts.length - 1]!;
      els.push(<Circle key="f1" cx={fx} cy={fy} r={15} fill="none" stroke={color.accent} strokeWidth={3.4} />);
      els.push(<Circle key="f2" cx={fx} cy={fy} r={22} fill="none" stroke={color.accent} strokeWidth={3.4} />);
    }
    return els;
  }, [pts, nextIndex, track]);

  // The rendered Svg is a big square (2.2x the screen) centred on the screen,
  // so rotation/zoom pivot on the screen centre and there is map content to
  // reveal when rotating (no clipped white edges). viewBox is chosen so the
  // course fits the screen at scale 1.
  const layout = useMemo(() => {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const spanX = Math.max(...xs) - Math.min(...xs) + 160;
    const spanY = Math.max(...ys) - Math.min(...ys) + 160;
    const S = 2.2 * Math.max(width, height);
    // visible screen shows (width/S)*G x (height/S)*G metres -> fit the course
    const G = Math.max((spanX * S) / width, (spanY * S) / height);
    return {
      S,
      left: (width - S) / 2,
      top: (height - S) / 2,
      viewBox: `${cx - G / 2} ${cy - G / 2} ${G} ${G}`,
    };
  }, [pts, width, height]);

  // --- gesture-driven transforms on the native thread ---
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const baseScale = useRef(new Animated.Value(1)).current;
  const pinch = useRef(new Animated.Value(1)).current;
  const scale = Animated.multiply(baseScale, pinch);
  const baseRot = useRef(new Animated.Value(0)).current;
  const gestRot = useRef(new Animated.Value(0)).current;
  const rotationRad = Animated.add(baseRot, gestRot);
  const rotateDeg = rotationRad.interpolate({
    inputRange: [-Math.PI, Math.PI],
    outputRange: ["-180deg", "180deg"],
  });
  const counterRotate = rotationRad.interpolate({
    inputRange: [-Math.PI, Math.PI],
    outputRange: ["180deg", "-180deg"],
  });

  const pinchRef = useRef(null);
  const rotRef = useRef(null);
  const panRef = useRef(null);
  const lastScale = useRef(1);
  const lastRot = useRef(0);

  const onPan = Animated.event(
    [{ nativeEvent: { translationX: pan.x, translationY: pan.y } }],
    { useNativeDriver: true },
  );
  const onPanState = (e: PanGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.oldState === State.ACTIVE) pan.extractOffset();
  };
  const onPinch = Animated.event([{ nativeEvent: { scale: pinch } }], {
    useNativeDriver: true,
  });
  const onPinchState = (e: PinchGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.oldState === State.ACTIVE) {
      lastScale.current *= e.nativeEvent.scale;
      lastScale.current = Math.max(0.4, Math.min(8, lastScale.current));
      baseScale.setValue(lastScale.current);
      pinch.setValue(1);
    }
  };
  const onRotate = Animated.event([{ nativeEvent: { rotation: gestRot } }], {
    useNativeDriver: true,
  });
  const onRotateState = (e: RotationGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.oldState === State.ACTIVE) {
      lastRot.current += e.nativeEvent.rotation;
      baseRot.setValue(lastRot.current);
      gestRot.setValue(0);
    }
  };

  return (
    <View style={{ width, height, overflow: "hidden" }}>
      <PanGestureHandler
        ref={panRef}
        onGestureEvent={onPan}
        onHandlerStateChange={onPanState}
        minPointers={1}
        maxPointers={2}
        simultaneousHandlers={[pinchRef, rotRef]}
      >
        <Animated.View style={StyleSheet.absoluteFill}>
          <PinchGestureHandler
            ref={pinchRef}
            onGestureEvent={onPinch}
            onHandlerStateChange={onPinchState}
            simultaneousHandlers={[panRef, rotRef]}
          >
            <Animated.View style={StyleSheet.absoluteFill}>
              <RotationGestureHandler
                ref={rotRef}
                onGestureEvent={onRotate}
                onHandlerStateChange={onRotateState}
                simultaneousHandlers={[panRef, pinchRef]}
              >
                <Animated.View
                  // rasterize the (large) SVG into a GPU texture once, so
                  // pan/zoom/rotate move a texture instead of re-rendering
                  // thousands of vector paths per frame (lag fix 2026-07-12)
                  renderToHardwareTextureAndroid
                  shouldRasterizeIOS
                  style={{
                    position: "absolute",
                    left: layout.left,
                    top: layout.top,
                    width: layout.S,
                    height: layout.S,
                    transform: [
                      { translateX: pan.x },
                      { translateY: pan.y },
                      { rotate: rotateDeg },
                      { scale },
                    ],
                  }}
                >
                  <Svg width={layout.S} height={layout.S} viewBox={layout.viewBox}>
                    <G>
                      {mapLayer}
                      {overlay}
                    </G>
                  </Svg>
                </Animated.View>
              </RotationGestureHandler>
            </Animated.View>
          </PinchGestureHandler>
        </Animated.View>
      </PanGestureHandler>

      {/* mini compass — counter-rotates to keep pointing north */}
      <Animated.View
        style={[styles.compass, { top: topInset }, { transform: [{ rotate: counterRotate }] }]}
        pointerEvents="none"
      >
        <Text style={styles.compassN}>N</Text>
        <View style={styles.needle} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  compass: {
    position: "absolute",
    right: 14,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(20,20,20,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  compassN: { color: "#fff", fontSize: 12, fontWeight: "800", marginTop: 2 },
  needle: {
    position: "absolute",
    top: 4,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: color.accent,
  },
});
