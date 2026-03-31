import type { Vec2 } from '../types';

export class CoordinateSystem {
  scale: number = 35; // pixels per unit
  offsetX: number = 0;
  offsetY: number = 0;
  width: number = 800;
  height: number = 600;

  private isPanning: boolean = false;
  private panStartX: number = 0;
  private panStartY: number = 0;
  private panStartOffX: number = 0;
  private panStartOffY: number = 0;

  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.width = canvas.width;
    this.height = canvas.height;
    this.centerOn({ x: 5, y: -3 });

    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    canvas.addEventListener('mouseup', () => this.onMouseUp());
  }

  centerOn(worldPos: Vec2): void {
    this.offsetX = this.width / 2 - worldPos.x * this.scale;
    this.offsetY = this.height / 2 + worldPos.y * this.scale;
  }

  worldToScreen(p: Vec2): Vec2 {
    return {
      x: p.x * this.scale + this.offsetX,
      y: -p.y * this.scale + this.offsetY,
    };
  }

  screenToWorld(p: Vec2): Vec2 {
    return {
      x: (p.x - this.offsetX) / this.scale,
      y: -(p.y - this.offsetY) / this.scale,
    };
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldBefore = this.screenToWorld({ x: mouseX, y: mouseY });

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    this.scale *= zoomFactor;
    this.scale = Math.max(5, Math.min(200, this.scale));

    // Keep world point under cursor
    this.offsetX = mouseX - worldBefore.x * this.scale;
    this.offsetY = mouseY + worldBefore.y * this.scale;
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      this.isPanning = true;
      this.panStartX = e.clientX;
      this.panStartY = e.clientY;
      this.panStartOffX = this.offsetX;
      this.panStartOffY = this.offsetY;
      e.preventDefault();
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (this.isPanning) {
      this.offsetX = this.panStartOffX + (e.clientX - this.panStartX);
      this.offsetY = this.panStartOffY + (e.clientY - this.panStartY);
    }
  }

  private onMouseUp(): void {
    this.isPanning = false;
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
  }
}
