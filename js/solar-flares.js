import * as THREE from './vendor/three/three.module.js';
import { mergeGeometries } from './vendor/three/BufferGeometryUtils.js';

const vertexShader = `
  attribute float density;
  attribute float lift;
  attribute float region;
  attribute float arcade;
  attribute vec3 anchor;
  uniform float phase;
  uniform float eruptRegion;
  uniform float eruptAge;
  varying vec2 strandUV;
  varying vec3 localPoint;
  varying float strength;
  varying float height;
  varying float disc;
  varying float across;
  varying float visible;
  varying float cooling;
  varying float shift;
  varying float loop;
  void main() {
    float anchored = sin(uv.x * 3.14159265);
    vec3 p = position + normal * sin(uv.x * 24.0 + phase * 6.0 + position.z * 17.0) * anchored * 0.0007;
    float mine = eruptAge >= 0.0 ? 1.0 - step(0.5, abs(region - eruptRegion)) : 0.0;
    float r = eruptAge < 45.0 ? clamp(eruptAge / 45.0, 0.0, 1.0) : 0.0;
    if (arcade > 0.5) {
      p = normalize(p) * (1.0 + (length(p) - 1.0) * (0.5 + 0.5 * smoothstep(20.0, 80.0, eruptAge)));
      visible = mine * smoothstep(20.0, 30.0, eruptAge) * (1.0 - smoothstep(70.0, 100.0, eruptAge));
      cooling = smoothstep(30.0, 90.0, eruptAge);
    } else {
      float strandRate = 0.6 + 0.9 * fract(density * 37.0 + region * 0.31);
      float rise = mine * lift * (0.08 * r + 1.25 * r * r * r) * strandRate;
      float twist = mine * (1.1 + 0.9 * strandRate) * r * lift;
      vec3 offset = p - anchor;
      offset = offset * cos(twist) + cross(anchor, offset) * sin(twist) + anchor * dot(anchor, offset) * (1.0 - cos(twist));
      p = anchor + offset * (1.0 + 3.2 * rise) + anchor * rise;
      float erupted = eruptAge < 45.0 ? (1.0 + 0.9 * smoothstep(0.05, 0.35, r)) * (1.0 - smoothstep(0.45, 0.85, r)) / (1.0 + 2.5 * rise) : smoothstep(80.0, 120.0, eruptAge);
      visible = mix(1.0, erupted, mine);
      cooling = 0.0;
    }
    shift = mine * max(eruptAge, 0.0) * 0.8 * (1.0 - arcade);
    loop = arcade;
    vec4 viewPoint = modelViewMatrix * vec4(p, 1.0);
    localPoint = p;
    strandUV = uv;
    strength = density;
    height = lift;
    disc = 1.0 - smoothstep(0.985, 1.02, length(viewPoint.xy));
    across = abs(normalize(normalMatrix * normal).z);
    gl_Position = projectionMatrix * viewPoint;
  }
`;

const noise = `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.3, 0.7));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 p) {
    vec3 cell = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(cell), hash(cell + vec3(1,0,0)), f.x),
                   mix(hash(cell + vec3(0,1,0)), hash(cell + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(cell + vec3(0,0,1)), hash(cell + vec3(1,0,1)), f.x),
                   mix(hash(cell + vec3(0,1,1)), hash(cell + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float plasma(vec2 strandUV, vec3 localPoint, float phase, float shift) {
    float leg = strandUV.x < 0.5 ? strandUV.x : 1.0 - strandUV.x;
    float drain = noise(vec3(leg * 36.0 + phase * 9.0 + shift, strandUV.y * 5.0, localPoint.z * 40.0));
    float knots = noise(localPoint * 38.0 + vec3(phase * 3.0, phase, -phase * 1.5));
    return smoothstep(0.15, 0.9, drain * 0.5 + knots * 0.5);
  }
`;

export class SolarFlares {
  constructor(regions, sunColour, sunPreserveColour) {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.extent = 2.2;
    this.camera = new THREE.OrthographicCamera(-this.extent, this.extent, this.extent, -this.extent, 0.1, 30);
    this.scene = new THREE.Scene();
    const occluder = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), new THREE.MeshBasicMaterial({ colorWrite: false }));
    occluder.renderOrder = -1;
    this.scene.add(occluder);
    this.model = new THREE.Group();
    this.scene.add(this.model);
    this.uniforms = {
      phase: { value: 0 },
      eruptRegion: { value: 0 },
      eruptAge: { value: -1 },
      sunColour: { value: new THREE.Vector3(...sunColour) },
      sunPreserveColour: { value: sunPreserveColour ? 1 : 0 }
    };
    this.anchors = regions.map(([longitude, latitude]) => new THREE.Vector3(Math.cos(longitude) * Math.cos(latitude), Math.sin(longitude) * Math.cos(latitude), Math.sin(latitude)));
    this.eruptAge = -1;
    this.wait = 30;
    this.clock = 0;
    const geometry = mergeGeometries(regions.flatMap((region, i) => [...this.regionGeometry(region, i), ...this.arcadeGeometry(region, i)]));
    this.model.add(new THREE.Mesh(geometry, this.filamentMaterial()));
    this.model.add(new THREE.Mesh(geometry, this.emissionMaterial()));
  }

  emissionMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader,
      fragmentShader: `
        uniform float phase;
        uniform vec3 sunColour;
        uniform float sunPreserveColour;
        varying vec2 strandUV;
        varying vec3 localPoint;
        varying float strength;
        varying float height;
        varying float disc;
        varying float across;
        varying float visible;
        varying float cooling;
        varying float shift;
        varying float loop;
        ${noise}
        void main() {
          float gas = plasma(strandUV, localPoint, phase, shift);
          float root = 1.0 - smoothstep(0.0, 0.35, height);
          vec3 prominence = mix(vec3(0.9, 0.12, 0.02), vec3(1.0, 0.45, 0.12), gas * 0.5 + root * 0.5);
          vec3 colour = mix(prominence, mix(vec3(1.0, 0.6, 0.28), vec3(0.95, 0.2, 0.04), cooling), loop);
          float intensity = dot(colour, vec3(0.2126, 0.7152, 0.0722));
          colour = mix(vec3(intensity) * sunColour, colour, sunPreserveColour);
          float alpha = min(1.0, 1.7 * pow(across, 1.4) * strength * gas) * (1.0 - disc * (1.0 - 0.7 * loop)) * (1.0 - 0.4 * smoothstep(0.4, 1.0, height));
          gl_FragColor = vec4(colour, alpha * visible);
          #include <colorspace_fragment>
        }
      `
    });
  }

  filamentMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader,
      fragmentShader: `
        uniform float phase;
        varying vec2 strandUV;
        varying vec3 localPoint;
        varying float strength;
        varying float height;
        varying float disc;
        varying float across;
        varying float visible;
        varying float shift;
        varying float loop;
        ${noise}
        void main() {
          float gas = plasma(strandUV, localPoint, phase * 0.5, shift);
          float alpha = min(0.8, 1.8 * pow(across, 1.2) * strength * gas) * disc * smoothstep(0.35, 0.85, height) * (1.0 - loop);
          gl_FragColor = vec4(0.16, 0.025, 0.005, min(1.0, alpha * visible));
          #include <colorspace_fragment>
        }
      `
    });
  }

  regionGeometry([longitude, latitude, height, width, lean], region) {
    const normal = new THREE.Vector3(Math.cos(longitude) * Math.cos(latitude), Math.sin(longitude) * Math.cos(latitude), Math.sin(latitude));
    const east = new THREE.Vector3(-Math.sin(longitude), Math.cos(longitude), 0);
    const north = new THREE.Vector3().crossVectors(normal, east);
    const tangent = east.clone().multiplyScalar(Math.cos(lean)).addScaledVector(north, Math.sin(lean));
    const cross = new THREE.Vector3().crossVectors(normal, tangent);
    return Array.from({ length: 28 }, (_, i) => {
      const haze = i % 6 === 0;
      const spread = 0.5 + 0.5 * Math.sin(i * 4.13 + region * 1.9);
      const archHeight = height * (0.18 + spread * 0.82);
      const archWidth = width * (0.42 + spread * 0.58);
      const row = (Math.sin(i * 2.399 + region) * 0.5) * width * 1.1;
      const points = Array.from({ length: 41 }, (_, step) => {
        const t = step / 40 * Math.PI;
        const arch = Math.sin(t);
        const along = Math.cos(t) * archWidth;
        const radial = Math.sqrt(1 - along * along) - 0.006 + arch * archHeight * (1 + 0.16 * Math.sin(t + region));
        const twist = arch * Math.sin(t * 2.0 + region) * height * 0.12;
        const ripple = arch * Math.sin(t * 9 + i * 0.7) * height * 0.012;
        return normal.clone().multiplyScalar(radial + ripple).addScaledVector(tangent, along + arch * lean * height * 0.22).addScaledVector(cross, row + twist);
      });
      const radius = haze ? height * 0.14 : 0.003 + (0.5 + 0.5 * Math.sin(i * 1.71)) * 0.004;
      const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 64, radius, 7, false);
      const position = geometry.attributes.position;
      return this.strand(geometry, { density: haze ? 0.25 : 0.12 + 0.4 * (0.5 + 0.5 * Math.sin(i * 7.31 + region * 3.7)) ** 2, height, region, arcade: 0, anchor: normal });
    });
  }

  arcadeGeometry([longitude, latitude, height, width, lean], region) {
    const normal = this.anchors[region];
    const east = new THREE.Vector3(-Math.sin(longitude), Math.cos(longitude), 0);
    const north = new THREE.Vector3().crossVectors(normal, east);
    const tangent = east.clone().multiplyScalar(Math.cos(lean)).addScaledVector(north, Math.sin(lean));
    const cross = new THREE.Vector3().crossVectors(normal, tangent);
    return Array.from({ length: 16 }, (_, i) => {
      const row = (i / 15 - 0.5) * width * 1.8;
      const archWidth = width * (0.7 + 0.12 * Math.sin(i * 2.1 + region));
      const archHeight = height * (0.6 + 0.12 * Math.sin(i * 1.3));
      const points = Array.from({ length: 25 }, (_, step) => {
        const t = step / 24 * Math.PI;
        const along = Math.cos(t) * archWidth;
        return normal.clone().multiplyScalar(Math.sqrt(1 - along * along) - 0.004 + Math.sin(t) * archHeight).addScaledVector(tangent, along).addScaledVector(cross, row);
      });
      const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 40, 0.006, 6, false);
      return this.strand(geometry, { density: 0.7, height, region, arcade: 1, anchor: normal });
    });
  }

  strand(geometry, { density, height, region, arcade, anchor }) {
    const position = geometry.attributes.position;
    const each = value => new THREE.BufferAttribute(new Float32Array(position.count).fill(value), 1);
    const lift = new Float32Array(position.count).map((_, v) => Math.max(0, (Math.hypot(position.getX(v), position.getY(v), position.getZ(v)) - 1) / height));
    geometry.setAttribute('density', each(density));
    geometry.setAttribute('lift', new THREE.BufferAttribute(lift, 1));
    geometry.setAttribute('region', each(region));
    geometry.setAttribute('arcade', each(arcade));
    geometry.setAttribute('anchor', new THREE.BufferAttribute(new Float32Array(position.count * 3).map((_, k) => anchor.getComponent(k % 3)), 3));
    return geometry;
  }

  erupt(dt, spin, sunRate, tilt) {
    const pace = Math.max(1, sunRate * 120 / 0.7);
    if (this.eruptAge < 0) {
      this.wait -= dt;
      if (this.wait > 0) return;
      const facing = angle => {
        const turn = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-tilt, 0, -angle));
        const eye = this.camera.position.clone().normalize();
        return this.anchors.map(anchor => anchor.clone().applyMatrix4(turn).dot(eye));
      };
      const now = facing(spin), later = facing(spin - sunRate * 22 / pace);
      const limb = later.map((dot, i) => Math.abs(dot - 0.1) + (dot < now[i] ? 1 : 0));
      this.uniforms.eruptRegion.value = limb.indexOf(Math.min(...limb));
      this.eruptAge = 0;
    }
    this.eruptAge += dt * pace;
    if (this.eruptAge >= 120) [this.eruptAge, this.wait] = [-1, 45 + Math.random() * 75];
    this.uniforms.eruptAge.value = this.eruptAge;
  }

  draw(ctx, box, yaw, elevation, spin, sunRate, tilt, time) {
    const canvas = this.renderer.domElement;
    if (canvas.width !== box.bw || canvas.height !== box.bh) this.renderer.setSize(box.bw, box.bh, false);
    this.renderer.setViewport(0, 0, box.dw, box.dh);
    [this.camera.left, this.camera.bottom, this.camera.right, this.camera.top] = box.window;
    this.camera.updateProjectionMatrix();
    this.model.rotation.set(-tilt, 0, -spin);
    this.uniforms.phase.value = time * 0.0135;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), ce = Math.cos(elevation), se = Math.sin(elevation);
    this.camera.position.set(-sy * ce, -cy * ce, se).multiplyScalar(10);
    this.camera.up.set(sy * se, cy * se, ce);
    this.camera.lookAt(0, 0, 0);
    this.erupt(Math.min(0.1, time - this.clock), spin, sunRate, tilt);
    this.clock = time;
    this.renderer.render(this.scene, this.camera);
    ctx.drawImage(canvas, 0, box.bh - box.dh, box.dw, box.dh, box.x0, box.y0, box.w, box.h);
  }
}
