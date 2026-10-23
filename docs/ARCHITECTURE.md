# 架构说明

magic file box 是采用 Electron、Vue 3、TypeScript 和 Vite 的 Windows 桌面应用。本文描述目录迁移后的实际结构、依赖与运行链路；开发规则见 [DEVELOPMENT](DEVELOPMENT.md)，验证方法见 [TESTING](TESTING.md)，功能范围见 [README](../README.md)，未实施方向见 [BACKLOG](BACKLOG.md)。

项目保持单应用、单 package.json 和 npm 构建。组件入口与职责归属借鉴了 [Element Plus 的组件目录](https://github.com/element-plus/element-plus/tree/dev/packages/components/button)，未引入多包发布机制。源码与运行产物分离，文件类型继续通过注册表接入。

## 运行分层与入口

```mermaid
flowchart LR
  R[Vue 渲染窗口] <-->|localPreview| P[preload 桥接]
  P <-->|IPC| M[Electron 主进程]
  M --> F[本地文件与主动保存]
  M --> W[窗口、托盘与系统打印]
  M --> U[独立更新会话]
  R --> K[PDF、代码语法与表格解析 Worker]
```

| 入口 | 实际职责 |
| --- | --- |
| [electron/main.ts](../electron/main.ts) | 初始化应用、协议和服务，处理文件打开、窗口创建、托盘、第二实例及退出 |
| [electron/preload.ts](../electron/preload.ts) | 通过 contextBridge 暴露 localPreview，将受控操作与事件映射到 IPC |
| [src/main.ts](../src/main.ts) | 加载全局样式，根据窗口 URL 选择应用、打印面板或打印渲染入口 |
| [src/App.vue](../src/App.vue) | 组装首页、标签栏、文件预览、设置、错误提示和更新通知 |
| [useExclusive](../src/composables/useExclusive.ts) | 读取启动时专属状态，按已识别的方案加载对应组件 |
| [shared/bridge.ts](../shared/bridge.ts) | DesktopBridge 的跨进程接口类型 |

窗口共用 `preview://local/index.html`：无参数为首页，`?preview=1` 为文件预览，`?print-panel=1` 为打印设置，`?print=1` 为隐藏打印渲染。主进程负责创建窗口；src/main.ts 负责选择渲染界面。

预览窗口不能直接访问 Node 文件系统。主进程保留来源路径与所有权，渲染端通过文件 ID 和桥接请求操作。打印、导出和更新各自经过对应的主进程服务。

## 目录职责

```text
magic-file-box/
├─ electron/                 主进程与 preload
│  ├─ files/                 文件读取、所有权、移交、另存与资源协调
│  ├─ windows/               全屏等窗口能力
│  ├─ settings/              应用设置存储
│  ├─ security/              本地协议、session 与调用来源检查
│  ├─ printing/              打印队列、设置窗口和系统提交
│  └─ updates/               更新状态机、驱动和重启协调
├─ shared/                   跨进程契约与无界面的校验逻辑
├─ src/
│  ├─ components/            app、ui、preview、settings、updates、printing
│  ├─ composables/           Vue 状态、订阅与交互生命周期
│  ├─ services/              文件缓存、待提交编辑等有状态服务
│  ├─ utils/                 纯计算、格式化及 DOM 工具
│  ├─ types/                 渲染端全局声明与接口
│  ├─ styles/                主题、基础、应用和组件样式
│  └─ modules/               word、text、excel、ppt、pdf、image
├─ scripts/                  构建、资源生成、产物校验和分支同步
├─ tests/                    公共执行器、窗口及跨模块测试
├─ assets/                   应用与安装器图标
├─ public/                   Vite 直接复制的静态资源
└─ docs/                     开发规则、架构、测试、计划与历史
```

electron/main.ts 仍持有应用和窗口的总调度，并非所有窗口逻辑都位于 windows/。composables 包含 Vue 交互；utils 也包含表格拖动和安全 ResizeObserver 等 DOM 工具。目录名称表达职责，不表示其中所有函数都无副作用。

### 应用组件与公共状态

| 位置 | 主要内容与调用关系 |
| --- | --- |
| [components/app](../src/components/app) | HomeView、TabStrip 及其入口；标签栏负责几何测量、真实滚动和事件转发 |
| [components/ui](../src/components/ui) | ToolButton、ToolbarIcon 等基础控件，供各格式复用 |
| [components/preview](../src/components/preview) | PreviewTab、缩放/适配/页码和 PreviewPanel 浮窗；PreviewTab 负责模块选择与加载 |
| [components/settings](../src/components/settings) | 设置界面，通过文本模块公开入口懒加载代码外观编辑器 |
| [components/updates](../src/components/updates) | 更新中心和通知界面 |
| [components/printing](../src/components/printing) | 通用打印面板、参数、队列状态、错误提示和打印宿主 |
| [useApplication](../src/composables/useApplication.ts) | 当前文件会话、活动标签、键盘、拖放、打开/关闭和窗口移交订阅 |
| [useAppSettings](../src/composables/useAppSettings.ts) | 设置加载/保存、系统主题监听与跨窗口设置同步 |
| [services](../src/services) | 文件字节 LRU 缓存；编辑完成前的等待协调 |
| [types](../src/types) | desktop.d.ts 声明 Window.localPreview，printing.ts 定义渲染器生命周期 |

共用契约按 [files.ts](../shared/files.ts)、[settings.ts](../shared/settings.ts)、[formats.ts](../shared/formats.ts)、[bridge.ts](../shared/bridge.ts) 拆分。[contracts.ts](../shared/contracts.ts) 保留公开聚合入口；打印、更新、Excel 草稿和代码外观有各自的契约文件。shared 不包含 Vue 组件，也不承担格式解析。

## 依赖关系与路径解析

当前依赖关系按职责区分，而不是把整个 components 目录当成同一层：

- 应用组件调用公共 composable、预览容器、设置和更新界面。
- PreviewTab 调用格式注册表；各格式组件复用 ui 控件、页码/浮窗等基础预览组件及公共工具。
- 通用打印宿主调用 PDF、Word、图片各自的 printing 入口；格式渲染器使用公共打印样式和接口。
- 设置界面调用 [text/settings.ts](../src/modules/text/settings.ts) 的懒加载入口。
- 主进程和渲染端共享数据契约，通过 preload/IPC 交互；格式解析仍留在各模块。

`@/` 对应 src/，`@shared/` 对应 shared/。[tsconfig.base.json](../tsconfig.base.json) 是 TypeScript/tsx/esbuild 的路径映射基础；[vite.config.ts](../vite.config.ts) 提供相同目录映射。主进程和测试入口的 esbuild 显式读取继承该配置的 tsconfig.electron.json。

模块内部通常使用短相对路径；跨目录可通过别名定位。PDF 搜索和语法 Worker 使用 `new URL(..., import.meta.url)`，由 Vite 生成 Worker 资源。别名是源码解析能力，产物中的 Node 入口不依赖直接执行带别名的 TypeScript。

公开入口按用途设置：模块 index.ts 用于预览注册；printing/index.ts 用于打印能力；text/settings.ts 用于外观设置。没有为每个目录强制建立聚合入口，以免将懒加载界面提前引入。

## 格式模块与注册

[modules/index.ts](../src/modules/index.ts) 汇总六个模块并按小写扩展名选择实现。[modules/types.ts](../src/modules/types.ts) 定义注册与界面契约：

| 字段或接口 | 用途 |
| --- | --- |
| id、extensions、component | 模块标识、扩展名及预览组件 |
| sourceComponent | 文件采用按需读取时的可选模块入口；PDF 复用既有组件与导航 |
| pageFit、toolbar | 可选的页面适配能力与格式工具入口 |
| closeFile(id) | 文件标签关闭时释放模块缓存；区别于闲置时卸载 DOM |
| PreviewProps | 文件、倍率和适配模式 |
| PreviewEmit | ready、error、update:zoom 等组件事件；模块通过 usePreviewTask 报告加载阶段 |

每个模块保留 index.ts 和 index.vue。较大模块将实现分到 components、composables、core、styles、workers、printing、tests；较小模块只设置当前需要的目录。

| 模块 | 内部划分与关键实现 |
| --- | --- |
| [Excel](../src/modules/excel) | core/editing 管理输入、选区、格式/查找/排序模型；core/formula 管理公式与引用；core/workbook 管理载荷、读写和布局。useEditor 协调草稿、事务、撤销和另存 |
| [PDF](../src/modules/pdf) | core 管理文档、尺寸、画布、队列和搜索索引；composables 组织预览/查询/批注；workers 执行模式搜索；printing 承担专用打印渲染与纸张示意 |
| [文本](../src/modules/text) | core 管理语法、安全标记、Markdown、公式和图表，usePreview 处理编码与预览；workers 执行语法分析；components 提供 Markdown 阅读和代码外观设置 |
| [Word](../src/modules/word) | usePreview 组织解析、分页、表格列宽与生命周期；core/outline 标记 DOCX 标题，useDocxNavigation 管理搜索与目录；printing 提供 DOCX 打印 |
| [PPT](../src/modules/ppt) | core/renderer 与 snapshot 组织幻灯片渲染及快照；index.vue 管理视口与分页 |
| [图片](../src/modules/image) | usePreview 管理解码、旋转、适配和视口；printing 提供图片输出 |

### 各格式的数据边界

- PDF：文档加载按文件与凭据复用，正文按行虚拟化；自动单双页、搜索、旋转与批注共享物理页坐标。文字缓存有界，模式搜索可取消。画布池、工作队列和主进程资源协调各自承担计费与释放。
- Excel：原始载荷与内存草稿分离，区域操作先形成完整结果再安装。保存检查点区分单表文本输出和完整工作簿。XLSX 在 ZIP/XML 层修补以保留无关对象；XLS 由 BIFF 读写和兼容性检查处理，无法保真的内容明确提示。工作表管理、排序筛选复用同一撤销与草稿机制。
- 文本：源码字符与显示标记分离，语法高亮使用本地 Shiki/TextMate Worker，超限回退纯文本。Markdown 通过清洗后渲染；公式、图表和本地图片有各自预算和取消机制，不执行作者脚本。
- Word/PPT：文档渲染使用 Shadow DOM 隔离应用样式；旧格式的保真边界与新格式不同。分页和连续定位依赖实际渲染结果。
- 图片：EXIF 方向由浏览器解码处理一次，手动旋转以已纠正图像为基准。原始像素、适配和旋转只保存在当前会话。

具体支持范围和资源上限见 README；各函数的实现参数以源码为准，实质断言及样例见 TESTING。

文本源码搜索由 [sourceSearch.ts](../src/modules/text/core/sourceSearch.ts) 按匹配行保存累计计数，选中结果时才展开该行的字符范围。JSON 按格式化后的显示文本搜索；[highlight.ts](../src/modules/text/core/highlight.ts) 在原字符范围上合并语法标记、普通命中和当前命中，不改写源码。[index.vue](../src/modules/text/index.vue) 在跳转远处结果前挂载对应虚拟窗口，再按命中文字的实际位置定位，支持长换行行；新查询、关闭与卸载使旧导航失效。Markdown 排版查询继续使用渲染正文的搜索流程。

DOCX 通过 docx-preview 的 parseAsync/renderDocument 流程渲染。[core/outline.ts](../src/modules/word/core/outline.ts) 在解析后的内存模型中标记段落大纲级别和继承的标题样式，显式正文级别覆盖标题样式，样式循环被截断；标题标签不覆盖原书签。目录按标记映射到 Shadow DOM，长目录按可见行挂载。[useDocxNavigation.ts](../src/modules/word/composables/useDocxNavigation.ts) 管理查找浮窗、定位与活动章节，目录开关存于 PreviewFile.view.word，和临时列宽一起随会话卸载/移交；查询与命中节点仅属于当前组件。卸载清理计时器、滚动/键盘监听和动画帧。

[utils/renderedSearch.ts](../src/utils/renderedSearch.ts) 提供字面匹配及跨文字节点的搜索标记，Word 与 Markdown 各自传入段落边界、排除区域和标记类。每个逻辑匹配保留全部显示片段，DOCX 当前高亮覆盖所有片段；清理仅合并原文字节点。打印仍从原始文件字节独立渲染，不复用预览搜索标记。

PDF 的 [PdfNav.vue](../src/modules/pdf/components/PdfNav.vue) 独立管理目录和缩略图。目录搜索栏位于独立条目滚动区域之外，自动章节定位以该区域为可见边界。展开控件使用无边框的右向/下向三角箭头及 aria-expanded；有无子级均预留相同宽度，避免通用图标按钮尺寸造成同级标题错位。目录项固定单行，标题在可收缩的独立文字区域显示省略号，页码不收缩；按钮 title 保留完整标题用于悬停提示，筛选和跳页仍使用原始标题与目的地。缩略图虚拟偏移包含画布高度、卡片装饰/页码与项间距，并计入顶部页数说明；画布不参与 Flex 压缩。列表关闭浏览器滚动锚定，避免占位高度变化反向移动视口。异步取页后再次检查节点是否仍挂载，任务结束时释放未成功交付当前节点的画布，防止失效绘制占用共享像素预算。

## 文件与状态生命周期

### 精确导航与阅读工具

PDF 的 `core/destination.ts` 保留并解析命名目标及 XYZ、FitH/FitV、FitR 等目的地，通过实际页面视口转换裁切框、固有旋转和临时旋转坐标，不采用目标中的倍率覆盖用户选择。usePreview 在提交目标后定位虚拟行与页内坐标；导航代次防止尺寸更新或旧刷新恢复覆盖新跳转。目录打开时才采集当前页面的视口阅读坐标，同页章节按位置选中；明确点击的选中项保持至用户滚轮或指针操作，避免滚动边界处无法顶齐目标导致误选。

文本 `core/folding.ts` 使用本地语法标记屏蔽字符串、正则和注释中的结构字符，生成折叠区间；显示行映射保留源码行号，LineHeights 按可见行索引。折叠列表保存在 PreviewFile.view.text 中，仅属于内存会话。跳行与命中导航先展开目标祖先再挂载虚拟窗口。源码搜索延迟合并输入，按时间片统计匹配并在长行内部让出事件循环；每个查询与选中项都有取消信号，旧结果不能覆盖新查询。高亮每行最多保留 512 个普通匹配及独立当前命中，计数和定位保留全量结果。

图片 `components/ImageTools.vue` 复用公共浮窗，`core/exif.ts` 在最多 1 MiB 的 JPEG/PNG/WebP 图片头中检查 TIFF 大小端、偏移、目录深度及条目预算。大图复用 source:open 已读取的头部，返回后不在主进程来源表额外保留；不开放图片任意字节范围读取。取色反向换算手动旋转和 CSS 尺寸，普通图片从已解码图像取一个像素，大图从现有预览画布取色；仅分配 1×1 取样画布，卸载清理指针、键盘监听及画布。

### 打开、加载与释放

1. [electron/files/index.ts](../electron/files/index.ts) 准备元数据、文件 ID 与来源路径，主进程维护窗口和任务引用。
2. useApplication 接收文件列表，选择活动标签；[PreviewTab](../src/components/preview/PreviewTab.vue) 在实际需要预览时请求字节，同一来源读取合并。
3. PreviewTab 通过注册表创建格式组件，组件报告 ready/error；原文件路径不作为应用历史持久化。内容区域由 preview-body 单独承载，加载提示以转圈图标、阶段文字及取消按钮居中覆盖，位置随工具栏换行和沉浸模式自适应，不参与文档排版。首屏完成后移除提示，减少动态效果偏好下停止转圈动画。
4. 闲置标签释放预览 DOM，当前视图状态仍在 PreviewFile.view；已加载字节可留在有界内存缓存。在途编辑事务结束后才执行闲置卸载，避免中断已开始的修改。
5. 标签关闭触发模块 closeFile、字节缓存和主进程引用释放；最后使用者退出后清理路径、密码与未完成读取。

[usePreviewLoad](../src/composables/usePreviewLoad.ts) 统一读取、排队、解析、渲染、等待密码、就绪、取消与失败状态。每次加载使用独立 token 和 AbortController；模块通过 [usePreviewTask](../src/composables/usePreviewTask.ts) 捕获当前任务，报告阶段且不能更新后续重试。缓存命中也等待模块 ready，不再把已有字节等同于已完成解析。ready 后等待两帧再结束加载；取消保留标签与重试入口，旧回调不重新挂载内容。隐藏尚在加载的标签会中止本次任务，返回时重新开始；明确取消的标签返回后仍等待主动重试。加载阶段与计时不写入视图或偏好。

[previewTasks](../electron/files/previewTasks.ts) 校验窗口的来源文件引用与任务 token，提供读取取消和应用级表格解析队列（一个活动任务，最多 256 个登记任务）。读取继续复用 files/index.ts 的同文件在途任务，每个消费者独立取消；最后消费者退出才中止实际读取，取消后的重试不会复用旧读取。已声明的标签移交目标在确认前可使用受控来源引用；移交失败仍保留来源。窗口关闭、主框架重新导航/重载或渲染进程退出会清理读取与队列登记。

Excel 模块的 [workbookClient](../src/modules/excel/core/workbook/workbookClient.ts) 先申请解析名额，再启动独立 [workbook.worker](../src/modules/excel/workers/workbook.worker.ts)，调用原有数据/样式解析。Worker 只接收缓存字节的独立副本，避免转移缓存或编辑源缓冲区。结果包含基础工作簿和 [previewModel](../src/modules/excel/core/workbook/previewModel.ts) 的可克隆显示数据（样式、富文本、行列尺寸、图片与锚点），界面不重建 ExcelJS 工作簿。完成、失败或取消后终止 Worker 并释放名额，编辑后的工作簿重新安装沿用同一入口；其他编辑计算与输出尚未整体后台化。旧 XLS 与 TSV 同样沿用已有解析逻辑走该通道。

单元格与样式结果按每批最多 2048 项传递，界面接收后让出事件循环并确认，Worker 收到确认才发送下一批，避免一次性克隆完整工作簿阻塞界面或堆积消息。解析器内部 ZIP/共享字符串表不传回界面；显示所需值已在单元格中，导出仍从受保护的源字节重建。图片字节转移独立显示缓冲区，取消时丢弃未完成的结果并清理确认计时器。

PDF 待加载文档增加独立取消订阅，最后一个使用者取消时销毁在途文档任务，其他使用者不受影响。密码等待使用侧边小提示与取消入口，避免中央卡片挡住输入。Word/PPT 等现有解析器在异步边界检查取消、卸载后释放宿主；其不支持中断的同步内部调用仍不能被强制打断，不代表所有格式已经后台化。

视图状态包括倍率、适配、滚动、编码、临时列宽、工作表、PDF 阅读位置和批注。Excel 草稿及撤销快照同样保存在内存中，组件卸载不等同于丢弃草稿。

### 跨窗口移交

[transfers.ts](../electron/files/transfers.ts) 使用导出、插入/接受、移除来源的限时事务。导出前等待 [pendingEdits](../src/services/pendingEdits.ts) 中的操作完成；目标确认前保留来源引用。失败、取消或目标关闭不会提前删除源标签。

### 主动另存与导出

Excel 副本通过 [excelCopy.ts](../electron/files/excelCopy.ts)，批注 PNG 通过 [pdfExport.ts](../electron/files/pdfExport.ts) 校验并写入；来源路径和别名受到保护。[activeOutputs.ts](../electron/files/activeOutputs.ts) 跟踪在途输出，[modifiedFiles.ts](../electron/files/modifiedFiles.ts) 协调未保存状态。应用关闭和更新重启使用这些状态防止中断编辑或输出。

### 资源管理

资源预算分布在文件字节缓存、PDF 文档/画布/文字缓存、语法 Worker 和 Excel 草稿中。它们不是整个应用进程内存的硬上限，活动任务和解码后的资源可能存在额外占用。

### 文件范围与记录预览

[shared/fileSource.ts](../shared/fileSource.ts) 定义来源种类、记录页契约和路由阈值。files/index.ts 在元数据与实际加载阶段重查大小、图片头，超过对应阈值返回 `PreviewFile.source`，不读取完整字节。支持按需的格式取消原先 5/100 MiB 准入门槛；完整缓冲区读取仍有 128 MiB 分配预算，打印的字节入口与源文件预览入口明确区分。source 元数据和逻辑位置只存在内存中，不进入设置。

[electron/files/sources.ts](../electron/files/sources.ts) 持有只读文件句柄，校验窗口所有权、在途移交与随机会话 token。读前/读后校验文件大小、时间戳、设备与 inode；记录请求即使命中内部读取缓冲也重新验证来源。range 接口单次最多 1 MiB，全应用最多 8 个实际读取，等待队列最多 256；记录扫描全局依次执行，最多 128 个来源会话且每窗最多 16 个。记录解析每次只消费小块数据并在异步 I/O 处让出主进程事件循环。关闭、取消、重载或渲染进程退出释放句柄、流与会话。

格式算法保留在所属模块：文本 `core/fileRecords.ts` 解码 UTF-8/UTF-16/GB18030，识别 CSV 引号与跨行记录，超长文本按约 32 KiB 分段，维护最多 32768 个稀疏定位点；Excel `core/workbook/fileSource.ts` 逐工作表读取 XML，只保留当前列组和所需共享字符串；Word `core/fileSource.ts` 提取正文段落与继承标题级别；PPT `core/fileSource.ts` 按演示文稿关系顺序选择幻灯片。跨格式 XML 与关系工具在 shared，段落抽取在 src/utils，公共 UI 位于 RecordPreview/useSourceRecords；App 不包含格式解析分支。

[sourceArchive.ts](../electron/files/sourceArchive.ts) 通过 yauzl 的随机访问接口读取 ZIP 目录与选中条目，避免整个压缩包或无关附件进入内存。完成读取的条目校验实际长度与 CRC；未完整扫描的条目不宣称已完成完整性校验。每次记录请求累计解压 256 MiB，PPTX 单条目 32 MiB；目录最多 20000 项（PPTX 4000），名称 4 MiB；元数据 4 MiB、内嵌图片 16 MiB。XML 拒绝 DTD，深度最多 256、单文字/标签最多 1 MiB；单元格/共享字符串、单行与缓存也有实际拒绝和释放预算。按需模式省略的样式、布局、编辑与输出能力在模块界面说明。

PDF 的 [fileRange.ts](../src/modules/pdf/core/fileRange.ts) 适配 PDFDataRangeTransport，关闭自动预取与流式全量下载，单对象最多 16 MiB、分批读取最多 1 MiB；唯一读取范围按 64 KiB 块计费，服从 128 MiB 与动态跨窗口字节预算的较小值。范围来源跟随文档缓存租约释放，读取失败进入正常错误/重试状态。原有页面/文字/画布预算继续生效；范围字节计费不是 PDF.js 全部内部对象的内存上限。

图片头探测在 image/core/dimensions.ts；大图经受控 `preview://local/__source/` URL 读取，协议请求还核验发起窗口与来源引用。源内容不映射任意磁盘路径、不缓存落盘；Office 图片必须先出现在当前记录页的资源列表中。SourceAsset 靠近视口时解码，离开视口释放画布；大图缩小到 600 万、内嵌图到 100 万像素，窗口总画布 2400 万，解码前拒绝超过 6400 万像素或无法识别尺寸的图片。解码与表格解析共用主进程重任务名额。浏览器原始解码面仍可能高于缩小画布占用，尚非分块图像解码器。

代表性实现入口包括 [fileContentCache](../src/services/fileContentCache.ts)、[PDF canvasPool](../src/modules/pdf/core/canvasPool.ts)、[PDF workQueue](../src/modules/pdf/core/workQueue.ts)、[pdfResources](../electron/files/pdfResources.ts)、[syntaxClient](../src/modules/text/core/syntaxClient.ts) 与 [useEditor](../src/modules/excel/composables/useEditor.ts)。

## 通用打印链路

1. FilePrintButton 或格式工具调用主进程打开独立 PrintPanel。
2. [printing/window.ts](../electron/printing/window.ts) 管理文件汇入和预览联动；[usePrintQueue](../src/components/printing/usePrintQueue.ts) 管理当前窗口的参数、勾选、顺序、进度和失败状态。提交时冻结批次快照。
3. [printing/index.ts](../electron/printing/index.ts) 保留任务与来源引用，创建或复用隐藏渲染窗口，分配任务 token。
4. [PrintView](../src/components/printing/PrintView.vue) 消费任务，按格式加载渲染器。PDF、DOCX 和图片各自实现 [PrintRenderer](../src/types/printing.ts) 的 render/dispose。
5. 渲染完成后带 token 报告 ready，主进程校验任务身份再提交系统打印。重复或迟到的回调不能重复提交。
6. 窗口卸载调用 dispose 并清空宿主；PDF 取消渲染并释放文档/画布，图片释放对象 URL。失败、超时和来源关闭进入对应清理路径。

公共打印界面不负责格式解析。PDF 的 [printing 入口](../src/modules/pdf/printing/index.ts) 还提供栅格计划与纸张预览；[Word](../src/modules/word/printing/index.ts)与[图片](../src/modules/image/printing/index.ts)提供各自的输出实现。打印设置不再为只读尺寸清单额外扫描前 40 页，所选纸张、方向和缩放仍通过设置及排版示意显示。PDF 输出使用打印专用分辨率和裁切预算，与阅读倍率和画布布局分开。

打印状态区分取消、失败与已提交系统队列；系统接受任务不等于已实际出纸。

打印工作区为输入框与下拉框设置局部输入底色和边框变量，明暗主题分别区分可编辑与禁用状态；聚焦强调边框，禁用时恢复灰底、弱化文字和不可用指针。该配色仅作用于打印控件，文件阅读内容区继续使用 stage 主题变量，浅色值为 #DCE2EA。

## 专属服务

[electron/exclusive](../electron/exclusive) 在主进程验证 MFB1 格式的 Ed25519 签名 KEY，仅接受已登记的产品、方案和功能字段。输入长度上限为 4096 字符，不执行输入中的代码或地址。激活信息由 Windows safeStorage 加密保存于应用设置目录，启动时重新验签；当前进程的服务状态固定，更改或清除 KEY 在重启后生效。

客户端只包含 shared/exclusiveKey.ts 中的公钥。npm run exclusive:key -- init 为签发工具初始化本机 Windows 保护的私钥，默认存放于当前账户 AppData 的 MagicFileBoxIssuer 目录，不在仓库内；issue --subject user-id --out file.txt 签发 KEY。私钥不进入 Git 或安装包，Windows 保护的私钥文件依赖当前账户和机器，迁移或重装前需要保留可恢复的签发环境。当前方案离线、不绑定设备，KEY 可以转发，没有在线撤销机制；它用于确认签发来源，不能保证客户端无法被修改。

## 设置、更新与安全

[settings/index.ts](../electron/settings/index.ts) 持久化白名单设置，[shared/settings.ts](../shared/settings.ts) 提供默认值和归一化。主进程广播设置变化，渲染端订阅应用；文件路径、密码、查询和编辑草稿不在设置中。

[SettingsPanel.vue](../src/components/settings/SettingsPanel.vue) 将外观、窗口与文件、打印、软件更新、专属服务连续排列在右侧内容滚动区，左侧导航只定位对应组首。弹窗外层不滚动，标题和底部说明固定；末组保留足够高度以支持组首定位。滚动与 ResizeObserver 同步当前分组，卸载时断开观察；导航位置仅保留在当前弹窗会话中，重新打开从外观组开始。代码外观编辑器仍通过文本模块入口懒加载，打开时禁用父弹窗，关闭后恢复入口焦点。

[windows/homeOnOpen.ts](../electron/windows/homeOnOpen.ts) 管理打开文件后的主页行为：openHomeAction 为 ask（默认）、tray 或 keep，与 closeAction 独立。主进程在预览窗口加载完成、预览添加文件或 Markdown 本地链接交付后调用；整批一次决策，并发调用共用在途询问。只对仍可见的主页执行，复用托盘入口；未勾选记忆不持久化，退出中或询问期间设置已变更时放弃旧决策。取消选文件、取消多文件模式和整批初始读取检查失败不触发；模块后续解析报错仍由预览显示，不作为隐藏决策的依据。主页首次显示后才处理启动参数，避免初始显示覆盖隐藏动作。

[updates](../electron/updates) 包含更新状态机、electron-updater 驱动和重启协调。更新使用独立网络 session；下载与校验后，RestartCoordinator 检查窗口、未保存修改、在途输出和打印等状态。取消或失败解除界面冻结，普通退出不自动安装。当前源码采用匿名 GitHub Release 源，没有私有仓库认证通道；更新可访问性取决于发布源，版本比较不执行降级。

UpdateCenter 通过 [releaseNotes.ts](../src/components/updates/releaseNotes.ts) 将更新源的 HTML 说明转换成纯文本：DOMPurify 仅保留分行所需的结构标签、移除全部属性及主动内容，再按段落和列表生成换行与条目标记。设置和更新通知复用同一转换，最终仍通过 Vue 文本插值显示，不插入远程 HTML 或加载其中的资源；普通文本和多版本说明同样适用。

从 1.0.5 起，构建的 GitHub 发布源为 Linn924/magic-file-box，产物校验同步拒绝旧仓库配置。Git 历史和既有版本标签保留，历史 1.0.3/1.0.4 安装包原样迁移，其内置旧更新地址不能通过修改仓库代码改变；这些已安装版本需手动安装一次 1.0.5 才切换更新源。appId、文件关联标识、原设置目录与专属公钥不因仓库迁移改变。

[security/index.ts](../electron/security/index.ts) 提供非持久预览 session、本地协议映射与 IPC 来源检查。窗口启用 sandbox/contextIsolation，拒绝任意导航、webview 和新窗口。文档内容访问网络受限，明确点击的受控外链由系统浏览器打开。Markdown 链接、图片、导出、另存和打印仍各自复查来源与参数。

## 样式与交互组织

[styles/index.css](../src/styles/index.css) 是全局样式顺序入口：reset → tokens → base → 应用/组件样式。tokens 定义明暗主题变量，app 管理首页、标签及沉浸布局，components 管理公共操作栏、预览、状态与设置。格式样式由各模块 index.ts 引入 styles/index.css，组件自身也可使用局部样式。

文件迁移保留了原级联顺序。Word/PPT 内容隔离于应用主题；表格已有样式和图片本身颜色不由全局暗色主题改写。字体、CSS 和尺寸改变可能影响虚拟行高与阅读锚点，相关处理仍属于各模块。

PreviewPanel 将浮窗挂到所属标签的 floating-tools 层，位置与查询保留在会话中。TabStrip 测量固有标签宽度，分别处理未溢出和有横向滚动条的布局；沉浸与演示隐藏整条标签区域。

PreviewTab 进入沉浸全屏时保存阅读状态，保持当前显示模式和倍率；退出时恢复进入前的模式、倍率及滚动位置。PDF 的自动单双页继续按可用宽度和页面尺寸判断，演示模式仍由 PDF 模块独立强制单页整页适配。

## 构建、产物与验证入口

| 源码或工具 | 产物与用途 |
| --- | --- |
| [build-electron.ts](../scripts/build-electron.ts) | esbuild 将 main/preload 打成 electron-dist/main.cjs 和 preload.cjs，构建后的相对资源位置保持稳定 |
| [vite.config.ts](../vite.config.ts) | 编译 Vue、CSS、动态导入和 Worker，产物进入 dist/ |
| [copy-assets.ts](../scripts/copy-assets.ts) | 将 PDF 离线字体、CMap、WASM 资源与许可说明放入 dist/ |
| [icon.ts](../scripts/icon.ts)、[associations.ts](../scripts/associations.ts) | 图标与 NSIS Open With 注册资源 |
| [package.json](../package.json) | 脚本入口、版本与 electron-builder 配置；安装包在 outputs/release/ |
| [tests/run.ts](../tests/run.ts) | 基础/模块单测选择与 Electron 测试入口编译 |
| [release.yml](../.github/workflows/release.yml) | Windows 发布构建及已有发布附件的完整性检查 |

运行资源编译、安装包生成、发布和真实安装是不同阶段。命令、影响矩阵和产物校验方法集中在 TESTING，执行授权见 DEVELOPMENT；dist/、electron-dist/、.test-build/、work/、outputs/ 不属于产品源码。

## 扩展与定位入口

新增格式的接入点是模块 index.ts/index.vue、modules/index.ts 注册表和 shared/formats.ts 扩展名集合；可选工具栏与缓存释放通过 PreviewModule 接入。格式组件、核心逻辑、样式和断言分别跟随模块，公共测试注册位于 tests/electron.entry.ts 与 tests/run.ts。

打印能力另由 printing 入口提供，并在通用 PrintView 和主进程支持范围中接入；仅增加预览注册不会自动获得打印能力。新增桥接能力同时涉及 shared/bridge.ts、preload、主进程来源/参数校验与渲染调用。

查找界面问题从对应组件与 composable 开始，格式保真问题从模块 core 开始，窗口/文件所有权问题从 electron 开始。源码路径链接指向当前实现；既往迁移与验证结果只记录在 [CHANGELOG](CHANGELOG.md)。
