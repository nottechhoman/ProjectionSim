import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyBoxUvAtlas } from '../scene/objects/createBox';
import { applyUvAtlas, uvReportForMeshes } from './uvAtlas';

const meshOf = (g: THREE.BufferGeometry) => new THREE.Mesh(g);

describe('UV overlap check and atlas', () => {
  it('flags overlapping UVs (BoxGeometry faces all use 0–1)', () => {
    const r = uvReportForMeshes([meshOf(new THREE.BoxGeometry(1, 1, 1))]);
    expect(r.overlap).toBeGreaterThan(0.9);
    expect(r.outside).toBe(0);
  });

  it('a plane and the built-in box atlas are clean', () => {
    expect(uvReportForMeshes([meshOf(new THREE.PlaneGeometry(2, 1))]).overlap).toBeLessThan(0.01);
    const box = new THREE.BoxGeometry(1, 1, 1);
    applyBoxUvAtlas(box);
    expect(uvReportForMeshes([meshOf(box)]).overlap).toBeLessThan(0.01);
  });

  it('reports UVs outside 0–1 (tiling)', () => {
    const g = new THREE.PlaneGeometry(1, 1);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i));
    expect(uvReportForMeshes([meshOf(g)]).outside).toBe(1);
  });

  it('generated atlas removes the overlap, across several meshes, inside 0–1', () => {
    const root = new THREE.Group();
    const a = meshOf(new THREE.BoxGeometry(1, 2, 0.5));
    const b = meshOf(new THREE.BoxGeometry(1, 1, 1));
    b.position.set(2, 0, 0);
    const c = meshOf(new THREE.TorusKnotGeometry(0.5, 0.15, 64, 8));
    c.position.set(-2, 0, 0);
    root.add(a, b, c);
    applyUvAtlas([a, b, c], root);
    const r = uvReportForMeshes([a, b, c]);
    expect(r.outside).toBe(0);
    expect(r.overlap).toBeLessThan(0.05);
  });
});
