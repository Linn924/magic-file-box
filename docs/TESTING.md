# 测试指南

本文件说明当前测试入口、影响矩阵、样例、断言以及构建和验收工具。执行范围遵守 [开发规范](DEVELOPMENT.md)，实现事实见 [架构说明](ARCHITECTURE.md)。命令示例和历史结果不构成额外测试、打包、发布或安装授权。

## 环境与执行

运行环境为 Windows x64、Node.js 22.12+、npm。

源码路径别名由 tsconfig.base.json 定义：@/ 对应 src/，@shared/ 对应 shared/。tsx 脚本读取根 tsconfig，Electron 与测试入口的 esbuild 显式使用 tsconfig.electron.json；Vite 使用相同目录映射。模块内部 Worker 使用相对 import.meta.url 的 URL，源码迁移后的运行验证使用重新编译的资源。

首次准备依赖和样例：

```powershell
npm ci
npm run test:fixtures
```

`npm test -- --suite <名称>` 先类型检查和构建运行资源，再执行基础单测与选定 Electron 套件。未知 suite 必须报错。源码自最近构建后未变才可加 `--skip-build`；测试文件每次重编译。全量 `all` 仅在影响矩阵确有需要且当前用户未限定专项时执行，基准 bench/pdfperf 不计入 all。

测试使用独立 `work/test-profiles/<pid>/`，不改真实偏好；系统选择框模拟返回，打印机枚举和 print 出口拦截，真实渲染/内存生成 PDF 校验，绝不凭自动测试声称实体出纸成功。测试窗口单独关闭后台节流，产品保持原后台策略。测试前后核对原样例 SHA256；输出在忽略的 outputs/verification 与 outputs/bench，不能提交。

公共套件可用 `--formats word,ppt,text,image` 限定文件矩阵，省略时保留原完整覆盖。当前覆盖 loading、immersive、visual、updates、sources、sourcelifecycle 的相关格式分支；PDF 与 Excel 专属场景在这组筛选中不运行。通用 open 会拒绝范围外的样例，视觉测量按筛选另存。Excel 不参与时，loading 直接通过两个普通文本窗口验证同一解析队列的等待/取消/重试/关闭/重载及所有权，不伪造其他格式的排队 UI。

## 独立编译运行资源

默认 build 含类型检查。需要仅编译运行资源时，可分别执行以下命令，再按实际影响选择专项；示例套件不是每次必跑清单：

```powershell
node --import tsx scripts/build-electron.ts
npx vite build
node --import tsx scripts/copy-assets.ts
npm test -- --skip-build --suite pdfspread,pdf,pdfenhancements,pdfchain,printing,core
```

上述为运行时编译和真实行为测试，不生成安装包。产品源码改变后重新编译相应资源；仅测试文件改变可继续 skip-build。

## 影响矩阵

下表针对功能变更。纯文档和仅移动/合并测试的检查范围见开发规范，不套用功能矩阵。

| 修改位置/行为                                     | 对应套件                              | 原因                                    |
| ------------------------------------------------- | ------------------------------------- | --------------------------------------- |
| modules/text                                      | text；语法变更加 syntax；外观加 appearance,core | 编码、JSON、Markdown、语法、偏好及文本缩放 |
| modules/image                                     | image                                 | 解码、适配与缩放                        |
| modules/excel                                     | excel；编辑/保存改动加 exceledit       | 格式化、合并区域、Sheet、虚拟滚动、列宽与副本 |
| modules/word                                      | word                                  | DOC/DOCX、表格、分页和缩放              |
| modules/ppt                                       | ppt                                   | 两种文件格式、文字、尺寸、页码与缩放    |
| modules/pdf                                       | pdf                                   | 页面像素、字体、翻页、缩放              |
| useContinuousPages / PageNavigation / ZoomControl | word,excel,ppt,pdf,text,image         | 连续阅读、页码定位及工具栏倍率          |
| resizeTable                                       | word；若改列宽通用行为再加 excel      | 真实鼠标列边界拖动                      |
| App / PreviewTab / 模块注册 / shared              | core + 所有受影响格式；按行为补专项    | 多窗口、标签生命周期影响全部格式，明确列出套件，不机械使用 all |
| electron / preload / settings                     | core + 实际受影响格式                 | IPC、窗口、设置、托盘、文件读取         |
| 设置弹窗布局/分组导航                              | settingslayout,core,updates,appearance,appearancelayout | 内容滚动、组首定位、更新控件与嵌套外观弹窗 |
| UI 主题/共享样式                                  | core + 实际受影响格式与布局专项       | 深色外观不能污染文档原色                |
| 文件关联/安装配置/图标/构建流程                   | core + 按授权执行产物与安装检查       | 源码运行正常不代表安装产物正确          |

## 套件内容与成功标准

### sources / sourcelifecycle：大文件按需读取

`sources` 运行文本记录与 Office/ZIP 单测，再通过真实 Electron 验证文本、CSV、JSON、XLSX、DOCX、PPTX、PDF 和图片入口。样例由 tests/sourceFixtures.ts 生成在 work/large-source-fixtures：约 300 MiB 的文本/CSV/JSON，含大型未选择嵌入数据的 Office ZIP 和 PDF，以及 9000×7000、240 MiB 的真实 BMP 像素数据。Office/PDF 样例证明未选择条目/范围不整份读取，不能当作所有复杂正文的性能证据。

记录首屏耗时、主进程实际范围读取量以及应用进程 working set 之和（50 ms 采样），结果存 outputs/verification/source-measurements.json；未清空文件系统缓存，只进行合成样例测量，工作集之和可能重复统计共享页。断言非图片首屏读取少于 16 MiB、最大单次范围 1 MiB、同时实际读取不超过 8、记录 DOM 最多 100 行，另核对实际 CSV 字段、PDF 画布、图片像素及所有源文件 SHA256。

`sourcelifecycle` 复用或生成大文本和最小样例，检查后台分段请求在堆压力下继续完成、完成后按压力卸载并恢复、跨窗口移交的逻辑位置、跨显示分段搜索高亮、内嵌图片实际绘制、大图片排队时关闭标签/重新打开和旋转比例、外部修改后拒绝读取、跨窗口 token/图片 URL 隔离、关闭后 URL 撤销、非法范围与超像素拒绝、重载后的会话和句柄释放。此专项结束必须确认 sourceSessions/sourceHandles/sourceReads 为零。

相关回归：core、loading、word、ppt、pdf、text、image、immersive、excel、excelbackground；共享读取/输出链路补 printing、nonpdfprinting、pdfchain。编辑逻辑未变时不机械扩大到所有编辑专项。本次验证不包含真实安装、实体打印或所有 Office 复杂排版。

### 测试文件归属与精简

- 公共执行器、窗口/设置/更新测试和跨格式工具留在 tests/；格式解析、编辑和兼容性断言留在对应 src/modules/<type>/tests/。
- 独立 startup 套件已移除，main 首页初始化、重载和预览入口检查并入 core。项目仅维护 main，原分支同步脚本和单测已移除。
- Excel 短小的选区和格式单测并入 editModelUnit.ts；公共编辑等待门禁归 tests/unit.ts。样式解析降级与损坏 ZIP 拒绝测试归 Excel 模块的 loadWorkbookUnit.ts，由 excel/all 执行。
- 保留公式、XLS 样式、副本保存、工作表、排序筛选、打印、安全、布局和性能等独立覆盖；文件小、名称相似或通过 import 间接执行，不构成删除依据。
- 仅移动/合并测试且断言语义未变时，检查引用、编译测试入口并执行被移动的单测；产品代码未改不重建运行资源，也不启动整组界面专项。改变交互断言或产品行为时，再按实际影响选专项。

### 执行器自动运行的基础逻辑

`tests/unit.ts`：缩放限制 25–400%、无效设置回退、设置字段白名单、中文 Windows 文件路径识别，以及并发编辑全部完成后才生成移交快照、重复释放幂等。未知字段不得写进设置对象。

openHomeAction 覆盖缺省及旧配置回退为 ask、tray/keep 合法值、非法值回退及基于当前设置的局部更新。

### core：设置、窗口、标签、托盘、安全

文件：`tests/suites/core.ts`。

预览加载流程调整时运行 loading、excelbackground、core、word、excel、exceledit、ppt、pdf、pdfchain、text、image、immersive；文件读取亦用于打印预览，补 printing、nonpdfprinting。检查内容区尺寸、滚动、标签卸载/移交及打印载荷；这不等同于安装或实体打印验证。

1. main 首页初始化及重载均使用标准入口，预览只含文件操作；首页内部品牌图标和文字已移除；系统标题为“文件预览”；旧宣传文案、只读标记和底部状态条不存在。
2. 设置中选择黑夜；文档根节点主题同步，preferences.json 只包含偏好字段，不包含路径或历史。
3. 多文件首次询问选择标签页；出现两个文件标签，选择被记住。
4. 切换、拖动排序、关闭标签；关闭后对应预览组件移除，其他标签仍存在。
5. 再次多选不重复询问；设置为独立窗口后创建两个窗口，默认最大化。
6. 普通预览窗口 × 直接关闭自己、不弹框、不影响其他窗口；Excel 有未保存修改时可取消关闭或放弃。首页未配置时询问，取消保留全部窗口；隐藏到托盘只隐藏首页，预览继续可见和使用，未勾选记忆则仍为 ask，勾选后再次关闭不重复询问。明确选择退出或配置 quit 才退出软件并关闭所有窗口。
7. 两个独立预览窗口通过 HTML DataTransfer 拖动文件标签并走真实 IPC：目标出现两个标签，倍率保留，空源窗口关闭；无效 ID 移动失败不影响目标已有文件。
8. 外网请求被拦截，session 非持久化，主进程已交付 payload 释放。

9. 打开文件后主页行为默认每次询问；设置下拉保存并从独立测试 preferences.json 重新加载。询问未勾选记忆时，下次主页可见仍询问；隐藏只影响主页，预览保持可用。勾选后分别记住隐藏与保留，不再询问，并且不改变 closeAction。主页已隐藏、空列表、文件不存在、取消文件选择及取消多文件模式时不询问；预览“添加文件”同样应用该设置。其余专项显式使用 keep，避免无关原生模态框阻塞。

该专项通过模拟原生确认框返回值验证主进程行为，未覆盖真实按钮点击、托盘菜单恢复、多请求重叠、设置写入失败或询问期间退出；这些边界不能由本次自动测试推断为已验收。格式解析、打印及更新流程未修改，不因新增主页选项重复运行各格式全量套件。

`tests/quit.entry.ts` 分别另起进程验证询问中选择退出、已配置 quit 两种路径；两者都须在 will-quit 时确认首页和实际预览窗口已销毁，配置 quit 不再询问。所有套件执行前后对已有样例计算 SHA256，预览、缩放和列宽调整不得改变源文件。基础检查还验证生成的 NSIS 注册只添加 Open With 候选，不改扩展名默认值或 UserChoice。

系统模态选择框在测试中替换返回值，以便自动化；真实对话框文案、按钮位置、托盘菜单操作还应按下方手工流程检查。

### exitresources：退出后的进程与资源残留

```powershell
npm test -- --suite exitresources
# 运行资源对应当前源码时可加 --skip-build。
```

`tests/exitResources.ts` 从独立 Node 进程逐项启动当前运行资源对应的 Electron，使用 `work/test-profiles/exit-resources-<pid>/`，不操作已安装软件或真实用户窗口。`tests/exitResources.entry.ts` 准备场景后走正常首页关闭或 app.quit，成功路径不调用 app.exit、强制终止或修改源文件。

覆盖：已读取字节响应延迟时退出、150000×12 XLSX 的真实 Worker 解析中及另一窗口排队时退出、300 MiB 文本扫描/持有读取句柄、加密 PDF 等待密码、多窗口六种格式的已完成预览/语法/图片 Blob/PDF 画布缓存、隐藏到托盘后真正退出、取消未保存输入的退出后再次确认退出，以及复用配置重启后无旧文件会话。隐藏 PDF 会主动裁剪位图，因此缓存场景重新激活 PDF，确认实际画布像素后才退出。

外部通过 Windows CIM 按主 PID、应用上报 PID、父子关系和创建时间记录真实主进程、渲染/GPU/辅助进程。主进程正常结束后首次检查与 5 秒复查均不得有残留；再对所有源样例执行 .NET FileShare.None 独占只读打开，并逐项核对 SHA256。源标记文字不得出现在独立配置目录的普通小文件中。结果写入 `outputs/verification/exit-resources*.json`，包括退出耗时、进程身份、工作集、退出前/期间资源统计和磁盘文件清单。

`will-quit` 发生时异步句柄关闭计数可能尚未递减，不能据此判定退出后泄漏；最终以外部进程消失与独占打开通过为准。工作集总和可能重复统计共享页，不代表整机可用内存变化，也不测量 Windows 待机文件缓存。偏好、Chromium 运行时文件、字典或已有更新包不要求退出时删除；内存预览会话不得随配置重启恢复。此专项不执行真实安装、升级、实体打印或全量模块回归，原生未保存确认框使用测试返回值。

需要单独复验某组时，可运行 `node --import tsx tests/exitResources.ts --cases reading,parsing,source-read,password`；`restart-clean` 与 `multi-cache` 需在同次进程中按顺序运行，以复用刚退出的配置。

### loading：统一加载、关闭与重试

文件：`tests/suites/previewLoading.ts`、`tests/previewLoadDriver.ts`。测试执行器在单独测试偏好下暂缓已完成的读取响应，验证各格式内部阶段继续流转但只显示“正在加载…”，超过 3 秒显示耗时、第 9 秒仍无操作、第 10 秒出现唯一的重新加载按钮；在途重载重置计时并隔离迟到响应。检查居中提示、窄窗口/深色/150% 缩放时重载可达和文字居中、加载中直接关闭标签、迟到响应不重挂载、重新打开和错误重试、标签切换。读取本身的真实中止、共享消费者保留和取消后新读取由 tests/unit.ts 验证，延迟响应不能代替这些断言。跨窗口检查单解析名额、关闭排队标签、关闭持有者后的队列推进和外部文件身份拒绝；结束检查任务登记归零。PDF 密码等待中关闭及共享文档取消分别由 pdfchain 与 optimization.ts 覆盖。

仅修改加载提示文案/布局时运行 loading；记录分段的耗时/重载以 sources 限定 text,image 验证（暂缓 source:page 已完成响应，检查 10 秒入口、重载保留当前内容及迟到查询隔离）。移除取消入口时补 excelbackground、pdfchain、sourcelifecycle，分别验证在途 Worker、密码及大图片通过关闭标签释放并可重开。加载状态机、读取和模块生命周期实际改变时，再按影响补充上方 core 所述的格式与输出专项。

### tablifecycle：后台加载、内存压力与跨窗口移交

`tests/suites/tabLifecycle.ts` 使用六格式固定矩阵，暂缓读取响应后切换标签，验证文件在隐藏状态加载完成、每个来源只读取一次、耗时不重置，且超过原两秒仍保留原 DOM。对 Chromium performance.memory 注入压力读数并触发正常 focus 检查，验证只淘汰后台已完成组件、当前文件保留、重新激活恢复倍率。该模拟验证压力分支，不能当作操作系统真实低内存或进程峰值保证。

跨窗口用真实解析队列阻塞 Excel，在后台拖拽前模拟目标关闭，再重新合并：失败保留源任务，确认后只有目标保留排队登记，沿用单解析名额，目标原文件与其他窗口不受淘汰影响。`previewResidencyUnit.ts` 独立检查软预算 LRU、当前/加载保护、编辑等待期间重新激活、窗口隔离、无压力不因时间淘汰。`tests/previewPressure.ts` 为既有 Word 列宽/目录、图片旋转、PDF 阅读/批注及 Excel 草稿/选区/历史回归提供实际压力淘汰，替代固定 2200 ms 等待；原有状态断言继续保留。

生命周期变更对应专项：tablifecycle、loading、excelbackground、sourcelifecycle、excelsources、excelbasic，以及 word/image/pdfspread/pdfenhancements 中受影响的状态恢复断言；未改动解析/输出时不机械执行所有编辑和打印套件。产品源码变化后重建运行资源，测试修改可独立重编译。所有源文件 SHA256 与关闭后的任务、来源会话/句柄归零继续检查。

### excelbackground：后台表格解析

文件：`src/modules/excel/tests/background.ts`。生成 50000×12 XLSX 与含引号逗号/跨行字段的 100000 行 CSV，验证真实解析期间界面计时器持续运行、关闭加载标签中止在途 Worker、释放队列名额并重新打开至实际单元格。记录解析/准备显示阶段的计时器最大间隔（低于 600 ms），不将该测量称为总打开耗时或所有文件性能保证。生成样例前后核对 SHA256；现有 excel 与 exceledit 检查样式、图片、富文本、行列、工作表、编辑与另存行为。loadWorkbookUnit.ts 另核对可克隆显示模型中的空白样式、隐藏行列、图片锚点及样式降级。

`src/modules/excel/tests/editingContext.ts` 为编辑专项共用的历史操作等待入口：撤销/重做可能通过后台重新安装工作簿，必须等到编辑保存门禁恢复后再执行下一步，原有数据、样式、选择与副本断言继续执行，不能用固定暂停代替事务完成。

### settingslayout：设置弹窗布局与分组导航

文件：`tests/suites/settingsLayout.ts`。检查五类分组与设置项归属、右侧全部设置连续挂载、逐组真实鼠标点击定位（含最后一组）、手动滚动高亮和真实滚轮；标题、导航、底部说明保持可见且可命中，滚动条限于内容区域。覆盖 1100×740 和 720×560 窗口、100%/125%/150% 缩放及明暗主题，并检查嵌套代码外观弹窗的父层禁用、Escape/焦点恢复、设置关闭重开与预览窗口中的设置保存。结束后恢复窗口尺寸、缩放和独立测试偏好。

布局变更运行 settingslayout、core、updates、appearance、appearancelayout；更新专项通过分组导航定位更新控件，不滚动弹窗外层。未改变格式解析、打印和签名激活逻辑时不扩大到相应全量专项。

### word

文件：`src/modules/word/tests/e2e.ts`；样例 `document.docx`、`legacy.doc`、`broken.docx`。

检查 DOCX/DOC 内容、DOCX 表格边界控件；通过真实鼠标事件拖动列边界，单元格必须实际变宽；内容滚轮后倍率不变。自动从样例生成含分页符的 `pages.docx`，通过真实 Chromium 鼠标滚轮验证连续滚动，右下角输入 2 定位到第二页，上一页滚动返回。损坏文件必须显示明确错误。Word 分页依赖实际渲染页面，不伪造旧 DOC 页数。

`navigation.ts` 随 word 执行，也可单独运行 wordnav，all 不重复执行。DOCX 样例验证跨加粗/斜体文字片段的逻辑计数、表格/页眉/脚注/字面特殊字符搜索、首项定位、前后及 Enter/Shift+Enter 循环、未命中与关闭清理、焦点恢复、原文与源字节保持；目录验证继承标题、显式大纲级别、正文覆盖、同名标题、滚动同步、空目录、长目录键盘与挂载数量。补充窄窗口、明暗主题、缩放、标签压力淘汰与窗口移交；旧 DOC 保持现有工具范围。outlineUnit 检查标题级别、样式继承和循环保护。

DOCX 搜索/目录变更运行 word、text、core：text 覆盖提取到公共工具后的 Markdown/源码搜索行为，core 覆盖共享视图状态与窗口流程；不扩展到无关格式解析或实体打印。

### excel

文件：`src/modules/excel/tests/e2e.ts`；样例 `styled.xlsx`、`legacy.xls`、`table.csv`。

断言深蓝背景合并标题、百分比格式、列边界真实拖宽、滚轮不改倍率、滚动到底部自动追加第 201 行且前 200 行仍在、后续列组可访问第 105 列。不能把分页隐藏误认为数据丢失。

### ppt

文件：`src/modules/ppt/tests/e2e.ts`；样例 `presentation.pptx`、`legacy.ppt`。

两种格式分别检查 Shadow DOM 中至少两页同时存在且包含内容文本；真实鼠标滚轮使 scrollTop 增长而倍率仍为 100%，输入页码 2 滚动定位，上一页返回开头。保存截图，检查文字未被清洗丢弃、页面比例正常、应用 CSS 不影响幻灯片。复杂文稿必须补充对应最小样例，不能据此承诺所有 PPT 保真。

### pdf

PDF 滚轮测试固定 1000×700，避免短样例在大屏无溢出。80 页混合尺寸样例检查总页数、虚拟 DOM、末页/中间页定位及往返重绘、400% 单页 600 万像素限制、缩略图重新挂载、文字/链接旋转对齐、搜索与批注。性能数据只描述已测样例，不代表全部 PDF 的表现。

完整 PDF 功能查验按以下组分批执行，首组构建，源码未改时后续使用 skip-build；不是应用 all：

```powershell
npm test -- --suite pdf,pdfthumbs,pdfoutline,pdfdest
npm test -- --skip-build --suite pdfenhancements,pdfspread,pdfchain
npm test -- --skip-build --suite pdfimmersive,pdfsources,pdflinks,printing
```

`pdfimmersive` 复用公共 immersive 中的 PDF 断言，仅运行 PDF 的默认/宽度/整页适配、自定义倍率与原生全屏往返，不重复其他格式。`pdfsources` 使用 24 MiB 未选择附件的合成 PDF，验证实际范围读取少于完整文件、单次读取预算、来源 token 的窗口隔离、目录/搜索/旋转、跨窗口页码与旋转恢复，以及重载后一次性预览释放和关闭后的会话/句柄归零；该样例不代表真实大正文性能。`pdflinks` 验证有效跳页、缺失页面引用不产生未处理拒绝、HTTP 外链经过安全入口及脚本链接不生成可点击节点，系统浏览器出口模拟而不实际联网。新增 destinationUnit 随 pdfdest/pdflinks/pdfenhancements 执行，覆盖 XYZ、FitH/FitBH、FitV/FitBV、FitR、Fit/FitB、裁切/旋转、命名/引用解析和失效目标回退。基础 pdf 套件保留短尾页无法顶齐时的目录选中回归。

修改 external:open 主进程/预加载桥接时补 core，保留可信 IPC 来源、网络拦截、沙箱与窗口生命周期检查；其当前格式调用方只有 PDF，不扩大到无关格式解析。PDF 压力检查另选 pdfperf 的六个合成场景，使用单独 FILE_PREVIEW_PERF_PHASE 保留本次结果；print-10 单独进程运行，不能把当前环境的功能测量当作跨环境性能改进。

### pdfthumbs：缩略图绘制与首项跳页

`npm test -- --suite pdfthumbs`；文件 `src/modules/pdf/tests/thumbnails.ts`，使用本地生成的 80 页横竖混排 thumbs-mixed.pdf 和短文本 document.pdf。检查首项实际蓝色/文字像素（不以 canvas 默认非零尺寸判断成功）、虚拟占位包含完整卡片高度、画布实际显示高度不被压缩、跳到第 40 页再滚回首项重绘、点击第一页跳页及渲染进程计时器响应、尺寸切换、目录往返，以及初次绘制期间点击首项。原样例 SHA256 不变，并留存首项截图供检查。

此专项只覆盖缩略图及其跳页影响范围，不代表已复现所有 PDF 的卡死；用户原文件、异常字体/扫描页、超宽页面和高内存压力仍需具体样例验证。不重复运行打印、批注、安装或其他格式套件。

文件：`src/modules/pdf/tests/e2e.ts`；两页样例 `document.pdf`。

检查两页容器同时存在及画布渲染；真实鼠标滚轮使 scrollTop 增长而倍率仍为 100%，输入页码 2 定位，上一页回到开头，自定义 137% 生效。使用上下虚拟占位，PDF 节点/画布只保留附近范围。修改渲染取消逻辑后，应快速连续滚轮和缩放，不能出现画布同时渲染错误。

### pdfoutline：目录单项

`npm test -- --suite pdfoutline`；文件 `src/modules/pdf/tests/outlineLayout.ts`。独立选择时仅运行目录专项，不执行通用基础单测或其他格式套件。使用本地生成的中英文长标题 PDF，检查原始标题不被截断、各项单行同高、真实文字溢出及省略样式、悬停命中与完整 title、页码可见、无横向溢出；覆盖 168/320 px 侧栏、正常/720 px 窗口、明暗主题及 100%/125% 缩放，并保存目录截图。目录筛选、清除和跳页继续有效，前后核对源文件 SHA256。悬停检查覆盖原生提示所需的完整 title 与鼠标命中，原生提示气泡的系统外观不由页面截图断言。

多级目录样例混合父项与叶子项，检查各层文字起点相同、箭头与占位等宽、无按钮边框、右向收起/下向展开及 aria-expanded 一致；展开、折叠不触发跳页。原生滚轮滚动条目时，搜索栏位置和命中保持不变；搜索保留并展开祖先，自动章节定位使当前项显示在搜索栏下方。上述行为沿用明暗、侧栏宽度和缩放矩阵，仅纳入 pdfoutline。

`pdfdest` 另用父子书签共用 FitH 坐标的合成 PDF 验证标题校正：父项、同页子项及另一页子项分别贴近阅读区顶部，覆盖 100%/150%/40%（自动双页）、快速连续点击与滚回父章节的选中同步；没有可提取标题的原坐标样例继续保留。`outlineTitleUnit.ts` 随 pdfdest 执行，覆盖分散文字片段、全角标点、换行标题、裁切坐标、同名歧义、正文子串与预算降级。只改目录定位时运行 pdfdest,pdfoutline；共用滚动定位受影响时补 pdfspread，不扩展到其他格式或打印。

### text / image

新增 `pdfdest`、`texttools`、`imagetools` 为独立专项，单独选择这些套件（含 pdfoutline）时不执行无关基础单测。`npm test -- --suite pdfdest,texttools,imagetools` 先编译当前源码，再分别验证：同页 XYZ/FitH/命名目录定位、正文滚动章节选中、缩放/双页/旋转；虚拟文本跳行、折叠与隐藏结果搜索、查询取消和非法行号；常见 EXIF、旋转后真实像素取样、大图预览像素标识及来源会话释放。文本与图片单测分别位于模块 readingToolsUnit.ts、toolsUnit.ts，覆盖真实语法字符串/正则屏蔽、缩进、协作取消，以及恶意 EXIF 偏移和旋转坐标。保留所有源样例字节与原有 SHA256 门禁。

相关回归按实际影响选择 pdfoutline、pdfspread、text、textsearch、syntax、appearance、image；不扩展到打印、Office 编辑或全量套件。首次生成的合成 EXIF 不含真实个人信息，取色不改剪贴板；截图仅验证本地样例，不代表所有相机私有标签或浏览器色彩管理的一致性。

texttools 补充 Markdown 四字符外围栏包含较短围栏和示例标题的真实源码折叠，检查隐藏范围、独立章节及展开后原字符；readingToolsUnit 使用现有 Markdown 解析器核对围栏语义并覆盖未闭合块。imagetools/toolsUnit 覆盖 3/4、2/5、1/2 秒的 EXIF 曝光表示，真实图片信息浮窗核对 0.75 s；源文件 SHA256 门禁继续保持。

各模块 `tests/e2e.ts`。文本检查原文安全显示、JSON 格式化/无效 JSON 回退、Markdown 渲染；图片检查 PNG/SVG/JPEG/WebP/GIF/BMP 的实际解码。缺失的小型位图样例由图片测试自动生成。均检查滚轮不改变倍率或图片显示尺寸。黑夜模式检查图片背景没有亮色棋盘格，使用 #252a32 深灰，并保存截图。扩展某种编码或图片格式时，应在对应套件加入真实样例和断言。

`src/modules/text/tests/sourceSearch.ts` 可单独运行 textsearch，已纳入 text，all 不重复执行。覆盖 JSON 远处首项定位、同一行多处匹配计数、上一处/下一处及 Enter/Shift+Enter 循环、未命中/关闭清理、原字符与源文件保持、明暗主题，以及 5000 项 JSON 的虚拟窗口、175% 缩放长换行行和新查询取消旧导航；同路径补纯文本、代码、无效 JSON 与 Markdown 源码。源码搜索修复运行 text、syntax，保留 Markdown 排版搜索回归。syntaxUnit 同时检查字面匹配计数、选中偏移与跨语法标记的命中片段。

## 非 PDF 现有功能专项

```powershell
# 源码变动后先独立编译相关运行资源
npx vite build
node --import tsx scripts/copy-assets.ts
npm test -- --skip-build --suite word,excel,ppt,text,image,core,zoom,bulk,nonpdfprinting
```

- Word：内容/真实分页、指针列宽、损坏文件和压力淘汰后的列宽状态。
- Excel：实际像素坐标验证 200% 定位及已滚动区域的编辑视口保持、额外冻结控件删除、合并/样式/暗色、105 列、Sheet/列宽移交；原有故障注入仍验证有效样式失败保留数据、损坏 ZIP 报错。
- PPT：使用真实 PPTX 各页独立标记检测串页，快速跳转后旧请求不得回填；旧 PPT/新 PPTX 的比例、内容、滚动、页码继续覆盖。
- 文本：源码/空行逐字符保持（JSON 仅既有格式化）、字面搜索不破坏 HTML/实体、已有语法、中文编码、5001 行包含长换行行的虚拟窗口和末尾可达。
- 图片：六类解码、EXIF 1–8 尺寸与像素、旋转适配、原始图原点、标签卸载状态、倍率标签和沉浸/软件适配恢复、暗色背景。
- nonpdfprinting：mock 枚举与 print 出口，用内存 PDF 验证图片 A5、DOCX A4；不运行 PDF 文件打印专项，也不连接设备。

只在运行代码改变后重编译；仅测试文件改变可 skip-build。本组完成后不无依据重复全部套件。任何新增覆盖须说明它验证的已有行为或复现问题。

## PDF 增强、全链路、打印及公共专项

```powershell
npm test -- --suite pdfenhancements,pdf,pdfchain,printing,core
# 共享读取层变化时按影响矩阵补充：
npm test -- --skip-build --suite word,excel,ppt,text,image,bulk
# 仅缩放输入变化：
npm test -- --suite zoom
# 共享布局/沉浸适配或多选数量变化：
npm test -- --suite immersive,visual,bulk
```

- `enhancementsUnit.ts`：文字项精确偏移、大小写/Unicode、通配符/正则/零长度/表达式上限，自适应缓存、邻片合并不跨列/行、旋转逆变换、常量画布计费、幂等释放、预热取消不影响共享尺寸读取。
- `searchMemory.ts`：120 页 2400 命中、动态缓存限额、清空/恢复/换词取消、Unicode 展开、混合扫描/文字分类、超过原固定 32 页的复用。
- `rowsUnit.ts`：固定配对、单双/混合行、奇数末页、16 px 入场余量、演示单页、1001 页反复尺寸变化后的高度/页码映射，不丢页/重复页。
- `pdfspread`：倍率输入与 Ctrl+滚轮自动切换、普通滚轮不缩放、右页/末页定位、DOM/像素额度、搜索/同页及跨页批注、旋转、窗口/侧栏宽度、宽度/整页适配、演示进出、隐藏标签卸载恢复、跨窗口不同宽度恢复、混合尺寸、单页、很短尾页、平滑搜索导航与内部链接。
- `pdfenhancements`：快捷键与输入隔离、Ctrl+滚轮、原生演示进入/单页比例/翻页/退出，真实 Ctrl+Shift+P/Esc，旋转跨标签卸载和窗口移交，目录过滤/页码/空状态，无文字层提示、大小写/通配符/正则 DOM 高亮、Worker 超时后恢复，PNG 保存/取消/源路径保护、长文档虚拟化。
- `pdfchain`：构造失败不残留预算、真实 R2 加密错误/正确密码和打印权限、50 标签只加载一个模块、400% 位图预算、六窗口份额及关闭恢复、最后文件路径/资源客户释放。
- `optimization.ts`：缓存加载去重、worker 复用、计费、使用凭据保护、淘汰、密码替换与旧失败隔离、队列取消/前后台调度、1000 页增量位置索引；可控任务不替代真实解析。
- `printing`：A5 纵/A4 横物理尺寸、份数与源页隔离、150/72 实际大小裁剪、重复/迟到 token、防超预算/失败提交、闲置窗口释放、密码示意/输出、取消/驱动失败/重试，图片/DOCX 共享协议。勾选/顺序/失败继续/停止后续/入口 all/current/none 和独立非模态并排也覆盖。
- `zoom` 必须触发真实 input→Enter/blur，检查倍率和内容字号、空值回退、25–400 边界与小数；只设 value/change 不足以验证数字转换。
- `visual`：960×640、125% 页面缩放、七种格式和双主题检查工具栏/搜索/内容区。FILE_PREVIEW_VISUAL_AUDIT=1 仅留优化前指标，不能作为回归通过。
- `immersive`：PDF 默认显示/适合宽度/整页适配携带自定义倍率进入原生全屏，模式和倍率保持；沉浸中主动更改适配后，Esc 恢复进入前状态，首页不受影响。Word/PPT/图片补充适合宽度与自定义倍率的全屏往返，Excel/文本补充自定义倍率往返；保留各格式等比适配断言，PDF 演示仍单页整页适配并在退出后恢复选择。仅移除沉浸入口的模式/倍率覆盖时运行该专项；工具栏、标签布局和多文件流程变化仍按上方矩阵选专项。
- `bulk`：13 标签、26 独立窗口及按需加载；不以测试数量声称无限资源。

打印设置简化检查 printing、nonpdfprinting：展开后保留纸张选择和排版示意，移除只读页码/尺寸清单及截断页数；继续验证 PDF、图片和 DOCX 的实际内存打印布局、页码范围、物理纸张尺寸与队列行为。自动检查拦截打印机枚举和提交出口，不连接实体打印机。

打印控件配色调整运行 printing，复核明暗主题的正常、聚焦及真实忙碌禁用状态截图；保留已有纸张、份数、范围及停止/恢复提交行为断言。阅读区浅色背景使用 stage 的 #DCE2EA，打印控件局部样式不覆盖文档画布。

## 性能方法与验收边界

`npm run bench` 做库级测量；`npm test -- --suite bench` 测 Electron 打开→ready。PDF 全链路场景：invoice-50、long-500、scan-12、dense-20、windows-6、print-10。用 FILE_PREVIEW_PERF_SCENARIO 指定所需场景，FILE_PREVIEW_PERF_PHASE 控制输出文件；保持相同样例、脚本和后台节流策略。保存原基线，避免覆盖已交付历史结果。

每 50 ms 采样 Electron 主/渲染/GPU/工具进程工作集之和；开窗单次、切换/打印准备中位数、缩放含固定 250 ms 等待，不是精确显存、瞬时峰值或大样本统计。批量十份等待 60 秒，不以常规 16 秒 UI 轮询当性能门槛。参考回归门槛：耗时 ≤ 基线×1.3+100 ms，工作集 ≤ 基线×1.25+64 MB；功能通过不替代超门槛调查，不修改阈值来通过。

未完成/遮挡停帧/失败运行不作为通过数据。真实驱动、纸盒、出纸、完整字体/语言/扫描件形态、Windows 多显示器 DPI 不是自动套件的覆盖承诺。

## 样例与新模块

用于兼容性回归的**最小复现**样例。生成命令：`npm run test:fixtures`。不提交隐私业务文件。

| 文件 | 生成方式 | 覆盖点 |
| --- | --- | --- |
| `work/fixtures/complex-table.docx` | 本地 JSZip 生成 | 三列表格、宽备注列、中文单元格 |
| `work/fixtures/wide-table.docx` | 本地 JSZip 生成 | 12×8 宽表，冻结/定位回归 |
| `work/fixtures/bench-long-200.pdf` | bench 脚本生成 | 200 页合成 PDF（库级基线） |
| `work/fixtures/bench-huge.xlsx` | bench 脚本生成 | 约 5 万行（库级基线） |
| `work/fixtures/styled.xlsx` | fixtures 脚本 | 合并单元格、主题色、百分比、多 Sheet、宽表 |
| `work/fixtures/pages.docx` | word 测试自动生成 | 分页符与连续滚动 |
| `work/fixtures/long-mixed.pdf` | pdf 测试 / bench 生成 | 80 页横竖混合 |
| `work/fixtures/presentation.pptx` | 外网下载（MIT） | PPT 静态布局 showcase |
| `work/fixtures/legacy.ppt` | 外网下载（MIT） | 旧 PPT |
| `work/fixtures/legacy.doc` | 外网下载（Apache-2.0） | 旧 DOC 降级提示 |

### 收集原则

1. 无个人隐私、无公司敏感数据。
2. 能单独复现一类问题（表格、字体、合并、动画缺失等）。
3. 修复时在对应模块 `tests/` 增加断言，并在本表登记。
4. 外网样例变更需更新许可说明（见 fixtures 脚本输出）。

### 已知边界

本库**不承诺**像素级还原全部 Word/PPT；每次修复只声明已验证范围。旧格式排版弱于新格式。

新模块创建 index.ts、index.vue、解析/处理器、样式及 tests/e2e.ts，注册模块和测试套件；每个修复写明触发条件、操作及实质断言，不只检查元素存在。产品处理器不得生成测试文件。Excel 故障注入补充有效 XLSX 样式引擎失败仍保留数据/降级提示，损坏 ZIP 仍报错；跨窗口 view 契约修改覆盖编码、Sheet、临时列宽与适配。

## exceledit：基础编辑与另存副本

文件：`src/modules/excel/tests/editModelUnit.ts`、`formulaUnit.ts`、`xlsStylesUnit.ts`、`editing.ts`、`formulaEditing.ts`、`xlsSaveCompatibility.ts`。`npm test -- --skip-build --suite exceledit,excel` 在独立编译受影响运行资源后执行；修改通用关闭/移交 IPC 时，另加 core、六种受影响格式、zoom/bulk，以及受影响打印入口专项。

完整 Excel 查验可分片执行，保留 exceledit 的全部既有断言并避免总运行时长集中在一个进程：先运行 excelbasic 生成基础编辑样例，再运行 excelstructure、excelformula、excelcompat、excelgrid、excelformat，以及 exceladvanced、excelfind、excelsheets、exceltable。基础、结构、公式、旧格式分片分别复用原实现；exceledit 与 all 仍运行原有完整链路，all 排除分片别名以免重复，并包含 Excel 编辑模型单测。

`excelrefs` 可独立复验反向范围的部分剪切拒绝、完整剪切、删除低端点、绝对/跨表引用、上限、撤销重做、保存缓存与源字节；界面用例已纳入 exceladvanced/exceledit。`excelsources` 使用含 240 行、81 列和第二个窄表的 32 MiB 合成工作簿，验证切表首列、行/列组/表标识的闲置恢复与移交、窗口 token 隔离和关闭后会话/句柄归零。该大文件主要增加未选择附件，不代表复杂大正文的性能。

`formulaUnit.ts` 覆盖查找精确/近似/通配符及类型差异、负数/负位数舍入、跨 Sheet、IF 分支、循环/错误/边界、依赖值更新，XLS 编码后重新读取公式及数值/布尔/文本/错误/空串缓存、数字格式/合并/行高/对齐。`formulaEditing.ts` 验证真实 XLS 默认预览与默认 XLS 另存、实时依赖及撤销、ƒx 参数/焦点、保存取消/源路径保护、重开和行列移动后的结果/对齐；生成样例原始字节前后不变。仅修改 Excel 计算/格式保存白名单时执行 excel,exceledit，不扩大到其他解析/打印套件。

`xlsStylesFixture.ts` 依据 BIFF 字段手工编码字体/XF/调色板，不使用产品样式编码器生成源样例；`xlsStylesUnit.ts` 断言原始字体/边框/填充位、保留索引、空白格和合并边缘样式、ExcelJS 独立读取、主题色、颜色溢出/风险类别及 1904 日期系统/隐藏 Sheet。`xlsSaveCompatibility.ts` 检查真实保存、插行、撤销重做、重新打开的样式，以及原生对话框前的实际损失清单、默认取消、Esc/焦点恢复、确认写入和未修改副本的字节保留。失效的旧硬链接测试产物不能充当当前源别名，每次创建新的源硬链接；异步保存消息断言须等元素出现。

`formatEditing.ts` 随 exceledit（或单独 excelformat）验证混合状态、只改选定属性、整体撤销、边框、数值/文本编号、XLS/XLSX 重读及媒体/富文本、旋转行高、应用中移交，渲染异常会使断言失败。editModelUnit 验证格式字段和边框边缘，tests/unit.ts 验证公共等待门禁，XLS 样式单元覆盖行列默认样式。通用 export 门禁补 core/bulk，不扩大到所有格式解析。

`selectionEditing.ts` 随 exceledit（也可单独 excelgrid）验证选区、原生鼠标拖动、整行/列/全选、合并闭包、跨列窗口键盘焦点、虚拟行拖选、整组清空/对齐/撤销、预算拒绝及移交/闲置恢复；editModelUnit 校验纯范围、合并闭包和目标预算。

`gridEditing.ts` 补充真实双击/文字输入、IME Enter、F2/Esc/Tab/失焦提交、右键复制/粘贴及多行/编号类型、菜单视口边界、批量插行列与数量拒绝、删除引用的 #REF!、连续结构撤销、列宽位置、保存后样式/媒体/合并/跨 Sheet 公式与重开、结构草稿移交/压力淘汰/检查点、受保护结构原子拒绝以及 CSV 行号插入。原生剪贴板方法在测试中模拟，不覆盖用户剪贴板；截图检查菜单/弹窗/单元格内编辑。单元格编辑与结构调整均不得改变源文件 SHA256。

补充断言：可见单元格编辑导航保持 scrollTop/scrollLeft；e2e 在 200% 已滚动视口验证双击和 Enter 不归左上，主动地址定位沿用原行为；额外冻结控件/说明行消失，成功状态不占布局；三个水平对齐/撤销、纯样式保存的原数据与公式缓存、复合编辑后的字体/填充/对齐、结构基底对齐与 CSV 拒绝。不能只检查颜色或按钮存在而不重读保存副本。

图标布局补充断言：固定工具栏组序；图标无重复文字、title 与 aria-label 可读取；工作表标签位于表格之后；默认一行内容框；720 px 最小窗口所有按钮可见；插入菜单通达自定义窗口、删除先选择而非立即执行、更多通达恢复源内容；名称框定位且选中、工具栏复制先提交内容、粘贴/清空可逐步撤销；菜单 Esc 返回触发按钮。截图复核最小窗口与正常编辑状态，原保存/对齐/结构/移交测试继续执行。

`visual` 矩阵覆盖七类样例、明暗主题及 125% 浏览器缩放：操作栏顺序/图标提示、查询全部位于非模态浮窗且不改变操作栏/内容高度、真实标题拖动、缩窗边界、输入聚焦、跨标签隔离、Ctrl+F 和关闭焦点恢复、图片状态只出现一次。必须在窗口结束及 finally 恢复进入测试前的浏览器缩放；Electron 同源缩放会影响随后窗口，不能将其泄漏当作产品布局错误。修改公共按钮/布局时覆盖六种格式、Excel 编辑、core/zoom/immersive/bulk；涉及 PDF 浮窗/批注/输出另加相关 pdfenhancements/pdfspread/pdfchain/printing，不运行无关性能基准。

仅标签栏几何、按钮位置或图标变化时，优先 core/bulk/immersive/visual 与针对性演示检查，视觉矩阵即可覆盖各格式布局，不默认重跑全部格式解析/搜索/打印套件。`tests/tabbarLayout.ts` 随 core 验证 18 个长名称标签、真实滚动条拖动、文字/关闭按钮高度、固定按钮命中、125%/150% 缩放、实际添加文件、关闭恢复、720/1000 px 过渡、设置入口和演示隐藏/恢复；需关闭测试窗口默认最大化后再测宽度，并恢复浏览器缩放和测试偏好。

断言：默认预览；文本/数字/长编号/公式输入与非法内容；粘贴原子性、合并区保护、撤销/重做/恢复；单 Sheet 保存检查点；取消保存/关闭/退出保留草稿；源路径和硬链接保护；XLSX 重新读取的值、公式、样式、图片、其他 Sheet 及更新后的公式缓存；CSV/TSV 的中文、引号、换行、制表符和 GB18030 解码；压力淘汰后的待提交输入/修改恢复、移交后历史/未保存标记和保存。使用生成样例、模拟原生对话框、临时输出，前后核对原样例 SHA256，不连接实体打印机。编辑界面截图检查窄窗口控件可达；不将合成文档兼容性当作所有复杂工作簿的保证。

## 模块补充断言与专项选择

- appearanceUnit.ts 覆盖颜色/样式/尺寸白名单、CSS AST/作用域/资源阻止、旧配置迁移、磁盘偏好往返及深拷贝；appearance 专项覆盖真实主题预览/取消/保存、多窗口源码与 Markdown 同步、明暗与当前命中、源字符、保存失败保留/重试、CSS 语法错误与脚本字符串、损坏配置恢复、窄窗口、换行长代码远处字体变化锚点、提交期间控件锁定和样式节点去重。此功能运行 appearance,syntax,text,core；未改变其他格式解析或 Worker 构建格式，不重跑全量或打印。
- 仅 CodeAppearanceSettings 弹窗布局/滚动变化时运行 appearance,appearancelayout；不改变解析、应用规则或公共设置时无需重复 syntax,text,core。appearanceLayout 覆盖 1100/720×560、100%/125% 浏览器缩放和双主题：长 CSS/拉高输入框、正文与文本框真实 scrollTop、编辑区与固定按钮命中、保存期间 fieldset 禁用仍有效、Esc/父设置焦点恢复；finally 恢复缩放、窗口和独立测试偏好。
- syntaxUnit.ts 验证真实语法、跨行 JS/Python、Vue 嵌套、双主题、转义/CR 与预算；syntax 专项验证新增格式入口、虚拟窗口跨行状态、字符不变、搜索/主题/阅读位置、超长行降级及 Markdown 代码复制/源码切换。语法改动运行 syntax,text；shared 扩展名增加只影响文本入口时补 core,bulk；Vite Worker 输出格式变更补 pdfenhancements 验证既有 PDF 搜索 Worker，避免机械全量回归。
- Markdown 链接变更运行 text 专项；涉及主进程打开/引用时补 core、bulk。`modules/text/tests/markdownLinks.ts` 验证网页跳转（模拟系统浏览器）、本页和跨文档锚点、中文/空格相对路径、绝对路径及 file URL、链接文本模块、缺失文件提示、危险协议/设备或网络路径/可执行格式拒绝及源文件不变。测试不真实访问网页；支持格式复用原模块，不因此全量重跑解析。
- `markdownReading.ts` 补充目录层级/同名标题/定位高亮、中文路径图片/错误/远程阻止/Blob 释放、任务只读、脚注往返、行内/块公式、流程/时序与无效图表、代码逐字复制、跨格式搜索/上一下一/清理、原样源码切换、打开设置/询问取消和记忆、跨窗口移交、明暗及最小宽度截图。读取生成样例先判断存在，不能反复重写触发 SHA256 门禁；复制出口模拟，保留用户剪贴板。正文搜索不含公式排版/Shadow DOM 图表标签，源码模式可搜索其表达式。
- `exceladvanced` 可独立运行新增行为，exceledit 已纳入该子套件，不在 all 重复执行。相关公式/日历单元、原 Excel/编辑/格式/XLS 往返及共享窗口 core/bulk 按影响执行。样例只首次生成，剪贴板出口模拟；覆盖尺寸/隐藏/合并冲突、取消、引用、真实拖动、保存重开、源 SHA256、窗口移交及日期基准。边缘拖选以有界等待观察实际滚动/选区推进，不假设固定帧速率。
- 新增 excelfind 可独立执行，exceledit 纳入且 all 去除重复。findAssistUnit.ts 覆盖 Unicode/正则字面量、格式/结果保护、函数/参数上下文及带引号名称；findEditing.ts 覆盖只读浮窗/焦点、固定选区、虚拟位置、替换原子拒绝/撤销、求和覆盖保护、实际拖动/内格编辑/跨表引用及 XLS/XLSX 保存重开、草稿移交与源 SHA256；另测 720 px 浮窗、20000 格连续替换/撤销及历史预算、20001 格拒绝部分批量替换和新查询取消旧结果。事务前值使用索引，避免大批量覆盖已存在草稿时逐格扫描全部修改。仅模块行为改变，按矩阵执行 excel、exceledit。
- excelsheets 随 exceledit 执行，all 去重；sheetModelUnit 验证名称、Unicode/大小写/单引号、绝对/区域引用、字符串不误替换及未知公式拒绝。sheetEditing 验证七类操作、取消/焦点、跨表引用、最后可见表保护、CSV 检查点、XLS/XLSX 保存重开、图片字节及图片/备注/超链接/样式/合并/尺寸保留、窄窗口、撤销/重做和移交。样例只在缺失时生成，原样例 SHA256 保持；按矩阵运行 excel,exceledit。
- 新增 exceltable，随 exceledit 执行，all 去重；tableModelUnit 覆盖类型、日期序列、空值、稳定/多列与安全引用。tableEditing 验证整行关联/格式/行高/隐藏、跨表引用、非连续拒绝原子性、条件组合/空值、筛选中手动隐藏、清除/撤销、XLS 排序往返与筛选保存拒绝、XLSX 保存重开、内置筛选名称、全行/可见复制与 CSV、窄窗口动作、窗口移交与保存检查点及原样例 SHA256。一次区域最多 20000 格、筛选列最多 2000 种显示值。

## 构建与发布操作参考

以下是现有构建与验收工具的使用方法；只有当前任务明确授权对应操作时才执行，授权规则见开发规范。

`npm run build` 依次类型检查、图标生成、Electron/preload 编译、Open With 注册生成、Vue 构建、离线 PDF 资源/许可证复制。dist、electron-dist、outputs/release 均不提交。默认 build:win 仅 NSIS；ZIP 是可选独立产物。

### 产物校验与手工检查

默认 `build:win` **只生成 NSIS 安装包**，完成后自动调用 `verify:release`：检查 EXE/NSIS 标识、应用载荷大小下限、blockmap 非空，通过后生成仅含安装包的 SHA256SUMS.txt。

需要免安装 ZIP 时：

```powershell
npm run build:win:zip   # 只出 ZIP，并校验 CRC 与 win-unpacked 一致性
npm run build:win:all   # 安装包 + ZIP，两者都校验
npm run verify:release -- --zip   # 对已有产物额外做 ZIP 校验
```

可单独运行 `npm run verify:release`（仅安装包）。截断安装包必须返回非零状态。此检查不是安装包所有字节的完整性证明，也不能代替实际启动、安装或升级检查；未执行的检查按事实注明。失败后旧校验清单不代表本次成功，以命令退出码为准。

```powershell
npm run build:win
npm run test:package
```

打包测试启动真实 EXE，通过文件路径参数打开文件，并检查另一个进程再次打开文件可交付现有应用；启动测试时使用独立设置目录，关闭启动联网检查并将首页关闭设为退出，避免污染用户偏好或留下原生提示。tests/package.ts 的 --skip-print 不打开打印界面，--updates 检查版本/更新入口、安装版识别及五类设置分组的组首定位；--text-search 使用长 JSON 验证远处首项高亮、同一行匹配计数、下一处导航、关闭清理及源文件不变；--word-navigation 复用 Word 导航样例验证 DOCX 跨格式片段搜索、表格/远处匹配、关闭清理、同名标题定位与源文件不变。用户不允许连接打印机时使用 --skip-print。用于测试的调试端口仅由测试进程命令行启用，不写入应用配置。

安装手工验收（在测试机器上执行）：

1. 安装新版，确认桌面/开始菜单/系统窗口/托盘使用当前应用图标，软件内容区左上角没有品牌图标和文字。
2. 右击 PDF、DOCX、XLSX、PPTX → 打开方式 → magic file box；第一次启动和已运行时分别检查。
3. 含空格、中文的路径也能打开；不得把默认 Office 关联强制替换。
4. 若发布了 ZIP：完整解压 ZIP，运行 EXE；手动“选择其他应用”指向 ZIP 内 EXE 也能打开文件。
5. 点击预览窗口 ×，仅该窗口关闭；点击首页 ×，依次验证取消、隐藏和退出，托盘菜单能恢复和彻底退出。
6. 重启后主题、关闭方式、多文件方式仍保留；不能恢复上次文件或显示最近路径。
7. 在页面内容与空白区域都连续滚动；跨过页面边界时页码跟随，倍率不变；输入页码及上下页按钮只滚动定位。
8. 将两个独立预览窗口并排，拖动一个窗口的文件标签到另一个窗口内部，验证合并与源窗口关闭；拖到桌面后取消，原标签保留；目标窗口关闭或移交失败不应移除源标签。
9. DOCX 表格拖宽后关闭重开，源文件不应发生变化。

实际安装、卸载方式与目标目录按当前任务授权决定。验收时核对 EXE、版本和应用载荷，不能用已安装旧软件验收新源码；实体打印需要对应任务授权和可用环境，模拟结果不代表实际出纸。

## 专属激活与产品标识

npm run test:exclusive 验证签名与输入边界、产品/方案/功能白名单、加密持久化、保存后当前进程不变、跨进程重启生效及恢复标准服务。Electron 验证使用仅在测试构建中替换的随机公钥；生产构建不提供环境变量或 IPC 换钥入口，不读取测试私钥。测试覆盖设置输入、错误提示、重启、组件释放、重载和减少动态效果；生成的测试签发私钥仅位于忽略的 .test-build 并在运行结束后移除。

更新专项覆盖同版本检查提示、关闭设置后重新打开不残留提示，以及原下载/取消/重启保护。更新说明补充紧凑 HTML 列表的分行文字、行内格式与实体解码、普通文本换行/比较符、多版本数组、空说明隐藏，以及脚本/图片/事件属性不进入显示节点且不执行；设置与更新通知核对相同文字。仅更新说明转换变化时运行 updates，包含更新单测与真实 Electron 界面检查，不扩大到无关格式解析专项。

品牌和图标变化检查 core、产物校验、真实打包 EXE 的名称/版本、文件参数与第二实例交付；保留 appId、已有设置目录及文件关联标识，实际安装和旧版升级仍按任务授权单独执行。

仓库迁移只运行 updates、更新单测与发布产物检查，不重跑格式解析。更新单测要求接受 magic-file-box 发布源并拒绝旧仓库元数据；真实 app-update.yml、latest.yml、版本、SHA512 与发布附件摘要必须一致。历史附件复制比较原仓库、下载文件及新仓库 SHA256；核对 main 和版本标签的提交一致。已安装旧版手动迁移、真实安装/升级仍不属于自动检查结果。
