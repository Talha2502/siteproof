import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpError } from '../errors';
import { DEFAULT_FAULTS, FaultState, parseFaultConfig } from './config';

function rejects400(body: unknown): void {
  assert.throws(() => parseFaultConfig(body), (err: unknown) => err instanceof HttpError && err.status === 400);
}

describe('parseFaultConfig', () => {
  it('fills omitted fields with defaults (PUT replaces the whole config)', () => {
    assert.deepEqual(parseFaultConfig({ mode: 'hang' }), { ...DEFAULT_FAULTS, mode: 'hang' });
    assert.deepEqual(parseFaultConfig({}), DEFAULT_FAULTS);
  });

  it('keeps every valid field', () => {
    const config = { mode: 'drop', target: 'uploads', latencyMs: 250, probability: 0.5, bytesPerSecond: 4000 };
    assert.deepEqual(parseFaultConfig(config), config);
  });

  it('rejects unknown modes and targets', () => {
    rejects400({ mode: 'explode' });
    rejects400({ target: 'files' });
  });

  it('rejects out-of-range numbers', () => {
    rejects400({ probability: 1.5 });
    rejects400({ probability: '0.5' });
    rejects400({ latencyMs: -1 });
    rejects400({ bytesPerSecond: 0 });
  });

  it('rejects a non-object body', () => {
    for (const body of [null, 'hang', ['hang']]) rejects400(body);
  });
});

describe('FaultState', () => {
  it('sets and resets, and never leaks its internal object', () => {
    const state = new FaultState();
    state.set({ ...DEFAULT_FAULTS, mode: 'error500' });
    state.get().mode = 'none';
    assert.equal(state.get().mode, 'error500');
    state.reset();
    assert.deepEqual(state.get(), DEFAULT_FAULTS);
  });
});
