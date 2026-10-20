import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { packFiles } from '../src/infrastructure/archive.js';
import { LIMITS } from '../src/domain/project.js';
import { pngSize } from '../src/infrastructure/media.js';

test('导出打包保留文件路径和原始字节，不修改输入', () => {
  const files = {
    'frames/01.png': new Uint8Array([1, 2, 3]),
    'animation.json': new Uint8Array([123, 125]),
  };
  const before = structuredClone(files);
  assert.deepEqual(unzipSync(packFiles(files)), files);
  assert.deepEqual(files, before);
});
test('超出导出预算在调用压缩库前拒绝', () => {
  assert.throws(() => packFiles({ oversized: { length: LIMITS.bytes + 1 } }), /96 MB/);
});
test('损坏PNG头明确拒绝', () => {
  assert.throws(() => pngSize(new Uint8Array(40)));
});
