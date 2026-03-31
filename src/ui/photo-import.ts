import type { Vec2 } from '../types';

export interface PhotoJoint {
  id: string;
  pixelPos: Vec2;
  worldPos: Vec2;
  isGround: boolean;
}

export type PhotoImportCallback = (joints: PhotoJoint[], scale: number) => void;

export class PhotoImport {
  private overlay: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private img: HTMLImageElement | null = null;
  private joints: PhotoJoint[] = [];
  private scale: number = 1; // pixels per world unit
  private onComplete: PhotoImportCallback;
  private jointCounter: number = 0;
  private mode: 'place' | 'scale' = 'place';
  private scalePoint1: Vec2 | null = null;
  private scalePoint2: Vec2 | null = null;

  constructor(onComplete: PhotoImportCallback) {
    this.onComplete = onComplete;
  }

  open(): void {
    this.joints = [];
    this.jointCounter = 0;
    this.mode = 'place';
    this.scalePoint1 = null;
    this.scalePoint2 = null;

    this.overlay = document.createElement('div');
    this.overlay.className = 'photo-overlay';
    this.overlay.innerHTML = `
      <div class="photo-modal">
        <div class="photo-header">
          <h2>Import Mechanism from Photo</h2>
          <button class="btn photo-close">✕</button>
        </div>
        <div class="photo-instructions">
          <p><b>Step 1:</b> Upload a photo of your mechanism</p>
          <p><b>Step 2:</b> Click on each joint/pivot point to mark it</p>
          <p><b>Step 3:</b> Set scale by clicking two points of known distance</p>
        </div>
        <div class="photo-toolbar">
          <input type="file" accept="image/*" class="photo-file-input" />
          <div class="photo-mode-btns">
            <button class="btn btn-mode active" data-mode="place">📍 Place Joints</button>
            <button class="btn btn-mode" data-mode="scale">📏 Set Scale</button>
          </div>
          <div class="photo-scale-input" style="display:none">
            <label>Known distance (units):</label>
            <input type="number" class="scale-distance" value="1" min="0.01" step="0.1" />
          </div>
          <div class="photo-joint-controls" style="display:none">
            <label><input type="checkbox" class="ground-check" /> Ground pivot</label>
          </div>
        </div>
        <div class="photo-canvas-wrap">
          <canvas class="photo-canvas"></canvas>
        </div>
        <div class="photo-joints-list"></div>
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

    const modeBtns = this.overlay.querySelectorAll('.btn-mode');
    modeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        modeBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.mode = (btn as HTMLElement).dataset.mode as 'place' | 'scale';
        const scaleInput = this.overlay!.querySelector('.photo-scale-input') as HTMLElement;
        const jointCtrl = this.overlay!.querySelector('.photo-joint-controls') as HTMLElement;
        scaleInput.style.display = this.mode === 'scale' ? 'flex' : 'none';
        jointCtrl.style.display = this.mode === 'place' ? 'flex' : 'none';
      });
    });

    this.overlay.querySelector('#photo-cancel')!.addEventListener('click', () => this.close());
    this.overlay.querySelector('.photo-close')!.addEventListener('click', () => this.close());
    this.overlay.querySelector('#photo-done')!.addEventListener('click', () => this.finish());
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
        this.redraw();
      };
      this.img.src = ev.target!.result as string;
    };
    reader.readAsDataURL(file);
  }

  private handleCanvasClick(e: MouseEvent): void {
    if (!this.img) return;
    const rect = this.canvas!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (this.mode === 'place') {
      const isGround = (this.overlay!.querySelector('.ground-check') as HTMLInputElement).checked;
      const id = isGround ? `O${this.jointCounter}` : String.fromCharCode(65 + this.jointCounter);
      this.joints.push({
        id,
        pixelPos: { x, y },
        worldPos: { x: x / this.scale, y: -y / this.scale }, // will be recalculated
        isGround,
      });
      this.jointCounter++;
    } else if (this.mode === 'scale') {
      if (!this.scalePoint1) {
        this.scalePoint1 = { x, y };
      } else {
        this.scalePoint2 = { x, y };
        const dist = Math.sqrt((x - this.scalePoint1.x) ** 2 + (y - this.scalePoint1.y) ** 2);
        const knownDist = parseFloat((this.overlay!.querySelector('.scale-distance') as HTMLInputElement).value) || 1;
        this.scale = dist / knownDist;
        // Recalculate all world positions
        for (const j of this.joints) {
          j.worldPos = { x: j.pixelPos.x / this.scale, y: -j.pixelPos.y / this.scale };
        }
        this.scalePoint1 = null;
        this.scalePoint2 = null;
      }
    }

    this.redraw();
    this.updateJointsList();
  }

  private redraw(): void {
    if (!this.ctx || !this.img) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas!.width, this.canvas!.height);
    ctx.drawImage(this.img, 0, 0, this.canvas!.width, this.canvas!.height);

    // Draw joints
    for (const j of this.joints) {
      ctx.beginPath();
      ctx.arc(j.pixelPos.x, j.pixelPos.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = j.isGround ? '#ef444480' : '#3b82f680';
      ctx.fill();
      ctx.strokeStyle = j.isGround ? '#ef4444' : '#3b82f6';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(j.id, j.pixelPos.x, j.pixelPos.y + 4);
    }

    // Draw scale line
    if (this.scalePoint1 && !this.scalePoint2) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(this.scalePoint1.x, this.scalePoint1.y, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw connections between consecutive joints
    if (this.joints.length >= 2) {
      ctx.strokeStyle = '#22c55e60';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      for (let i = 0; i < this.joints.length - 1; i++) {
        ctx.beginPath();
        ctx.moveTo(this.joints[i].pixelPos.x, this.joints[i].pixelPos.y);
        ctx.lineTo(this.joints[i + 1].pixelPos.x, this.joints[i + 1].pixelPos.y);
        ctx.stroke();
      }
      // Close the loop if 3+ joints
      if (this.joints.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(this.joints[this.joints.length - 1].pixelPos.x, this.joints[this.joints.length - 1].pixelPos.y);
        ctx.lineTo(this.joints[0].pixelPos.x, this.joints[0].pixelPos.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }

  private updateJointsList(): void {
    const list = this.overlay!.querySelector('.photo-joints-list')!;
    list.innerHTML = this.joints.map((j, i) => `
      <div class="photo-joint-item">
        <span class="${j.isGround ? 'ground' : 'moving'}">${j.id}</span>
        <span>(${j.worldPos.x.toFixed(2)}, ${j.worldPos.y.toFixed(2)})</span>
        <button class="btn-sm photo-remove-joint" data-idx="${i}">✕</button>
      </div>
    `).join('');

    list.querySelectorAll('.photo-remove-joint').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.idx!);
        this.joints.splice(idx, 1);
        this.redraw();
        this.updateJointsList();
      });
    });
  }

  private finish(): void {
    if (this.joints.length < 3) {
      alert('Please mark at least 3 joints');
      return;
    }
    this.onComplete(this.joints, this.scale);
    this.close();
  }

  private close(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }
}
