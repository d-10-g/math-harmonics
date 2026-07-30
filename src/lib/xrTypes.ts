import type React from 'react';
import { FormulaGeometryMode } from '../constants';

// Shared between GraphView (scene + gestures) and SpatialConsole (in-XR UI).

export const GEOMETRY_MODES: FormulaGeometryMode[] = [
  'tube',
  'ribbon',
  'surface',
  'lathe',
  'crystal',
  'extrude',
  'helix',
  'shell',
  'terrain',
  'constellation',
  'knot',
  'mandala',
  'lattice',
  'ripple',
  'prism',
  'vortex'
];

export const DEFAULT_XR_VISUAL_TRANSFORM = {
  scale: 0.08,
  distance: 1.8,
  yaw: 0,
  pitch: 0,
  roll: 0,
  autoRotate: true
};

export type XRVisualTransform = typeof DEFAULT_XR_VISUAL_TRANSFORM;
export type XRVisualTransformSetter = React.Dispatch<React.SetStateAction<XRVisualTransform>>;
export type GraphGeometrySelection = FormulaGeometryMode | 'formula';
export type GraphGeometrySelectionSetter = React.Dispatch<React.SetStateAction<GraphGeometrySelection>>;

export const XR_VISUAL_SCALE_MIN = 0.02;
export const XR_VISUAL_SCALE_MAX = 0.24;
export const XR_VISUAL_DISTANCE_MIN = 0.9;
export const XR_VISUAL_DISTANCE_MAX = 3.4;
