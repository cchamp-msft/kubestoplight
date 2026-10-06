// Vite plugin that stands in for the Go backend (webserver/server.go) so the
// UI runs with no Go toolchain and no Kubernetes cluster:
//
//   npm run dev:mock                         # default "mixed" scenario
//   MOCK_SCENARIO=failing npm run dev:mock   # or healthy | empty | large
//   MOCK_CHURN=0 npm run dev:mock            # freeze data for screenshots
//
// It serves the same routes the Go server does:
//   GET/POST /api/clusters, PUT/DELETE /api/clusters/{name}
//   GET /api/pods/{cluster}/{ns}/{pod}          (describe)
//   GET /api/pods/{cluster}/{ns}/{pod}/logs     (text stream, ?follow=true)
//   WS  /ws/pods                                ({type:'snapshot', groups})
//
// The scenario can also be switched at runtime without restarting:
//   POST /__mock/scenario?name=failing

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Cluster } from '../src/types/api.ts';
import {
  SCENARIOS, churn, createState, describePod, logLine, rng, toGroups, type MockState, type Scenario,
} from './fixtures.ts';

const TICK_MS = 3000; // matches the Go default polling_interval

function send(res: ServerResponse, status: number, body?: unknown) {
  res.statusCode = status;
  if (body === undefined) return res.end();
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readJSON<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
}

export function mockBackend(): Plugin {
  const envScenario = process.env.MOCK_SCENARIO as Scenario | undefined;
  let state: MockState = createState(envScenario && SCENARIOS.includes(envScenario) ? envScenario : 'mixed');
  const churnEnabled = process.env.MOCK_CHURN !== '0';
  const r = rng(7);
  const sockets = new Set<WebSocket>();
  const wss = new WebSocketServer({ noServer: true });

  const snapshot = () => JSON.stringify({ type: 'snapshot', groups: toGroups(state) });
  const broadcast = () => {
    const msg = snapshot();
    for (const ws of sockets) ws.send(msg);
  };

  wss.on('connection', (ws) => {
    sockets.add(ws);
    ws.on('close', () => sockets.delete(ws));
    ws.send(snapshot());
  });

  async function handle(req: IncomingMessage, res: ServerResponse, next: () => void) {
    const url = new URL(req.url ?? '/', 'http://mock');
    const path = url.pathname;
    try {
      if (path === '/__mock/scenario' && req.method === 'POST') {
        const name = url.searchParams.get('name') as Scenario;
        if (!SCENARIOS.includes(name)) return send(res, 400, { error: `scenario must be one of ${SCENARIOS.join(', ')}` });
        state = createState(name);
        broadcast();
        return send(res, 200, { scenario: name });
      }

      if (path === '/api/clusters') {
        if (req.method === 'GET') return send(res, 200, state.clusters);
        if (req.method === 'POST') {
          const c = await readJSON<Cluster>(req);
          if (state.clusters.some((x) => x.name === c.name)) {
            return send(res, 409, { error: `cluster "${c.name}" already exists` });
          }
          state.clusters.push(c);
          return send(res, 201, c);
        }
        return send(res, 405, { error: 'method not allowed' });
      }

      if (path.startsWith('/api/clusters/')) {
        const name = decodeURIComponent(path.slice('/api/clusters/'.length));
        const idx = state.clusters.findIndex((x) => x.name === name);
        if (idx < 0) return send(res, 404, { error: `cluster "${name}" not found` });
        if (req.method === 'PUT') {
          const c = { ...(await readJSON<Cluster>(req)), name };
          state.clusters[idx] = c;
          if (!c.enabled) {
            state.pods = state.pods.filter((p) => p.cluster !== name);
            state.jobs = state.jobs.filter((j) => j.cluster !== name);
          }
          broadcast();
          return send(res, 200, c);
        }
        if (req.method === 'DELETE') {
          state.clusters.splice(idx, 1);
          state.pods = state.pods.filter((p) => p.cluster !== name);
          state.jobs = state.jobs.filter((j) => j.cluster !== name);
          broadcast();
          return send(res, 204);
        }
        return send(res, 405, { error: 'method not allowed' });
      }

      if (path.startsWith('/api/pods/')) {
        const [cluster, ns, pod, suffix] = path.slice('/api/pods/'.length).split('/').map(decodeURIComponent);
        if (!pod) return send(res, 400, { error: 'expected /api/pods/{cluster}/{namespace}/{pod}' });
        const detail = describePod(state, cluster, ns, pod);
        if (!detail) return send(res, 404, { error: `pods "${pod}" not found` });

        if (!suffix) return send(res, 200, detail);
        if (suffix !== 'logs') return send(res, 404, { error: `unknown sub-resource: ${suffix}` });

        const failing = detail.status === 'Failed';
        const tail = Math.min(Number(url.searchParams.get('tail')) || 500, 500);
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
        const start = Date.now() - tail * 2000;
        for (let i = 0; i < tail; i++) res.write(logLine(r, failing, new Date(start + i * 2000)) + '\n');
        if (url.searchParams.get('follow') !== 'true') return res.end();
        const t = setInterval(() => res.write(logLine(r, failing) + '\n'), 1000);
        req.on('close', () => clearInterval(t));
        return;
      }
    } catch (e) {
      return send(res, 500, { error: String(e) });
    }
    next();
  }

  function attach(server: ViteDevServer | PreviewServer) {
    server.middlewares.use((req, res, next) => void handle(req, res, next));
    // Only claim /ws/pods; Vite's own HMR socket shares this HTTP server.
    server.httpServer?.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      if (req.url?.startsWith('/ws/pods')) {
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
      }
    });
    const timer = setInterval(() => {
      if (churnEnabled) churn(state, r);
      broadcast();
    }, TICK_MS);
    server.httpServer?.on('close', () => clearInterval(timer));
    server.config.logger.info(`  ➜  Mock backend: scenario "${state.scenario}"${churnEnabled ? '' : ', churn off'} (no Go server or cluster needed)`);
  }

  return {
    name: 'kubestoplight-mock-backend',
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
