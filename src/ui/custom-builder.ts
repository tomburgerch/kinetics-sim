import type { Vec2 } from '../types';
import type { Linkage } from '../types';
import { createJoint, createLink, createLinkage } from '../model/linkage';
import * as V from '../math/vec2';

interface BuilderJoint {
  id: string;
  pos: Vec2;
  isGround: boolean;
}

interface BuilderLink {
  from: string;
  to: string;
}

export type BuilderCallback = (linkage: Linkage) => void;

export class CustomBuilder {
  private overlay: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private joints: BuilderJoint[] = [];
  private links: BuilderLink[] = [];
  private onComplete: BuilderCallback;
  private jointCounter: number = 0;
  private mode: 'joint' | 'link' | 'move' = 'joint';
  private linkStart: string | null = null;
  private dragJoint: string | null = null;
  private isGroundMode: boolean = false;
  private gridSize: number = 1;
  private scale: number = 40;
  private offsetX: number = 400;
  private offsetY: number = 250;

  constructor(onComplete: BuilderCallback) {
    this.onComplete = onComplete;
  }

  open(): void {
    this.joints = [];
    this.links = [];
    this.jointCounter = 0;
    this.mode = 'joint';

    this.overlay = document.createElement('div');
    this.overlay.className = 'photo-overlay';
    this.overlay.innerHTML = `
      <div class="photo-modal builder-modal">
        <div class="photo-header">
          <h2>Custom Linkage Builder</h2>
          <button class="btn photo-close">✕</button>
        </div>
        <div class="photo-instructions">
          <p>Click to place joints, then connect them with links.</p>
        </div>
        <div class="photo-toolbar builder-toolbar">
          <div class="photo-mode-btns">
            <button class="btn btn-mode active" data-mode="joint">📍 Add Joint</button>
            <button class="btn btn-mode" data-mode="link">🔗 Add Link</button>
            <button class="btn btn-mode" data-mode="move">✋ Move Joint</button>
          </div>
          <label class="builder-ground-label"><input type="checkbox" class="ground-check" /> Ground pivot</label>
          <button class="btn btn-sm" id="builder-undo">↩ Undo</button>
          <button class="btn btn-sm" id="builder-clear">🗑 Clear</button>
        </div>
        <div class="photo-canvas-wrap">
          <canvas class="photo-canvas builder-canvas" width="800" height="500"></canvas>
        </div>
        <div class="builder-info">
          <span id="builder-joint-count">Joints: 0</span>
          <span id="builder-link-count">Links: 0</span>
          <span id="builder-status">Click to place joints</span>
        </div>
        <div class="builder-save-row">
          <button class="btn" id="builder-export-json">💾 Export JSON</button>
          <label class="btn" id="builder-import-json">📂 Import JSON
            <input type="file" accept=".json" style="display:none" />
          </label>
        </div>
        <div class="photo-footer">
          <button class="btn" id="builder-cancel">Cancel</button>
          <button class="btn btn-primary" id="builder-done">Done — Use Linkage</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);

    this.canvas = this.overlay.querySelector('.builder-canvas')!;
    this.ctx = this.canvas.getContext('2d')!;

    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseup', () => this.handleMouseUp());

    const modeBtns = this.overlay.querySelectorAll('.btn-mode');
    modeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        modeBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.mode = (btn as HTMLElement).dataset.mode as 'joint' | 'link' | 'move';
        this.linkStart = null;
        this.updateStatus();
      });
    });

    this.overlay.querySelector('.ground-check')!.addEventListener('change', (e) => {
      this.isGroundMode = (e.target as HTMLInputElement).checked;
    });

    this.overlay.querySelector('#builder-undo')!.addEventListener('click', () => this.undo());
    this.overlay.querySelector('#builder-clear')!.addEventListener('click', () => this.clear());
    this.overlay.querySelector('#builder-cancel')!.addEventListener('click', () => this.close());
    this.overlay.querySelector('.photo-close')!.addEventListener('click', () => this.close());
    this.overlay.querySelector('#builder-done')!.addEventListener('click', () => this.finish());
    this.overlay.querySelector('#builder-export-json')!.addEventListener('click', () => this.exportJSON());

    const importInput = this.overlay.querySelector('#builder-import-json input') as HTMLInputElement;
    importInput.addEventListener('change', (e) => this.importJSON(e));

    this.redraw();
  }

  private screenToWorld(sx: number, sy: number): Vec2 {
    return {
      x: Math.round(((sx - this.offsetX) / this.scale) / this.gridSize) * this.gridSize,
      y: Math.round((-(sy - this.offsetY) / this.scale) / this.gridSize) * this.gridSize,
    };
  }

  private worldToScreen(wx: number, wy: number): Vec2 {
    return {
      x: wx * this.scale + this.offsetX,
      y: -wy * this.scale + this.offsetY,
    };
  }

  private findJointAt(sx: number, sy: number): string | null {
    for (const j of this.joints) {
      const s = this.worldToScreen(j.pos.x, j.pos.y);
      if (Math.abs(s.x - sx) < 12 && Math.abs(s.y - sy) < 12) return j.id;
    }
    return null;
  }

  private handleMouseDown(e: MouseEvent): void {
    const rect = this.canvas!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (this.mode === 'joint') {
      const world = this.screenToWorld(sx, sy);
      const id = this.isGroundMode ? `O${this.jointCounter}` : String.fromCharCode(65 + this.jointCounter);
      this.joints.push({ id, pos: world, isGround: this.isGroundMode });
      this.jointCounter++;
    } else if (this.mode === 'link') {
      const hit = this.findJointAt(sx, sy);
      if (hit) {
        if (!this.linkStart) {
          this.linkStart = hit;
        } else if (hit !== this.linkStart) {
          const exists = this.links.some(
            (l) => (l.from === this.linkStart && l.to === hit) || (l.from === hit && l.to === this.linkStart)
          );
          if (!exists) {
            this.links.push({ from: this.linkStart, to: hit });
          }
          this.linkStart = null;
        }
      }
    } else if (this.mode === 'move') {
      this.dragJoint = this.findJointAt(sx, sy);
    }

    this.redraw();
    this.updateCounts();
    this.updateStatus();
  }

  private handleMouseMove(e: MouseEvent): void {
    if (this.mode === 'move' && this.dragJoint) {
      const rect = this.canvas!.getBoundingClientRect();
      const world = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const j = this.joints.find((j) => j.id === this.dragJoint);
      if (j) j.pos = world;
      this.redraw();
    }
  }

  private handleMouseUp(): void {
    this.dragJoint = null;
  }

  private redraw(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const w = this.canvas!.width;
    const h = this.canvas!.height;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.5;
    for (let x = this.offsetX % this.scale; x < w; x += this.scale) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = this.offsetY % this.scale; y < h; y += this.scale) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, this.offsetY); ctx.lineTo(w, this.offsetY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(this.offsetX, 0); ctx.lineTo(this.offsetX, h); ctx.stroke();

    // Links
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    const colors = ['#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899'];
    this.links.forEach((link, i) => {
      const j1 = this.joints.find((j) => j.id === link.from);
      const j2 = this.joints.find((j) => j.id === link.to);
      if (!j1 || !j2) return;
      const s1 = this.worldToScreen(j1.pos.x, j1.pos.y);
      const s2 = this.worldToScreen(j2.pos.x, j2.pos.y);
      ctx.strokeStyle = colors[i % colors.length];
      ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();

      // Length label
      const dist = V.distance(j1.pos, j2.pos);
      const mid = { x: (s1.x + s2.x) / 2, y: (s1.y + s2.y) / 2 };
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(dist.toFixed(2), mid.x, mid.y - 8);
    });

    // Joints
    for (const j of this.joints) {
      const s = this.worldToScreen(j.pos.x, j.pos.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
      if (j.isGround) {
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else {
        ctx.fillStyle = j.id === this.linkStart ? '#f59e0b' : '#3b82f6';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(j.id, s.x + 10, s.y - 6);
      ctx.fillStyle = '#64748b';
      ctx.font = '9px monospace';
      ctx.fillText(`(${j.pos.x}, ${j.pos.y})`, s.x + 10, s.y + 8);
    }
  }

  private updateCounts(): void {
    if (!this.overlay) return;
    this.overlay.querySelector('#builder-joint-count')!.textContent = `Joints: ${this.joints.length}`;
    this.overlay.querySelector('#builder-link-count')!.textContent = `Links: ${this.links.length}`;
  }

  private updateStatus(): void {
    if (!this.overlay) return;
    const el = this.overlay.querySelector('#builder-status')!;
    if (this.mode === 'joint') el.textContent = 'Click to place joints';
    else if (this.mode === 'link') el.textContent = this.linkStart ? `Click second joint to connect from ${this.linkStart}` : 'Click first joint';
    else el.textContent = 'Drag joints to move them';
  }

  private undo(): void {
    if (this.links.length > 0) this.links.pop();
    else if (this.joints.length > 0) this.joints.pop();
    this.redraw();
    this.updateCounts();
  }

  private clear(): void {
    this.joints = [];
    this.links = [];
    this.jointCounter = 0;
    this.redraw();
    this.updateCounts();
  }

  private exportJSON(): void {
    const data = { joints: this.joints, links: this.links };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'linkage.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  private importJSON(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target!.result as string);
        this.joints = data.joints || [];
        this.links = data.links || [];
        this.jointCounter = this.joints.length;
        this.redraw();
        this.updateCounts();
      } catch {
        alert('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  }

  private finish(): void {
    if (this.joints.length < 3 || this.links.length < 2) {
      alert('Need at least 3 joints and 2 links');
      return;
    }

    const groundJoints = this.joints.filter((j) => j.isGround);
    if (groundJoints.length < 1) {
      alert('Need at least 1 ground pivot');
      return;
    }

    // Find the first non-ground joint connected to a ground joint — that's the input
    let crankPivotId = groundJoints[0].id;
    let inputJointId = '';

    for (const link of this.links) {
      if (link.from === crankPivotId && !this.joints.find((j) => j.id === link.to)?.isGround) {
        inputJointId = link.to;
        break;
      }
      if (link.to === crankPivotId && !this.joints.find((j) => j.id === link.from)?.isGround) {
        inputJointId = link.from;
        break;
      }
    }

    if (!inputJointId) {
      inputJointId = this.joints.find((j) => !j.isGround)?.id || '';
    }

    const joints = this.joints.map((j) =>
      createJoint(j.id, j.pos.x, j.pos.y, j.isGround, j.id === inputJointId)
    );

    const links = this.links.map((l, i) => {
      const j1 = this.joints.find((j) => j.id === l.from)!;
      const j2 = this.joints.find((j) => j.id === l.to)!;
      return createLink(`L${i}`, l.from, l.to, V.distance(j1.pos, j2.pos));
    });

    const crankLink = this.links.find(
      (l) => (l.from === crankPivotId && l.to === inputJointId) || (l.to === crankPivotId && l.from === inputJointId)
    );
    const crankJ1 = this.joints.find((j) => j.id === crankPivotId)!;
    const crankJ2 = this.joints.find((j) => j.id === inputJointId)!;
    const crankLength = crankLink ? V.distance(crankJ1.pos, crankJ2.pos) : 2;

    const linkage = createLinkage(joints, links, crankPivotId, inputJointId, crankLength);
    this.onComplete(linkage);
    this.close();
  }

  private close(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }
}
