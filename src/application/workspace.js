import { createInspector } from '../ui/inspector.js';
import { createHeader } from '../ui/header.js';
import { createLibrary } from '../ui/library.js';
import { createToolbar } from '../ui/toolbar.js';
import { createViewport } from '../ui/viewport.js';
import { createTimeline } from '../ui/timeline.js';
import { createConfirmDialog } from '../ui/confirm-dialog.js';
import { mountShell } from '../ui/workspace-shell.js';
import { mountActionCommands } from './action-commands.js';
import { Playback } from './playback.js';
import { mountStageInteraction } from '../ui/stage-interaction.js';
import { mountImportController } from './import-controller.js';
import { mountExportController } from './export-controller.js';
import { Session } from './session.js';
import { TICKS, frameAt } from '../domain/project.js';
import { Stage } from '../ui/stage.js';
import { moveSelection } from '../domain/frame-edit.js';
import { reorderAction } from '../domain/action-operations.js';
import { frameKey, reorderFrames } from '../domain/frame-operations.js';
import { previewFrames, selectVisible } from '../domain/preview-frames.js';
import { alignAllFirstFrames } from './align-all-first-frames.js';

export function mountWorkspace() {
  const session = new Session(),
    media = new Map(),
    playback = new Playback();
  let selected = null,
    frame = 0,
    editScope = 'group',
    firstOverlay = false,
    task = null;
  let visible = new Set();
  const current = () => session.viewProject.groups.find((g) => g.id === selected);
  const header = createHeader({ onImport: () => importer.open(), onExport: () => exporter.open() });
  const viewport = createViewport({ onImport: () => importer.open() });
  const stage = new Stage(viewport.canvas);
  const toolbar = createToolbar({
    onFit: () => {
      stage.resetView();
      draw();
    },
    onAlign: alignFirst,
    onOverlay: (checked) => {
      firstOverlay = checked;
      draw();
    },
    onLock: (key, checked) =>
      groupEdit((group) => {
        group[key] = checked;
      }),
    onUndo: () => history('undo'),
    onRedo: () => history('redo'),
    onReset: resetAdjustments,
  });
  const inspector = createInspector({
    groupEdit,
    sync,
    readContext: () => ({ scope: editScope, frame }),
    onScope: (scope) => {
      if (task) return;
      endGesture();
      stop();
      editScope = scope;
      stage.selected = true;
      sync();
      viewport.focus();
    },
  });
  const timeline = createTimeline({
    onSelect: selectFrame,
    onReorder: reorderFrame,
    onAction: (action, index) => (action === 'copy' ? copyFrame(index) : deleteFrame(index)),
    onStep: (delta) => {
      const group = current();
      if (group && !task) selectFrame((frame + delta + group.frames.length) % group.frames.length);
    },
    onPlay: () => {
      if (current() && !task) {
        playback.toggle(current(), frame);
        sync();
      }
    },
    onDuration: (value) =>
      groupEdit((group) => {
        group.frames[frame].durationTicks = Math.round((value * TICKS) / 1000);
      }),
    onFps: (fps) => {
      if (!Number.isInteger(fps) || fps < 1 || fps > 60) {
        sync();
        return;
      }
      groupEdit((group) => {
        for (const item of group.frames) item.durationTicks = Math.round(TICKS / fps);
      });
    },
    onCancel: () => task?.abort(),
  });
  const setStatus = timeline.setStatus;
  const library = createLibrary({
    onSelect: (id) => {
      endGesture();
      stop();
      selected = id;
      visible.add(id);
      frame = 0;
      sync();
    },
    onVisible: (id, checked) => {
      endGesture();
      const previous = selected;
      const ticks = current() ? playback.ticks(current(), frame) : 0;
      if (checked) visible.add(id);
      else visible.delete(id);
      selected = selectVisible(session.viewProject.groups, visible, selected);
      if (selected !== previous) frame = current() ? frameAt(current(), ticks) : 0;
      if (!selected) stop();
      sync();
    },
    onRename: (id) => renameAction(id),
    onDelete: (id) => deleteAction(id),
    onReorder: (source, target, after) => {
      if (task) return;
      endGesture();
      edit((project) => reorderAction(project, source, target, after));
    },
  });
  mountShell({
    header: header.element,
    library: library.element,
    toolbar: toolbar.element,
    viewport: viewport.element,
    inspector: inspector.element,
    timeline: timeline.element,
  });
  const confirmation = createConfirmDialog();
  const confirmAction = (title, text) => confirmation.open(title, text);
  const interaction = mountStageInteraction({
    canvas: viewport.canvas,
    stage,
    session,
    readContext: () => ({ group: current(), frame, scope: editScope, busy: Boolean(task) }),
    stop,
    draw,
    sync,
    onError: (error) => setStatus(error.message, true),
  });
  const endGesture = (cancel) => interaction.end(cancel);
  const importer = mountImportController({
    session,
    media,
    isBusy: () => Boolean(task),
    runTask,
    setStatus,
    onImported: (id) => {
      selected = id;
      visible.add(id);
      frame = 0;
    },
  });
  const exporter = mountExportController({
    session,
    media,
    current,
    isBusy: () => Boolean(task),
    runTask,
    endGesture,
    stop,
    setStatus,
  });
  const { renameAction, deleteAction, copyFrame, deleteFrame } = mountActionCommands({
    session,
    current,
    isBusy: () => Boolean(task),
    endGesture,
    stop,
    sync,
    edit,
    setStatus,
    confirmAction,
    selectFrame: (index) => {
      frame = index;
    },
    onActionDeleted: (id, index) => {
      visible.delete(id);
      if (selected === id) {
        selected =
          session.project.groups[Math.min(index, session.project.groups.length - 1)]?.id ?? null;
        if (selected) visible.add(selected);
        frame = 0;
      }
    },
  });
  function selectFrame(index) {
    if (task) return;
    endGesture();
    stop();
    frame = index;
    sync();
  }
  function reorderFrame(index, boundary) {
    if (task || !current()) return;
    endGesture();
    stop();
    const activeKey = frameKey(current().frames[frame], frame);
    try {
      session.edit((project) =>
        reorderFrames(
          project.groups.find((g) => g.id === selected),
          [index],
          boundary,
        ),
      );
      frame = current().frames.findIndex((f, i) => frameKey(f, i) === activeKey);
      sync();
      setStatus('已调整帧顺序，可撤销');
    } catch (error) {
      setStatus(error.message, true);
    }
  }
  function stop() {
    playback.stop();
    timeline.setPlaying(false);
  }
  function draw() {
    const display = session.viewProject,
      group = current();
    const ticks = group ? playback.ticks(group, frame) : 0;
    const unit = stage.render(display, group, frame, media, {
      samples: previewFrames(display.groups, visible, selected, frame, ticks),
      editable: !task && !playback.playing,
      scope: editScope,
      firstOverlay,
    });
    viewport.showScale(unit);
  }
  function sync() {
    const project = session.viewProject,
      group = current(),
      busy = Boolean(task);
    frame = group ? Math.min(frame, group.frames.length - 1) : 0;
    header.render({ hasGroup: Boolean(group), busy });
    inspector.render({ group, scope: editScope, frame, busy });
    toolbar.render({
      group,
      groupCount: project.groups.length,
      busy,
      scope: editScope,
      overlay: firstOverlay,
      canReset: Boolean(group && session.canReset(group.id, editScope, frame)),
      canUndo: Boolean(session.undoStack.length),
      canRedo: Boolean(session.redoStack.length),
    });
    timeline.render({ group, media, frame, busy, playing: playback.playing });
    library.render({ groups: project.groups, selected, visible, busy });
    viewport.render({ hasActions: Boolean(project.groups.length), scope: editScope });
    exporter.setBusy(busy);
    draw();
  }
  function edit(change) {
    if (task) return;
    endGesture();
    stop();
    try {
      session.edit(change);
      sync();
      setStatus('已修改');
    } catch (error) {
      sync();
      setStatus(error.message, true);
    }
  }
  function groupEdit(change) {
    edit((project) => {
      const group = project.groups.find((g) => g.id === selected);
      if (group) change(group, project);
    });
  }
  async function runTask(work) {
    if (task) return;
    endGesture();
    stop();
    const controller = new AbortController();
    task = controller;
    sync();
    try {
      await work(controller.signal);
    } catch (error) {
      setStatus(
        controller.signal.aborted ? '任务已取消，当前动作保留' : error.message,
        !controller.signal.aborted,
      );
    } finally {
      task = null;
      sync();
    }
  }
  function alignFirst() {
    if (task) return;
    endGesture();
    const referenceId = selected,
      base = session.project;
    runTask(async (signal) => {
      const result = await alignAllFirstFrames(base, referenceId, media, {
        signal,
        onProgress: ({ index, total, name, message }) =>
          setStatus(`首帧对齐 ${index}/${total} · ${name} · ${message}`),
      });
      signal.throwIfAborted();
      if (session.project !== base || selected !== referenceId)
        throw new Error('动作已变化，请重新匹配');
      if (result.updates.length) {
        session.edit((project) => {
          for (const update of result.updates)
            Object.assign(
              project.groups.find((group) => group.id === update.targetId),
              update.transform,
            );
        });
        frame = 0;
        stage.selected = true;
        stage.resetView();
      }
      const failed = result.failures.map((item) => `${item.name}：${item.message}`).join('；');
      setStatus(
        `首帧对齐完成 · 已对齐 ${result.updates.length} 个，失败 ${result.failures.length} 个${result.warnings.length ? ` · 请检查：${result.warnings.join('、')}` : ''}${failed ? ` · 保留原样：${failed}` : ''}`,
        result.failures.length > 0,
      );
    });
  }

  async function resetAdjustments() {
    if (task || !current()) return;
    endGesture();
    stop();
    const id = selected,
      scope = editScope,
      index = frame,
      base = session.project;
    const name = scope === 'group' ? '整组' : `第 ${index + 1} 帧`;
    if (
      !(await confirmAction(
        `重置${name}调整？`,
        scope === 'group'
          ? '回溯该动作的整组调整，保留各帧独立调整、素材和时长。可撤销。'
          : '仅回溯这一帧的横纵调整，保留整组及其他帧调整。可撤销。',
      ))
    )
      return;
    if (
      task ||
      session.project !== base ||
      selected !== id ||
      editScope !== scope ||
      frame !== index
    )
      return;
    session.resetScope(id, scope, index);
    sync();
    setStatus(`已重置${name}调整，可撤销`);
  }

  function repairSelection() {
    const groups = session.project.groups;
    visible = new Set([...visible].filter((id) => groups.some((g) => g.id === id)));
    if (!current()) {
      selected = groups.find((g) => visible.has(g.id))?.id ?? groups[0]?.id ?? null;
      if (selected) visible.add(selected);
      frame = 0;
    }
    frame = current() ? Math.min(frame, current().frames.length - 1) : 0;
  }

  function history(direction) {
    if (task) return;
    endGesture(true);
    stop();
    session[direction]();
    repairSelection();
    sync();
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      endGesture(true);
      stop();
    }
    if (e.target.matches('input,textarea,select') || document.querySelector('dialog[open]') || task)
      return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      endGesture(true);
      stop();
      if (e.shiftKey) session.redo();
      else session.undo();
      repairSelection();
      sync();
    }
    const directions = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (
      directions[e.key] &&
      e.target === viewport.canvas &&
      stage.selected &&
      current() &&
      !playback.playing &&
      !interaction.active &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      e.preventDefault();
      const [x, y] = directions[e.key],
        step = e.shiftKey ? 10 : 1;
      groupEdit((g) => moveSelection(g, frame, { x: x * step, y: y * step }, editScope));
    }
  });
  window.addEventListener('blur', () => {
    endGesture(true);
    stop();
    sync();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      endGesture(true);
      stop();
    }
  });
  window.addEventListener('beforeunload', (e) => {
    if (session.dirty || task) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  viewport.observe(draw);
  sync();
  playback.startLoop(() => {
    const group = current();
    if (!playback.playing || !group) return;
    const next = frameAt(group, playback.ticks(group, frame));
    if (next !== frame) {
      frame = next;
      sync();
    } else if (visible.size > 1) draw();
  });
}
