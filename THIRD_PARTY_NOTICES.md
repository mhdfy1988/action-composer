# 第三方技术

版本与许可已按本机安装包元数据核对，完整许可保留在依赖包中；生产构建保留依赖要求的法律注释。用户图片不属于这些开源依赖的授权内容。

| 技术            | 固定版本 | 许可       | 用途                      |
| --------------- | -------- | ---------- | ------------------------- |
| Ajv             | 8.20.0   | MIT        | 工程与清单结构校验        |
| fflate          | 0.8.3    | MIT        | 素材ZIP打包及测试回读     |
| esbuild         | 0.28.2   | MIT        | 开发期构建和本地服务      |
| Playwright Test | 1.63.0   | Apache-2.0 | 开发期隔离 Chrome 验收    |
| fast-png        | 8.0.0    | MIT        | 开发期 PNG 夹具与像素回读 |
| Prettier        | 3.9.10   | MIT        | 开发期源码格式化与检查    |
| OpenCV.js       | 4.13.0   | Apache-2.0 | 后台全身模板匹配，无模型  |

没有引入 Vue、React、Cordis 或本地 AI 模型。npm 依赖由锁文件固定；OpenCV 官方预编译运行库另按 SHA-256 固定，首次构建下载到 `.cache/opencv`，构建复制至 dist，附 `OPENCV-LICENSE.txt`。后续发布前仍需核对完整依赖树和预编译库内第三方组件的许可证分发要求。

正式工具与独立 `experiments/registration` 实验页共用匹配核心，浏览器仅在匹配时加载本机运行库。固定来源、哈希和源码证据见[实验说明](experiments/registration/README.md)，准备入口为 `scripts/opencv-runtime.mjs`。
