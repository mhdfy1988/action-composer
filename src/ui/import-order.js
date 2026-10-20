import { setIcon } from './icons.js';
export function renderOrder(list, files, onMove) {
  let dragging = null;
  list.setAttribute('role', 'list');
  const clear = () => {
    dragging = null;
    list
      .querySelectorAll('.order-before,.order-after,.order-dragging')
      .forEach((row) => row.classList.remove('order-before', 'order-after', 'order-dragging'));
  };
  const move = (from, to) => {
    clear();
    if (from === to) return;
    onMove(from, to);
    list.children[to]?.focus({ preventScroll: true });
  };
  list.replaceChildren(
    ...files.map((file, i) => {
      const row = document.createElement('div');
      row.className = 'order-row';
      row.draggable = true;
      row.tabIndex = 0;
      row.setAttribute('role', 'listitem');
      row.setAttribute('aria-label', `第 ${i + 1} 帧：${file.name}`);
      row.title = '拖动排序；Alt + ↑／↓ 微调顺序';
      const handle = document.createElement('span');
      handle.className = 'order-grip';
      handle.setAttribute('aria-hidden', 'true');
      setIcon(handle, 'grip');
      const label = document.createElement('span');
      label.textContent = `${i + 1}. ${file.name}`;
      row.append(handle, label);
      row.ondragstart = (e) => {
        dragging = i;
        row.classList.add('order-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'action-composer-import-order');
      };
      row.ondragover = (e) => {
        if (dragging === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        list
          .querySelectorAll('.order-before,.order-after')
          .forEach((el) => el.classList.remove('order-before', 'order-after'));
        row.classList.add(
          e.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2
            ? 'order-after'
            : 'order-before',
        );
      };
      row.ondrop = (e) => {
        if (dragging === null) return;
        e.preventDefault();
        const boundary =
          i + (e.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2 ? 1 : 0);
        move(dragging, boundary - (dragging < boundary ? 1 : 0));
      };
      row.ondragend = clear;
      row.onkeydown = (e) => {
        if (!e.altKey || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault();
        const to = i + (e.key === 'ArrowUp' ? -1 : 1);
        if (to >= 0 && to < files.length) move(i, to);
      };
      return row;
    }),
  );
}
