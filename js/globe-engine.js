// A small interactive 3D globe drawn on a 2D canvas (orthographic projection). No libraries.
// Drag to turn, wheel or pinch to zoom, click a marker to select it.

const DEG = Math.PI / 180;
export const MAXZ = 1500; // ~ street level over a 6-decimal pin
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const COLORS = {
  space: '#050a1f',
  oceanA: '#17306f',
  oceanB: '#0b1740',
  land: '#2a3f86',
  landEdge: 'rgba(170,190,255,0.42)',
  visitedLand: 'rgba(232,174,47,0.30)',
  visitedEdge: 'rgba(240,200,90,0.85)',
  grid: 'rgba(160,185,255,0.07)',
  gold: '#e8ae2f',
  goldSoft: 'rgba(232,174,47,',
  dream: '#ff6b5e',
  dreamSoft: 'rgba(255,107,94,',
  chalk: '#eceff4'
};

const toXYZ = (lat, lng) => {
  const c = Math.cos(lat * DEG);
  return [c * Math.cos(lng * DEG), c * Math.sin(lng * DEG), Math.sin(lat * DEG)];
};

// Is a lon/lat point inside a ring? (ray casting in degrees, fine for country scale)
export function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export class Globe {
  constructor(canvas, world, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    // world: [{id, n, r:[[[lon,lat],...]]}]
    this.countries = world.map((c) => ({ id: c.id, name: c.n, rings: c.r.map((ring) => ({ pts: ring, xyz: new Float32Array(ring.flatMap(([lo, la]) => toXYZ(la, lo))) })) }));
    this.lon0 = opts.lon ?? 72.6;
    this.lat0 = opts.lat ?? 22;
    this.zoom = opts.zoom ?? 1;
    this.EXACT_ZOOM = 400;
    this.PICK_ZOOM = 2.4;
    this.markers = [];
    this.arcs = [];
    this.arcPts = [];
    this.visitedCountries = new Set();
    this.showArcs = true;
    this.showDreams = true;
    this.autoRotate = !this.reduced;
    this.selected = null;
    this.hover = null;
    this.highlight = null;
    this.handlers = {};
    this.lastInteract = -1e9;
    this.vel = { x: 0, y: 0 };
    this.drag = null;
    this.pointers = new Map();
    this.tween = null;
    this.running = false;
    this.t0 = performance.now();
    this.stars = null;
    this.W = 0;
    this.H = 0;
    this._bind();
    this._resize();
  }

  on(ev, fn) {
    (this.handlers[ev] ||= []).push(fn);
    return this;
  }
  _emit(ev, a) {
    (this.handlers[ev] || []).forEach((f) => f(a));
  }

  // ---- data ---------------------------------------------------------------
  setMarkers(markers) {
    // marker: {id, lat, lng, name, lived: n, dreams: n}
    this.markers = markers.map((m) => ({ ...m, xyz: toXYZ(m.lat, m.lng), phase: Math.random() * 3 }));
    this.visitedCountries = new Set();
    for (const m of this.markers) {
      if (!m.lived) continue;
      for (const c of this.countries) {
        if (c.rings.some((r) => inRing(m.lng, m.lat, r.pts))) {
          this.visitedCountries.add(c.id);
          break;
        }
      }
    }
    this._dirty();
  }
  setArcs(points) {
    // points: [{lat,lng}] in travel order
    this.arcs = [];
    for (let i = 1; i < points.length; i++) {
      const a = toXYZ(points[i - 1].lat, points[i - 1].lng);
      const b = toXYZ(points[i].lat, points[i].lng);
      const dot = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1);
      const ang = Math.acos(dot);
      if (ang < 0.004) continue;
      const n = Math.max(12, Math.round(ang * 28));
      const h = 0.05 + 0.2 * (ang / Math.PI);
      const pts = [];
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const sa = Math.sin((1 - t) * ang) / Math.sin(ang);
        const sb = Math.sin(t * ang) / Math.sin(ang);
        const r = 1 + h * Math.sin(Math.PI * t);
        pts.push([(a[0] * sa + b[0] * sb) * r, (a[1] * sa + b[1] * sb) * r, (a[2] * sa + b[2] * sb) * r]);
      }
      this.arcs.push(pts);
    }
    this._dirty();
  }
  select(id, { fly = true, zoom = 2.4 } = {}) {
    this.selected = id;
    const m = this.markers.find((x) => x.id === id);
    if (m && fly) this.flyTo(m.lat, m.lng, { zoom });
    this._dirty();
  }
  markerById(id) {
    return this.markers.find((m) => m.id === id);
  }

  // ---- camera -------------------------------------------------------------
  flyTo(lat, lng, { zoom = this.zoom, duration = 1400 } = {}) {
    return new Promise((resolve) => {
      if (this.tween) this.tween.resolve();
      let dLon = ((lng - this.lon0 + 540) % 360) - 180;
      this.tween = { t: 0, dur: this.reduced ? 1 : duration, lon: this.lon0, lat: this.lat0, zoom: this.zoom, dLon, lat1: clamp(lat, -80, 80), zoom1: zoom, resolve };
      this.vel.x = this.vel.y = 0;
      this.lastInteract = performance.now();
      this._dirty();
    });
  }
  reset() {
    return this.flyTo(22, 72.6, { zoom: 1, duration: 1600 });
  }
  zoomBy(f) {
    this.tween = null;
    this.zoom = clamp(this.zoom * f, 0.75, MAXZ);
    this.lastInteract = performance.now();
    this._dirty();
  }

  // ---- events -------------------------------------------------------------
  _bind() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.lastInteract = performance.now();
      if (this.pointers.size === 1) {
        this.drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0 };
        this.vel.x = this.vel.y = 0;
        if (this.tween) {
          this.tween.resolve();
          this.tween = null;
        }
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.zoom };
        this.drag = null;
      }
    });
    c.addEventListener('pointermove', (e) => {
      const rect = c.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.zoom = clamp(this.pinch.z * (Math.hypot(a.x - b.x, a.y - b.y) / this.pinch.d), 0.75, MAXZ);
        this.lastInteract = performance.now();
        this._dirty();
        return;
      }
      if (this.drag) {
        const dx = e.clientX - this.drag.x;
        const dy = e.clientY - this.drag.y;
        this.drag.moved += Math.abs(dx) + Math.abs(dy);
        this.drag.x = e.clientX;
        this.drag.y = e.clientY;
        const R = this._R();
        const k = 1 / (R * DEG) / Math.max(0.35, Math.min(1, 0.6 + 0.4 / this.zoom));
        this.lon0 -= dx * k;
        this.lat0 = clamp(this.lat0 + dy * k, -85, 85);
        this.vel.x = -dx * k;
        this.vel.y = dy * k;
        this.lastInteract = performance.now();
        c.style.cursor = 'grabbing';
        this._dirty();
      } else {
        const h = this._hit(px, py);
        if ((h && h.id) !== (this.hover && this.hover.id)) {
          this.hover = h;
          c.style.cursor = h ? 'pointer' : 'grab';
          this._emit('hover', h ? { marker: h, x: px, y: py } : null);
          this._dirty();
        } else if (h) this._emit('hover', { marker: h, x: px, y: py });
      }
    });
    const up = (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (this.drag && this.pointers.size === 0) {
        const wasClick = this.drag.moved < 6;
        this.drag = null;
        c.style.cursor = 'grab';
        if (wasClick) {
          const rect = c.getBoundingClientRect();
          const h = this._hit(e.clientX - rect.left, e.clientY - rect.top);
          this._emit('click', h || null);
        }
        this._dirty();
      }
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', () => {
      if (this.hover && !this.drag) {
        this.hover = null;
        this._emit('hover', null);
        this._dirty();
      }
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.tween = null;
        this.zoom = clamp(this.zoom * Math.exp(-e.deltaY * 0.0015 * (this.zoom > 12 ? 2 : 1)), 0.75, MAXZ);
        this.lastInteract = performance.now();
        this._dirty();
      },
      { passive: false }
    );
    c.addEventListener('dblclick', (e) => {
      const rect = c.getBoundingClientRect();
      const h = this._hit(e.clientX - rect.left, e.clientY - rect.top);
      if (h) this.flyTo(h.lat, h.lng, { zoom: Math.max(this.zoom, 14) });
      else this.zoomBy(1.6);
    });
    c.tabIndex = 0;
    c.addEventListener('keydown', (e) => {
      const step = 8 / this.zoom;
      if (e.key === 'ArrowLeft') this.lon0 -= step;
      else if (e.key === 'ArrowRight') this.lon0 += step;
      else if (e.key === 'ArrowUp') this.lat0 = clamp(this.lat0 + step, -85, 85);
      else if (e.key === 'ArrowDown') this.lat0 = clamp(this.lat0 - step, -85, 85);
      else if (e.key === '+' || e.key === '=') this.zoomBy(1.25);
      else if (e.key === '-') this.zoomBy(0.8);
      else return;
      e.preventDefault();
      this.tween = null;
      this.lastInteract = performance.now();
      this._dirty();
    });
    this.ro = new ResizeObserver(() => this._resize());
    this.ro.observe(c.parentElement || c);
    this._onVis = () => {
      if (!document.hidden) this._dirty();
    };
    document.addEventListener('visibilitychange', this._onVis);
  }

  _resize() {
    const p = this.canvas.parentElement || this.canvas;
    const w = Math.max(200, p.clientWidth);
    const h = Math.max(200, p.clientHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.W = w;
    this.H = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.stars = null;
    this.ins = this._insets();
    this._dirty();
  }
  // The globe sits in the free area left by the parent's padding (overlays), while the canvas fills the whole stage.
  _insets() {
    const p = this.canvas.parentElement;
    if (!p) return { t: 0, r: 0, b: 0, l: 0 };
    const cs = getComputedStyle(p);
    return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  }
  refreshInsets() {
    this.ins = this._insets();
    this._dirty();
  }
  _cx() {
    const i = this.ins || { l: 0, r: 0 };
    return i.l + (this.W - i.l - i.r) / 2;
  }
  _cy() {
    const i = this.ins || { t: 0, b: 0 };
    return i.t + (this.H - i.t - i.b) / 2;
  }
  _R() {
    const i = this.ins || { t: 0, r: 0, b: 0, l: 0 };
    return Math.min(this.W - i.l - i.r, this.H - i.t - i.b) * 0.42 * this.zoom;
  }

  // ---- projection ---------------------------------------------------------
  _basis() {
    const l0 = this.lon0 * DEG;
    const p0 = this.lat0 * DEG;
    this.e = [-Math.sin(l0), Math.cos(l0), 0];
    this.n = [-Math.sin(p0) * Math.cos(l0), -Math.sin(p0) * Math.sin(l0), Math.cos(p0)];
    this.v = [Math.cos(p0) * Math.cos(l0), Math.cos(p0) * Math.sin(l0), Math.sin(p0)];
  }
  _view(x, y, z) {
    const { e, n, v } = this;
    return [x * e[0] + y * e[1] + z * e[2], x * n[0] + y * n[1] + z * n[2], x * v[0] + y * v[1] + z * v[2]];
  }
  // Screen position of a surface point, or null if it is on the far side.
  project(lat, lng) {
    this._basis();
    const [x, y, z] = this._view(...toXYZ(lat, lng));
    if (z <= 0.02) return null;
    const R = this._R();
    return { x: this._cx() + R * x, y: this._cy() - R * y, z };
  }
  _hit(px, py) {
    this._basis();
    const R = this._R();
    let best = null;
    let bd = 1e9;
    for (const m of this.markers) {
      if (m.kind === 'dream' && !this.showDreams) continue;
      const [x, y, z] = this._view(...m.xyz);
      if (z <= 0.05) continue;
      const sx = this._cx() + R * x;
      const sy = this._cy() - R * y;
      const r = this._radius(m) + 8;
      const d = Math.hypot(px - sx, py - sy);
      if (d < r && d < bd) {
        best = m;
        bd = d;
      }
    }
    return best;
  }
  _radius(m) {
    const base = m.lived ? 5 : 3.5;
    return base + Math.min(7, Math.sqrt(m.lived + m.dreams * 0.4) * 1.1);
  }

  // ---- loop ---------------------------------------------------------------
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      this._step(now);
      this._draw(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    document.removeEventListener('visibilitychange', this._onVis);
  }
  _dirty() {}

  _step(now) {
    const dt = Math.min(64, now - this.last);
    this.last = now;
    if (this.tween) {
      const T = this.tween;
      T.t += dt;
      const k = ease(clamp(T.t / T.dur, 0, 1));
      this.lon0 = T.lon + T.dLon * k;
      this.lat0 = T.lat + (T.lat1 - T.lat) * k;
      // a zoom-out dip in the middle of long flights keeps the move readable
      const dip = Math.sin(Math.PI * k) * Math.min(0.5, Math.abs(T.dLon) / 400);
      this.zoom = (T.zoom + (T.zoom1 - T.zoom) * k) * (1 - dip);
      if (T.t >= T.dur) {
        this.tween = null;
        this.zoom = T.zoom1;
        T.resolve();
      }
    } else if (!this.drag) {
      if (Math.abs(this.vel.x) > 0.002 || Math.abs(this.vel.y) > 0.002) {
        this.lon0 += this.vel.x;
        this.lat0 = clamp(this.lat0 + this.vel.y, -85, 85);
        this.vel.x *= 0.93;
        this.vel.y *= 0.93;
      } else if (this.autoRotate && now - this.lastInteract > 6000 && !this.selected && !this.hover) {
        this.lon0 += (dt / 1000) * 4.5;
      }
    }
    this.lon0 = ((this.lon0 + 540) % 360) - 180;
  }

  _starfield() {
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const g = c.getContext('2d');
    g.fillStyle = COLORS.space;
    g.fillRect(0, 0, c.width, c.height);
    const neb = g.createRadialGradient(c.width * 0.2, c.height * 0.15, 0, c.width * 0.2, c.height * 0.15, c.width * 0.7);
    neb.addColorStop(0, 'rgba(60,70,170,0.28)');
    neb.addColorStop(1, 'rgba(5,10,31,0)');
    g.fillStyle = neb;
    g.fillRect(0, 0, c.width, c.height);
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const n = Math.round((c.width * c.height) / 5200);
    for (let i = 0; i < n; i++) {
      const r = rnd() * 1.3 * this.dpr + 0.2;
      g.globalAlpha = 0.25 + rnd() * 0.65;
      g.fillStyle = rnd() > 0.85 ? '#ffd9a0' : '#dfe8ff';
      g.beginPath();
      g.arc(rnd() * c.width, rnd() * c.height, r * 0.6, 0, TAU);
      g.fill();
    }
    return c;
  }

  _ringPath(ctx, ring, cx, cy, R) {
    const xyz = ring.xyz;
    const n = xyz.length / 3;
    const { e, n: nn, v } = this;
    const X = new Float32Array(n);
    const Y = new Float32Array(n);
    const Z = new Float32Array(n);
    let any = false;
    for (let i = 0; i < n; i++) {
      const x = xyz[3 * i];
      const y = xyz[3 * i + 1];
      const z = xyz[3 * i + 2];
      X[i] = x * e[0] + y * e[1] + z * e[2];
      Y[i] = x * nn[0] + y * nn[1] + z * nn[2];
      Z[i] = x * v[0] + y * v[1] + z * v[2];
      if (Z[i] >= 0) any = true;
    }
    if (!any) return false;
    const out = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const za = Z[i];
      const zb = Z[j];
      if (za >= 0) out.push([X[i], Y[i], 0]);
      if (za >= 0 !== zb >= 0) {
        const t = za / (za - zb);
        let ix = X[i] + t * (X[j] - X[i]);
        let iy = Y[i] + t * (Y[j] - Y[i]);
        const l = Math.hypot(ix, iy) || 1;
        out.push([ix / l, iy / l, za >= 0 ? 1 : 2]); // 1 = leaving view, 2 = entering view
      }
    }
    if (out.length < 3) return false;
    ctx.moveTo(cx + R * out[0][0], cy - R * out[0][1]);
    for (let i = 1; i <= out.length; i++) {
      const p = out[i % out.length];
      const q = out[i - 1];
      if (q[2] === 1 && p[2] === 2) {
        const a1 = Math.atan2(-q[1], q[0]);
        const a2 = Math.atan2(-p[1], p[0]);
        let d = a2 - a1;
        while (d > Math.PI) d -= TAU;
        while (d <= -Math.PI) d += TAU;
        ctx.arc(cx, cy, R, a1, a2, d < 0);
      } else if (i < out.length) ctx.lineTo(cx + R * p[0], cy - R * p[1]);
    }
    ctx.closePath();
    return true;
  }

  _draw(now) {
    const ctx = this.ctx;
    const dpr = this.dpr;
    const W = this.W;
    const H = this.H;
    const cx = this._cx();
    const cy = this._cy();
    const R = this._R();
    this._basis();
    const time = Math.max(0, now - this.t0) / 1000;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.stars) this.stars = this._starfield();
    ctx.drawImage(this.stars, 0, 0, W, H);

    // atmosphere glow
    const glow = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.28);
    glow.addColorStop(0, 'rgba(110,150,255,0.55)');
    glow.addColorStop(0.35, 'rgba(70,100,230,0.18)');
    glow.addColorStop(1, 'rgba(40,60,200,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.28, 0, TAU);
    ctx.fill();

    // ocean
    const ocean = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    ocean.addColorStop(0, COLORS.oceanA);
    ocean.addColorStop(1, COLORS.oceanB);
    ctx.fillStyle = ocean;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.clip();

    // graticule every 30 degrees
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let lat = -60; lat <= 60; lat += 30) this._line(ctx, (k) => [lat, -180 + k * 3], 121, cx, cy, R);
    for (let lng = -180; lng < 180; lng += 30) this._line(ctx, (k) => [-85 + k * 1.5, lng], 114, cx, cy, R);
    ctx.stroke();

    // land
    ctx.lineJoin = 'round';
    for (const c of this.countries) {
      const visited = this.visitedCountries.has(c.id);
      ctx.beginPath();
      let drew = false;
      for (const ring of c.rings) drew = this._ringPath(ctx, ring, cx, cy, R) || drew;
      if (!drew) continue;
      ctx.fillStyle = visited ? '#3b4a86' : COLORS.land;
      ctx.fill();
      if (visited) {
        ctx.fillStyle = COLORS.visitedLand;
        ctx.fill();
      }
      ctx.lineWidth = visited ? 1.2 : 0.7;
      ctx.strokeStyle = visited ? COLORS.visitedEdge : COLORS.landEdge;
      ctx.stroke();
    }

    // limb darkening and a soft light from the upper left
    const shade = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.35, cx, cy, R * 1.02);
    shade.addColorStop(0, 'rgba(255,255,255,0.07)');
    shade.addColorStop(0.6, 'rgba(0,0,10,0)');
    shade.addColorStop(1, 'rgba(0,0,12,0.62)');
    ctx.fillStyle = shade;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.restore();

    // thin bright rim
    ctx.strokeStyle = 'rgba(150,185,255,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.stroke();

    // travel path
    if (this.showArcs && this.arcs.length) this._drawArcs(ctx, cx, cy, R, time);

    // markers: dreams first, so lived places sit on top
    const sorted = [...this.markers].sort((a, b) => (a.lived ? 1 : 0) - (b.lived ? 1 : 0));
    const labels = [];
    for (const m of sorted) {
      const lived = m.lived > 0;
      if (!lived && !this.showDreams) continue;
      const [x, y, z] = this._view(...m.xyz);
      if (z <= 0.02) continue;
      const sx = cx + R * x;
      const sy = cy - R * y;
      const fade = clamp(z * 3.2, 0, 1);
      const r = this._radius(m);
      const sel = this.selected === m.id;
      const hov = this.hover && this.hover.id === m.id;
      const hl = this.highlight === m.id;
      const pulseT = this.reduced ? 0.3 : (time * 0.55 + m.phase) % 1;
      ctx.globalAlpha = fade;
      if (lived) {
        const breathe = this.reduced ? 1 : 1 + 0.18 * Math.sin(time * 2 + m.phase * 3);
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3.6 * breathe);
        g.addColorStop(0, COLORS.goldSoft + '0.65)');
        g.addColorStop(0.4, COLORS.goldSoft + '0.18)');
        g.addColorStop(1, COLORS.goldSoft + '0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sx, sy, r * 3.6 * breathe, 0, TAU);
        ctx.fill();
        ctx.fillStyle = COLORS.gold;
        ctx.beginPath();
        ctx.arc(sx, sy, r * 0.8, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fff7da';
        ctx.beginPath();
        ctx.arc(sx, sy, r * 0.36, 0, TAU);
        ctx.fill();
        if (m.dreams) {
          ctx.strokeStyle = COLORS.dreamSoft + (0.75 * (1 - pulseT)).toFixed(2) + ')';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(sx, sy, r + 3 + pulseT * 14, 0, TAU);
          ctx.stroke();
        }
      } else {
        // a dream: a pulsing ring around a small ember
        for (let k = 0; k < 2; k++) {
          const p = (pulseT + k * 0.5) % 1;
          ctx.strokeStyle = COLORS.dreamSoft + (0.85 * (1 - p)).toFixed(2) + ')';
          ctx.lineWidth = 1.8 - p;
          ctx.beginPath();
          ctx.arc(sx, sy, r * 0.7 + p * (r * 2.8 + 6), 0, TAU);
          ctx.stroke();
        }
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 1.8);
        g.addColorStop(0, COLORS.dreamSoft + '0.55)');
        g.addColorStop(1, COLORS.dreamSoft + '0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sx, sy, r * 1.8, 0, TAU);
        ctx.fill();
        ctx.fillStyle = COLORS.dream;
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(2.2, r * 0.45), 0, TAU);
        ctx.fill();
      }
      if (sel || hov || hl) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, r + 6, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (sel || hov || hl || (lived && this.zoom > 1.7 && fade > 0.6)) labels.push([m, sx, sy, r, sel || hov || hl]);
    }
    // labels: strongest first, skipping any that would overlap one already placed
    ctx.font = '600 13px "Hind Vadodara", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    labels.sort((a, b) => (b[4] ? 1e6 : 0) + b[0].lived - ((a[4] ? 1e6 : 0) + a[0].lived));
    const placed = [];
    for (const [m, sx, sy, r, strong] of labels) {
      const w = ctx.measureText(m.name).width;
      const box = [sx + r + 2, sy - 12, w + 14, 24];
      if (!strong && placed.some((q) => box[0] < q[0] + q[2] && box[0] + box[2] > q[0] && box[1] < q[1] + q[3] && box[1] + box[3] > q[1])) continue;
      placed.push(box);
      ctx.fillStyle = 'rgba(5,10,31,0.74)';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(box[0], box[1] + 1, box[2], 22, 11) : ctx.rect(box[0], box[1] + 1, box[2], 22);
      ctx.fill();
      ctx.fillStyle = strong ? '#fff' : COLORS.chalk;
      ctx.fillText(m.name, box[0] + 7, sy + 0.5);
    }
    ctx.globalAlpha = 1;
  }

  _line(ctx, f, n, cx, cy, R) {
    let pen = false;
    for (let k = 0; k <= n; k++) {
      const [lat, lng] = f(k);
      const [x, y, z] = this._view(...toXYZ(lat, lng));
      if (z < 0) {
        pen = false;
        continue;
      }
      const sx = cx + R * x;
      const sy = cy - R * y;
      if (!pen) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
      pen = true;
    }
  }

  _drawArcs(ctx, cx, cy, R, time) {
    const total = this.arcs.length;
    ctx.lineCap = 'round';
    this.arcs.forEach((pts, i) => {
      let pen = false;
      ctx.beginPath();
      for (const p of pts) {
        const [x, y, z] = this._view(p[0], p[1], p[2]);
        const vis = z > 0 || x * x + y * y > 1;
        if (!vis) {
          pen = false;
          continue;
        }
        if (!pen) ctx.moveTo(cx + R * x, cy - R * y);
        else ctx.lineTo(cx + R * x, cy - R * y);
        pen = true;
      }
      ctx.strokeStyle = 'rgba(255,214,120,0.55)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    });
    // a small traveller moving along the whole route
    if (!this.reduced) {
      const u = ((((time * 0.08) % 1) + 1) % 1) * total;
      const i = Math.min(total - 1, Math.floor(u));
      const pts = this.arcs[i];
      const p = pts[Math.min(pts.length - 1, Math.floor((u - i) * pts.length))];
      const [x, y, z] = this._view(p[0], p[1], p[2]);
      if (z > 0 || x * x + y * y > 1) {
        const sx = cx + R * x;
        const sy = cy - R * y;
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 10);
        g.addColorStop(0, 'rgba(255,240,190,1)');
        g.addColorStop(1, 'rgba(255,214,120,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sx, sy, 10, 0, TAU);
        ctx.fill();
      }
    }
  }
}
