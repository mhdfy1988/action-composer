import Ajv from 'ajv';
import { TICKS } from '../domain/project.js';

const ajv = new Ajv();
const image = { type: 'string', pattern: '^(frames/)?[^/\\\\]+\\.png$' };
const ticks = { type: 'integer', minimum: 1, maximum: TICKS * 60 };
const validateOwn = ajv.compile({
  type: 'object',
  required: ['format', 'version', 'ticksPerSecond', 'frames'],
  properties: {
    format: { const: 'action-composer-animation' },
    version: { const: 1 },
    ticksPerSecond: { const: TICKS },
    frames: {
      type: 'array',
      minItems: 1,
      maxItems: 120,
      items: {
        type: 'object',
        required: ['image', 'durationTicks'],
        properties: { image, durationTicks: ticks },
      },
    },
  },
});
const validateLegacy = ajv.compile({
  type: 'object',
  required: ['formatVersion', 'kind', 'playback', 'frames'],
  properties: {
    formatVersion: { const: 6 },
    kind: { const: 'uniform-frame-export' },
    playback: {
      type: 'object',
      required: ['fps', 'frameCount'],
      properties: {
        fps: { type: 'number', minimum: 1, maximum: 60 },
        frameCount: { type: 'integer', minimum: 1, maximum: 120 },
      },
    },
    frames: {
      type: 'array',
      minItems: 1,
      maxItems: 120,
      items: { type: 'object', required: ['image'], properties: { image } },
    },
  },
});

// 显式格式适配：v6 的 durationMs 是来源采样间隔，输出播放必须使用 playback.fps。
export function orderFromManifest(manifest, files) {
  let entries;
  if (validateOwn(manifest)) entries = manifest.frames;
  else if (validateLegacy(manifest)) {
    if (manifest.frames.length !== manifest.playback.frameCount)
      throw new Error('帧清单数量不一致');
    entries = manifest.frames.map((frame) => ({
      image: frame.image,
      durationTicks: Math.round(TICKS / manifest.playback.fps),
    }));
  } else throw new Error('不支持此帧清单：仅支持本工具 animation.json 或 uniform-frame-export v6');
  const byName = new Map(files.map((file) => [file.name, file]));
  if (byName.size !== files.length || entries.length !== files.length)
    throw new Error('PNG 数量或名称与帧清单不一致');
  const names = entries.map((entry) => entry.image.split('/').pop());
  if (new Set(names).size !== names.length || names.some((name) => !byName.has(name)))
    throw new Error('帧清单引用缺失或重复');
  return {
    files: names.map((name) => byName.get(name)),
    timings: new Map(entries.map((entry, i) => [names[i], entry.durationTicks])),
  };
}
