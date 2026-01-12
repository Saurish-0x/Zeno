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