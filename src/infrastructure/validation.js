import Ajv from 'ajv';
import { LIMITS, TICKS } from '../domain/project.js';

const number = { type: 'number', minimum: -100000, maximum: 100000 };
const id = { type: 'string', pattern: '^[a-zA-Z0-9-]{1,64}$' };
const text = { type: 'string', minLength: 1, maxLength: 160 };
const object = (properties, optional = []) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties).filter((key) => !optional.includes(key)),
});
const point = object({ x: number, y: number });
const dimension = { type: 'integer', minimum: 1, maximum: LIMITS.side };
export const projectSchema = object({
  format: { const: 'action-composer' },
  version: { const: 1 },
  name: text,
  ticksPerSecond: { const: TICKS },
  stage: object({ width: dimension, height: dimension, originX: number, originY: number }),
  reference: {
    anyOf: [
      { type: 'null' },
      object({ assetId: id, opacity: { type: 'number', minimum: 0, maximum: 1 } }),
    ],
  },
  assets: {
    type: 'array',
    maxItems: LIMITS.frames + 24,
    items: object({
      id,
      name: text,
      width: dimension,
      height: dimension,
      sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    }),
  },
  groups: {
    type: 'array',
    maxItems: LIMITS.groups,
    items: object({
      id,
      name: text,
      frames: {
        type: 'array',
        minItems: 1,
        maxItems: 120,
        items: object(
          {
            id,
            assetId: id,
            durationTicks: { type: 'integer', minimum: 1, maximum: TICKS * 60 },
            verticalOffset: number,
            horizontalOffset: number,
          },
          ['id', 'verticalOffset', 'horizontalOffset'],
        ),
      },
      scale: { type: 'number', minimum: 0.01, maximum: 20 },
      x: number,
      y: number,
      lockX: { type: 'boolean' },
      lockY: { type: 'boolean' },
      horizontal: { type: 'boolean' },
      anchors: { type: 'array', maxItems: 120, items: { anyOf: [{ type: 'null' }, point] } },
    }),
  },
});
const ajv = new Ajv({ allErrors: true, strictNumbers: true });
const validate = ajv.compile(projectSchema);
export function validateProject(project) {
  if (!validate(project))
    throw new Error('工程格式无效：' + ajv.errorsText(validate.errors, { separator: '；' }));
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  if (assets.size !== project.assets.length) throw new Error('素材 ID 重复');
  if (new Set(project.groups.map((g) => g.id)).size !== project.groups.length)
    throw new Error('动作组 ID 重复');
  if (project.assets.reduce((n, a) => n + a.width * a.height, 0) > LIMITS.pixels)
    throw new Error('工程解码像素超过预算');
  if (project.stage.width * project.stage.height > 16000000)
    throw new Error('输出画布超过 1600 万像素');
  if (project.reference && !assets.has(project.reference.assetId)) throw new Error('基准素材缺失');
  let count = 0;
  for (const group of project.groups) {
    const frameIds = group.frames.filter((f) => f.id).map((f) => f.id);
    if (new Set(frameIds).size !== frameIds.length) throw new Error('帧 ID 重复');
    count += group.frames.length;
    if (group.anchors.length !== group.frames.length) throw new Error('标点数量与帧数量不一致');
    group.frames.forEach((frame, i) => {
      const asset = assets.get(frame.assetId),
        p = group.anchors[i];
      if (!asset) throw new Error('动作帧素材缺失');
      if (p && (p.x < 0 || p.y < 0 || p.x > asset.width || p.y > asset.height))
        throw new Error('标点越出原图范围');
      if (group.horizontal && !p) throw new Error('水平补偿需要标完所有帧');
    });
  }
  if (count > LIMITS.frames) throw new Error('工程最多 240 帧');
  return project;
}
