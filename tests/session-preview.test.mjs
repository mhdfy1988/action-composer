import test from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/application/session.js';

test('预览不修改正式快照和历史；确认仅提交最终草稿一笔', () => {
  const session = new Session(),
    original = session.project;
  const token = session.beginPreview();
  session.updatePreview(token, (p) => {
    p.name = '预览一';
  });
  session.updatePreview(token, (p) => {
    p.name = '预览二';
  });
  assert.equal(session.project, original);
  assert.equal(session.dirty, false);
  assert.equal(session.undoStack.length, 0);
  assert.equal(session.viewProject.name, '预览二');
  assert.throws(
    () =>
      session.edit((p) => {
        p.name = '冲突编辑';
      }),
    /预览/,
  );
  assert.equal(session.commitPreview(token), true);
  assert.equal(session.undoStack.length, 1);
  assert.equal(session.viewProject, session.project);
  assert.equal(session.project.name, '预览二');
  assert.equal(session.commitPreview(token), false);
  session.undo();
  assert.equal(session.project, original);
  session.redo();
  assert.equal(session.project.name, '预览二');
});

test('取消、历史切换和非法确认均不发布草稿，旧令牌不能影响新预览', () => {
  const session = new Session(),
    original = session.project;
  const first = session.beginPreview();
  session.updatePreview(first, (p) => {
    p.name = '不提交';
  });
  session.cancelPreview(first);
  const second = session.beginPreview();
  assert.equal(
    session.updatePreview(first, () => {
      throw new Error('旧任务执行');
    }),
    false,
  );
  assert.equal(session.cancelPreview(first), false);
  assert.equal(session.commitPreview(first), false);
  session.updatePreview(second, (p) => {
    p.name = '第二次';
  });
  session.undo();
  assert.equal(session.commitPreview(second), false);
  assert.equal(session.project, original);
  const invalid = session.beginPreview();
  session.updatePreview(invalid, (p) => {
    p.version = 999;
  });
  assert.throws(() => session.commitPreview(invalid));
  assert.equal(session.project, original);
  assert.equal(session.viewProject, original);
  assert.equal(session.undoStack.length, 0);
});
