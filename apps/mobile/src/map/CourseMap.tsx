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
import Svg, { Circle, G, Path, Polygon } from "react-native-svg";
import type { LatLon } from "@orienteering/verification-core";
import area from "../../assets/hadiko-area.json";
import { styleFor } from "./mapStyle";
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

  // fit the course into the Svg viewBox (course-space metres)
  const vb = useMemo(() => {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const spanX = Math.max(...xs) - Math.min(...xs) + 160;
    const spanY = Math.max(...ys) - Math.min(...ys) + 160;
    const ar = width / height;
    let w = spanX, h = spanY;
    if (w / h > ar) h = w / ar; else w = h * ar;
    return { minX: cx - w / 2, minY: cy - h / 2, w, h };
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
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      transform: [
                        { translateX: pan.x },
                        { translateY: pan.y },
                        { rotate: rotateDeg },
                        { scale },
                      ],
                    },
                  ]}
                >
                  <Svg width={width} height={height}
                    viewBox={`${vb.minX} ${vb.minY} ${vb.w} ${vb.h}`}>
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
        style={[styles.compass, { transform: [{ rotate: counterRotate }] }]}
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
