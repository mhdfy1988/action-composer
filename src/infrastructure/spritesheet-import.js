import Ajv from 'ajv';
import { TICKS } from '../domain/project.js';

const positive = { type: 'integer', minimum: 1, maximum: 8192 };
const coordinate = { type: 'integer', minimum: 0, maximum: 8192 };
const validate = new Ajv().compile({
  type: 'object',
  required: ['format', 'version', 'ticksPerSecond', 'sheet', 'stage', 'frames'],
  properties: {
    format: { const: 'action-composer-spritesheet' },
    version: { const: 1 },
    ticksPerSecond: { const: TICKS },
    sheet: {
      type: 'object',
      required: ['image', 'width', 'height'],
      properties: {
        image: { type: 'string', pattern: '^[^/\\\\]+\\.png$' },
        width: positive,
        height: positive,
      },
    },
    stage: {
      type: 'object',
      required: ['width', 'height', 'originX', 'originY'],
      properties: {
        width: positive,
        height: positive,
        originX: { type: 'number', minimum: -100000, maximum: 100000 },
        originY: { type: 'number', minimum: -100000, maximum: 100000 },
      },
    },
    frames: {
      type: 'array',
      minItems: 1,
      maxItems: 120,
      items: {
        type: 'object',
        required: ['image', 'rect', 'durationTicks'],
        properties: {
          image: { type: 'string' },
          durationTicks: { type: 'integer', minimum: 1, maximum: TICKS * 60 },
          rect: {
            type: 'object',
            required: ['x', 'y', 'width', 'height'],
            properties: {
              x: coordinate,
              y: coordinate,
              width: positive,
              height: positive,
            },
          },
        },
      },
    },
  },
});

// 只生成明确的切片计划；不猜测透明区域，也不逐帧居中。
export function gridPlan(width, height, columns, rows, count) {
  if (
    ![columns, rows, count].every(Number.isInteger) ||
    columns < 1 ||
    rows < 1 ||
    count < 1 ||
    count > 120 ||
    count > columns * rows
  )
    throw new Error('行列必须为正整数，有效帧数为 1–120 且不能超过格数');
  if (width % columns || height % rows || columns > width || rows > height)
    throw new Error('图片宽高必须能被列数、行数整除');
  return {
    frames: Array.from({ length: count }, (_, i) => ({
      rect: {
        x: (i % columns) * (width / columns),
        y: Math.floor(i / columns) * (height / rows),
        width: width / columns,
        height: height / rows,
      },
    })),
  };
}

export function manifestSheetPlan(manifest, file, width, height) {
  if (!validate(manifest)) throw new Error('精灵图清单格式无效：仅支持本工具的精灵图 JSON v1');
  if (
    manifest.sheet.image !== file.name ||
    manifest.sheet.width !== width ||
    manifest.sheet.height !== height
  )
    throw new Error('精灵图文件名或尺寸与清单不一致');
  const { stage } = manifest;
  if (!Number.isFinite(stage.originX) || !Number.isFinite(stage.originY))
    throw new Error('精灵图原点无效');
  for (const frame of manifest.frames) {
    const r = frame.rect;
    if (
      frame.image !== file.name ||
      r.x + r.width > width ||
      r.y + r.height > height ||
      r.width !== stage.width ||
      r.height !== stage.height
    )
      throw new Error('精灵图切片越界或帧尺寸与清单不一致');
  }
  return {
    frames: manifest.frames,
    origin: { x: stage.width / 2 - stage.originX, y: stage.height - stage.originY },
  };
}

export async function sliceSheet(image, plan, signal) {
  const canvas = document.createElement('canvas'),
    files = [],
    timings = new Map();
  try {
    for (const [i, frame] of plan.frames.entries()) {
      signal?.throwIfAborted();
      const r = frame.rect;
      canvas.width = r.width;
      canvas.height = r.height;
      canvas
        .getContext('2d')
        .drawImage(image, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
      const blob = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('切片 PNG 编码失败'))),
          'image/png',
        ),
      );
      const name = `frame_${String(i + 1).padStart(4, '0')}.png`;
      files.push(new File([blob], name, { type: 'image/png' }));
      if (frame.durationTicks) timings.set(name, frame.durationTicks);
    }
    signal?.throwIfAborted();
    return { files, timings: timings.size ? timings : null };
  } finally {
    canvas.width = canvas.height = 1;
  }
}
