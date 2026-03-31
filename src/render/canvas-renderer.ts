import type { Linkage, FullState, Vec2 } from '../types';
import type { TraceData } from '../sim/animation';
import { CoordinateSystem } from './coordinate-system';
import * as V from '../math/vec2';

const COLORS = {
  grid: '#e2e8f0',
  gridAxis: '#94a3b8',
  link: '#1e293b',
  linkFill: '#334155',
  groundJoint: '#dc2626',
  movingJoint: '#2563eb',
  inputJoint: '#16a34a',
  forceArrow: '#dc2626',
  loadArrow: '#9333ea',
  label: '#0f172a',
  crank: '#16a34a',
  coupler: '#2563eb',
  rocker: '#d97706',
  background: '#f8fafc',
  disc: 'rgba(22, 163, 106, 0.1)',
  discBorder: '#16a34a',
};

const LINK_COLORS = [COLORS.crank, COLORS.coupler, COLORS.rocker, '#7c3aed', '#0891b2', '#be185d'];

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  forceScale: number = 0.05; // world units per Newton
  showForces: boolean = true;
  showLabels: boolean = true;
  showGrid: boolean = true;
  showTraces: boolean = false;
  traces: TraceData | null = null;

  private canvas: HTMLCanvasElement;
  private coords: CoordinateSystem;

  constructor(canvas: HTMLCanvasElement, coords: CoordinateSystem) {
    this.canvas = canvas;
    this.coords = coords;
    this.ctx = canvas.getContext('2d')!;
  }

  clear(): void {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawGrid(): void {
    if (!this.showGrid) return;
    const ctx = this.ctx;
    const topLeft = this.coords.screenToWorld({ x: 0, y: 0 });
    const bottomRight = this.coords.screenToWorld({
      x: this.canvas.width,
      y: this.canvas.height,
    });

    const minX = Math.floor(Math.min(topLeft.x, bottomRight.x));
    const maxX = Math.ceil(Math.max(topLeft.x, bottomRight.x));
    const minY = Math.floor(Math.min(topLeft.y, bottomRight.y));
    const maxY = Math.ceil(Math.max(topLeft.y, bottomRight.y));

    // Determine grid spacing based on zoom
    let gridStep = 1;
    const pixelsPerUnit = this.coords.scale;
    if (pixelsPerUnit < 15) gridStep = 5;
    if (pixelsPerUnit < 8) gridStep = 10;
    if (pixelsPerUnit > 60) gridStep = 0.5;
    if (pixelsPerUnit > 120) gridStep = 0.25;

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.5;

    for (let x = Math.floor(minX / gridStep) * gridStep; x <= maxX; x += gridStep) {
      const s = this.coords.worldToScreen({ x, y: 0 });
      ctx.beginPath();
      ctx.moveTo(s.x, 0);
      ctx.lineTo(s.x, this.canvas.height);
      ctx.stroke();
    }

    for (let y = Math.floor(minY / gridStep) * gridStep; y <= maxY; y += gridStep) {
      const s = this.coords.worldToScreen({ x: 0, y });
      ctx.beginPath();
      ctx.moveTo(0, s.y);
      ctx.lineTo(this.canvas.width, s.y);
      ctx.stroke();
    }

    // Draw axes
    ctx.strokeStyle = COLORS.gridAxis;
    ctx.lineWidth = 1.5;
    const origin = this.coords.worldToScreen({ x: 0, y: 0 });
    ctx.beginPath();
    ctx.moveTo(0, origin.y);
    ctx.lineTo(this.canvas.width, origin.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(origin.x, 0);
    ctx.lineTo(origin.x, this.canvas.height);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = COLORS.gridAxis;
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    for (let x = Math.ceil(minX); x <= maxX; x += gridStep) {
      if (x === 0) continue;
      const s = this.coords.worldToScreen({ x, y: 0 });
      ctx.fillText(x.toString(), s.x, origin.y + 14);
    }
    ctx.textAlign = 'right';
    for (let y = Math.ceil(minY); y <= maxY; y += gridStep) {
      if (y === 0) continue;
      const s = this.coords.worldToScreen({ x: 0, y });
      ctx.fillText(y.toString(), origin.x - 6, s.y + 3);
    }
  }

  drawCrankDisc(center: Vec2, radius: number, angle: number): void {
    const ctx = this.ctx;
    const sc = this.coords.worldToScreen(center);
    const r = radius * this.coords.scale;

    ctx.fillStyle = COLORS.disc;
    ctx.strokeStyle = COLORS.discBorder;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sc.x, sc.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw angle indicator line
    const end = this.coords.worldToScreen(
      V.add(center, V.fromAngle(angle, radius))
    );
    ctx.beginPath();
    ctx.moveTo(sc.x, sc.y);
    ctx.lineTo(end.x, end.y);
    ctx.strokeStyle = COLORS.discBorder;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawLink(p1: Vec2, p2: Vec2, colorIndex: number = 0): void {
    const ctx = this.ctx;
    const s1 = this.coords.worldToScreen(p1);
    const s2 = this.coords.worldToScreen(p2);
    const color = LINK_COLORS[colorIndex % LINK_COLORS.length];

    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.stroke();

    // Inner lighter line
    ctx.strokeStyle = color + '40';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.stroke();
  }

  drawJoint(pos: Vec2, type: 'ground' | 'moving' | 'input', label?: string): void {
    const ctx = this.ctx;
    const s = this.coords.worldToScreen(pos);

    const color =
      type === 'ground'
        ? COLORS.groundJoint
        : type === 'input'
          ? COLORS.inputJoint
          : COLORS.movingJoint;

    ctx.beginPath();
    ctx.arc(s.x, s.y, type === 'ground' ? 8 : 6, 0, Math.PI * 2);

    if (type === 'ground') {
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.stroke();

      // Ground hatch marks
      const hatchSize = 12;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(s.x + i * 5, s.y + 8);
        ctx.lineTo(s.x + i * 5 - 4, s.y + 8 + hatchSize);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (label && this.showLabels) {
      ctx.fillStyle = COLORS.label;
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(label, s.x + 12, s.y - 8);
    }
  }

  drawForceArrow(pos: Vec2, force: Vec2, color: string = COLORS.forceArrow): void {
    if (!this.showForces) return;
    const mag = V.length(force);
    if (mag < 0.1) return;

    const ctx = this.ctx;
    const start = this.coords.worldToScreen(pos);
    const scaledForce = V.scale(force, this.forceScale);
    const endWorld = V.add(pos, scaledForce);
    const end = this.coords.worldToScreen(endWorld);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    // Arrowhead
    const dir = V.normalize({ x: end.x - start.x, y: end.y - start.y });
    const perp = { x: -dir.y, y: dir.x };
    const arrowSize = 8;

    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(
      end.x - dir.x * arrowSize + perp.x * arrowSize * 0.4,
      end.y - dir.y * arrowSize + perp.y * arrowSize * 0.4
    );
    ctx.lineTo(
      end.x - dir.x * arrowSize - perp.x * arrowSize * 0.4,
      end.y - dir.y * arrowSize - perp.y * arrowSize * 0.4
    );
    ctx.closePath();
    ctx.fill();

    // Force magnitude label
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      `${mag.toFixed(1)}N`,
      (start.x + end.x) / 2 + perp.x * 14,
      (start.y + end.y) / 2 + perp.y * 14
    );
  }

  drawTracePaths(): void {
    if (!this.showTraces || !this.traces) return;
    const ctx = this.ctx;
    const TRACE_COLORS = ['#22c55e80', '#3b82f680', '#f59e0b80', '#a855f780', '#06b6d480', '#ec489980'];
    let colorIdx = 0;

    for (const [_jointId, path] of this.traces.paths) {
      if (path.length < 2) continue;
      ctx.strokeStyle = TRACE_COLORS[colorIdx % TRACE_COLORS.length];
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      const start = this.coords.worldToScreen(path[0]);
      ctx.moveTo(start.x, start.y);
      for (let i = 1; i < path.length; i++) {
        const p = this.coords.worldToScreen(path[i]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      colorIdx++;
    }
  }

  drawLinkage(linkage: Linkage, state: FullState): void {
    this.clear();
    this.drawGrid();

    // Draw trace paths behind everything
    this.drawTracePaths();

    const positions = state.positions;

    // Draw crank disc
    const crankPivot = linkage.joints.find((j) => j.id === linkage.crankPivotId);
    if (crankPivot) {
      this.drawCrankDisc(
        crankPivot.position,
        linkage.crankLength * 1.3,
        linkage.inputAngle
      );
    }

    // Draw links
    linkage.links.forEach((link, i) => {
      const p1 = positions.get(link.jointIds[0]);
      const p2 = positions.get(link.jointIds[1]);
      if (p1 && p2) {
        this.drawLink(p1, p2, i);
      }
    });

    // Draw joints
    for (const joint of linkage.joints) {
      const pos = positions.get(joint.id);
      if (!pos) continue;
      const type = joint.isGround
        ? 'ground'
        : joint.isInput
          ? 'input'
          : 'moving';
      this.drawJoint(pos, type, joint.id);
    }

    // Draw external loads
    for (const load of linkage.loads) {
      const pos = positions.get(load.jointId);
      if (pos) {
        this.drawForceArrow(pos, load.force, COLORS.loadArrow);
      }
    }

    // Draw reaction forces
    if (state.forces) {
      for (const [jointId, force] of state.forces.jointForces) {
        const pos = positions.get(jointId);
        if (pos) {
          this.drawForceArrow(pos, force, COLORS.forceArrow);
        }
      }
    }

    // Draw info overlay
    this.drawInfoOverlay(linkage, state);
  }

  private drawInfoOverlay(linkage: Linkage, state: FullState): void {
    const ctx = this.ctx;
    const angleDeg = ((linkage.inputAngle * 180) / Math.PI) % 360;
    const torque = state.forces?.inputTorque ?? 0;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(10, 10, 220, 50);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Crank Angle: ${angleDeg.toFixed(1)}°`, 20, 30);
    ctx.fillText(`Input Torque: ${torque.toFixed(2)} N·m`, 20, 48);
  }

  resize(w: number, h: number): void {
    this.canvas.width = w;
    this.canvas.height = h;
    this.coords.resize(w, h);
  }
}
