# Create a snapshot

`POST http://localhost:3000/snapshots` accepts `multipart/form-data`:

- `image`: required JPEG or PNG file, maximum 8 MiB.
- `metadata`: required JSON string containing the fields below.

```json
{
  "sessionId": "507f1f77bcf86cd799439011",
  "time": "2026-11-07T10:00:00+07:00",
  "location": { "latitude": -6.2, "longitude": 106.8 },
  "direction": 90
}
```

Time must be an ISO 8601 timestamp with a timezone. Location is in decimal degrees. Direction is a compass heading in degrees clockwise from north, from 0 inclusive to 360 exclusive. All fields are required; unknown fields are rejected.

The server generates `imagePath`, uploads the image to the private MinIO `bara-media` bucket, and saves a document in MongoDB's `bara.snapshots` collection. The document contains `time` (Date), `location` (GeoJSON Point, longitude first), `direction` (number), `imagePath` (string), `_id` and `createdAt`. Time and geographic indexes support future queries. The image path is a persistent storage URI, not a public download URL.

Example HTTP 201 response:

```json
{
  "data": {
    "id": "<generated MongoDB ID>",
    "sessionId": "507f1f77bcf86cd799439011",
    "time": "2026-11-07T03:00:00.000Z",
    "location": { "latitude": -6.2, "longitude": 106.8 },
    "direction": 90,
    "imagePath": "s3://bara-media/sessions/507f1f77bcf86cd799439011/snapshots/<generated-id>.png"
  },
  "message": "waiting for instruction"
}
```

Browser request:

```js
const form = new FormData();
form.append('image', imageBlob, 'snapshot.jpg');
form.append('metadata', JSON.stringify({
  sessionId: activeSessionId,
  time: new Date().toISOString(),
  location: { latitude, longitude },
  direction,
}));
const response = await fetch('http://localhost:3000/snapshots', {
  method: 'POST', body: form,
});
const result = await response.json();
```

Do not manually set Content-Type when using FormData. The caller controls how often it sends snapshots; this endpoint processes one snapshot per request. There is no server-side capture timer or frontend wiring in this change. The existing `/witness/snapshots` endpoint remains separate.

Invalid metadata/images return HTTP 400; oversized images return 413. Storage failures return 503 without credentials or internal errors. If MongoDB fails after an upload, the server attempts to remove the uploaded object. Each accepted request creates a new record; retries are not deduplicated yet. Authentication is not implemented yet.

## Run

Start the data services in `../infrastructure`, then run `docker compose up --build -d` here. API `.env` contains database and S3 credentials and is ignored by Git. Containers use the external `bara-data` network.

## Sessions

Start a session using `POST /sessions` (no request body). It returns HTTP 201 with `data: { id, startedAt, endedAt: null, status: "active" }`. All new snapshot metadata must include this `sessionId` in addition to time, location and direction. Snapshot responses echo the same `sessionId`.

`GET /sessions/:id` returns its current status. `POST /sessions/:id/end` ends it and returns HTTP 200; repeating the end request keeps its original end time. Ended sessions reject new captures with HTTP 409; nonexistent sessions return 404 and malformed IDs return 400. Session status is checked before uploading; a request already admitted before ending may still finish.

Sessions are saved in `bara.sessions`. Snapshot `sessionId` is an ObjectId reference indexed with time for grouping. In Compass, filter `bara.snapshots` with `{ sessionId: ObjectId("YOUR_SESSION_ID") }`. New media paths are `s3://bara-media/sessions/SESSION_ID/snapshots/IMAGE_ID.jpg` (or `.png`). Existing snapshots are preserved without assigning an invented session.

The frontend provides Start session / End session. It stores the active ID in sessionStorage, checks its status after a reload in the same tab, and requires an active session before enabling capture. The browser uses same-origin `/api/sessions` proxies. Ending is disabled while uploading. There is no user authentication/ownership model yet; a session is a capture group, not a login session.

