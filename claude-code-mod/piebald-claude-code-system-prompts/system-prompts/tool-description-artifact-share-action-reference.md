<!--
name: "Tool Description: Artifact share action reference"
description: "Documents the Artifact share action parameters, user confirmation card, and organization-only limits"
ccVersion: "2.1.286"
-->
- **share**:
  - Parameters: `url` (user-owned artifact), `mode` (`"org"` for everyone in the user's organization, or `"people"`), `people` (for `"people"`: names or emails as stated by the user — hints the host resolves to org members on the card), and `access` (`"view"` or `"comment"`; defaults to `"comment"` for `"people"`, while `"org"` preserves current org access).
  - Confirmation: Every share presents a card naming the artifact and audience; the user can edit audience or access there, and nothing shares until they confirm (no allow rule or mode auto-approves).
  - Limits: NEVER makes an artifact public and NEVER reaches people outside the organization (public/external sharing and org-wide view-only stay in the `claude.ai` Share menu). Check the result for what was applied, which may differ from what you proposed. See **Sharing**.