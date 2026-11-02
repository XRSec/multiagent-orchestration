## 2026-11-02T06:32:26Z
- Milestone: M2 伙伴私聊与群聊核心视图
- Role: M2 Implementation Worker
- Caller: 055cf08c-c994-4908-9bde-8a188fef6514
- Exclusive write ownership:
  1. apps/desktop/src/renderer/views/direct-chat/PartnerDirectChatView.jsx
  2. apps/desktop/src/renderer/views/group-chat/BotGroupChatView.jsx
  3. apps/desktop/src/renderer/views/group-chat/BotGroupTimelineItem.jsx
  4. apps/desktop/src/renderer/views/group-chat/BotGroupPlanCard.jsx
  5. apps/desktop/src/renderer/views/group-chat/BotGroupLiveStatus.jsx
  6. apps/desktop/src/renderer/views/group-chat/BotGroupComposer.jsx
- Hard constraints: Each file <= 300 lines; pass `pnpm exec vite build` and `node tests/test-cindy-ui.mjs`.
