import test from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/application/session.js';
import { mountStageInteraction } from '../src/ui/stage-interaction.js';

function setup() {
  const session = new Session();
  session.edit((project) => {
    project.assets.push({ id: 'a', name: 'a.png', width: 40, height: 60, sha256: '0'.repeat(64) });
    project.groups.push({
      id: 'g',
      name: '动作',
      frames: [{ id: 'f', assetId: 'a', durationTicks: 5000 }],
      scale: 2,
      x: 7,
      y: 9,
      lockX: false,
      lockY: false,
      horizontal: false,
      anchors: [null],
    });
  });
  const canvas = { focus() {}, setPointerCapture() {}, addEventListener() {}, style: {} };
  const stage = {
    selected: true,
    toStage: (x, y) => ({ x, y }),
    hitTransform: () => 'move',
    hitImage: () => true,
  };
  const interaction = mountStageInteraction({
    canvas,
    stage,
    session,
    readContext: () => ({
      group: session.project.groups[0],
      frame: 0,
      scope: 'frame',
      busy: false,
    }),
    stop() {},
    draw() {},
    sync() {},
    onError(error) {
      throw error;
    },
  });
  return { session, canvas, interaction };
}
const pointer = (x, y) => ({ button: 0, pointerId: 1, clientX: x, clientY: y });

test('多次拖动预览不写历史，松手只提交一笔并保留整组参数', () => {
  const { session, canvas } = setup();
  const before = structuredClone(session.project);
  const history = session.undoStack.length;
  canvas.onpointerdown(pointer(0, 0));
  canvas.onpointermove(pointer(4, 6));
  canvas.onpointermove(pointer(10, 14));
  assert.equal(session.undoStack.length, history);
  assert.deepEqual(session.project, before);
  assert.equal(session.viewProject.groups[0].frames[0].horizontalOffset, 5);
  assert.equal(session.viewProject.groups[0].frames[0].verticalOffset, 7);
  canvas.onpointerup();
  assert.equal(session.undoStack.length, history + 1);
  assert.equal(session.project.groups[0].x, 7);
  session.undo();
  assert.deepEqual(session.project, before);
  assert.equal(session.viewProject, session.project);
  session.redo();
  assert.equal(session.project.groups[0].frames[0].horizontalOffset, 5);
});

test('取消及失去捕获恢复原快照，迟到松手不提交取消草稿', () => {
  const { session, canvas, interaction } = setup();
  const before = structuredClone(session.project);
  const history = session.undoStack.length;
  canvas.onpointerdown(pointer(0, 0));
  canvas.onpointermove(pointer(10, 14));
  canvas.onlostpointercapture();
  canvas.onpointerup();
  assert.equal(interaction.active, false);
  assert.deepEqual(session.project, before);
  assert.equal(session.undoStack.length, history);
});
