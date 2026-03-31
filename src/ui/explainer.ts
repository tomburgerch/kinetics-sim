export function showExplainer(): void {
  // Don't show if user has dismissed before
  if (localStorage.getItem('kinetics-sim-explainer-dismissed')) return;

  const overlay = document.createElement('div');
  overlay.className = 'explainer-overlay';
  overlay.innerHTML = `
    <div class="explainer-modal">
      <div class="explainer-hero">
        <svg viewBox="0 0 200 100" class="explainer-svg">
          <line x1="30" y1="60" x2="70" y2="25" stroke="#22c55e" stroke-width="4" stroke-linecap="round"/>
          <line x1="70" y1="25" x2="140" y2="35" stroke="#3b82f6" stroke-width="4" stroke-linecap="round"/>
          <line x1="170" y1="60" x2="140" y2="35" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/>
          <circle cx="30" cy="60" r="6" fill="none" stroke="#ef4444" stroke-width="2.5"/>
          <circle cx="170" cy="60" r="6" fill="none" stroke="#ef4444" stroke-width="2.5"/>
          <circle cx="70" cy="25" r="4" fill="#22c55e"/>
          <circle cx="140" cy="35" r="4" fill="#3b82f6"/>
          <line x1="140" y1="35" x2="140" y2="70" stroke="#a855f7" stroke-width="2" stroke-dasharray="3 3"/>
          <polygon points="140,75 136,67 144,67" fill="#a855f7"/>
          <text x="140" y="90" text-anchor="middle" fill="#a855f7" font-size="10" font-family="monospace">mg</text>
        </svg>
      </div>
      <h2>Kinetics Simulator</h2>
      <p class="explainer-subtitle">2D Linkage Kinematics & Force Analysis</p>

      <div class="explainer-features">
        <div class="explainer-feature">
          <span class="explainer-icon">1</span>
          <div>
            <b>Choose or build a mechanism</b>
            <p>Pick from 5 presets (4-bar, crank-slider, 6-bar) or build your own with the custom linkage builder. You can also import from a photo of a physical mechanism.</p>
          </div>
        </div>
        <div class="explainer-feature">
          <span class="explainer-icon">2</span>
          <div>
            <b>Simulate and analyze</b>
            <p>Drag the crank angle slider or hit Play to animate. The simulator solves kinematics (joint positions) and statics (reaction forces, input torque) in real-time.</p>
          </div>
        </div>
        <div class="explainer-feature">
          <span class="explainer-icon">3</span>
          <div>
            <b>Measure loads and stress</b>
            <p>See force magnitudes at every joint, axial loads per link (tension/compression), and safety factors based on your chosen material and cross-section. Toggle trace paths and graphs for the full picture.</p>
          </div>
        </div>
        <div class="explainer-feature">
          <span class="explainer-icon">4</span>
          <div>
            <b>Export your data</b>
            <p>Export a full 360-degree sweep as CSV with all positions, forces, and torque for offline analysis in Excel or Python.</p>
          </div>
        </div>
      </div>

      <div class="explainer-controls-hint">
        <span><b>Scroll</b> to zoom</span>
        <span><b>Shift+Drag</b> to pan</span>
        <span><b>Slider</b> to rotate crank</span>
      </div>

      <button class="btn btn-primary explainer-close">Get Started</button>
    </div>
  `;

  document.body.appendChild(overlay);

  const closeBtn = overlay.querySelector('.explainer-close')!;
  closeBtn.addEventListener('click', () => {
    overlay.classList.add('explainer-fade-out');
    setTimeout(() => overlay.remove(), 300);
    localStorage.setItem('kinetics-sim-explainer-dismissed', '1');
  });

  // Also close on clicking backdrop
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeBtn.dispatchEvent(new Event('click'));
    }
  });
}
