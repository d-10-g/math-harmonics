export type FlightCastStyle = 'together' | 'ripple';

export const FLIGHT_CAST_STYLES: ReadonlyArray<readonly [FlightCastStyle, string]> = [
  ['ripple', 'Channel ripple'], ['together', 'Ensemble dissolve'],
];

export function normalizeFlightCastStyle(value: unknown): FlightCastStyle {
  return FLIGHT_CAST_STYLES.some(([id]) => id === value) ? value as FlightCastStyle : 'ripple';
}
