#!/usr/bin/env bash
# CindyR Git 管理助手脚本
# 用途：为 CindyR 目录提供独立的 Git 管理能力，连接上游仓库并保持分支历史
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CINDY_GIT_DIR="${REPO_ROOT}/.git/CindyR.git"
CINDY_WORK_TREE="${REPO_ROOT}/CindyR"

if [ ! -d "${CINDY_GIT_DIR}" ]; then
  echo "错误: 未找到 CindyR 的独立 Git 目录: ${CINDY_GIT_DIR}" >&2
  exit 1
fi

exec git --git-dir="${CINDY_GIT_DIR}" --work-tree="${CINDY_WORK_TREE}" "$@"
