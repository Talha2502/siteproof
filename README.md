# SiteProof

Offline-first field reporting app (React Native + TypeScript). An inspector files a short description and 1–5 photos; every report reaches the server exactly once, even over 2G, dropped connections and force-quits.

Repository layout:

- `server/` — Express backend with resumable uploads and on-demand fault injection
- `app/` — React Native CLI app (Android first, iOS supported)

Full setup, failure testing and design decisions to follow.

## App

React Native CLI (no Expo), TypeScript, Android first.

What you need: Node 22.13+ (or 24.3+), JDK 17, and the Android SDK with `ANDROID_HOME` set (or `sdk.dir` in `app/android/local.properties`).

```sh
cd app
npm install
npm start              # Metro bundler, keep it running
npm run android        # build, install and launch on an emulator or USB device
npm test               # Jest
npm run typecheck
npm run lint
```

### Architecture: core and adapters

```
app/src/
  core/       the delivery engine: queue, state machine, retry policy, upload algorithm
  adapters/   implement core's ports with native libraries (SQLite, files, network, HTTP)
  ui/         screens; they only display the engine's state
  app/        wiring: builds the engine with the real adapters
```

`core/` is plain TypeScript that never touches React Native. That's what lets the whole upload path be tested with Jest, with fake networks that drop, hang and lose responses. The boundary is enforced, not just a convention. ESLint fails if any file in `core/` imports a package (`react-native`, a native module, anything) or reaches into `adapters/`, `ui/` or `app/`. `core/` can only import its own files.

### Adapters

| Port | Implementation | Why |
|---|---|---|
| Report storage | SQLite via `@op-engineering/op-sqlite` | Real transactions: a report and its photos are saved together or not at all. WAL mode with `synchronous = FULL`, so "Saved on this phone" survives a power cut, not just a crash. Every write runs in its own transaction, so one can never be rolled back with another. |
| Photo files | `@dr.pogodin/react-native-fs` | Reads any byte range straight into an `ArrayBuffer` for each 256 KB piece. Photos live at `<Documents>/reports/<reportId>/<imageId>.jpg`, one folder per report, so deleting a report is one call. |
| HTTP | Built-in `XMLHttpRequest` | React Native's `fetch` has no upload progress, and progress is what tells the stall timeout a slow upload is still alive. No library needed. |
| Network status | `@react-native-community/netinfo` | Uses "is there a network link" (`isConnected`), not "can we reach the internet" (`isInternetReachable`). The latter checks a public website, so on a test Wi-Fi with no internet it would wrongly say offline even though the server is right there. |
| IDs | `react-native-get-random-values` | Report and photo IDs are the keys that stop duplicates, so they come from a secure random source. Hermes doesn't provide one by itself. |

These were checked on an Android emulator against the real server with uploads throttled to 2G speeds, 30% of upload requests cut off mid-body, and the app force-stopped partway through. Result: exactly one report on the server, both photos byte-for-byte identical, and no local files left behind.

### How a report gets delivered

1. **Submit** saves the report and its photo list in one database transaction. Only then does the app say "Saved on this phone".
2. **Reports go one at a time, oldest first.** If the oldest one is waiting to retry, the newer ones wait behind it. They arrive on the server in the order they were filed, and since a failing link usually affects every report, there's little to gain by letting newer reports jump ahead. A report that needs attention steps aside so the rest can go.
3. **For each photo, the app first asks the server how much it already has** (`HEAD`), creates the upload if it doesn't exist, then sends the rest in 256 KB pieces. After each piece the server confirms, the new offset is saved to the database.
4. **When every photo is complete, it sends the report** (`PUT /reports/:id`). A `201` (stored now) or `200` (it was already there, our earlier reply got lost) both mean delivered. The local photos are then deleted, since the server has them.

**Surviving a force-quit:** nothing is trusted from memory. On launch, any report that was mid-upload goes back in the queue, and the first `HEAD` tells the app exactly where to continue. A piece the server already received is never sent twice.

**Stall timeout, not total timeout:** a request is abandoned only after 30 seconds with no progress (no bytes moving, no reply). A 2G upload can take many minutes and is never cut off while it's still moving.

**Offline:** the app doesn't burn through retries while there's no network. It waits, and tries again the moment the connection comes back, or when the app returns to the foreground or a new report is submitted.

All of this is tested with Jest against a fake server that follows the real server's rules and can be told to drop a connection halfway through a piece, hang, lose a response after doing the work, or answer with any status. The tests include a simulated force-quit: the engine is thrown away mid-upload and a new one is started from the saved data.

### When the app retries and when it stops

Every failure falls into one of two classes:

| Failure | Class | What the app does |
|---|---|---|
| No connection, DNS failure, connection reset, stalled transfer | transient | Waits, then tries again |
| 408, 425, 429, 500, 502, 503, 504, other 5xx | transient | Waits (as long as `Retry-After` says, if the server sent it), then tries again |
| 409 while uploading a photo | transient | Asks the server how much it has, then continues |
| 404 or 410 on a photo upload | transient | The upload is gone from the server; starts that photo again from zero |
| 400, 401, 403, 413, 415, 422, other 4xx | permanent | Stops and shows "Not sent · reason" |
| 409 on the report | permanent | Stops: a different report with this ID is on the server, which would be a bug |

- **Transient failures are retried forever.** There's no attempt limit, because giving up would lose the report. The wait doubles from 1 s up to a 60 s cap. Each wait is a random amount up to that limit ("full jitter"), so a fleet of phones coming back online don't all retry at the same moment.
- **The user never sees transient failures as errors.** The report just shows "retrying in 20 s".
- **Every retry starts by asking the server how much of each photo it already has** (`HEAD`). That one rule covers resuming after a drop, recovering from a 409, and recreating an expired upload, so the retry rules themselves stay small.

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
