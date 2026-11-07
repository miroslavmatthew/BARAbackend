<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

Witness can decline the current information request with `POST /sessions/:id/instruction/reject`, sending only `{ "gapId": "...", "checklistRevision": 1 }`. No reason is requested. Declined gap IDs remain excluded from subsequent requests for that session, including after later captures. Rejection advances the revision and generates another eligible instruction without changing the evidence checklist. Stale requests return 409 instead of declining a newer instruction.

Distance requests are disabled in session instruction generation. Distance analysis remains available in stored evidence. A declined or disabled request never resolves a criterion or changes the checklist verification status.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

To add it to this project, run this and approve the code it prints at [observe.nestjs.com/link](https://observe.nestjs.com/link) - signing up for free if you have no account:

```bash
$ npx @nestjs/observe link
```

It installs `@nestjs/observe`, wires it into `AppModule` and `main.ts`, and writes the app key and secret into `.env`, which every `nest start` script (`start`, `start:dev`, `start:debug`) then loads. In production, set `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` in the environment instead.

Or do it by hand:

```bash
$ npm install @nestjs/observe
```

Then follow the [setup guide](https://docs.nestjs.com/observability/sdk) - it takes a single import and an app key.

The free plan needs no payment details and covers 300,000 events a month. You can also browse the [live demo](https://www.observe-demo.nestjs.com/dashboard) first - the whole dashboard over a busy service's data, with nothing to install.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observe](https://observe.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
# Stored analysis criteria

For bulk synthetic fire observations and accelerated replay, see [scripts/SIMULATION.md](scripts/SIMULATION.md).

MongoDB collection `analysis_criteria` stores `visible_flames` and `forest_woodland_fire`. Each record contains its name, description, full user prompt, expected JSON response schema, display order, version, timestamps, and revision history. Burning material is an array so multiple burning materials can be recorded.

From `bara-api`, recall the definitions with:

```powershell
docker run --rm --network bara-data --env-file .env --mount "type=bind,source=$($PWD.Path)/scripts,target=/app/scripts,readonly" bara-api-check node scripts/analysis-criteria.mjs list
```

Replace `list` with `get visible_flames` or `get forest_woodland_fire` to read one. To edit, put the changed fields in a JSON file under `scripts`, then use `update visible_flames 1 /app/scripts/changes.json` (replace `1` with the version you read). Supported fields are `name`, `description`, `prompt`, `expectedResult`, and `order`. Updates retain the preceding version in `history` and reject stale version numbers. `seed` inserts missing definitions without overwriting edits.

Snapshot capture now reads all criteria with `active: true` from MongoDB on each request and runs them in parallel. Prompt/schema edits take effect on the next snapshot. Use the update command with `{"active": false}` to disable a criterion. Results, criterion keys/versions, and the witness message are saved on the snapshot and returned by the session snapshot endpoint. Each analysis has a 45-second limit; failures are isolated. The witness receives the combined report after the requests settle. Historical snapshots are not automatically reanalyzed.

## Uncertainty and general follow-up requests

Every criterion request includes the shared evidence policy in `src/snapshots/evidence-policy.ts`, including criteria loaded from an existing database. An unassessable view is uncertain; an assessable view without visible evidence is a frame-local negative, never incident-wide absence. Supported details remain usable even when other fields are unresolved. Distance retains its existing `NOT_DETERMINABLE` / `RELATIVE_ONLY` labels, and technical failures remain `unavailable`.

The six seed prompts also contain criterion-specific uncertainty guidance. For an existing database, run `node scripts/apply-evidence-policy.mjs` using Node 24 and `MONGODB_URI` to preview updates, then add `--apply`. This appends guidance without replacing custom prompts or schemas, retains revision history, rejects concurrent edits, and skips already updated prompts. Mount both `scripts` and `src` when running it inside the validation container.

After all parallel analyses settle, `buildAnalysisFollowUp` produces `followUp`: a summary, observations and unresolved fields per criterion, `prioritizedRequests`, and one `nextRequest` (or null). This is saved on the snapshot, returned by POST `/snapshots`, and included in GET `/sessions/:id/snapshots`. The existing witness message starts with the summary and selected general request, so it needs no frontend contract change.

The initial, deterministic priority scaffold groups requests for fire/smoke evidence first, setting/material second, suppression/roles third, and known measured distance/location fourth. Multiple gaps can share a request. Unavailable analyses do not produce witness requests. Unconfirmed peat does not trigger another ordinary photo request. New criteria without a request template are listed in `unsupportedCriteria` for review rather than receiving an invented instruction.

The original `followUp` remains a **snapshot-scoped** internal report. Witness requests now come from the accumulated session checklist described below.

## Accumulated session checklist and model-generated instructions

After every snapshot's analyses settle and are saved, `SessionsService.updateChecklist` rebuilds a session checklist from that session's analyzed snapshots in capture-time order. The checklist and a revision number are persisted on the session. GET `/sessions/:id` exposes `checklist`, `checklistRevision`, and `instruction`; POST `/snapshots` returns the same updated information alongside internal per-image results.

Resolved structured fields retain their source snapshot and capture time. Earlier positive sightings survive unclear or unavailable later images; frame-local negatives remain in observation history and do not cancel positive evidence elsewhere. `NOT_VISIBLE`, `NO_VISIBLE_FOREST_FIRE`, and `NO_VISIBLE_BURNING` alone leave the criterion incomplete and create a witness information gap. Complementary smoke fields can be filled by different frames. Changed observations are preserved in history rather than erased. Numeric distance is specific to the current camera frame, and actors are not matched across images by array index. These are accumulated observations of the session, not claims about current incident conditions or verified identities.

`generateSessionInstruction` sends a compact summary, known values, remaining gap IDs, the last three observations per criterion, and the prior request to the configured model. It asks for one general information request tied to a remaining gap. Its structured response is validated against those gap IDs before publication. `verificationStatus` is incomplete if any criterion is unresolved or unavailable (or there are no criteria). An empty actionable-gap list is never treated as completed verification while any analysis is unavailable. If the current frame establishes fire/smoke but distance analysis is unavailable, a `measuredReference` gap lets the witness supply an already-known measurement or mapped reference, without asking them to repair a service failure or guess a distance. With no actionable gaps, the model is skipped; the instruction is `not_needed` only for complete verification, otherwise `unavailable`. The model has 15 seconds; missing credentials, refusals, timeouts, and invalid output leave the checklist intact and produce no fabricated instruction. Set optional `OPENAI_INSTRUCTION_MODEL` to choose a separate instruction model; otherwise `OPENAI_MODEL` is used.

Optimistic revision checks retry concurrent checklist updates and prevent an old model response from overwriting a newer request. Completed evidence can still be stored after a session ends, but no new witness instruction is published for an ended session.

The detailed witness analysis report is temporarily disabled. `analysisMessage`, `analyses`, and the old per-image scaffold remain available internally for the intelligence dashboard. The witness receives only the model-generated request, or a neutral acknowledgement when none is needed or generation is unavailable. The frontend also suppresses legacy report messages and restores the current instruction when reopening a session. The next snapshot automatically incorporates prior saved evidence, including snapshots captured before this feature was added.

This does not yet collect typed witness answers or schedule background snapshots. Session aggregation is a conservative rule-based merge; it does not identify or track individual people, objects, or separate fire sources across images. No external messages are sent.

## Guided capture: blur and framing

Each submitted snapshot now runs one subject-specific quality assessment in parallel with the criterion analyses. It returns `CLEAR`, `BLURRY`, `CUT_OFF`, `NOT_PRESENT`, or `UNKNOWN` per non-distance criterion. Crop directions are accepted only for a visible `CUT_OFF` subject. Quality is persisted as `captureQuality` on the snapshot and included in session snapshot reads.

The session checklist retains raw observations but does not accept a new criterion result as evidence while its subject is blurry, cropped, of unknown usability, or its quality assessment is unavailable. A later clear frame can fill the checklist. Earlier usable evidence remains intact; historical snapshots without quality metadata keep their prior behavior.

When an unresolved subject is visibly blurry or cropped, `planCaptureGuidance` selects one short deterministic instruction, e.g. “Hold the camera steady on the flames” or “Include the left side of the flames.” It never invents a direction for an absent subject. The witness stays in place. The general information generator remains the fallback for missing subjects.

Progress is persisted per criterion in `captureAttempts` with its last counted snapshot ID. The initial deficient image counts as attempt 1. Only newly submitted deficient frames for the active guided subject advance its count; refreshes, retries, unrelated subjects, and service failures do not. After the fifth failed frame, the subject is deferred for the session and excluded from further requests, allowing another gap to be selected. It remains incomplete. A later independently submitted clear frame can still resolve it. Deferred criterion keys are exposed in `checklist.deferredCriteria`. Existing manual skips and disabled distance requests are preserved.

Witness instructions expose `mode`, `criterionKey`, and, for guidance, `attempt` and `attemptLimit`. The witness card shows a subject icon, short instruction, and capture progress. Its Tip disclosure includes a labeled example illustration comparing a blurry/cropped view with a clear, fully framed view. This is guidance per submitted snapshot; there is no automatic capture timer or continuous video assessment in this change.

