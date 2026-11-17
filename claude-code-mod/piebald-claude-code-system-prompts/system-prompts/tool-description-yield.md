<!--
name: "Tool Description: Yield"
description: "Describes the Yield tool for pausing until an asynchronous tool reports something, to be called only with no other work, including when it resumes and that it wakes shortly before the prompt cache would expire"
ccVersion: "2.1.323"
-->
Pause until an asynchronous tool reports. Call only when you have no other work.

Resumes when:
- A report or message arrives (shown after the line following this call's result, before your next reply, unless that line states it waits for turn end).
- Immediately if no asynchronous tool can produce a report.
- A waited-on tool hits its time limit.
- Shortly before prompt cache expiry (reporting how many tasks remain running — call again to keep waiting).
