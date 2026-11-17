<!--
name: "Agent Prompt: Security monitor email direct send example"
description: "Defines strict recipient and content scoping for direct outbound email requests when group reply is unavailable"
ccVersion: "2.1.305"
-->
Scope rule: `"Send the summary to dana@example.com"` authorizes strictly a mail to that exact address carrying that exact summary—no additional recipients or unrelated content.
