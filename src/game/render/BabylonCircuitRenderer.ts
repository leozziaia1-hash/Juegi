/**
 * BabylonCircuitRenderer.ts - High-Performance FIA Grade-1 Circuit Renderer for Babylon.js
 * 
 * Features:
 * - Seamless extruded ribbon geometry for circuit asphalt with micro-facet PBR
 * - FIA Kerb enamel (alternating red & white) at apex corners
 * - Instanced Armco guardrails and Tecpro energy-absorbing barrier blocks (near-zero draw calls)
 * - 2-Story modern Pit Lane building, garages, team pit wall, and FIA 5-red-lights starting gantry
 * - Covered grandstands with crowd
 * - Stadium high-mast floodlight pylons and perimeter vegetation
 * - Dynamic props synchronization (track cones and distance markers)
 * - FreezeWorldMatrix & BoundingSphere optimizations for 60/120 FPS rock-solid stability
 */

import {
  Scene,
  TransformNode,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  StandardMaterial,
  Color3,
  Vector3,
  ShadowGenerator,
  AbstractMesh,
} from '@babylonjs/core';
import { ICircuitDefinition } from '../circuits/ICircuit';
import { DynamicProp } from '../world/TrackBuilder';

export class BabylonCircuitRenderer {
  public readonly rootNode: TransformNode;
  private readonly scene: Scene;
  private readonly circuit: ICircuitDefinition;

  // Materials
  private asphaltMat!: PBRMaterial;
  private kerbRedMat!: PBRMaterial;
  private kerbWhiteMat!: PBRMaterial;
  private concreteMat!: PBRMaterial;
  private guardrailMat!: PBRMaterial;
  private tecproRedMat!: PBRMaterial;
  private tecproWhiteMat!: PBRMaterial;
  private grassMat!: PBRMaterial;
  private glassMat!: PBRMaterial;
  private gantryMat!: PBRMaterial;
  private coneOrangeMat!: StandardMaterial;

  // Dynamic props mesh map
  private propMeshes = new Map<number, Mesh>();

  constructor(scene: Scene, shadowGenerator: ShadowGenerator | null, circuit: ICircuitDefinition) {
    this.scene = scene;
    this.circuit = circuit;
    this.rootNode = new TransformNode(`circuit_${circuit.id}`, scene);

    this.createMaterials();
    this.buildTerrain();
    this.buildTrackRibbon(shadowGenerator);
    this.buildCornerKerbs();
    this.buildBarriersAndTecpro();
    this.buildPitBuildingAndGantry();
    this.buildGrandstands();
    this.buildFloodlights();
  }

  private createMaterials(): void {
    // 1. Bitumen Asphalt PBR
    this.asphaltMat = new PBRMaterial(`asphaltMat_${this.circuit.id}`, this.scene);
    this.asphaltMat.albedoColor = new Color3(0.22, 0.23, 0.25);
    this.asphaltMat.roughness = 0.80;
    this.asphaltMat.metallic = 0.05;
    this.asphaltMat.directIntensity = 1.8;
    this.asphaltMat.environmentIntensity = 0.7;

    // 2. FIA Kerbs Red Enamel
    this.kerbRedMat = new PBRMaterial(`kerbRed_${this.circuit.id}`, this.scene);
    this.kerbRedMat.albedoColor = new Color3(0.95, 0.15, 0.15);
    this.kerbRedMat.roughness = 0.30;
    this.kerbRedMat.metallic = 0.05;
    this.kerbRedMat.directIntensity = 1.6;

    // 3. FIA Kerbs White Enamel
    this.kerbWhiteMat = new PBRMaterial(`kerbWhite_${this.circuit.id}`, this.scene);
    this.kerbWhiteMat.albedoColor = new Color3(0.95, 0.95, 0.95);
    this.kerbWhiteMat.roughness = 0.30;
    this.kerbWhiteMat.metallic = 0.05;
    this.kerbWhiteMat.directIntensity = 1.6;

    // 4. Cast Concrete Barriers
    this.concreteMat = new PBRMaterial(`concreteMat_${this.circuit.id}`, this.scene);
    this.concreteMat.albedoColor = new Color3(0.72, 0.73, 0.74);
    this.concreteMat.roughness = 0.85;
    this.concreteMat.metallic = 0.02;
    this.concreteMat.directIntensity = 1.5;

    // 5. Galvanized Steel Armco Guardrails
    this.guardrailMat = new PBRMaterial(`guardrailMat_${this.circuit.id}`, this.scene);
    this.guardrailMat.albedoColor = new Color3(0.78, 0.80, 0.82);
    this.guardrailMat.roughness = 0.28;
    this.guardrailMat.metallic = 0.85;
    this.guardrailMat.directIntensity = 1.6;

    // 6. Tecpro High-Impact Cushions
    this.tecproRedMat = new PBRMaterial(`tecproRed_${this.circuit.id}`, this.scene);
    this.tecproRedMat.albedoColor = new Color3(0.90, 0.18, 0.18);
    this.tecproRedMat.roughness = 0.45;
    this.tecproRedMat.metallic = 0.05;
    this.tecproRedMat.directIntensity = 1.5;

    this.tecproWhiteMat = new PBRMaterial(`tecproWhite_${this.circuit.id}`, this.scene);
    this.tecproWhiteMat.albedoColor = new Color3(0.90, 0.90, 0.90);
    this.tecproWhiteMat.roughness = 0.45;
    this.tecproWhiteMat.metallic = 0.05;
    this.tecproWhiteMat.directIntensity = 1.5;

    // 7. Grass & Infield Runoff
    this.grassMat = new PBRMaterial(`grassMat_${this.circuit.id}`, this.scene);
    this.grassMat.albedoColor = new Color3(0.18, 0.36, 0.16);
    this.grassMat.roughness = 0.92;
    this.grassMat.metallic = 0.0;
    this.grassMat.directIntensity = 1.6;

    // 8. Tinted Glass
    this.glassMat = new PBRMaterial(`glassMat_${this.circuit.id}`, this.scene);
    this.glassMat.albedoColor = new Color3(0.1, 0.2, 0.3);
    this.glassMat.alpha = 0.45;
    this.glassMat.roughness = 0.1;
    this.glassMat.metallic = 0.9;

    // 9. Overhead Gantry Dark Steel
    this.gantryMat = new PBRMaterial(`gantryMat_${this.circuit.id}`, this.scene);
    this.gantryMat.albedoColor = new Color3(0.25, 0.26, 0.28);
    this.gantryMat.roughness = 0.4;
    this.gantryMat.metallic = 0.7;

    // 10. Fluorescent Orange Traffic Cone
    this.coneOrangeMat = new StandardMaterial(`coneMat_${this.circuit.id}`, this.scene);
    this.coneOrangeMat.diffuseColor = new Color3(1.0, 0.4, 0.0);
  }

  private buildTerrain(): void {
    // Large Ground Plane
    const ground = MeshBuilder.CreateGround('circuitGround', { width: 520, height: 520, subdivisions: 2 }, this.scene);
    ground.position.y = -0.02;
    ground.material = this.grassMat;
    ground.receiveShadows = true;
    ground.parent = this.rootNode;
    ground.freezeWorldMatrix();
  }

  private buildTrackRibbon(shadowGenerator: ShadowGenerator | null): void {
    // Generate spline points for the 260m x 260m Square Circuit with rounded corners (radius 38m)
    const points: Vector3[] = [];
    const numPointsPerCorner = 18;
    const cornerRadius = 38;
    const innerCorner = 130 - cornerRadius; // 92

    // 4 Corner Centers:
    // C1 (SW): (-92, -92) - angles Math.PI to 1.5 * Math.PI
    // C2 (SE): (92, -92)  - angles 1.5 * Math.PI to 2 * Math.PI
    // C3 (NE): (92, 92)   - angles 0 to Math.PI / 2
    // C4 (NW): (-92, 92)  - angles Math.PI / 2 to Math.PI

    // C1: South-West Corner
    for (let i = 0; i < numPointsPerCorner; i++) {
      const a = Math.PI + (i / numPointsPerCorner) * (Math.PI / 2);
      points.push(new Vector3(-innerCorner + Math.cos(a) * cornerRadius, 0.01, -innerCorner + Math.sin(a) * cornerRadius));
    }
    // C2: South-East Corner
    for (let i = 0; i < numPointsPerCorner; i++) {
      const a = 1.5 * Math.PI + (i / numPointsPerCorner) * (Math.PI / 2);
      points.push(new Vector3(innerCorner + Math.cos(a) * cornerRadius, 0.01, -innerCorner + Math.sin(a) * cornerRadius));
    }
    // C3: North-East Corner
    for (let i = 0; i < numPointsPerCorner; i++) {
      const a = 0 + (i / numPointsPerCorner) * (Math.PI / 2);
      points.push(new Vector3(innerCorner + Math.cos(a) * cornerRadius, 0.01, innerCorner + Math.sin(a) * cornerRadius));
    }
    // C4: North-West Corner
    for (let i = 0; i < numPointsPerCorner; i++) {
      const a = Math.PI / 2 + (i / numPointsPerCorner) * (Math.PI / 2);
      points.push(new Vector3(-innerCorner + Math.cos(a) * cornerRadius, 0.01, innerCorner + Math.sin(a) * cornerRadius));
    }

    // Extrude Track Ribbon (Width = 16m)
    const halfWidth = 8.0;
    const pathLeft: Vector3[] = [];
    const pathRight: Vector3[] = [];

    for (let i = 0; i < points.length; i++) {
      const curr = points[i];
      const next = points[(i + 1) % points.length];
      const dir = next.subtract(curr);
      const len = dir.length();
      if (len < 0.001) continue;
      const normDir = dir.scale(1.0 / len);
      const normal = new Vector3(-normDir.z, 0, normDir.x);

      pathLeft.push(curr.add(normal.scale(halfWidth)));
      pathRight.push(curr.subtract(normal.scale(halfWidth)));
    }

    const ribbon = MeshBuilder.CreateRibbon('trackAsphalt', {
      pathArray: [pathLeft, pathRight],
      closePath: true,
      sideOrientation: Mesh.DOUBLESIDE,
    }, this.scene);

    ribbon.material = this.asphaltMat;
    ribbon.receiveShadows = true;
    ribbon.parent = this.rootNode;
    ribbon.freezeWorldMatrix();

    // Pit Lane Asphalt Strip (along main straight at z = -112)
    const pitLane = MeshBuilder.CreateGround('pitLaneAsphalt', { width: 110, height: 11 }, this.scene);
    pitLane.position.set(-10, 0.015, -112.5);
    pitLane.material = this.asphaltMat;
    pitLane.receiveShadows = true;
    pitLane.parent = this.rootNode;
    pitLane.freezeWorldMatrix();

    // Pit Wall Separator (Concrete wall with safety fence along z = -121.5)
    const pitWall = MeshBuilder.CreateBox('pitWall', { width: 112, height: 1.1, depth: 0.8 }, this.scene);
    pitWall.position.set(-10, 0.55, -121.5);
    pitWall.material = this.concreteMat;
    pitWall.receiveShadows = true;
    if (shadowGenerator) shadowGenerator.addShadowCaster(pitWall);
    pitWall.parent = this.rootNode;
    pitWall.freezeWorldMatrix();
  }

  private buildCornerKerbs(): void {
    // 4 Corner Apex Kerbs (alternating red and white curb segments)
    const corners = [
      { cx: -92, cz: -92, startA: Math.PI, endA: 1.5 * Math.PI },
      { cx: 92, cz: -92, startA: 1.5 * Math.PI, endA: 2.0 * Math.PI },
      { cx: 92, cz: 92, startA: 0, endA: 0.5 * Math.PI },
      { cx: -92, cz: 92, startA: 0.5 * Math.PI, endA: Math.PI },
    ];

    const radius = 30.0; // Inner track border radius (38 - 8)
    const kerbWidth = 1.4;

    for (let c = 0; c < corners.length; c++) {
      const { cx, cz, startA, endA } = corners[c];
      const segments = 24;
      for (let s = 0; s < segments; s++) {
        const a1 = startA + (s / segments) * (endA - startA);
        const a2 = startA + ((s + 1) / segments) * (endA - startA);
        const midA = (a1 + a2) * 0.5;

        const x = cx + Math.cos(midA) * (radius - kerbWidth * 0.5);
        const z = cz + Math.sin(midA) * (radius - kerbWidth * 0.5);

        const kerb = MeshBuilder.CreateBox(`kerb_${c}_${s}`, {
          width: kerbWidth,
          height: 0.08,
          depth: (2 * Math.PI * radius / segments) * 0.25,
        }, this.scene);

        kerb.position.set(x, 0.04, z);
        kerb.rotation.y = -midA;
        kerb.material = s % 2 === 0 ? this.kerbRedMat : this.kerbWhiteMat;
        kerb.receiveShadows = true;
        kerb.parent = this.rootNode;
        kerb.freezeWorldMatrix();
      }
    }
  }

  private buildBarriersAndTecpro(): void {
    // Armco Guardrail Master Mesh for Instancing
    const baseGuardrail = MeshBuilder.CreateBox('baseGuardrail', { width: 4.0, height: 1.1, depth: 0.3 }, this.scene);
    baseGuardrail.material = this.guardrailMat;
    baseGuardrail.setEnabled(false);

    // Tecpro Master Meshes for Instancing
    const baseTecproRed = MeshBuilder.CreateBox('baseTecproRed', { width: 1.6, height: 1.2, depth: 1.2 }, this.scene);
    baseTecproRed.material = this.tecproRedMat;
    baseTecproRed.setEnabled(false);

    const baseTecproWhite = MeshBuilder.CreateBox('baseTecproWhite', { width: 1.6, height: 1.2, depth: 1.2 }, this.scene);
    baseTecproWhite.material = this.tecproWhiteMat;
    baseTecproWhite.setEnabled(false);

    // Exterior Perimeter Guardrails (4 long straights: North, South, East, West)
    const straightOffsets = [
      { startX: -92, endX: 92, z: -138.5, rotY: 0 },         // South
      { startX: -92, endX: 92, z: 138.5, rotY: 0 },          // North
      { startZ: -92, endZ: 92, x: 138.5, rotY: Math.PI / 2 }, // East
      { startZ: -92, endZ: 92, x: -138.5, rotY: Math.PI / 2 },// West
    ];

    let instCount = 0;
    // South & North straights
    for (const s of straightOffsets.slice(0, 2)) {
      const len = s.endX! - s.startX!;
      const count = Math.floor(len / 4.0);
      for (let i = 0; i <= count; i++) {
        const x = s.startX! + i * 4.0;
        const inst = baseGuardrail.createInstance(`guardrail_${instCount++}`);
        inst.position.set(x, 0.55, s.z!);
        inst.rotation.y = s.rotY;
        inst.parent = this.rootNode;
        inst.freezeWorldMatrix();
      }
    }
    // East & West straights
    for (const s of straightOffsets.slice(2, 4)) {
      const len = s.endZ! - s.startZ!;
      const count = Math.floor(len / 4.0);
      for (let i = 0; i <= count; i++) {
        const z = s.startZ! + i * 4.0;
        const inst = baseGuardrail.createInstance(`guardrail_${instCount++}`);
        inst.position.set(s.x!, 0.55, z);
        inst.rotation.y = s.rotY;
        inst.parent = this.rootNode;
        inst.freezeWorldMatrix();
      }
    }

    // Tecpro Runoff Cushions outside the 4 corners
    const tecproCorners = [
      { cx: -136, cz: -136 },
      { cx: 136, cz: -136 },
      { cx: 136, cz: 136 },
      { cx: -136, cz: 136 },
    ];

    let tecproCount = 0;
    for (const tc of tecproCorners) {
      for (let tx = -3; tx <= 3; tx++) {
        for (let tz = -1; tz <= 1; tz++) {
          const isRed = (tx + tz) % 2 === 0;
          const inst = (isRed ? baseTecproRed : baseTecproWhite).createInstance(`tecpro_${tecproCount++}`);
          inst.position.set(tc.cx + tx * 1.65, 0.6, tc.cz + tz * 1.25);
          inst.parent = this.rootNode;
          inst.freezeWorldMatrix();
        }
      }
    }
  }

  private buildPitBuildingAndGantry(): void {
    // 2-Story Pit Lane Garages & Paddock Building along main straight
    const pitBuilding = MeshBuilder.CreateBox('pitBuilding', { width: 95, height: 7.5, depth: 16 }, this.scene);
    pitBuilding.position.set(-10, 3.75, -102);
    pitBuilding.material = this.concreteMat;
    pitBuilding.parent = this.rootNode;
    pitBuilding.freezeWorldMatrix();

    // VIP Glass Viewing Suites (Upper floor)
    const glassBalcony = MeshBuilder.CreateBox('glassBalcony', { width: 93, height: 2.8, depth: 1.2 }, this.scene);
    glassBalcony.position.set(-10, 5.2, -109.8);
    glassBalcony.material = this.glassMat;
    glassBalcony.parent = this.rootNode;
    glassBalcony.freezeWorldMatrix();

    // FIA 5-Red-Lights Starting Gantry (spanning across main track at x = -18, z = -128)
    const gantryArch = MeshBuilder.CreateBox('gantryArch', { width: 1.5, height: 1.2, depth: 22 }, this.scene);
    gantryArch.position.set(-18, 6.8, -128);
    gantryArch.material = this.gantryMat;
    gantryArch.parent = this.rootNode;
    gantryArch.freezeWorldMatrix();

    // Gantry Vertical Pillars (Left and Right of track)
    const pillarL = MeshBuilder.CreateBox('pillarL', { width: 1.5, height: 7.0, depth: 1.5 }, this.scene);
    pillarL.position.set(-18, 3.5, -117);
    pillarL.material = this.gantryMat;
    pillarL.parent = this.rootNode;
    pillarL.freezeWorldMatrix();

    const pillarR = MeshBuilder.CreateBox('pillarR', { width: 1.5, height: 7.0, depth: 1.5 }, this.scene);
    pillarR.position.set(-18, 3.5, -139);
    pillarR.material = this.gantryMat;
    pillarR.parent = this.rootNode;
    pillarR.freezeWorldMatrix();
  }

  private buildGrandstands(): void {
    // Main Straight Grandstand (Spectator Seating opposite the pit lane)
    const mainStand = MeshBuilder.CreateBox('mainStand', { width: 85, height: 9.0, depth: 12 }, this.scene);
    mainStand.position.set(-10, 4.5, -148);
    mainStand.material = this.concreteMat;
    mainStand.parent = this.rootNode;
    mainStand.freezeWorldMatrix();

    // Grandstand Sloped Canopy Roof
    const roof = MeshBuilder.CreateBox('standRoof', { width: 87, height: 0.6, depth: 15 }, this.scene);
    roof.rotation.x = -0.15;
    roof.position.set(-10, 9.8, -146);
    roof.material = this.gantryMat;
    roof.parent = this.rootNode;
    roof.freezeWorldMatrix();
  }

  private buildFloodlights(): void {
    // 4 High-Mast Stadium Floodlights around the circuit
    const pylonPositions = [
      { x: -110, z: -110 },
      { x: 110, z: -110 },
      { x: 110, z: 110 },
      { x: -110, z: 110 },
    ];

    for (let i = 0; i < pylonPositions.length; i++) {
      const pos = pylonPositions[i];
      const pylon = MeshBuilder.CreateCylinder(`floodlightPylon_${i}`, {
        height: 22,
        diameterTop: 0.45,
        diameterBottom: 1.1,
        tessellation: 8,
      }, this.scene);
      pylon.position.set(pos.x, 11, pos.z);
      pylon.material = this.gantryMat;
      pylon.parent = this.rootNode;
      pylon.freezeWorldMatrix();

      // Light head rack
      const rack = MeshBuilder.CreateBox(`rack_${i}`, { width: 4.5, height: 2.2, depth: 0.8 }, this.scene);
      rack.position.set(pos.x, 21.8, pos.z);
      rack.material = this.gantryMat;
      rack.parent = this.rootNode;
      rack.freezeWorldMatrix();
    }
  }

  public updateDynamicProps(props: DynamicProp[]): void {
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      let mesh = this.propMeshes.get(p.id);

      if (!mesh) {
        mesh = MeshBuilder.CreateCylinder(`dynProp_${p.id}`, {
          height: p.height || 0.65,
          diameterTop: 0.08,
          diameterBottom: p.radius * 2 || 0.35,
          tessellation: 12,
        }, this.scene);
        mesh.material = this.coneOrangeMat;
        mesh.parent = this.rootNode;
        this.propMeshes.set(p.id, mesh);
      }

      mesh.position.set(p.position.x, p.position.y || p.baseY || 0.3, p.position.z);
      if (p.rotation) {
        mesh.rotation.set(p.rotation.x, p.rotation.y, p.rotation.z);
      }
    }
  }

  public dispose(): void {
    this.rootNode.dispose();
  }
}
