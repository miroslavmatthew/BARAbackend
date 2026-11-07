# Witness snapshots v1

Run API: `PORT=3001 npm run start:dev` (PowerShell: `$env:PORT='3001'; npm run start:dev`).
Run witness on port 3000. Set `NEXT_PUBLIC_WITNESS_API_URL` to the API base URL before starting/building the frontend. Default: http://localhost:3001. For a phone, use reachable trusted HTTPS URLs for both apps.

Set `WITNESS_ORIGINS` to comma-separated frontend origins; default http://localhost:3000.
Set `WITNESS_STORAGE_DIR` to a persistent storage directory; default data/witness relative to API working directory.

POST /witness/snapshots uses multipart/form-data:
- image: JPEG binary, at most 8 MiB.
- metadata: JSON string, at most 64 KiB. Required schemaVersion: 1, sessionId: string (letters, numbers, underscores and hyphens; 1–100 characters), sequence: positive integer, capturedAt: date-time string, frame: positive integer width and height.
- Metadata also includes the existing location, orientation, absoluteOrientation, camera, device, permissions and status objects. Sensor readings may be null and retain their own timestamps. Location is the observer location; rotation is raw device orientation. Client readings are unverified. Sensor-specific values are stored as supplied in this prototype.

201 receipt: { snapshotId, receivedAt, sessionId, sequence }. Each accepted request creates a directory containing image.jpg and metadata.json. Receipt follows successful storage. 400 means invalid/missing data; oversized uploads return 413. No retrieval endpoint is exposed.

Frontend starts immediately, then waits the chosen interval (default 5 seconds, range 1–300) after each attempt completes. One request at a time; timeout 20 seconds. Failed attempts are displayed and the next interval captures a fresh frame. No offline queue or replay. Stop, page hide, unmount and camera loss stop sending. Aborting a request does not undo a snapshot already stored by the backend. Sequence is per start session; requests are not deduplicated.

Prototype scope: no authentication, retention cleanup, or downstream processing yet. Local disk storage requires a persistent volume when deployed. Use only in a controlled development environment until access controls and retention are agreed.

Verification: `node node_modules/typescript/bin/tsc -p tsconfig.build.json`, then `node test/snapshots.integration.mjs`. Frontend: `npm run typecheck`.
