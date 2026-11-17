<!--
name: "Skill: Claude API CLI installation guidance"
description: "Installation routes for Anthropic ant CLI and full-path disambiguation when Apache Ant is on PATH"
ccVersion: "2.1.319"
-->
- **`ant` missing or resolves to Apache Ant (`build.xml`)**: Complete sign-in first, and offer Anthropic CLI installation:
  - macOS: `brew install anthropics/tap/ant`
  - Go: `go install github.com/anthropics/anthropic-cli/v2/cmd/ant@latest`
  - Linux/WSL: User-executed `sudo` command from `https://platform.claude.com/docs/en/cli-sdks-libraries/cli/quickstart` (never fabricate release versions).
  - **Apache Ant Disambiguation**: Inspect `which -a ant` and always invoke/recommend the full binary path (e.g., `! $(go env GOPATH)/bin/ant auth login`), never bare `ant`.
