import { build } from 'esbuild';
import { mkdir, copyFile, readFile, readdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOptions } from './build-options.mjs';
import { prepareOpenCv } from './opencv-runtime.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = resolve(root, 'output/pages-site');
const dist = resolve(site, 'dist');
const files = [
  '.nojekyll',
  'index.html',
  'build-info.json',
  'dist/app.js',
  'dist/app.css',
  'dist/registration-worker.js',
  'dist/opencv.js',
  'dist/OPENCV-LICENSE.txt',
];
await mkdir(dist, { recursive: true });
// 专用产物目录只允许白名单文件，发现残余内容就拒绝上传，不递归清理用户目录。
async function checkFiles() {
  const entries = await readdir(site, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (resolve(entry.parentPath, entry.name) !== dist) throw new Error('站点产物含未知目录');
      continue;
    }
    const path = resolve(entry.parentPath, entry.name);
    if (!entry.isFile() || !files.some((file) => resolve(site, file) === path))
      throw new Error(`站点产物含非白名单文件：${entry.name}`);
  }
}
await checkFiles();
await prepareOpenCv(dist);
await build({ ...buildOptions, absWorkingDir: root, outdir: dist, sourcemap: false, minify: true });
await copyFile(resolve(root, 'index.html'), resolve(site, 'index.html'));
await writeFile(resolve(site, '.nojekyll'), '', 'utf8');
const { version } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const revision =
  process.env.GITHUB_SHA ??
  execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('站点构建来源提交无效');
const hashes = {};
for (const file of files.filter((file) => file !== 'build-info.json')) {
  hashes[file] = createHash('sha256')
    .update(await readFile(resolve(site, file)))
    .digest('hex');
}
await writeFile(
  resolve(site, 'build-info.json'),
  JSON.stringify({ version, revision, hashes }, null, 2) + '\n',
  'utf8',
);
await checkFiles();
console.log(`Pages产物：${site}（${files.length}个白名单文件，提交${revision}）`);
