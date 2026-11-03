// Read-only calls for the "On server" tab and Settings. Unlike uploads these
// are short, so a total timeout is right here.

export interface ServerReport {
  id: string;
  description: string;
  createdAt: string;
  receivedAt: string;
  /** Absolute URLs of the report's photos, in display order. */
  photoUrls: string[];
}

const TIMEOUT_MS = 15_000;

export class ServerUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServerUnavailable';
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new ServerUnavailable("Can't reach the server");
  } finally {
    clearTimeout(timer);
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function parseReport(
  value: unknown,
  baseUrl: string,
): ServerReport | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const r = value as Record<string, unknown>;
  const { id, description, createdAt, receivedAt, imageUrls } = r;
  if (
    !isString(id) ||
    !isString(description) ||
    !isString(createdAt) ||
    !isString(receivedAt)
  ) {
    return undefined;
  }
  if (!Array.isArray(imageUrls) || !imageUrls.every(isString)) return undefined;
  return {
    id,
    description,
    createdAt,
    receivedAt,
    photoUrls: imageUrls.map(path => `${baseUrl}${path}`),
  };
}

/** Everything the server holds, newest first. Throws ServerUnavailable if it can't be read. */
export async function fetchServerReports(
  baseUrl: string,
): Promise<ServerReport[]> {
  const res = await fetchWithTimeout(`${baseUrl}/reports`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok)
    throw new ServerUnavailable(
      `The server answered with an error (HTTP ${res.status})`,
    );
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ServerUnavailable("The server's answer wasn't readable");
  }
  if (!Array.isArray(body))
    throw new ServerUnavailable("The server's answer wasn't readable");
  return body
    .map(item => parseReport(item, baseUrl))
    .filter((report): report is ServerReport => report !== undefined);
}

/** For Settings → Test connection. Resolves to undefined when healthy, else a reason. */
export async function checkServer(
  baseUrl: string,
): Promise<string | undefined> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/health`, {}, 6000);
    if (!res.ok)
      return `The server answered with an error (HTTP ${res.status})`;
    const body: unknown = await res.json().catch(() => undefined);
    const ok =
      typeof body === 'object' &&
      body !== null &&
      (body as Record<string, unknown>).ok === true;
    return ok
      ? undefined
      : "That address answered, but it isn't a SiteProof server";
  } catch (err) {
    return err instanceof Error ? err.message : "Can't reach the server";
  }
}

/** Size in bytes of a stored photo, from its Content-Length, if the server says. */
export async function photoSize(url: string): Promise<number | undefined> {
  try {
    const res = await fetchWithTimeout(url, { method: 'HEAD' }, 8000);
    const length = Number(res.headers.get('content-length'));
    return res.ok && Number.isFinite(length) && length > 0 ? length : undefined;
  } catch {
    return undefined;
  }
}
