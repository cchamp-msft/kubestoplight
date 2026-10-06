# kubestoplight web mode in one small image.
#   docker build -t kubestoplight .
#   docker run --rm -p 8080:8080 -v ~/.kubestoplight/config.yaml:/config/config.yaml \
#     -v ~/.kube/config:/kube/config:ro kubestoplight --config /config/config.yaml
# Kubeconfig paths inside the config must point at where they're mounted.
# See deploy/preview/ for a read-only public preview behind a Cloudflare tunnel.

FROM node:24-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
# Build-time UI options (Vite reads VITE_* from the environment).
ARG VITE_PUBLIC_URL=
ARG VITE_BG_PICKER=
ARG VITE_DEFAULT_BG=
ARG VITE_DEFAULT_MOTION=
RUN npm run build

FROM golang:1.25-alpine AS go
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web /src/web/dist ./web/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/kubestoplight .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=go /out/kubestoplight /kubestoplight
EXPOSE 8080
ENTRYPOINT ["/kubestoplight", "--web", "--addr", "0.0.0.0:8080"]
