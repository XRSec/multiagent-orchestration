import React from 'react';
import { ExternalLink, Github, Bug, CheckCircle2, GitPullRequest } from 'lucide-react';

export function IssueTrackerPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-surface select-none">
      <div className="w-16 h-16 rounded-2xl bg-surface-elevated border border-border-default shadow-md flex items-center justify-center text-accent-amber mb-4">
        <Github className="w-8 h-8" />
      </div>

      <h1 className="text-xl font-bold text-text-primary mb-2">
        Cindy 问题与需求跟踪器
      </h1>
      <p className="text-xs text-text-secondary max-w-md leading-relaxed mb-6">
        Cindy 已全面收敛问题跟踪至 GitHub 官方仓库。您可以在 GitHub Issues 中提交缺陷报告、查看路线图或发起功能提案。
      </p>

      <a
        href="https://github.com/makecindy/cindy/issues"
        target="_blank"
        rel="noreferrer"
        className="px-5 py-2.5 bg-accent-cta text-accent-cta-fg rounded-xl text-xs font-semibold hover:bg-accent-hover transition-colors shadow-sm flex items-center gap-2"
      >
        <ExternalLink className="w-4 h-4" />
        <span>前往 GitHub Issues (makecindy/cindy)</span>
      </a>
    </div>
  );
}
