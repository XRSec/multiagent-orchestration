# Gemini 研报与会话纯净 Markdown 提取工具 (`gemini-to-md`)

本工具专为将 Google Gemini **Deep Research 深度研报**与**普通会话**直接提炼为结构化、高密度、纯净的 **Markdown (.md)** 文档而设计。

---

## 🌟 核心特性与排版标准

1. **零 HTML 冗余**：彻底丢弃外层 HTML/CSS 视觉皮囊与沙箱封装，提取最纯粹的工程结论与结构化 Markdown。
2. **完美格式保留**：
   - 多级标题（`#`、`##`、`###`）
   - 代码块语法高亮（`bash`、`typescript` 等语言标识）
   - 复杂矩阵与参数对比表格（`| 列名 | 字段 |`）
   - 列表、行内代码与引用块（`> ...`）
3. **参考文献标准化（按用户标准格式）**：
   - 彻底清洗 Gemini 原生残留的 `在新窗口中打开` 与域名重复粘连。
   - 统一格式化为加粗域名 + 竖线分割 + 完整文章标题：
     `[**域名**｜文章完整标题](URL)`
   - 示例：
     ```markdown
     1. [**netnxt.com**｜macOS Admin Has No Secure Token? Here Is the Fix - NetNXT](https://netnxt.com/blog/macos-admin-no-secure-token-fix)
     2. [**code.claude.com**｜Overview - Claude Code Docs](https://code.claude.com/docs/en/overview)
     3. [**arxiv.org**｜Lost in the Middle: How Language Models Use Long Contexts - arXiv](https://arxiv.org/html/2307.03172v3)
     ```
4. **多报告与长会话自适应**：
   - 遇到 Deep Research 研报自动进入 Canvas 抓取；
   - 支持同一会话多份报告时一键 `--all` 批量提取为各自独立的 `.md` 文件；
   - 遇到普通会话自动提取为清晰的“用户提问 / Gemini 回答”问答录结构。

---

## 🚀 命令行用法

项目根目录下已配置快捷软链接 `./gemini-to-md`：

```bash
# 基本格式
./gemini-to-md <Gemini_URL> [选项]

# 选项说明：
#   -k, --keyword <关键词>   仅提取标题匹配关键词的报告 (如 -k "SecureToken")
#   -a, --all                自动遍历并导出当前对话中的全部独立报告
#   -o, --out <输出目录>     指定 Markdown 保存目录 (默认: ./docs/research)
#   --no-downloads           禁止自动拷贝到系统的 ~/Downloads 目录
#   -h, --help               查看参数帮助
```

### 实战示例：

```bash
# 1. 提取指定的深度研报
./gemini-to-md "https://gemini.google.com/app/67852c787bc06400" -k "获取与修复方案"

# 2. 一键提取对话中的全部研报（自动标题去重）
./gemini-to-md "https://gemini.google.com/app/a8ed6483faa3c11d" --all

# 3. 提取普通会话为问答录 Markdown
./gemini-to-md "https://gemini.google.com/app/3232a637c69efa2a"
```

---

## 📁 已提炼就绪的 Markdown 资产（`docs/research/` 与 `~/Downloads/`）

- `Claude Code 多智能体提示词方案对比.md` (37.8 KB, 104 条标准化文献)
- `macOS 26 SecureToken 获取与修复方案.md` (47.0 KB, 182 条标准化文献)
- `跨设备 AI 方案选型指南.md` (33.0 KB, 完整 3 轮技术问答流)
