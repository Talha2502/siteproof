import { TransportFailure } from '../core/ports';
import { asciiToBase64, XhrTransport } from './xhrTransport';

type Handler = ((event: { loaded: number }) => void) | null;

/** Records what the transport does and lets the test decide how the request ends. */
class FakeXhr {
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: unknown;
  status = 0;
  timeout = -1;
  responseHeaders: Record<string, string> = {};
  aborted = false;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  upload: { onprogress: Handler } = { onprogress: null };

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  getResponseHeader(name: string): string | null {
    const key = Object.keys(this.responseHeaders).find(
      k => k.toLowerCase() === name.toLowerCase(),
    );
    return key === undefined ? null : this.responseHeaders[key] ?? null;
  }
  send(body: unknown) {
    this.body = body;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  respond(status: number, headers: Record<string, string> = {}) {
    this.status = status;
    this.responseHeaders = headers;
    this.onload?.();
  }
}

function setup(baseUrl = 'http://192.168.1.20:3000/') {
  const xhrs: FakeXhr[] = [];
  const transport = new XhrTransport({
    baseUrl: () => baseUrl,
    createXhr: () => {
      const xhr = new FakeXhr();
      xhrs.push(xhr);
      return xhr as unknown as XMLHttpRequest;
    },
  });
  const last = () => {
    const xhr = xhrs.at(-1);
    if (!xhr) throw new Error('No request made');
    return xhr;
  };
  return { transport, last };
}

const signal = () => new AbortController().signal;

describe('asciiToBase64', () => {
  it.each([
    ['', ''],
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['image/jpeg', 'aW1hZ2UvanBlZw=='],
    [
      '6f1c2a8e-1d3b-4c5e-9f00-112233445566',
      'NmYxYzJhOGUtMWQzYi00YzVlLTlmMDAtMTEyMjMzNDQ1NTY2',
    ],
  ])('encodes %j', (input, expected) => {
    expect(asciiToBase64(input)).toBe(expected);
  });
});

describe('XhrTransport', () => {
  it('HEAD: asks for the offset without caching and parses it', async () => {
    const { transport, last } = setup();
    const result = transport.headUpload('img-1', signal());
    expect(last().method).toBe('HEAD');
    expect(last().url).toBe('http://192.168.1.20:3000/uploads/img-1');
    expect(last().headers).toMatchObject({
      'Tus-Resumable': '1.0.0',
      'Cache-Control': 'no-store',
    });
    expect(last().timeout).toBe(0);
    last().respond(200, { 'upload-offset': '524288' });
    await expect(result).resolves.toEqual({
      status: 200,
      offset: 524288,
      retryAfter: undefined,
      location: undefined,
    });
  });

  it('POST: sends length and base64 metadata, returns Location', async () => {
    const { transport, last } = setup();
    const result = transport.createUpload(
      { imageId: 'img-1', reportId: 'rep-1', sizeBytes: 1234 },
      signal(),
    );
    expect(last().url).toBe('http://192.168.1.20:3000/uploads');
    expect(last().headers).toMatchObject({
      'Upload-Length': '1234',
      'Upload-Metadata': `uploadId ${asciiToBase64(
        'img-1',
      )},reportId ${asciiToBase64('rep-1')},filetype ${asciiToBase64(
        'image/jpeg',
      )}`,
    });
    last().respond(201, { Location: '/uploads/img-1' });
    await expect(result).resolves.toMatchObject({
      status: 201,
      location: '/uploads/img-1',
    });
  });

  it('PATCH: sends the bytes at the offset and reports upload progress', async () => {
    const { transport, last } = setup();
    const progress: number[] = [];
    const chunk = new Uint8Array([1, 2, 3]);
    const result = transport.patchUpload(
      {
        imageId: 'img-1',
        offset: 262144,
        chunk,
        onProgress: n => progress.push(n),
      },
      signal(),
    );
    expect(last().method).toBe('PATCH');
    expect(last().headers).toMatchObject({
      'Upload-Offset': '262144',
      'Content-Type': 'application/offset+octet-stream',
    });
    expect(last().body).toBe(chunk);
    last().upload.onprogress?.({ loaded: 2 });
    last().respond(204, { 'Upload-Offset': '262147' });
    await expect(result).resolves.toMatchObject({
      status: 204,
      offset: 262147,
    });
    expect(progress).toEqual([2]);
  });

  it('PUT: sends the report as JSON and passes any status through with Retry-After', async () => {
    const { transport, last } = setup();
    const result = transport.putReport(
      {
        id: 'rep-1',
        description: 'Crack',
        createdAt: '2026-11-03T09:00:00.000Z',
        imageIds: ['a', 'b'],
      },
      signal(),
    );
    expect(last().url).toBe('http://192.168.1.20:3000/reports/rep-1');
    expect(JSON.parse(String(last().body))).toEqual({
      description: 'Crack',
      createdAt: '2026-11-03T09:00:00.000Z',
      imageIds: ['a', 'b'],
    });
    last().respond(503, { 'Retry-After': '5' });
    await expect(result).resolves.toEqual({ status: 503, retryAfter: '5' });
  });

  it('rejects with TransportFailure when no response arrives', async () => {
    const { transport, last } = setup();
    const errored = transport.headUpload('img-1', signal());
    last().onerror?.();
    await expect(errored).rejects.toBeInstanceOf(TransportFailure);

    const zero = transport.headUpload('img-1', signal());
    last().respond(0);
    await expect(zero).rejects.toBeInstanceOf(TransportFailure);
  });

  it('aborts the request when the signal fires', async () => {
    const { transport, last } = setup();
    const controller = new AbortController();
    const result = transport.headUpload('img-1', controller.signal);
    controller.abort();
    expect(last().aborted).toBe(true);
    await expect(result).rejects.toMatchObject({ aborted: true });
  });

  it('does not start a request whose signal is already aborted', async () => {
    const { transport } = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(
      transport.headUpload('img-1', controller.signal),
    ).rejects.toMatchObject({ aborted: true });
  });

  it('reads the base URL on every request, so a Settings change applies at once', async () => {
    let base = 'http://a:3000';
    const xhrs: FakeXhr[] = [];
    const transport = new XhrTransport({
      baseUrl: () => base,
      createXhr: () => {
        const xhr = new FakeXhr();
        xhrs.push(xhr);
        return xhr as unknown as XMLHttpRequest;
      },
    });
    transport.headUpload('x', signal()).catch(() => {});
    base = 'http://b:3000';
    transport.headUpload('x', signal()).catch(() => {});
    expect(xhrs.map(x => x.url)).toEqual([
      'http://a:3000/uploads/x',
      'http://b:3000/uploads/x',
    ]);
  });
});
