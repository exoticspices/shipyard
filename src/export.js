// GLB / PNG export and download helpers.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

/**
 * Build an export-ready copy of a ship: centered on the origin, Y-up,
 * meters, nose toward +Z (glTF forward), one mesh + one material per channel.
 */
export function exportableShip(shipGroup, name) {
  const out = new THREE.Group();
  out.name = name;
  const box = new THREE.Box3();
  const meshes = [];
  // on-screen effects (exhaust plumes) are never exported
  shipGroup.traverse((o) => { if (o.isMesh && !o.userData.fx) meshes.push(o); });
  for (const m of meshes) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox); }
  const c = box.getCenter(new THREE.Vector3());
  for (const m of meshes) {
    const g = m.geometry.clone();
    g.translate(-c.x, -c.y, -c.z);
    const mesh = new THREE.Mesh(g, m.material);
    mesh.name = m.name;
    out.add(mesh);
  }
  return out;
}

export async function glbBuffer(shipGroup, name) {
  const obj = exportableShip(shipGroup, name);
  const scene = new THREE.Scene();
  scene.name = name;
  scene.add(obj);
  const buf = await new GLTFExporter().parseAsync(scene, { binary: true });
  obj.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  return buf;
}

export function download(blobOrUrl, filename) {
  const a = document.createElement('a');
  const url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (typeof blobOrUrl !== 'string') setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function downloadGLB(shipGroup, filename) {
  const buf = await glbBuffer(shipGroup, filename.replace(/\.glb$/, ''));
  download(new Blob([buf], { type: 'model/gltf-binary' }), filename);
  return buf.byteLength;
}
