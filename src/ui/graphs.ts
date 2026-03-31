import type { TraceData } from '../sim/animation';

export class GraphPanel {
  private container: HTMLElement;
  private torqueCanvas!: HTMLCanvasElement;
  private forceCanvas!: HTMLCanvasElement;
  visible: boolean = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.build();
  }

  private build(): void {
    const div = document.createElement('div');
    div.id = 'graph-panel';
    div.className = 'graph-panel';
    div.innerHTML = `
      <div class="graph-section">
        <h4>Input Torque vs Crank Angle</h4>
        <canvas id="torque-graph" width="600" height="180"></canvas>
      </div>
      <div class="graph-section">
        <h4>Joint Force Magnitudes vs Crank Angle</h4>
        <canvas id="force-graph" width="600" height="180"></canvas>
      </div>
    `;
    this.container.appendChild(div);
    this.torqueCanvas = div.querySelector('#torque-graph')!;
    this.forceCanvas = div.querySelector('#force-graph')!;
    this.hide();
  }

  show(): void {
    this.visible = true;
    const panel = this.container.querySelector('#graph-panel') as HTMLElement;
    if (panel) panel.style.display = 'block';
  }

  hide(): void {
    this.visible = false;
    const panel = this.container.querySelector('#graph-panel') as HTMLElement;
    if (panel) panel.style.display = 'none';
  }

  update(traces: TraceData, currentAngleDeg: number): void {
    if (!this.visible) return;
    this.drawTorqueGraph(traces, currentAngleDeg);
    this.drawForceGraph(traces, currentAngleDeg);
  }

  private drawTorqueGraph(traces: TraceData, currentAngleDeg: number): void {
    const canvas = this.torqueCanvas;
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width;
    const h = canvas.height;
    const pad = { top: 10, right: 15, bottom: 30, left: 55 };

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, w, h);

    if (traces.torques.length < 2) return;

    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const torques = traces.torques.map((t) => t.torque);
    const minT = Math.min(...torques);
    const maxT = Math.max(...torques);
    const range = maxT - minT || 1;

    // Grid
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (plotH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
    }

    // Axes labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = maxT - (range * i) / 4;
      const y = pad.top + (plotH * i) / 4;
      ctx.fillText(val.toFixed(1), pad.left - 5, y + 3);
    }
    ctx.textAlign = 'center';
    for (let deg = 0; deg <= 360; deg += 90) {
      const x = pad.left + (plotW * deg) / 360;
      ctx.fillText(`${deg}°`, x, h - 5);
    }

    // Torque line
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < traces.torques.length; i++) {
      const t = traces.torques[i];
      const x = pad.left + (plotW * t.angle) / 360;
      const y = pad.top + plotH * (1 - (t.torque - minT) / range);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Current angle marker
    const curX = pad.left + (plotW * ((currentAngleDeg % 360 + 360) % 360)) / 360;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(curX, pad.top);
    ctx.lineTo(curX, h - pad.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // Title
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.fillText('N·m', pad.left, pad.top - 2);
  }

  private drawForceGraph(traces: TraceData, currentAngleDeg: number): void {
    const canvas = this.forceCanvas;
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width;
    const h = canvas.height;
    const pad = { top: 10, right: 15, bottom: 30, left: 55 };

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, w, h);

    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    // Find global max force
    let maxF = 1;
    for (const [, history] of traces.forceHistory) {
      for (const pt of history) {
        if (pt.magnitude > maxF) maxF = pt.magnitude;
      }
    }

    // Grid
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (plotH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
    }

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = maxF * (1 - i / 4);
      const y = pad.top + (plotH * i) / 4;
      ctx.fillText(val.toFixed(1), pad.left - 5, y + 3);
    }
    ctx.textAlign = 'center';
    for (let deg = 0; deg <= 360; deg += 90) {
      const x = pad.left + (plotW * deg) / 360;
      ctx.fillText(`${deg}°`, x, h - 5);
    }

    // Force lines per joint
    const colors = ['#22c55e', '#3b82f6', '#a855f7', '#06b6d4', '#ec4899'];
    let ci = 0;
    const legendItems: { name: string; color: string }[] = [];

    for (const [jointId, history] of traces.forceHistory) {
      if (history.length < 2) continue;
      const color = colors[ci % colors.length];
      legendItems.push({ name: jointId, color });

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const pt = history[i];
        const x = pad.left + (plotW * pt.angle) / 360;
        const y = pad.top + plotH * (1 - pt.magnitude / maxF);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ci++;
    }

    // Legend
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    for (let i = 0; i < legendItems.length; i++) {
      const x = pad.left + 10 + i * 55;
      ctx.fillStyle = legendItems[i].color;
      ctx.fillRect(x, pad.top + 2, 10, 3);
      ctx.fillText(legendItems[i].name, x + 14, pad.top + 8);
    }

    // Current angle marker
    const curX = pad.left + (plotW * ((currentAngleDeg % 360 + 360) % 360)) / 360;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(curX, pad.top);
    ctx.lineTo(curX, h - pad.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.fillText('N', pad.left, pad.top - 2);
  }
}
