import { createView } from './dom.js';
import { renderActionList } from './action-list.js';

export function createLibrary({ onSelect, onVisible, onRename, onDelete, onReorder }) {
  const { element, get: $ } = createView(`<aside class="library">
        <div class="panel-heading">
          <h2>动作</h2>
        </div>
        <div id="groups" class="group-list"></div>
      </aside>`);
  return {
    element,
    render({ groups, selected, visible, busy }) {
      renderActionList(
        $('groups'),
        groups,
        selected,
        visible,
        busy,
        onSelect,
        onVisible,
        onRename,
        onDelete,
        onReorder,
      );
    },
  };
}
