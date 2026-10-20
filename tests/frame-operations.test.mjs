import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureFrame,
  pasteFrame,
  deleteFrames,
  reorderFrames,
} from '../src/domain/frame-operations.js';
import { moveSelection } from '../src/domain/frame-edit.js';
import { Session } from '../src/application/session.js';
import { newProject } from '../src/domain/project.js';
function fixture() {
  const p = newProject();
  p.assets = [{ id: 'a', name: 'a.png', width: 40, height: 80, sha256: 'a'.repeat(64) }];
  p.groups = [
    {
      id: 'g',
      name: '动作',
      scale: 2,
      x: 0,
      y: 0,
      lockX: false,
      lockY: false,
      horizontal: false,
      frames: [0, 1, 2, 3].map((i) => ({
        id: `f${i}`,
        assetId: 'a',
        durationTicks: 1000 * (i + 1),
        verticalOffset: i * 10,
      })),
      anchors: [null, null, null, null],
    },
  ];
  return p;
}
test('不连续多帧排序保留原相对顺序、修正和时长，拖回原位不变', () => {
  const g = fixture().groups[0];
  reorderFrames(g, [0, 2], 4);
  assert.deepEqual(
    g.frames.map((f) => f.id),
    ['f1', 'f3', 'f0', 'f2'],
  );
  assert.deepEqual(
    g.frames.map((f) => f.durationTicks),
    [2000, 4000, 1000, 3000],
  );
  const before = structuredClone(g);
  reorderFrames(g, [2, 3], 4);
  assert.deepEqual(g, before);
});
test('复制只取快照，粘贴到指定帧后，保留参数且身份独立；守住帧预算', () => {
  const g = fixture().groups[0];
  g.anchors[1] = { x: 2, y: 5 };
  const clipboard = captureFrame(g, 1),
    before = structuredClone(g);
  assert.deepEqual(g, before);
  assert.equal(pasteFrame(g, 3, clipboard, 'copy0'), 4);
  assert.deepEqual(
    g.frames.map((f) => f.id),
    ['f0', 'f1', 'f2', 'f3', 'copy0'],
  );
  assert.equal(g.frames[4].verticalOffset, 10);
  assert.equal(g.frames[4].assetId, 'a');
  assert.notEqual(g.anchors[4], g.anchors[1]);
  deleteFrames(g, [1]);
  assert.equal(g.frames.length, g.anchors.length);
  assert.deepEqual(
    g.frames.map((f) => f.id),
    ['f0', 'f2', 'f3', 'copy0'],
  );
  assert.throws(() => deleteFrames(g, [0, 1, 2, 3]));
  const full = fixture().groups[0];
  full.frames = Array(120).fill(full.frames[0]);
  assert.throws(() => pasteFrame(full, 0, clipboard, 'x'));
  const other = fixture().groups[0];
  pasteFrame(other, 0, clipboard, 'cross');
  assert.equal(other.frames[1].verticalOffset, 10);
  assert.deepEqual(clipboard.frame, before.frames[1]);
});
test('单帧移动不影响其他帧，遵守锁轴，一次事务可撤销恢复', () => {
  const s = new Session();
  s.replace(fixture());
  s.edit((p) => moveSelection(p.groups[0], 2, { x: 6, y: 8 }, 'frame'));
  const g = s.project.groups[0];
  assert.deepEqual(
    g.frames.map((f) => f.verticalOffset),
    [0, 10, 24, 30],
  );
  assert.equal(g.frames[2].horizontalOffset, 3);
  assert.equal(g.frames[0].horizontalOffset, undefined);
  s.undo();
  assert.equal(s.project.groups[0].frames[0].verticalOffset, 0);
  s.redo();
  assert.equal(s.project.groups[0].frames[2].verticalOffset, 24);
  g.lockY = true;
  moveSelection(g, 2, { x: 0, y: 10 }, 'frame');
  assert.equal(g.frames[2].verticalOffset, 24);
});
test('排序删除后重置跟随帧身份，不把结构变化记录成修正；复制基线独立', () => {
  const s = new Session();
  s.replace(fixture());
  s.edit((p) => moveSelection(p.groups[0], 2, { x: 0, y: 14 }, 'frame'));
  s.edit((p) => reorderFrames(p.groups[0], [2], 0));
  assert.equal(s.project.groups[0].frames[0].id, 'f2');
  assert.equal(s.canReset('g', 'frame', 1), false);
  assert.equal(s.canReset('g', 'frame', 0), true);
  s.resetScope('g', 'frame', 0);
  assert.equal(s.project.groups[0].frames[0].verticalOffset, 20);
  s.undo();
  s.edit((p) => pasteFrame(p.groups[0], 0, captureFrame(p.groups[0], 0), 'copy'));
  assert.equal(s.canReset('g', 'frame', 1), false);
  s.edit((p) => deleteFrames(p.groups[0], [2]));
  s.resetScope('g', 'frame', 0);
  assert.equal(s.project.groups[0].frames[0].verticalOffset, 20);
});
