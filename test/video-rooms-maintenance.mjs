import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runRoomMaintenance } from '../functions/video/rooms-maintenance.js';

test('room maintenance fails clearly when its provider key is absent', async () => {
  await assert.rejects(runRoomMaintenance({}, ''), /DAILY_API_KEY is unavailable/);
});

test('scheduled maintenance provisions a private class room without a long-lived host token', async () => {
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
      : {} };
  };
  try {
    await runRoomMaintenance(db, 'test-key', request);
  } finally {
    if (previousPool === undefined) delete process.env.CALL_POOL;
    else process.env.CALL_POOL = previousPool;
  }
  assert.equal(calls[0][0], 'https://api.daily.co/v1/rooms');
  assert.match(calls[1][0], /^https:\/\/api\.daily\.co\/v1\/meetings\?/);
  assert.equal(calls.filter(([url]) => url.includes('/meeting-tokens')).length, 0);
  assert(calls.every(([, , auth]) => auth === 'Bearer test-key'));
  assert.equal(calls[0][3].privacy, 'private');
  assert.equal(calls[0][3].properties.enable_knocking, false);
  assert.equal(writes[0][0], 'class');
  assert.equal(writes[0][1].video.url, 'https://rooms.example/c-class-one');
  assert.equal(writes[0][1].video.private, true);
  assert.equal(writes.length, 1);
});

test('legacy class room and its host pass are retired before the private replacement is published', async () => {
  const previousPool = process.env.CALL_POOL;
  process.env.CALL_POOL = '0';
  const writes = [];
  const calls = [];
  const video = { url: 'https://rooms.example/c-class-one', room: 'c-class-one', noChat: true };
  const host = {
    get: async () => ({ exists: true }),
    delete: async () => writes.push(['host-deleted']),
  };
  const klass = {
    id: 'class-one', data: () => ({ status: 'active', video }),
    ref: {
      collection: () => ({ doc: () => host }),
      set: async value => writes.push(['published', value]),
    },
  };
  const empty = { docs: [], size: 0 };
  const db = { collection: name => ({
    get: async () => name === 'classes' ? { docs: [klass] } : empty,
    where: () => ({ get: async () => name === 'classes' ? { docs: [klass] } : empty }),
  }) };
  try {
    await runRoomMaintenance(db, 'test-key', async (url, options) => {
      calls.push([url, options.method, options.body ? JSON.parse(options.body) : null]);
      return { ok: true, status: 200, json: async () => url.endsWith('/rooms')
        ? { url: 'https://rooms.example/c-class-one-secure' }
        : {} };
    });
  } finally {
    if (previousPool === undefined) delete process.env.CALL_POOL;
    else process.env.CALL_POOL = previousPool;
  }
  assert.equal(calls[0][0], 'https://api.daily.co/v1/rooms');
  assert.equal(calls[0][2].name, 'c-class-one-secure');
  assert.equal(calls[0][2].privacy, 'private');
  assert.deepEqual(calls[1].slice(0, 2), ['https://api.daily.co/v1/rooms/c-class-one', 'DELETE']);
  assert.equal(writes[0][0], 'published');
  assert.equal(writes[0][1].video.private, true);
  assert.equal(writes[0][1].video.room, 'c-class-one-secure');
  assert.deepEqual(writes[1], ['host-deleted']);
});

test('a failed legacy room deletion never publishes the replacement as secured', async () => {
  const previousPool = process.env.CALL_POOL;
  process.env.CALL_POOL = '0';
  const writes = [];
  const klass = {
    id: 'class-one', data: () => ({ video: { url: 'https://rooms.example/c-class-one', room: 'c-class-one' } }),
    ref: {
      collection: () => ({ doc: () => ({ get: async () => ({ exists: true }), delete: async () => writes.push('host-deleted') }) }),
      set: async () => writes.push('class-updated'),
    },
  };
  const empty = { docs: [], size: 0 };
  const db = { collection: name => ({
    get: async () => name === 'classes' ? { docs: [klass] } : empty,
    where: () => ({ get: async () => name === 'classes' ? { docs: [klass] } : empty }),
  }) };
  try {
    await runRoomMaintenance(db, 'test-key', async (url, options) => ({
      ok: options.method !== 'DELETE', status: options.method === 'DELETE' ? 503 : 200,
      json: async () => url.endsWith('/rooms') ? { url: 'https://rooms.example/c-class-one-secure' } : {},
    }));
  } finally {
    if (previousPool === undefined) delete process.env.CALL_POOL;
    else process.env.CALL_POOL = previousPool;
  }
  assert.deepEqual(writes, []);
});
