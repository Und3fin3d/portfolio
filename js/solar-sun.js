import * as THREE from './vendor/three/three.module.js';

const vertexShader = `
  varying vec3 localPoint;
  varying vec3 viewNormal;
  varying vec2 projectedPoint;
  void main() {
    localPoint = position;
    viewNormal = normalize(normalMatrix * normal);
    vec4 viewPoint = modelViewMatrix * vec4(position, 1.0);
    projectedPoint = viewPoint.xy;
    gl_Position = projectionMatrix * viewPoint;
  }
`;

export class CustomSun {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1.4, 1.4, 1.4, -1.4, 0.1, 30);
    this.model = new THREE.Group();
    this.scene.add(this.model);
  }

  async load() {
    const [response, photo] = await Promise.all([
      fetch('assets/planets/textures/custom-sun/aia171-cr2310.bin'),
      new THREE.TextureLoader().loadAsync('assets/planets/textures/sun-sdo.jpg')
    ]);
    if (!response.ok) throw new Error(`Solar observations: HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength !== 3600 * 1080 * 2) throw new Error('Incomplete solar observations');
    const observations = new THREE.DataTexture(new Uint16Array(buffer), 3600, 1080, THREE.RedFormat, THREE.HalfFloatType);
    observations.minFilter = observations.magFilter = THREE.LinearFilter;
    observations.wrapS = THREE.RepeatWrapping;
    observations.needsUpdate = true;
    this.addSurface(observations);
    this.addProminences(photo);
  }

  addSurface(observations) {
    const material = new THREE.ShaderMaterial({
      uniforms: { observations: { value: observations } },
      vertexShader,
      fragmentShader: `
        uniform sampler2D observations;
        varying vec3 localPoint;
        varying vec3 viewNormal;
        const float PI = 3.14159265359;
        void main() {
          vec3 p = normalize(localPoint);
          vec2 uv = vec2(atan(p.y, p.x) / (2.0 * PI) + 0.5, asin(p.z) / PI + 0.5);
          float intensity = texture2D(observations, uv).r;
          float join = 1.0 - smoothstep(0.0, 0.009, min(uv.x, 1.0 - uv.x));
          float across = texture2D(observations, vec2(1.0 - uv.x, uv.y)).r;
          intensity = mix(intensity, across, join * 0.5);
          float t = clamp(intensity, 0.0, 1.0);
          vec3 colour = vec3(pow(t, 0.7), pow(t, 1.8) * 0.85, pow(t, 4.5) * 0.65);
          colour *= 0.88 + 0.12 * max(0.0, viewNormal.z);
          gl_FragColor = vec4(colour, 1.0);
        }
      `
    });
    this.model.add(new THREE.Mesh(new THREE.SphereGeometry(1, 192, 128), material));
  }

  addProminences(photo) {
    const material = new THREE.ShaderMaterial({
      uniforms: { photo: { value: photo } },
      vertexShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fragmentShader: `
        uniform sampler2D photo;
        varying vec3 localPoint;
        varying vec3 viewNormal;
        varying vec2 projectedPoint;
        void main() {
          float limb = smoothstep(1.0, 1.009, length(projectedPoint));
          float radius = length(localPoint.xy);
          vec2 uv = vec2(0.5, 0.514) + localPoint.xy * 0.398;
          vec3 colour = texture2D(photo, uv).rgb * vec3(1.08, 0.72, 0.38);
          float fade = smoothstep(0.99, 1.015, radius) * (1.0 - smoothstep(1.12, 1.24, radius));
          float facing = smoothstep(0.05, 0.45, abs(normalize(viewNormal).z));
          gl_FragColor = vec4(colour, fade * facing * limb * 0.85);
        }
      `
    });
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.99, 1.24, 192, 8), material);
      mesh.rotation.y = i * Math.PI / 3;
      this.model.add(mesh);
    }
  }

  draw(ctx, x, y, radius, yaw, elevation, dpr, phase) {
    if (radius <= 0) return false;
    const extent = 1.4;
    const size = Math.max(16, Math.min(1536, Math.ceil(radius * 2 * extent * dpr)));
    if (this.renderer.domElement.width !== size) this.renderer.setSize(size, size, false);
    this.model.rotation.set(-56 * Math.PI / 180, 0, -phase);
    const cy = Math.cos(yaw), sy = Math.sin(yaw), ce = Math.cos(elevation), se = Math.sin(elevation);
    this.camera.position.set(-sy * ce, -cy * ce, se).multiplyScalar(10);
    this.camera.up.set(sy * se, cy * se, ce);
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
    ctx.drawImage(this.renderer.domElement, x - radius * extent, y - radius * extent, radius * 2 * extent, radius * 2 * extent);
    return true;
  }
}
