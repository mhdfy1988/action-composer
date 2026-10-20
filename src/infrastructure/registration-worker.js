// 后台线程：匹配核心直接调用固定版本 OpenCV。
let cvReady;
async function initialize() {
  let initialized;
  const runtime = new Promise((resolve, reject) => {
    initialized = resolve;
    self.Module = { onRuntimeInitialized: resolve, onAbort: reject };
  });
  importScripts(self.OPENCV_RUNTIME_URL ?? new URL('./opencv.js', self.location.href).href);
  if (self.cv instanceof Promise) self.cv = await self.cv;
  if (self.cv.Mat) initialized();
  await runtime;
  self.postMessage({
    type: 'ready',
    version: cv
      .getBuildInformation()
      .split('\n')
      .find((line) => line.includes('OpenCV')),
  });
}
cvReady = initialize();
cvReady.catch((error) =>
  self.postMessage({ type: 'error', message: `OpenCV 加载失败：${error.message}` }),
);

function feature(image, mode) {
  const rgba = cv.matFromImageData(image),
    gray = new cv.Mat();
  cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
  rgba.delete();
  const output = new cv.Mat();
  if (mode === 'gray') gray.convertTo(output, cv.CV_32F);
  else {
    const dx = new cv.Mat(),
      dy = new cv.Mat();
    cv.Sobel(gray, dx, cv.CV_32F, 1, 0, 3);
    cv.Sobel(gray, dy, cv.CV_32F, 0, 1, 3);
    cv.magnitude(dx, dy, output);
    dx.delete();
    dy.delete();
  }
  gray.delete();
  return output;
}

async function search(job) {
  await cvReady;
  const allocated = [];
  const own = (mat) => (allocated.push(mat), mat);
  try {
    const { reference, target, roi, minScale, maxScale, representation } = job;
    for (const image of [reference, target]) {
      if (
        !image ||
        !Number.isInteger(image.width) ||
        !Number.isInteger(image.height) ||
        image.width < 1 ||
        image.height < 1 ||
        image.width * image.height > 4000000 ||
        !(image.data instanceof Uint8ClampedArray) ||
        image.data.length !== image.width * image.height * 4
      )
        throw new Error('匹配输入无效或超过 400 万像素，请降低原图分辨率');
    }
    if (!['edge', 'gray'].includes(representation)) throw new Error('未知匹配表示');
    if (!(minScale >= 0.1 && maxScale <= 10 && minScale < maxScale))
      throw new Error('倍率范围需在 0.1–10 内，最小值小于最大值');
    if (
      roi.width < 16 ||
      roi.height < 16 ||
      roi.x < 0 ||
      roi.y < 0 ||
      roi.x + roi.width > reference.width ||
      roi.y + roi.height > reference.height
    )
      throw new Error('请框选至少 16×16 像素的参照区域');
    const ref = own(feature(reference, representation)),
      source = own(feature(target, representation));
    const patch = own(ref.roi(new cv.Rect(roi.x, roi.y, roi.width, roi.height)));
    const mask = own(cv.Mat.zeros(roi.height, roi.width, cv.CV_8U));
    for (let y = 0; y < roi.height; y++)
      for (let x = 0; x < roi.width; x++)
        mask.data[y * roi.width + x] =
          reference.data[((roi.y + y) * reference.width + roi.x + x) * 4 + 3] >= 200 ? 255 : 0;
    const kernel = own(cv.Mat.ones(3, 3, cv.CV_8U));
    cv.erode(mask, mask, kernel);
    if (cv.countNonZero(mask) < 100) throw new Error('全身区域有效前景太少，无法可靠匹配');
    const mean = own(new cv.Mat()),
      deviation = own(new cv.Mat());
    cv.meanStdDev(patch, mean, deviation, mask);
    if (deviation.data64F[0] < 2) throw new Error('区域缺少纹理，无法可靠匹配');
    const q = Math.min(1, 460 / Math.max(target.width, target.height));
    const small = own(new cv.Mat());
    cv.resize(
      source,
      small,
      new cv.Size(Math.round(target.width * q), Math.round(target.height * q)),
      0,
      0,
      cv.INTER_AREA,
    );
    const alpha = own(new cv.Mat(target.height, target.width, cv.CV_32F));
    for (let i = 0; i < alpha.data32F.length; i++)
      alpha.data32F[i] = target.data[i * 4 + 3] >= 128 ? 1 : 0;
    const smallAlpha = own(new cv.Mat());
    cv.resize(alpha, smallAlpha, small.size(), 0, 0, cv.INTER_NEAREST);
    const candidates = [];
    function evaluate(scale) {
      const w = Math.round((roi.width * q) / scale),
        h = Math.round((roi.height * q) / scale);
      if (w < 8 || h < 8 || w > small.cols || h > small.rows) return;
      const mats = [];
      const local = (m) => (mats.push(m), m);
      try {
        const templ = local(new cv.Mat()),
          valid = local(new cv.Mat());
        cv.resize(patch, templ, new cv.Size(w, h), 0, 0, cv.INTER_AREA);
        cv.resize(mask, valid, new cv.Size(w, h), 0, 0, cv.INTER_NEAREST);
        const count = cv.countNonZero(valid);
        if (count < 40) return;
        const response = local(new cv.Mat());
        cv.matchTemplate(small, templ, response, cv.TM_CCORR_NORMED, valid);
        // 屏蔽透明窗口除零的 NaN/Inf，并限制有效前景重叠，不能把黑背景当角色。
        const weights = local(new cv.Mat()),
          coverage = local(new cv.Mat());
        valid.convertTo(weights, cv.CV_32F, 1 / 255);
        cv.matchTemplate(smallAlpha, weights, coverage, cv.TM_CCORR);
        for (let i = 0; i < response.data32F.length; i++) {
          if (!Number.isFinite(response.data32F[i]) || coverage.data32F[i] / count < 0.85)
            response.data32F[i] = -1;
        }
        const peak = cv.minMaxLoc(response);
        if (peak.maxVal < 0) return;
        candidates.push({
          scale,
          score: Math.min(1, peak.maxVal),
          tx: roi.x + roi.width / 2 - ((peak.maxLoc.x + w / 2) / q) * scale,
          ty: roi.y + roi.height / 2 - ((peak.maxLoc.y + h / 2) / q) * scale,
          location: { x: peak.maxLoc.x / q, y: peak.maxLoc.y / q, width: w / q, height: h / q },
        });
      } finally {
        for (const mat of mats.reverse()) mat.delete();
      }
    }
    for (let i = 0; i <= 44; i++) {
      evaluate(minScale * (maxScale / minScale) ** (i / 44));
      if (i % 6 === 0) self.postMessage({ type: 'progress', message: `粗搜索 ${i + 1} / 45` });
    }
    candidates.sort((a, b) => b.score - a.score);
    if (!candidates.length) throw new Error('未找到有足够前景重叠的候选，请换区域或倍率范围');
    const center = candidates[0].scale,
      step = Math.log(maxScale / minScale) / 44;
    for (let i = -8; i <= 8; i++)
      evaluate(Math.min(maxScale, Math.max(minScale, center * Math.exp((step * i) / 8))));
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    const boundary = best.scale <= minScale * 1.02 || best.scale >= maxScale / 1.02;
    self.postMessage({
      type: 'result',
      best,
      boundary,
      candidates: candidates
        .filter(
          (item, index, list) =>
            index === 0 || Math.abs(Math.log(item.scale / list[index - 1].scale)) > 0.002,
        )
        .slice(0, 10),
      roi,
      representation,
    });
  } finally {
    for (const mat of allocated.reverse()) mat.delete();
  }
}
// 固定尺度及水平坐标，只搜索纵向平移。透明 RGB 不参与相关计算。
async function searchVertical(job) {
  await cvReady;
  const { reference, target } = job;
  for (const image of [reference, target]) {
    if (
      !image ||
      !Number.isInteger(image.width) ||
      !Number.isInteger(image.height) ||
      image.width < 1 ||
      image.height < 1 ||
      image.width * image.height > 4000000 ||
      !(image.data instanceof Uint8ClampedArray) ||
      image.data.length !== image.width * image.height * 4
    )
      throw new Error('纵向匹配输入无效或超过 400 万像素');
  }
  const width = Math.max(reference.width, target.width),
    height = Math.max(reference.height, target.height),
    q = Math.min(1, 320 / Math.max(width, height)),
    w = Math.max(1, Math.round(width * q)),
    h = Math.max(1, Math.round(height * q));
  const allocated = [];
  const own = (mat) => (allocated.push(mat), mat);
  try {
    function normalized(image) {
      const raw = own(new cv.Mat(image.height, image.width, cv.CV_32FC3));
      let count = 0;
      for (let i = 0; i < image.width * image.height; i++) {
        const alpha = image.data[i * 4 + 3] / 255;
        if (alpha >= 0.5) count++;
        for (let c = 0; c < 3; c++) raw.data32F[i * 3 + c] = (64 + image.data[i * 4 + c]) * alpha;
      }
      if (count < 16) throw new Error('当前帧没有足够可见内容，无法去位移');
      const small = own(new cv.Mat());
      cv.resize(
        raw,
        small,
        new cv.Size(
          Math.max(1, Math.round((image.width * w) / width)),
          Math.max(1, Math.round((image.height * h) / height)),
        ),
        0,
        0,
        cv.INTER_AREA,
      );
      const plane = own(cv.Mat.zeros(h, w, cv.CV_32FC3));
      const area = own(
        plane.roi(
          new cv.Rect(Math.floor((w - small.cols) / 2), h - small.rows, small.cols, small.rows),
        ),
      );
      small.copyTo(area);
      // 横向投影保留颜色随高度的分布，减少摆臂、尾巴横摆的干扰。
      const profile = own(new cv.Mat());
      cv.reduce(plane, profile, 1, cv.REDUCE_SUM, cv.CV_32F);
      return profile;
    }
    const ref = normalized(reference),
      next = normalized(target);
    const padded = own(new cv.Mat());
    cv.copyMakeBorder(next, padded, h, h, 0, 0, cv.BORDER_CONSTANT, new cv.Scalar(0, 0, 0, 0));
    const response = own(new cv.Mat());
    cv.matchTemplate(padded, ref, response, cv.TM_CCORR_NORMED);
    for (let i = 0; i < response.data32F.length; i++)
      if (!Number.isFinite(response.data32F[i])) response.data32F[i] = -1;
    const peak = cv.minMaxLoc(response);
    if (peak.maxVal < 0.55)
      throw new Error(`帧间外观变化过大，纵向匹配不可靠（${peak.maxVal.toFixed(3)}），请手动修正`);
    self.postMessage({
      type: 'result',
      best: {
        scale: 1,
        tx: 0,
        ty: ((h - peak.maxLoc.y) * height) / h,
        score: Math.min(1, peak.maxVal),
      },
    });
  } finally {
    for (const mat of allocated.reverse()) mat.delete();
  }
}
self.onmessage = ({ data }) =>
  (data.mode === 'vertical' ? searchVertical(data) : search(data)).catch((error) =>
    self.postMessage({ type: 'error', message: error.message ?? String(error) }),
  );
