// Installs crypto.getRandomValues (Hermes has no Web Crypto). Must run before newId().
import 'react-native-get-random-values';
import type { Clock, IdGenerator } from '../core/ports';

interface RandomSource {
  getRandomValues<T extends Uint8Array>(array: T): T;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => {
    const handle = setTimeout(callback, ms);
    return () => clearTimeout(handle);
  },
};

/** Random (v4) UUIDs from a cryptographically secure source: they are idempotency keys. */
export const uuidGenerator: IdGenerator = {
  newId: () => {
    const { crypto } = globalThis as unknown as { crypto: RandomSource };
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    /* eslint-disable no-bitwise -- setting the UUID version and variant bits */
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // version 4
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // RFC 4122 variant
    /* eslint-enable no-bitwise */
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(
      '',
    );
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
      12,
      16,
    )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  },
};
