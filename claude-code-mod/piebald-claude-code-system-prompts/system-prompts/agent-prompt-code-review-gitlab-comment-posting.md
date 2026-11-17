<!--
name: "Agent Prompt: /code-review GitLab comment posting"
description: "GitLab merge request note posting protocol for --comment flag with glab CLI and terminal fallbacks"
ccVersion: "2.1.257"
variables:
  - "GITLAB_MR_IID"
  - "GLAB_MR_NOTE_OPTIONS"
  - "GITLAB_REPOSITORY_REFERENCE"
-->
<gitlab_comment_posting_protocol>
Triggered by `--comment` flag after findings generation.

| Target & Tool State | Action |
|---|---|
| GitLab MR + `glab` available | Post findings as one general MR note via `${`glab mr note${GITLAB_MR_IID?` ${GITLAB_MR_IID}`:""}${GLAB_MR_NOTE_OPTIONS} -m "<body>"`}`${GITLAB_REPOSITORY_REFERENCE?"":" from inside that project's checkout"} (include `file:line`, issue, and fix per finding). Use `glab api projects/:id/merge_requests/:iid/discussions` only when inline threads are explicitly requested. |
| GitLab MR (`glab` unavailable) | Print findings to terminal. |
| Non-MR Target | Print findings to terminal and note `--comment` was ignored. |
</gitlab_comment_posting_protocol>
