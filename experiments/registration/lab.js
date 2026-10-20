import { alphaBounds } from '../../src/domain/output-layout.js';
import { firstFrameAlignment } from '../../src/domain/first-frame-align.js';
import { foregroundBounds, wholeRegion, wholeBodyCheck } from './whole-body.js';

const $ = (id) => document.getElementById(id);
let reference,
  frames = [],
  roi,
  baseline,
  result,
  worker,
  ready = false,
  busy = false,
  loading = false,
  mode = 'contour',
  index = 0,
  timer = null,
  drag = null;
let referenceView;
const sampleRoot = '../../output/registration-lab';
const describe = (t) =>
  `尺度 ${(t.scale * 100).toFixed(2)}%\n偏移 ${t.tx.toFixed(1)}，${t.ty.toFixed(1)} px`;
async function load(input) {
  let blob = input;
  if (typeof input === 'string') {
    const response = await fetch(input);
    if (!response.ok) throw new Error('本机示例未准备，请运行实验准备脚本，或导入自己的 PNG');
    blob = await response.blob();
  }
  if (blob.size > 20 * 1024 * 1024) throw new Error('单张图片超过 20 MB');
  const bitmap = await createImageBitmap(blob);
  if (bitmap.width * bitmap.height > 4000000) {
    bitmap.close();
    throw new Error('实验页单图最多 400 万像素');
  }
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return {
    canvas,
    pixels,
    bounds: alphaBounds(pixels.data, pixels.width, pixels.height),
    foreground: foregroundBounds(pixels),
  };
}
function status(message) {
  $('progress').textContent = message;
}
function spawn() {
  worker?.terminate();
  ready = false;
  $('runtime').textContent = '加载 OpenCV…';
  worker = new Worker('./worker.js');
  const active = worker;
  worker.onmessage = ({ data }) => {
    if (worker !== active) return;
    if (data.type === 'ready') {
      ready = true;
      $('runtime').textContent = 'OpenCV 4.13.0 · 无模型';
      sync();
    } else if (data.type === 'progress') status(data.message);
    else if (data.type === 'result') {
      result = data;
      busy = false;
      mode = 'template';
      $('matched').textContent = describe(data.best) + `\n相似度 ${data.best.score.toFixed(4)}`;
      $('quality').textContent = data.boundary
        ? '候选靠近倍率边界，请扩大范围重算。'
        : data.best.score < 0.7
          ? '相似度偏低，请检查区域或手动校准。'
          : '候选仅供预览，请检查身体与脚底；分数不是成功概率。';
      status('完成；两种结果共用同一参照坐标。');
      sync();
      draw();
    } else if (data.type === 'error') {
      busy = false;
      status(data.message);
      if (!ready) $('runtime').textContent = '运行库未就绪';
      sync();
    }
  };
  worker.onerror = (event) => {
    if (worker !== active) return;
    busy = false;
    status(event.message);
    sync();
  };
}
function resetResult() {
  result = null;
  mode = 'contour';
  $('matched').textContent = '尚未计算';
  $('quality').textContent = '';
  status('');
}
function computeBaseline() {
  resetResult();
  if (!reference?.bounds || !frames[0]?.bounds) throw new Error('参照与首帧必须有可见内容');
  const ref = { id: 'reference', scale: 1, x: 0, y: 0, frames: [{ assetId: 'reference' }] },
    target = { id: 'target', scale: 1, x: 0, y: 0, frames: [{ assetId: 'target' }] };
  const project = {
    stage: { originX: reference.pixels.width / 2, originY: reference.pixels.height },
    assets: [
      { id: 'reference', width: reference.pixels.width, height: reference.pixels.height },
      { id: 'target', width: frames[0].pixels.width, height: frames[0].pixels.height },
    ],
  };
  const t = firstFrameAlignment(project, target, ref, frames[0].bounds, reference.bounds);
  baseline = {
    scale: t.scale,
    tx: project.stage.originX - (frames[0].pixels.width * t.scale) / 2 + t.x,
    ty: project.stage.originY - frames[0].pixels.height * t.scale + t.y,
  };
  $('baseline').textContent = describe(baseline);
  index = 0;
  $('frame').max = frames.length - 1;
  $('frame').value = 0;
  sync();
  draw();
}
function sync() {
  $('run').disabled = !ready || busy || !reference || !frames.length;
  $('cancel').hidden = !busy || loading;
  for (const id of [
    'referenceFile',
    'framesFile',
    'sample',
    'whole',
    'head',
    'torso',
    'representation',
    'minScale',
    'maxScale',
  ])
    $(id).disabled = busy;
  $('template').disabled = !result || busy;
  $('contour').disabled = busy;
  $('report').disabled = !result || busy;
  $('contour').setAttribute('aria-pressed', String(mode === 'contour'));
  $('template').setAttribute('aria-pressed', String(mode === 'template'));
}
function drawReference() {
  const canvas = $('reference'),
    ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!reference) return;
  const q = Math.min(
    (canvas.width - 16) / reference.pixels.width,
    (canvas.height - 16) / reference.pixels.height,
  );
  const x = (canvas.width - reference.pixels.width * q) / 2,
    y = (canvas.height - reference.pixels.height * q) / 2;
  referenceView = { q, x, y };
  ctx.drawImage(reference.canvas, x, y, reference.pixels.width * q, reference.pixels.height * q);
  if (roi) {
    ctx.strokeStyle = '#7fd7ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + roi.x * q, y + roi.y * q, roi.width * q, roi.height * q);
  }
}
function draw() {
  drawReference();
  const canvas = $('stage'),
    rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!reference || !baseline) return;
  const q = Math.min(
    (canvas.width - 48) / reference.pixels.width,
    (canvas.height - 40) / reference.pixels.height,
  );
  ctx.translate(
    (canvas.width - reference.pixels.width * q) / 2,
    (canvas.height - reference.pixels.height * q) / 2,
  );
  ctx.scale(q, q);
  if ($('showReference').checked) {
    ctx.globalAlpha = 0.4;
    ctx.drawImage(reference.canvas, 0, 0);
    ctx.globalAlpha = 1;
  }
  const t = mode === 'template' && result ? result.best : baseline;
  ctx.save();
  ctx.translate(t.tx, t.ty);
  ctx.scale(t.scale, t.scale);
  ctx.drawImage(frames[index].canvas, 0, 0);
  ctx.restore();
  const check = wholeBodyCheck(reference.foreground, frames[0].foreground, t);
  $('bodyCheck').textContent = check
    ? `轮廓高度差 ${check.heightPercent.toFixed(2)}%\n顶部偏差 ${check.topOffset.toFixed(1)} px\n底部偏差 ${check.bottomOffset.toFixed(1)} px`
    : '没有足够不透明的前景，无法比较';
  if (roi) {
    ctx.strokeStyle = '#7fd7ff';
    ctx.lineWidth = 1.5 / q;
    ctx.strokeRect(roi.x, roi.y, roi.width, roi.height);
  }
  $('frameInfo').textContent = `${index + 1} / ${frames.length}`;
}
function stop() {
  clearInterval(timer);
  timer = null;
  $('play').textContent = '播放';
}
async function sample() {
  stop();
  const ref = await load(`${sampleRoot}/reference.png`);
  const next = [];
  for (let n = 1; n <= 13; n++)
    next.push(await load(`${sampleRoot}/frames/frame_${String(n).padStart(6, '0')}.png`));
  reference = ref;
  frames = next;
  roi = wholeRegion(reference.pixels, reference.foreground);
  computeBaseline();
  status('已框选完整前景；可手动调整，局部区域仅用于辅助对照。');
}
async function guarded(work) {
  if (busy) return;
  busy = true;
  loading = true;
  sync();
  try {
    await work();
  } catch (error) {
    status(error.message);
  } finally {
    busy = false;
    loading = false;
    sync();
    draw();
  }
}
$('sample').onclick = () => guarded(sample);
$('referenceFile').onchange = () =>
  guarded(async () => {
    if (!$('referenceFile').files[0]) return;
    stop();
    reference = await load($('referenceFile').files[0]);
    roi = wholeRegion(reference.pixels, reference.foreground);
    computeBaseline();
  });
$('framesFile').onchange = () =>
  guarded(async () => {
    const files = [...$('framesFile').files].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
    if (!files.length) return;
    if (files.length > 24) throw new Error('实验页最多 24 帧');
    if (files.reduce((s, f) => s + f.size, 0) > 48 * 1024 * 1024)
      throw new Error('实验页素材总计最多 48 MB');
    stop();
    const next = [];
    for (const file of files) next.push(await load(file));
    if (next.reduce((sum, item) => sum + item.pixels.width * item.pixels.height, 0) > 24000000)
      throw new Error('实验页最多 2400 万解码像素');
    if (
      next.some(
        (item) =>
          item.pixels.width !== next[0].pixels.width ||
          item.pixels.height !== next[0].pixels.height,
      )
    )
      throw new Error('当前实验页要求本组帧原图尺寸一致，请先统一帧画布');
    frames = next;
    computeBaseline();
  });
$('whole').onclick = () => {
  if (!reference || busy) return;
  stop();
  roi = wholeRegion(reference.pixels, reference.foreground);
  resetResult();
  sync();
  draw();
};
for (const [id, box] of [
  ['head', [0.4102, 0.0052, 0.3516, 0.2214]],
  ['torso', [0.43, 0.235, 0.265, 0.35]],
])
  $(id).onclick = () => {
    if (!reference) return;
    stop();
    roi = {
      x: Math.round(box[0] * reference.pixels.width),
      y: Math.round(box[1] * reference.pixels.height),
      width: Math.round(box[2] * reference.pixels.width),
      height: Math.round(box[3] * reference.pixels.height),
    };
    resetResult();
    sync();
    draw();
  };
function point(event) {
  const rect = $('reference').getBoundingClientRect();
  return {
    x: Math.max(
      0,
      Math.min(
        reference.pixels.width,
        Math.round(
          (((event.clientX - rect.left) * $('reference').width) / rect.width - referenceView.x) /
            referenceView.q,
        ),
      ),
    ),
    y: Math.max(
      0,
      Math.min(
        reference.pixels.height,
        Math.round(
          (((event.clientY - rect.top) * $('reference').height) / rect.height - referenceView.y) /
            referenceView.q,
        ),
      ),
    ),
  };
}
$('reference').onpointerdown = (event) => {
  if (!reference || busy || event.button !== 0) return;
  stop();
  drag = point(event);
  $('reference').setPointerCapture(event.pointerId);
};
$('reference').onpointermove = (event) => {
  if (!drag) return;
  const end = point(event);
  roi = {
    x: Math.min(end.x, drag.x),
    y: Math.min(end.y, drag.y),
    width: Math.abs(end.x - drag.x),
    height: Math.abs(end.y - drag.y),
  };
  resetResult();
  draw();
};
$('reference').onpointerup = () => {
  drag = null;
  sync();
};
$('reference').onpointercancel = () => {
  drag = null;
  sync();
};
$('run').onclick = () => {
  stop();
  busy = true;
  resetResult();
  sync();
  status('计算中…');
  worker.postMessage({
    reference: reference.pixels,
    target: frames[0].pixels,
    roi,
    minScale: Number($('minScale').value),
    maxScale: Number($('maxScale').value),
    representation: $('representation').value,
  });
};
$('cancel').onclick = () => {
  busy = false;
  spawn();
  sync();
  status('已取消，未修改任何工程。');
};
for (const id of ['representation', 'minScale', 'maxScale'])
  $(id).onchange = () => {
    resetResult();
    sync();
    draw();
  };
for (const id of ['contour', 'template'])
  $(id).onclick = () => {
    mode = id;
    sync();
    draw();
  };
$('showReference').onchange = draw;
$('frame').oninput = () => {
  stop();
  index = Number($('frame').value);
  draw();
};
$('play').onclick = () => {
  if (timer) {
    stop();
    return;
  }
  if (!frames.length) return;
  $('play').textContent = '暂停';
  timer = setInterval(() => {
    index = (index + 1) % frames.length;
    $('frame').value = index;
    draw();
  }, 1000 / 12);
};
$('report').onclick = () => {
  const data = {
    experimental: true,
    engine: 'OpenCV 4.13.0',
    method: 'TM_CCORR_NORMED',
    coordinate: '目标原图像素乘 scale，再加 tx/ty，进入参照原图像素坐标',
    referenceSize: [reference.pixels.width, reference.pixels.height],
    targetSize: [frames[0].pixels.width, frames[0].pixels.height],
    baseline,
    wholeBody: wholeBodyCheck(reference.foreground, frames[0].foreground, result.best),
    ...result,
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'registration-experiment.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
new ResizeObserver(draw).observe($('stage').parentElement);
window.addEventListener('beforeunload', () => {
  worker?.terminate();
  stop();
});
spawn();
guarded(sample);
