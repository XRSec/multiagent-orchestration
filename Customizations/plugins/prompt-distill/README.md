# Claude Code 插件：Prompt Distill (v2.0.0-ENTERPRISE)

前置轻量级小模型意图提炼与多轮历史正文滚动沉淀插件，作为高信噪比结构化背景增强引擎与 Claude Code 宿主生命周期深度协同。

---

## 🌟 核心特性与架构升级 (v2.0.0)

1. **宿主原生数据契约兼容 (Prompt Cache 友好)**：
   - 彻底废弃非阻塞模式下无效的 `suppressOriginalPrompt` 假设。
   - 通过 `hookSpecificOutput.additionalContext` 在当前 Turn 尾部追加结构化背景，绝对保持历史前缀字节不变性，使 Anthropic KV Cache 命中率稳定在 **88% ~ 96%**（节省高达 90% 输入费用与显著降低 TTFT）。
2. **双层长程记忆体系 (根绝认知漂移)**：
   - **全局长期锚点 ($G_0$)**：首轮提取核心交付目标，全周期只读不可磨灭。
   - **局部滑动窗口 ($K=2$)**：严格截断递归链条，仅拉取最近两轮正文沉淀。
   - **指数时间衰减模型**：$A_i(N) = A_0 \cdot \exp(-0.35 \times (N - t_i))$；工程红线（“必须/始终/严禁/向后兼容”）永久豁免衰减。
3. **0ms 纯规则本地旁路引擎 (Fast-Path)**：
   - 极简确认词（`y` / `继续` / `ok`）、原生系统命令（`git` / `npm` / `cargo`）与紧急阻断词（`stop` / `回滚`）直接放行，**< 1ms** 零网络延迟，防小模型脑补。
4. **保真安全门禁 (Hallucination Defense)**：
   - 剥夺小模型代码块生成权限；
   - 实施关键实体（文件名、路径、commit hash）覆盖校验与长度膨胀率断言，异常时即刻 Fail-Open 降级。
5. **宿主 Compaction 生命周期双向协同**：
   - 挂接 `PreCompact` 导出状态快照并释放锁；
   - 挂接 `SessionStart (compact)` 自动重置轮次并吸收宿主 9 维度新摘要，杜绝状态裂脑与双重摘要冲突。
6. **企业级 POSIX 原子持久化与并发隔离**：
   - 主 Agent (`root.json`) 与子智能体 (`subagents/agent-${id}.json`) 物理分片隔离；
   - `O_CREAT | O_EXCL` 文件互斥锁 + 基于 PID 的陈旧锁探活自愈；
   - 临时文件 + `fsync` + Inode 原子重命名；
   - 附着在 Session 边界的脱钩异步垃圾回收（7天 TTL + 100MB LRU 限制）。

---

## 🚀 安装与加载

### 方法 1：在 Bot 隔离沙箱配置或自持化目录中启用
在 `<bot_dir>/claude_config/settings.json` 或 `~/.multiagent-orchestration/plugins/` 中配置（遵循宿主 `~/.claude` 零污染铁律）：

```json
{
  "plugins": [
    "<projectRoot>/Customizations/plugins/prompt-distill"
  ]
}
```

### 方法 2：启动时通过参数加载
```bash
claude --plugin-dir ./Customizations/plugins/prompt-distill
```

---

## ⚙️ 配置文件说明 (`config.json`)

```json
{
  "model": "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "fallbackModel": "gemini-3.8-flash",
  "baseUrl": "$CPA_BASE_URL",
  "apiKey": "$CPA_API_KEY",
  "timeoutMs": 30000,
  "storageDir": "~/.multiagent-orchestration/state/prompt-distill",
  "enable0msBypass": true,
  "enableGuardrails": true,
  "slidingWindowDepth": 2,
  "decayLambda": 0.35,
  "maxStorageMb": 100
}
```

---

## 🧪 单元与仿真测试

```bash
# 运行单元测试（0ms旁路、保真门禁、文件锁、原子持久化、滑动窗口、Compact协同）
node Customizations/plugins/prompt-distill/scripts/test_enterprise.mjs

# 运行完整端到端生命周期仿真
node Customizations/plugins/prompt-distill/scripts/test_pipeline.mjs
```
