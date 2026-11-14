# Quiz Ledger

[English](README.md) · **简体中文**

多课程在线刷题平台。题目里的公式由 KaTeX 渲染，TikZ 与 pgfplots 图形预先编译成 SVG。题库按学期和课程组织，接入一门新课只需要一份 JSON 文件和一条目录记录，代码里没有写死任何课程。

![Quiz Ledger 首页：课程卡片与本轮设置](docs/images/home-zh.png)

目前收录 2026 Semester 2 的三门课，共 450 题：

| 课程 | 题库文件 | 题量 |
|---|---|---|
| STATX 303 Stochastic Processes | `banks/2026-s2/statx303.json` | 判断 50、单选 50、填空 50 |
| Advanced Optimisation | `banks/2026-s2/advanced-optimisation.json` | 判断 50、单选 50、填空 50 |
| STAT 3006 Computational Statistics | `banks/2026-s2/stat3006.json` | 判断 50、单选 50、填空 50 |

## 功能

**选题**
- 按学期列出课程，一轮作答可以同时选多门课。
- 范围可选完整题库、错题集、未做过的题；可按题型、章节、难度筛选，按章节顺序或乱序，题量可限定为 10、20、50 题。

**作答**
- 支持判断、单选、多选、填空四种题型。
- 题型选项卡显示各题型的进度并记住各自的位置；答题卡可以直接跳题。
- 提交后立即显示对错、正确答案和解析。填空题先自动比对，比对不上时显示参考答案，由作答者自己判定。
- 提交后可以给题目写笔记。笔记支持 Markdown 和 LaTeX 公式，边写边在输入框下方渲染。
- 一轮作答的状态随时保存，刷新页面或切到别的页面再回来都能接着做；点结束作答后结算本轮正确率。
- 键盘：`1`–`9` 选选项，`T` / `F` 判断，`Enter` 提交或进入下一题，`←` `→` 翻题。

**记录**
- 错题集：错误率高于 30% 的题目。
- 逐题统计：作答次数、答对次数、正确率，点开可看各选项被选中的次数。
- 作答记录：每次作答的时间、所选答案和结果。
- 每日正确率趋势，总体和分题型各一张图。
- 数据保存在浏览器本地，可导出、导入 JSON 备份。

**界面**
- 241 套配色，分十二个系列，191 套浅色纸，50 套深色纸：账簿原色、摇滚唱片、日本动画、西方古典与文艺复兴绘画、电影、中国古典与日本传统艺术、地域风情、文学、游戏和人物。每套配色有自己的标记（标题旁的小图标）、页边一层很淡的底纹和一段中英文小传。配色页可以按系列、色系、风格、纸色筛选，也可以搜索名称和小传。鼠标停在某套配色上会弹出一张用它画的界面小样；点击换上，新配色从点击的位置以圆形铺开。
- 中文和英文两种界面语言。首次打开时跟随浏览器语言，可在备份与设置里切换。

## 目录结构

```
index.html
css/            app.css 为样式，themes.css 为页边底纹和个别配色的专属规则
js/
  palettes.js   配色数据，由 tools/build_palettes.py 生成
  i18n.js       界面文字
  tex.js        把题库文本转成 HTML（KaTeX 加少量文本命令）
  md.js         把笔记里的 Markdown 和 LaTeX 转成 HTML
  store.js      作答数据的读写，存储后端可替换
  bank.js       读取目录和题库
  quiz.js       组卷与判分
  views.js      各个页面
  app.js        路由、事件、对话框、键盘
banks/
  catalog.json  学期与课程目录
  2026-s2/      各课程题库，*.figures.json 为编译好的图形
templates/bank.template.json   题库模版
schema/         题库与目录的 JSON Schema
tools/build.py  校验题库并编译图形
tools/build_palettes.py        从 tools/palettes/ 的表格生成 js/palettes.js
tools/pull_icons.py            把表格用到的图标库图标拷进 tools/palettes/lib.json
docs/CONTRIBUTING.md           接入题库的完整说明
vendor/katex/   KaTeX 0.16.11 的样式和字体，以及 CDN 无法访问时使用的脚本副本
```

## 本地运行

浏览器不允许直接双击打开的页面读取题库文件，需要起一个本地服务器：

```bash
python3 -m http.server 8000
# 打开 http://localhost:8000
```

## 部署

整个项目是静态文件，没有构建步骤。推到 GitHub 后在仓库的 Settings → Pages 里选择分支和根目录即可，其他静态托管同理。

## 接入新题库

1. 复制 `templates/bank.template.json` 到 `banks/<学期>/<课程>.json` 并填写题目。
2. 在 `banks/catalog.json` 里登记这门课；新学期就在 `semesters` 数组里加一个对象。
3. 运行 `python3 tools/build.py`，校验题库并编译图形。

字段说明、文本约定和图形的写法见 [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)。

## 新增配色

一套配色是 `tools/palettes/<系列>.txt` 里的一行：

```
id | Name | 中文名 | 出处 | 纸色 a b c d | 底纹 | 图标 | 小传
```

颜色只写五个：纸色和四个主色。运行 `python3 tools/build_palettes.py`，脚本会推出墨色和第五个颜色，把每个颜色调到满足对比度下限，标好筛选用的色系和风格，然后写出 `js/palettes.js`。图标画在 24×24 的格子里，记法写在脚本开头：可以写基本图形、程序算出的图形，也可以用 `U set:name` 引用开源图标库里的图标（`python3 tools/pull_icons.py <node_modules>` 会把用到的图标拷进 `tools/palettes/lib.json`）。底纹从脚本列出的名字里选。英文小传写在 `tools/palettes/notes.en.txt`，格式是 `id | note`。最早的 51 套配色颜色是手调的，存在 `tools/palettes/seed.json`，标记和小传在 `core.txt`。

## 数据存储

作答数据经由 `js/store.js` 里的 `QL.store.backend` 读写。默认后端是浏览器的 localStorage，数据只在当前设备上，换设备前请在备份与设置里导出。要接入账号或云端同步，实现一个带 `get`、`set`、`remove` 三个方法的对象并替换 `QL.store.backend` 即可，其余代码不用动。

## 来源

- 界面的版式、字体和最初的 25 套配色沿用 [Stylish-Calendar](https://github.com/Hatsuyuki017/Stylish-Calendar)（Study Ledger），配色出自 Thomas Shang 的 Tufte-Style Book Template。
- 题库结构和做题流程参考 [26-Xi-quizbank](https://github.com/Hatsuyuki017/26-Xi-quizbank)。
- 部分配色标记取自开源图标库，存放在 `tools/palettes/lib.json`：[Phosphor](https://phosphoricons.com)（MIT）、[Tabler Icons](https://tabler.io/icons)（MIT）、[Lucide](https://lucide.dev)（ISC）、[Fluent Emoji](https://github.com/microsoft/fluentui-emoji) 高对比度版（MIT，Microsoft）、[Game-icons.net](https://game-icons.net)（CC BY 3.0，作者 Lorc、Delapouite 等）、[Material Design Icons](https://pictogrammers.com/library/mdi/)（Apache 2.0）、[IconPark](https://github.com/bytedance/IconPark)（Apache 2.0）、[Font Awesome Free](https://fontawesome.com)（CC BY 4.0），以及 Maki 和 Temaki（CC0）。
- 公式渲染使用 [KaTeX](https://katex.org)（MIT License，见 `vendor/katex/LICENSE`）。

## 许可

代码以 MIT License 发布，见 [LICENSE](LICENSE)。
