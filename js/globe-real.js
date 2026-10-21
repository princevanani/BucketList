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
// City scale is the closest this globe goes: it keeps the map fast (no building or street-level tiles to download).
const MAX_MAP_ZOOM = 9.5;
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

export function buildStyle() {
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
        tileSize: 512,
        maxzoom: 12,
        attribution: '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless by EOX</a> (contains modified Copernicus Sentinel data 2020)'
      },
      dem: {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 9,
        attribution: 'Terrain: Mapzen / AWS Open Data'
      },
      omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' },
      visited: { type: 'geojson', data: EMPTY },
      arcs: { type: 'geojson', data: EMPTY },
      places: { type: 'geojson', data: EMPTY }
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#04102a' } },
      {
        id: 'sat',
        type: 'raster',
        source: 'sat',
        paint: { 'raster-saturation': 0.18, 'raster-contrast': 0.12, 'raster-brightness-max': 0.92, 'raster-fade-duration': 300 }
      },
      {
        id: 'relief',
        type: 'hillshade',
        source: 'dem',
        minzoom: 4,
        paint: {
          'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 4, 0.15, 7, 0.45, 12, 0.3],
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
    this.running = false;
    this.kind = 'real';
    this.PICK_ZOOM = 8;

    this.el = document.createElement('div');
    this.el.className = 'globe-real';
    this.el.style.opacity = '0';
    this.el.style.transition = 'opacity 0.8s ease';
    host.append(this.el);
    this.ins = this._insets();
    this.z0 = this._z0();

    this.map = new ml.Map({
      container: this.el,
      style: buildStyle(),
      center: [opts.lon ?? 72.6, opts.lat ?? 22],
      zoom: this.z0 + Math.log2(opts.zoom ?? 1),
      minZoom: Math.max(0, this.z0 - 0.5),
      maxZoom: MAX_MAP_ZOOM,
      maxPitch: 0,
      attributionControl: false,
      renderWorldCopies: false,
      fadeDuration: 150,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
      maxTileCacheSize: 120
    });
    this.map.addControl(new ml.AttributionControl({ compact: true }), 'bottom-right');

    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The realistic globe took too long to start')), 45000);
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
    try {
      m.dragRotate.disable();
      m.touchZoomRotate.disableRotation();
    } catch (e) {
      /* older builds: rotation stays available, harmless */
    }
    m.on('render', () => this._draw(performance.now()));
    m.on('moveend', () => this._pad());

    // effects (pulsing halos, travelling light, selection ring) are drawn on a light 2D layer over the map,
    // so animating them never makes the map re-render its tiles
    this.fx = document.createElement('canvas');
    this.fx.className = 'globe-fx';
    this.el.append(this.fx);
    this.fxCtx = this.fx.getContext('2d');
    this.ro = new ResizeObserver(() => {
      this._sizeFx();
      this.refreshInsets();
    });
    this._sizeFx();
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
  get EXACT_ZOOM() {
    return 2 ** (MAX_MAP_ZOOM - 0.3 - this.z0);
  }
  get zoom() {
    return 2 ** (this.map.getZoom() - this.z0);
  }
  get showArcs() {
    return this._showArcs;
  }
  set showArcs(v) {
    this._showArcs = !!v;
    for (const id of ['arcs-glow', 'arcs-line']) this._vis(id, v);
  }
  get showDreams() {
    return this._showDreams;
  }
  set showDreams(v) {
    this._showDreams = !!v;
    for (const id of ['dream-dot', 'dream-label']) this._vis(id, v);
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
  }

  select(id, { fly = true, zoom = this.PICK_ZOOM } = {}) {
    this.selected = id;
    const m = this.markerById(id);
    if (m && fly) this.flyTo(m.lat, m.lng, { zoom });
  }

  flyTo(lat, lng, { zoom = this.zoom, duration = 1400 } = {}) {
    const F = Math.max(0.6, zoom);
    const z = clamp(this.z0 + Math.log2(F), this.z0 - 0.5, MAX_MAP_ZOOM);
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
      this.map.flyTo({ center: [lng, lat], zoom: z, pitch: 0, bearing: 0, duration: dur, essential: true, curve: 1.4 });
    });
  }
  reset() {
    return this.flyTo(22, 72.6, { zoom: 1, duration: 1600 });
  }
  zoomBy(f) {
    this._lastInteract = performance.now();
    this.map.easeTo({ zoom: clamp(this.map.getZoom() + Math.log2(f), this.z0 - 0.5, MAX_MAP_ZOOM), duration: 260, essential: true });
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
    this.map.triggerRepaint();
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
  _sizeFx() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.fx.width = Math.round(w * dpr);
    this.fx.height = Math.round(h * dpr);
    this.fx.style.width = w + 'px';
    this.fx.style.height = h + 'px';
    this.fxDpr = dpr;
  }
  // on the near side of the planet (as seen from the middle of the view)?
  _facing(lat, lng, c) {
    const la = lat * DEG;
    const l0 = c.lat * DEG;
    return Math.sin(la) * Math.sin(l0) + Math.cos(la) * Math.cos(l0) * Math.cos((lng - c.lng) * DEG);
  }
  _draw(now) {
    const ctx = this.fxCtx;
    if (!ctx) return;
    const dpr = this.fxDpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.fx.width, this.fx.height);
    const m = this.map;
    const c = m.getCenter();
    const z = m.getZoom();
    const base = clamp(3 + z * 0.55, 3.5, 9);
    const still = this.reduced;
    const ph = (period, off = 0) => (still ? 0.35 : ((now / period + off) % 1));
    const pt = (lat, lng, minCos = 0.04) => {
      const f = this._facing(lat, lng, c);
      if (f < minCos) return null;
      const p = m.project([lng, lat]);
      return { x: p.x, y: p.y, fade: Math.min(1, f * 3.5) };
    };
    // dreams: soft pulses
    if (this._showDreams) {
      ctx.lineWidth = 1.4;
      for (const k of this.markers) {
        if (k.lived) continue;
        const p = pt(k.lat, k.lng);
        if (!p) continue;
        const t = ph(2600, k._ph ?? (k._ph = Math.random()));
        ctx.strokeStyle = `rgba(255,107,94,${0.6 * (1 - t) * p.fade})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, base * (1 + t * 2.8), 0, 6.2832);
        ctx.stroke();
      }
    }
    // places lived: a slow golden breath
    ctx.lineWidth = 1.6;
    for (const k of this.markers) {
      if (!k.lived) continue;
      const p = pt(k.lat, k.lng);
      if (!p) continue;
      const t = ph(3400, k._ph ?? (k._ph = Math.random()));
      ctx.strokeStyle = `rgba(255,201,60,${0.55 * (1 - t) * p.fade})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, base * (1.4 + t * 2.4) + 3, 0, 6.2832);
      ctx.stroke();
    }
    // a light travelling along the path of places, with a short tail
    if (this._showArcs && this.pathPts.length > 1 && !still) {
      const n = this.pathPts.length - 1;
      const at = (f) => {
        const q = ((f % 1) + 1) % 1;
        const i = Math.min(n - 1, Math.floor(q * n));
        const u = q * n - i;
        const a = this.pathPts[i];
        const b = this.pathPts[i + 1];
        return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
      };
      const f0 = now / 16000;
      for (let k = 12; k >= 0; k--) {
        const [lng, lat] = at(f0 - k * 0.0035);
        const p = pt(lat, lng);
        if (!p) continue;
        const a = (1 - k / 13) * p.fade;
        ctx.fillStyle = `rgba(255,244,200,${0.75 * a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, k === 0 ? 3.6 : 3 * a + 0.6, 0, 6.2832);
        ctx.fill();
        if (k === 0) {
          ctx.fillStyle = 'rgba(255,240,180,0.25)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 11, 0, 6.2832);
          ctx.fill();
        }
      }
    }
    // selected place and the place a tour is visiting
    for (const [id, strong] of [[this._highlight, false], [this._selected, true]]) {
      const k = id && this.markerById(id);
      if (!k) continue;
      const p = pt(k.lat, k.lng);
      if (!p) continue;
      const wob = still ? 0 : Math.sin(now / 260) * 2.5;
      ctx.strokeStyle = strong ? 'rgba(255,255,255,0.95)' : 'rgba(255,224,138,0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, base * 2.4 + 6 + wob, 0, 6.2832);
      ctx.stroke();
    }
  }
  _frame(now) {
    if (document.hidden) return;
    const m = this.map;
    if (!m.isStyleLoaded()) return;
    const moving = m.isMoving();
    // while the map is still, redraw ~30 times a second so the halos animate (the effects layer is cheap)
    if (!this.reduced && !moving && now - (this._lastPulse || 0) > 33) {
      this._lastPulse = now;
      m.triggerRepaint();
    }
    if (this.autoRotate && !moving && now - this._lastInteract > 5000 && this.zoom < 2.2) {
      const dt = Math.min(100, now - (this._last || now));
      this._last = now;
      const c = m.getCenter();
      m.jumpTo({ center: [c.lng + dt * 0.004, c.lat] });
    } else this._last = now;
  }
}
