import * as THREE from './vendor/three/three.module.js';
import { GLTFLoader } from './vendor/three/GLTFLoader.js';

export class PedroSurfaces {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    this.light = new THREE.DirectionalLight(0xffffff, 2.5);
    this.scene.add(this.light);
    this.models = {};
    this.active = null;
  }

  async load() {
    const gltf = await new GLTFLoader().loadAsync('assets/planets/pedro/scene.gltf');
    gltf.scene.updateMatrixWorld(true);
    const worldToModel = gltf.scene.children[0].matrixWorld.clone().invert();
    const parts = {};
    gltf.scene.traverse(mesh => {
      if (!mesh.isMesh) return;
      if (mesh.isSkinnedMesh) mesh.skeleton.update();
      const materialName = mesh.material.name;
      const name = ({ material: 'sun', SunCorona: 'sun', Nuvem: 'earth', JupiterAtmosphere: 'jupiter' })[materialName] || materialName.toLowerCase();
      const geometry = this.bakeGeometry(mesh, worldToModel);
      const material = mesh.material.clone();
      if (material.transparent) material.depthWrite = false;
      const part = new THREE.Mesh(geometry, material);
      part.name = materialName;
      (parts[name] ||= []).push(part);
    });
    for (const [name, meshes] of Object.entries(parts)) this.models[name] = this.normalise(name, meshes);
  }

  bakeGeometry(mesh, worldToModel) {
    const geometry = mesh.geometry.clone();
    const positions = geometry.attributes.position;
    const vertex = new THREE.Vector3();
    const vertices = [];
    for (let i = 0; i < positions.count; i++) {
      mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld).applyMatrix4(worldToModel);
      vertices.push(vertex.clone());
    }
    geometry.userData.vertices = vertices;
    return geometry;
  }

  normalise(name, meshes) {
    const surface = meshes.find(mesh => mesh.name.toLowerCase() === name || mesh.name === 'material');
    const bounds = new THREE.Box3().setFromPoints(surface.geometry.userData.vertices);
    const centre = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.min(size.x, size.y, size.z) / 2;
    const group = new THREE.Group();
    for (const mesh of meshes) {
      const geometry = mesh.geometry;
      const positions = geometry.attributes.position;
      const cloudBounds = mesh.name === 'Nuvem' ? new THREE.Box3().setFromPoints(geometry.userData.vertices) : null;
      const origin = cloudBounds ? cloudBounds.getCenter(new THREE.Vector3()) : centre;
      const scale = cloudBounds ? cloudBounds.getSize(new THREE.Vector3()).x / 2 / 1.006 : radius;
      geometry.userData.vertices.forEach((vertex, i) => {
        vertex.sub(origin).divideScalar(scale);
        if (name === 'jupiter') vertex.z *= size.x / size.z * 0.935;
        positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
      });
      if (mesh.name === 'Earth') {
        const uv = geometry.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
      }
      delete geometry.userData.vertices;
      geometry.deleteAttribute('skinIndex');
      geometry.deleteAttribute('skinWeight');
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      group.add(mesh);
    }
    return group;
  }

  draw(ctx, name, x, y, radius, yaw, elevation, dpr, phase, tilt) {
    const model = this.models[name];
    if (!model || radius <= 0) return false;
    if (this.active !== model) {
      if (this.active) this.scene.remove(this.active);
      this.scene.add(model);
      this.active = model;
    }
    const extent = name === 'saturn' ? 2.5 : name === 'uranus' ? 1.7 : name === 'sun' ? 1.65 : 1.25;
    const size = Math.max(16, Math.min(1536, Math.ceil(radius * 2 * extent * dpr)));
    if (this.renderer.domElement.width !== size) this.renderer.setSize(size, size, false);
    model.rotation.set(-tilt, 0, -phase);
    const cy = Math.cos(yaw), sy = Math.sin(yaw), ce = Math.cos(elevation), se = Math.sin(elevation);
    this.camera.position.set(-sy * ce, -cy * ce, se).multiplyScalar(10);
    this.camera.up.set(sy * se, cy * se, ce);
    this.camera.lookAt(0, 0, 0);
    this.camera.left = this.camera.bottom = -extent;
    this.camera.right = this.camera.top = extent;
    this.camera.updateProjectionMatrix();
    this.light.position.copy(this.camera.position).add(new THREE.Vector3(-4, 3, 2));
    this.renderer.render(this.scene, this.camera);
    ctx.drawImage(this.renderer.domElement, x - radius * extent, y - radius * extent, radius * 2 * extent, radius * 2 * extent);
    return true;
  }
}
