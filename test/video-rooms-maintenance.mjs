import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runRoomMaintenance } from '../functions/video/rooms-maintenance.js';

test('room maintenance fails clearly when its provider key is absent', async () => {
  await assert.rejects(runRoomMaintenance({}, ''), /DAILY_API_KEY is unavailable/);
});

test('scheduled maintenance provisions a class room and its host token', async () => {
  const previousPool = process.env.CALL_POOL;
  process.env.CALL_POOL = '0';
  const writes = [];
  const calls = [];
  const empty = { docs: [], size: 0 };
  const host = { get: async () => ({ exists: false }), set: async value => writes.push(['host', value]) };
  const klass = {
    id: 'class-one',
    data: () => ({ status: 'active' }),
    ref: {
      collection: name => ({ doc: id => {
        assert.equal(name, 'video');
        assert.equal(id, 'host');
        return host;
      } }),
      set: async value => writes.push(['class', value]),
    },
  };
  const db = {
    collection: name => ({
      get: async () => name === 'classes' ? { docs: [klass] } : empty,
      where: () => ({ get: async () => name === 'classes' ? { docs: [klass] } : empty }),
      doc: () => { throw new Error('Unexpected room write'); },
    }),
  };
  const request = async (url, options) => {
    calls.push([url, options.method, options.headers.Authorization, options.body ? JSON.parse(options.body) : null]);
    return { ok: true, status: 200, json: async () => url.endsWith('/rooms')
      ? { url: 'https://rooms.example/c-class-one' }
      : { token: 'host-token' } };
  };
  try {
    await runRoomMaintenance(db, 'test-key', request);
  } finally {
    if (previousPool === undefined) delete process.env.CALL_POOL;
    else process.env.CALL_POOL = previousPool;
  }
  assert.deepEqual(calls.slice(0, 2).map(([url]) => url), ['https://api.daily.co/v1/rooms', 'https://api.daily.co/v1/meeting-tokens']);
  assert.match(calls[2][0], /^https:\/\/api\.daily\.co\/v1\/meetings\?/);
  assert(calls.every(([, , auth]) => auth === 'Bearer test-key'));
  assert.equal(calls[0][3].privacy, 'private');
  assert.equal(calls[0][3].properties.enable_knocking, false);
  assert.equal(writes[0][0], 'class');
  assert.equal(writes[0][1].video.url, 'https://rooms.example/c-class-one');
  assert.equal(writes[0][1].video.private, true);
  assert.equal(writes[1][0], 'host');
  assert.equal(writes[1][1].token, 'host-token');
});

test('existing public class room becomes private before it is marked secured', async () => {
  const previousPool = process.env.CALL_POOL;
  process.env.CALL_POOL = '0';
  const writes = [];
  const calls = [];
  const video = { url: 'https://rooms.example/c-class-one', room: 'c-class-one', noChat: true };
  const klass = {
    id: 'class-one', data: () => ({ status: 'active', video }),
    ref: {
      collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ exp: Math.floor(Date.now() / 1000) + 365 * 86400 }) }) }) }),
      set: async value => writes.push(value),
    },
  };
  const empty = { docs: [], size: 0 };
  const db = { collection: name => ({
    get: async () => name === 'classes' ? { docs: [klass] } : empty,
    where: () => ({ get: async () => name === 'classes' ? { docs: [klass] } : empty }),
  }) };
  try {
    await runRoomMaintenance(db, 'test-key', async (url, options) => {
      calls.push([url, options.body ? JSON.parse(options.body) : null]);
      return { ok: true, status: 200, json: async () => ({}) };
    });
  } finally {
    if (previousPool === undefined) delete process.env.CALL_POOL;
    else process.env.CALL_POOL = previousPool;
  }
  assert.equal(calls[0][0], 'https://api.daily.co/v1/rooms/c-class-one');
  assert.equal(calls[0][1].privacy, 'private');
  assert.equal(calls[0][1].properties.enable_knocking, false);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].video.private, true);
});
