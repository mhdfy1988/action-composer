import test from 'node:test';
import assert from 'node:assert/strict';
import { gridPlan, manifestSheetPlan } from '../src/infrastructure/spritesheet-import.js';

const manifest = () => ({
  format: 'action-composer-spritesheet',
  version: 1,
  ticksPerSecond: 60000,
  sheet: { image: 'spritesheet.png', width: 32, height: 24 },
  stage: { width: 16, height: 12, originX: 3, originY: 8 },
  frames: [0, 1, 2].map((i) => ({
    image: 'spritesheet.png',
    durationTicks: 1000 + i * 1000,
    rect: { x: (i % 2) * 16, y: Math.floor(i / 2) * 12, width: 16, height: 12 },
  })),
});
test('网格按行优先切片，保留整格留白并排除尾部空格', () => {
  assert.deepEqual(
    gridPlan(32, 24, 2, 2, 3).frames.map((f) => f.rect),
    manifest().frames.map((f) => f.rect),
  );
  for (const args of [
    [32, 24, 3, 2, 3],
    [32, 24, 2, 2, 5],
    [32, 24, 0, 2, 2],
    [32, 24, 2, 2, 1.5],
    [32, 24, 2, 2, 121],
  ])
    assert.throws(() => gridPlan(...args));
});
test('精灵图清单保留时长和原点映射，不修改清单', () => {
  const m = manifest(),
    copy = structuredClone(m),
    plan = manifestSheetPlan(m, { name: 'spritesheet.png' }, 32, 24);
  assert.deepEqual(plan.origin, { x: 5, y: 4 });
  assert.deepEqual(
    plan.frames.map((f) => f.durationTicks),
    [1000, 2000, 3000],
  );
  assert.deepEqual(m, copy);
});
test('拒绝未知版本、缺图、尺寸不符、越界切片和不可信时长', () => {
  for (const mutate of [
    (m) => (m.version = 2),
    (m) => (m.frames[0].rect.x = 25),
    (m) => (m.frames[0].durationTicks = 0),
    (m) => (m.stage.width = 9),
    (m) => (m.sheet.image = '../spritesheet.png'),
    (m) => (m.stage.originY = Infinity),
  ]) {
    const m = manifest();
    mutate(m);
    assert.throws(() => manifestSheetPlan(m, { name: 'spritesheet.png' }, 32, 24));
  }
  assert.throws(() => manifestSheetPlan(manifest(), { name: 'wrong.png' }, 32, 24));
  assert.throws(() => manifestSheetPlan(manifest(), { name: 'spritesheet.png' }, 33, 24));
});
