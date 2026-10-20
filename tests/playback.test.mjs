import test from 'node:test';
import assert from 'node:assert/strict';
import { Playback } from '../src/application/playback.js';
import { TICKS } from '../src/domain/project.js';

test('共同播放时间从当前帧开始，暂停按选择帧定位，不改动作时序', () => {
  let time = 200;
  const clock = new Playback({ now: () => time });
  const group = { frames: [{ durationTicks: 5000 }, { durationTicks: 8000 }] };
  const original = structuredClone(group);
  assert.equal(clock.ticks(group, 1), 5000);
  clock.toggle(group, 1);
  time += 250;
  assert.equal(clock.ticks(group, 0), 5000 + TICKS / 4);
  clock.stop();
  assert.equal(clock.ticks(group, 0), 0);
  clock.toggle(group, 0);
  time += 1000;
  assert.equal(clock.ticks(group, 1), TICKS);
  assert.deepEqual(group, original);
});

test('播放循环重复启动只有一条调度，回调内销毁后不再排队', () => {
  const queued = new Map();
  let id = 0,
    calls = 0;
  const clock = new Playback({
    request: (callback) => {
      queued.set(++id, callback);
      return id;
    },
    cancel: (key) => queued.delete(key),
  });
  clock.startLoop(() => {
    calls++;
    clock.dispose();
  });
  clock.startLoop(() => {
    throw new Error('重复循环');
  });
  assert.equal(queued.size, 1);
  const tick = queued.get(1);
  queued.delete(1);
  tick();
  assert.equal(calls, 1);
  assert.equal(queued.size, 0);
  tick();
  assert.equal(calls, 1);
  clock.startLoop(() => calls++);
  assert.equal(queued.size, 1);
  clock.dispose();
  assert.equal(queued.size, 0);
});
