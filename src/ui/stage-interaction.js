import { moveSelection } from '../domain/frame-edit.js';
import { resizeGroup } from '../domain/transform.js';

// 手势只保留命中与起点，草稿和正式数据由Session分别管理。
export function mountStageInteraction({
  canvas,
  stage,
  session,
  readContext,
  stop,
  draw,
  sync,
  onError,
}) {
  let gesture = null;
  canvas.onpointerdown = (e) => {
    const { group: g, frame, scope: editScope, busy } = readContext();
    if (busy || gesture || e.button !== 0) return;
    canvas.focus({ preventScroll: true });
    const point = stage.toStage(e.clientX, e.clientY);
    if (!point) return;
    stop();
    draw();
    let hit = stage.hitTransform(e.clientX, e.clientY);
    if (editScope === 'frame' && g && stage.hitImage(e.clientX, e.clientY)) {
      stage.selected = true;
      hit = 'move';
    }
    if (!hit) {
      if (g && stage.hitImage(e.clientX, e.clientY)) {
        stage.selected = true;
        draw();
        return;
      }
      stage.selected = false;
      gesture = {
        pointerId: e.pointerId,
        hit: 'pan',
        clientX: e.clientX,
        clientY: e.clientY,
        pan: { ...stage.pan },
      };
      canvas.setPointerCapture(e.pointerId);
      draw();
      return;
    }
    gesture = {
      pointerId: e.pointerId,
      point,
      token: session.beginPreview(),
      groupId: g.id,
      hit,
      frame,
      scope: editScope,
    };
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove = (e) => {
    if (!gesture) {
      const hit = stage.hitTransform(e.clientX, e.clientY);
      canvas.style.cursor =
        hit === 'move'
          ? 'move'
          : hit
            ? hit === 'nw' || hit === 'se'
              ? 'nwse-resize'
              : 'nesw-resize'
            : stage.hitImage(e.clientX, e.clientY)
              ? 'pointer'
              : 'grab';
      return;
    }
    if (e.pointerId !== gesture.pointerId || readContext().busy) return;
    if (gesture.hit === 'pan') {
      stage.pan = {
        x: gesture.pan.x + e.clientX - gesture.clientX,
        y: gesture.pan.y + e.clientY - gesture.clientY,
      };
      canvas.style.cursor = 'grabbing';
      draw();
      return;
    }
    const point = stage.toStage(e.clientX, e.clientY),
      g = readContext().group;
    if (!point || !g) return;
    const delta = { x: point.x - gesture.point.x, y: point.y - gesture.point.y };
    session.updatePreview(gesture.token, (draft) => {
      const target = draft.groups.find((g) => g.id === gesture.groupId);
      if (gesture.hit === 'move') moveSelection(target, gesture.frame, delta, gesture.scope);
      else
        Object.assign(
          target,
          resizeGroup(session.project, target, gesture.frame, gesture.hit, delta),
        );
    });
    sync();
  };
  function end(cancel = false) {
    if (!gesture) return;
    if (gesture.hit === 'pan') {
      if (cancel) stage.pan = gesture.pan;
      gesture = null;
      draw();
      return;
    }
    const token = gesture.token;
    gesture = null;
    try {
      if (cancel) session.cancelPreview(token);
      else session.commitPreview(token);
    } catch (e) {
      onError(e);
    }
    sync();
  }
  canvas.onpointerup = () => end();
  canvas.onpointercancel = () => end(true);
  canvas.onlostpointercapture = () => end(true);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (gesture) return;
      stage.zoom = Math.max(0.25, Math.min(8, stage.zoom * Math.exp(-e.deltaY * 0.001)));
      draw();
    },
    { passive: false },
  );
  canvas.ondblclick = () => {
    stage.resetView();
    draw();
  };

  return {
    end,
    get active() {
      return Boolean(gesture);
    },
  };
}
