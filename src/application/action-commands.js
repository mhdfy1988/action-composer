import { captureFrame, pasteFrame, deleteFrames } from '../domain/frame-operations.js';
import { createRenameDialog } from '../ui/rename-dialog.js';

// 命令提交沿用Session；选择变化由工作台协调，不另存业务状态。
export function mountActionCommands({
  session,
  current,
  isBusy,
  endGesture,
  stop,
  sync,
  edit,
  selectFrame,
  onActionDeleted,
  setStatus,
  confirmAction,
}) {
  const renameDialog = createRenameDialog();
  function renameAction(id) {
    if (isBusy()) return;
    endGesture();
    stop();
    renameDialog.open(session.project.groups.find((g) => g.id === id).name, (name) => {
      edit((p) => {
        const group = p.groups.find((g) => g.id === id);
        if (group) group.name = name;
      });
    });
  }
  async function deleteAction(id) {
    if (isBusy()) return;
    endGesture();
    stop();
    const base = session.project,
      index = base.groups.findIndex((g) => g.id === id),
      group = base.groups[index];
    if (
      !group ||
      !(await confirmAction(`删除动作“${group.name}”？`, '移除此动作及其全部帧，可撤销。'))
    )
      return;
    if (isBusy() || session.project !== base) return;
    session.edit((p) => {
      p.groups = p.groups.filter((g) => g.id !== id);
    });
    onActionDeleted(id, index);
    sync();
    setStatus('已删除动作，可撤销');
  }
  function copyFrame(index) {
    const g = current();
    if (!g || isBusy()) return;
    endGesture();
    stop();
    selectFrame(index);
    const snapshot = captureFrame(g, index);
    try {
      let next;
      session.edit((p) => {
        next = pasteFrame(
          p.groups.find((g) => g.id === current().id),
          index,
          snapshot,
          crypto.randomUUID(),
        );
      });
      selectFrame(next);
      sync();
      setStatus('已在当前帧后创建副本，可撤销');
    } catch (e) {
      setStatus(e.message, true);
    }
  }
  async function deleteFrame(index) {
    if (isBusy() || !current()) return;
    endGesture();
    stop();
    selectFrame(index);
    sync();
    const base = session.project,
      id = current().id,
      indices = [index];
    if (indices.length === current().frames.length) {
      await deleteAction(id);
      return;
    }
    if (!(await confirmAction(`删除第 ${index + 1} 帧？`, '删除后可撤销。每个动作至少保留一帧。')))
      return;
    if (isBusy() || session.project !== base || current()?.id !== id) return;
    try {
      session.edit((p) =>
        deleteFrames(
          p.groups.find((g) => g.id === id),
          indices,
        ),
      );
      selectFrame(Math.min(indices[0], current().frames.length - 1));
      sync();
      setStatus('已删除当前帧，可撤销');
    } catch (e) {
      setStatus(e.message, true);
    }
  }

  return { renameAction, deleteAction, copyFrame, deleteFrame };
}
