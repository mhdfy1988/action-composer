import { createView } from './dom.js';

export function createHeader({ onImport, onExport }) {
  const { element, get: $ } = createView(`<header>
      <h1>动作编排</h1>
      <div class="spacer"></div>
      <button id="add" class="text-icon">
        <span data-icon="import" aria-hidden="true"></span>导入帧
      </button>
      <button id="export" class="primary text-icon" disabled>
        <span data-icon="export" aria-hidden="true"></span>导出素材
      </button>
    </header>`);
  $('add').onclick = onImport;
  $('export').onclick = onExport;
  return {
    element,
    render({ hasGroup, busy }) {
      $('add').disabled = busy;
      $('export').disabled = !hasGroup || busy;
    },
  };
}
