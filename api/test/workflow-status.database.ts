/** Real HTTP + Socket.IO + PostgreSQL; no worker execution or model calls. */
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID, randomBytes } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { HealthModule } from '../src/health/health.module.js';
import { WorkflowFanoutService } from '../src/workflow/workflow-fanout.service.js';
import { WorkflowRunModule } from '../src/workflow-run/workflow-run.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RedisService } from '../src/redis/redis.service.js';
import { analyticsTestClient } from './analytics-test-db.js';

const db = analyticsTestClient();
const key = 'worker-integration-' + randomBytes(24).toString('hex');
const organizations = [randomUUID(), randomUUID()];
const users = [randomUUID(), randomUUID()],
  workflows = [randomUUID(), randomUUID()];

function event<T = unknown>(
  socket: Socket,
  name: string,
  timeoutMs = 4000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(name, receive);
      reject(new Error(`Timed out waiting for ${name}`));
    }, timeoutMs);
    function receive(value: T) {
      clearTimeout(timer);
      resolve(value);
    }
    socket.once(name, receive);
  });
}

describe('Workflow status trust boundaries (PostgreSQL and live sockets)', () => {
  let app: INestApplication, origin: string, jwt: JwtService;
  let replica: INestApplication, replicaOrigin: string;
  const jwtKey = randomBytes(32).toString('hex');
  const sockets: Socket[] = [];
  const redis = {
    isAvailable: () => true,
    del: vi.fn().mockResolvedValue(true),
  };
  beforeAll(async () => {
    await db.$connect();
    for (let i = 0; i < 2; i++) {
      await db.organization.create({
        data: {
          id: organizations[i],
          name: 'Socket isolation fixture',
          users: {
            create: {
              id: users[i],
              name: 'Member',
              email: `${users[i]}@example.invalid`,
              role: 'MEMBER',
              passwordHash: 'not-a-login-fixture',
            },
          },
          projects: {
            create: {
              name: 'Fixture',
              workflows: {
                create: { id: workflows[i], name: 'Fixture workflow' },
              },
            },
          },
        },
      });
    }
    for (let index = 0; index < 2; index++) {
      const module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [
              () => ({
                JWT_SECRET: jwtKey,
                WORKER_STATUS_API_KEY: key,
                ENABLE_MESSAGING: false,
              }),
            ],
          }),
          WorkflowRunModule,
          HealthModule,
        ],
      })
        .overrideProvider(PrismaService)
        .useValue(db)
        .overrideProvider(RedisService)
        .useValue(redis)
        .compile();
      const instance = module.createNestApplication({ logger: false });
      instance.setGlobalPrefix('api/v1');
      instance.useGlobalPipes(
        new ValidationPipe({ whitelist: true, transform: true }),
      );
      await instance.listen(0, '127.0.0.1');
      if (index === 0) {
        app = instance;
        origin = await instance.getUrl();
        jwt = module.get(JwtService);
      } else {
        replica = instance;
        replicaOrigin = await instance.getUrl();
      }
    }
  });
  beforeEach(() => {
    vi.clearAllMocks();
    redis.del.mockResolvedValue(true);
  });
  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await replica?.close();
    await app?.close();
    await db.$disconnect();
  });

  async function token(index = 0, expiresIn = 60) {
    return jwt.signAsync(
      {
        sub: users[index],
        organizationId: organizations[index],
        role: 'MEMBER',
      },
      { expiresIn },
    );
  }
  function client(credential?: string, auth = {}, server = origin) {
    const socket = io(server, {
      autoConnect: false,
      transports: ['websocket'],
      reconnection: false,
      auth: { token: credential, ...auth },
    });
    sockets.push(socket);
    return socket;
  }
  async function connect(index = 0) {
    const socket = client(await token(index));
    const ready = event(socket, 'workflow.updates.ready');
    socket.connect();
    await ready;
    return socket;
  }
  async function callback(body: unknown, credential?: string, bearer?: string) {
    return fetch(`${origin}/api/v1/workflow-runs/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(credential ? { 'X-EWAP-Worker-Key': credential } : {}),
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000),
    });
  }
  const run = (index = 0, status: 'RUNNING' | 'SUCCESS' = 'RUNNING') =>
    db.workflowRun.create({ data: { workflowId: workflows[index], status } });

  it.each(['missing', 'invalid', 'expired', 'wrong-membership', 'malformed'])(
    'rejects %s socket identity',
    async (kind) => {
      let credential: string | undefined;
      if (kind === 'invalid') credential = 'invalid';
      if (kind === 'expired') credential = await token(0, -1);
      if (kind === 'wrong-membership')
        credential = await jwt.signAsync(
          { sub: users[0], organizationId: organizations[1], role: 'MEMBER' },
          { expiresIn: 60 },
        );
      if (kind === 'malformed')
        credential = await jwt.signAsync({ sub: users[0] }, { expiresIn: 60 });
      const socket = client(credential);
      const rejected = event<Error>(socket, 'connect_error');
      socket.connect();
      expect((await rejected).message).toBe('Unauthorized');
      expect(socket.connected).toBe(false);
      socket.disconnect();
    },
  );
  it('requires the worker key even when a valid user JWT is supplied', async () => {
    const record = await run();
    const body = { runId: record.id, status: 'RUNNING' };
    expect((await callback(body)).status).toBe(401);
    expect((await callback(body, 'wrong')).status).toBe(401);
    expect((await callback(body, undefined, await token())).status).toBe(401);
    expect(redis.del).not.toHaveBeenCalled();
  });
  it('publishes only to the persisted organization, ignoring requested tenant fields', async () => {
    const a = await connect(0),
      b = await connect(1),
      record = await run(0);
    const otherEvents: unknown[] = [];
    b.on('workflow.status.changed', (value) => otherEvents.push(value));
    const received = event<{ runId: string; status: string }>(
      a,
      'workflow.status.changed',
    );
    const response = await callback(
      { runId: record.id, status: 'RUNNING', organizationId: organizations[1] },
      key,
    );
    expect(response.status).toBe(200);
    expect(await received).toEqual({ runId: record.id, status: 'RUNNING' });
    await new Promise((resolve) => setTimeout(resolve, 75));
    expect(otherEvents).toEqual([]);
    expect(redis.del).toHaveBeenCalledWith(
      `org:${organizations[0]}:workflow-runs:run:${record.id}`,
    );
    a.disconnect();
    b.disconnect();
  });
  it('delivers a status callback to authenticated sockets on both API replicas', async () => {
    const local = await connect();
    const remote = client(await token(0), {}, replicaOrigin);
    const other = client(await token(1), {}, replicaOrigin);
    const ready = event(remote, 'workflow.updates.ready'),
      otherReady = event(other, 'workflow.updates.ready');
    remote.connect();
    other.connect();
    await Promise.all([ready, otherReady]);
    const unexpected: unknown[] = [];
    other.on('workflow.status.changed', (value) => unexpected.push(value));
    const record = await run();
    const localEvent = event(local, 'workflow.status.changed'),
      remoteEvent = event(remote, 'workflow.status.changed');
    expect(
      (await callback({ runId: record.id, status: 'RUNNING' }, key)).status,
    ).toBe(200);
    expect(await localEvent).toEqual({ runId: record.id, status: 'RUNNING' });
    expect(await remoteEvent).toEqual({ runId: record.id, status: 'RUNNING' });
    await new Promise((resolve) => setTimeout(resolve, 75));
    expect(unexpected).toEqual([]);
    local.disconnect();
    remote.disconnect();
    other.disconnect();
  });
  it('does not allow client-chosen rooms or tenant overrides in the socket handshake', async () => {
    const a = client(await token(0), { organizationId: organizations[1] });
    const ready = event(a, 'workflow.updates.ready');
    a.connect();
    await ready;
    a.emit('join', `org:${organizations[1]}:workflow-updates`);
    const b = await connect(1),
      record = await run(1),
      leaked: unknown[] = [];
    a.on('workflow.status.changed', (value) => leaked.push(value));
    const received = event(b, 'workflow.status.changed');
    expect(
      (await callback({ runId: record.id, status: 'RUNNING' }, key)).status,
    ).toBe(200);
    await received;
    await new Promise((resolve) => setTimeout(resolve, 75));
    expect(leaked).toEqual([]);
    a.disconnect();
    b.disconnect();
  });
  it('rejects stale callbacks and never overwrites persisted state', async () => {
    const socket = await connect(),
      record = await run(0, 'SUCCESS'),
      updates: unknown[] = [];
    socket.on('workflow.status.changed', (value) => updates.push(value));
    expect(
      (await callback({ runId: record.id, status: 'RUNNING' }, key)).status,
    ).toBe(409);
    expect(
      (await db.workflowRun.findUniqueOrThrow({ where: { id: record.id } }))
        .status,
    ).toBe('SUCCESS');
    expect(redis.del).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
    socket.disconnect();
  });
  it('rejects unknown runs and malformed callback input', async () => {
    expect(
      (await callback({ runId: randomUUID(), status: 'RUNNING' }, key)).status,
    ).toBe(404);
    expect(
      (await callback({ runId: 'invalid', status: 'RUNNING' }, key)).status,
    ).toBe(400);
    expect(
      (await callback({ runId: randomUUID(), status: 'INVENTED' }, key)).status,
    ).toBe(400);
    expect(redis.del).not.toHaveBeenCalled();
  });
  it('does not emit while an active cache cannot be invalidated', async () => {
    const socket = await connect(),
      record = await run(),
      updates: unknown[] = [];
    socket.on('workflow.status.changed', (value) => updates.push(value));
    redis.del.mockResolvedValue(false);
    expect(
      (await callback({ runId: record.id, status: 'RUNNING' }, key)).status,
    ).toBe(503);
    expect(updates).toEqual([]);
    socket.disconnect();
  });
  it('reports subscriber outages as unready and resynchronizes sockets after reconnect', async () => {
    const socket = await connect();
    expect((await fetch(`${origin}/api/v1/health/ready`)).status).toBe(200);
    const resynchronized = event(socket, 'workflow.updates.resync', 7000);
    const subscriber = app.get(WorkflowFanoutService);
    await (subscriber as any).client.end();
    expect((await fetch(`${origin}/api/v1/health/ready`)).status).toBe(503);
    await resynchronized;
    expect((await fetch(`${origin}/api/v1/health/ready`)).status).toBe(200);
    socket.disconnect();
  });
  it('disconnects an established socket at JWT expiry', async () => {
    const socket = client(await token(0, 2));
    const ready = event(socket, 'workflow.updates.ready');
    const disconnected = event<string>(socket, 'disconnect', 5000);
    socket.connect();
    await ready;
    expect(await disconnected).toBe('io server disconnect');
    expect(socket.connected).toBe(false);
  });
});
