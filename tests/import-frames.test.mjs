import test from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/application/session.js';
import { importFrames } from '../src/application/import-frames.js';

const file = (name) => ({
  name,
  size: 1,
  async arrayBuffer() {
    return new Uint8Array([1]).buffer;
  },
});
function setup() {
  const session = new Session(),
    media = new Map(),
    closes = [];
  let id = 0;
  const dependencies = {
    createId: () => String(++id),
    decode: async (bytes, name) => ({
      asset: { id: name.replace('.png', ''), name, width: 40, height: 60, sha256: '0'.repeat(64) },
      bytes,
      image: {
        close() {
          closes.push(name);
        },
      },
    }),
  };
  const input = {
    session,
    media,
    files: [file('b.png'), file('a.png')],
    timings: new Map([
      ['b.png', 8000],
      ['a.png', 5000],
    ]),
    name: '动作',
    fps: 12,
  };
  return { session, media, closes, dependencies, input };
}

test('无DOM导入保留顺序时长和原点，一笔提交后媒体仍供撤销恢复使用', async () => {
  const { session, media, closes, dependencies, input } = setup();
  let sourceClosed = 0;
  input.source = {
    image: {
      close() {
        sourceClosed++;
      },
    },
  };
  input.plan = { frames: [{ rect: { width: 40, height: 60 } }], origin: { x: 9, y: -3 } };
  dependencies.slice = async () => ({ files: input.files, timings: input.timings });
  const result = await importFrames(input, dependencies);
  assert.equal(result.count, 2);
  assert.equal(result.usesTimings, true);
  const group = session.project.groups[0];
  assert.equal(group.id, result.id);
  assert.deepEqual(
    group.frames.map((f) => [f.assetId, f.durationTicks]),
    [
      ['b', 8000],
      ['a', 5000],
    ],
  );
  assert.deepEqual([group.x, group.y], [9, -3]);
  assert.deepEqual(session.project.stage, { width: 104, height: 124, originX: 52, originY: 92 });
  assert.equal(session.undoStack.length, 1);
  assert.equal(media.size, 2);
  assert.deepEqual(closes, []);
  assert.equal(sourceClosed, 1);
  session.undo();
  assert.equal(session.project.groups.length, 0);
  assert.equal(media.size, 2);
  session.redo();
  assert.equal(session.project.groups[0].frames.length, 2);
});

test('解码失败、预算拒绝、无效提交均释放本次位图且不留半组', async () => {
  for (const mode of ['decode', 'budget', 'validation']) {
    const { session, media, closes, dependencies, input } = setup();
    const original = session.project,
      decode = dependencies.decode;
    if (mode === 'decode')
      dependencies.decode = async (bytes, name) => {
        if (name === 'a.png') throw new Error('坏图');
        return decode(bytes, name);
      };
    if (mode === 'budget')
      dependencies.checkBudget = () => {
        throw new Error('预算');
      };
    if (mode === 'validation') input.timings.set('a.png', -1);
    await assert.rejects(importFrames(input, dependencies));
    assert.equal(session.project, original);
    assert.equal(session.undoStack.length, 0);
    assert.equal(media.size, 0);
    assert.deepEqual(closes, mode === 'validation' ? ['b.png', 'a.png'] : ['b.png']);
  }
});

test('解码过程中取消，迟到位图关闭且不提交；切片失败也释放源图', async () => {
  const { session, media, closes, dependencies, input } = setup();
  const controller = new AbortController(),
    decode = dependencies.decode;
  input.signal = controller.signal;
  dependencies.decode = async (bytes, name) => {
    const item = await decode(bytes, name);
    controller.abort();
    return item;
  };
  await assert.rejects(importFrames(input, dependencies), { name: 'AbortError' });
  assert.equal(session.project.groups.length, 0);
  assert.equal(media.size, 0);
  assert.deepEqual(closes, ['b.png']);
  let closed = 0;
  input.signal = undefined;
  input.plan = { frames: [{ rect: { width: 40, height: 60 } }] };
  input.source = {
    image: {
      close() {
        closed++;
      },
    },
  };
  dependencies.slice = async () => {
    throw new Error('切片失败');
  };
  await assert.rejects(importFrames(input, dependencies), /切片失败/);
  assert.equal(closed, 1);
  assert.equal(session.undoStack.length, 0);
});

test('等待期间正式会话改变则拒绝发布，保留已有素材与新修改', async () => {
  const { session, media, closes, dependencies, input } = setup();
  const decode = dependencies.decode;
  media.set('existing', { bytes: new Uint8Array([1]), asset: { width: 1, height: 1 } });
  dependencies.decode = async (bytes, name) => {
    const item = await decode(bytes, name);
    if (name === 'a.png')
      session.edit((p) => {
        p.name = '其他修改';
      });
    return item;
  };
  await assert.rejects(importFrames(input, dependencies), /会话已变化/);
  assert.equal(session.project.name, '其他修改');
  assert.equal(session.project.groups.length, 0);
  assert.equal(media.size, 1);
  assert.equal(session.undoStack.length, 1);
  assert.deepEqual(closes, ['b.png', 'a.png']);
});
