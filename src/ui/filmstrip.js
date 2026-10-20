import { frameKey } from '../domain/frame-operations.js';
import { setIcon } from './icons.js';
// 帧带只保留当前帧单选与单帧排序，不维护第二套勾选状态。
export class Filmstrip {
  constructor(element, onSelect, onReorder, onAction) {
    this.element = element;
    this.onSelect = onSelect;
    this.key = null;
    this.onReorder = onReorder;
    this.onAction = onAction;
  }
  clearDrag() {
    this.drag = null;
    this.element
      .querySelectorAll('.drop-before,.drop-after')
      .forEach((el) => el.classList.remove('drop-before', 'drop-after'));
  }

  render(group, media, selected, busy) {
    this.group = group;
    const key = group ? `${group.id}:${group.frames.map(frameKey).join(',')}` : '';
    if (key !== this.key) {
      this.key = key;
      this.element.replaceChildren();
      for (const [index, frame] of (group?.frames ?? []).entries()) {
        const card = document.createElement('div');
        card.className = 'frame-card';
        card.dataset.frameIndex = String(index);
        card.draggable = true;
        const button = document.createElement('button');
        button.className = 'frame-tile';
        button.setAttribute('aria-label', `第 ${index + 1} 帧`);
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 64;
        const image = media.get(frame.assetId)?.image;
        if (image) {
          const scale = Math.min(88 / image.width, 56 / image.height);
          const w = image.width * scale,
            h = image.height * scale;
          canvas.getContext('2d').drawImage(image, (96 - w) / 2, (64 - h) / 2, w, h);
        }
        const caption = document.createElement('span');
        button.append(canvas, caption);
        button.onclick = () => this.onSelect(index);
        card.append(button);
        const tools = document.createElement('div');
        tools.className = 'frame-actions';
        tools.setAttribute('role', 'group');
        tools.setAttribute('aria-label', `第 ${index + 1} 帧操作`);
        for (const [action, label] of [
          ['copy', '复制此帧'],
          ['delete', '删除此帧'],
        ]) {
          const tool = document.createElement('button');
          tool.className = 'icon-button';
          tool.dataset.frameAction = action;
          setIcon(tool, action, label);
          tool.onclick = () => {
            if (!this.busy) this.onAction(action, index);
          };
          tools.append(tool);
        }
        card.append(tools);
        this.element.append(card);
        card.ondragstart = (e) => {
          if (this.busy || e.target.closest('.frame-actions')) {
            e.preventDefault();
            return;
          }
          this.onSelect(index);
          this.drag = { index, groupId: this.group.id };
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', 'action-composer-frames');
        };
        card.ondragover = (e) => {
          if (!this.drag || this.busy || this.drag.groupId !== this.group?.id) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          const after = e.clientX > card.getBoundingClientRect().left + card.offsetWidth / 2;
          this.clearMarkers();
          card.classList.add(after ? 'drop-after' : 'drop-before');
        };
        card.ondrop = (e) => {
          if (!this.drag || this.busy || this.drag.groupId !== this.group?.id) return;
          e.preventDefault();
          const boundary =
              index +
              (e.clientX > card.getBoundingClientRect().left + card.offsetWidth / 2 ? 1 : 0),
            moving = this.drag.index;
          this.clearDrag();
          this.onReorder(moving, boundary);
        };
        card.ondragend = () => this.clearDrag();
      }
    }
    this.busy = busy;
    for (const [index, card] of [...this.element.children].entries()) {
      const button = card.querySelector('button');
      button.disabled = busy;
      for (const tool of card.querySelectorAll('[data-frame-action]')) {
        tool.disabled = busy || (tool.dataset.frameAction === 'copy' && group.frames.length >= 120);
      }
      card.draggable = !busy;
      button.setAttribute('aria-pressed', String(index === selected));
      button.lastElementChild.textContent = `${String(index + 1).padStart(2, '0')}${group.anchors[index] ? ' · 已标' : ''}`;
    }
    if (this.selected !== selected || this.groupId !== group?.id) {
      this.element.children[selected]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    this.selected = selected;
    this.groupId = group?.id;
  }
  clearMarkers() {
    this.element
      .querySelectorAll('.drop-before,.drop-after')
      .forEach((el) => el.classList.remove('drop-before', 'drop-after'));
  }
}
