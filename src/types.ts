export interface Vec2 {
  x: number;
  y: number;
}

export interface Joint {
  id: string;
  position: Vec2;
  isGround: boolean;
  isInput: boolean;
}

export interface Link {
  id: string;
  jointIds: [string, string];
  length: number;
}

export interface ExternalLoad {
  jointId: string;
  force: Vec2;
}

export interface Linkage {
  joints: Joint[];
  links: Link[];
  inputJointId: string;
  crankPivotId: string;
  crankLength: number;
  inputAngle: number;
  loads: ExternalLoad[];
}

export interface SolverResult {
  positions: Map<string, Vec2>;
  success: boolean;
  error?: string;
}

export interface ForceResult {
  jointForces: Map<string, Vec2>;
  linkForces: Map<string, { start: Vec2; end: Vec2 }>;
  inputTorque: number;
}

export interface FullState {
  angle: number;
  positions: Map<string, Vec2>;
  velocities: Map<string, Vec2>;
  forces: ForceResult;
}
