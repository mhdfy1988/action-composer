import { createView } from './dom.js';

export function createViewport({ onImport }) {
  const { element, get: $ } = createView(`<div class="viewport" id="viewport">
          <canvas
            id="stage"
            tabindex="0"
            aria-label="画布：点击选择图片，空白处拖动视图"
            title="点击选中图片后移动或缩放；空白处拖动视图，滚轮缩放观察"
          ></canvas>
          <div id="empty">
            <strong>从一组动作帧开始</strong>
            <p>导入一张或多张透明 PNG，可勾选多个动作一起查看。</p>
            <button id="emptyAdd" class="primary">导入动作帧</button>
          </div>
          <span id="viewInfo" class="view-info"></span>
        </div>`);
  $('emptyAdd').onclick = onImport;
  return {
    element,
    // Canvas是舞台绘制与手势适配共同消费的显式表面，不暴露其余内部节点。
    canvas: $('stage'),
    render({ hasActions, scope }) {
      $('empty').hidden = hasActions;
      $('stage').title =
        scope === 'frame'
          ? '拖动当前帧；方向键每次 1 px，Shift + 方向键每次 10 px；Esc 取消拖动'
          : '选中后移动整组或拖四角缩放；方向键微调，空白处拖动视图';
    },
    showScale(unit) {
      $('viewInfo').textContent = `${Math.round(unit * 100)}%`;
    },
    focus() {
      $('stage').focus({ preventScroll: true });
    },
    observe(draw) {
      const observer = new ResizeObserver(draw);
      observer.observe(element);
      return observer;
    },
  };
}
