import test from 'node:test';
import assert from 'node:assert/strict';
import { moveSelection } from '../src/domain/frame-edit.js';
import { placement, newProject } from '../src/domain/project.js';
import { matchedTransform } from '../src/domain/matched-transform.js';
import { Session } from '../src/application/session.js';

function fixture() {
  const p = newProject();
  p.assets = [{ id: 'a', name: 'a.png', width: 40, height: 80, sha256: 'a'.repeat(64) }];
  p.groups = [
    {
      id: 'g',
      name: '动作',
      frames: [
        { assetId: 'a', durationTicks: 5000 },
        { assetId: 'a', durationTicks: 5000 },
      ],
      scale: 2,
      x: 3,
      y: 5,
      lockX: false,
      lockY: false,
      horizontal: false,
      anchors: [null, null],
    },
  ];
  return p;
}
test('单帧位移按舞台像素换算，整组及其他帧不变，锁轴通用', () => {
  const p = fixture(),
    g = p.groups[0],
    before = placement(p, g, 1);
  moveSelection(g, 1, { x: 10, y: -6 }, 'frame');
  assert.equal(g.frames[1].horizontalOffset, 5);
  assert.equal(g.frames[1].verticalOffset, -3);
  assert.equal(placement(p, g, 1).x - before.x, 10);
  assert.equal(placement(p, g, 1).y - before.y, -6);
  assert.equal(g.frames[0].verticalOffset, undefined);
  assert.equal(g.x, 3);
  g.lockX = true;
  moveSelection(g, 1, { x: 20, y: 2 }, 'frame');
  assert.equal(g.frames[1].horizontalOffset, 5);
  assert.equal(g.frames[1].verticalOffset, -2);
  moveSelection(g, 1, { x: 20, y: 2 });
  assert.equal(g.x, 3);
  assert.equal(g.y, 7);
});
test('帧修正可撤销恢复；对齐使用已修正首帧且不清空任何帧修正', () => {
  const p = fixture(),
    s = new Session();
  s.replace(p);
  s.edit((draft) => moveSelection(draft.groups[0], 0, { x: 4, y: 8 }, 'frame'));
  const before = structuredClone(s.project.groups[0].frames);
  const reference = { ...p.groups[0], id: 'ref', x: 50, y: -20 };
  s.edit((draft) => {
    const g = draft.groups[0];
    Object.assign(g, matchedTransform(draft, g, reference, { scale: 1, tx: 0, ty: 0 }));
  });
  assert.deepEqual(s.project.groups[0].frames, before);
  assert.deepEqual(placement(s.project, s.project.groups[0], 0), placement(p, reference, 0));
  s.undo();
  assert.equal(s.project.groups[0].x, 3);
  s.undo();
  assert.equal(s.project.groups[0].frames[0].horizontalOffset, undefined);
  s.redo();
  assert.equal(s.project.groups[0].frames[0].horizontalOffset, 2);
});
