# BARA local data services

Run `docker compose up -d` from this folder. To wait for storage health, run `docker compose up -d --wait mongo minio`; `minio-init` is a one-time bucket setup job that exits successfully. Stop with `docker compose down`.
Named Docker volumes preserve data across container recreation. Do not use `down -v` unless intentionally deleting all database and media data.

- MongoDB: localhost:27017, database `bara`, collection `captures`.
- MinIO S3 endpoint: http://localhost:9000
- MinIO console: http://localhost:9001
- Private bucket: `bara-media`.
- Credentials and host connection settings: `.env` (ignored by Git).

MongoDB has a separate application user limited to read/write on `bara`. Store media in MinIO and save the object key, media type, size, timestamp, location accuracy and compass heading in capture documents. GeoJSON locations use longitude first: `{ type: "Point", coordinates: [longitude, latitude] }`.

Services bind only to this PC. Containers joining the `bara-data` Docker network can use `mongo:27017` and `http://minio:9000`. Backend integration and capture/upload endpoints are not yet implemented. Never put database or MinIO root credentials in frontend code.

This local development setup builds MinIO and its client from pinned commits in the archived official source repositories. Review maintenance/security and choose a supported storage deployment before production.
MongoDB initialization runs only with empty volumes. Editing credentials in `.env` does not rotate existing database credentials.


