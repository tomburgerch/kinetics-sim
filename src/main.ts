import { presets } from './model/presets';
import { CoordinateSystem } from './render/coordinate-system';
import { CanvasRenderer } from './render/canvas-renderer';
import { ControlsPanel } from './ui/controls';
import type { ControlValues } from './ui/controls';
import { OutputPanel } from './ui/output-panel';
import { Simulation } from './sim/animation';
import { exportCSV } from './ui/export';
import './style.css';

let sim: Simulation;
let renderer: CanvasRenderer;
let coords: CoordinateSystem;
let controls: ControlsPanel;
let output: OutputPanel;

function init(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <aside id="sidebar"></aside>
    <main id="canvas-container">
      <canvas id="sim-canvas"></canvas>
    </main>
    <aside id="output-panel"></aside>
  `;

  const canvas = document.getElementById('sim-canvas') as HTMLCanvasElement;
  const sidebar = document.getElementById('sidebar')!;
  const outputContainer = document.getElementById('output-panel')!;

  resizeCanvas(canvas);

  coords = new CoordinateSystem(canvas);
  renderer = new CanvasRenderer(canvas, coords);
  output = new OutputPanel(outputContainer);

  const initialPreset = 3;
  const initialMass = 5;
  const linkage = presets[initialPreset].factory(initialMass);

  sim = new Simulation(linkage, (state) => {
    renderer.drawLinkage(sim.linkage, state);
    output.update(sim.linkage, state);
    controls?.updateAngleDisplay(sim.linkage.inputAngle);
  });

  controls = new ControlsPanel(
    sidebar,
    (values: ControlValues) => handleControlChange(values),
    (action) => handleAction(action)
  );

  // Initial solve after sim is assigned
  sim.solve();

  window.addEventListener('resize', () => {
    resizeCanvas(canvas);
    renderer.resize(canvas.width, canvas.height);
    sim.solve();
  });
}

function handleControlChange(values: ControlValues): void {
  const newLinkage = presets[values.presetIndex].factory(values.mass);
  newLinkage.inputAngle = values.angleRad;
  sim.linkage = newLinkage;

  renderer.showForces = values.showForces;
  renderer.showLabels = values.showLabels;
  renderer.forceScale = values.forceScale;
  sim.rpm = values.rpm;

  if (!sim.running) {
    sim.linkage.inputAngle = values.angleRad;
    sim.solve();
  }
}

function handleAction(action: string): void {
  switch (action) {
    case 'play':
      sim.play();
      break;
    case 'pause':
      sim.pause();
      break;
    case 'reset':
      sim.reset();
      break;
    case 'export':
      exportCSV(sim.linkage);
      break;
  }
}

function resizeCanvas(canvas: HTMLCanvasElement): void {
  const container = canvas.parentElement!;
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
}

document.addEventListener('DOMContentLoaded', init);
