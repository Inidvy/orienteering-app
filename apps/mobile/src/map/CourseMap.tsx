// Vector O-map + course overlay. Gestures run on the UI thread via reanimated
// (no per-frame React re-render, so pan/zoom/rotate stay smooth). A small
// compass rose rotates to keep pointing at true north as the map turns.
// Sport-pure: no live position dot. Start triangle points at the first control.

import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import Svg, { Circle, G, Path, Polygon } from "react-native-svg";
import type { LatLon } from "@orienteering/verification-core";
import area from "../../assets/hadiko-area.json";
import { styleFor } from "./mapStyle";
import { color } from "../theme";

const AnimatedG = Animated.createAnimatedComponent(G);

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
}

export function CourseMap({ flags, nextIndex, width, height }: CourseMapProps) {
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
    for (let i = 1; i < pts.length; i++)
      els.push(
        <Path key={`leg${i}`}
          d={`M${pts[i - 1]![0]} ${pts[i - 1]![1]}L${pts[i]![0]} ${pts[i]![1]}`}
          stroke={color.accent} strokeWidth={2} fill="none" />,
      );
    if (pts.length >= 2) {
      const [sx, sy] = pts[0]!, [cx, cy] = pts[1]!;
      const ang = (Math.atan2(cy - sy, cx - sx) * 180) / Math.PI + 90;
      const r = 12;
      els.push(
        <Polygon key="start"
          points={`0,${-r} ${-r * 0.87},${r * 0.5} ${r * 0.87},${r * 0.5}`}
          fill="none" stroke={color.accent} strokeWidth={2.4}
          transform={`translate(${sx} ${sy}) rotate(${ang})`} />,
      );
    }
    for (let i = 1; i < pts.length - 1; i++)
      els.push(
        <Circle key={`ctrl${i}`} cx={pts[i]![0]} cy={pts[i]![1]} r={12}
          fill="none" stroke={color.accent} strokeWidth={nextIndex === i ? 3.6 : 2.4} />,
      );
    if (pts.length > 1) {
      const [fx, fy] = pts[pts.length - 1]!;
      els.push(<Circle key="f1" cx={fx} cy={fy} r={9} fill="none" stroke={color.accent} strokeWidth={2.4} />);
      els.push(<Circle key="f2" cx={fx} cy={fy} r={14} fill="none" stroke={color.accent} strokeWidth={2.4} />);
    }
    return els;
  }, [pts, nextIndex]);

  const fit = useMemo(() => {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const spanX = Math.max(...xs) - Math.min(...xs) + 140;
    const spanY = Math.max(...ys) - Math.min(...ys) + 140;
    return { cx, cy, scale: Math.min(width / spanX, height / spanY) };
  }, [pts, width, height]);

  // --- reanimated shared values (UI thread) ---
  const scale = useSharedValue(1);
  const rot = useSharedValue(0); // degrees
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sScale = useSharedValue(1);
  const sRot = useSharedValue(0);
  const sTx = useSharedValue(0);
  const sTy = useSharedValue(0);

  const pan = Gesture.Pan()
    .onBegin(() => { "worklet"; sTx.value = tx.value; sTy.value = ty.value; })
    .onUpdate((e) => { "worklet"; tx.value = sTx.value + e.translationX; ty.value = sTy.value + e.translationY; });
  const pinch = Gesture.Pinch()
    .onBegin(() => { "worklet"; sScale.value = scale.value; })
    .onUpdate((e) => { "worklet"; scale.value = Math.max(0.4, Math.min(8, sScale.value * e.scale)); });
  const rotate = Gesture.Rotation()
    .onBegin(() => { "worklet"; sRot.value = rot.value; })
    .onUpdate((e) => { "worklet"; rot.value = sRot.value + (e.rotation * 180) / Math.PI; });
  const gesture = Gesture.Simultaneous(pan, pinch, rotate);

  const { cx, cy, scale: fitScale } = fit;
  const w2 = width / 2, h2 = height / 2;
  const animatedProps = useAnimatedProps(() => {
    "worklet";
    const s = fitScale * scale.value;
    return {
      transform:
        `translate(${w2 + tx.value} ${h2 + ty.value}) scale(${s}) ` +
        `rotate(${rot.value}) translate(${-cx} ${-cy})`,
    };
  });

  const compassStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-rot.value}deg` }],
  }));

  return (
    <View style={{ width, height }}>
      <GestureDetector gesture={gesture}>
        <Svg width={width} height={height}>
          <AnimatedG animatedProps={animatedProps}>
            {mapLayer}
            {overlay}
          </AnimatedG>
        </Svg>
      </GestureDetector>
      {/* mini compass — rotates to keep pointing north */}
      <Animated.View style={[styles.compass, compassStyle]} pointerEvents="none">
        <Text style={styles.compassN}>N</Text>
        <View style={styles.needle} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  compass: {
    position: "absolute",
    top: 96,
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
