import type { Linkage, FullState } from '../types';
import * as V from '../math/vec2';

export interface MaterialProperties {
  name: string;
  yieldStrength: number; // MPa
  tensileStrength: number; // MPa
  elasticModulus: number; // GPa
  density: number; // kg/m³
}

export const MATERIALS: Record<string, MaterialProperties> = {
  steel: { name: 'Steel (A36)', yieldStrength: 250, tensileStrength: 400, elasticModulus: 200, density: 7850 },
  aluminum: { name: 'Aluminum (6061-T6)', yieldStrength: 276, tensileStrength: 310, elasticModulus: 68.9, density: 2700 },
  stainless: { name: 'Stainless (304)', yieldStrength: 215, tensileStrength: 505, elasticModulus: 193, density: 8000 },
  titanium: { name: 'Titanium (Ti-6Al-4V)', yieldStrength: 880, tensileStrength: 950, elasticModulus: 113.8, density: 4430 },
};

export interface CrossSectionProps {
  area: number; // mm²
  momentOfInertia: number; // mm⁴
  sectionModulus: number; // mm³
}

export function getCrossSection(type: string, size: number): CrossSectionProps {
  const r = size / 2;
  switch (type) {
    case 'round_solid':
      return {
        area: Math.PI * r * r,
        momentOfInertia: (Math.PI * r * r * r * r) / 4,
        sectionModulus: (Math.PI * r * r * r) / 4,
      };
    case 'round_tube': {
      const t = Math.max(size * 0.1, 1); // wall thickness = 10% of diameter
      const ro = r, ri = r - t;
      return {
        area: Math.PI * (ro * ro - ri * ri),
        momentOfInertia: (Math.PI / 4) * (ro ** 4 - ri ** 4),
        sectionModulus: (Math.PI / (4 * ro)) * (ro ** 4 - ri ** 4),
      };
    }
    case 'square_solid':
      return {
        area: size * size,
        momentOfInertia: (size ** 4) / 12,
        sectionModulus: (size ** 3) / 6,
      };
    case 'flat_bar': {
      const width = size;
      const thickness = Math.max(size * 0.25, 2);
      return {
        area: width * thickness,
        momentOfInertia: (width * thickness ** 3) / 12,
        sectionModulus: (width * thickness ** 2) / 6,
      };
    }
    default:
      return { area: Math.PI * r * r, momentOfInertia: (Math.PI * r ** 4) / 4, sectionModulus: (Math.PI * r ** 3) / 4 };
  }
}

export interface StressResult {
  linkId: string;
  axialForce: number; // N
  axialStress: number; // MPa
  bendingStress: number; // MPa (estimated)
  combinedStress: number; // MPa
  safetyFactor: number;
  status: 'safe' | 'warning' | 'danger';
}

export function computeStress(
  linkage: Linkage,
  state: FullState,
  material: string,
  crossSection: string,
  sectionSize: number
): StressResult[] {
  const mat = MATERIALS[material] || MATERIALS.steel;
  const cs = getCrossSection(crossSection, sectionSize);
  const results: StressResult[] = [];

  for (const link of linkage.links) {
    const p1 = state.positions.get(link.jointIds[0]);
    const p2 = state.positions.get(link.jointIds[1]);
    const f1 = state.forces?.jointForces.get(link.jointIds[0]);

    let axialForce = 0;
    if (p1 && p2 && f1) {
      const dir = V.normalize(V.sub(p2, p1));
      axialForce = V.dot(f1, dir);
    }

    // Transverse force (for bending estimate)
    let transverseForce = 0;
    if (p1 && p2 && f1) {
      const dir = V.normalize(V.sub(p2, p1));
      const perp = { x: -dir.y, y: dir.x };
      transverseForce = Math.abs(V.dot(f1, perp));
    }

    const axialStress = Math.abs(axialForce) / cs.area; // N/mm² = MPa
    // Bending: approximate as simply-supported beam with transverse force at midpoint
    const linkLengthMm = link.length * 1000; // world units (m) to mm
    const bendingMoment = (transverseForce * linkLengthMm) / 4; // N·mm
    const bendingStress = bendingMoment / cs.sectionModulus;
    const combinedStress = axialStress + bendingStress; // simplified (von Mises would be better)

    const safetyFactor = combinedStress > 0 ? mat.yieldStrength / combinedStress : 999;

    results.push({
      linkId: link.id,
      axialForce,
      axialStress,
      bendingStress,
      combinedStress,
      safetyFactor,
      status: safetyFactor >= 3 ? 'safe' : safetyFactor >= 1.5 ? 'warning' : 'danger',
    });
  }

  return results;
}
