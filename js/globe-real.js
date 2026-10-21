// The realistic globe: MapLibre GL (globe projection) with real satellite imagery, relief shading,
// rivers, borders, roads, labels and 3D buildings. It has the same interface as the classic Globe in
// globe-engine.js, so the globe view can use either. Everything here is free and needs no account or key:
//   imagery   Sentinel-2 cloudless by EOX (+ Esri World Imagery when zoomed right in)
//   relief    AWS Terrarium elevation tiles
//   vectors   OpenFreeMap (OpenStreetMap data): rivers, borders, roads, buildings, place names
import { inRing } from './globe-engine.js';

const VERSION = '5.24.0';
const LIB = [`https://cdn.jsdelivr.net/npm/maplibre-gl@${VERSION}/dist/`, `https://unpkg.com/maplibre-gl@${VERSION}/dist/`];

const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const EMPTY = { type: 'FeatureCollection', features: [] };

let libPromise = null;
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load ' + src));
    document.head.append(s);
  });
}
export function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  libPromise ||= (async () => {
    let err;
    for (const base of LIB) {
      try {
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = base + 'maplibre-gl.css';
        document.head.append(l);
        await loadScript(base + 'maplibre-gl.js');
        if (window.maplibregl) return window.maplibregl;
      } catch (e) {
        err = e;
      }
    }
    libPromise = null;
    throw err || new Error('MapLibre is not available');
  })();
  return libPromise;
}

// ---- the style ---------------------------------------------------------------
const FONT = ['Noto Sans Bold'];
const FONT_REG = ['Noto Sans Regular'];

export function buildStyle({ hiRes = true } = {}) {
  const gold = '#ffc93c';
  const coral = '#ff6b5e';
  return {
    version: 8,
    name: 'Before I die',
    projection: { type: 'globe' },
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sky: {
      'sky-color': '#0b1b44',
      'sky-horizon-blend': 0.5,
      'horizon-color': '#7cc0ff',
      'horizon-fog-blend': 0.55,
      'fog-color': '#a9d3ff',
      'fog-ground-blend': 0.4,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7.5, 0]
    },
    sources: {
      sat: {
        type: 'raster',
        tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg'],
        tileSize: 256,
        maxzoom: 13,
        attribution: '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless by EOX</a> (contains modified Copernicus Sentinel data 2020)'
      },
      ...(hiRes
        ? {
            hi: {
              type: 'raster',
              tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
              tileSize: 256,
              maxzoom: 19,
              attribution: 'Imagery © Esri, Maxar, Earthstar Geographics'
            }
          }
        : {}),
      dem: {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 12,
        attribution: 'Terrain: Mapzen / AWS Open Data'
      },
      omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' },
      visited: { type: 'geojson', data: EMPTY },
      arcs: { type: 'geojson', data: EMPTY },
      traveller: { type: 'geojson', data: EMPTY },
      places: { type: 'geojson', data: EMPTY },
      ring: { type: 'geojson', data: EMPTY }
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#04102a' } },
      {
        id: 'sat',
        type: 'raster',
        source: 'sat',
        paint: { 'raster-saturation': 0.18, 'raster-contrast': 0.12, 'raster-brightness-max': 0.92, 'raster-fade-duration': 300 }
      },
      ...(hiRes
        ? [
            {
              id: 'hi',
              type: 'raster',
              source: 'hi',
              minzoom: 9,
              paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0, 11.5, 1], 'raster-saturation': 0.1, 'raster-fade-duration': 300 }
            }
          ]
        : []),
      {
        id: 'relief',
        type: 'hillshade',
        source: 'dem',
        paint: {
          'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 0, 0.25, 6, 0.45, 12, 0.3],
          'hillshade-shadow-color': '#050b1e',
          'hillshade-highlight-color': 'rgba(255,255,255,0.35)',
          'hillshade-accent-color': '#0a1630'
        }
      },
      {
        id: 'visited-fill',
        type: 'fill',
        source: 'visited',
        paint: { 'fill-color': gold, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.2, 6, 0.1, 9, 0] }
      },
      {
        id: 'visited-line',
        type: 'line',
        source: 'visited',
        paint: { 'line-color': gold, 'line-opacity': 0.65, 'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.8, 6, 1.6] }
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'omt',
        'source-layer': 'waterway',
        minzoom: 4,
        filter: ['in', ['get', 'class'], ['literal', ['river', 'canal']]],
        paint: { 'line-color': '#7cc8ff', 'line-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.35, 10, 0.7], 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 10, 1.6, 15, 4] }
      },
      {
        id: 'border-country',
        type: 'line',
        source: 'omt',
        'source-layer': 'boundary',
        filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
        paint: { 'line-color': '#ffffff', 'line-opacity': 0.55, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.5, 8, 1.4] }
      },
      {
        id: 'border-state',
        type: 'line',
        source: 'omt',
        'source-layer': 'boundary',
        minzoom: 4,
        filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
        paint: { 'line-color': '#ffffff', 'line-opacity': 0.3, 'line-width': 0.8, 'line-dasharray': [3, 2] }
      },
      {
        id: 'roads-major',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        minzoom: 7,
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffd98a', 'line-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.35, 12, 0.7], 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.4, 12, 1.6, 17, 6] }
      },
      {
        id: 'roads-minor',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        minzoom: 12,
        filter: ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary', 'minor', 'service']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-opacity': 0.4, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.3, 17, 3] }
      },
      {
        id: 'buildings',
        type: 'fill-extrusion',
        source: 'omt',
        'source-layer': 'building',
        minzoom: 13,
        paint: {
          'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 5], 0, '#8fa3c7', 40, '#d3defa', 150, '#ffffff'],
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 5],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 15, 0.88],
          'fill-extrusion-vertical-gradient': true
        }
      },
      {
        id: 'arcs-glow',
        type: 'line',
        source: 'arcs',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': gold, 'line-opacity': 0.25, 'line-width': 7, 'line-blur': 5 }
      },
      {
        id: 'arcs-line',
        type: 'line',
        source: 'arcs',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffe08a', 'line-opacity': 0.9, 'line-width': 1.6 }
      },
      { id: 'traveller-glow', type: 'circle', source: 'traveller', paint: { 'circle-radius': 11, 'circle-color': '#fff2b8', 'circle-opacity': 0.5, 'circle-blur': 1 } },
      { id: 'traveller', type: 'circle', source: 'traveller', paint: { 'circle-radius': 3.5, 'circle-color': '#ffffff' } },
      {
        id: 'dream-pulse',
        type: 'circle',
        source: 'places',
        filter: ['==', ['get', 'lived'], 0],
        paint: { 'circle-radius': 12, 'circle-color': coral, 'circle-opacity': 0.25, 'circle-pitch-alignment': 'map' }
      },
      {
        id: 'dream-dot',
        type: 'circle',
        source: 'places',
        filter: ['==', ['get', 'lived'], 0],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 3, 8, 6, 14, 9],
          'circle-color': coral,
          'circle-stroke-color': '#ffd5cf',
          'circle-stroke-width': 1.2,
          'circle-pitch-alignment': 'map'
        }
      },
      {
        id: 'lived-glow',
        type: 'circle',
        source: 'places',
        filter: ['>', ['get', 'lived'], 0],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, ['+', 12, ['*', 2, ['min', ['get', 'lived'], 6]]], 8, ['+', 20, ['*', 3, ['min', ['get', 'lived'], 6]]], 14, 34],
          'circle-color': gold,
          'circle-opacity': 0.35,
          'circle-blur': 0.9,
          'circle-pitch-alignment': 'map'
        }
      },
      {
        id: 'lived-dot',
        type: 'circle',
        source: 'places',
        filter: ['>', ['get', 'lived'], 0],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, ['+', 4, ['min', ['get', 'lived'], 5]], 8, ['+', 7, ['min', ['get', 'lived'], 5]], 14, 12],
          'circle-color': gold,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.6,
          'circle-pitch-alignment': 'map'
        }
      },
      {
        id: 'ring',
        type: 'circle',
        source: 'ring',
        paint: { 'circle-radius': 18, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2, 'circle-stroke-opacity': 0.9, 'circle-pitch-alignment': 'map' }
      },
      {
        id: 'place-country',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        minzoom: 1.5,
        maxzoom: 6.5,
        filter: ['==', ['get', 'class'], 'country'],
        layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': FONT, 'text-size': ['interpolate', ['linear'], ['zoom'], 1.5, 9, 5, 15], 'text-transform': 'uppercase', 'text-letter-spacing': 0.14, 'text-max-width': 8 },
        paint: { 'text-color': '#f4f7ff', 'text-halo-color': 'rgba(4,12,36,0.85)', 'text-halo-width': 1.4, 'text-opacity': 0.85 }
      },
      {
        id: 'place-other',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        minzoom: 4,
        filter: ['in', ['get', 'class'], ['literal', ['state', 'city', 'town', 'village', 'suburb']]],
        layout: {
          'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': FONT_REG,
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 10, 10, 14, 15, 17],
          'symbol-sort-key': ['coalesce', ['get', 'rank'], 99]
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(4,12,36,0.85)', 'text-halo-width': 1.3, 'text-opacity': 0.9 }
      },
      {
        id: 'lived-label',
        type: 'symbol',
        source: 'places',
        filter: ['>', ['get', 'lived'], 0],
        layout: { 'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 13, 'text-anchor': 'top', 'text-offset': [0, 1.1], 'text-optional': true, 'symbol-sort-key': ['-', 0, ['get', 'lived']], 'text-max-width': 9 },
        paint: { 'text-color': '#fff3c4', 'text-halo-color': 'rgba(4,12,36,0.9)', 'text-halo-width': 1.6 }
      },
      {
        id: 'dream-label',
        type: 'symbol',
        source: 'places',
        minzoom: 5,
        filter: ['==', ['get', 'lived'], 0],
        layout: { 'text-field': ['get', 'name'], 'text-font': FONT_REG, 'text-size': 12, 'text-anchor': 'top', 'text-offset': [0, 1], 'text-optional': true, 'text-max-width': 9 },
        paint: { 'text-color': '#ffd5cf', 'text-halo-color': 'rgba(4,12,36,0.9)', 'text-halo-width': 1.4 }
      }
    ]
  };
}

// ---- helpers -----------------------------------------------------------------
function xyz(lat, lng) {
  const la = lat * DEG;
  const lo = lng * DEG;
  return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
}
function fromXYZ([x, y, z]) {
  return [Math.atan2(x, z) / DEG, Math.asin(clamp(y, -1, 1)) / DEG];
}
// Points along the great circle between two places, longitudes kept continuous (no jump over the date line).
function arcPoints(a, b) {
  const p = xyz(a.lat, a.lng);
  const q = xyz(b.lat, b.lng);
  const ang = Math.acos(clamp(p[0] * q[0] + p[1] * q[1] + p[2] * q[2], -1, 1));
  if (ang < 0.002) return [];
  const n = Math.max(8, Math.round(ang * 36));
  const out = [];
  let prev = a.lng;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const sa = Math.sin((1 - t) * ang) / Math.sin(ang);
    const sb = Math.sin(t * ang) / Math.sin(ang);
    let [lng, lat] = fromXYZ([p[0] * sa + q[0] * sb, p[1] * sa + q[1] * sb, p[2] * sa + q[2] * sb]);
    while (lng - prev > 180) lng -= 360;
    while (lng - prev < -180) lng += 360;
    prev = lng;
    out.push([lng, lat]);
  }
  return out;
}

export class RealGlobe {
  static async create(host, world, opts = {}) {
    const ml = await loadMapLibre();
    const g = new RealGlobe(ml, host, world, opts);
    try {
      await g.ready;
    } catch (e) {
      g.destroy();
      throw e;
    }
    return g;
  }

  constructor(ml, host, world, opts = {}) {
    this.ml = ml;
    this.host = host;
    this.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.countries = world.map((c) => ({ id: c.id, name: c.n, rings: c.r }));
    this.markers = [];
    this.pathPts = [];
    this.visitedCountries = new Set();
    this.handlers = {};
    this.autoRotate = !this.reduced;
    this._showArcs = true;
    this._showDreams = true;
    this._selected = null;
    this._highlight = null;
    this._lastInteract = -1e9;
    this._last = 0;
    this._terrainOn = false;
    this._terrainOK = true;
    this.running = false;
    this.kind = 'real';
    this.EXACT_ZOOM = 6000; // street level: buildings and roads
    this.PICK_ZOOM = 8;

    this.el = document.createElement('div');
    this.el.className = 'globe-real';
    host.append(this.el);
    this.ins = this._insets();
    this.z0 = this._z0();

    this.map = new ml.Map({
      container: this.el,
      style: buildStyle({ hiRes: opts.hiRes !== false }),
      center: [opts.lon ?? 72.6, opts.lat ?? 22],
      zoom: this.z0 + Math.log2(opts.zoom ?? 1),
      minZoom: Math.max(0, this.z0 - 0.5),
      maxZoom: 19,
      maxPitch: 80,
      attributionControl: false,
      renderWorldCopies: false,
      fadeDuration: 200
    });
    this.map.addControl(new ml.AttributionControl({ compact: true }), 'bottom-right');

    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The realistic globe took too long to start')), 15000);
      this.map.once('load', () => {
        clearTimeout(timer);
        this._pad();
        resolve();
      });
      this.map.on('error', (e) => {
        // tile and glyph hiccups are normal on slow networks; only a failed style or WebGL is fatal
        const msg = String(e && e.error && e.error.message ? e.error.message : e);
        if (/webgl|context/i.test(msg)) {
          clearTimeout(timer);
          reject(new Error(msg));
        } else console.warn('[globe]', msg);
      });
    });

    const m = this.map;
    const touch = () => (this._lastInteract = performance.now());
    ['mousedown', 'touchstart', 'wheel', 'dblclick'].forEach((ev) => m.on(ev, touch));
    m.on('click', (e) => this._emit('click', this._hit(e.point)));
    m.on('mousemove', (e) => {
      if (m.isMoving()) return;
      m.getCanvas().style.cursor = this._hit(e.point) ? 'pointer' : '';
    });
    m.on('zoom', () => this._terrainCheck());
    m.on('moveend', () => this._pad());

    this.ro = new ResizeObserver(() => this.refreshInsets());
    this.ro.observe(host);
  }

  // ---- same surface as the classic Globe ---------------------------------------
  on(ev, fn) {
    (this.handlers[ev] ||= []).push(fn);
    return this;
  }
  _emit(ev, a) {
    (this.handlers[ev] || []).forEach((f) => f(a));
  }
  get zoom() {
    return 2 ** (this.map.getZoom() - this.z0);
  }
  get showArcs() {
    return this._showArcs;
  }
  set showArcs(v) {
    this._showArcs = !!v;
    for (const id of ['arcs-glow', 'arcs-line', 'traveller-glow', 'traveller']) this._vis(id, v);
  }
  get showDreams() {
    return this._showDreams;
  }
  set showDreams(v) {
    this._showDreams = !!v;
    for (const id of ['dream-pulse', 'dream-dot', 'dream-label']) this._vis(id, v);
  }
  get selected() {
    return this._selected;
  }
  set selected(id) {
    this._selected = id;
    this._ring();
  }
  get highlight() {
    return this._highlight;
  }
  set highlight(id) {
    this._highlight = id;
    this._ring();
  }
  _vis(id, on) {
    try {
      this.map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    } catch (e) {
      /* layer not ready yet */
    }
  }
  markerById(id) {
    return this.markers.find((m) => m.id === id) || null;
  }

  setMarkers(markers) {
    this.markers = markers.map((m) => ({ ...m }));
    this.visitedCountries = new Set();
    for (const m of this.markers) {
      if (!m.lived) continue;
      for (const c of this.countries) {
        if (c.rings.some((r) => inRing(m.lng, m.lat, r))) {
          this.visitedCountries.add(c.id);
          break;
        }
      }
    }
    this._src('places', {
      type: 'FeatureCollection',
      features: this.markers.map((m) => ({ type: 'Feature', properties: { id: m.id, name: m.name, lived: m.lived || 0, dreams: m.dreams || 0 }, geometry: { type: 'Point', coordinates: [m.lng, m.lat] } }))
    });
    const feats = [];
    for (const c of this.countries) {
      if (!this.visitedCountries.has(c.id)) continue;
      for (const r of c.rings) {
        if (r.length < 4) continue;
        const ring = r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r : [...r, r[0]];
        feats.push({ type: 'Feature', properties: { id: c.id }, geometry: { type: 'Polygon', coordinates: [ring] } });
      }
    }
    this._src('visited', { type: 'FeatureCollection', features: feats });
    this._ring();
  }

  setArcs(points) {
    const lines = [];
    this.pathPts = [];
    for (let i = 1; i < points.length; i++) {
      const pts = arcPoints(points[i - 1], points[i]);
      if (pts.length < 2) continue;
      lines.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } });
      this.pathPts.push(...pts);
    }
    this._src('arcs', { type: 'FeatureCollection', features: lines });
    if (!lines.length) this._src('traveller', EMPTY);
  }

  select(id, { fly = true, zoom = this.PICK_ZOOM } = {}) {
    this.selected = id;
    const m = this.markerById(id);
    if (m && fly) this.flyTo(m.lat, m.lng, { zoom });
  }

  flyTo(lat, lng, { zoom = this.zoom, duration = 1400 } = {}) {
    const F = Math.max(0.6, zoom);
    const z = clamp(this.z0 + Math.log2(F), this.z0 - 0.5, 19);
    const pitch = F >= 60 ? 55 : 0;
    this._lastInteract = performance.now();
    return new Promise((resolve) => {
      let done = false;
      const fin = () => {
        if (done) return;
        done = true;
        resolve();
      };
      const dur = this.reduced ? 0 : duration;
      this.map.once('moveend', fin);
      setTimeout(fin, dur + 400);
      this.map.flyTo({ center: [lng, lat], zoom: z, pitch, bearing: 0, duration: dur, essential: true, curve: 1.4 });
    });
  }
  reset() {
    return this.flyTo(22, 72.6, { zoom: 1, duration: 1600 });
  }
  zoomBy(f) {
    this._lastInteract = performance.now();
    this.map.easeTo({ zoom: clamp(this.map.getZoom() + Math.log2(f), this.z0 - 0.5, 19), duration: 260, essential: true });
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = (now) => {
      if (!this.running) return;
      this._frame(now);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }
  destroy() {
    this.running = false;
    cancelAnimationFrame(this._raf);
    this.ro && this.ro.disconnect();
    try {
      this.map.remove();
    } catch (e) {
      /* already gone */
    }
    this.el.remove();
  }

  // ---- layout: the globe lives in the area left free by the overlays (the host's padding) ----
  _insets() {
    const cs = getComputedStyle(this.host);
    return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
  }
  _z0() {
    const w = this.host.clientWidth - this.ins.left - this.ins.right;
    const h = this.host.clientHeight - this.ins.top - this.ins.bottom;
    const free = Math.max(160, Math.min(w, h));
    // globe diameter at zoom z is about 163 * 2^z pixels; fill ~84% of the free area
    return Math.log2((free * 0.84) / 163);
  }
  refreshInsets() {
    this.ins = this._insets();
    const z0 = this._z0();
    if (Math.abs(z0 - this.z0) > 1e-3) {
      this.z0 = z0;
      try {
        this.map.setMinZoom(Math.max(0, z0 - 0.5));
      } catch (e) {
        /* ignore */
      }
    }
    this._pad();
  }
  _pad() {
    const p = this.ins;
    const pad = { top: p.top, right: p.right, bottom: p.bottom, left: p.left };
    try {
      if (typeof this.map.setPadding === 'function') this.map.setPadding(pad);
      else if (!this.map.isMoving()) this.map.jumpTo({ padding: pad });
    } catch (e) {
      /* ignore */
    }
  }

  // ---- internals -----------------------------------------------------------------
  _src(id, data) {
    const s = this.map.getSource(id);
    if (s && s.setData) s.setData(data);
  }
  _ring() {
    const feats = [];
    for (const [id, kind] of [[this._highlight, 'hl'], [this._selected, 'sel']]) {
      const m = id && this.markerById(id);
      if (m) feats.push({ type: 'Feature', properties: { kind }, geometry: { type: 'Point', coordinates: [m.lng, m.lat] } });
    }
    this._src('ring', { type: 'FeatureCollection', features: feats });
  }
  _hit(pt) {
    const r = 14;
    const layers = ['lived-dot', ...(this._showDreams ? ['dream-dot'] : [])];
    let f = [];
    try {
      f = this.map.queryRenderedFeatures([[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]], { layers });
    } catch (e) {
      return null;
    }
    if (!f.length) return null;
    f.sort((a, b) => (b.properties.lived || 0) - (a.properties.lived || 0));
    return this.markerById(f[0].properties.id);
  }
  // Relief in 3D only once the map has flattened out (zoomed in), where terrain is reliable.
  _terrainCheck() {
    if (!this._terrainOK) return;
    const want = this.map.getZoom() >= 12;
    if (want === this._terrainOn) return;
    try {
      this.map.setTerrain(want ? { source: 'dem', exaggeration: 1.25 } : null);
      this._terrainOn = want;
    } catch (e) {
      this._terrainOK = false;
      console.warn('[globe] terrain not available', e);
    }
  }
  _frame(now) {
    if (now - this._last < 33) return;
    const dt = Math.min(100, now - (this._last || now));
    this._last = now;
    const m = this.map;
    if (!m.isStyleLoaded()) return;
    if (!this.reduced) {
      const t = (now / 2600) % 1;
      try {
        m.setPaintProperty('dream-pulse', 'circle-radius', ['interpolate', ['linear'], ['zoom'], 0, 4 + t * 10, 8, 7 + t * 16, 14, 10 + t * 24]);
        m.setPaintProperty('dream-pulse', 'circle-opacity', 0.5 * (1 - t));
        m.setPaintProperty('ring', 'circle-radius', 15 + Math.sin(now / 260) * 3);
      } catch (e) {
        /* style not ready */
      }
      // a light travelling along the path of places
      if (this._showArcs && this.pathPts.length > 1) {
        const f = ((now / 14000) % 1) * (this.pathPts.length - 1);
        const i = Math.floor(f);
        const a = this.pathPts[i];
        const b = this.pathPts[Math.min(i + 1, this.pathPts.length - 1)];
        const u = f - i;
        this._src('traveller', { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u] } }] });
      }
    }
    if (this.autoRotate && !m.isMoving() && now - this._lastInteract > 5000 && this.zoom < 2.2) {
      const c = m.getCenter();
      m.jumpTo({ center: [c.lng + dt * 0.004, c.lat] });
    }
  }
}
