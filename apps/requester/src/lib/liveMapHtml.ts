// Identical to apps/runner/src/lib/liveMapHtml.ts — see components/GlassCard.tsx's
// header comment for why it's duplicated.
//
// The page shown inside the live-tracking WebView (Leaflet + OpenStreetMap).
// Two people can appear on it — the runner and the requester — each drawn as
// a round avatar (their profile picture, or their initial if they have none).
// React Native drives the page by calling the window functions defined at the
// bottom:
//   setAvatar(key, name, pictureUri)   key is "runner" or "requester"
//   setPerson(key, lat, lng)           moves (or first places) that person
import { getTheme } from "@gracerandly/theme";
import type { GeoPoint } from "@gracerandly/shared-types";
import { LEAFLET_JS, LEAFLET_CSS } from "./leafletAssets";

const theme = getTheme("light");

export interface LiveMapHtmlOptions {
  pickup: GeoPoint;
  dropoff: GeoPoint;
  /** Road route to draw; omit for no line (the pins and people still show). */
  routeCoordinates?: [number, number][];
}

export function buildLiveMapHtml({ pickup, dropoff, routeCoordinates }: LiveMapHtmlOptions): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>${LEAFLET_CSS}</style>
  <style>
    html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; }
    .leaflet-control-attribution { font-size: 8px; }
    .avatar {
      width: 40px; height: 40px; border-radius: 50%;
      border: 3px solid #fff;
      background: ${theme.colors.primary};
      box-shadow: 0 0 0 2px var(--ring), 0 2px 6px rgba(0,0,0,0.4);
      overflow: hidden;
      display: flex; align-items: center; justify-content: center;
      color: #fff; font: 600 16px sans-serif;
      box-sizing: border-box;
    }
    .avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>${LEAFLET_JS}</script>
  <script>
    var map = L.map('map', { zoomControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    function dot(color) {
      return L.divIcon({
        className: '',
        html: '<div style="background:' + color + ';width:14px;height:14px;border-radius:7px;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>',
        iconSize: [14, 14]
      });
    }

    var pickupLatLng = L.latLng(${pickup.lat}, ${pickup.lng});
    var dropoffLatLng = L.latLng(${dropoff.lat}, ${dropoff.lng});
    L.marker(pickupLatLng, { icon: dot('${theme.colors.primary}') }).addTo(map);
    L.marker(dropoffLatLng, { icon: dot('${theme.colors.primaryDark}') }).addTo(map);
    var routeLine = ${
      routeCoordinates && routeCoordinates.length > 1
        ? `L.polyline(${JSON.stringify(routeCoordinates)}, { color: '${theme.colors.primary}', weight: 4, opacity: 0.6 }).addTo(map)`
        : "null"
    };

    var PEOPLE_RING = { runner: '${theme.colors.primaryDark}', requester: '${theme.colors.primary}' };
    var people = { runner: null, requester: null };

    function allPoints() {
      var pts = [pickupLatLng, dropoffLatLng];
      if (routeLine) pts = pts.concat(routeLine.getLatLngs());
      if (people.runner && people.runner.latLng) pts.push(people.runner.latLng);
      if (people.requester && people.requester.latLng) pts.push(people.requester.latLng);
      return pts;
    }

    function fitEveryone() {
      map.fitBounds(L.latLngBounds(allPoints()), { padding: [40, 40], maxZoom: 17, animate: true });
    }
    fitEveryone();

    function ensurePerson(key) {
      if (!people[key]) people[key] = { marker: null, latLng: null, name: '', uri: '', frame: null };
      return people[key];
    }

    // Built with DOM calls (not an HTML string) so a name or picture can
    // never be interpreted as markup.
    function makeIcon(key) {
      var p = ensurePerson(key);
      var el = document.createElement('div');
      el.className = 'avatar';
      el.style.setProperty('--ring', PEOPLE_RING[key]);
      if (p.uri) {
        var img = document.createElement('img');
        img.src = p.uri;
        img.onerror = function () { img.remove(); el.textContent = (p.name || '?').trim().charAt(0).toUpperCase() || '?'; };
        el.appendChild(img);
      } else {
        el.textContent = (p.name || '?').trim().charAt(0).toUpperCase() || '?';
      }
      return L.divIcon({ className: '', html: el, iconSize: [40, 40], iconAnchor: [20, 20] });
    }

    function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

    window.setAvatar = function (key, name, uri) {
      var p = ensurePerson(key);
      p.name = name || '';
      p.uri = uri || '';
      if (p.marker) p.marker.setIcon(makeIcon(key));
    };

    // Called from React Native on every new position. Glides the avatar from
    // its last spot to the new one instead of snapping, and widens the view
    // if the person has moved out of sight.
    window.setPerson = function (key, lat, lng) {
      var p = ensurePerson(key);
      var target = L.latLng(lat, lng);

      if (!p.marker) {
        p.marker = L.marker(target, { icon: makeIcon(key), zIndexOffset: key === 'runner' ? 1000 : 900 }).addTo(map);
        p.latLng = target;
        fitEveryone();
        return;
      }

      var start = p.latLng;
      var startTime = performance.now();
      var durationMs = 1800;
      if (p.frame) cancelAnimationFrame(p.frame);
      function step(now) {
        var t = Math.min(1, (now - startTime) / durationMs);
        var eased = easeInOutQuad(t);
        p.marker.setLatLng([
          start.lat + (target.lat - start.lat) * eased,
          start.lng + (target.lng - start.lng) * eased
        ]);
        if (t < 1) p.frame = requestAnimationFrame(step);
      }
      p.frame = requestAnimationFrame(step);
      p.latLng = target;

      if (!map.getBounds().pad(-0.1).contains(target)) fitEveryone();
    };
  </script>
</body>
</html>`;
}
