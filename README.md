# BARA Backend

Backend repository for [BARA](https://github.com/miroslavmatthew/BARA).

- `bara-api/`: NestJS API, session and snapshot storage, image analysis, evidence checklists, capture guidance, tests, and simulation tools.
- `infrastructure/`: MongoDB and private MinIO storage, Docker Compose, and initialization scripts.
- `UI-BACKEND-HANDOFF.md`: API and data integration contract.

## Run locally

1. Copy `infrastructure/.env.example` to `infrastructure/.env` and replace the placeholder credentials.
2. From `infrastructure`, run `docker compose up -d --build`.
3. Copy `bara-api/.env.example` to `bara-api/.env`. Match the MongoDB application and MinIO credentials configured above. Set `OPENAI_API_KEY` to enable model analysis.
4. From `bara-api`, run `docker compose up -d --build`. The API listens on port 3000 and joins the `bara-data` network created by infrastructure.

Keep actual `.env` files private. Database initialization applies only to fresh volumes; see `infrastructure/README.md` for details.

## Development and tests

Use Node.js 24. From `bara-api`, run `npm ci`, `npm test`, and `npm run build`. Integration and simulation instructions are in `bara-api/SNAPSHOTS.md`, `bara-api/WITNESS-CONTRACT.md`, and `bara-api/scripts/SIMULATION.md`.

The witness and intelligence frontend applications are maintained separately. Some integration verification scripts expect those applications to be running.
