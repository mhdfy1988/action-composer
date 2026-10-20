import { createView } from './dom.js';

export function createToolbar({ onFit, onAlign, onOverlay, onLock, onUndo, onRedo, onReset }) {
  const { element, get: $ } = createView(`<div class="toolbar">
          <strong id="activeAction">未选择动作</strong>
          <div class="spacer"></div>
          <button
            id="fitView"
            class="icon-button"
            data-icon="fit"
            aria-label="适合视图"
            title="适合视图"
          >
            适合视图
          </button>
          <label class="icon-toggle compact-tool" title="首帧叠加"
            ><input id="firstOverlay" type="checkbox" aria-label="首帧叠加" /><span
              data-icon="overlay"
              aria-hidden="true"
            ></span
            ><span>叠加</span></label
          >
          <div class="toolbar-group">
            <button
              id="alignFirst"
              class="text-icon compact-tool"
              aria-label="首帧对齐"
              title="首帧对齐"
              disabled
            >
              <span data-icon="align" aria-hidden="true"></span>对齐
            </button>
          </div>
          <div class="toolbar-group axis-locks" role="group" aria-label="当前动作编辑方向">
            <label class="icon-toggle compact-tool" title="锁定水平"
              ><input id="lockX" type="checkbox" aria-label="锁定水平" disabled /><span
                data-icon="lock"
                aria-hidden="true"
              ></span
              ><span>X</span></label
            >
            <label class="icon-toggle compact-tool" title="锁定纵向"
              ><input id="lockY" type="checkbox" aria-label="锁定纵向" disabled /><span
                data-icon="lock"
                aria-hidden="true"
              ></span
              ><span>Y</span></label
            >
          </div>
          <div class="toolbar-group">
            <button
              id="undo"
              class="icon-button"
              data-icon="undo"
              aria-label="撤销"
              title="撤销"
              disabled
            >
              撤销
            </button>
            <button
              id="redo"
              class="icon-button"
              data-icon="redo"
              aria-label="恢复"
              title="恢复"
              disabled
            >
              恢复
            </button>
            <button
              id="reset"
              class="icon-button"
              data-icon="reset"
              aria-label="重置"
              title="重置"
              disabled
            >
              重置
            </button>
          </div>
        </div>`);
  $('fitView').onclick = onFit;
  $('alignFirst').onclick = onAlign;
  $('firstOverlay').onchange = (e) => onOverlay(e.target.checked);
  for (const key of ['lockX', 'lockY']) $(key).onchange = (e) => onLock(key, e.target.checked);
  $('undo').onclick = onUndo;
  $('redo').onclick = onRedo;
  $('reset').onclick = onReset;
  return {
    element,
    render({ group, groupCount, busy, scope, overlay, canReset, canUndo, canRedo }) {
      $('activeAction').textContent = group?.name ?? '未选择动作';
      $('firstOverlay').disabled = !group || busy;
      $('firstOverlay').checked = overlay;
      for (const key of ['lockX', 'lockY']) {
        $(key).disabled = !group || busy;
        $(key).checked = group?.[key] ?? false;
      }
      $('alignFirst').disabled = !group || groupCount < 2 || busy;
      $('alignFirst').title = group
        ? `以“${group.name}”为基准，对齐其余全部动作的首帧；整批可撤销`
        : '先选择一个动作';
      $('undo').disabled = !canUndo || busy;
      $('redo').disabled = !canRedo || busy;
      $('reset').disabled = !group || busy || !canReset;
      $('reset').title =
        scope === 'group'
          ? '仅回溯当前动作的整组调整，保留逐帧调整'
          : '仅回溯当前帧调整，保留整组和其他帧调整';
    },
  };
}
