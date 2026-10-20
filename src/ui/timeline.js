import { createView } from './dom.js';
import { Filmstrip } from './filmstrip.js';
import { setIcon } from './icons.js';
import { TICKS } from '../domain/project.js';

export function createTimeline({
  onSelect,
  onReorder,
  onAction,
  onStep,
  onPlay,
  onDuration,
  onFps,
  onCancel,
}) {
  const { element, get: $ } = createView(`<section class="timeline" aria-label="动作帧带">
        <div class="player">
          <button
            id="previous"
            class="icon-button"
            data-icon="previous"
            aria-label="上一帧"
            title="上一帧"
            disabled
          >
            上一帧
          </button>
          <button
            id="play"
            class="icon-button"
            data-icon="play"
            aria-label="播放"
            title="播放"
            disabled
          >
            播放
          </button>
          <button
            id="next"
            class="icon-button"
            data-icon="next"
            aria-label="下一帧"
            title="下一帧"
            disabled
          >
            下一帧
          </button>
          <input
            id="frame"
            aria-label="当前帧"
            type="range"
            min="0"
            max="0"
            value="0"
            disabled
          /><output id="frameInfo">0 / 0</output>
          <label class="timing-field" title="帧时长（毫秒）"
            ><span data-icon="clock" aria-hidden="true"></span
            ><input
              id="frameDuration"
              aria-label="帧时长（毫秒）"
              type="number"
              min="0.016667"
              max="60000"
              step="any"
              disabled
            /><span class="unit">ms</span></label
          >
          <label class="timing-field" title="帧率"
            ><span data-icon="fps" aria-hidden="true"></span
            ><input
              id="fps"
              aria-label="帧率"
              type="number"
              min="1"
              max="60"
              step="1"
              value="12"
              disabled
            /><span class="unit">fps</span></label
          >
        </div>
        <div id="filmstrip" class="filmstrip" aria-label="帧缩略图"></div>
        <div class="statusbar">
          <span id="status" role="status">就绪</span><button id="cancelTask" hidden>取消任务</button
          ><span class="spacer"></span
          ><span title="本工具没有自动保存，刷新或关闭页面会丢失当前调整。"
            >仅本次处理 · 刷新前请导出</span
          >
        </div>
      </section>`);
  const filmstrip = new Filmstrip($('filmstrip'), onSelect, onReorder, onAction);
  $('frame').oninput = (event) => onSelect(Number(event.target.value));
  $('previous').onclick = () => onStep(-1);
  $('next').onclick = () => onStep(1);
  $('play').onclick = onPlay;
  $('frameDuration').onchange = (event) => onDuration(Number(event.target.value));
  $('fps').onchange = (event) => onFps(Number(event.target.value));
  $('cancelTask').onclick = onCancel;
  function setPlaying(playing) {
    setIcon($('play'), playing ? 'pause' : 'play', playing ? '暂停' : '播放');
  }
  return {
    element,
    setPlaying,
    setStatus(text, error = false) {
      $('status').textContent = text;
      $('status').title = text;
      $('status').classList.toggle('error', error);
    },
    render({ group, media, frame, busy, playing }) {
      filmstrip.render(group, media, frame, busy);
      for (const key of ['play', 'previous', 'next', 'frame', 'frameDuration', 'fps'])
        $(key).disabled = !group || busy;
      $('cancelTask').hidden = !busy;
      $('frame').max = Math.max(0, (group?.frames.length ?? 1) - 1);
      $('frame').value = frame;
      $('frameInfo').textContent = group ? `${frame + 1} / ${group.frames.length}` : '0 / 0';
      if (group) {
        $('frameDuration').value = Number(
          ((group.frames[frame].durationTicks * 1000) / TICKS).toFixed(6),
        );
        const uniform = group.frames.every(
          (f) => f.durationTicks === group.frames[0].durationTicks,
        );
        $('fps').value = uniform ? Math.round(TICKS / group.frames[0].durationTicks) : '';
        $('fps').placeholder = uniform ? '' : '不等时长';
      } else {
        for (const key of ['frameDuration', 'fps']) $(key).value = '';
      }
      setPlaying(playing);
    },
  };
}
