import type { Linkage } from '../types';
import { solveLinkage } from '../math/solver';
import { solveForces } from '../math/forces';
import * as V from '../math/vec2';

export function exportCSV(linkage: Linkage, steps: number = 360): void {
  const jointIds = linkage.joints.map((j) => j.id);

  // Build header
  const headers = ['angle_deg'];
  for (const id of jointIds) {
    headers.push(`${id}_x`, `${id}_y`, `${id}_Fx`, `${id}_Fy`, `${id}_F_mag`);
  }
  headers.push('input_torque_Nm');

  const rows: string[] = [headers.join(',')];

  const savedAngle = linkage.inputAngle;
  for (let i = 0; i <= steps; i++) {
    const angleDeg = (i * 360) / steps;
    const angleRad = (angleDeg * Math.PI) / 180;
    linkage.inputAngle = angleRad;

    const result = solveLinkage(linkage);
    if (!result.success) continue;

    // Update joint positions for force solver
    for (const joint of linkage.joints) {
      const pos = result.positions.get(joint.id);
      if (pos) joint.position = { ...pos };
    }

    const forces = solveForces(linkage, result.positions);

    const row: string[] = [angleDeg.toFixed(2)];

    for (const id of jointIds) {
      const pos = result.positions.get(id);
      const force = forces.jointForces.get(id);
      const x = pos?.x ?? 0;
      const y = pos?.y ?? 0;
      const fx = force?.x ?? 0;
      const fy = force?.y ?? 0;
      const fMag = V.length({ x: fx, y: fy });
      row.push(x.toFixed(6), y.toFixed(6), fx.toFixed(4), fy.toFixed(4), fMag.toFixed(4));
    }

    row.push(forces.inputTorque.toFixed(6));
    rows.push(row.join(','));

  }

  linkage.inputAngle = savedAngle;

  const csv = rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `linkage_analysis_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
