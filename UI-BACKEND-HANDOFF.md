# BARA data and API handoff for UI development

Updated 7 November 2026, Asia/Jakarta. Contract reflects the current local backend source; deployed behavior must be checked against the deployed revision.

The UI can connect session management, photo capture, session maps and timelines, image viewing, analysis results, evidence checklists, and the next witness request. Claims, incident grouping, review decisions, and audit history in the redesigned Intelligence UI still need backend contracts and persistence.

## Data resources and their purpose

| Resource | What it means | Storage today | What the UI uses it for |
| --- | --- | --- | --- |
| Session | A group of captures made during one witness capture session. It does not identify an authenticated user or a fire incident. | MongoDB `bara.sessions` | Start/end capture, restore the active session, browse sessions, display accumulated evidence and the current request. |
| Snapshot | One captured photo plus capture time, witness GPS, compass heading, and its analysis. | MongoDB `bara.snapshots`; `sessionId` links to `sessions._id` | Photo timeline, observation map marker, direction indicator, evidence inspector. One session has many snapshots. |
| Image | The actual JPEG/PNG belonging to a snapshot. | Private MinIO bucket, normally `bara-media`; Mongo stores its `imagePath` reference | Thumbnail and full image. Load through the image endpoint rather than displaying `imagePath` directly. |
| Analysis criterion | A versioned definition of what the backend should assess in a photo, including prompt and expected result schema. | MongoDB `bara.analysis_criteria` | Determines the available assessment topics. Currently consumed internally; no criteria management/list API. |
| Analysis result | One criterion's assessment of one snapshot, including uncertainty and visual evidence. | Embedded in `snapshots.analyses[]` | Per-photo findings, evidence details, model availability, and traceability. It is an image assessment rather than an independent witness statement. |
| Follow up | A summary and possible information requests derived from one photo's analysis. | Embedded in `snapshots.followUp` | Analyst inspection of that photo's missing information. Use the session instruction for the active Witness prompt. |
| Checklist | Evidence accumulated across analyzed snapshots in a session, including known values and remaining gaps. | Embedded in `sessions.checklist` | Evidence coverage panel and missing-information list. Each known value points to its source snapshot and capture time. |
| Gap | An unresolved field in a checklist criterion, such as `visible_flames.classification`. | Embedded in `sessions.checklist.gaps[]` | Explain what evidence is missing and associate the current witness request with that gap. |
| Instruction | The current single request for more information from the witness. | Embedded in `sessions.instruction` | Show the next capture request and support “cannot provide / skip.” |
| Claim | A statement to assess, such as “smoke reported,” with source and assessment state. | Current redesigned UI has fixture `claims[]`; the API has no claim model or claim endpoint. | Intended claim table, source comparison, corroboration/conflict views. These still need a backend contract. |
| Incident | A group of observations believed to describe the same event. | UI demo state; `simulation_incidents` exists only for synthetic scenarios. | Intended incident map, membership, candidate matching, review, reassessment. No operational incident API exists. |

`captures` is created by the original infrastructure initializer, but the current session/snapshot API writes to `sessions` and `snapshots`. Do not build a new UI around the older collection name.

`simulation_runs` and `simulation_incidents` support the test-data generator. Synthetic sessions and snapshots can contain extra fields such as `synthetic`, `simulationBatchId`, and `incidentId`; current public read responses do not expose those fields. Do not treat simulator ground truth as an operational assessment or infer incident membership from the standard session response.

## Endpoint reference

The backend uses paths below without an `/api` prefix. Local development defaults to `http://localhost:3000`. Browser applications should use their own same-origin proxy paths as described later.

| Method and backend path | Request | Success response | UI action |
| --- | --- | --- | --- |
| `POST /sessions` | No body | `201 { data: SessionDetail }` | Start a capture session and store `data.id`. |
| `GET /sessions` | No parameters | `200 { data: SessionSummary[] }` | Session list, latest sessions, capture counts; newest start time first. |
| `GET /sessions/:id` | Session ID | `200 { data: SessionDetail }` | Restore/check session status; refresh checklist and next request. |
| `POST /sessions/:id/end` | No body | `200 { data: SessionDetail }` | End capture. Repeating preserves the original end time. |
| `GET /sessions/:id/snapshots` | Session ID | `200 { data: SnapshotDetail[] }` | Map, photo timeline, and analysis inspector; capture time ascending. |
| `POST /snapshots` | Multipart `image` file and `metadata` JSON string | `201`, shape below | Save a capture and show the latest witness request. |
| `GET /snapshots/:id/image` | Snapshot ID | `200` JPEG/PNG binary stream | Render the stored photo. |
| `POST /sessions/:id/instruction/reject` | JSON `{ gapId, checklistRevision }` | `200 { data: SessionDetail }` | Skip the current request and obtain the next available instruction. |

There is no general snapshot list, single-snapshot JSON detail, claim, report, operational incident, review, correction, or delete endpoint. Retrieve snapshot detail through its session's snapshot list. Session/snapshot lists currently have no pagination or server-side date, area, or search filters.

### Session fields

| Field | Meaning and UI behavior |
| --- | --- |
| `id` | MongoDB ID exposed as a 24-character hexadecimal string. API responses use `id`, not `_id`. |
| `startedAt` | Server start time, serialized as an ISO timestamp. |
| `endedAt` | ISO timestamp or `null` while active. |
| `status` | `active` or `ended`. Only active sessions accept new captures. |
| `snapshotCount` | Included in session list summaries; not included in session detail. |
| `checklistRevision` | Version of the evidence/request state. Send the current instruction's revision when skipping it. |
| `checklist` | Optional; appears when the backend has built accumulated evidence. |
| `instruction` | Optional; current request, described below. |

`SessionSummary` has `id`, `startedAt`, `endedAt`, `status`, and `snapshotCount`. `SessionDetail` has `id`, `startedAt`, `endedAt`, `status`, `checklistRevision`, and optional `checklist` and `instruction`. Missing optional fields may be omitted from JSON.

The internal `dismissedGapIds` array prevents skipped requests from being selected again in that session. It is not returned by session reads. Skipping does not resolve an evidence gap.

### Snapshot fields

| Field | Meaning and UI behavior |
| --- | --- |
| `id`, `sessionId` | Snapshot identifier and parent capture session. |
| `time` | Client capture timestamp, normalized to UTC in responses. Use this for the observation timeline. |
| `location.latitude`, `location.longitude` | Witness camera location in decimal degrees. It is not the fire's location. Mongo stores the corresponding GeoJSON coordinates as `[longitude, latitude]`. |
| `direction` | Camera compass heading clockwise from north: `0` north, `90` east, `180` south, `270` west; valid range `[0, 360)`. No accuracy or heading-reference field is currently supplied. |
| `imageUrl` | Backend-relative image path, returned by the session snapshot list. Resolve through the frontend's proxy. |
| `analyses` | Optional array of criterion assessments. |
| `analysisMessage` | Optional detailed analysis text for Intelligence. |
| `followUp` | Optional per-photo findings and possible follow-up requests. |
| `analyzedAt` | Optional server timestamp for persisted analysis processing; its presence does not mean every criterion succeeded. |

Mongo also stores `imagePath` and `createdAt`. Upload responses include `imagePath`; snapshot list responses provide `imageUrl` instead and omit `createdAt`. There is no API receipt-time field for the UI's received-date filters yet.

### Upload request and response

Send `multipart/form-data` with one JPEG/PNG file named `image`, up to 8 MiB, and one text field named `metadata` containing:

```json
{
  "sessionId": "507f1f77bcf86cd799439011",
  "time": "2026-11-07T10:00:00+07:00",
  "location": { "latitude": -6.2, "longitude": 106.8 },
  "direction": 90
}
```

All metadata fields are required and extra fields are rejected. Time needs a timezone; latitude must be within `[-90, 90]` and longitude within `[-180, 180]`. Let the browser set the multipart boundary when using `FormData`.

The response has this structure; optional analysis/session values can be absent:

```typescript
{
  data: { id, sessionId, time, location, direction, imagePath },
  analyses,
  followUp,
  checklist,
  checklistRevision,
  instruction,
  message
}
```

The backend stores the photo and metadata, runs analysis, then rebuilds the session checklist and generates the next instruction within the request. Allow a loading state: the Witness client currently allows about 100 seconds. This is not a background-job/202 contract. An upload can succeed even if analysis or checklist updating is unavailable.

Retries create new snapshots; there is no idempotency key. If a request times out after sending, refresh the session and its snapshots before offering a retry.

## Analysis and evidence states

Each `analyses[]` item contains `criterionKey`, `criterionName`, `criterionVersion`, `status`, and `message`. Completed items also include structured `result` and model/response identifiers. `status` is `completed` or `unavailable`; classification is inside `result`, not in `status`. The result shape and allowed classifications depend on the criterion definition.

The supplied criterion definitions cover:

| Criterion key | Intended UI content |
| --- | --- |
| `visible_flames` | Flame visibility, evidence, frame location, limitations. |
| `forest_woodland_fire` | Visible burning and woodland setting, affected material. |
| `fire_suppression` | Response activity, apparent method/target, visible actors and uncertain roles. |
| `smoke_visibility_color_origin` | Smoke visibility, category/color, apparent origin and supporting evidence. |
| `visibly_burning_material` | Materials visibly burning, plus limits on peat involvement. |
| `camera_to_fire_distance` | Target, relative depth, distance assessment and its limitations. |

Only database criteria with `active: true` are analyzed during upload. New keys can be added through configuration, so provide a generic result/details fallback in addition to custom cards.

Checklist items contain `criterionKey`, `criterionName`, `scope`, `status`, `known`, `unresolvedFields`, `observations`, and `unavailableSnapshotIds`. Item status is `resolved`, `uncertain`, or `unavailable`. `known[field]` contains its value, `snapshotId`, and `capturedAt`, with additional sources for some aggregated fields. Observations retain source results and criterion versions.

The checklist contains `verificationStatus: complete | incomplete`, `snapshotIds`, `latestSnapshotId`, `items`, `gaps`, and `summary`. A gap has `id`, `criterionKey`, `field`, and `priority`. Distance uses the current snapshot; most other criteria aggregate evidence across the session. Earlier positive observations remain tied to their source time and do not establish current conditions.

Display unknown, uncertain, and unavailable states explicitly. “Not visible in this photo” does not establish absence elsewhere. A completed analysis or a resolved checklist item does not establish a verified incident, independent corroboration, or a safe situation.

## Witness instruction behavior

| `instruction.status` | UI behavior |
| --- | --- |
| `ready` | Show `witnessMessage` and enable skip/cannot provide. The instruction includes `gapId` and `checklistRevision`; `reason` is available for analyst context. |
| `not_needed` | Show that no additional information is requested. Evidence can remain incomplete when all eligible gaps were skipped or excluded. |
| `unavailable` or missing | Show a temporary unavailable/waiting state; capture may still be saved. Do not show evidence as complete. |

For skip, submit the `gapId` and `checklistRevision` from the displayed instruction:

```json
{ "gapId": "visible_flames.classification", "checklistRevision": 4 }
```

Replace local state with the returned session. A `409` means the session ended or the instruction changed; refresh the session before another action.

Use `session.instruction` or the upload response's `instruction`/`message` for Witness. The snapshot's `followUp.nextRequest` is a separate per-photo scaffold and can contain older request wording, including distance requests. Current session instruction generation excludes distance requests and skipped gap IDs. There is no text-answer or explicit instruction-fulfilled endpoint; subsequent captured evidence updates the checklist.

## Browser integration

| Frontend | Browser path | Backend path |
| --- | --- | --- |
| Redesigned `bara-uiux` | `/api/backend/sessions`, `/api/backend/snapshots`, etc. | Same resource path after removing `/api/backend`. The configured rewrite supports the routes above. |
| Existing `bara-intelligence` | `/api/sessions`, `/api/sessions/:id`, `/api/sessions/:id/snapshots`, `/api/snapshots/:id/image` | Corresponding backend path after removing `/api`. Its proxy supports these GET routes only. |
| Existing `bara-web` Witness | `/api/sessions`, `/api/sessions/:id`, `/api/sessions/:id/end`, `/api/snapshots` | Existing Witness proxies; do not assume they support every newer route. |

For the redesigned UI, render a snapshot image with `/api/backend/snapshots/${snapshot.id}/image`. Using the raw `/snapshots/.../image` path on the UI origin will miss the rewrite.

The existing Intelligence app polls every five seconds; that is a client choice, not a server push contract. There is no WebSocket/event stream. Keep the last successfully loaded evidence visible when refresh fails.

## UI mapping and remaining backend work

| UI feature | Available data or action | Remaining gap |
| --- | --- | --- |
| Witness capture | Session lifecycle and snapshot upload | Connect the existing client adapter to the configured API. |
| Current witness request and skip | Session instruction and rejection endpoint | No separate text-answer submission. |
| Session browser | Session list and snapshot counts | No user identity, ownership, pagination, or server-side filters. |
| Observation map and direction | Snapshot witness GPS and heading | No fire-source position, location accuracy, or heading reference. |
| Evidence inspector and timeline | Snapshot list, image stream, capture time, analyses | No exposed receipt time, image dimensions, corrections, or full source lineage. |
| Evidence checklist | Session detail's accumulated checklist | List summaries omit it; fetch detail. Older or synthetic records may not have one. |
| Claim assessment table | Per-snapshot analyses provide possible inputs | No canonical claim IDs, source kinds, claim lifecycle, corroboration/conflict contract, or claim write API. Define an adapter without relabeling AI findings as witness statements. |
| Incident grouping and candidate decisions | Demo fixtures/local UI state | No persistent operational incident, membership, matching, accept/reject/remove, or reassessment API. A session must not automatically become an incident. |
| Reviewed status and decision timeline | Demo UI actions | No saved review reason, reviewer identity, decision history, or audit endpoint. |
| Synthetic dataset label | Extra simulator fields exist in Mongo | Read responses omit these markers; expose provenance before mixing simulated and operational data. |

Recommended integration order: connect Witness and the session browser first; then the observation map, timeline, images, and analysis/checklist views; then agree and implement claims and operational incident/review contracts. Keep the existing claim and incident demos visibly identified until those services exist.

## Errors and client handling

| HTTP status | Meaning | UI action |
| --- | --- | --- |
| `400` | Invalid ID, metadata, image, or skip payload | Show validation feedback. Upload metadata errors may include `errors[]` with field/message. |
| `404` | Session, snapshot, or image not found | Show unavailable/not found and refresh the relevant list. |
| `409` | Session ended or displayed request became stale | Reload session state; require a new active session for capture. |
| `413` | Image exceeds upload limit | Ask for a smaller capture. |
| `503` | Backend storage unavailable | Show save/load failure and offer a deliberate retry. |
| `502` | Existing dashboard proxy cannot reach the API | Preserve loaded data and show connection failure. |

Authentication and user ownership are not implemented in the current resource API. No authorization header is currently required by these controllers; shared access will need an agreed access model.

`POST /witness/snapshots` is a separate legacy JPEG/local-disk flow using `schemaVersion`, `sequence`, `capturedAt`, and a string session ID. It does not feed this Mongo session/snapshot pipeline. Use `POST /snapshots` for the integration above.

## Source references

- [Session routes](bara-api/src/snapshots/sessions.controller.ts) and [session response construction](bara-api/src/snapshots/sessions.service.ts)
- [Snapshot routes](bara-api/src/snapshots/snapshots.controller.ts) and [upload processing](bara-api/src/snapshots/snapshots.service.ts)
- [Session schema](bara-api/src/snapshots/session.schema.ts) and [snapshot schema](bara-api/src/snapshots/snapshot.schema.ts)
- [Analysis results](bara-api/src/snapshots/criteria-analysis.ts), [criterion definitions](bara-api/scripts/analysis-criteria.json), [checklist](bara-api/src/snapshots/session-checklist.ts), and [instruction](bara-api/src/snapshots/session-instruction.ts)
- [Redesigned Witness adapter](bara-uiux/lib/witness-api.ts) and [proxy configuration](bara-uiux/next.config.ts)
- [UI claim shape](bara-uiux/lib/intelligence.ts), [investigation demo limits](bara-uiux/docs/part-2b-handoff.md), and [simulation provenance](bara-api/scripts/SIMULATION.md)

Some older project summaries and snapshot examples predate persisted multi-criterion analysis and session instructions. Use the current controller/service contracts above when connecting the UI.
