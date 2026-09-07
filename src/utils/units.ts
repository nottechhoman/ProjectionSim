import type { DisplayUnit } from '../types';

export function fromDisplayUnit(value: number, unit: DisplayUnit): number {
  switch (unit) {
    case 'm': return value;
    case 'cm': return value / 100;
    case 'mm': return value / 1000;
  }
}

export function toDisplayUnit(valueM: number, unit: DisplayUnit): number {
  switch (unit) {
    case 'm': return valueM;
    case 'cm': return valueM * 100;
    case 'mm': return valueM * 1000;
  }
}

export function formatLength(valueM: number, unit: DisplayUnit, digits = 3): string {
  return `${toDisplayUnit(valueM, unit).toFixed(digits)} ${unit}`;
}
