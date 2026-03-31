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
      "Evan's actual mechanism: a 6-bar linkage with two ground pivots and a central actuator. The actuator rotates to drive an output arm through a coupler network. Shows required input torque.",
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
  // Evan's 6-bar actuator from CAD image:
  // Two ground pivots, input actuator, drives an output arm through a coupler network.
  //
  // Topology (Stephenson III - two coupled 4-bar loops):
  //   Loop 1: O1 -> A -> B -> O3 (upper ground)
  //   Loop 2: O2 -> D -> C -> B  (B shared between loops)
  //
  // This ensures the solver can resolve:
  //   1. A is known (input joint on O1)
  //   2. B solvable from (A, drive) and (O3, link_O3B) — two circles
  //   3. C solvable from (B, coupler) and (something)...
  //
  // Actually for the solver to work, each unknown needs 2 links to known joints.
  // Let's use 3 ground pivots to make it solvable:
  //   O1 (left, actuator ground), O2 (right, output ground), O3 (upper, constraint)
  //
  // From CAD: the mechanism has the actuator at bottom-center driving upward,
  // with the output arm pivoting from the right ground to reach up.

  // Ground pivots
  const O1x = 0, O1y = 0;     // actuator ground (left)
  const O2x = 10, O2y = 0;    // output ground (right)

  // Actuator arm: short crank from O1
  const crankLen = 3;
  // At angle ~60° to start in a reasonable position
  const startAngle = Math.PI * 0.35;
  const Ax = O1x + crankLen * Math.cos(startAngle);
  const Ay = O1y + crankLen * Math.sin(startAngle);

  // This is really a 5-bar with 2 ground pivots.
  // For the solver: B needs two links to known joints.
  // Solution: add a ternary link (link with 3 joints) or add a third ground.
  //
  // Simplest working approach: model as two nested 4-bars sharing joint B.
  // Add a third ground pivot O3 so B is determined by (A, driveLen) and (O3, constraintLen).
  const O3x = 2, O3y = 8;     // upper constraint pivot

  // B = intersection of circle(A, driveLen) and circle(O3, constraintLen)
  const driveLen = 9;
  const constraintLen = 5;

  // Compute B position
  const Bx = 5, By = 8; // approximate — solver will compute exact

  // D = on circle(O2, outputLen)
  const outputLen = 8;
  const Dx = O2x - 4, Dy = 7; // approximate

  // C = between B and D: dist(B,C)=couplerLen, dist(D,C)=upperLen
  const couplerLen = 4;
  const upperLen = 3.5;
  const Cx = (Bx + Dx) / 2, Cy = (By + Dy) / 2 + 1;

  const joints = [
    createJoint('O1', O1x, O1y, true),       // actuator ground
    createJoint('A', Ax, Ay, false, true),     // actuator tip (input)
    createJoint('B', Bx, By),                  // top of drive arm (shared)
    createJoint('C', Cx, Cy),                  // coupler joint
    createJoint('D', Dx, Dy),                  // output arm joint
    createJoint('O2', O2x, O2y, true),        // output ground
    createJoint('O3', O3x, O3y, true),        // upper constraint ground
  ];

  const links = [
    createLink('actuator', 'O1', 'A', crankLen),       // input crank
    createLink('drive', 'A', 'B', driveLen),            // long drive arm
    createLink('constraint', 'O3', 'B', constraintLen), // constraint from upper ground
    createLink('coupler', 'B', 'C', couplerLen),        // coupler
    createLink('upper', 'C', 'D', upperLen),            // upper arm
    createLink('output', 'O2', 'D', outputLen),         // output arm
  ];

  const gravity = mass > 0 ? mass * 9.81 : 10 * 9.81;
  const loads = [{ jointId: 'C', force: { x: 0, y: -gravity } }];

  return createLinkage(joints, links, 'O1', 'A', crankLen, loads);
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
