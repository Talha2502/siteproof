# SiteProof

Offline-first field reporting app (React Native + TypeScript). An inspector files a short description and 1–5 photos; every report reaches the server exactly once, even over 2G, dropped connections and force-quits.

Repository layout:

- `server/` — Express backend with resumable uploads and on-demand fault injection
- `app/` — React Native CLI app (Android first, iOS supported)

Full setup, failure testing and design decisions to follow.

## Server

```sh
cd server
npm install
npm run dev        # http://localhost:3000, and prints the LAN URL for a phone
npm test           # node:test via tsx
npm run typecheck
```

Data is stored in `server/data/` (gitignored). Set `SITEPROOF_DATA_DIR` to use another location.

### Reports are idempotent by client ID

The app generates the report's UUID when the user taps Submit and sends it as `PUT /reports/:id`. The server never generates the ID, so retrying a request can never create a second report:

| Request | Response |
|---|---|
| New ID | `201` with the stored report |
| Same ID, identical content (the retry after a lost response) | `200` with the *original* stored report |
| Same ID, different content | `409`, permanent: this is a client bug and must not be retried |
| Malformed ID or body | `400` `{ error: { code, message } }` |

Example:

```sh
B='{"description":"Cracked lintel","createdAt":"2026-11-03T09:15:00.000Z","imageIds":["6f1c2a8e-1d3b-4c5e-9f00-112233445566"]}'
ID=0b6a7c1e-5f2d-4e3a-9b8c-0123456789ab
curl -i -X PUT -H 'content-type: application/json' -d "$B" localhost:3000/reports/$ID   # 201
curl -i -X PUT -H 'content-type: application/json' -d "$B" localhost:3000/reports/$ID   # 200, same receivedAt
curl -s localhost:3000/reports                                                          # one report
```

Each report is stored as a single JSON file. Writes go to a temp file that is fsynced and then renamed into place, so a crash leaves either no file or a complete one. PUTs for the same ID are serialised by an in-process lock, so two simultaneous first attempts produce exactly one `201`. IDs must be UUIDs, which blocks path traversal, and are lowercased so that case differences cannot split one report into two.
