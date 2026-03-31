import type { Vec2, Linkage, SolverResult } from '../types';
import * as V from './vec2';

export interface FourBarParams {
  O2: Vec2;
  O4: Vec2;
  a: number; // crank
  b: number; // coupler
  c: number; // rocker
  theta2: number;
  config: 'open' | 'cross';
}

export interface FourBarResult {
  theta3: number;
  theta4: number;
  A: Vec2; // crank end / coupler start
  B: Vec2; // coupler end / rocker end
  success: boolean;
}

export function solve4Bar(params: FourBarParams): FourBarResult {
  const { O2, O4, a, b, c, theta2, config } = params;
  const d = V.distance(O2, O4);

  const groundAngle = Math.atan2(O4.y - O2.y, O4.x - O2.x);

  const K1 = d / a;
  const K2 = d / c;
  const K3 = (a * a - b * b + c * c + d * d) / (2 * a * c);
  const K4 = d / b;
  const K5 = (c * c - d * d - a * a - b * b) / (2 * a * b);

  const relTheta2 = theta2 - groundAngle;

  // Solve for theta4 using Freudenstein
  const A_coeff =
    Math.cos(relTheta2) - K1 - K2 * Math.cos(relTheta2) + K3;
  const B_coeff = -2 * Math.sin(relTheta2);
  const C_coeff =
    K1 - (K2 + 1) * Math.cos(relTheta2) + K3;

  const discriminant = B_coeff * B_coeff - 4 * A_coeff * C_coeff;

  if (discriminant < 0) {
    // No solution - mechanism cannot reach this configuration
    const A_pos = V.add(O2, V.fromAngle(theta2, a));
    return { theta3: 0, theta4: 0, A: A_pos, B: O4, success: false };
  }

  const sqrtDisc = Math.sqrt(discriminant);
  const t1 = (-B_coeff + sqrtDisc) / (2 * A_coeff);
  const t2 = (-B_coeff - sqrtDisc) / (2 * A_coeff);

  const theta4_1 = 2 * Math.atan(t1) + groundAngle;
  const theta4_2 = 2 * Math.atan(t2) + groundAngle;

  // Solve for theta3 using the other Freudenstein equation
  const A3_coeff =
    Math.cos(relTheta2) - K1 + K4 * Math.cos(relTheta2) + K5;
  const B3_coeff = -2 * Math.sin(relTheta2);
  const C3_coeff =
    K1 + (K4 - 1) * Math.cos(relTheta2) + K5;

  const disc3 = B3_coeff * B3_coeff - 4 * A3_coeff * C3_coeff;

  let theta3_1: number, theta3_2: number;
  if (disc3 < 0) {
    // Fallback: compute theta3 from theta4 and loop closure
    theta3_1 = computeTheta3FromLoop(O2, O4, a, b, theta2, c, theta4_1);
    theta3_2 = computeTheta3FromLoop(O2, O4, a, b, theta2, c, theta4_2);
  } else {
    const sqrtDisc3 = Math.sqrt(disc3);
    const t3_1 = (-B3_coeff + sqrtDisc3) / (2 * A3_coeff);
    const t3_2 = (-B3_coeff - sqrtDisc3) / (2 * A3_coeff);
    theta3_1 = 2 * Math.atan(t3_1) + groundAngle;
    theta3_2 = 2 * Math.atan(t3_2) + groundAngle;
  }

  // Select configuration
  let theta3: number, theta4: number;
  if (config === 'open') {
    theta3 = theta3_1;
    theta4 = theta4_1;
  } else {
    theta3 = theta3_2;
    theta4 = theta4_2;
  }

  const A_pos = V.add(O2, V.fromAngle(theta2, a));
  const B_pos = V.add(O4, V.fromAngle(theta4, c));

  return { theta3, theta4, A: A_pos, B: B_pos, success: true };
}

function computeTheta3FromLoop(
  O2: Vec2,
  _O4: Vec2,
  a: number,
  _b: number,
  theta2: number,
  c: number,
  theta4: number
): number {
  const Ax = O2.x + a * Math.cos(theta2);
  const Ay = O2.y + a * Math.sin(theta2);
  const Bx = _O4.x + c * Math.cos(theta4);
  const By = _O4.y + c * Math.sin(theta4);
  return Math.atan2(By - Ay, Bx - Ax);
}

export interface CrankSliderParams {
  O2: Vec2;
  a: number; // crank length
  b: number; // connecting rod length
  theta2: number;
  sliderAngle: number; // angle of slider line (0 = horizontal)
  offset: number; // perpendicular offset of slider from crank pivot
}

export interface CrankSliderResult {
  theta3: number;
  sliderPos: Vec2;
  A: Vec2;
  success: boolean;
}

export function solveCrankSlider(params: CrankSliderParams): CrankSliderResult {
  const { O2, a, b, theta2, sliderAngle, offset } = params;

  const A = V.add(O2, V.fromAngle(theta2, a));

  // Component of A perpendicular to slider direction
  const perpDist =
    (A.y - O2.y - offset) * Math.cos(sliderAngle) -
    (A.x - O2.x) * Math.sin(sliderAngle);

  if (Math.abs(perpDist) > b) {
    return { theta3: 0, sliderPos: A, A, success: false };
  }

  const theta3 = Math.asin(perpDist / b);
  const parallelDist =
    (A.x - O2.x) * Math.cos(sliderAngle) +
    (A.y - O2.y - offset) * Math.sin(sliderAngle) +
    b * Math.cos(theta3);

  const sliderPos = V.add(
    { x: O2.x, y: O2.y + offset },
    V.fromAngle(sliderAngle, parallelDist)
  );

  return { theta3: theta3 + sliderAngle, sliderPos, A, success: true };
}

export function solveLinkage(linkage: Linkage): SolverResult {
  const positions = new Map<string, Vec2>();

  // Set ground joint positions
  for (const joint of linkage.joints) {
    if (joint.isGround) {
      positions.set(joint.id, { ...joint.position });
    }
  }

  // Set input joint position (crank tip)
  const crankPivot = linkage.joints.find((j) => j.id === linkage.crankPivotId);
  if (!crankPivot) {
    return { positions, success: false, error: 'Crank pivot not found' };
  }

  const inputPos = V.add(
    crankPivot.position,
    V.fromAngle(linkage.inputAngle, linkage.crankLength)
  );
  positions.set(linkage.inputJointId, inputPos);

  // For a standard 4-bar, find the remaining joints
  const solved = new Set(positions.keys());
  let iterations = 0;
  const maxIterations = 100;

  while (solved.size < linkage.joints.length && iterations < maxIterations) {
    iterations++;
    let progress = false;

    for (const link of linkage.links) {
      const [id1, id2] = link.jointIds;
      const has1 = solved.has(id1);
      const has2 = solved.has(id2);

      if (has1 && has2) continue;
      if (!has1 && !has2) continue;

      const knownId = has1 ? id1 : id2;
      const unknownId = has1 ? id2 : id1;
      const knownPos = positions.get(knownId)!;

      // Find another link connected to the unknown joint that has a known (solved) endpoint
      let foundSolution = false;
      for (const otherLink of linkage.links) {
        if (otherLink.id === link.id) continue;
        if (otherLink.jointIds[0] !== unknownId && otherLink.jointIds[1] !== unknownId) continue;

        const otherEndId =
          otherLink.jointIds[0] === unknownId
            ? otherLink.jointIds[1]
            : otherLink.jointIds[0];

        if (!solved.has(otherEndId)) continue;

        const otherPos = positions.get(otherEndId)!;

        // Two-circle intersection
        const result = circleCircleIntersection(
          knownPos,
          link.length,
          otherPos,
          otherLink.length
        );

        if (result) {
          // Pick the solution that maintains mechanism configuration
          const joint = linkage.joints.find((j) => j.id === unknownId);
          if (joint && joint.position) {
            const d1 = V.distance(result[0], joint.position);
            const d2 = V.distance(result[1], joint.position);
            positions.set(unknownId, d1 <= d2 ? result[0] : result[1]);
          } else {
            positions.set(unknownId, result[0]);
          }
          solved.add(unknownId);
          progress = true;
          foundSolution = true;
          break;
        }
      }
      if (foundSolution) continue;
    }

    // If no single-joint progress, try dyad solving (two unsolved joints connected by a link)
    if (!progress) {
      progress = solveDyad(linkage, positions, solved);
    }

    if (!progress) break;
  }

  const success = solved.size === linkage.joints.length;
  return {
    positions,
    success,
    error: success ? undefined : 'Could not solve all joint positions',
  };
}

/**
 * Dyad solver: solve two unsolved joints (P, Q) simultaneously where:
 *   P is connected to a known joint K1 by link1 (length L1)
 *   Q is connected to a known joint K2 by link2 (length L2)
 *   P and Q are connected to each other by linkPQ (length LPQ)
 *
 * This is a 2-circle + distance constraint problem.
 * P lies on circle(K1, L1), Q lies on circle(K2, L2), dist(P,Q) = LPQ
 *
 * Approach: sweep P around circle(K1, L1), for each P compute Q as
 * intersection of circle(P, LPQ) and circle(K2, L2). Pick the solution
 * closest to initial positions.
 */
function solveDyad(
  linkage: { joints: { id: string; position: Vec2; isGround: boolean; isInput: boolean }[]; links: { id: string; jointIds: [string, string]; length: number }[] },
  positions: Map<string, Vec2>,
  solved: Set<string>
): boolean {
  // Find unsolved joint pairs connected by a link
  for (const linkPQ of linkage.links) {
    const [pId, qId] = linkPQ.jointIds;
    if (solved.has(pId) || solved.has(qId)) continue;
    // Both P and Q are unsolved, connected by linkPQ

    // Find a link from P to a solved joint
    let k1Id: string | null = null;
    let linkPK1Length = 0;
    for (const l of linkage.links) {
      if (l.id === linkPQ.id) continue;
      let otherId: string | null = null;
      if (l.jointIds[0] === pId) otherId = l.jointIds[1];
      else if (l.jointIds[1] === pId) otherId = l.jointIds[0];
      if (otherId && solved.has(otherId)) {
        k1Id = otherId;
        linkPK1Length = l.length;
        break;
      }
    }
    if (!k1Id) continue;

    // Find a link from Q to a solved joint
    let k2Id: string | null = null;
    let linkQK2Length = 0;
    for (const l of linkage.links) {
      if (l.id === linkPQ.id) continue;
      let otherId: string | null = null;
      if (l.jointIds[0] === qId) otherId = l.jointIds[1];
      else if (l.jointIds[1] === qId) otherId = l.jointIds[0];
      if (otherId && solved.has(otherId)) {
        k2Id = otherId;
        linkQK2Length = l.length;
        break;
      }
    }
    if (!k2Id) continue;

    // We have: P on circle(K1, linkPK1Length), Q on circle(K2, linkQK2Length), dist(P,Q) = linkPQ.length
    const k1Pos = positions.get(k1Id)!;
    const k2Pos = positions.get(k2Id)!;
    const pqLen = linkPQ.length;

    const pJoint = linkage.joints.find((j) => j.id === pId);
    const qJoint = linkage.joints.find((j) => j.id === qId);
    const pInit = pJoint?.position || { x: 0, y: 0 };
    const qInit = qJoint?.position || { x: 0, y: 0 };

    // Sweep P around its circle and find valid (P, Q) pairs
    let bestP: Vec2 | null = null;
    let bestQ: Vec2 | null = null;
    let bestDist = Infinity;

    const steps = 360;
    for (let i = 0; i < steps; i++) {
      const angle = (2 * Math.PI * i) / steps;
      const pCandidate: Vec2 = {
        x: k1Pos.x + linkPK1Length * Math.cos(angle),
        y: k1Pos.y + linkPK1Length * Math.sin(angle),
      };

      // Q must be at intersection of circle(pCandidate, pqLen) and circle(K2, linkQK2Length)
      const qResult = circleCircleIntersection(pCandidate, pqLen, k2Pos, linkQK2Length);
      if (!qResult) continue;

      // Pick the Q closest to initial position
      for (const qCandidate of qResult) {
        const d = V.distance(pCandidate, pInit) + V.distance(qCandidate, qInit);
        if (d < bestDist) {
          bestDist = d;
          bestP = pCandidate;
          bestQ = qCandidate;
        }
      }
    }

    if (bestP && bestQ) {
      positions.set(pId, bestP);
      positions.set(qId, bestQ);
      solved.add(pId);
      solved.add(qId);
      return true;
    }
  }

  return false;
}

function circleCircleIntersection(
  c1: Vec2,
  r1: number,
  c2: Vec2,
  r2: number
): [Vec2, Vec2] | null {
  const d = V.distance(c1, c2);

  if (d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9 || d < 1e-12) {
    return null;
  }

  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  const h = h2 > 0 ? Math.sqrt(h2) : 0;

  const dir = V.normalize(V.sub(c2, c1));
  const mid = V.add(c1, V.scale(dir, a));
  const perp = { x: -dir.y, y: dir.x };

  return [
    V.add(mid, V.scale(perp, h)),
    V.sub(mid, V.scale(perp, h)),
  ];
}
