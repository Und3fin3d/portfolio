import * as THREE from './vendor/three/three.module.js';
import { mergeGeometries } from './vendor/three/BufferGeometryUtils.js';

export class SolarFlares {
  constructor(sunColour, sunPreserveColour) {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.camera = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 30);
    this.scene = new THREE.Scene();
    const occluder = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), new THREE.MeshBasicMaterial({ colorWrite: false }));
    occluder.renderOrder = -1;
    this.scene.add(occluder);
    this.model = new THREE.Group();
    this.scene.add(this.model);
    this.material = this.plasmaMaterial(sunColour, sunPreserveColour);
    const regions = [
      [0.25, 0.26, 0.24, 0.13, 0.35],
      [-2.72, -0.18, 0.18, 0.11, -0.6],
      [1.2, -0.48, 0.1, 0.08, 0.7],
      [-1.25, 0.72, 0.075, 0.06, -0.3],
      [2.6, 0.43, 0.14, 0.1, 0.5],
      [-0.5, -0.66, 0.12, 0.075, 0.2],
      [-2, 0.25, 0.055, 0.06, -0.5]
    ];
    const geometry = mergeGeometries(regions.flatMap((region, i) => this.regionGeometry(region, i)));
    this.model.add(new THREE.Mesh(geometry, this.material));
  }

  plasmaMaterial(sunColour, sunPreserveColour) {
    return new THREE.ShaderMaterial({
      uniforms: {
        phase: { value: 0 },
        sunColour: { value: new THREE.Vector3(...sunColour) },
        sunPreserveColour: { value: sunPreserveColour ? 1 : 0 }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float density;
        uniform float phase;
        varying vec3 localPoint;
        varying vec3 viewNormal;
        varying vec2 strandUV;
        varying float strength;
        void main() {
          float anchored = sin(uv.x * 3.14159265);
          vec3 p = position + normal * sin(uv.x * 24.0 + phase * 6.0 + position.z * 17.0) * anchored * 0.0007;
          localPoint = p;
          viewNormal = normalize(normalMatrix * normal);
          strandUV = uv;
          strength = density;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform float phase;
        uniform vec3 sunColour;
        uniform float sunPreserveColour;
        varying vec3 localPoint;
        varying vec3 viewNormal;
        varying vec2 strandUV;
        varying float strength;
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
        void main() {
          vec3 flow = localPoint * 95.0 + vec3(phase * 7.0, phase * 2.0, -phase * 3.0);
          float wisps = noise(flow) * 0.65 + noise(flow * 2.3) * 0.35;
          float softEdge = pow(max(0.0, normalize(viewNormal).z), 1.4);
          float root = 1.0 - smoothstep(1.005, 1.07, length(localPoint));
          float plasma = smoothstep(0.17, 0.8, wisps);
          vec3 colour = mix(vec3(1.0, 0.26, 0.045), vec3(1.0, 0.86, 0.62), plasma * 0.7 + root * 0.3);
          float intensity = dot(colour, vec3(0.2126, 0.7152, 0.0722));
          colour = mix(vec3(intensity), colour, sunPreserveColour) * sunColour * 0.82;
          float alpha = softEdge * strength * plasma;
          gl_FragColor = vec4(colour, alpha);
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
      const spread = i / 27;
      const archHeight = height * (0.18 + spread * 0.82);
      const archWidth = width * (0.42 + spread * 0.58);
      const offset = Math.sin(i * 2.399 + region) * height * 0.085;
      const points = Array.from({ length: 41 }, (_, step) => {
        const t = step / 40 * Math.PI;
        const arch = Math.sin(t);
        const along = Math.cos(t) * archWidth;
        const radial = Math.sqrt(1 - along * along) - 0.006 + arch * archHeight * (1 + 0.16 * Math.sin(t + region));
        const twist = arch * (offset + Math.sin(t * 2.0 + region) * height * 0.19);
        const ripple = arch * Math.sin(t * 9 + i * 0.7) * height * 0.012;
        return normal.clone().multiplyScalar(radial + ripple).addScaledVector(tangent, along + arch * lean * height * 0.22).addScaledVector(cross, twist);
      });
      const radius = haze ? height * 0.11 : 0.0012 + (0.5 + 0.5 * Math.sin(i * 1.71)) * 0.002;
      const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 64, radius, 7, false);
      const density = new Float32Array(geometry.attributes.position.count).fill(haze ? 0.3 : 0.4);
      geometry.setAttribute('density', new THREE.BufferAttribute(density, 1));
      return geometry;
    });
  }

  draw(ctx, x, y, radius, yaw, elevation, dpr, phase, tilt) {
    const extent = 1.5;
    const size = Math.max(16, Math.min(1536, Math.ceil(radius * 2 * extent * dpr)));
    if (this.renderer.domElement.width !== size) this.renderer.setSize(size, size, false);
    this.model.rotation.set(-tilt, 0, -phase);
    this.material.uniforms.phase.value = phase;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), ce = Math.cos(elevation), se = Math.sin(elevation);
    this.camera.position.set(-sy * ce, -cy * ce, se).multiplyScalar(10);
    this.camera.up.set(sy * se, cy * se, ce);
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
    ctx.drawImage(this.renderer.domElement, x - radius * extent, y - radius * extent, radius * 2 * extent, radius * 2 * extent);
  }
}
