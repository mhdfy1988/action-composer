import test from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/application/session.js';
import { newProject } from '../src/domain/project.js';

function fixture() {
  const p = newProject();
  p.assets = [{ id: 'a', name: 'a.png', width: 40, height: 80, sha256: 'a'.repeat(64) }];
  p.groups = [
    {
      id: 'g',
      name: '动作',
      scale: 1,
      x: 0,
      y: 0,
      lockX: false,
      lockY: false,
      horizontal: false,
      anchors: [null, null],
      frames: [
        { assetId: 'a', durationTicks: 5000 },
        { assetId: 'a', durationTicks: 5000 },
      ],
    },
  ];
  return p;
}

const setup = () => {
  const s = new Session();
  s.replace(fixture());
  return s;
};
test('先帧后组：按归属回溯，组重置不覆盖帧、时序、锁轴及其他组', () => {
  const s = setup(),
    initial = structuredClone(s.project.groups[0]);
  s.edit((p) => {
    p.groups.push({ ...structuredClone(p.groups[0]), id: 'other', x: 45 });
  });
  const other = structuredClone(s.project.groups[1]);
  s.edit((p) => {
    p.groups[0].frames[1].verticalOffset = 20;
  });
  s.edit((p) => {
    Object.assign(p.groups[0], { scale: 2, x: 15, y: -5, lockX: true });
  });
  s.edit((p) => {
    p.groups[0].frames[0].horizontalOffset = 3;
    p.groups[0].frames[1].durationTicks = 1234;
  });
  assert.equal(s.canReset('g', 'group'), true);
  s.resetScope('g', 'group');
  assert.deepEqual(
    [s.project.groups[0].scale, s.project.groups[0].x, s.project.groups[0].y],
    [initial.scale, initial.x, initial.y],
  );
  assert.equal(s.project.groups[0].frames[1].verticalOffset, 20);
  assert.equal(s.project.groups[0].frames[0].horizontalOffset, 3);
  assert.equal(s.project.groups[0].frames[1].durationTicks, 1234);
  assert.equal(s.project.groups[0].lockX, true);
  assert.deepEqual(s.project.groups[1], other);
  assert.equal(s.canReset('g', 'group'), false);
  s.undo();
  assert.equal(s.project.groups[0].scale, 2);
  s.redo();
  assert.equal(s.project.groups[0].scale, initial.scale);
  s.resetScope('g', 'frame', 1);
  assert.equal(s.project.groups[0].frames[1].verticalOffset, undefined);
  assert.equal(s.project.groups[0].frames[0].horizontalOffset, 3);
});
test('先组后帧：帧重置仅回溯当前帧；恢复、分支和重复重置不串历史', () => {
  const s = setup();
  s.edit((p) => {
    p.groups[0].x = 30;
  });
  s.edit((p) => {
    p.groups[0].frames[0].verticalOffset = 7;
  });
  s.edit((p) => {
    p.groups[0].frames[1].verticalOffset = -9;
  });
  s.resetScope('g', 'frame', 0);
  assert.equal(s.project.groups[0].x, 30);
  assert.equal(s.project.groups[0].frames[1].verticalOffset, -9);
  assert.equal(s.project.groups[0].frames[0].verticalOffset, undefined);
  s.undo();
  assert.equal(s.project.groups[0].frames[0].verticalOffset, 7);
  s.redo();
  assert.equal(s.project.groups[0].frames[0].verticalOffset, undefined);
  const count = s.undoStack.length;
  assert.equal(s.resetScope('g', 'frame', 0), false);
  assert.equal(s.undoStack.length, count);
  s.undo();
  s.edit((p) => {
    p.groups[0].frames[0].verticalOffset = 12;
  });
  assert.equal(s.redoStack.length, 0);
  s.resetScope('g', 'frame', 0);
  assert.equal(s.project.groups[0].frames[0].verticalOffset, undefined);
});
test('以已有非零初值为回溯起点，超过80笔撤销窗口仍保留轻量范围记录', () => {
  const s = setup();
  s.project.groups[0].x = 17;
  s.project.groups[0].frames[0].verticalOffset = 6;
  for (let i = 0; i < 90; i++)
    s.edit((p) => {
      p.groups[0].x += 1;
    });
  assert.equal(s.undoStack.length, 80);
  s.resetScope('g', 'group');
  assert.equal(s.project.groups[0].x, 17);
  s.edit((p) => {
    p.groups[0].frames[0].verticalOffset = 10;
  });
  s.resetScope('g', 'frame', 0);
  assert.equal(s.project.groups[0].frames[0].verticalOffset, 6);
});
