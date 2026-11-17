# agy wrapper（参考副本）

- **性质**：参考副本（REFERENCE COPY）。运行时执行的是 `~/.local/bin/agy`；仓库内无任何代码执行此副本。
- **用途**：漂移检测。`paseo-agy-acp/tests/wrapper-token-parity.test.ts` 将本文件 `RETRYABLE_TOKENS` 与 `paseo-agy-acp/server/error-inspection.ts` 的 `RETRYABLE_ERROR_TOKENS` 做集合比对，漂移即失败；本文件缺失时测试跳过（发布 tarball / CI）。
- **刷新流程**：复制 `~/.local/bin/agy` 覆盖本文件 → 重应用 shebang `#!/usr/bin/env node` → `cd paseo-agy-acp && npm test`。
- **职责边界**：wrapper 负责账号切换（429/503/401/403 类）并向 stderr 输出一行 `[agy-switch] {json}`；provider 从不切换账号，且从不传 `--model`。
- **禁止**：不要在本目录放置任何凭据。
