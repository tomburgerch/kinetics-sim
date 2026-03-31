import type { Linkage, FullState } from '../types';
import * as V from '../math/vec2';

export class OutputPanel {
  private container: HTMLElement;
  private tableBody!: HTMLTableSectionElement;
  private torqueEl!: HTMLElement;
  private statusEl!: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.build();
  }

  private build(): void {
    this.container.innerHTML = `
      <div class="output-header">
        <h3>Joint Data</h3>
        <div class="status-row">
          <span class="status-badge" id="sim-status">Ready</span>
          <span class="torque-display" id="torque-display">Torque: 0.00 N·m</span>
        </div>
      </div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Joint</th>
              <th>X</th>
              <th>Y</th>
              <th>Vx</th>
              <th>Vy</th>
              <th>Fx (N)</th>
              <th>Fy (N)</th>
              <th>|F| (N)</th>
            </tr>
          </thead>
          <tbody id="data-tbody"></tbody>
        </table>
      </div>
      <div class="link-forces-section">
        <h3>Link Summary</h3>
        <div id="link-summary"></div>
      </div>
    `;

    this.tableBody = this.container.querySelector('#data-tbody')!;
    this.torqueEl = this.container.querySelector('#torque-display')!;
    this.statusEl = this.container.querySelector('#sim-status')!;
  }

  update(linkage: Linkage, state: FullState): void {
    this.statusEl.textContent = 'Running';
    this.statusEl.className = 'status-badge active';

    const torque = state.forces?.inputTorque ?? 0;
    this.torqueEl.textContent = `Input Torque: ${torque.toFixed(3)} N·m`;

    let html = '';
    for (const joint of linkage.joints) {
      const pos = state.positions.get(joint.id);
      const vel = state.velocities.get(joint.id);
      const force = state.forces?.jointForces.get(joint.id);

      const x = pos?.x ?? 0;
      const y = pos?.y ?? 0;
      const vx = vel?.x ?? 0;
      const vy = vel?.y ?? 0;
      const fx = force?.x ?? 0;
      const fy = force?.y ?? 0;
      const fMag = V.length({ x: fx, y: fy });

      const rowClass = joint.isGround ? 'ground-row' : joint.isInput ? 'input-row' : '';

      html += `<tr class="${rowClass}">
        <td class="joint-id">${joint.id}</td>
        <td>${x.toFixed(3)}</td>
        <td>${y.toFixed(3)}</td>
        <td>${vx.toFixed(3)}</td>
        <td>${vy.toFixed(3)}</td>
        <td>${fx.toFixed(2)}</td>
        <td>${fy.toFixed(2)}</td>
        <td class="force-mag">${fMag.toFixed(2)}</td>
      </tr>`;
    }

    this.tableBody.innerHTML = html;

    // Link summary
    const summaryEl = this.container.querySelector('#link-summary')!;
    let summaryHtml = '';
    for (const link of linkage.links) {
      const p1 = state.positions.get(link.jointIds[0]);
      const p2 = state.positions.get(link.jointIds[1]);
      const actualLen = p1 && p2 ? V.distance(p1, p2) : 0;

      const f1 = state.forces?.jointForces.get(link.jointIds[0]);
      // Axial force along the link
      let axialForce = 0;
      if (p1 && p2 && f1) {
        const dir = V.normalize(V.sub(p2, p1));
        axialForce = V.dot(f1, dir);
      }

      summaryHtml += `
        <div class="link-card">
          <span class="link-name">${link.id}</span>
          <span>${link.jointIds[0]} → ${link.jointIds[1]}</span>
          <span>L: ${actualLen.toFixed(3)}</span>
          <span class="${axialForce > 0 ? 'tension' : 'compression'}">
            ${axialForce > 0 ? 'T' : 'C'}: ${Math.abs(axialForce).toFixed(2)}N
          </span>
        </div>
      `;
    }
    summaryEl.innerHTML = summaryHtml;
  }
}
