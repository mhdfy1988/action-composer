import { createView } from './dom.js';
import { moveSelection } from '../domain/frame-edit.js';

export function createInspector({ groupEdit, sync, readContext, onScope }) {
  const { element, get: $ } = createView(`<aside class="inspector">
        <div class="scope-switch" role="group" aria-label="编辑范围">
          <button id="editGroup" aria-pressed="true">整组</button>
          <button id="editFrame" aria-pressed="false">当前帧</button>
        </div>
        <fieldset id="groupFields" disabled>
          <section class="adjust-section" aria-labelledby="frameAdjustTitle">
            <div class="section-heading">
              <h2 id="frameAdjustTitle">整组调整</h2>
              <output id="editFrameInfo" class="muted">—</output>
            </div>
            <label id="groupScaleField"
              >缩放 / %<input
                id="groupScale"
                type="number"
                min="1"
                max="2000"
                step="any"
                value="100"
            /></label>
            <label
              ><span id="horizontalLabel">水平位置 / px</span
              ><input id="horizontalOffset" type="number" step="any" value="0"
            /></label>
            <label
              ><span id="verticalLabel">纵向位置 / px</span
              ><input id="verticalOffset" type="number" step="any" value="0"
            /></label>
          </section>
        </fieldset>
      </aside>`);

  $('groupScale').onchange = (event) => {
    const value = Number(event.target.value);
    if (!event.target.value || !Number.isFinite(value) || value < 1 || value > 2000) {
      sync();
      return;
    }
    groupEdit((g) => {
      g.scale = value / 100;
    });
  };
  $('verticalOffset').onchange = (event) => {
    const value = Number(event.target.value);
    if (!event.target.value || !Number.isFinite(value)) {
      sync();
      return;
    }
    groupEdit((g) => {
      if (g.lockY) return;
      const { scope: editScope, frame } = readContext();
      if (editScope === 'group') g.y = value;
      else
        moveSelection(
          g,
          frame,
          { x: 0, y: value - (g.frames[frame].verticalOffset ?? 0) * g.scale },
          'frame',
        );
    });
  };
  $('horizontalOffset').onchange = (event) => {
    const value = Number(event.target.value);
    if (!event.target.value || !Number.isFinite(value)) {
      sync();
      return;
    }
    groupEdit((g) => {
      if (g.lockX) return;
      const { scope: editScope, frame } = readContext();
      if (editScope === 'group') g.x = value;
      else
        moveSelection(
          g,
          frame,
          { x: value - (g.frames[frame].horizontalOffset ?? 0) * g.scale, y: 0 },
          'frame',
        );
    });
  };
  for (const [id, scope] of [
    ['editGroup', 'group'],
    ['editFrame', 'frame'],
  ])
    $(id).onclick = () => onScope(scope);
  return {
    element,
    render({ group: g, scope: editScope, frame, busy }) {
      $('groupFields').disabled = !g || busy;
      const isGroup = editScope === 'group';
      $('frameAdjustTitle').textContent = isGroup ? '整组调整' : '当前帧调整';
      $('editFrameInfo').hidden = isGroup;
      $('groupScaleField').hidden = !isGroup;
      $('groupScale').disabled = !g || busy || !isGroup;
      $('groupScale').value = g ? Number((g.scale * 100).toFixed(4)) : '';
      $('horizontalLabel').textContent = isGroup ? '水平位置 / px' : '水平修正 / px';
      $('verticalLabel').textContent = isGroup ? '纵向位置 / px' : '纵向修正 / px';
      for (const [id, scope] of [
        ['editGroup', 'group'],
        ['editFrame', 'frame'],
      ]) {
        $(id).disabled = !g || busy;
        $(id).setAttribute('aria-pressed', String(editScope === scope));
      }
      $('horizontalOffset').value = g
        ? Number((isGroup ? g.x : (g.frames[frame].horizontalOffset ?? 0) * g.scale).toFixed(3))
        : '';
      $('horizontalOffset').disabled = !g || g.lockX || busy;
      $('verticalOffset').value = g
        ? Number((isGroup ? g.y : (g.frames[frame].verticalOffset ?? 0) * g.scale).toFixed(3))
        : '';
      $('verticalOffset').disabled = !g || g.lockY || busy;
      $('editFrameInfo').textContent = g ? `第 ${frame + 1} 帧` : '—';
    },
  };
}
