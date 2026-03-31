import type { Linkage, Joint, Link, ExternalLoad, Vec2 } from '../types';

export function createLinkage(
  joints: Joint[],
  links: Link[],
  crankPivotId: string,
  inputJointId: string,
  crankLength: number,
  loads: ExternalLoad[] = []
): Linkage {
  return {
    joints,
    links,
    crankPivotId,
    inputJointId,
    crankLength,
    inputAngle: 0,
    loads,
  };
}

export function createJoint(
  id: string,
  x: number,
  y: number,
  isGround: boolean = false,
  isInput: boolean = false
): Joint {
  return { id, position: { x, y }, isGround, isInput };
}

export function createLink(
  id: string,
  joint1: string,
  joint2: string,
  length: number
): Link {
  return { id, jointIds: [joint1, joint2], length };
}

export function updateJointPosition(
  linkage: Linkage,
  jointId: string,
  pos: Vec2
): void {
  const joint = linkage.joints.find((j) => j.id === jointId);
  if (joint) {
    joint.position = { ...pos };
  }
}

export function setLoad(
  linkage: Linkage,
  jointId: string,
  force: Vec2
): void {
  const existing = linkage.loads.find((l) => l.jointId === jointId);
  if (existing) {
    existing.force = { ...force };
  } else {
    linkage.loads.push({ jointId, force: { ...force } });
  }
}

export function getLinkLength(linkage: Linkage, linkId: string): number {
  const link = linkage.links.find((l) => l.id === linkId);
  return link ? link.length : 0;
}

export function getJointById(linkage: Linkage, id: string): Joint | undefined {
  return linkage.joints.find((j) => j.id === id);
}
