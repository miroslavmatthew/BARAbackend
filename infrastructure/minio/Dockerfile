FROM golang:1.24-alpine AS server-build
RUN apk add --no-cache ca-certificates git
WORKDIR /src
ADD https://github.com/minio/minio/archive/7aac2a2c5b7c882e68c1ce017d8256be2feea27f.tar.gz /tmp/source.tar.gz
RUN tar -xzf /tmp/source.tar.gz --strip-components=1 -C /src
RUN CGO_ENABLED=0 go build -trimpath -o /out/minio .

FROM golang:1.24-alpine AS client-build
RUN apk add --no-cache ca-certificates git
WORKDIR /src
ADD https://github.com/minio/mc/archive/77f82e18b5401a65958f1619df6ebb994634bd88.tar.gz /tmp/source.tar.gz
RUN tar -xzf /tmp/source.tar.gz --strip-components=1 -C /src
RUN CGO_ENABLED=0 go build -trimpath -o /out/mc .

FROM alpine:3.22 AS client
RUN apk add --no-cache ca-certificates
COPY --from=client-build /out/mc /usr/local/bin/mc
ENTRYPOINT ["mc"]

FROM alpine:3.22 AS server
RUN apk add --no-cache ca-certificates curl && addgroup -g 10001 minio && adduser -D -u 10001 -G minio minio && mkdir /data && chown minio:minio /data
COPY --from=server-build /out/minio /usr/local/bin/minio
USER minio
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
