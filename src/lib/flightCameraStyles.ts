export type FlightCameraStyle = 'balanced' | 'chase' | 'orbit' | 'cinematic';

export const FLIGHT_CAMERA_STYLES: ReadonlyArray<readonly [FlightCameraStyle, string]> = [
  ['balanced', 'Balanced framing'], ['chase', 'Chase flight'],
  ['orbit', 'Orbital camera'], ['cinematic', 'Cinematic sweep'],
];

export function normalizeFlightCameraStyle(value: unknown): FlightCameraStyle {
  return FLIGHT_CAMERA_STYLES.some(([id]) => id === value) ? value as FlightCameraStyle : 'balanced';
}

export function normalizeFlightCameraEnergy(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(2, value)) : 1;
}
