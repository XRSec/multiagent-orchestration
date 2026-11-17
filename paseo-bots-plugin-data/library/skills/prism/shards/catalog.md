# Prism MCP Tool Catalog

Catalog of 58 Prism MCP tools grouped by operational domain.

## 1. Service & Health Management
- `prism_health`: Verify Prism MCP daemon and local AI services.
- `prism_get_connection_status`: Retrieve current connection status and active sessions.
- `prism_start_service`: Start background Prism bridge service.
- `prism_restart_service`: Restart bridge service upon stalled connection.

## 2. Profile & Session Lifecycle
- `prism_list_profiles`: Enumerate profiles in local Vault with IDs, names, and proxy settings.
- `prism_get_profile_status`: Query whether target profile is running, stopped, or erroring.
- `prism_start_profile`: Launch profile by `profileId` or `serialNumber`. Returns CDP WebSocket URL/port.
- `prism_close_profile`: Terminate browser process for specified profile.
- `prism_create_profile`: Create single profile with custom fingerprint parameters.
- `prism_create_profiles`: Batch profile generation.
- `prism_create_task_session`: Attach isolated task session to running profile.
- `prism_list_task_sessions`: Enumerate active automation sessions.
- `prism_close_task_session`: Close specific task session.

## 3. Navigation & Tab Management
- `prism_open_page`: Open new tab/page at URL.
- `prism_navigate_page`: Navigate active page to URL.
- `prism_list_pages`: Enumerate open pages and tabs within target profile.
- `prism_select_page`: Switch active tab focus to target page ID.
- `prism_wait_for_page`: Wait for new page or popup target.
- `prism_reload_page`: Reload current page.
- `prism_go_back` / `prism_go_forward`: History navigation.

## 4. Token-Saving Content Extraction
- `prism_get_markdown`: Convert page or subtree into compact Markdown. Primary extraction method.
- `prism_read_page`: Read accessibility-focused page tree and primary text nodes.
- `prism_get_text`: Extract inner text of specified CSS or XPath selector.
- `prism_get_table`: Parse HTML table into structured JSON rows.
- `prism_get_list`: Parse `<ul>` / `<ol>` lists into JSON arrays.
- `prism_get_page_schema`: Extract form schemas and actionable input descriptors.
- `prism_find`: Search elements matching structured or natural criteria.

## 5. DOM & User Interaction
- `prism_click_element`: Click element by selector or coordinates.
- `prism_click_and_wait_for_page`: Click element expecting navigation or page transition.
- `prism_type_text`: Type text into input field with realistic keystroke delay.
- `prism_press_key` / `prism_press_keys`: Send keyboard keys.
- `prism_select_option`: Select option from `<select>` element.
- `prism_set_checked`: Set checkbox or radio state.
- `prism_hover_element`: Move cursor over element.
- `prism_scroll_page`: Scroll viewport by pixels or direction.
- `prism_scroll_element_into_view`: Scroll element into visible viewport.
- `prism_set_input_files`: Set file paths for file upload inputs.
- `prism_handle_dialog`: Accept or dismiss JavaScript alerts/prompts/confirms.

## 6. Synchronization & Wait Guards
- `prism_wait_for_stable`: Wait until network idle and DOM mutation cessation.
- `prism_wait_for_element`: Wait until target selector appears in DOM.
- `prism_wait_for_text`: Wait until expected text string appears.
- `prism_wait_for_url`: Wait until URL matches target regex/pattern.
- `prism_wait_for_download`: Await completion of active file download.
- `prism_wait`: Explicit millisecond delay.

## 7. Network & Visual Diagnostics
- `prism_take_screenshot`: Capture viewport screenshot.
- `prism_take_full_page_screenshot`: Capture full scrolling screenshot.
- `prism_start_har` / `prism_stop_har`: Record HTTP Archive (HAR).
- `prism_list_network_requests`: Inspect requests intercepted on active page.
- `prism_get_network_request`: Fetch single HTTP request detail.
- `prism_set_offline`: Emulate offline network conditions.
