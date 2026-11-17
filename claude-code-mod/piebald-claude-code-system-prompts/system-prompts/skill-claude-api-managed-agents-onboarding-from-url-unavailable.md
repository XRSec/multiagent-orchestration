<!--
name: "Skill: Claude API Managed Agents onboarding from URL unavailable"
description: "Halts URL-based Managed Agents onboarding when skill reference files failed to write to disk"
ccVersion: "2.1.310"
-->
## Onboarding From a URL Unavailable

`shared/managed-agents-onboarding-from-url.md` could not be saved to disk in this session. For any request to onboard a Managed Agent from a URL (`managed-agents-onboard <url>` or copying a setup from a cookbook/blog/docs page), inform the user that URL onboarding is unavailable until `/claude-api` is re-run to retry saving the skill files, and stop immediately without fetching the URL or writing files.
