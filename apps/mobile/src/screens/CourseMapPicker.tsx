// Course selection on a real OSM map: a pin per course START POINT; courses
// sharing a start collapse into one pin with a count badge, and its popup
// lists every course there (they'd otherwise stack unclickably). Courses the
// runner already ran show GREY (done) instead of their difficulty color.
// Rendered with Leaflet inside a WebView (real OSM tiles) — works in Expo Go.

import { useEffect, useRef } from "react";
import { WebView } from "react-native-webview";
import { StyleSheet, View } from "react-native";
import * as Location from "expo-location";
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
const DONE_COLOR = "#6b7280"; // already-run courses (color.muted)

function html(
  courses: CoursePin[],
  doneCourseIds: string[],
  myBest: Record<string, string>,
  coolingCourseIds: string[],
): string {
  const done = new Set(doneCourseIds);
  const cooling = new Set(coolingCourseIds);
  const data = courses.map((c) => ({
    id: c.spec.id,
    name: c.name,
    controls: c.spec.flagOrder.length - 2,
    lengthKm: (c.lengthM / 1000).toFixed(1),
    difficulty: c.difficulty,
    color: done.has(c.spec.id) ? DONE_COLOR : DIFF_COLOR[c.difficulty],
    done: done.has(c.spec.id),
    cooling: cooling.has(c.spec.id),
    best: myBest[c.spec.id] ?? null,
    lat: c.start.lat,
    lon: c.start.lon,
  }));
  return `<!doctype html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@800&family=IBM+Plex+Mono:wght@600&display=swap" rel="stylesheet"/>
<style>
  html,body,#m{height:100%;margin:0}
  .info{font-family:system-ui,sans-serif;min-width:184px}
  .info b{font-family:'Archivo',system-ui,sans-serif;font-size:16px;letter-spacing:-0.2px}
  .meta{font-family:'IBM Plex Mono',ui-monospace,monospace;color:#6b7280;font-size:12px;margin:6px 0 10px;text-transform:uppercase;letter-spacing:0.3px}
  .pill{display:inline-block;padding:1px 8px;border-radius:999px;color:#fff;font-size:11px;font-weight:600;letter-spacing:0.3px}
  .go{width:100%;padding:11px;background:#e6007e;color:#fff;border:0;border-radius:10px;font-family:'IBM Plex Mono',ui-monospace,monospace;font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:0.5px}
  .go.view{background:#16130f;margin-top:6px}
  #loc{position:absolute;right:12px;bottom:28px;z-index:1000;width:60px;height:60px;border-radius:50%;background:#fff;border:2px solid rgba(0,0,0,.2);box-shadow:0 1px 6px rgba(0,0,0,.4);font-size:32px;line-height:1;color:#2b6fd4}
</style></head><body><div id="m"></div><button id="loc" aria-label="find me">&#9678;</button><script>
  var courses = ${JSON.stringify(data)};
  var map = L.map('m',{zoomControl:true}).setView([49.0184,8.4289],14);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    {maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
  function sel(id,action){
    if(window.ReactNativeWebView)
      window.ReactNativeWebView.postMessage(JSON.stringify({id:id,action:action||'start'}));
  }
  // live position marker, updated from React Native via window.setPos(lat,lon)
  var me=null;
  window.setPos=function(lat,lon){
    if(!me){ me=L.circleMarker([lat,lon],{radius:8,color:'#2b6fd4',fillColor:'#2b6fd4',fillOpacity:1,weight:3}).addTo(map).bindTooltip('you'); }
    else me.setLatLng([lat,lon]);
  };
  // group courses that share a start point — stacked markers would hide each
  // other; one pin with a count badge lists them all in its popup
  var groups={};
  courses.forEach(function(c){
    var k=c.lat.toFixed(5)+','+c.lon.toFixed(5);
    (groups[k]=groups[k]||[]).push(c);
  });
  // done course: ASK — run again (cooldown note when the re-run would be
  // unranked) or look at the old run
  function courseBlock(c){
    var buttons = c.done
      ? '<button class="go" onclick="sel(\\''+c.id+'\\',\\'start\\')">Run again'+
        (c.cooling?' · unranked this week':'')+'</button>'+
        '<button class="go view" onclick="sel(\\''+c.id+'\\',\\'view\\')">View my run</button>'
      : '<button class="go" onclick="sel(\\''+c.id+'\\',\\'start\\')">Start this course</button>';
    return '<div style="margin-bottom:10px"><b>'+c.name+'</b>'+
      '<div class="meta">'+c.controls+' controls · '+c.lengthKm+' km · '+
      '<span class="pill" style="background:'+c.color+'">'+
      (c.done?'&#10003; done':c.difficulty)+'</span>'+
      (c.best?' · your best '+c.best:'')+'</div>'+buttons+'</div>';
  }
  var pts=[];
  Object.keys(groups).forEach(function(k){
    var g=groups[k];
    // pin color: first not-yet-run course wins; all done => grey
    var lead=g.find(function(c){return !c.done;})||g[0];
    var badge=g.length>1
      ? '<div style="position:absolute;top:-7px;right:-9px;background:#16130f;color:#fff;'+
        'border-radius:999px;min-width:17px;height:17px;line-height:17px;text-align:center;'+
        'font:600 11px system-ui">'+g.length+'</div>'
      : '';
    var icon=L.divIcon({className:'',iconSize:[26,26],iconAnchor:[13,13],
      html:'<div style="position:relative;width:22px;height:22px;border-radius:50%;background:'+
        lead.color+';border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">'+badge+'</div>'});
    var mk=L.marker([g[0].lat,g[0].lon],{icon:icon}).addTo(map);
    mk.bindPopup('<div class="info">'+g.map(courseBlock).join('<hr style="border:0;border-top:1px solid #e7e3dc">')+'</div>');
    pts.push([g[0].lat,g[0].lon]);
  });
  if(pts.length>1) map.fitBounds(pts,{padding:[50,50]});
  else if(pts.length===1) map.setView(pts[0],15);
  // find-me: flies to the live "you" marker (fed from React Native)
  var loc=document.getElementById('loc');
  loc.onclick=function(){ if(me) map.setView(me.getLatLng(),16); };
</script></body></html>`;
}

export function CourseMapPicker({
  courses,
  doneCourseIds = [],
  myBest = {},
  coolingCourseIds = [],
  onSelect,
  onViewRun,
}: {
  courses: CoursePin[];
  /** courses the viewer already ran — pins render grey ("done") */
  doneCourseIds?: string[];
  /** courseId -> formatted own best time, shown in the popup of done courses */
  myBest?: Record<string, string>;
  /** courses whose re-run would be unranked (7-day cooldown) */
  coolingCourseIds?: string[];
  onSelect: (courseId: string) => void;
  /** "View my run" on a done course */
  onViewRun?: (courseId: string) => void;
}) {
  const webRef = useRef<WebView>(null);

  // live GPS -> push into the Leaflet map as the "you" marker
  useEffect(() => {
    let sub: Location.LocationSubscription | undefined;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5 },
        (loc) => {
          const { latitude, longitude } = loc.coords;
          webRef.current?.injectJavaScript(
            `window.setPos && window.setPos(${latitude},${longitude});true;`,
          );
        },
      );
    })();
    return () => sub?.remove();
  }, []);

  return (
    <View style={styles.root}>
      <WebView
        ref={webRef}
        originWhitelist={["*"]}
        source={{ html: html(courses, doneCourseIds, myBest, coolingCourseIds) }}
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data);
            if (msg.action === "view") onViewRun?.(msg.id);
            else onSelect(msg.id);
          } catch {
            onSelect(e.nativeEvent.data); // legacy plain-id message
          }
        }}
        style={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  web: { flex: 1 },
});
