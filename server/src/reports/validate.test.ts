import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpError } from '../errors';
import { parseReportId, parseReportInput } from './validate';

const IMG_A = '6f1c2a8e-1d3b-4c5e-9f00-112233445566';
const IMG_B = '7a2d3b9f-2e4c-4d6f-8a11-223344556677';

const valid = {
  description: '  Cracked lintel above east door  ',
  createdAt: '2026-11-03T09:15:00.000Z',
  imageIds: [IMG_A, IMG_B],
};

function rejects400(fn: () => unknown): void {
  assert.throws(fn, (err: unknown) => err instanceof HttpError && err.status === 400);
}

describe('parseReportId', () => {
  it('accepts a UUID and lowercases it', () => {
    assert.equal(parseReportId(IMG_A.toUpperCase()), IMG_A);
  });

  it('rejects non-UUIDs, including path traversal attempts', () => {
    for (const id of ['', 'abc', '../../etc/passwd', `${IMG_A}/..`, `${IMG_A}.json`]) {
      rejects400(() => parseReportId(id));
    }
  });
});

describe('parseReportInput', () => {
  it('trims the description and keeps image order', () => {
    const input = parseReportInput(valid);
    assert.equal(input.description, 'Cracked lintel above east door');
    assert.deepEqual(input.imageIds, [IMG_A, IMG_B]);
  });

  it('drops unknown fields', () => {
    assert.deepEqual(Object.keys(parseReportInput({ ...valid, receivedAt: 'x', id: 'y' })).sort(), [
      'createdAt',
      'description',
      'imageIds',
    ]);
  });

  it('rejects a non-object body', () => {
    for (const body of [undefined, null, 'text', [valid]]) rejects400(() => parseReportInput(body));
  });

  it('rejects a blank or over-long description', () => {
    rejects400(() => parseReportInput({ ...valid, description: '   \n ' }));
    rejects400(() => parseReportInput({ ...valid, description: 'x'.repeat(1001) }));
    assert.doesNotThrow(() => parseReportInput({ ...valid, description: `  ${'x'.repeat(1000)}  ` }));
  });

  it('rejects createdAt that is not a full ISO date-time', () => {
    for (const createdAt of [undefined, 1730000000, '2026', 'Nov 3 2026', '2026-11-03', '2026-13-03T00:00:00Z']) {
      rejects400(() => parseReportInput({ ...valid, createdAt }));
    }
  });

  it('requires 1–5 unique UUID image IDs', () => {
    rejects400(() => parseReportInput({ ...valid, imageIds: [] }));
    rejects400(() => parseReportInput({ ...valid, imageIds: Array.from({ length: 6 }, () => IMG_A) }));
    rejects400(() => parseReportInput({ ...valid, imageIds: [IMG_A, 'nope'] }));
    rejects400(() => parseReportInput({ ...valid, imageIds: [IMG_A, IMG_A.toUpperCase()] }));
    rejects400(() => parseReportInput({ ...valid, imageIds: IMG_A }));
  });
});
