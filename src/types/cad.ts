// CAD-related type definitions

export enum ViewMode {
  PERSPECTIVE = 'perspective',
  TOP = 'top',
  FRONT = 'front',
  RIGHT = 'right',
  ISOMETRIC = 'isometric',
  FOUR_VIEW = 'four_view',
}

export type Vector3 = {
  x: number;
  y: number;
  z: number;
};

export type Rotation = {
  x: number;
  y: number;
  z: number;
};

export type Scale = {
  x: number;
  y: number;
  z: number;
};

export type Transform = {
  position: Vector3;
  rotation: Rotation;
  scale: Scale;
};

export type CadOperation = {
  id: string;
  type: string;
  parameters: Record<string, any>;
  result?: any;
};

export type CadTool = {
  id: string;
  name: string;
  icon: string;
  tooltip: string;
  shortcut?: string;
  category: 'create' | 'modify' | 'measure' | 'view';
  options?: Record<string, any>;
};

export type CadMeasurement = {
  id: string;
  type: 'distance' | 'angle' | 'area' | 'volume';
  values: number[];
  points: Vector3[];
  displayUnit: string;
};

export type CadComponent = {
  id: string;
  name: string;
  geometry: any; // This would normally be a THREE.Geometry or similar
  transform: Transform;
  material?: any; // THREE.Material
  metadata?: Record<string, any>;
}; 