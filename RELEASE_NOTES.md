# Release Notes - Zeno v1.0 Beta

**Date:** January 12, 2026
**Version:** v1.0.0-beta

Welcome to the Beta release of **Zeno**, your AI-powered companion for deep work and focused browsing. This version introduces core intelligent filtering capabilities designed to eliminate digital distractions by understanding your context.

## 🚀 Key Features

- **🎯 Context-Aware Filtering:** Define your goal (e.g., "Software Development"), and Zeno uses Llama 3 (via Groq Cloud API) to analyze and block websites that aren't relevant to your task.
- **📺 Smart YouTube Focus:** Automatically filters YouTube homepages, search results, and sidebars. Irrelevant recommendations are blurred or hidden, while helpful content remains accessible.
- **⚡ Hybrid Analysis Engine:** Combines lightning-fast local keyword matching with advanced semantic AI analysis for efficient and accurate content filtering.
- **🌐 Multi-Browser Support:** Includes dedicated manifests and a setup script for both Chromium-based browsers (Chrome, Edge, Brave) and Firefox.
- **🛡️ Privacy First:** Your browsing data is processed ephemerally for relevance checks; no history is stored on external servers.

## 🔄 Changes in this Beta

- **Cross-Browser Compatibility:** Added `manifest.chrome.json` and `manifest.firefox.json` with a `setup.sh` utility to easily switch between browser environments.
- **UI Enhancements:** Updated extension icons and improved the popup interface for a smoother user experience.
- **Refined AI Prompting:** Optimized the relevance checking logic to better distinguish between educational content and distractions.
- **Documentation:** Comprehensive README update with setup instructions and troubleshooting guides.

## 🛠️ Installation & Setup

1.  **Select Browser:** Run `./setup.sh chrome` or `./setup.sh firefox` in the project directory.
2.  **Load Extension:**
    - **Chrome:** Load as an "Unpacked Extension" from `chrome://extensions/`.
    - **Firefox:** Load as a "Temporary Add-on" from `about:debugging`.
3.  **API Key:** Enter your free Groq API Key in the extension settings to enable AI features.

## 📝 Known Issues & Feedback

- This is a beta release; you may encounter occasional false positives in website blocking.
- Firefox support for Manifest V3 background scripts is currently handled via a specific manifest configuration.

We value your feedback! Please report any issues or suggestions to help us improve Zeno.

---
*Stay focused, stay productive.*
