import type { Linkage, FullState, Vec2 } from '../types';
import { solveLinkage } from '../math/solver';
import { solveForces } from '../math/forces';
import * as V from '../math/vec2';

export class Simulation {
  linkage: Linkage;
  state: FullState;
  running: boolean = false;
  rpm: number = 15;

  private lastTime: number = 0;
  private prevPositions: Map<string, Vec2> | null = null;
  private onUpdate: (state: FullState) => void;
  private animFrameId: number = 0;

  constructor(linkage: Linkage, onUpdate: (state: FullState) => void) {
    this.linkage = linkage;
    this.onUpdate = onUpdate;
    this.state = this.createEmptyState();
  }

  private createEmptyState(): FullState {
    return {
      angle: 0,
      positions: new Map(),
      velocities: new Map(),
      forces: { jointForces: new Map(), linkForces: new Map(), inputTorque: 0 },
    };
  }

  solve(): void {
    const result = solveLinkage(this.linkage);

    if (result.success) {
      // Compute velocities from previous frame
      const velocities = new Map<string, Vec2>();
      for (const [id, pos] of result.positions) {
        if (this.prevPositions) {
          const prev = this.prevPositions.get(id);
          if (prev) {
            velocities.set(id, V.sub(pos, prev));
          } else {
            velocities.set(id, { x: 0, y: 0 });
          }
        } else {
          velocities.set(id, { x: 0, y: 0 });
        }
      }

      // Update joint positions for force analysis
      for (const joint of this.linkage.joints) {
        const pos = result.positions.get(joint.id);
        if (pos && !joint.isGround) {
          joint.position = { ...pos };
        }
      }

      const forces = solveForces(this.linkage, result.positions);

      this.state = {
        angle: this.linkage.inputAngle,
        positions: result.positions,
        velocities,
        forces,
      };

      this.prevPositions = new Map(result.positions);
    }

    this.onUpdate(this.state);
  }

  setAngle(rad: number): void {
    this.linkage.inputAngle = rad;
    this.solve();
  }

  play(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.tick(this.lastTime);
  }

  pause(): void {
    this.running = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
  }

  reset(): void {
    this.pause();
    this.linkage.inputAngle = 0;
    this.prevPositions = null;
    this.solve();
  }

  private tick = (now: number): void => {
    if (!this.running) return;

    const dt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    // Advance crank angle
    const dAngle = ((2 * Math.PI * this.rpm) / 60) * dt;
    this.linkage.inputAngle += dAngle;

    this.solve();

    this.animFrameId = requestAnimationFrame(this.tick);
  };
}
