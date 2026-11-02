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

### Photos upload resumably (tus)

Photos are sent with the [tus](https://tus.io) protocol at `/uploads`, in 256 KB pieces. If the connection drops, the app asks the server how much arrived (`HEAD`) and continues from there, so a 2G upload never starts over.

- **The app chooses each upload's ID**, the photo's UUID sent as `uploadId` metadata. Every retry therefore addresses the same upload.
- **A repeated "create" can never wipe a photo.** By default the file store empties the file on every `POST`. SiteProof refuses a `POST` for an ID that already exists with `409`, and the app responds by checking the offset and resuming. tus holds a per-upload lock around creation, so two duplicate `POST`s cannot race each other.
- **Only JPEGs of 5 MB or less** are accepted (`415` for other types, `413` when too large). A report is accepted only once every one of its photos is fully uploaded and its bytes really start with a JPEG signature. Otherwise the server answers `422` with `image_missing`, `image_incomplete`, `image_not_jpeg` or `image_too_large`.
- `GET /files/:imageId` serves a completed photo as `image/jpeg`.

### Making the server fail on purpose

Faults can be switched on and off while the server is running, with no restart. `/admin` and `/health` are never faulted, so you can always switch faults back off.

```sh
npm run fault -- error503 reports        # every PUT /reports answers 503 (with Retry-After: 5)
npm run fault -- drop uploads 0.5        # half of all upload requests lose their connection mid-body
npm run fault -- hang                    # accept requests and never answer
npm run fault -- none --bps 3000         # no errors, but uploads crawl at ~3 KB/s (2G)
npm run fault -- status                  # show the current setting
npm run fault -- none                    # back to normal
```

| Mode | What happens | Should the app retry? |
|---|---|---|
| `error500`, `error503` | Server error response | Yes (503 says when) |
| `reject400`, `reject413` | The request is refused | No, it's marked "Not sent" |
| `hang` | Never answers | Yes, after the 30 s stall timeout |
| `drop` | Cuts the connection about halfway through the body, so an upload keeps a partial file | Yes, resuming from the server's offset |

- **Target:** `all`, `uploads` or `reports`.
- **Probability:** 0–1, how often the fault happens.
- **`--latency <ms>`:** adds a delay before every matching request.
- **`--bps <bytes/s>`:** throttles request bodies. The throttle really holds back reading, so the phone sees a slow link, not a fast one followed by a long wait.

The same commands with `curl`:

```sh
curl -X PUT localhost:3000/admin/faults -H 'content-type: application/json' \
  -d '{"mode":"drop","target":"uploads","probability":0.5,"latencyMs":0,"bytesPerSecond":3000}'
curl localhost:3000/admin/faults            # current config
curl -X DELETE localhost:3000/admin/faults  # back to normal
curl -X POST localhost:3000/admin/reset     # delete every report and upload on the server
```

`PUT` replaces the whole configuration: any field you leave out goes back to its default. To point the script at another machine, set `SITEPROOF_URL=http://192.168.1.20:3000`.
