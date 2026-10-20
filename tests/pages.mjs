import { context } from 'esbuild';
import { cp, mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// 静态服务只暴露实际交付产物；不借用源码服务修复缺失资源。
const site = resolve('output/pages-site');
const info = JSON.parse(await readFile(resolve(site, 'build-info.json'), 'utf8'));
assert.match(info.revision, /^[a-f0-9]{40}$/);
for (const [file, expected] of Object.entries(info.hashes)) {
  assert.equal(
    createHash('sha256')
      .update(await readFile(resolve(site, file)))
      .digest('hex'),
    expected,
  );
}
const files = (await readdir(site, { recursive: true })).map((file) => file.replaceAll('\\', '/'));
assert.deepEqual(
  files.sort(),
  [
    '.nojekyll',
    'build-info.json',
    'dist',
    'dist/OPENCV-LICENSE.txt',
    'dist/app.css',
    'dist/app.js',
    'dist/opencv.js',
    'dist/registration-worker.js',
    'index.html',
  ].sort(),
);
await mkdir(resolve('output'), { recursive: true });
const preview = await mkdtemp(resolve('output/pages-preview-'));
await cp(site, resolve(preview, 'action-composer'), { recursive: true });
const server = await context({ logLevel: 'silent' });
try {
  const { port } = await server.serve({ servedir: preview, host: '127.0.0.1', port: 0 });
  process.env.ACTION_COMPOSER_TEST_URL = `http://127.0.0.1:${port}/action-composer/`;
  console.log(`静态子路径验收：${process.env.ACTION_COMPOSER_TEST_URL}`);
  await import('./browser.mjs');
} finally {
  await server.dispose();
}
