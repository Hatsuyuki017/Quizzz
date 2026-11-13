# 接入题库

这份说明面向想给 Quiz Ledger 添加课程题库的人。接入一门课要做三件事：写一份题库 JSON，在目录里登记，运行校验脚本。

## 1. 题库文件

复制 `templates/bank.template.json`，放到 `banks/<学期>/<课程>.json`，例如 `banks/2027-s1/math2100.json`。模版里四种题型各有一道示例题，其中一道带图。`_readme` 字段只是给人看的说明，写完后删掉。

### 顶层字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `schema` | 是 | 固定写 `"quiz-ledger/bank@1"`。 |
| `id` | 是 | 题库的唯一标识，只用小写字母、数字和连字符，建议带上学期，例如 `math2100-2027s1`。作答数据以它为键，发布之后不要改。 |
| `course` | 是 | `code` 和 `title` 必填，显示在课程卡片上；`institution`、`language` 可选。 |
| `meta` | 否 | `version`、`updated`、`authors`、`source`、`note`，用于记录题库的版本和出处。 |
| `figure_preamble` | 否 | 编译图形用的 LaTeX 导言区，写到 `\begin{document}` 之前为止。省略时默认载入 TikZ、pgfplots、amsmath、amssymb 和 arrows.meta。 |
| `units` | 是 | 章节列表，每项有 `id` 和 `title`，`group` 可选（用来标注模块）。数组的顺序就是按章节顺序作答时的顺序。 |
| `questions` | 是 | 题目数组。 |

### 题目字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 题库内唯一，只用字母、数字、点、下划线和连字符。统计数据以它为键，题目发布后不要改号。 |
| `type` | 是 | `true_false`、`single_choice`、`multiple_choice`、`fill_blank` 之一。 |
| `unit` | 是 | 所属章节，必须是 `units` 里出现过的 `id`。 |
| `section` | 否 | 更细的小节名。 |
| `topic` | 否 | 知识点。 |
| `difficulty` | 否 | 1、2 或 3。 |
| `question` | 是 | 题干。 |
| `options` | 选择题必填 | `[{ "label": "A", "text": "…" }, …]`，至少两项，标签不能重复。 |
| `answer` | 是 | 见下表。 |
| `accept` | 否 | 仅填空题。每个空另外可接受的写法，例如 `[["1.0"], ["2.718"]]`。 |
| `explanation` | 否 | 解析，提交后显示。 |
| `figure` | 否 | `null`，或 `{ "latex": "…", "caption": "…", "id": "…" }`。 |

### 各题型的 `answer`

| 题型 | 写法 | 例子 |
|---|---|---|
| `true_false` | 布尔值 | `true` |
| `single_choice` | 一个选项标签 | `"B"` |
| `multiple_choice` | 标签数组，须与作答完全一致才算对 | `["A", "C"]` |
| `fill_blank` | 字符串数组，每个空一个 | `["$\\tfrac13$", "$e^{-2}$"]` |

## 2. 文本约定

题干、选项、填空答案、解析和图注都是带 LaTeX 的纯文本。

- `$…$` 是行内公式，`$$…$$` 是独立公式，由 KaTeX 渲染。KaTeX 支持的命令见 <https://katex.org/docs/supported>。
- 公式之外可以使用 `\emph{}`、`\textit{}`、`\textbf{}`、`\texttt{}`、`\underline{}`，以及 `\%`、`\&`、`\#`、`\_`、`\$`。`--` 显示为短横线，`---` 显示为长横线，`~` 是不换行空格。
- 空一行另起一段，`\\` 强制换行。
- 其余内容原样显示。HTML 标签不会被解析。
- JSON 里的反斜杠要写两个：`\frac` 写成 `\\frac`。

### 填空题

在题干里用四个或更多下划线 `____` 标出每个空，空的数量必须等于 `answer` 的长度。空可以写在公式外，也可以写在公式里（`$\min(1,\ \text{____})$`）。

提交后平台先自动比对：去掉空格和 `$`，把 `\tfrac12`、`\dfrac{1}{2}`、`\frac{1}{2}` 都看作 `1/2`，数值相差在千分之一以内视为相同（`0.5` 与 `1/2`）。能比对上就直接判对。比对不上时显示参考答案，由作答者自己判定对错。所以答案是一句话或一个较复杂的式子也没有问题，写出最规范的那个形式即可；常见的等价写法可以放进 `accept`。

## 3. 图形

`figure.latex` 写一段可以独立编译的图形代码，通常是一个 `tikzpicture` 环境。`tools/build.py` 会把 `figure_preamble`、`\begin{document}`、这段代码、`\end{document}` 拼成一个文件，用 pdflatex 编译，再用 pdftocairo 转成 SVG，结果写入题库旁边的 `<题库名>.figures.json`。这个文件是生成物，不要手改，但要和题库一起提交。浏览器端不运行 TeX。

- 几道题共用同一张图时，给它们的 `figure` 写相同的 `id`，只编译一次。同一个 `id` 下的 LaTeX 必须完全相同。
- 没有写 `id` 的图以题号为键。
- 图形编译时关闭了 shell escape。
- 需要 TeX Live（含 TikZ 和 pgfplots）与 poppler（提供 pdftocairo）。没有装 TeX 的话可以只跑 `python3 tools/build.py --check` 做校验，图形交给维护者编译；未编译的图在页面上会显示 LaTeX 源码。

## 4. 登记到目录

在 `banks/catalog.json` 对应学期的 `courses` 数组里加一条：

```json
{ "id": "math2100-2027s1", "code": "MATH 2100", "title": "Real Analysis", "bank": "2027-s1/math2100.json" }
```

`id` 要和题库文件里的 `id` 相同，`bank` 是相对于 `banks/` 的路径。可选的 `color`（1 到 5）指定课程在界面上用哪个配色位。

新学期在 `semesters` 数组里加一个对象：

```json
{
  "id": "2027-s1",
  "label": { "zh": "2027 学年第一学期", "en": "2027 Semester 1" },
  "courses": []
}
```

`default_semester` 决定首次打开时显示哪个学期，省略时取数组里最后一个。

## 5. 校验

```bash
python3 tools/build.py          # 校验全部题库，编译新增或改动过的图形
python3 tools/build.py --check  # 只校验
python3 tools/build.py --force  # 重新编译全部图形
```

脚本会检查：标识是否合法且不重复，`unit` 是否已声明，各题型的 `answer` 格式，选项标签，`$` 是否成对，填空题的空数与答案数是否一致，同名图形的代码是否一致。出错时逐条给出文件、题号和原因，返回非零退出码。

`schema/bank.schema.json` 和 `schema/catalog.schema.json` 是同一套规则的 JSON Schema，可以配到编辑器里获得补全和即时提示。

## 6. 提交前检查

1. `python3 tools/build.py` 输出 `0 error(s)`。
2. 运行 `python3 -m http.server`，在页面上把新题库的每种题型各做几道，确认公式、图形和解析都正常。
3. 题目的 `id` 和题库的 `id` 以后不再改动。要修改题目内容，直接改文字并保留原 `id`；要删除题目，直接删掉，对应的统计数据会被忽略。
4. 提交题库文件、`*.figures.json` 和 `catalog.json` 的改动。
