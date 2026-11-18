---
title: "工作流运行 (Workflow Runs)"
source_url: "https://platform.claude.com/docs/zh-CN/managed-agents/workflow-runs"
platform: "Anthropic Claude Managed Agents"
document_type: "Official Reference Specification"
updated_at: "2026-11-01"
---

# 工作流运行 (Workflow Runs)

> **原始来源**: [https://platform.claude.com/docs/zh-CN/managed-agents/workflow-runs](https://platform.claude.com/docs/zh-CN/managed-agents/workflow-runs)  
> **归属平台**: Claude Managed Agents (托管智能体)

---

[Managed Agents](</docs/zh-CN/managed-agents/overview>)高级编排

# 工作流运行

跟踪智能体的工作流运行：运行的状态和事件、工作何时完成、运行处于打开状态时的请求、预算以及限制。

动态工作流

功能所属
    [多智能体编排](</docs/zh-CN/managed-agents/multiagent-orchestration>)

API
    Managed Agents可用

云平台
    Claude API可用Claude Platform on AWS可用Claude Models on Google CloudAnthropic managed可用

Beta 请求头
    

  * `managed-agents-2026-04-01`

数据处理
    不具备 ZDR 资格不具备 HIPAA 资格

**workflow** （工作流）是智能体编写的一个程序，用于运行多个智能体并合并它们返回的结果。**workflow run** （工作流运行）是一个工作流的一次执行。**[动态工作流](</docs/zh-CN/managed-agents/multiagent-orchestration#dynamic-workflows>)** 是让智能体能够编写工作流并启动运行的功能。您可以通过智能体 `multiagent` 块中的 `workflows` 设置来开启或关闭它。

服务器在后台运行工作流。工作流中的智能体在[会话线程](</docs/zh-CN/managed-agents/session-threads>)中工作，这些线程由服务器根据工作流的需要创建。您可以在会话的[事件流](</docs/zh-CN/managed-agents/events-and-streaming>)上跟踪运行。要停止一个运行，请让智能体停止它（请参阅在有打开的运行时中断会话）。

## 动态工作流的工作原理

会话所运行的智能体会针对您描述的工作编写每个工作流。工作流是一个程序：它运行其他智能体，收集每个智能体返回的内容，并合并结果。这样，智能体就可以承担对于单次对话来说过于庞大的任务，例如审阅数百份文档。在运行期间，智能体可以继续工作或结束其轮次，并且可以检查运行的状态。

主线程上的​智能体

工作流​运行

服务器在​后台​运行​工作流

阶段：Read the contracts

智能体线程

智能体线程

智能体线程

智能体​同时​工作

阶段：Reconcile the findings

智能体线程

一个​智能体​处理​这些​结果

程序​在此​选择​运行​什么，并且​可以​重复某个​步骤

智能体​编写​一个​工作流（一个程序）并启动​一次​运行

程序将​结果​传递​下去

运行​结束后，智能体读取​运行所​做的​工作

该图展示了一个示例。智能体编写的每个工作流都有自己的阶段和智能体。一次运行包含以下层级：

  * **工作流运行：** 服务器在后台以一次工作流运行的形式运行工作流。一个会话可以同时有多个处于打开状态的运行。
  * **阶段：** 工作流可以将其工作划分为多个阶段。阶段是运行中一个具名的环节，例如"阅读合同"。您可以通过阶段事件跟踪运行的进度。
  * **智能体线程：** 在一个阶段中，程序运行智能体。每个智能体在自己的[会话线程](</docs/zh-CN/managed-agents/session-threads>)中，基于程序编写的提示进行工作。运行中的智能体可以是内联智能体（由程序自行定义），也可以是[预定义智能体](</docs/zh-CN/managed-agents/multiagent-orchestration#predefined-and-inline-agents>)（由您在 `workflows` 的 `predefined_agents` 列表中列出）。有关每个线程显示的内容，请参阅运行的线程。

程序可以执行以下操作：

  * **同时运行多个智能体：** 程序可以同时运行许多智能体，这称为"fanning out"（扇出）。在图中，三个智能体在第一阶段阅读合同。
  * **将结果从一个智能体传递给另一个智能体：** 每个智能体将其结果返回给程序。程序可以将该结果传递给另一个智能体。在图中，第二阶段的智能体处理前三个智能体返回的内容。同一运行的各个智能体还会在会话的沙箱中处理相同的文件。
  * **自行执行下一步：** 智能体的结果会返回给程序，而不是返回给会话所运行的智能体。程序决定接下来运行哪些智能体，并编写它们的提示。
  * **重复与选择：** 在一个阶段内，程序可以重复工作，并根据智能体返回的内容选择下一步。例如，它可以让草稿不断修订，直到审阅通过或用完设定的轮数。在图中，程序可以在第二阶段内重复某个步骤。
  * **处理失败的智能体：** 当其中一个智能体失败时，服务器通常会在一个新线程上再运行该智能体一次，同时该运行的其他智能体继续工作。如果再次失败，程序可以处理该失败，或者让它结束运行。如果程序处理了失败，运行仍可能以 `completed` 结束，因此请告诉会话所运行的智能体报告哪些内容失败了。

运行结束后，会话所运行的智能体会获得一个轮次来读取运行所做的工作。然后它可以回答您，或启动另一个运行。运行事件列出了该轮次延后到来或不会到来的情况。

您可以指导运行如何完成工作，例如如何拆分工作以及智能体失败时该怎么做。请参阅[告诉智能体何时使用运行](</docs/zh-CN/managed-agents/multiagent-orchestration#tell-the-agent-when-to-use-a-run>)。

运行启动前没有审批步骤：智能体在编写工作流的同一轮次中启动运行。要先审阅计划，请告诉智能体描述该运行并等待您的批准。运行启动时，`workflow_run.created` 会显示其名称、描述和阶段。如果启动了您未批准的运行，请让智能体停止它（请参阅在有打开的运行时中断会话）。

## 运行如何在各状态之间转换

运行中

空闲

已结束

智能体​启动​一次​运行

达到​预算后​智能体​启动​一次​运行

达到​预算

提高或​移除​预算

工作流​完成、智能体​停止​运行、运行​失败、其生命​周期​到期或​会话被​归档

空闲的​运行也​可能​结束，例如​智能体​停止它或​会话被​归档时

运行以运行中或空闲状态开始。例如，达到预算会暂停正在运行的运行，使其变为空闲；随后提高或移除预算会使其再次运行，除非中断也暂停了它。当其工作流完成、智能体停止它、它失败、其生命周期到期或会话被归档时，正在运行的运行会结束。空闲的运行也可能结束，例如当智能体停止它或会话被归档时。

运行从其 `workflow_run.created` 事件开始到其 `workflow_run.status_ended` 事件为止处于**打开** （open）状态，无论它是正在运行还是空闲。运行在暂停期间处于空闲状态，例如在达到会话预算时。运行有一个生命周期，智能体可以在启动运行时设置它。运行等待您的客户端所花费的时间也计入该生命周期。暂停不会阻止运行的生命周期流逝，因此一直处于暂停状态的运行可能会以 `timeout_error` 结束。以下事件报告运行的开始、其阶段以及其结束。因达到预算而暂停时也会发送一个事件。中断后的暂停可能不会发送任何事件。每个 `workflow_run.*` 事件都包含 `workflow_run_id`，仅当未创建运行时，它在 `workflow_run.error` 上才为 `None`。

## 运行事件

运行事件到达会话的事件流（即主线程的流），列出会话的事件时也会返回它们。运行事件不会触发 [webhook](</docs/zh-CN/managed-agents/webhooks>)。来自运行线程的状态事件也到达同一个流。每个事件都在 `session_thread_id` 中指明其线程，而运行的线程就是那些 `session.thread_created` 事件带有该运行的 `workflow_run_id` 的线程。

事件| 何时到达| 如何处理  
---|---|---  
`workflow_run.created`| 智能体启动了一个运行。包含 `workflow_run_id`（`wrun_…`）、运行的 `name` 和 `description`，以及 `phases`，即工作流声明的阶段，每个阶段都有一个 `id`、一个 `name` 和一个 `description`。当工作流未提供描述时，`description` 为 `None`。`phases` 始终存在，且可以为空。运行和阶段的 `name` 和 `description` 是模型编写的文本，因此可能会重复您请求中的词语。运行的 `name` 也可能是服务器分配的。| 将该运行记录为打开状态。显示其 `name`，并根据 `phases` 显示进度。  
`workflow_run.status_running`| 当运行开始其工作时（可能在 `created` 之后一段时间），以及每次在预算处暂停后恢复时。中断后的恢复可能不会发送此事件。以空闲状态开始的运行可能会先收到 `workflow_run.status_idle`。| 将运行显示为运行中。  
`workflow_run.status_idle`| 运行已暂停，例如达到会话预算时。该事件不说明原因。中断后的暂停可能不会发送此事件。| 要继续，请参阅成本和预算或在有打开的运行时中断会话。  
`workflow_run.phase_started`、`workflow_run.phase_ended`| 工作流进入或离开了某个阶段，或者运行结束时关闭了仍处于打开状态的阶段。结束事件不说明该阶段的工作是否完成。两者都包含 `workflow_run_phase_id`。结束事件还包含 `phase_started_id`，即它所关闭的开始事件的 `id`。两者都不包含阶段名称：请通过 `workflow_run_phase_id` 在 `workflow_run.created` 的 `phases` 中查找。| 更新进度。阶段一次运行一个，按 `phases` 的顺序，每个阶段最多运行一次，但 API 不保证这一点。通过 `phase_started_id` 将阶段的结束与其开始对应起来。请处理多个阶段同时打开、某个阶段不在 `phases` 中，以及某个已列出的阶段从未开始的情况，即使在已完成的运行中也是如此。每个开始的阶段也都会在运行的 `workflow_run.status_ended` 之前结束。  
`workflow_run.status_ended`| 运行已结束。始终是该运行的最后一个 `workflow_run.*` 事件。包含 `result`。| 读取 `result`（见下表）。然后智能体会获得一个轮次来读取运行是如何结束的。在达到预算时，或在主线程等待您的客户端时，该轮次会延后到来。中断后，该轮次可能不会到来：请发送一个 `user.message`，或自行读取 `result`。归档或终止后，该轮次不会到来。  
`workflow_run.error`| 服务器报告运行的错误，或它拒绝的启动。以 `error` 结束的运行会在其 `workflow_run.status_ended` 之前收到此事件，带有相同的错误。包含 `error`：一个 `type` 和一个可以安全记录到日志的 `message`。当未创建运行时，`workflow_run_id` 为 `None`。| 将其记录到日志，不要将其视为运行的结束。如果 `workflow_run_id` 为 `None`，则没有运行启动。否则，请继续跟踪该运行，直到其 `workflow_run.status_ended`。  
  
`result`| 含义  
---|---  
`{"type": "completed"}`| 工作流已运行完毕。该结果不说明工作是否通过。即使其线程上的工作失败，或某个线程无法创建，运行也可能以 `completed` 结束。要查找失败的工作，请读取每个运行线程的事件。  
`{"type": "stopped"}`| 智能体停止了运行，或会话被归档。该事件不会说明是哪一种。不要将这些视为仅有的原因。  
带有 `timeout_error` 的 `error`| 运行的生命周期已到期，智能体可以设置该生命周期。  
带有 `program_error` 的 `error`| 工作流失败。其代码失败，或违反了工作流的某条规则（限制除外）。或者运行的某个线程失败或无法创建，而工作流让这一情况结束了运行。  
带有 `thread_limit_error` 的 `error`| 运行超出了其对工作流启动的智能体数量的限制。  
带有 `unknown_error` 的 `error`| 服务器无法继续运行，或运行超出了服务器对工作流的其他某项限制。  
  
错误结果形如 `{"type": "error", "error": {"type": "timeout_error", "message": "..."}}`，其中 `message` 可以安全记录。将无法识别的 `result.type` 视为以其他方式结束的运行，将无法识别的 `error.type` 视为错误。当会话所依赖的某项内容失败时（例如模型、MCP 服务器、凭据或计费），失败线程的流会收到 `session.error`。这本身不会结束运行。但如果它导致运行的某个线程失败，而工作流让这一情况结束运行，则运行以 `program_error` 结束。

例如，您询问[合同审查智能体](</docs/zh-CN/managed-agents/multiagent-orchestration#turn-on-dynamic-workflows>) 300 份合同中哪些包含控制权变更条款，智能体启动了一个运行：

  1. `workflow_run.created` 将该运行命名为"Find change-of-control clauses"，并在 `phases` 中列出阶段"Read the contracts"和"Reconcile the findings"。随后是 `workflow_run.status_running`。
  2. 阶段事件标记每个阶段，运行创建的每个线程都会发送带有该运行 `workflow_run_id` 的 `session.thread_created`。
  3. `workflow_run.status_ended` 到达，带有 `result: {"type": "completed"}`。
  4. 智能体回答"300 份合同中有 41 份包含此条款"，然后 `session.status_idle` 以 `end_turn` 到达。

运行的第一个事件列出了其阶段：

```json
{
  "type": "workflow_run.created",
  "id": "sevt_01abc...",
  "workflow_run_id": "wrun_01J8XkN5uT3vHpLqRfWdY2",
  "name": "Find change-of-control clauses",
  "description": "Reads each contract and lists those that have the clause.",
  "phases": [
    {
      "id": "wrph_01Kd3a1f3",
      "name": "Read the contracts",
      "description": "Reads each contract for the clause."
    },
    { "id": "wrph_01Kd3b7c9", "name": "Reconcile the findings", "description": null }
  ],
  "processed_at": "2026-10-09T14:01:45Z"
}
```

每个阶段事件通过 `workflow_run_phase_id` 指明其阶段。它是 `phases` 中的一个 `id`，但 API 不保证这一点：

```json
{
  "type": "workflow_run.phase_started",
  "id": "sevt_01def...",
  "workflow_run_id": "wrun_01J8XkN5uT3vHpLqRfWdY2",
  "workflow_run_phase_id": "wrph_01Kd3a1f3",
  "processed_at": "2026-10-09T14:01:46Z"
}
```

运行的最后一个事件报告其结束方式：

```json
{
  "type": "workflow_run.status_ended",
  "id": "sevt_01ghi...",
  "workflow_run_id": "wrun_01J8XkN5uT3vHpLqRfWdY2",
  "result": { "type": "completed" },
  "processed_at": "2026-10-09T14:09:12Z"
}
```

## 运行的线程

一次运行中的每个智能体都在自己的[会话线程](</docs/zh-CN/managed-agents/session-threads>)中工作，该线程由服务器根据工作流的需要创建。您可以像对待任何子线程一样列出、读取和流式传输运行的线程，并从主事件流中回答它们的工具调用。要停止它们，请让智能体停止该运行（请参阅在有打开的运行时中断会话）。

  * **分组：** 运行的线程带有该运行的 `workflow_run_id`，宣告该线程的 `session.thread_created` 事件也是如此。其他线程以及宣告它们的 `session.thread_created` 事件的 `workflow_run_id` 设置为 `None`。
  * **智能体：** `agent` 显示线程所运行的智能体。对于您在 `multiagent` 中 [`workflows` 的 `predefined_agents` 列表](</docs/zh-CN/managed-agents/multiagent-orchestration#turn-on-dynamic-workflows>)中列出的智能体，`agent` 包含该智能体的 `id` 和 `version`，与您列出的子智能体的线程相同。对于工作流定义的智能体（内联智能体），`agent` 的 `type` 为 `inline`，且没有 `id` 或 `version`。它使用工作流编写的系统提示，而不是会话智能体的系统提示。它还带有工作流为其指定的名称和描述。如果工作流未指定名称，服务器会分配一个。它使用会话智能体（即会话所运行的智能体）的模型。它的工具、MCP 服务器和技能是会话智能体的子集。它会获得全部这些内容，但 API 不保证这一点。它的工具保留各自的权限策略。
  * **线程共享的内容：** 运行的线程在会话的沙箱中工作，因此每个线程都处理相同的文件。这包括会话挂载的记忆存储中的文件。工作流定义的智能体使用会话为其 MCP 服务器解析的凭据来使用这些服务器。每个线程都有自己的对话历史。
  * **事件：** 运行线程的 `session.thread_created`、`session.thread_status_running`、`session.thread_status_idle` 和 `session.thread_status_terminated` 事件也会到达主事件流（请参阅运行事件）。其消息事件保留在它自己的流上。其线程 webhook 的发送方式与任何子线程相同。关于线程自身的流记录了什么，请参阅[会话线程事件](</docs/zh-CN/managed-agents/session-threads#session-thread-events>)。
  * **阶段：** 没有任何事件或字段说明线程在哪个阶段工作，并且同一运行的线程可能具有相同的 `agent_name`。请通过运行的阶段事件跟踪其进度，并通过 `session_thread_id` 区分其线程。
  * **归档：** 服务器最迟在运行结束时归档每个线程。一旦线程返回其结果或运行不再需要它，服务器可以更早地归档它。如果此时线程仍在运行或正在等待您的客户端，服务器会先停止它。已归档的线程仍保留在线程列表中，状态为 `terminated`。您无需自行归档运行的线程。
  * **工具：** 运行可能会为同一项工作创建多个线程，因此请确保您的智能体调用的工具可以安全地被调用两次。

您可以向智能体索要它为您的请求编写的工作流。等待运行结束且会话处于 `idle` 状态。然后发送一条 `user.message`，要求智能体逐字打印它用于启动运行的工作流，并且不要启动另一个运行。

```
Print the workflow that you started the run with, word for word, in one code block. Do not start another run.
```

## 了解工作何时完成

当运行处于运行中时，即使其线程都没有在工作，会话也应保持 `running`。当没有线程在工作且有线程在等待您的客户端时，会话会以 `requires_action` 变为 `idle`。空闲本身并不意味着工作已完成。当以下两项都成立时，工作才算完成：

  1. 您看到创建的每个运行都有其 `workflow_run.status_ended`。
  2. 在此之后，一个 `session.status_idle` 到达，其 `stop_reason` 为 `end_turn`，并且它不是由您自己的请求（例如中断）引起的。在您中断之后，只计算在您下一个 `user.message` 或 `user.define_outcome` 之后到来的空闲。

  * **已暂停的运行：** 已暂停的运行不会使会话保持 `running`，因此会话可能在运行仍打开时变为空闲。例如，在达到预算时，会话以 `budget_reached` 变为空闲。在运行结束之前，工作并未完成。
  * **另一个运行：** 智能体在读取结果时可以启动新的运行，因此请再次检查。
  * **结果：** 如果您[定义了结果](</docs/zh-CN/managed-agents/define-outcomes>)，则在运行打开期间（无论处于运行中还是空闲状态）不会开始评估。智能体读取运行结果的那个轮次可以开始评估。
  * **`retries_exhausted`：** 智能体的轮次因错误而失败：重试次数已用完，或者该错误无法重试，例如计费失败。当此空闲到来时，某个运行可能仍在运行。如果某个运行已结束而智能体尚未读取其结果，服务器会在没有您输入的情况下启动一个新轮次。会话会再次变为 `running`，因此请等待下一次空闲。如果会话保持空闲，请读取在它之前到来的 `session.error` 并修复原因。然后发送一个 `user.message`，或自行读取每个运行的 `result`。

## 跟踪运行

此示例跟踪一个会话，从您的消息到智能体的回答。它打开流并发送消息。然后执行以下操作：

  * **跟踪每个运行** ，从其 `workflow_run.created` 到其 `workflow_run.status_ended`，并在每个阶段开始时打印该阶段。
  * **回答自定义工具调用** ，在每个 `agent.custom_tool_use` 到达时进行回答，因为运行的线程可能在会话保持 `running` 时等待您的客户端。如果您的智能体的工具[要求确认](</docs/zh-CN/managed-agents/events-and-streaming#tool-confirmation>)，请添加一个分支，回答每个 `evaluated_permission` 为 `ask` 的 `agent.tool_use` 或 `agent.mcp_tool_use`。示例中没有这样的分支，因为允许每个调用的分支会把 `always_ask` 变成始终允许。
  * **停止** ：当工作完成时停止：没有打开的运行，并且会话以 `end_turn` 变为空闲。如果会话终止，它也会停止。当空闲的停止原因不是 `requires_action` 而是其他原因（例如 `budget_reached`、`retries_exhausted` 或 `refusal`）时，它会打印原因并停止，因此请在您自己的代码中处理这些情况。即使服务器即将自行启动新轮次，它也会在 `retries_exhausted` 时停止。在 `requires_action` 时，以及在运行打开期间的 `end_turn` 时，它会继续等待。

Python

```
open_runs: dict[str, str] = {}  # workflow_run_id -> run name
phase_names: dict[tuple[str, str], str] = {}  # (run ID, phase ID) -> phase name

# 先打开流，再发送用户消息
with client.beta.sessions.events.stream(session_id) as stream:
    client.beta.sessions.events.send(
        session_id,
        events=[
            {
                "type": "user.message",
                "content": [
                    {
                        "type": "text",
                        "text": "Which contracts in /contracts have a change-of-control clause?",
                    },
                ],
            },
        ],
    )

    for event in stream:
        match event.type:
            case "workflow_run.created":
                open_runs[event.workflow_run_id] = event.name
                for phase in event.phases:
                    phase_names[event.workflow_run_id, phase.id] = phase.name
                print(f"Run started: {event.name}")
            case "workflow_run.phase_started":
                phase_id = event.workflow_run_phase_id
                key = (event.workflow_run_id, phase_id)
                print(f"  Phase: {phase_names.get(key, phase_id)}")
            case "workflow_run.status_ended":
                name = open_runs.pop(event.workflow_run_id, event.workflow_run_id)
                print(f"Run ended: {name} ({event.result.type})")
            case "agent.custom_tool_use":
                # 事件到达时进行应答。运行的线程可能会等待您的
                # 客户端，而会话保持运行状态。
                result = call_tool(event.name, event.input)
                try:
                    client.beta.sessions.events.send(
                        session_id,
                        events=[
                            {
                                "type": "user.custom_tool_result",
                                "custom_tool_use_id": event.id,
                                "content": [{"type": "text", "text": result}],
                            },
                        ],
                    )
                except anthropic.BadRequestError as error:
                    # 如果结果来得太晚（在服务器归档该调用的线程之后），
                    # 服务器会拒绝该结果。请继续跟踪该运行。
                    print(f"  Answer to {event.name} refused: {error.message}")
            case "session.status_idle":
                # 当所有运行都已结束且智能体已完成其轮次时即完成
                if not open_runs and event.stop_reason.type == "end_turn":
                    break
                # 带有 requires_action 的 idle 会等待您的客户端，因此请继续读取。
                # 遇到任何其他停止原因时，打印该原因并停止。
                if event.stop_reason.type not in ("end_turn", "requires_action"):
                    print(f"Session idle: {event.stop_reason.type}")
                    break
            case "session.status_terminated":
                break
```

## 在有打开的运行时中断会话

发送不带 `session_thread_id` 或带有主线程 ID 的 [`user.interrupt`](</docs/zh-CN/managed-agents/events-and-streaming#interrupt-the-agent>)。它会停止智能体的轮次。它不会结束任何运行。会话的运行可能会暂停或继续运行，而它们的事件可能不会显示是哪一种。已暂停运行的生命周期会继续流逝，因此运行可能在暂停期间以 `timeout_error` 结束。

  * **等待中的工具调用：** 中断后，运行线程的工具调用可能仍在等待您的客户端。请逐一回答。要取消要求确认的调用，请拒绝它。要取消自定义工具调用，请发送一个结果，将 `is_error` 设置为 `true`，并在 `content` 中提供说明原因的文本。当会话以 `requires_action` 处于 `idle` 状态时，`user.message` 会返回 400，因此请先回答这些调用。
  * **停止运行：** 发送一条 `user.message`，要求智能体停止其运行。已停止的运行以 `result` `{"type": "stopped"}` 结束。当会话以 `budget_reached` 处于 `idle` 状态时，在您提高或移除预算之前，`user.message` 会返回 400。提高或移除预算还会恢复因预算而暂停的运行，除非这些运行也因该中断而暂停。
  * **继续：** 发送一条 `user.message`，要求智能体继续其运行。中断后，运行可能会等待这条消息。如果会话以 `budget_reached` 处于 `idle` 状态，请先提高或移除预算。
  * **运行结果：** 在中断后结束的运行仍会发送 `workflow_run.status_ended`。

## 运行处于打开状态时

请求| 运行打开期间| 如何处理  
---|---|---  
归档或删除会话| 在运行打开期间，无论会话处于何种状态，都可能返回 400。错误的 `error.details.error_code` 可能为 `"workflow_run_open"`。也可能成功。| 让智能体停止其运行，或等待每个运行结束。已暂停的运行只有在其生命周期到期时才会自行结束。然后在会话处于 `idle` 状态时发送请求。成功的归档会以 `{"type": "stopped"}` 结束每个打开的运行。归档后，运行的 `workflow_run.status_ended` 以及仍处于打开状态的阶段的 `workflow_run.phase_ended` 不会到达流上。请列出会话的事件来读取它们。成功删除后，不会有 `workflow_run` 事件报告会话运行的结束。  
归档运行的某个线程| 在运行打开期间（无论运行中还是空闲），返回 400 并带有 `error.details.error_code: "workflow_run_open"`，除非服务器已经归档了该线程。| 无需操作。服务器会归档运行的线程。  
更新会话的 `agent`| 在有任何运行处于打开状态时（即使是已暂停的运行）返回 400，带有 `error.details.error_code: "workflow_run_open"`。更新底层智能体仍会被接受，会话会保留自己的副本。同时发送其他字段（例如 `budget`）的请求会被整体拒绝。| 等待每个运行都有其 `workflow_run.status_ended`，或让智能体停止其运行。  
回答来自运行线程的工具调用或工具确认| 允许。它会到达主事件流，其 `session_thread_id` 指明了线程。| 在事件到达后立即回答，将事件的 `id` 作为 `tool_use_id` 或 `custom_tool_use_id` 传递。不要等待 `session.status_idle`：在运行的其他线程工作时，会话可能保持 `running`。一旦服务器归档了该线程，针对其某个调用的工具结果将不起作用，并且可能返回 400。当工具结果返回 400 时，请在线程列表中找到该调用的线程。如果其状态为 `terminated`，说明结果来得太晚，请将其丢弃。请在单独的请求中发送每个工具结果，因为当服务器拒绝请求中的某个事件时，会拒绝整个请求。来得太晚的工具确认会返回 200，这并不意味着工具已运行。  
  
### 重新连接后重建运行状态

根据会话的事件重建每个运行的状态。流不会重放您错过的内容：新连接只会传递在其打开之后发出的事件。因此，请使用 `types` 过滤器列出事件，每种事件类型一个条目，如[列出过去的事件](</docs/zh-CN/managed-agents/events-and-streaming#list-past-events>)中所述。将每个响应的 `next_page` 作为 `page` 传递，直到 `next_page` 为 `None` 或缺失为止。`workflow_run.created`、`workflow_run.status_running`、`workflow_run.status_idle` 和 `workflow_run.status_ended` 给出每个运行的状态，但在中断后暂停的运行可能仍显示为正在运行。`workflow_run.phase_started` 和 `workflow_run.phase_ended` 用于重建进度。尚无状态事件的运行尚未开始运行。没有用于列出运行的端点。

## 成本和预算

运行的模型请求计入[会话的预算](</docs/zh-CN/managed-agents/budgets>)。运行本身没有单独的价格。其智能体使用的令牌与会话的其他令牌一样，按各模型的费率计费。关于会话的所有费用，请参阅 [Claude Managed Agents 定价](</docs/zh-CN/about-claude/pricing#claude-managed-agents-pricing>)。

  * **单个运行的用量：** 列出会话的线程，并将具有该运行 `workflow_run_id` 的线程的 `usage` 中的令牌数相加。该列表包括已归档的线程（其状态为 `terminated`），因此已完成运行的线程也会被计入。将每个响应的 `next_page` 作为 `page` 传入，直到 `next_page` 为 `None` 或缺失，并跳过没有 `usage` 的线程。如果您改为将线程的 `list_cost` 相加，则总额不包括会话运行时间，并且每个数值都是单独舍入的。
  * **达到预算时：** 每个未结束的运行都会暂停，会话报告 `idle` 并附带 `budget_reached`；如果还有工具调用在等待，则报告 `requires_action`。每个线程会完成其已开始的模型请求，因此每个正在工作的线程都可能使运行超出预算一个请求。提高或移除预算会恢复因预算而暂停的运行，除非这些运行也因中断而暂停。如果会话的用量包含没有标价的模型，则只有移除预算才会恢复运行；请参阅[没有标价的模型](</docs/zh-CN/managed-agents/budgets#models-without-a-list-price>)。暂停运行的生命周期会继续计时，因此运行可能在暂停期间以 `timeout_error` 结束。

## 限制

限制| 值| 达到限制时  
---|---|---  
单个运行中同时工作的线程数| 64| 在有线程完成之前，运行不会再创建新线程。API 不保证此数值。  
工作流在运行整个生命周期内启动的智能体数| 1,000| 当工作流请求更多时，服务器不会再启动智能体，运行以 `thread_limit_error` 结束。服务器可能会在新线程上重新运行失败的智能体，因此一个运行可能拥有超过 1,000 个线程。  
运行生命周期| 默认为 24 小时，或智能体设置的生命周期| 运行以 `timeout_error` 结束。没有事件说明智能体设置了什么生命周期。  
一个会话中同时打开的运行数| 默认为 10| 服务器拒绝启动另一个运行。智能体的工具调用会收到错误，您会收到一个 `error.type` 为 `max_workflow_runs_error` 的 `workflow_run.error`。空闲的运行也计入此限制。  
  
服务器会将运行或阶段的 `name` 截短为 64 个字符，将其 `description` 截短为 256 个字符。服务器对工作流还有此处未列出的其他限制和规则。您看到的结果取决于服务器何时发现问题：

发生的情况| 您看到的内容  
---|---  
智能体启动运行时，工作流超出了其他某项限制| 启动被拒绝。您会收到一个 `workflow_run.error`，并且没有运行。  
运行在之后超出了其他某项限制| 您会收到一个 `workflow_run.error`，然后运行可能以 `unknown_error` 结束。  
服务器在启动后发现工作流违反了工作流的某条规则（限制除外）| 您会收到一个 `workflow_run.error`，然后运行可能以 `program_error` 结束。  
  
一个会话在其生命周期内可以启动任意数量的运行。

  * **启动运行：** 只有会话主线程上的智能体才能启动运行。在运行的线程中工作的智能体无法启动自己的运行，因此运行不会嵌套。
  * **结束运行：** 您发送的任何事件都不会结束运行；归档会话可以结束运行。
  * **运行的线程：** 您无法[通过 ID 停止](</docs/zh-CN/managed-agents/session-threads#interrupt-a-session-thread>)运行的线程，也无法在其运行打开时将其归档。
  * **线程限制：** 运行的线程不受会话的[子线程限制](</docs/zh-CN/managed-agents/session-threads#primary-thread-and-session-threads>)约束。
  * **可见性：** 您看不到工作流的代码，但可以向智能体索要工作流，如运行的线程中的提示所述。您也看不到智能体为启动和管理运行而进行的工具调用，以及每个线程返回给工作流的结果。

### 速率限制

运行的工作计入您的组织已有的速率限制。

内容| 计入| 如何处理  
---|---|---  
您的客户端检索或列出会话、其线程及其事件的请求| [Managed Agents 端点](</docs/zh-CN/managed-agents/reference#rate-limits>)的读取限制| 在会话的事件流上跟踪运行，而不是轮询。  
来自运行线程的模型请求| 您针对每个线程所用模型的 [Messages API 速率限制](</docs/zh-CN/api/rate-limits>)，与您的其他流量一起计算| 在这些限制中为运行预留空间，或[申请更高的限制](</docs/zh-CN/api/rate-limits#requesting-higher-limits>)。  
  
当来自运行某个线程的模型请求受到速率限制，或模型过载时，该线程自己的流可能会收到类型为 `model_rate_limited_error` 或 `model_overloaded_error` 的 `session.error`：

  * 如果其 `retry_status.type` 为 `retrying`，则服务器正在重试该请求，线程仍在工作。
  * 如果为 `exhausted`，则线程已失败。如果工作流让该失败结束运行，运行将以 `program_error` 结束，而它不会指明原因。请读取失败线程的事件来查找原因。

服务器还会限制您组织的所有会话每分钟的工作量。达到此限制的线程会停止，并在其自己的流上收到一个消息中指明速率限制的 `session.error`。请等待一分钟，然后再让智能体继续。

## 可用性

动态工作流在所有模型上可用。

### API 支持

[Managed Agents](</docs/zh-CN/managed-agents/overview>)

状态可用

云平台

  * 所有支持的平台

### 所需的 beta 请求头

[Beta 请求头概览](</docs/zh-CN/api/beta-headers>)

Beta 请求头让您可以在实验性功能和新模型能力成为标准 API 的一部分之前访问它们。

请求头

  * `managed-agents-2026-04-01`

### 数据处理

[数据处理概览](</docs/zh-CN/manage-claude/api-and-data-retention#feature-eligibility>)

适用的端点

  * `/v1/agents`
  * `/v1/sessions`
  * `/v1/environments`

零数据保留不具备资格

会话是有状态的资源；对话记录会一直保留，直到您将其删除。适用于所有 Managed Agents 子功能，包括自托管沙箱。

HIPAA不具备资格

适用于所有 Managed Agents 子功能，包括自托管沙箱。

Was this page helpful?
