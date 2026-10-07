/**
 * BabylonCarRenderer.ts - Next-Gen High-Fidelity Competition Race Car for Babylon.js
 * 
 * Features:
 * - Automotive Multi-Layer PBR with Clear Coat (metallic sheen, micro-roughness, reflection)
 * - True 3D Aerodynamic Monocoque: Sculpted nose, sidepods, halo, diffuser, front & rear wings
 * - Motorized DRS Actuator: Dynamic flap rotation when DRS is open
 * - Articulated 4-Wheel Assembly: Steering angle, wheel spin, suspension compression, camber
 * - Glowing Carbon-Ceramic Brake Discs: Dynamic thermal emissive glow under hard braking
 * - Pulsating FIA Rain Light & Exhaust Backfire Flare
 * - Contact Shadow Plane pinned to the track surface
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
} from '@babylonjs/core';
import { VehiclePhysics, CarInputs } from '../physics/VehiclePhysics';
import { TireCompoundType } from '../physics/TireCompound';
import { TeamLiveryConfig } from '../career/CareerTypes';

export class BabylonCarRenderer {
  public readonly rootNode: TransformNode;
  private readonly scene: Scene;
  private readonly isAi: boolean;

  // Materials
  private bodyMaterial!: PBRMaterial;
  private carbonMaterial!: PBRMaterial;
  private glassMaterial!: PBRMaterial;
  private tireMaterial!: PBRMaterial;
  private rimMaterial!: PBRMaterial;
  private brakeDiscMaterial!: StandardMaterial;
  private rainLightMaterial!: StandardMaterial;
  private exhaustFlameMaterial!: StandardMaterial;

  // Articulated Meshes
  private frontWingLeft!: Mesh;
  private frontWingRight!: Mesh;
  private drsFlap!: Mesh;
  private steeringWheel!: Mesh;
  private driverHelmet!: Mesh;
  private contactShadowMesh!: Mesh;
  private exhaustFlameMesh!: Mesh;

  // 4 Wheels: FL(0), FR(1), RL(2), RR(3)
  private wheelPivots: TransformNode[] = [];
  private wheelMeshes: Mesh[] = [];
  private brakeDiscs: Mesh[] = [];

  // Animation States
  private currentDrsAngle = 0;
  private backfireTimer = 0;
  private rainLightTimer = 0;

  // Livery settings
  private primaryColor: Color3;
  private secondaryColor: Color3;

  constructor(
    scene: Scene,
    shadowGenerator: ShadowGenerator | null,
    isAi = false,
    livery?: Partial<TeamLiveryConfig>
  ) {
    this.scene = scene;
    this.isAi = isAi;
    this.rootNode = new TransformNode(`car_${isAi ? 'ai' : 'player'}_${Math.random().toString(36).substring(2, 7)}`, scene);

    // Livery Colors
    if (livery?.primaryColor) {
      this.primaryColor = Color3.FromHexString(livery.primaryColor);
    } else if (isAi) {
      this.primaryColor = new Color3(0.12, 0.45, 0.95);
    } else {
      this.primaryColor = new Color3(0.92, 0.08, 0.12); // Apex Scuderia Red
    }

    if (livery?.secondaryColor) {
      this.secondaryColor = Color3.FromHexString(livery.secondaryColor);
    } else {
      this.secondaryColor = new Color3(0.12, 0.12, 0.14); // Dark Carbon
    }

    this.createMaterials();
    this.buildChassis();
    this.buildAerodynamics();
    this.buildCockpit();
    this.buildWheels();
    this.buildContactShadow();
    this.buildExhaustAndRainLight();

    // Register with shadow generator
    if (shadowGenerator) {
      this.rootNode.getChildMeshes().forEach((m) => {
        if (m !== this.contactShadowMesh && m !== this.exhaustFlameMesh) {
          shadowGenerator.addShadowCaster(m, false);
          m.receiveShadows = true;
        }
      });
    }
  }

  private createMaterials(): void {
    // 1. Automotive Paint with Clear Coat
    this.bodyMaterial = new PBRMaterial(`bodyMat_${this.rootNode.name}`, this.scene);
    this.bodyMaterial.albedoColor = this.primaryColor;
    this.bodyMaterial.metallic = 0.85;
    this.bodyMaterial.roughness = 0.22;
    this.bodyMaterial.directIntensity = 1.6;
    this.bodyMaterial.environmentIntensity = 0.8;
    this.bodyMaterial.clearCoat.isEnabled = true;
    this.bodyMaterial.clearCoat.intensity = 1.0;
    this.bodyMaterial.clearCoat.roughness = 0.04;
    this.bodyMaterial.clearCoat.indexOfRefraction = 1.54;

    // 2. High-Tech Carbon Fiber
    this.carbonMaterial = new PBRMaterial(`carbonMat_${this.rootNode.name}`, this.scene);
    this.carbonMaterial.albedoColor = new Color3(0.08, 0.08, 0.09);
    this.carbonMaterial.metallic = 0.35;
    this.carbonMaterial.roughness = 0.52;
    this.carbonMaterial.directIntensity = 1.4;

    // 3. Tinted Windshield Glass
    this.glassMaterial = new PBRMaterial(`glassMat_${this.rootNode.name}`, this.scene);
    this.glassMaterial.albedoColor = new Color3(0.05, 0.07, 0.12);
    this.glassMaterial.alpha = 0.38;
    this.glassMaterial.roughness = 0.05;
    this.glassMaterial.metallic = 0.1;
    this.glassMaterial.clearCoat.isEnabled = true;
    this.glassMaterial.clearCoat.intensity = 0.8;

    // 4. Competition Tire Rubber
    this.tireMaterial = new PBRMaterial(`tireMat_${this.rootNode.name}`, this.scene);
    this.tireMaterial.albedoColor = new Color3(0.12, 0.12, 0.13);
    this.tireMaterial.metallic = 0.05;
    this.tireMaterial.roughness = 0.85;

    // 5. Forged Alloy Rims
    this.rimMaterial = new PBRMaterial(`rimMat_${this.rootNode.name}`, this.scene);
    this.rimMaterial.albedoColor = new Color3(0.85, 0.72, 0.35); // Gold/Bronze forged alloy
    this.rimMaterial.metallic = 0.95;
    this.rimMaterial.roughness = 0.22;

    // 6. Glowing Carbon-Ceramic Brake Discs
    this.brakeDiscMaterial = new StandardMaterial(`brakeMat_${this.rootNode.name}`, this.scene);
    this.brakeDiscMaterial.diffuseColor = new Color3(0.25, 0.25, 0.25);
    this.brakeDiscMaterial.emissiveColor = new Color3(0, 0, 0);

    // 7. FIA Rain LED Light
    this.rainLightMaterial = new StandardMaterial(`rainLightMat_${this.rootNode.name}`, this.scene);
    this.rainLightMaterial.diffuseColor = new Color3(1, 0, 0);
    this.rainLightMaterial.emissiveColor = new Color3(0.9, 0.1, 0.1);

    // 8. Exhaust Flame Flare
    this.exhaustFlameMaterial = new StandardMaterial(`flameMat_${this.rootNode.name}`, this.scene);
    this.exhaustFlameMaterial.diffuseColor = new Color3(1, 0.6, 0.1);
    this.exhaustFlameMaterial.emissiveColor = new Color3(1, 0.5, 0.05);
    this.exhaustFlameMaterial.alpha = 0;
  }

  private buildChassis(): void {
    // Main Aerodynamic Fuselage
    const monocoque = MeshBuilder.CreateBox('monocoque', { width: 0.88, height: 0.42, depth: 3.2 }, this.scene);
    monocoque.position.set(0, 0.28, 0);
    monocoque.material = this.bodyMaterial;
    monocoque.parent = this.rootNode;

    // Nosecone (tapered forward)
    const nose = MeshBuilder.CreateCylinder('nosecone', { height: 1.5, diameterTop: 0.32, diameterBottom: 0.75, tessellation: 16 }, this.scene);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.22, 1.95);
    nose.material = this.bodyMaterial;
    nose.parent = this.rootNode;

    // Engine Cover & Airbox
    const airbox = MeshBuilder.CreateBox('airbox', { width: 0.52, height: 0.55, depth: 1.6 }, this.scene);
    airbox.position.set(0, 0.58, -0.4);
    airbox.material = this.bodyMaterial;
    airbox.parent = this.rootNode;

    // Sidepods (Left & Right sculpted radiators)
    const sidepodL = MeshBuilder.CreateBox('sidepodL', { width: 0.45, height: 0.36, depth: 1.9 }, this.scene);
    sidepodL.position.set(-0.62, 0.24, -0.15);
    sidepodL.material = this.bodyMaterial;
    sidepodL.parent = this.rootNode;

    const sidepodR = MeshBuilder.CreateBox('sidepodR', { width: 0.45, height: 0.36, depth: 1.9 }, this.scene);
    sidepodR.position.set(0.62, 0.24, -0.15);
    sidepodR.material = this.bodyMaterial;
    sidepodR.parent = this.rootNode;

    // Underfloor Carbon Splitter & Venturi Diffuser
    const floor = MeshBuilder.CreateBox('floor', { width: 1.65, height: 0.05, depth: 3.6 }, this.scene);
    floor.position.set(0, 0.08, -0.1);
    floor.material = this.carbonMaterial;
    floor.parent = this.rootNode;

    // Diffuser upswept channels
    const diffuser = MeshBuilder.CreateBox('diffuser', { width: 1.1, height: 0.18, depth: 0.65 }, this.scene);
    diffuser.rotation.x = -0.22;
    diffuser.position.set(0, 0.18, -1.85);
    diffuser.material = this.carbonMaterial;
    diffuser.parent = this.rootNode;
  }

  private buildAerodynamics(): void {
    // Front Wing Mainplane
    const fwMain = MeshBuilder.CreateBox('fwMain', { width: 1.75, height: 0.04, depth: 0.42 }, this.scene);
    fwMain.position.set(0, 0.10, 2.45);
    fwMain.material = this.carbonMaterial;
    fwMain.parent = this.rootNode;

    // Front Wing Endplates
    const fwEpL = MeshBuilder.CreateBox('fwEpL', { width: 0.03, height: 0.22, depth: 0.48 }, this.scene);
    fwEpL.position.set(-0.88, 0.16, 2.45);
    fwEpL.material = this.bodyMaterial;
    fwEpL.parent = this.rootNode;
    this.frontWingLeft = fwEpL;

    const fwEpR = MeshBuilder.CreateBox('fwEpR', { width: 0.03, height: 0.22, depth: 0.48 }, this.scene);
    fwEpR.position.set(0.88, 0.16, 2.45);
    fwEpR.material = this.bodyMaterial;
    fwEpR.parent = this.rootNode;
    this.frontWingRight = fwEpR;

    // Rear Wing Pylons (Swan-neck supports)
    const pylonL = MeshBuilder.CreateBox('pylonL', { width: 0.04, height: 0.68, depth: 0.18 }, this.scene);
    pylonL.position.set(-0.25, 0.58, -1.85);
    pylonL.material = this.carbonMaterial;
    pylonL.parent = this.rootNode;

    const pylonR = MeshBuilder.CreateBox('pylonR', { width: 0.04, height: 0.68, depth: 0.18 }, this.scene);
    pylonR.position.set(0.25, 0.58, -1.85);
    pylonR.material = this.carbonMaterial;
    pylonR.parent = this.rootNode;

    // Rear Wing Main Lower Beam
    const rwMain = MeshBuilder.CreateBox('rwMain', { width: 1.35, height: 0.05, depth: 0.32 }, this.scene);
    rwMain.position.set(0, 0.88, -1.90);
    rwMain.material = this.carbonMaterial;
    rwMain.parent = this.rootNode;

    // Rear Wing Endplates
    const rwEpL = MeshBuilder.CreateBox('rwEpL', { width: 0.03, height: 0.45, depth: 0.52 }, this.scene);
    rwEpL.position.set(-0.68, 0.82, -1.90);
    rwEpL.material = this.bodyMaterial;
    rwEpL.parent = this.rootNode;

    const rwEpR = MeshBuilder.CreateBox('rwEpR', { width: 0.03, height: 0.45, depth: 0.52 }, this.scene);
    rwEpR.position.set(0.68, 0.82, -1.90);
    rwEpR.material = this.bodyMaterial;
    rwEpR.parent = this.rootNode;

    // Articulated Motorized DRS Flap (Upper Wing Element)
    this.drsFlap = MeshBuilder.CreateBox('drsFlap', { width: 1.32, height: 0.04, depth: 0.22 }, this.scene);
    this.drsFlap.position.set(0, 0.96, -1.86);
    this.drsFlap.material = this.carbonMaterial;
    this.drsFlap.parent = this.rootNode;
  }

  private buildCockpit(): void {
    // Cockpit Opening Recess
    const cockpit = MeshBuilder.CreateBox('cockpit', { width: 0.58, height: 0.26, depth: 0.95 }, this.scene);
    cockpit.position.set(0, 0.42, 0.45);
    cockpit.material = this.carbonMaterial;
    cockpit.parent = this.rootNode;

    // Curved Tinted Windscreen Aero Visor
    const windscreen = MeshBuilder.CreateCylinder('windscreen', { height: 0.18, diameter: 0.56, tessellation: 16 }, this.scene);
    windscreen.rotation.x = Math.PI / 4;
    windscreen.position.set(0, 0.52, 0.95);
    windscreen.material = this.glassMaterial;
    windscreen.parent = this.rootNode;

    // Titanium Halo Safety Bar
    const haloLoop = MeshBuilder.CreateTorus('haloLoop', { diameter: 0.52, thickness: 0.05, tessellation: 20 }, this.scene);
    haloLoop.rotation.x = Math.PI / 2;
    haloLoop.position.set(0, 0.68, 0.52);
    haloLoop.material = this.carbonMaterial;
    haloLoop.parent = this.rootNode;

    const haloPillar = MeshBuilder.CreateCylinder('haloPillar', { height: 0.24, diameter: 0.05 }, this.scene);
    haloPillar.position.set(0, 0.56, 0.76);
    haloPillar.material = this.carbonMaterial;
    haloPillar.parent = this.rootNode;

    // Driver Racing Helmet
    this.driverHelmet = MeshBuilder.CreateSphere('driverHelmet', { diameter: 0.32, segments: 16 }, this.scene);
    this.driverHelmet.position.set(0, 0.58, 0.32);
    this.driverHelmet.material = this.bodyMaterial;
    this.driverHelmet.parent = this.rootNode;

    // Helmet Visor
    const visor = MeshBuilder.CreateBox('visor', { width: 0.24, height: 0.08, depth: 0.12 }, this.scene);
    visor.position.set(0, 0.58, 0.44);
    visor.material = this.glassMaterial;
    visor.parent = this.rootNode;

    // F1 Steering Wheel
    this.steeringWheel = MeshBuilder.CreateBox('steeringWheel', { width: 0.28, height: 0.16, depth: 0.04 }, this.scene);
    this.steeringWheel.position.set(0, 0.45, 0.72);
    this.steeringWheel.material = this.carbonMaterial;
    this.steeringWheel.parent = this.rootNode;
  }

  private buildWheels(): void {
    const wheelPositions = [
      { x: -0.88, y: 0.33, z: 1.45, isFront: true },   // FL (0)
      { x: 0.88, y: 0.33, z: 1.45, isFront: true },    // FR (1)
      { x: -0.92, y: 0.35, z: -1.35, isFront: false },  // RL (2)
      { x: 0.92, y: 0.35, z: -1.35, isFront: false },   // RR (3)
    ];

    for (let i = 0; i < 4; i++) {
      const pos = wheelPositions[i];
      const pivot = new TransformNode(`wheelPivot_${i}_${this.rootNode.name}`, this.scene);
      pivot.position.set(pos.x, pos.y, pos.z);
      pivot.parent = this.rootNode;
      this.wheelPivots.push(pivot);

      // Competition Tire
      const diameter = pos.isFront ? 0.66 : 0.70;
      const width = pos.isFront ? 0.32 : 0.42;

      const tireMesh = MeshBuilder.CreateCylinder(`tire_${i}`, {
        height: width,
        diameter,
        tessellation: 24,
      }, this.scene);
      tireMesh.rotation.z = Math.PI / 2;
      tireMesh.material = this.tireMaterial;
      tireMesh.parent = pivot;
      this.wheelMeshes.push(tireMesh);

      // Center Rim Disc
      const rimMesh = MeshBuilder.CreateCylinder(`rim_${i}`, {
        height: width + 0.01,
        diameter: diameter * 0.55,
        tessellation: 20,
      }, this.scene);
      rimMesh.rotation.z = Math.PI / 2;
      rimMesh.material = this.rimMaterial;
      rimMesh.parent = pivot;

      // Carbon Ceramic Brake Disc (inner side)
      const brakeDisc = MeshBuilder.CreateCylinder(`brake_${i}`, {
        height: 0.04,
        diameter: diameter * 0.46,
        tessellation: 16,
      }, this.scene);
      brakeDisc.rotation.z = Math.PI / 2;
      brakeDisc.position.x = pos.x > 0 ? -width * 0.4 : width * 0.4;
      brakeDisc.material = this.brakeDiscMaterial;
      brakeDisc.parent = pivot;
      this.brakeDiscs.push(brakeDisc);
    }
  }

  private buildContactShadow(): void {
    // Underbody contact shadow plane
    this.contactShadowMesh = MeshBuilder.CreatePlane('contactShadow', { width: 2.1, height: 4.6 }, this.scene);
    this.contactShadowMesh.rotation.x = Math.PI / 2;
    this.contactShadowMesh.position.set(0, 0.02, 0);

    const shadowMat = new StandardMaterial(`shadowMat_${this.rootNode.name}`, this.scene);
    shadowMat.diffuseColor = new Color3(0, 0, 0);
    shadowMat.specularColor = new Color3(0, 0, 0);
    shadowMat.alpha = 0.75;
    shadowMat.backFaceCulling = false;
    this.contactShadowMesh.material = shadowMat;
    this.contactShadowMesh.parent = this.rootNode;
  }

  private buildExhaustAndRainLight(): void {
    // Rear Crash Structure & Rain LED
    const rainLight = MeshBuilder.CreateBox('rainLight', { width: 0.12, height: 0.08, depth: 0.06 }, this.scene);
    rainLight.position.set(0, 0.32, -1.95);
    rainLight.material = this.rainLightMaterial;
    rainLight.parent = this.rootNode;

    // Exhaust Backfire Flare Mesh
    this.exhaustFlameMesh = MeshBuilder.CreateCylinder('exhaustFlame', {
      height: 0.55,
      diameterTop: 0.22,
      diameterBottom: 0.05,
      tessellation: 12,
    }, this.scene);
    this.exhaustFlameMesh.rotation.x = -Math.PI / 2;
    this.exhaustFlameMesh.position.set(0, 0.38, -2.15);
    this.exhaustFlameMesh.material = this.exhaustFlameMaterial;
    this.exhaustFlameMesh.parent = this.rootNode;
  }

  public setTireCompound(compound: TireCompoundType): void {
    let rimColor = new Color3(0.85, 0.72, 0.35); // Gold default
    if (compound === 'soft') {
      rimColor = new Color3(0.95, 0.2, 0.2); // Red Soft
    } else if (compound === 'medium') {
      rimColor = new Color3(0.95, 0.85, 0.15); // Yellow Medium
    } else if (compound === 'hard') {
      rimColor = new Color3(0.9, 0.9, 0.9); // White Hard
    } else if (compound === 'intermediate') {
      rimColor = new Color3(0.2, 0.75, 0.3); // Green Inter
    } else if (compound === 'wet') {
      rimColor = new Color3(0.15, 0.45, 0.95); // Blue Wet
    }
    this.rimMaterial.albedoColor = rimColor;
  }

  public triggerBackfire(isHighRpm: boolean): void {
    this.backfireTimer = isHighRpm ? 0.22 : 0.14;
    this.exhaustFlameMaterial.alpha = 0.95;
  }

  public update(physics: VehiclePhysics, inputs: CarInputs, dt: number): void {
    // 1. Root Transformation
    this.rootNode.position.set(physics.position.x, physics.position.y, physics.position.z);
    this.rootNode.rotation.set(physics.pitch || 0, physics.yaw, physics.roll || 0);

    // 2. Wheels: Steering, Rotation & Suspension
    const steer = physics.visualSteerAngle || 0;
    const wheelRots = physics.wheelRotations || [0, 0, 0, 0];
    const suspComp = physics.wheelSuspensionCompression || [0, 0, 0, 0];

    for (let i = 0; i < 4; i++) {
      const pivot = this.wheelPivots[i];
      const tire = this.wheelMeshes[i];

      // Front wheels turn with steering input
      if (i === 0 || i === 1) {
        pivot.rotation.y = steer;
      }

      // Vertical suspension displacement
      const baseHeights = [0.33, 0.33, 0.35, 0.35];
      pivot.position.y = baseHeights[i] - (suspComp[i] || 0) * 0.08;

      // Wheel spin around X-axis
      tire.rotation.x = wheelRots[i];
    }

    // 3. Glowing Brake Discs
    const brakeForce = Math.max(0, Math.min(1, inputs.brake));
    if (brakeForce > 0.05) {
      const glow = brakeForce * 0.95;
      this.brakeDiscMaterial.emissiveColor.set(glow, glow * 0.25, 0);
    } else {
      this.brakeDiscMaterial.emissiveColor.scaleToRef(0.88, this.brakeDiscMaterial.emissiveColor);
    }

    // 4. Cockpit Steering Wheel & Driver Lean
    if (this.steeringWheel) {
      this.steeringWheel.rotation.z = -steer * 1.8;
    }
    if (this.driverHelmet) {
      this.driverHelmet.rotation.z = -(physics.roll || 0) * 0.8;
    }

    // 5. Motorized DRS Flap Rotation
    const targetDrsAngle = physics.isDrsOpen ? -0.32 : 0.0;
    this.currentDrsAngle += (targetDrsAngle - this.currentDrsAngle) * Math.min(1, 14 * dt);
    this.drsFlap.rotation.x = this.currentDrsAngle;

    // 6. Backfire Flame Fadeout
    if (this.backfireTimer > 0) {
      this.backfireTimer -= dt;
      if (this.backfireTimer <= 0) {
        this.exhaustFlameMaterial.alpha = 0;
      }
    }

    // 7. Pulsating FIA Rain Light in wet/brake conditions
    this.rainLightTimer += dt * 6;
    const pulse = 0.5 + Math.sin(this.rainLightTimer) * 0.5;
    this.rainLightMaterial.emissiveColor.set(pulse, 0.05, 0.05);

    // 8. Visual Damage Droop
    if (physics.damage) {
      if (physics.damage.frontWingLeftDamage > 0.1) {
        this.frontWingLeft.rotation.z = -physics.damage.frontWingLeftDamage * 0.25;
      }
      if (physics.damage.frontWingRightDamage > 0.1) {
        this.frontWingRight.rotation.z = physics.damage.frontWingRightDamage * 0.25;
      }
    }
  }

  public dispose(): void {
    this.rootNode.dispose();
  }
}
