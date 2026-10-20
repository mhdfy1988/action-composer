import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, frameAt, duration, placement } from '../src/domain/project.js';
import { horizontalCorrection, allMarked } from '../src/domain/horizontal-motion.js';
import { validateProject } from '../src/infrastructure/validation.js';
import { Session } from '../src/application/session.js';

export function fixture() {
  const p = newProject();
  p.assets = [
    { id: 'a', name: 'a.png', width: 40, height: 60, sha256: '0'.repeat(64) },
    { id: 'b', name: 'b.png', width: 60, height: 80, sha256: '1'.repeat(64) },
  ];
  p.groups = [
    {
      id: 'g',
      name: '跳跃',
      frames: [
        { assetId: 'a', durationTicks: 5000 },
        { assetId: 'b', durationTicks: 10000 },
      ],
      scale: 1,
      x: 0,
      y: 0,
      lockX: false,
      lockY: false,
      horizontal: false,
      anchors: [null, null],
    },
  ];
  return p;
}
test('协议支持不同尺寸、不等帧时长和独立动作组', () => {
  const p = fixture();
  p.groups.push({ ...structuredClone(p.groups[0]), id: 'g2', x: 20 });
  validateProject(p);
  assert.notEqual(p.groups[0].x, p.groups[1].x);
});
test('输入格式、未来版本、引用、重复身份和标点错误显式拒绝', () => {
  for (const change of [
    (p) => (p.version = 2),
    (p) => (p.groups[0].frames[0].assetId = 'missing'),
    (p) => p.assets.push(p.assets[0]),
    (p) => (p.groups[0].horizontal = true),
    (p) => (p.groups[0].anchors[0] = { x: 999, y: 0 }),
    (p) => (p.stage.width = NaN),
    (p) => (p.groups[0].frames[0].durationTicks = 0),
  ]) {
    const p = fixture();
    change(p);
    assert.throws(() => validateProject(p));
  }
});
test('时间半开边界、负数和多次循环定位稳定', () => {
  const g = fixture().groups[0];
  assert.equal(duration(g), 15000);
  for (const [time, index] of [
    [0, 0],
    [4999, 0],
    [5000, 1],
    [14999, 1],
    [15000, 0],
    [45000, 0],
    [-1, 1],
  ])
    assert.equal(frameAt(g, time), index);
});
test('不同画布尺寸共用底部中心，位置和缩放进入同一计算', () => {
  const p = fixture(),
    g = p.groups[0];
  g.scale = 2;
  g.x = 10;
  g.y = -20;
  assert.deepEqual(placement(p, g, 1), { x: 206, y: 300, width: 120, height: 160 });
});
test('迁入：腰点水平补偿计入缩放，不改纵向数据', () => {
  const g = {
    horizontal: true,
    scale: 2.7,
    frames: [{ width: 394 }, { width: 394 }],
    anchors: [
      { x: 200, y: 350 },
      { x: 230, y: 290 },
    ],
  };
  const before = structuredClone(g);
  assert.equal(horizontalCorrection(g, 1), -81);
  assert.deepEqual(g, before);
});
test('迁入：不同宽度的底部中心标点不制造位移', () => {
  const g = {
    horizontal: true,
    scale: 1,
    frames: [{ width: 400 }, { width: 600 }],
    anchors: [
      { x: 200, y: 300 },
      { x: 300, y: 300 },
    ],
  };
  assert.equal(horizontalCorrection(g, 1), 0);
  g.anchors[1] = null;
  assert.equal(allMarked(g), false);
  assert.throws(() => horizontalCorrection(g, 1));
  g.horizontal = false;
  assert.equal(horizontalCorrection(g, 1), 0);
});
test('动作可位于旧矩形外，不扩展或改写编辑坐标基准', () => {
  const p = fixture(),
    g = p.groups[0];
  g.x = -500;
  g.y = 100;
  const basis = structuredClone(p.stage);
  const a = placement(p, g, 0),
    b = placement(p, g, 1);
  validateProject(p);
  assert.deepEqual(p.stage, basis);
  assert.ok(a.x < 0);
  assert.equal(placement(p, g, 1).x - placement(p, g, 0).x, b.x - a.x);
});
test('编辑事务失败和空操作不进历史，撤销恢复正确跟随会话修改状态', () => {
  const s = new Session();
  assert.equal(s.dirty, false);
  assert.throws(() => s.edit((p) => (p.stage.width = -1)));
  assert.equal(s.undoStack.length, 0);
  s.edit(() => {});
  assert.equal(s.undoStack.length, 0);
  s.edit((p) => (p.name = '测试'));
  assert.equal(s.dirty, true);
  s.undo();
  assert.equal(s.dirty, false);
  s.redo();
  assert.equal(s.dirty, true);
  s.undo();
  s.edit((p) => (p.name = '新分支'));
  assert.equal(s.redoStack.length, 0);
});
test('大基准图引用不要求扩展编辑范围，不改变动作坐标', () => {
  const p = fixture();
  p.assets.push({ id: 'ref', name: 'ref.png', width: 1200, height: 1800, sha256: '2'.repeat(64) });
  p.reference = { assetId: 'ref', opacity: 0.4 };
  const before = structuredClone(p.groups);
  const basis = structuredClone(p.stage);
  validateProject(p);
  assert.deepEqual(p.groups, before);
  assert.deepEqual(p.stage, basis);
});
