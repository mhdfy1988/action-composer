import { zipSync } from 'fflate';
import { LIMITS } from '../domain/project.js';

// PNG 已压缩，以存储模式打包；不在界面线程重复压缩像素。
export function packFiles(files) {
  if (Object.values(files).reduce((n, b) => n + b.length, 0) > LIMITS.bytes)
    throw new Error('归档超过 96 MB 预算');
  return zipSync(files, { level: 0 });
}
