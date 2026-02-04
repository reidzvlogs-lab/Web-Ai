# WebCursor Agent (Chrome Extension)

WebCursor Agent is a Manifest V3 Chrome Extension that overlays a visible agent cursor on any page, plans actions step-by-step, and performs safe, transparent UI automation in your current tab.

## Features
- **In-page agent cursor overlay** with highlight boxes, click ripples, and typing indicator.
- **Plan → Act loop**: observe page structure, request next action, validate, preview, then execute.
- **Step mode** (manual) and **Auto mode** (delayed execution).
- **Risky action confirmation** for submissions, payments, messages, deletions, and passwords.
- **Domain allowlist/denylist** control.
- **Demo mode** (no API required) for testing overlays and actions.

## Install (Unpacked)
1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this repository folder.

## Configuration
1. Open the extension **Settings** from the popup.
2. Paste your OpenAI API key.
3. Optionally adjust:
   - Model name
   - Max steps
   - Domain allowlist/denylist
   - Safety confirmation toggle

## Usage
1. Open any website.
2. Open the **WebCursor Agent** popup.
3. Type your task (e.g., “find the pricing link” or “summarize this page”).
4. Choose **Step mode** or **Auto mode**.
5. Click **Run**. Use **Step** to advance in Step mode or **Stop** to cancel.

## Demo Mode
Enable **Demo mode** in the popup to run without an API key. Demo mode will:
1. Scroll down.
2. Type into the first input field (if present).
3. Click the first link (if present).

## Safety
- Risky actions always require confirmation by default.
- The agent pauses and re-observes if the page changes.

## Notes
- The extension uses `activeTab`, `scripting`, and `storage` permissions.
- Host permissions are set to `<all_urls>` to enable content scripts on most sites.

## File Overview
- `manifest.json`: Extension manifest (MV3).
- `background.js`: Service worker for model calls and settings.
- `contentScript.js`: Page observer, overlay, and action executor.
- `overlay.css`: Cursor and overlay styles.
- `popup.html`, `popup.css`, `popup.js`: UI for tasks and controls.
- `options.html`, `options.js`: Settings for API key and safety.
