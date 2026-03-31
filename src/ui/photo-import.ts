import type { Vec2 } from '../types';

export interface PhotoJoint {
  id: string;
  pixelPos: Vec2;
  worldPos: Vec2;
  isGround: boolean;
}

export interface PhotoLink {
  from: string;
  to: string;
}

export interface PhotoImportResult {
  joints: PhotoJoint[];
  links: PhotoLink[];
  scale: number;
}

export type PhotoImportCallback = (result: PhotoImportResult) => void;

export class PhotoImport {
  private overlay: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private img: HTMLImageElement | null = null;
  private joints: PhotoJoint[] = [];
  private links: PhotoLink[] = [];
  private pixelsPerUnit: number = 100; // pixels per world unit
  private onComplete: PhotoImportCallback;
  private groundCounter: number = 0;
  private movingCounter: number = 0;
  private mode: 'place' | 'link' | 'scale' = 'place';
  private isGroundMode: boolean = false;
  private linkStartId: string | null = null;
  private scalePoint1: Vec2 | null = null;

  constructor(onComplete: PhotoImportCallback) {
    this.onComplete = onComplete;
  }

  open(): void {
    this.joints = [];
    this.links = [];
    this.groundCounter = 0;
    this.movingCounter = 0;
    this.mode = 'place';
    this.linkStartId = null;
    this.scalePoint1 = null;

    this.overlay = document.createElement('div');
    this.overlay.className = 'photo-overlay';
    this.overlay.innerHTML = `
      <div class="photo-modal">
        <div class="photo-header">
          <h2>Import Mechanism from Photo</h2>
          <button class="btn photo-close">✕</button>
        </div>
        <div class="photo-instructions" id="photo-instructions">
          <p><b>Step 1:</b> Upload a photo, then click on each joint/pivot.</p>
          <p><b>Step 2:</b> Switch to Link mode and click two joints to connect them.</p>
          <p><b>Step 3:</b> Set scale by clicking two points of known distance.</p>
        </div>
        <div class="photo-toolbar">
          <input type="file" accept="image/*" class="photo-file-input" />
          <div class="photo-mode-btns">
            <button class="btn btn-mode active" data-mode="place">📍 Place Joints</button>
            <button class="btn btn-mode" data-mode="link">🔗 Draw Links</button>
            <button class="btn btn-mode" data-mode="scale">📏 Set Scale</button>
          </div>
        </div>
        <div class="photo-toolbar-row2">
          <label class="photo-ground-toggle">
            <input type="checkbox" class="ground-check" />
            <span>Ground (fixed) pivot</span>
          </label>
          <div class="photo-scale-info" style="display:none">
            <label>Known distance:</label>
            <input type="number" class="scale-distance" value="1" min="0.01" step="0.1" />
            <span>units</span>
          </div>
          <div class="photo-link-info" style="display:none">
            <span id="link-status">Click first joint to start link</span>
          </div>
          <button class="btn btn-sm" id="photo-undo">↩ Undo</button>
        </div>
        <div class="photo-canvas-wrap">
          <canvas class="photo-canvas"></canvas>
          <div class="photo-placeholder">Upload a photo to get started</div>
        </div>
        <div class="photo-joints-list" id="photo-joints-list"></div>
        <div class="photo-summary" id="photo-summary"></div>
        <div class="photo-footer">
          <button class="btn" id="photo-cancel">Cancel</button>
          <button class="btn btn-primary" id="photo-done">Done — Create Linkage</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);

    const fileInput = this.overlay.querySelector('.photo-file-input') as HTMLInputElement;
    fileInput.addEventListener('change', (e) => this.handleFile(e));

    this.canvas = this.overlay.querySelector('.photo-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.handleRightClick(e);
    });

    const modeBtns = this.overlay.querySelectorAll('.btn-mode');
    modeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        modeBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.mode = (btn as HTMLElement).dataset.mode as 'place' | 'link' | 'scale';
        this.linkStartId = null;
        this.scalePoint1 = null;
        this.updateToolbarVisibility();
        this.updateInstructions();
        this.redraw();
      });
    });

    this.overlay.querySelector('.ground-check')!.addEventListener('change', (e) => {
      this.isGroundMode = (e.target as HTMLInputElement).checked;
    });

    this.overlay.querySelector('#photo-undo')!.addEventListener('click', () => this.undo());
    this.overlay.querySelector('#photo-cancel')!.addEventListener('click', () => this.close());
    this.overlay.querySelector('.photo-close')!.addEventListener('click', () => this.close());
    this.overlay.querySelector('#photo-done')!.addEventListener('click', () => this.finish());

    this.updateToolbarVisibility();
  }

  private updateToolbarVisibility(): void {
    if (!this.overlay) return;
    const groundToggle = this.overlay.querySelector('.photo-ground-toggle') as HTMLElement;
    const scaleInfo = this.overlay.querySelector('.photo-scale-info') as HTMLElement;
    const linkInfo = this.overlay.querySelector('.photo-link-info') as HTMLElement;

    groundToggle.style.display = this.mode === 'place' ? 'flex' : 'none';
    scaleInfo.style.display = this.mode === 'scale' ? 'flex' : 'none';
    linkInfo.style.display = this.mode === 'link' ? 'flex' : 'none';
  }

  private updateInstructions(): void {
    const el = this.overlay?.querySelector('#photo-instructions');
    if (!el) return;
    if (this.mode === 'place') {
      el.innerHTML = '<p>Click on the photo to place joints. Check "Ground pivot" for fixed pivots (red). Uncheck for moving joints (blue). Right-click a joint to toggle ground/moving.</p>';
    } else if (this.mode === 'link') {
      el.innerHTML = '<p>Click on a joint to start a link, then click another joint to connect them. Each link represents a rigid bar between two joints.</p>';
    } else {
      el.innerHTML = '<p>Click two points on the photo whose real-world distance you know. Enter the distance in the box above. This calibrates all joint positions.</p>';
    }
  }

  private handleFile(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      this.img = new Image();
      this.img.onload = () => {
        const maxW = 800, maxH = 500;
        let w = this.img!.width, h = this.img!.height;
        if (w > maxW) { h *= maxW / w; w = maxW; }
        if (h > maxH) { w *= maxH / h; h = maxH; }
        this.canvas!.width = w;
        this.canvas!.height = h;
        // Hide placeholder
        const ph = this.overlay?.querySelector('.photo-placeholder') as HTMLElement;
        if (ph) ph.style.display = 'none';
        this.redraw();
      };
      this.img.src = ev.target!.result as string;
    };
    reader.readAsDataURL(file);
  }

  private handleCanvasClick(e: MouseEvent): void {
    if (!this.img) return;
    const rect = this.canvas!.getBoundingClientRect();
    const scaleX = this.canvas!.width / rect.width;
    const scaleY = this.canvas!.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    if (this.mode === 'place') {
      this.placeJoint(x, y);
    } else if (this.mode === 'link') {
      this.handleLinkClick(x, y);
    } else if (this.mode === 'scale') {
      this.handleScaleClick(x, y);
    }

    this.redraw();
    this.updateJointsList();
    this.updateSummary();
  }

  private handleRightClick(e: MouseEvent): void {
    if (!this.img) return;
    const rect = this.canvas!.getBoundingClientRect();
    const scaleX = this.canvas!.width / rect.width;
    const scaleY = this.canvas!.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Toggle ground/moving on nearest joint
    const nearest = this.findNearestJoint(x, y, 20);
    if (nearest) {
      nearest.isGround = !nearest.isGround;
      // Rename joint
      if (nearest.isGround) {
        nearest.id = `O${this.groundCounter++}`;
      } else {
        nearest.id = String.fromCharCode(65 + this.movingCounter++);
      }
      this.redraw();
      this.updateJointsList();
      this.updateSummary();
    }
  }

  private placeJoint(x: number, y: number): void {
    let id: string;
    if (this.isGroundMode) {
      id = `O${this.groundCounter}`;
      this.groundCounter++;
    } else {
      id = String.fromCharCode(65 + this.movingCounter);
      this.movingCounter++;
    }

    this.joints.push({
      id,
      pixelPos: { x, y },
      worldPos: this.pixelToWorld(x, y),
      isGround: this.isGroundMode,
    });
  }

  private handleLinkClick(x: number, y: number): void {
    const nearest = this.findNearestJoint(x, y, 25);
    if (!nearest) return;

    const linkStatusEl = this.overlay?.querySelector('#link-status');

    if (!this.linkStartId) {
      this.linkStartId = nearest.id;
      if (linkStatusEl) linkStatusEl.textContent = `Click second joint to connect from ${nearest.id}`;
    } else if (nearest.id !== this.linkStartId) {
      // Check for duplicate
      const exists = this.links.some(
        (l) =>
          (l.from === this.linkStartId && l.to === nearest.id) ||
          (l.from === nearest.id && l.to === this.linkStartId)
      );
      if (!exists) {
        this.links.push({ from: this.linkStartId, to: nearest.id });
      }
      this.linkStartId = null;
      if (linkStatusEl) linkStatusEl.textContent = 'Click first joint to start link';
    }
  }

  private handleScaleClick(x: number, y: number): void {
    if (!this.scalePoint1) {
      this.scalePoint1 = { x, y };
    } else {
      const pixelDist = Math.sqrt((x - this.scalePoint1.x) ** 2 + (y - this.scalePoint1.y) ** 2);
      const knownDist = parseFloat(
        (this.overlay!.querySelector('.scale-distance') as HTMLInputElement).value
      ) || 1;
      this.pixelsPerUnit = pixelDist / knownDist;

      // Recalculate all world positions
      for (const j of this.joints) {
        j.worldPos = this.pixelToWorld(j.pixelPos.x, j.pixelPos.y);
      }
      this.scalePoint1 = null;
    }
  }

  private pixelToWorld(px: number, py: number): Vec2 {
    // Origin at center of image, Y-up
    const cx = this.canvas!.width / 2;
    const cy = this.canvas!.height / 2;
    return {
      x: (px - cx) / this.pixelsPerUnit,
      y: -(py - cy) / this.pixelsPerUnit,
    };
  }

  private findNearestJoint(x: number, y: number, maxDist: number): PhotoJoint | null {
    let best: PhotoJoint | null = null;
    let bestDist = maxDist;
    for (const j of this.joints) {
      const dx = j.pixelPos.x - x;
      const dy = j.pixelPos.y - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) {
        bestDist = d;
        best = j;
      }
    }
    return best;
  }

  private redraw(): void {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    if (this.img) {
      ctx.drawImage(this.img, 0, 0, w, h);
    } else {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, w, h);
    }

    // Draw links
    for (const link of this.links) {
      const j1 = this.joints.find((j) => j.id === link.from);
      const j2 = this.joints.find((j) => j.id === link.to);
      if (!j1 || !j2) continue;

      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(j1.pixelPos.x, j1.pixelPos.y);
      ctx.lineTo(j2.pixelPos.x, j2.pixelPos.y);
      ctx.stroke();

      // Length label
      const dx = j2.worldPos.x - j1.worldPos.x;
      const dy = j2.worldPos.y - j1.worldPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const mx = (j1.pixelPos.x + j2.pixelPos.x) / 2;
      const my = (j1.pixelPos.y + j2.pixelPos.y) / 2;
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(`${dist.toFixed(2)}`, mx, my - 10);
      ctx.fillText(`${dist.toFixed(2)}`, mx, my - 10);
    }

    // Draw pending link from linkStartId to cursor would need mousemove — skip for simplicity
    // Highlight selected joint for linking
    if (this.linkStartId) {
      const sj = this.joints.find((j) => j.id === this.linkStartId);
      if (sj) {
        ctx.beginPath();
        ctx.arc(sj.pixelPos.x, sj.pixelPos.y, 14, 0, Math.PI * 2);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Draw joints
    for (const j of this.joints) {
      const isHighlighted = j.id === this.linkStartId;
      const radius = isHighlighted ? 10 : 8;

      ctx.beginPath();
      ctx.arc(j.pixelPos.x, j.pixelPos.y, radius, 0, Math.PI * 2);

      if (j.isGround) {
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.stroke();
        // Hatch
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(j.pixelPos.x + i * 5, j.pixelPos.y + radius);
          ctx.lineTo(j.pixelPos.x + i * 5 - 3, j.pixelPos.y + radius + 8);
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#3b82f6';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Label
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(j.id, j.pixelPos.x, j.pixelPos.y + 4);
      ctx.fillText(j.id, j.pixelPos.x, j.pixelPos.y + 4);
    }

    // Draw scale points
    if (this.mode === 'scale' && this.scalePoint1) {
      ctx.beginPath();
      ctx.arc(this.scalePoint1.x, this.scalePoint1.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#f59e0b';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('Click second point...', this.scalePoint1.x + 10, this.scalePoint1.y - 5);
    }
  }

  private updateJointsList(): void {
    const list = this.overlay?.querySelector('#photo-joints-list');
    if (!list) return;

    list.innerHTML = this.joints
      .map(
        (j, i) => `
      <div class="photo-joint-item">
        <span class="${j.isGround ? 'ground' : 'moving'}">${j.id}</span>
        <span>(${j.worldPos.x.toFixed(2)}, ${j.worldPos.y.toFixed(2)})</span>
        <span class="photo-joint-type">${j.isGround ? 'ground' : 'moving'}</span>
        <button class="btn-sm photo-remove-joint" data-idx="${i}">✕</button>
      </div>
    `
      )
      .join('');

    list.querySelectorAll('.photo-remove-joint').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.idx!);
        const removed = this.joints[idx];
        this.joints.splice(idx, 1);
        // Remove links referencing this joint
        this.links = this.links.filter((l) => l.from !== removed.id && l.to !== removed.id);
        this.redraw();
        this.updateJointsList();
        this.updateSummary();
      });
    });
  }

  private updateSummary(): void {
    const el = this.overlay?.querySelector('#photo-summary');
    if (!el) return;

    const groundCount = this.joints.filter((j) => j.isGround).length;
    const movingCount = this.joints.filter((j) => !j.isGround).length;

    el.innerHTML = `
      <span>${groundCount} ground pivot${groundCount !== 1 ? 's' : ''}</span>
      <span>${movingCount} moving joint${movingCount !== 1 ? 's' : ''}</span>
      <span>${this.links.length} link${this.links.length !== 1 ? 's' : ''}</span>
      <span>Scale: ${(1 / this.pixelsPerUnit * 100).toFixed(1)} units/100px</span>
    `;
  }

  private undo(): void {
    if (this.links.length > 0) {
      this.links.pop();
    } else if (this.joints.length > 0) {
      const removed = this.joints.pop()!;
      this.links = this.links.filter((l) => l.from !== removed.id && l.to !== removed.id);
    }
    this.linkStartId = null;
    this.redraw();
    this.updateJointsList();
    this.updateSummary();
  }

  private finish(): void {
    if (this.joints.length < 3) {
      alert('Please mark at least 3 joints.');
      return;
    }
    if (this.links.length < 2) {
      alert('Please draw at least 2 links connecting your joints.');
      return;
    }
    const groundCount = this.joints.filter((j) => j.isGround).length;
    if (groundCount < 1) {
      alert('Please mark at least 1 ground (fixed) pivot. Right-click a joint to toggle.');
      return;
    }

    this.onComplete({
      joints: this.joints,
      links: this.links,
      scale: this.pixelsPerUnit,
    });
    this.close();
  }

  private close(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }
}
