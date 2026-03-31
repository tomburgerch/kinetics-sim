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
      'Simulates Evan\'s mechanism: a crank-rocker with a gravity load on the coupler joint, similar to pulling up a mass via linkage.',
    factory: createFourBarWithLoad,
  },
  {
    name: '6-Bar Watt Type I',
    description:
      'A 6-bar linkage (Watt Type I): two 4-bar loops sharing a common link. More complex motion paths.',
    factory: createSixBarWatt,
  },
];

function createFourBarCrankRocker(mass: number): Linkage {
  // Grashof condition: s + l < p + q (s=shortest, l=longest)
  // a=2 (crank/shortest), b=7 (coupler), c=5 (rocker), d=8 (ground)
  const a = 2, b = 7, c = 5, d = 8;

  const joints = [
    createJoint('O2', 0, 0, true),          // crank ground pivot
    createJoint('A', a, 0, false, true),      // crank tip / coupler start
    createJoint('B', d - c * 0.6, b * 0.3),  // coupler end / rocker end
    createJoint('O4', d, 0, true),            // rocker ground pivot
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
  // Double-crank (drag link): ground is the shortest link
  // d=2 (ground/shortest), a=4, b=5, c=4
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
  const a = 3; // crank
  const b = 8; // connecting rod

  const joints = [
    createJoint('O2', 0, 0, true),
    createJoint('A', a, 0, false, true),
    createJoint('B', a + b, 0),
    createJoint('slider_ground', a + b, 0, true), // virtual ground for slider
  ];

  const links = [
    createLink('crank', 'O2', 'A', a),
    createLink('conrod', 'A', 'B', b),
  ];

  const gravity = mass * 9.81;
  const loads = mass > 0 ? [{ jointId: 'B', force: { x: -gravity, y: 0 } }] : [];

  const linkage = createLinkage(joints, links, 'O2', 'A', a, loads);
  return linkage;
}

function createFourBarWithLoad(mass: number): Linkage {
  // Evan's mechanism: designed to pull up a mass
  // Crank rotates, coupler pulls up on a load point
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
  // Watt Type I: two 4-bar loops sharing coupler link
  const joints = [
    createJoint('O2', 0, 0, true),
    createJoint('A', 3, 1, false, true),
    createJoint('B', 8, 2),
    createJoint('O4', 10, 0, true),
    createJoint('C', 5, 5),          // extra coupler point
    createJoint('D', 3, 7),
    createJoint('O6', 0, 5, true),   // ground for second loop
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
