# Zeno - AI Task Focus Extension


Zeno is a Chrome extension that helps you stay focused on your task by automatically blocking irrelevant websites and filtering YouTube distractions.

## Features

- **Intelligent Filtering:** Uses Groq AI to analyze the relevance of any website you visit based on your current task.
- **YouTube Focus:** Automatically blurs and hides irrelevant YouTube videos on the homepage, search results, and channel pages.
- **Auto-Close:** Optionally close tabs that are determined to be irrelevant to your goals.
- **Simple Workflow:** Set your task, click "Start", and let Zeno handle the distractions.

## Setup Instructions

1.  **Clone the Repository:** Download or clone this folder to your machine.
2.  **Load in Chrome:**
    - Open Chrome and go to `chrome://extensions/`.
    - Enable "Developer mode" in the top-right corner.
    - Click "Load unpacked" and select the extension folder.
3.  **API Key (Recommended):**
    - Get a free API key from [Groq](https://console.groq.com/).
    - Enter it in the extension popup settings for personalized and reliable performance.

## Usage

1.  Click the **Zeno** icon in your toolbar.
2.  Enter the task you are working on (e.g., "Researching machine learning papers").
3.  Click **Start Task**.
4.  Zeno will generate keywords and start filtering your browsing session immediately.

## Technical Details

- **Engine:** Built with Chrome Extension Manifest V3.
- **AI Backend:** Powered by Groq Cloud API (utilizing Llama 3 models).
- **Efficiency:** Uses a hybrid approach of local keyword matching and AI analysis for fast reaction times.
=======
Zeno is a powerful browser extension designed to help you maintain deep focus by intelligently filtering web content based on your current goal. Unlike simple blocklists, Zeno uses advanced AI (Groq/Llama 3) to analyze the *relevance* of every page you visit in real-time.

## Key Features

- **🎯 Context-Aware Filtering:** Define your task (e.g., "Learning React Native"), and Zeno will automatically block websites that aren't relevant to that specific goal.
- **🧠 AI-Powered Analysis:** Utilizes the Groq Cloud API with Llama 3 models to understand the semantic context of web pages.
- **📺 Smart YouTube Control:** Don't just block YouTube—filter it. Zeno hides irrelevant videos on the homepage and sidebar while keeping content that helps you learn.
- **⚡ Ultra-Fast Local Processing:** combines AI with local caching and lightweight keyword matching for millisecond-level blocking decisions.
- **🛡️ Privacy Focused:** Your browsing data stays local or is processed ephemerally by the AI; no history is stored on external servers.

## Installation Guide

### 1. Prerequisites
- **Git:** To clone the repository.
- **Node.js (Optional):** Only if you plan to run additional build scripts (not required for basic usage).
- **Groq API Key:** You'll need a free API key from [Groq Console](https://console.groq.com/keys) to power the AI features.

### 2. Download the Code
```bash
git clone https://github.com/saurish-0x/zeno.git
cd zeno/Code/Beta\ V.10
```

### 3. Setup for Chrome (or Edge, Brave)
1.  **Switch Manifest:**
    ```bash
    ./setup.sh chrome
    ```
2.  **Load the Extension:**
    - Open Chrome and navigate to `chrome://extensions/`.
    - Toggle **Developer mode** in the top-right corner.
    - Click **Load unpacked** and select this folder.

### 4. Setup for Firefox
1.  **Switch Manifest:**
    ```bash
    ./setup.sh firefox
    ```
2.  **Load the Extension:**
    - Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
    - Click **Load Temporary Add-on...**.
    - Select the `manifest.json` file from this folder.

## Troubleshooting

### Firefox: "background.service_worker is currently disabled"
This error happens because Firefox Manifest V3 does not support Service Workers in the same way Chrome does.
**Fix:** Run `./setup.sh firefox` (or manually copy `manifest.firefox.json` to `manifest.json`) before loading the extension in Firefox.

## Configuration

1.  **Enter API Key:**
    - Click the Zeno extension icon in your browser toolbar.
    - Click the **Settings** (gear icon) button.
    - Paste your Groq API Key into the designated field.
    - Click **Save**.

2.  **Start a Task:**
    - Open the popup again.
    - Type your current goal (e.g., "Researching French History").
    - Click **Start Task**.
    - Zeno will generate a list of relevant keywords and begin monitoring your browsing.

## Project Structure

- **`manifest.chrome.json` / `manifest.firefox.json`**: Configuration files for the browser extension.
- **`background.js`**: The central service worker (Chrome) or background script (Firefox) that handles logic, API calls, and blocking rules.
- **`content-script.js`**: Runs on every webpage to extract content (text, meta tags) for relevance analysis.
- **`youtube.js`**: A specialized script for filtering YouTube's interface (hiding recommendations/sidebar).
- **`popup.html` & `popup.js`**: The user interface for starting tasks and changing settings.

## Development & Troubleshooting

- **Extension Error: "Manifest file is missing or unreadable"**
  - Ensure you have renamed either `manifest.chrome.json` or `manifest.firefox.json` to `manifest.json` before loading.
- **"Checking Page Relevance" Overlay Stuck**
  - This might happen if the AI request times out. Refresh the page.
  - Check the browser console (`F12` > Console) for any network errors.
- **Firefox Compatibility**
  - Firefox treats background scripts differently from Chrome's Service Workers. We use a unified codebase, but ensure you use the correct manifest to load the right background environment.


