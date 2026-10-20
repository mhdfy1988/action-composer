# 首版复用与协议基线

> 2026-10-20提交前清理：当前实现见[提交准备与代码边界](submission-readiness.md)。旧工程读写／迁移已删除，轮廓对齐与纵向估算移至experiments/registration；以下旧阶段描述不代表这些入口仍存在。

当前补充：精灵图反向导入已接入统一导入用例，支持本工具清单与显式等格切片；前端模板、样式与局部事件已按组件归属整理。下方分轮记录中“尚未实现”和旧测试入口只说明当时状态，当前能力以README及代码边界为准。

## 2026-10-20 帧管理最终收口

- ui/filmstrip 只保留当前帧按钮单选与原生单帧拖放，不再维护多选集合或复选框。拖放传出单个下标及插入边界，domain/frame-operations 同步变更 frames／anchors。参考 FrameBaker 的 apps/web/src/components/FrameList.tsx 原生 draggable 入口，未采用其 modifier 多选、React 组件或远端数据链路。
- captureFrame／pasteFrame复用同一领域逻辑，复制在所属卡片后直接插入副本，以新id区分来源，图片资产引用不复制；没有剪贴板或粘贴界面。每张卡片独立持有按钮，未选中时也能悬停操作，点击显式传入所属位置。
- frames[].id 独立于顺序；scoped-history 按身份匹配，因此排序不伪造修正。复制／排序／删除由Session单笔记录。moveSelection只接受当前帧下标，舞台增量经尺度换算并遵守锁轴；松手提交、Esc取消。旧多选版本仅为验证记录中的历史状态，不保留隐藏入口。

## 当前基线：2026-10-20 界面精简与范围记录

- 正式入口只提供本次动作处理，不暴露工程保存／载入，也不保留隐藏DOM。内部数据与Ajv校验仍复用v1；旧工程归档读写／迁移已删除，归档模块只保留导出打包。以下早期记录涉及工程入口、标点和自动纵向估算的部分均为历史行为。
- `application/scoped-history.js` 从每笔成功事务前后提取整组 scale/x/y 和逐帧 horizontalOffset/verticalOffset 的小型记录，保存真实 from/to，游标随撤销／恢复移动；新分支截掉失效的后续记录，失败／空事务不记录。素材导入不冒充变换操作。
- `Session.resetScope` 查找当前有效记录里对应组／帧第一次修改前的参数，仅回写该范围字段；缺省字段删除而非硬写零。整组重置不动帧，帧重置不动整组／其他帧，素材／时序／锁轴均保留。重置通过普通 Session.edit 记录，能撤销／恢复；超过 80 笔快照窗口仍保留本次轻量范围记录，无图片副本。关闭刷新全部丢失，不承诺跨会话恢复。
- `workspace` 的 inspector 跟随编辑范围读写；整组数值与图上移动／四角缩放一致，帧数值与图上拖动一致。普通编辑遵守锁轴，显式确认的范围重置回溯全部对应变换，即使轴当前锁定。弹窗确认异步返回后核对会话对象、组、范围和帧，防止迟到重置。
- 导出动作名称只改输出快照与包名，不修改会话动作名称或增加编辑记录；全部动作模式的名称为包名，动作清单各保留原名。留白与名称仅在弹窗展示。输出仍复用共用测量、绘制与图集打包链路。
- 当前浏览器验证为 `tests/browser.mjs`，覆盖正式数值／鼠标／键盘和实际下载；不再使用旧工程下载／重新导入建立测试状态。范围与游标边界见 `tests/scoped-history.test.mjs`。早期浏览器辅助文件已移除，历史测试记录不代表当前脚本仍存在。

## 2026-10-20：单帧编辑与批量输出增量

- `domain/frame-edit.js/moveSelection` 按编辑范围写整组位置或当前帧修正；输入增量为舞台像素，帧字段为原图像素。`placement` 统一叠加 `horizontalOffset`、`verticalOffset`，预览／测量／输出不另加第二次。旧工程缺省零，新字段通过现有 Ajv schema 校验。
- 工具栏编辑范围与首帧叠加仅属于会话，后者绘制当前动作已修正的首帧（25% 不透明度），不进入工程和输出。单帧拖动不缩放，整组四角缩放不变。手势从起点快照计算，松手一笔历史；键盘只接受画布聚焦、选中且未播放／标点时的方向键，遵守轴锁。
- 首帧匹配仍读原始图像识别相对关系，但 `matchedTransform` 用包含当前帧修正的 placement 计算舞台映射；只更新整组 scale/x/y，不删除帧字段。不得把“读原图匹配”误写成“重置回原始状态”。
- `application/export.js` 复用逐帧测量，范围显式选择当前／全部动作。多动作各自输出，统一取所选全部帧的共同范围及原点；不采用显示勾选集合，也不叠加成一个动作。
- 序列保持 `action-composer-animation` v1。精灵图使用独立 `action-composer-spritesheet` v1：`stage` 表示单格尺寸与原点，`sheet` 是整图尺寸；`frames[].rect` 为图集中 x/y/width/height 半开矩形，`durationTicks` 与 `ticksPerSecond` 表示时间。每格不紧裁、不旋转。多动作根索引 `action-composer-animations` v1 包含共同 stage 和各动作 manifest 路径。清单路径相对各自清单目录，不代表任何引擎原生格式；精灵图反向导入未实现。
- 素材输出使用当前内存修正，不要求先保存工程；导出不会清除未保存标记。透明叠加、灰底、选框、原点线不输出。任一所选动作全透明、画布／精灵图超过 8192 边长或 1600 万像素、归档超过 96 MB，均明确失败；取消／失败不下载半成品。
- 源码证据：本机 XSXB `tools/frame_tuner_lite/public/lite.js/calculateOptimalLayout` 对当前角色全部动作测量共同范围，`exportOutput` 在统一原点下逐动作输出序列或规则图集；`tools/animation_tuner/public/app.js/renderLiteExportFrame` 使用实际帧变换绘制，不烘焙界面。此轮借鉴其输出语义，不复制其代码／工程格式／多层系统。对应本项目测试 `frame-edit.test.mjs`、`frame-edit-browser.mjs`，以真实下载归档与 PNG 像素为依据。

2026-10-19；实现范围 P0／P1 及首帧整组对齐增量，不代表逐帧自动去位移或分层舞台已经接通。

## 复用来源

- `../reference-compare-demo/horizontal-motion.js`：底部中心坐标下的人工腰点水平补偿，迁入 `src/domain/horizontal-motion.js`。非空动作组检查增加空组保护。
- 原计算测试的缩放、不同画布宽度与缺标点用例迁入本项目测试；测试结论以重新运行结果为准。
- 原 HTML 中基准图、并排／叠加与整组校准是交互参考，不整体复制内联界面、全局变量、加载默认私人图片和临时服务。
- 旧小样无工程保存、图片导出、输入运行时校验；这些是新能力，不声称已直接复用。

## 时间与坐标

每秒 60000 个整数刻度；帧持续时间独立保存，半开区间定位，预览从绝对播放时间求帧，不累计逐帧误差。首版匀速导入限定 1–60 的整数帧率，通过 `round(60000/fps)` 确定每帧整数刻度，导入前展示实际帧时长；并非所有整数帧率都能精确表示，工程保留实际刻度。

工作台使用像素，X 向右、Y 向下；原图底部中心落在项目原点上，再应用整组缩放、人工水平补偿与整组偏移。单图和多帧均为普通动作，没有独立基准绘制。观察视图按勾选动作取景后保持稳定，缩放与平移仅用于观察。v1 工程保留 stage 字段作为已有坐标基准，其 width/height 不再限制绘制或导出。

不自动逐帧居中、识别身体或补偿纵向跳跃。输出范围是全部帧的共同可见范围；先使用共享 drawFrame 实际绘制各帧并扫描 alpha>0 像素，取并集加留白，再以同一个整数平移量输出全部帧。全透明帧不贡献边界但保留，全组透明则拒绝。超预算拒绝，不回退到旧固定范围。

## 工程协议 v1

### 首帧对齐事务

`application/align-first-frame.js` 读取双方原始首帧，通过 `domain/whole-body.js` 选完整前景；`infrastructure/registration.js` 启动共用 OpenCV Worker，固定灰度梯度多尺度全身匹配。`domain/matched-transform.js` 复用 placement，将“目标原图→参照原图”的尺度／平移经参照已有变换映射到舞台，不重复叠加目标旧尺度。锁轴固定对应偏移；越界变换经统一校验显式拒绝。轮廓计算只保留为实验对照，不能作为失败回退。

`application/align-all-first-frames.js` 固定当前动作和原工程快照，遍历其余全部动作，不接收显示集合。逐项复用 align-first-frame，暂存成功结果与失败原因，不在循环中发布；全部结束核对基准身份后，成功项通过同一次 Session.edit 更新 scale/x/y。失败项与基准不改，全失败不进历史，整批撤销／恢复；不会使后续目标向已变换的目标匹配。

后台取消销毁当前 Worker，抛出取消而非部分成功结果，前面暂存的更新也不发布；每项 60 秒超时按失败报告。没有临时确认状态或参照下拉；后续人工编辑复用既有参数和拖动历史，不改变显隐。原图、时序、标点、基准保持不变，不是身体识别或逐帧去位移。

源码证据：OpenCV `matchTemplate`／`minMaxLoc`、掩膜及初始化约定见[实验源码索引](../experiments/registration/README.md#源码证据索引)；正式与实验共用 `infrastructure/registration-worker.js`，避免维护两套算法。运行库固定 4.13.0，`.cache` 与 dist 不进源码；构建按哈希校验，无模型、无素材上传。

## 工程保存与输出

### 纵向去位移

- 依据 [OpenCV 模板匹配定义](https://docs.opencv.org/4.13.0/de/da9/tutorial_template_matching.html) 的 `TM_CCORR_NORMED`，复用现有 Worker，无模型和新依赖。不是身体关键点识别。
- `registration-worker.js/searchVertical`：RGB 加常量后乘 alpha，透明 RGB 不参与；公共底部中心、最长边 320 工作图，`reduce` 横向求和为逐行颜色分布。纵向零填充后匹配相关峰，只产生 y 补偿，不改变 x 或尺度。相对逐像素全身匹配，减少摆臂、尾巴横摆干扰；弯腰和遮挡仍影响结果。0.55 为拒绝阈值，0.75 为检查提示，不是成功概率。
- `application/remove-vertical-motion.js`：各帧直接匹配原始首帧，不串联、不累加旧修正；全部成功后同一次 Session.edit 应用。取消／失败不发布任何帧，失败报告帧号。
- 可选 `frames[].verticalOffset` 单位为原图像素；`placement` 乘整组尺度后加到 y。手调框以舞台像素显示并反算；预览、测量和导出共用。缺省零兼容旧 v1，新字段不保证旧读取器兼容。
- 跳跃高度会抵消，姿态伸缩保留，需人工检查；自动横向去位移仍未实现。整体重置与清除纵向修正会删除此字段，可撤销。

运行时定义及校验入口 `src/infrastructure/validation.js`，由 Ajv JSON Schema 和语义校验共同约束。包含 `format/version/ticksPerSecond`、坐标基准、素材描述和独立动作组；每帧引用素材 ID，保存持续刻度，图片字节不进入 JSON。reference 字段仅为读取旧工程保留，新工程固定为 null。

旧 reference 通过 `infrastructure/migrate-reference.js` 显式转为一帧普通动作，不改原点或素材字节、不保留旧特殊透明度；原引用清空，转换后以旧清单作为保存基线，提示未保存。动作／帧预算已满时拒绝，当前工程保留；重新保存打开不会重复转换。

自包含 `.acproj` 为 ZIP：`project.json` 与 `assets/<素材ID>.png`。载入先校验归档预算、协议、引用、原图尺寸及 SHA-256，再一次性替换当前会话。未知格式版本拒绝，不尝试旧逻辑兜底。

校准导出 ZIP 使用共同内容范围生成的统一尺寸 PNG 和 `animation.json`；stage 为本次实际输出宽高与原点，contentOffset 表示共同裁切左上角相对项目原点的位置，padding 表示四周留白，clipped 恒为 false。原点允许位于图片外，以保留整组平移语义。测量和输出共用渲染链路，不宣称引擎原生导入兼容。其他动作、参考线、腰点和灰底不进入输出。

## 内容范围导出的源码证据索引

- 参考 [XSXB 轻量版 calculateOptimalLayout](https://github.com/sparklecatta-lang/XSXB-Frame-Tuner/blob/cb061e15132b9250feebd34a18a3fd023197837c/tools/frame_tuner_lite/public/lite.js#L130)：逐帧绘制测量、合并可见范围、统一原点与留白；2026-10-20 增加显式“全部动作”范围，采用共同画布但仍逐动作分别输出。
- 参考 [FrameBaker exportAnimation](https://github.com/taotao7/FrameBaker/blob/f9846c985156f83f750bcc654b56cae2a1960229/apps/web/src/export.ts#L169)：全部帧共用范围和原点以保持位移；本项目采用实际像素扫描，不复制其多轨与特效结构。
- 本地落点：`domain/output-layout.js` 负责边界并集与预算，`rendering/measure-output.js` 负责测量，`application/export.js` 负责统一偏移后的 PNG 与清单。以浏览器实际下载像素及原点回读为验证依据。

## 依赖与隔离

- Ajv 8.20.0：替代手写完整结构校验，封装在 validation 适配层。
- fflate 0.8.3：替代手写 ZIP 格式，封装在 archive 适配层。
- esbuild 0.28.2：构建与本地服务，不手写 HTTP 服务器。
- Playwright 1.63.0、fast-png 8.0.0：仅开发期验收浏览器与下载 PNG。
- Prettier 3.9.10：仅开发期统一格式，避免内联压缩风格源码难以阅读；不进入运行时。

参考：[Ajv 官方入门](https://ajv.js.org/guide/getting-started.html)、[fflate 官方源码与用法](https://github.com/101arrowz/fflate)、[esbuild 官方服务接口](https://esbuild.github.io/api/#serve)。依赖 API 不作为领域数据类型；锁文件固定安装版本。未引入前端框架、AI 模型或 Cordis。
