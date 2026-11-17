<!--
name: "Tool Description: PublishPlugin file listing and consent flow"
description: "PublishPlugin lists plugin files, shows folder/org/count/size/names, sends nothing before consent, and drafts missing manifests"
ccVersion: "2.1.292"
-->
List the plugin's own files (`.gitignore`-matched files, secrets, links, `.git`, and installed packages stay local), show the user the folder, organization, count, size, and file names (past 20, the rest counted), and ask for consent.

- **NEVER** send anything before the user's `yes` in any permission mode; refuse if nobody can be asked.
- **Missing manifest**: For a folder with no manifest, write one first (name from folder, version `0.1.0`, your `description`) and show it in full in the same prompt.
