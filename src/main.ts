import { presets } from './model/presets';
import { CoordinateSystem } from './render/coordinate-system';
import { CanvasRenderer } from './render/canvas-renderer';
import { ControlsPanel } from './ui/controls';
import type { ControlValues } from './ui/controls';
import { OutputPanel } from './ui/output-panel';
import { Simulation } from './sim/animation';
import { exportCSV } from './ui/export';
import { GraphPanel } from './ui/graphs';
import { showExplainer } from './ui/explainer';
import { computeStress } from './ui/materials';
import { PhotoImport } from './ui/photo-import';
import type { PhotoJoint } from './ui/photo-import';
import { CustomBuilder } from './ui/custom-builder';
import { createJoint, createLink, createLinkage } from './model/linkage';
import * as V from './math/vec2';
import './style.css';

let sim: Simulation;
let renderer: CanvasRenderer;
let coords: CoordinateSystem;
let controls: ControlsPanel;
let output: OutputPanel;
let graphs: GraphPanel;

let currentPresetIndex = 3;
let currentMass = 5;

function init(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <aside id="sidebar"></aside>
    <div id="center-col">
      <main id="canvas-container">
        <canvas id="sim-canvas"></canvas>
      </main>
      <div id="graph-container"></div>
    </div>
    <aside id="output-panel"></aside>
  `;

  const canvas = document.getElementById('sim-canvas') as HTMLCanvasElement;
  const sidebar = document.getElementById('sidebar')!;
  const outputContainer = document.getElementById('output-panel')!;
  const graphContainer = document.getElementById('graph-container')!;

  resizeCanvas(canvas);

  coords = new CoordinateSystem(canvas);
  renderer = new CanvasRenderer(canvas, coords);
  output = new OutputPanel(outputContainer);
  graphs = new GraphPanel(graphContainer);

  const linkage = presets[currentPresetIndex].factory(currentMass);

  sim = new Simulation(linkage, (state) => {
    renderer.drawLinkage(sim.linkage, state);
    output.update(sim.linkage, state);
    controls?.updateAngleDisplay(sim.linkage.inputAngle);

    // Update stress
    const cv = controls?.values;
    if (cv) {
      const stressResults = computeStress(sim.linkage, state, cv.material, cv.crossSection, cv.sectionSize);
      output.updateStress(stressResults);
    }

    // Update graphs
    const angleDeg = ((sim.linkage.inputAngle * 180) / Math.PI) % 360;
    graphs.update(sim.traces, angleDeg);
  });

  controls = new ControlsPanel(
    sidebar,
    (values: ControlValues) => handleControlChange(values),
    (action) => handleAction(action)
  );

  coords.onViewChange = () => {
    if (!sim.running) sim.solve();
  };

  sim.solve();

  window.addEventListener('resize', () => {
    resizeCanvas(canvas);
    renderer.resize(canvas.width, canvas.height);
    if (!sim.running) sim.solve();
  });

  showExplainer();
}

function handleControlChange(values: ControlValues): void {
  if (values.presetIndex !== currentPresetIndex || values.mass !== currentMass) {
    const currentAngle = sim.running ? sim.linkage.inputAngle : values.angleRad;
    currentPresetIndex = values.presetIndex;
    currentMass = values.mass;
    const newLinkage = presets[values.presetIndex].factory(values.mass);
    newLinkage.inputAngle = currentAngle;
    sim.linkage = newLinkage;
    // Recompute traces if enabled
    if (values.showTraces || values.showGraphs) {
      sim.computeTraces();
      renderer.traces = sim.traces;
    }
  }

  renderer.showForces = values.showForces;
  renderer.showLabels = values.showLabels;
  renderer.showTraces = values.showTraces;
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
    case 'toggleTraces':
      if (controls.values.showTraces) {
        sim.computeTraces();
        renderer.traces = sim.traces;
        renderer.showTraces = true;
      } else {
        renderer.showTraces = false;
      }
      if (!sim.running) sim.solve();
      break;
    case 'toggleGraphs':
      if (controls.values.showGraphs) {
        sim.computeTraces();
        renderer.traces = sim.traces;
        graphs.show();
        const angleDeg = ((sim.linkage.inputAngle * 180) / Math.PI) % 360;
        graphs.update(sim.traces, angleDeg);
      } else {
        graphs.hide();
      }
      break;
    case 'importPhoto': {
      const importer = new PhotoImport((joints: PhotoJoint[], scale: number) => {
        applyPhotoImport(joints, scale);
      });
      importer.open();
      break;
    }
    case 'customBuilder': {
      const builder = new CustomBuilder((linkage) => {
        sim.linkage = linkage;
        sim.solve();
        if (controls.values.showTraces || controls.values.showGraphs) {
          sim.computeTraces();
          renderer.traces = sim.traces;
        }
      });
      builder.open();
      break;
    }
  }
}

function applyPhotoImport(photoJoints: PhotoJoint[], _scale: number): void {
  if (photoJoints.length < 3) return;

  const groundJoints = photoJoints.filter((j) => j.isGround);
  const crankPivot = groundJoints[0] || photoJoints[0];
  const inputJoint = photoJoints.find((j) => !j.isGround) || photoJoints[1];

  const joints = photoJoints.map((j) =>
    createJoint(j.id, j.worldPos.x, j.worldPos.y, j.isGround, j.id === inputJoint.id)
  );

  // Auto-connect sequential joints as links
  const links = [];
  for (let i = 0; i < photoJoints.length - 1; i++) {
    const p1 = photoJoints[i];
    const p2 = photoJoints[i + 1];
    const length = V.distance(p1.worldPos, p2.worldPos);
    links.push(createLink(`L${i}`, p1.id, p2.id, length));
  }
  // Close the loop
  if (photoJoints.length >= 3) {
    const last = photoJoints[photoJoints.length - 1];
    const first = photoJoints[0];
    links.push(createLink(`L${photoJoints.length - 1}`, last.id, first.id, V.distance(last.worldPos, first.worldPos)));
  }

  const crankLength = V.distance(crankPivot.worldPos, inputJoint.worldPos);
  const linkage = createLinkage(joints, links, crankPivot.id, inputJoint.id, crankLength);

  sim.linkage = linkage;
  sim.solve();
}

function resizeCanvas(canvas: HTMLCanvasElement): void {
  const container = canvas.parentElement!;
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
}

document.addEventListener('DOMContentLoaded', init);
