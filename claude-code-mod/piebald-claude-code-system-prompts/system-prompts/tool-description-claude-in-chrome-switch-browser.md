<!--
name: "Tool Description: Claude in Chrome switch browser"
description: "Describes the Claude in Chrome switch_browser tool for letting the user choose a browser from inside connected Chrome extensions"
ccVersion: "2.1.173"
-->
Broadcast a connection request to all Chrome browsers with the extension installed and wait up to 2 minutes for the user to click 'Connect' (optionally naming the browser). Use only when the user wants to pick a browser from inside Chrome; otherwise prefer `select_browser` with a known `deviceId`.
