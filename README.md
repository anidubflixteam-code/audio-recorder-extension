# Audio Capture Pro 🎙️

Audio Capture Pro is a lightweight, modern, and high-quality Chrome extension designed to record audio directly from any browser tab. Built using the latest **Chrome Extension Manifest V3** and the **Offscreen Document API**, it ensures seamless background recording even when the extension popup is closed.

---

## ✨ Features

- **High-Quality Audio:** Captures tab audio in stereo using the high-fidelity Opus codec inside a WebM container at **256kbps**.
- **Background Support:** Utilizes the Offscreen API, meaning the recording will not stop or lag if you close the popup interface.
- **Audible Playthrough:** You can still listen to the tab's audio normally through your speakers or headphones while it is being recorded.
- **Modern Dark UI:** Beautifully designed dark-themed popup featuring:
  - An active recording timer.
  - A responsive CSS audio wave visualizer.
  - Glassmorphic styling.
- **Privacy First:** 100% local processing. No audio data is uploaded to external servers.

---

## 📂 Directory Structure

Make sure your project folder matches the structure below:

```text
audio-recorder-extension/
  ├── manifest.json
  ├── background.js
  ├── popup.html
  ├── popup.css
  ├── popup.js
  ├── offscreen.html
  ├── offscreen.js
  └── icon.png
