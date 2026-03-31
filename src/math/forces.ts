import type { Vec2, Linkage, ForceResult } from '../types';
import * as V from './vec2';
import { solveLinearSystem } from './matrix';

/**
 * Static force analysis for a planar linkage.
 *
 * For each moving link, we write 3 equilibrium equations:
 *   sum Fx = 0, sum Fy = 0, sum M = 0 (about one end)
 *
 * For a 4-bar linkage with 3 moving links (crank, coupler, rocker),
 * unknowns are:
 *   - 2 force components at each of 4 joints (O2, A, B, O4) = 8
 *   - 1 input torque on the crank = 1
 *   Total = 9 unknowns, 9 equations
 *
 * Internal joint forces obey Newton's 3rd law: the force on the coupler
 * at joint A is equal and opposite to the force on the crank at joint A.
 */
export function solveForces(
  linkage: Linkage,
  positions: Map<string, Vec2>
): ForceResult {
  const jointForces = new Map<string, Vec2>();
  const linkForces = new Map<string, { start: Vec2; end: Vec2 }>();

  // Build adjacency: which links connect to each joint
  const movingLinks = linkage.links.filter((link) => {
    const j1 = linkage.joints.find((j) => j.id === link.jointIds[0]);
    const j2 = linkage.joints.find((j) => j.id === link.jointIds[1]);
    return j1 && j2;
  });

  if (movingLinks.length === 0) {
    return { jointForces, linkForces, inputTorque: 0 };
  }

  // For each link, we have two joint-force unknowns (Fx, Fy at each end).
  // Internal joints shared between links use Newton's 3rd law (opposite forces).
  //
  // Approach: assign unique force variables per (link, joint) pair.
  // Then add coupling constraints for shared joints.

  // Identify the crank link (has the input torque)
  const crankLink = movingLinks.find(
    (l) =>
      l.jointIds.includes(linkage.crankPivotId) &&
      l.jointIds.includes(linkage.inputJointId)
  );

  // Build external load map
  const loadAtJoint = new Map<string, Vec2>();
  for (const load of linkage.loads) {
    const cur = loadAtJoint.get(load.jointId) || { x: 0, y: 0 };
    loadAtJoint.set(load.jointId, V.add(cur, load.force));
  }

  // For a standard 4-bar (3 moving links), we use a direct formulation.
  // Unknowns per link: F_start_x, F_start_y, F_end_x, F_end_y
  // Plus one torque for the crank link.
  // With Newton's 3rd law coupling at internal joints, we reduce unknowns.

  // Variable mapping: for each (link_index, joint_index_in_link), assign var indices
  const numLinks = movingLinks.length;
  const varMap = new Map<string, number>(); // "linkIdx_jointIdx" -> variable index
  let numVars = 0;

  // For internal joints (shared between two links), we only create one set of variables
  // and the other link references them with a sign flip.
  const jointToFirstLink = new Map<string, { linkIdx: number; jointLocalIdx: number }>();

  for (let li = 0; li < numLinks; li++) {
    const link = movingLinks[li];
    for (let ji = 0; ji < 2; ji++) {
      const jointId = link.jointIds[ji];
      const key = `${li}_${ji}`;

      if (jointToFirstLink.has(jointId)) {
        // This joint was already assigned vars from another link
        // We'll reference those vars with a -1 sign (Newton's 3rd law)
        const first = jointToFirstLink.get(jointId)!;
        varMap.set(key, varMap.get(`${first.linkIdx}_${first.jointLocalIdx}`)!);
      } else {
        varMap.set(key, numVars);
        jointToFirstLink.set(jointId, { linkIdx: li, jointLocalIdx: ji });
        numVars += 2; // Fx, Fy
      }
    }
  }

  // Add input torque variable
  const torqueVarIdx = numVars;
  numVars += 1;

  // Build equations: 3 per link (Fx=0, Fy=0, Moment=0)
  const numEqs = numLinks * 3;
  const A: number[][] = [];
  const b: number[] = [];

  for (let li = 0; li < numLinks; li++) {
    const link = movingLinks[li];
    const p0 = positions.get(link.jointIds[0]) || { x: 0, y: 0 };
    const p1 = positions.get(link.jointIds[1]) || { x: 0, y: 0 };

    // Determine sign for each joint's force on this link
    // If this link "owns" the variable, sign = +1
    // If another link owns it (Newton's 3rd law), sign = -1
    const signs: number[] = [1, 1];
    for (let ji = 0; ji < 2; ji++) {
      const jointId = link.jointIds[ji];
      const first = jointToFirstLink.get(jointId)!;
      if (first.linkIdx !== li) {
        signs[ji] = -1; // Newton's 3rd law: opposite force
      }
    }

    const varIdx0 = varMap.get(`${li}_0`)!; // Fx, Fy indices for joint 0
    const varIdx1 = varMap.get(`${li}_1`)!; // Fx, Fy indices for joint 1

    // External loads on this link (loads at joints belonging to this link)
    let extFx = 0, extFy = 0;
    for (let ji = 0; ji < 2; ji++) {
      const load = loadAtJoint.get(link.jointIds[ji]);
      if (load) {
        // Only apply load to this link if this link "owns" the joint
        // or split loads if joint is shared — simpler: apply full load to each link
        // Actually, external loads act on the mechanism, not specific links.
        // For joints shared between two links, the load is applied once.
        const first = jointToFirstLink.get(link.jointIds[ji])!;
        if (first.linkIdx === li) {
          extFx += load.x;
          extFy += load.y;
        }
      }
    }

    // Equation 1: sum Fx = 0
    // sign0 * F0x + sign1 * F1x + extFx = 0
    const rowFx = new Array(numVars).fill(0);
    rowFx[varIdx0] = signs[0];
    rowFx[varIdx1] = signs[1];
    A.push(rowFx);
    b.push(-extFx);

    // Equation 2: sum Fy = 0
    const rowFy = new Array(numVars).fill(0);
    rowFy[varIdx0 + 1] = signs[0];
    rowFy[varIdx1 + 1] = signs[1];
    A.push(rowFy);
    b.push(-extFy);

    // Equation 3: sum Moment about p0 = 0
    // r01 x (sign1 * F1) + r0_load x extLoad + torque = 0
    const r01 = V.sub(p1, p0);
    const rowM = new Array(numVars).fill(0);
    // Moment of F1 about p0: r01.x * F1y - r01.y * F1x
    rowM[varIdx1] = -r01.y * signs[1];     // coefficient of F1x
    rowM[varIdx1 + 1] = r01.x * signs[1];  // coefficient of F1y

    // Moment of external loads about p0
    let extMoment = 0;
    for (let ji = 0; ji < 2; ji++) {
      const load = loadAtJoint.get(link.jointIds[ji]);
      if (load) {
        const first = jointToFirstLink.get(link.jointIds[ji])!;
        if (first.linkIdx === li) {
          const pj = ji === 0 ? p0 : p1;
          const r = V.sub(pj, p0);
          extMoment += r.x * load.y - r.y * load.x;
        }
      }
    }

    // Input torque on crank
    if (link === crankLink) {
      rowM[torqueVarIdx] = 1;
    }

    A.push(rowM);
    b.push(-extMoment);
  }

  // Solve the system
  if (numEqs < numVars) {
    // Underdetermined — return zero forces
    return { jointForces, linkForces, inputTorque: 0 };
  }

  // Use the first numVars equations (should be exactly right for 4-bar: 9 eq, 9 var)
  const eqs = Math.min(numEqs, numVars);
  const solution = solveLinearSystem(
    A.slice(0, eqs).map((r) => r.slice(0, numVars)),
    b.slice(0, eqs)
  );

  if (!solution) {
    return { jointForces, linkForces, inputTorque: 0 };
  }

  // Extract joint forces (sum of forces acting at each joint across all links)
  const jointForceSums = new Map<string, Vec2>();
  for (let li = 0; li < numLinks; li++) {
    const link = movingLinks[li];
    for (let ji = 0; ji < 2; ji++) {
      const jointId = link.jointIds[ji];
      const varIdx = varMap.get(`${li}_${ji}`)!;
      const first = jointToFirstLink.get(jointId)!;
      const sign = first.linkIdx === li ? 1 : -1;

      const fx = solution[varIdx] * sign;
      const fy = solution[varIdx + 1] * sign;

      // For display, show the reaction force at each joint
      if (!jointForceSums.has(jointId)) {
        jointForceSums.set(jointId, { x: fx, y: fy });
      }
    }
  }

  // Set joint forces for output
  for (const [id, force] of jointForceSums) {
    jointForces.set(id, force);
  }

  // Link forces
  for (let li = 0; li < numLinks; li++) {
    const link = movingLinks[li];
    const varIdx0 = varMap.get(`${li}_0`)!;
    const varIdx1 = varMap.get(`${li}_1`)!;
    const first0 = jointToFirstLink.get(link.jointIds[0])!;
    const first1 = jointToFirstLink.get(link.jointIds[1])!;
    const sign0 = first0.linkIdx === li ? 1 : -1;
    const sign1 = first1.linkIdx === li ? 1 : -1;

    linkForces.set(link.id, {
      start: { x: solution[varIdx0] * sign0, y: solution[varIdx0 + 1] * sign0 },
      end: { x: solution[varIdx1] * sign1, y: solution[varIdx1 + 1] * sign1 },
    });
  }

  return {
    jointForces,
    linkForces,
    inputTorque: solution[torqueVarIdx],
  };
}
