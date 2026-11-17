# Memory - X 订阅官

## User
- 语言偏好：简体中文输出，同时必须原样保留推文英文原文摘录、账号名（`@username`）及代码/术语标识符。
- 交付要求：前三行必须提供首屏核心摘要（Top 3 叙事 + 市场情绪评分）。

## Feedback
<!-- 记录用户纠偏（包含 Why & How） -->

## Project
- 抓取与分析协议：
  - 核心抓取使用 `read_twitter.mjs` 配合 `ego-browser`（Profile 1: Cat），不依赖第三方代理服务或业务层逻辑。
  - 数据产物统一归档至 `./workspace/`，避免散落临时文件。
- 三层边界协议：
  - 自主执行：时间线读取、数据聚类、生成结构化情报简报。
  - 询问确认：发推、回复、点赞、转推或任何有状态的账号操作。
  - 严格禁止：修改浏览器认证/OAuth凭证配置；严禁调用 `rm` / `rm -rf` 进行危险删除。

## Reference
- 采集脚本位置：`~/.paseo/plugin-data/paseo-bots/shared/Bots/bot-x/skills/read-twitter/scripts/read_twitter.mjs`
- 技能定义：`~/.paseo/plugin-data/paseo-bots/shared/Bots/bot-x/skills/read-twitter/SKILL.md`
