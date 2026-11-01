# SiteProof

Offline-first field reporting app (React Native + TypeScript). An inspector files a short description and 1–5 photos; every report reaches the server exactly once, even over 2G, dropped connections and force-quits.

Repository layout:

- `server/` — Express backend with resumable uploads and on-demand fault injection
- `app/` — React Native CLI app (Android first, iOS supported)

Full setup, failure testing and design decisions to follow.
