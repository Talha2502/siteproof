import { HttpError } from '../errors';

export const FAULT_MODES = ['none', 'error500', 'error503', 'reject400', 'reject413', 'hang', 'drop'] as const;
export const FAULT_TARGETS = ['all', 'uploads', 'reports'] as const;

export type FaultMode = (typeof FAULT_MODES)[number];
export type FaultTarget = (typeof FAULT_TARGETS)[number];

export interface FaultConfig {
  mode: FaultMode;
  target: FaultTarget;
  /** Added before handling every matching request, faulted or not. */
  latencyMs: number;
  /** 0..1, chance a matching request gets `mode`. */
  probability: number;
  /** Throttle for request bodies (simulates 2G). */
  bytesPerSecond?: number;
}

export const DEFAULT_FAULTS: FaultConfig = { mode: 'none', target: 'all', latencyMs: 0, probability: 1 };

function bad(message: string): HttpError {
  return new HttpError(400, 'invalid_fault_config', message);
}

function oneOf<T extends string>(value: unknown, options: readonly T[], field: string, fallback: T): T {
  if (value === undefined) return fallback;
  if (typeof value === 'string' && (options as readonly string[]).includes(value)) return value as T;
  throw bad(`${field} must be one of: ${options.join(', ')}`);
}

function numberIn(value: unknown, field: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw bad(`${field} must be a number from ${min} to ${max}`);
  }
  return value;
}

/** Parses a PUT /admin/faults body. It replaces the whole config: omitted fields get defaults. */
export function parseFaultConfig(body: unknown): FaultConfig {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw bad('Body must be a JSON object');
  const raw = body as Record<string, unknown>;

  const config: FaultConfig = {
    mode: oneOf(raw.mode, FAULT_MODES, 'mode', DEFAULT_FAULTS.mode),
    target: oneOf(raw.target, FAULT_TARGETS, 'target', DEFAULT_FAULTS.target),
    latencyMs: numberIn(raw.latencyMs, 'latencyMs', 0, 600_000) ?? DEFAULT_FAULTS.latencyMs,
    probability: numberIn(raw.probability, 'probability', 0, 1) ?? DEFAULT_FAULTS.probability,
  };
  const bytesPerSecond = numberIn(raw.bytesPerSecond, 'bytesPerSecond', 1, Number.MAX_SAFE_INTEGER);
  if (bytesPerSecond !== undefined) config.bytesPerSecond = bytesPerSecond;
  return config;
}

/** The live fault config. Held in memory so it changes at runtime without a restart. */
export class FaultState {
  private config: FaultConfig = { ...DEFAULT_FAULTS };

  get(): FaultConfig {
    return { ...this.config };
  }

  set(config: FaultConfig): void {
    this.config = { ...config };
  }

  reset(): void {
    this.config = { ...DEFAULT_FAULTS };
  }
}
