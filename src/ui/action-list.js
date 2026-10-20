import { setIcon } from './icons.js';
// 显示复选框与编辑选择是独立入口，避免勾选时意外切换编辑对象。
const lists = new WeakMap();
const drags = new WeakMap();
function clearDrag(element) {
  drags.delete(element);
  element
    .querySelectorAll('.action-before,.action-after,.action-dragging')
    .forEach((row) => row.classList.remove('action-before', 'action-after', 'action-dragging'));
}

export function renderActionList(
  element,
  groups,
  selected,
  visible,
  busy,
  onSelect,
  onVisible,
  onRename,
  onDelete,
  onReorder,
) {
  let rows = lists.get(element);
  if (!rows) {
    rows = new Map();
    lists.set(element, rows);
  }
  const ids = new Set(groups.map((group) => group.id));
  for (const [id, entry] of rows) {
    if (!ids.has(id)) {
      entry.row.remove();
      rows.delete(id);
    }
  }
  for (const [index, group] of groups.entries()) {
    let entry = rows.get(group.id);
    if (!entry) {
      const row = document.createElement('div');
      row.className = 'action-row';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      const button = document.createElement('button');
      button.className = 'group-item';
      const name = document.createElement('span');
      const count = document.createElement('small');
      button.append(name, count);
      const tools = document.createElement('div');
      tools.className = 'action-tools';
      const rename = document.createElement('button'),
        remove = document.createElement('button');
      rename.className = remove.className = 'icon-button';
      setIcon(rename, 'rename', '修改动作名称');
      setIcon(remove, 'delete', '删除动作');
      tools.append(rename, remove);
      row.append(checkbox, button, tools);
      entry = { row, checkbox, button, name, count, rename, remove };
      rows.set(group.id, entry);
    }
    const { row, checkbox, button, name, count } = entry;
    // 换帧只更新状态，不能移走鼠标按下时的节点，否则松开后的 click 会丢失。
    if (element.children[index] !== row) element.insertBefore(row, element.children[index] ?? null);
    checkbox.checked = visible.has(group.id);
    checkbox.disabled = busy;
    checkbox.setAttribute('aria-label', `显示动作：${group.name}`);
    checkbox.onchange = () => onVisible(group.id, checkbox.checked);
    button.disabled = busy;
    button.setAttribute('aria-pressed', String(group.id === selected));
    if (name.textContent !== group.name) name.textContent = group.name;
    const caption = `${group.frames.length} 帧`;
    if (count.textContent !== caption) count.textContent = caption;
    button.onclick = () => onSelect(group.id);
    row.draggable = !busy;
    button.title = '拖动调整动作顺序';
    row.onpointerdown = (e) => {
      row.blockDrag = Boolean(e.target.closest('input,.action-tools'));
    };
    row.ondragstart = (e) => {
      if (busy || row.blockDrag) {
        e.preventDefault();
        return;
      }
      drags.set(element, group.id);
      row.classList.add('action-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'action-composer-actions');
    };
    row.ondragover = (e) => {
      if (busy || !drags.has(element)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      element
        .querySelectorAll('.action-before,.action-after')
        .forEach((el) => el.classList.remove('action-before', 'action-after'));
      row.classList.add(
        e.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2
          ? 'action-after'
          : 'action-before',
      );
    };
    row.ondrop = (e) => {
      const source = drags.get(element);
      if (busy || !source) return;
      e.preventDefault();
      const after = e.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
      clearDrag(element);
      onReorder(source, group.id, after);
    };
    row.ondragend = () => clearDrag(element);
    entry.rename.disabled = entry.remove.disabled = busy;
    entry.rename.onclick = () => onRename(group.id);
    entry.remove.onclick = () => onDelete(group.id);
  }
}
