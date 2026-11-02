/**
 * Change the running server's fault injection from the command line.
 *
 *   npm run fault -- <mode> [target] [probability] [--latency <ms>] [--bps <bytes/s>]
 *   npm run fault -- none       reset to normal
 *   npm run fault -- status     show the current config
 *
 * Talks to SITEPROOF_URL (default http://localhost:3000).
 */
import { FAULT_MODES, FAULT_TARGETS } from '../src/faults/config';

const BASE = process.env.SITEPROOF_URL ?? 'http://localhost:3000';
const USAGE = `usage: npm run fault -- <${FAULT_MODES.join('|')}|status> [${FAULT_TARGETS.join('|')}] [probability 0..1] [--latency <ms>] [--bps <bytes/s>]`;

function fail(message: string): never {
  console.error(message);
  console.error(USAGE);
  process.exit(1);
}

function parseArgs(argv: string[]): { command: string; body: Record<string, unknown> } {
  const positional: string[] = [];
  const body: Record<string, unknown> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--latency' || arg === '--bps') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value)) fail(`${arg} needs a number`);
      body[arg === '--latency' ? 'latencyMs' : 'bytesPerSecond'] = value;
    } else if (arg !== undefined) {
      positional.push(arg);
    }
  }
  const [command, target, probability] = positional;
  if (!command) fail('missing mode');
  body.mode = command;
  if (target !== undefined) body.target = target;
  if (probability !== undefined) body.probability = Number(probability);
  return { command, body };
}

async function main(): Promise<void> {
  const { command, body } = parseArgs(process.argv.slice(2));
  const url = `${BASE}/admin/faults`;

  let res: Response;
  if (command === 'status') {
    res = await fetch(url);
  } else if (command === 'none' && Object.keys(body).length === 1) {
    res = await fetch(url, { method: 'DELETE' });
  } else {
    res = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  }

  const text = await res.text();
  if (!res.ok) fail(`server answered ${res.status}: ${text}`);
  console.log(text);
}

main().catch((err: unknown) => fail(`could not reach ${BASE}: ${err instanceof Error ? err.message : String(err)}`));
