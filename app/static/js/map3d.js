/* 3D Philippines choropleth. Geometry built once; data updates only touch
   colour + vertical scale. Click / keyboard selection, hover tooltip,
   top-down and tilt presets. */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

const SCALE = 0.9;

function project([lon, lat]) {
  return [ (lon - 122.0) * SCALE, (lat - 12.6) * SCALE ];
}

function shapeFromRing(ring) {
  const s = new THREE.Shape();
  ring.forEach(([lon, lat], i) => {
    const [x, y] = project([lon, lat]);
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  });
  s.closePath();
  return s;
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = project(ring[i]);
    const [x2, y2] = project(ring[i + 1]);
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function geometryFor(feature) {
  const geom = feature.geometry;
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  const shapes = [];
  polys.forEach((rings) => {
    if (!rings.length) return;
    if (ringArea(rings[0]) < 3e-5) return; // drop degenerate slivers only
    const outer = shapeFromRing(rings[0]);
    for (let i = 1; i < rings.length; i++) {
      const path = new THREE.Path();
      rings[i].forEach(([lon, lat], j) => {
        const [x, y] = project([lon, lat]);
        if (j === 0) path.moveTo(x, y); else path.lineTo(x, y);
      });
      path.closePath();
      outer.holes.push(path);
    }
    shapes.push(outer);
  });
  const shapeGeo = new THREE.ExtrudeGeometry(shapes, {
    depth: 1, bevelEnabled: false, curveSegments: 1,
  });
  shapeGeo.rotateX(-Math.PI / 2); // extrude +Y, map lies on the ground plane
  return shapeGeo;
}

function buildColorScale() {
  const stops = ["#00224e", "#123570", "#3b496c", "#575d6d", "#707173",
                 "#8a8678", "#a59c74", "#c3b369", "#e1cc55", "#fee838"];
  return (t) => {
    const x = Math.max(0, Math.min(0.9999, t)) * (stops.length - 1);
    const i = Math.floor(x), f = x - i;
    const a = new THREE.Color(stops[i]), b = new THREE.Color(stops[i + 1]);
    return a.clone().lerp(b, f);
  };
}

function outlineGeometry(feature) {
  const geom = feature.geometry;
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  const pts = [];
  polys.forEach((rings) => rings.forEach((ring) => {
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, z1] = project(ring[i]);
      const [x2, z2] = project(ring[i + 1]);
      pts.push(x1, 1.002, -z1, x2, 1.002, -z2);
    }
    const [x0, z0] = project(ring[0]);
    const [xn, zn] = project(ring[ring.length - 1]);
    pts.push(xn, 1.002, -zn, x0, 1.002, -z0);
  }));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
  return g;
}

export class PHMap {
  constructor(container, { onSelect, onHover, onClear } = {}) {
    this.el = container;
    this.onSelect = onSelect || (() => {});
    this.onHover = onHover || (() => {});
    this.onClear = onClear || (() => {});
    this.regions = new Map();
    this.data = new Map();
    this.focusIndex = 0;
    this.selectedId = null;
    this.color = buildColorScale();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._tweenRaf = null;
    this._dataRaf = null;
    this.hovered = null;
    this._init();
  }

  _init() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(this.el.clientWidth, this.el.clientHeight);
    this.renderer.setClearColor(0x0d2422, 1);
    this.el.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(this.el.clientWidth, this.el.clientHeight);
    Object.assign(this.labelRenderer.domElement.style, {
      position: "absolute", top: "0", left: "0", pointerEvents: "none",
    });
    this.el.appendChild(this.labelRenderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d2422);
    this.camera = new THREE.PerspectiveCamera(38, this.el.clientWidth / this.el.clientHeight, 0.1, 200);
    this.camera.position.set(0, 15.5, 11.5);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 40;
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(85);
    this.controls.target.set(0, 0, 0);
    this.controls.addEventListener("change", () => this.render());
    this.controls.addEventListener("start", () => this._cancelTween());

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.15));
    const dir = new THREE.DirectionalLight(0xffffff, 2.1);
    dir.position.set(-6, 12, 8);
    this.scene.add(dir);
    const rim = new THREE.DirectionalLight(0x88bbd0, 0.8);
    rim.position.set(8, 4, -6);
    this.scene.add(rim);

    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.labels = new THREE.Group();
    this.scene.add(this.labels);
    this._bindInput();
    this._resize = () => this.resize();
    window.addEventListener("resize", this._resize);
    this.render();
  }

  async load(geojson, meta) {
    this.meta = new Map((meta || []).map((m) => [m.geo_id, m]));
    geojson.features.forEach((f) => {
      const id = f.properties.geolocation;
      const geo = geometryFor(f);
      const mat = new THREE.MeshStandardMaterial({ color: 0x575d6d, roughness: 0.85, metalness: 0.05 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.y = 0.15;
      const outlinePts = outlineGeometry(f);
      const edges = new THREE.LineSegments(
        outlinePts,
        new THREE.LineBasicMaterial({ color: 0x14201f, transparent: true, opacity: 0.55 }),
      );
      mesh.add(edges);
      const alert = new THREE.LineSegments(
        outlinePts.clone(),
        new THREE.LineBasicMaterial({ color: 0xa33a25, transparent: true, opacity: 0.7 }),
      );
      alert.visible = false;
      mesh.add(alert);
      mesh.userData = { id, alert, edges };
      const labelDiv = document.createElement("div");
      labelDiv.textContent = f.properties.region_short || "";
      Object.assign(labelDiv.style, {
        color: "#d9e6df", fontSize: "9px", fontFamily: "IBM Plex Mono, monospace",
        letterSpacing: ".03em", textShadow: "0 1px 2px rgba(0,0,0,.8)", opacity: ".9",
      });
      const label = new CSS2DObject(labelDiv);
      label.userData.regionId = id;
      const center = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
      label.position.set(center.x, 1.1, center.z);
      this.labels.add(label);
      this.group.add(mesh);
      this.regions.set(id, mesh);
    });
    this.render();
  }

  update(rows, metric) {
    this.metric = metric;
    const [lo, hi] = metric === "mom" ? [-1.5, 1.5] : [0, 12];
    this.data = new Map(rows.map((r) => [r.geo_id, r]));
    const targets = [];
    this.regions.forEach((mesh, id) => {
      const row = this.data.get(id);
      let color;
      let height;
      let alertWanted = false;
      if (row) {
        const v = Number(row.value);
        const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
        color = this.color(t);
        height = 0.04 + Math.max(0.02, t) * 0.30;
        alertWanted = metric === "yoy" ? v > 4 : Math.abs(v) > 0.5;
        mesh.userData.value = v;
        mesh.userData.rank = row.rank;
      } else {
        color = new THREE.Color(0x6a7573);
        height = 0.04;
        mesh.userData.value = null;
        mesh.userData.rank = null;
      }
      mesh.userData.baseColor = color.clone();
      mesh.userData.alertWanted = alertWanted;
      targets.push({
        mesh,
        c0: mesh.material.color.clone(),
        c1: color,
        h0: mesh.scale.y,
        h1: height,
      });
    });
    this._animateData(targets);
  }

  _animateData(targets) {
    if (this._dataRaf) cancelAnimationFrame(this._dataRaf);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const apply = (e) => {
      targets.forEach((t) => {
        t.mesh.material.color.copy(t.c0).lerp(t.c1, e);
        t.mesh.scale.y = t.h0 + (t.h1 - t.h0) * e;
      });
    };
    if (reduce) {
      apply(1);
      this.highlight(this.selectedId);
      this.render();
      return;
    }
    const t0 = performance.now();
    const dur = 300;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      apply(e);
      this.render();
      if (k < 1) {
        this._dataRaf = requestAnimationFrame(step);
      } else {
        this._dataRaf = null;
        this.highlight(this.selectedId);
      }
    };
    this._dataRaf = requestAnimationFrame(step);
  }

  highlight(id) {
    this.selectedId = id;
    const GRAPHITE = new THREE.Color(0x6a7573);
    this.regions.forEach((mesh, rid) => {
      const on = rid === id;
      const base = mesh.userData.baseColor || mesh.material.color;
      if (id) {
        mesh.material.color.copy(on ? base : GRAPHITE);
        mesh.material.opacity = on ? 1 : 0.45;
        mesh.material.transparent = !on;
        mesh.userData.alert.visible = false;
      } else {
        mesh.material.color.copy(base);
        mesh.material.opacity = 1;
        mesh.material.transparent = false;
        mesh.userData.alert.visible = !!mesh.userData.alertWanted;
      }
      mesh.material.emissive = new THREE.Color(on ? 0xb8791f : 0x000000);
      mesh.material.emissiveIntensity = on ? 0.28 : 0;
    });
    this.render();
  }

  setView(kind) {
    if (kind === "top") this._tweenCamera(new THREE.Vector3(0, 19.5, 0.01), new THREE.Vector3(0, 0, 0));
    else if (kind === "tilt") this._tweenCamera(new THREE.Vector3(-7.5, 12.5, 12.5), new THREE.Vector3(0, 0, 0));
    else this.resetView();
  }

  render() {
    if (!this.renderer) return;
    const zoomed = this.camera.position.distanceTo(this.controls.target) < 13;
    this.labels.children.forEach((label) => {
      label.visible = this.selectedId
        ? label.userData.regionId === this.selectedId
        : zoomed;
    });
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    this.render();
  }

  _pick(evt) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([...this.regions.values()], false);
    return hits.length ? hits[0].object : null;
  }

  _bindInput() {
    const el = this.renderer.domElement;
    el.style.cursor = "grab";
    el.addEventListener("pointermove", (e) => {
      const mesh = this._pick(e);
      if (mesh) {
        el.style.cursor = "pointer";
        const { id, value, rank } = mesh.userData;
        this.onHover({ id, value, rank, x: e.clientX, y: e.clientY });
      } else {
        el.style.cursor = "grab";
        this.onHover(null);
      }
    });
    el.addEventListener("pointerleave", () => this.onHover(null));
    el.addEventListener("click", (e) => {
      const mesh = this._pick(e);
      if (!mesh) { this.highlight(null); this.onClear(); return; }
      if (mesh.userData.id === this.selectedId) {
        this.highlight(null);
        this.onClear();
      } else {
        this.highlight(mesh.userData.id);
        this.onSelect(mesh.userData.id);
      }
    });
    el.addEventListener("dblclick", (e) => {
      const mesh = this._pick(e);
      if (mesh) this.focusCamera(mesh);
    });
    this.el.addEventListener("keydown", (e) => {
      const ids = [...this.regions.keys()];
      if (!ids.length) return;
      if (e.key === "Escape") { this.highlight(null); this.onClear(); return; }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        this.focusIndex = (this.focusIndex + 1) % ids.length; e.preventDefault();
        this.highlight(ids[this.focusIndex]); this.onSelect(ids[this.focusIndex], { keyboard: true });
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        this.focusIndex = (this.focusIndex - 1 + ids.length) % ids.length; e.preventDefault();
        this.highlight(ids[this.focusIndex]); this.onSelect(ids[this.focusIndex], { keyboard: true });
      }
      if (e.key === "Enter") {
        this.onSelect(ids[this.focusIndex], { keyboard: true });
      }
    });
  }

  _cancelTween() {
    if (this._tweenRaf) {
      cancelAnimationFrame(this._tweenRaf);
      this._tweenRaf = null;
    }
  }

  _tweenCamera(pos, target, duration = 600) {
    this._cancelTween();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.camera.lookAt(target);
      this.render();
      return;
    }
    const fromPos = this.camera.position.clone();
    const fromTarget = this.controls.target.clone();
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / duration);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.camera.position.lerpVectors(fromPos, pos, e);
      this.controls.target.lerpVectors(fromTarget, target, e);
      this.camera.lookAt(this.controls.target);
      this.render();
      if (k < 1) {
        this._tweenRaf = requestAnimationFrame(step);
      } else {
        this._tweenRaf = null;
      }
    };
    this._tweenRaf = requestAnimationFrame(step);
  }

  focusCamera(mesh, k = 2.8) { // k: camera distance in region widths
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z, 0.7);
    const pos = new THREE.Vector3(center.x, center.y + span * k, center.z + span * k);
    this._tweenCamera(pos, center);
  }

  zoomTo(id, k) {
    const mesh = this.regions.get(id);
    if (mesh) this.focusCamera(mesh, k);
  }

  setHover(id) {
    if (this.hovered === id) return;
    const prev = this.regions.get(this.hovered);
    if (prev && this.hovered !== this.selectedId) {
      prev.material.emissive.setHex(0x000000);
      prev.material.emissiveIntensity = 0;
    }
    this.hovered = id;
    const mesh = this.regions.get(id);
    if (mesh && id !== this.selectedId) {
      mesh.material.emissive.setHex(0x2a4f48);
      mesh.material.emissiveIntensity = 0.35;
    }
    this.render();
  }

  startAt(pos, target) { // plain arrays so callers need no THREE import
    this.controls.target.set(...target);
    this.camera.position.set(...pos);
    this.camera.lookAt(this.controls.target);
    this.render();
  }

  flyTo(pos, target) {
    this._tweenCamera(new THREE.Vector3(...pos), new THREE.Vector3(...target));
  }

  resetView() {
    this.controls.target.set(0, 0, 0);
    this._tweenCamera(new THREE.Vector3(0, 15.5, 11.5), new THREE.Vector3(0, 0, 0), 700);
  }
}
