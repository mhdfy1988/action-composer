import { createView } from './dom.js';

export function createExportDialog({ onSubmit, parent = document.body }) {
  const { element: dialog, get: $ } = createView(`<dialog id="exportDialog">
      <form method="dialog">
        <h2>导出素材</h2>
        <label
          ><span id="exportNameLabel">动作名称</span
          ><input id="exportName" maxlength="160" required
        /></label>
        <label
          >导出留白 / px<input
            id="padding"
            type="number"
            min="0"
            max="256"
            step="1"
            value="16"
            required
        /></label>
        <label
          >动作范围<select id="exportScope">
            <option value="current">当前动作</option>
            <option value="all">全部动作 · 统一画布</option>
          </select></label
        >
        <label
          >格式<select id="exportKind">
            <option value="sequence">PNG 序列 + JSON</option>
            <option value="sheet">精灵图 + JSON</option>
          </select></label
        >
        <label id="sheetColumnsField" hidden
          >精灵图列数<input
            id="sheetColumns"
            type="number"
            min="1"
            max="64"
            step="1"
            value="8"
            disabled
        /></label>
        <p class="muted">按调整后内容计算共同尺寸和原点，保留透明背景。</p>
        <div class="dialog-actions">
          <button id="exportCancel" type="button">取消</button
          ><button id="exportConfirm" type="submit" class="primary">导出</button>
        </div>
      </form>
    </dialog>`);
  parent.append(dialog);
  function updateNameLabel() {
    $('exportNameLabel').textContent = $('exportScope').value === 'all' ? '素材包名称' : '动作名称';
  }
  $('exportScope').onchange = updateNameLabel;
  $('exportCancel').onclick = () => dialog.close();
  $('exportKind').onchange = () => {
    $('sheetColumnsField').hidden = $('exportKind').value !== 'sheet';
    $('sheetColumns').disabled = $('exportKind').value !== 'sheet';
  };
  $('exportConfirm').onclick = (event) => {
    event.preventDefault();
    if (!dialog.querySelector('form').reportValidity()) return;
    const name = $('exportName').value.trim();
    if (!name) {
      $('exportName').focus();
      return;
    }
    const input = {
      name,
      all: $('exportScope').value === 'all',
      kind: $('exportKind').value,
      columns: Number($('sheetColumns').value),
      padding: Number($('padding').value),
    };
    dialog.close();
    onSubmit(input);
  };
  return {
    open(name) {
      $('exportName').value = name;
      updateNameLabel();
      dialog.showModal();
    },
    setBusy(busy) {
      $('padding').disabled = busy;
    },
  };
}
