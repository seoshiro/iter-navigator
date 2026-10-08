export type Evidence<T> =
  | { status: 'checked'; value: T; source: string; checkedOn: null }
  | { status: 'unknown'; value: null; source: string; checkedOn: null };
export type EdgeType = 'corridor' | 'door' | 'ramp' | 'lift' | 'stairs';
export type Surface = 'smooth' | 'rough';
export interface BuildingNode {
  id: string; label: string; floor: number; x: number; z: number;
  kind: 'entrance' | 'room' | 'junction' | 'lift' | 'stairs'; selectable: boolean;
}
export interface BuildingEdge {
  id: string; from: string; to: string; type: EdgeType; lengthM: number;
  widthM: Evidence<number>; slopePercent: Evidence<number>;
  surface: Evidence<Surface>; stepFree: Evidence<boolean>;
}
export interface Building {
  version: 1; fictional: true; source: string; surveyedOn: null; floorHeightM: number;
  floors: { id: number; label: string }[]; nodes: BuildingNode[]; edges: BuildingEdge[];
  closureGroups: { id: string; label: string; edgeIds: string[] }[];
}
export interface Requirements {
  avoidStairs: boolean; minWidthM: number; maxSlopePercent: number;
  smoothOnly: boolean; allowUnknown: boolean;
}
export interface Scenario {
  start: string; destination: string; requirements: Requirements;
  closedEdgeIds: string[]; floor: 'all' | number;
}
export type ExclusionReason = 'closed' | 'stairs' | 'step-free' | 'width' | 'slope' | 'surface'
  | 'unknown-step-free' | 'unknown-width' | 'unknown-slope' | 'unknown-surface';
export type RouteResult =
  | { status: 'ok'; nodeIds: string[]; edgeIds: string[]; distanceM: number; uncertainEdgeIds: string[] }
  | { status: 'no-route'; excluded: { edgeId: string; reasons: ExclusionReason[] }[] }
  | { status: 'invalid'; message: string };
export type Validation<T> = { valid: true; value: T } | { valid: false; message: string };
