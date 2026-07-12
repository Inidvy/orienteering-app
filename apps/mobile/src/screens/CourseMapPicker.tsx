// Course selection on a real OSM map: a pin per course start; tap a pin to see
// its name, control count, length and difficulty, then start it. Rendered with
// Leaflet inside a WebView (real OSM tiles, popups) — works in Expo Go.

import { WebView } from "react-native-webview";
import { StyleSheet, View } from "react-native";
import type { CourseSpec } from "@orienteering/run-engine";

export interface CoursePin {
  spec: CourseSpec;
  name: string;
  lengthM: number;
  difficulty: "Easy" | "Medium" | "Hard";
  /** start-flag position */
  start: { lat: number; lon: number };
}

const DIFF_COLOR = { Easy: "#0a7a0a", Medium: "#b45309", Hard: "#b91c1c" };

function html(courses: CoursePin[]): string {
  const data = courses.map((c) => ({
    id: c.spec.id,
    name: c.name,
    controls: c.spec.flagOrder.length - 2,
    lengthKm: (c.lengthM / 1000).toFixed(1),
    difficulty: c.difficulty,
    color: DIFF_COLOR[c.difficulty],
    lat: c.start.lat,
    lon: c.start.lon,
  }));
  return `<!doctype html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html,body,#m{height:100%;margin:0}
  .info{font-family:system-ui,sans-serif;min-width:180px}
  .info b{font-size:15px}
  .meta{color:#444;font-size:13px;margin:4px 0 8px}
  .pill{display:inline-block;padding:1px 8px;border-radius:999px;color:#fff;font-size:12px;font-weight:700}
  .go{width:100%;padding:10px;background:#d10f7c;color:#fff;border:0;border-radius:8px;font-weight:700;font-size:14px}
</style></head><body><div id="m"></div><script>
  var courses = ${JSON.stringify(data)};
  var map = L.map('m',{zoomControl:true}).setView([49.0184,8.4289],14);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    {maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
  function sel(id){ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(id); }
  var pts=[];
  courses.forEach(function(c){
    var icon = L.divIcon({className:'',iconSize:[26,26],iconAnchor:[13,13],
      html:'<div style="width:22px;height:22px;border-radius:50%;background:'+c.color+
           ';border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>'});
    var mk = L.marker([c.lat,c.lon],{icon:icon}).addTo(map);
    mk.bindPopup('<div class="info"><b>'+c.name+'</b>'+
      '<div class="meta">'+c.controls+' controls · '+c.lengthKm+' km · '+
      '<span class="pill" style="background:'+c.color+'">'+c.difficulty+'</span></div>'+
      '<button class="go" onclick="sel(\\''+c.id+'\\')">Start this course</button></div>');
    pts.push([c.lat,c.lon]);
  });
  if(pts.length>1) map.fitBounds(pts,{padding:[50,50]});
  else if(pts.length===1) map.setView(pts[0],15);
</script></body></html>`;
}

export function CourseMapPicker({
  courses,
  onSelect,
}: {
  courses: CoursePin[];
  onSelect: (courseId: string) => void;
}) {
  return (
    <View style={styles.root}>
      <WebView
        originWhitelist={["*"]}
        source={{ html: html(courses) }}
        onMessage={(e) => onSelect(e.nativeEvent.data)}
        style={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  web: { flex: 1 },
});
