# Zeno - AI Task Focus Extension

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
git clone https://github.com/yourusername/zeno.git
cd zeno/Code/Beta\ V.10
```

### 3. Setup for Chrome (or Edge, Brave)
1.  **Prepare the Manifest:**
    - The repository includes a `manifest.chrome.json` file.
    - Copy or rename it to `manifest.json`:
      ```bash
      cp manifest.chrome.json manifest.json
      ```
      *(Windows users: copy and rename manually in File Explorer)*

2.  **Load the Extension:**
    - Open Chrome and navigate to `chrome://extensions/`.
    - Toggle **Developer mode** in the top-right corner.
    - Click **Load unpacked**.
    - Select the folder containing the `manifest.json` file (the root of this project).

### 4. Setup for Firefox
1.  **Prepare the Manifest:**
    - The repository includes a `manifest.firefox.json` file.
    - Copy or rename it to `manifest.json`:
      ```bash
      cp manifest.firefox.json manifest.json
      ```
2.  **Load the Extension:**
    - Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
    - Click **Load Temporary Add-on...**.
    - Select the `manifest.json` file from the project directory.

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

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT](https://choosealicense.com/licenses/mit/)
