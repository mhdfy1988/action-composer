import { readdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { buildOptions } from './build-options.mjs';

// 以正式入口和Worker的实际构建图检查孤立源码，不把实验入口当作正式功能。
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'src');
const { metafile } = await build({
  ...buildOptions,
  absWorkingDir: root,
  write: false,
  sourcemap: false,
  metafile: true,
});
const inputs = new Set(Object.keys(metafile.inputs).map((name) => resolve(root, name)));
const entries = await readdir(source, { recursive: true, withFileTypes: true });
const unused = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
  .map((entry) => resolve(entry.parentPath, entry.name))
  .filter((path) => !inputs.has(path));
if (unused.length) {
  throw new Error(
    `正式源码存在未接入入口的模块，请删除或移入实验目录：\n${unused.map((path) => relative(root, path)).join('\n')}`,
  );
}
console.log('源码入口检查通过：src中的JavaScript模块均可由正式入口或Worker到达。');
