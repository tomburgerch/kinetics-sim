import type { Linkage } from '../types';
import { createJoint, createLink, createLinkage } from './linkage';
import * as V from '../math/vec2';

export interface PresetInfo {
  name: string;
  description: string;
  factory: (mass: number) => Linkage;
}

export const presets: PresetInfo[] = [
  {
    name: "Evan's 6-Bar Actuator",
    description:
      "Evan's mechanism: 6-bar with 160° actuator input driving a long output arm through only 20° of motion (~8:1 reduction). Three ground pivots, short coupler network at top. Load on output arm tip.",
    factory: createEvans6Bar,
  },
  {
    name: '4-Bar Crank-Rocker',
    description:
      'Classic Grashof crank-rocker: crank fully rotates, rocker oscillates. Good for converting rotary to oscillating motion.',
    factory: createFourBarCrankRocker,
  },
  {
    name: '4-Bar Double-Crank',
    description:
      'Both crank and rocker can fully rotate (drag-link). The shortest link is the ground.',
    factory: createFourBarDoubleCrank,
  },
  {
    name: 'Crank-Slider',
    description:
      'Converts rotary motion to linear. Common in engines and presses.',
    factory: createCrankSlider,
  },
  {
    name: '4-Bar with Hanging Load',
    description:
      'A crank-rocker with a gravity load on the coupler joint, similar to pulling up a mass via linkage.',
    factory: createFourBarWithLoad,
  },
  {
    name: '6-Bar Watt Type I',
    description:
      'A 6-bar linkage (Watt Type I): two 4-bar loops sharing a common link. More complex motion paths.',
    factory: createSixBarWatt,
  },
];

/**
 * Evan's 6-bar actuator mechanism.
 *
 * Based on the CAD image: two fixed ground pivots (O1 bottom-left, O2 bottom-right),
 * an actuator pivot (Act) between them that provides the input rotation.
 * The actuator drives a long arm up to joint B, which connects through a short
 * coupler to joint C on the upper output arm. The output arm is grounded at O2.
 *
 * Topology (Stephenson III):
 *   O1 (ground) --- actuator arm ---> A (input, on actuator)
 *   A --- long drive arm ---> B
 *   B --- coupler ---> C
 *   C --- upper arm ---> D
 *   D --- output arm ---> O2 (ground)
 *   O1 --- lower link ---> E (connects to drive arm for constraint)
 *
 * Simplified as two coupled 4-bar loops sharing joint B:
 *   Loop 1: O1 -> A -> B -> E -> O1  (actuator loop)
 *   Loop 2: O2 -> D -> C -> B        (output loop, B shared)
 */
function createEvans6Bar(mass: number): Linkage {
  // Evan's 6-bar actuator mechanism (from CAD).
  //
  // Key constraints from Evan:
  //   - Actuator arm (input) rotates 160° CCW from start to end
  //   - Output arm (long bar) moves only 20° between extreme positions
  //   - This gives ~8:1 reduction ratio
  //
  // Topology: Stephenson III with 3 ground pivots
  //   O_act (actuator ground, orange circle in CAD)
  //   O_upper (upper pivot, fixed to frame)
  //   O_base (base pivot for output arm, fixed to frame)
  //
  //   Loop 1 (actuator): O_act → A → B ← O_upper  (A is input)
  //   Loop 2 (output):   O_base → D → C ← B       (C-D is output arm region)
  //
  // The long output arm (O_base → D) swings slowly while the actuator
  // arm (O_act → A) sweeps through its full 160° range.

  // Ground pivots — positioned to match CAD proportions (vertical mechanism)
  // Actuator ground is at bottom-center, base pivot slightly right and below,
  // upper pivot is above and left (where the constraint arm anchors)
  const Oact = { x: 0, y: 0 };      // actuator rotation point (orange in CAD)
  const Obase = { x: 2, y: -1 };    // base pivot for output arm
  const Oupper = { x: -1, y: 6 };   // upper constraint pivot

  // Link lengths tuned for 160° input → ~20° output
  const actuatorLen = 3;     // actuator arm (input crank)
  const driveLen = 7;        // connecting arm A→B
  const constraintLen = 4;   // constraint arm O_upper→B
  const couplerLen = 2;      // short coupler B→C
  const upperLen = 2.5;      // short link C→D
  const outputLen = 10;      // long output arm O_base→D

  // Start with actuator pointing down-right (~-20° from horizontal)
  const startAngle = -Math.PI * 0.12;
  const Ax = Oact.x + actuatorLen * Math.cos(startAngle);
  const Ay = Oact.y + actuatorLen * Math.sin(startAngle);

  // B near the top (solver computes exact)
  const Bx = 1.5, By = 6.5;

  // D at end of output arm, pointing mostly up
  const Dx = Obase.x - 1.5, Dy = Obase.y + outputLen - 2;

  // C between B and D
  const t = couplerLen / (couplerLen + upperLen);
  const Cx = Bx + (Dx - Bx) * t, Cy = By + (Dy - By) * t;

  const joints = [
    createJoint('O_act', Oact.x, Oact.y, true),       // actuator ground (orange)
    createJoint('A', Ax, Ay, false, true),              // actuator arm tip (input)
    createJoint('B', Bx, By),                           // drive/constraint junction
    createJoint('C', Cx, Cy),                           // coupler joint
    createJoint('D', Dx, Dy),                           // output arm upper joint
    createJoint('O_base', Obase.x, Obase.y, true),     // base ground pivot
    createJoint('O_upper', Oupper.x, Oupper.y, true),  // upper constraint pivot
  ];

  const links = [
    createLink('actuator', 'O_act', 'A', actuatorLen),     // input crank (blue in CAD)
    createLink('drive', 'A', 'B', driveLen),                // long connecting arm
    createLink('constraint', 'O_upper', 'B', constraintLen),// constraint arm
    createLink('coupler', 'B', 'C', couplerLen),            // short coupler
    createLink('upper_link', 'C', 'D', upperLen),           // short upper link
    createLink('output', 'O_base', 'D', outputLen),         // long output arm
  ];

  const gravity = mass > 0 ? mass * 9.81 : 10 * 9.81;
  // Load at the top of the output arm (what the mechanism lifts)
  const loads = [{ jointId: 'D', force: { x: 0, y: -gravity } }];

  const linkage = createLinkage(joints, links, 'O_act', 'A', actuatorLen, loads);
  linkage.inputAngle = startAngle; // start at the beginning of the 160° range
  return linkage;
}

function createFourBarCrankRocker(mass: number): Linkage {
  const a = 2, b = 7, c = 5, d = 8;

  const joints = [
    createJoint('O2', 0, 0, true),
    createJoint('A', a, 0, false, true),
    createJoint('B', d - c * 0.6, b * 0.3),
    createJoint('O4', d, 0, true),
  ];

  const links = [
    createLink('crank', 'O2', 'A', a),
    createLink('coupler', 'A', 'B', b),
    createLink('rocker', 'O4', 'B', c),
  ];

  const gravity = mass * 9.81;
  const loads = mass > 0 ? [{ jointId: 'B', force: { x: 0, y: -gravity } }] : [];

  return createLinkage(joints, links, 'O2', 'A', a, loads);
}

function createFourBarDoubleCrank(mass: number): Linkage {
  const a = 4, b = 5, c = 4, d = 2;

  const joints = [
    createJoint('O2', 0, 0, true),
    createJoint('A', a * 0.5, a * 0.866, false, true),
    createJoint('B', d + c * 0.5, b * 0.3),
    createJoint('O4', d, 0, true),
  ];

  const links = [
    createLink('crank', 'O2', 'A', a),
    createLink('coupler', 'A', 'B', b),
    createLink('rocker', 'O4', 'B', c),
  ];

  const gravity = mass * 9.81;
  const loads = mass > 0 ? [{ jointId: 'B', force: { x: 0, y: -gravity } }] : [];

  return createLinkage(joints, links, 'O2', 'A', a, loads);
}

function createCrankSlider(mass: number): Linkage {
  const a = 3, b = 8;

  const joints = [
    createJoint('O2', 0, 0, true),
    createJoint('A', a, 0, false, true),
    createJoint('B', a + b, 0),
    createJoint('slider_ground', a + b, 0, true),
  ];

  const links = [
    createLink('crank', 'O2', 'A', a),
    createLink('conrod', 'A', 'B', b),
  ];

  const gravity = mass * 9.81;
  const loads = mass > 0 ? [{ jointId: 'B', force: { x: -gravity, y: 0 } }] : [];

  return createLinkage(joints, links, 'O2', 'A', a, loads);
}

function createFourBarWithLoad(mass: number): Linkage {
  const a = 3, b = 9, c = 7, d = 10;

  const joints = [
    createJoint('O2', 0, 0, true),
    createJoint('A', a, 0, false, true),
    createJoint('B', d - c * 0.5, -4),
    createJoint('O4', d, 0, true),
  ];

  const links = [
    createLink('crank', 'O2', 'A', a),
    createLink('coupler', 'A', 'B', b),
    createLink('rocker', 'O4', 'B', c),
  ];

  const gravity = mass > 0 ? mass * 9.81 : 5 * 9.81;
  const loads = [{ jointId: 'B', force: { x: 0, y: -gravity } }];

  return createLinkage(joints, links, 'O2', 'A', a, loads);
}

function createSixBarWatt(mass: number): Linkage {
  const joints = [
    createJoint('O2', 0, 0, true),
    createJoint('A', 3, 1, false, true),
    createJoint('B', 8, 2),
    createJoint('O4', 10, 0, true),
    createJoint('C', 5, 5),
    createJoint('D', 3, 7),
    createJoint('O6', 0, 5, true),
  ];

  const links = [
    createLink('L2', 'O2', 'A', V.distance(joints[0].position, joints[1].position)),
    createLink('L3', 'A', 'B', V.distance(joints[1].position, joints[2].position)),
    createLink('L4', 'O4', 'B', V.distance(joints[3].position, joints[2].position)),
    createLink('L5', 'B', 'C', V.distance(joints[2].position, joints[4].position)),
    createLink('L6', 'C', 'D', V.distance(joints[4].position, joints[5].position)),
    createLink('L7', 'O6', 'D', V.distance(joints[6].position, joints[5].position)),
  ];

  const gravity = mass * 9.81;
  const loads = mass > 0 ? [{ jointId: 'C', force: { x: 0, y: -gravity } }] : [];

  return createLinkage(joints, links, 'O2', 'A', links[0].length, loads);
}
