// Store the current task
let currentTask = '';
let taskKeywordsCache = {}; // Cache for task -> keywords mapping
let rawGeminiResponse = ''; // Store raw response from Gemini API
let isInitialized = false; // Track if we've loaded data from storage

// Groq API configuration
const GROQ_CONFIG = {
  apiKey: '',
  baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
  model: 'qwen/qwen3-32b',
  enabled: true,
  keywordsPerTask: 800, // Increased from 500 to 800 keywords for better coverage
  maxRetries: 3
};

// Relevance configuration
const RELEVANCE_CONFIG = {
  // Minimum relevance score threshold to consider a page relevant (0.0-1.0)
  // Increased from 0.15/0.2 to 0.25/0.3 for stricter filtering
  // Minimum relevance score threshold to consider a page relevant (0.0-1.0)
  // Lowered to 0.2 to prevent false positives (closing relevant tabs)
  relevanceThreshold: 0.2,
  relevanceThresholdLow: 0.15, // Threshold for showing warning but not closing

  // Scoring weights
  titleWeight: 3.0, // Title matches are highly indicative
  urlWeight: 2.0, // URL matches are also strong indicators
  contentWeight: 1.0, // Content matches are useful but less reliable

  // Auto-close settings
  autoCloseEnabled: true, // Default to enabled
  autoCloseDelay: 500, // Milliseconds to wait before closing irrelevant tabs

  // Debug settings
  debugMode: false, // Set to true for detailed console logging
  showTabDecisions: true // Log each tab's relevance assessment
};

// Whitelist of websites that are always allowed
const WEBSITE_WHITELIST = [
  'google.com',
  'github.com',
  'stackoverflow.com',
  'localhost',
  '127.0.0.1',
  'chatgpt.com',
  'claude.ai',
  'gemini.google.com',
  'youtube.com'
];

// Blacklist of websites that are always blocked during a task (Fast Block)
const WEBSITE_BLACKLIST = [
  'instagram.com',
  'tiktok.com',
  'facebook.com',
  'twitter.com',
  'x.com',
  'reddit.com',
  'netflix.com',
  'twitch.tv',
  'pinterest.com',
  '9gag.com',
  'buzzfeed.com',
  'hulu.com',
  'disneyplus.com',
  'primevideo.com'
];

// Websites that are typically distracting
// Websites that are typically distracting (Legacy list, kept for reference but not used directly)
/*
const WEBSITE_BLACKLIST_LEGACY = {
  // Social media
  SOCIAL_MEDIA: [
    'facebook.com', 'twitter.com', 'instagram.com', 'tiktok.com', 'snapchat.com',
    'pinterest.com', 'tumblr.com', 'linkedin.com/feed', 'quora.com'
  ],
  // Entertainment
  ENTERTAINMENT: [
    'netflix.com', 'hulu.com', 'disneyplus.com', 'hbomax.com', 'primevideo.com',
    'twitch.tv', 'vimeo.com', 'dailymotion.com', 'imdb.com',
    'rottentomatoes.com', 'metacritic.com', 'crunchyroll.com', 'funimation.com'
  ],
  // Shopping
  SHOPPING: [
    'amazon.com', 'ebay.com', 'walmart.com', 'target.com', 'bestbuy.com',
    'etsy.com', 'wish.com', 'aliexpress.com', 'wayfair.com', 'homedepot.com',
    'newegg.com', 'zappos.com'
  ],
  // Gaming
  GAMING: [
    'steam.com', 'epicgames.com', 'ea.com', 'blizzard.com', 'playstation.com',
    'xbox.com', 'nintendo.com', 'roblox.com', 'ign.com', 'gamespot.com',
    'kotaku.com', 'polygon.com'
  ]
};
*/

// Special domains that should be analyzed on a case-by-case basis
const SPECIAL_DOMAINS = {
  // May be educational or distracting depending on content
  MIXED_USE: [
    // YouTube and Reddit moved to whitelist
    'medium.com',  // Could be professional or casual
    'github.com',  // Could be work-related or random projects
    'linkedin.com' // Could be job searching or social media
  ]
};

// Custom lists loaded from storage
let customWhitelist = {};
let customBlacklist = {};
let customMixedDomains = { MIXED_USE: [] };
let hiddenDefaultItems = {};

// Initialize on extension installed/updated
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed/updated:', details.reason);
  // We don't need to call loadEssentialData here because it will be called
  // by the top-level call below when the service worker starts up.
});

// ALWAYS try to load data when the script starts (Service Worker wakes up)
loadEssentialData();

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request.action);

  // Call the appropriate function based on the message action
  processMessage(request, sender, sendResponse);

  // Return true to indicate we'll send a response asynchronously
  return true;
});

// Log to console and store last error for debugging
function logError(message, error) {
  console.error(message, error);
  chrome.storage.local.set({ lastError: { message, details: error?.toString(), time: new Date().toISOString() } });
}

// Function to save data to storage with robust error handling
function saveToStorage(data) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          console.error('Storage save error:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          console.log('Successfully saved to storage:', Object.keys(data).join(', '));
          resolve();
        }
      });
    } catch (err) {
      console.error('Exception during storage save:', err);
      reject(err);
    }
  });
}

// Function to load data from storage with error handling
function loadFromStorage(keys) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          console.error('Storage load error:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          console.log('Successfully loaded from storage:', Object.keys(result).join(', '));
          resolve(result);
        }
      });
    } catch (err) {
      console.error('Exception during storage load:', err);
      reject(err);
    }
  });
}

// Function to load essential data
async function loadEssentialData() {
  if (isInitialized) return; // Prevent multiple initializations

  try {
    console.log('Loading essential data from storage...');
    const data = await loadFromStorage([
      'lastTask',
      'taskKeywords',
      'autoCloseEnabled',
      'customWhitelist',
      'customBlacklist',
      'customMixedDomains',
      'hiddenDefaultItems',
      'rawGeminiResponse'
    ]);

    // Load task
    if (data.lastTask) {
      currentTask = data.lastTask;
      console.log('Loaded saved task:', currentTask);
    }

    // Load keyword cache
    if (data.taskKeywords) {
      taskKeywordsCache = data.taskKeywords || {};
      console.log('Loaded keyword cache for', Object.keys(taskKeywordsCache).length, 'tasks');
    } else {
      // Try loading from backup
      chrome.storage.local.get(['backup_taskKeywords'], (backup) => {
        if (backup.backup_taskKeywords) {
          taskKeywordsCache = backup.backup_taskKeywords;
          console.log('Loaded keyword cache from BACKUP for', Object.keys(taskKeywordsCache).length, 'tasks');
        }
      });
    }

    // Load raw response
    if (data.rawGeminiResponse) {
      rawGeminiResponse = data.rawGeminiResponse;
      console.log('Loaded raw Gemini response');
    }

    // Load auto-close setting
    if (data.hasOwnProperty('autoCloseEnabled')) {
      RELEVANCE_CONFIG.autoCloseEnabled = data.autoCloseEnabled;
    }

    // Load custom API key
    if (data.customApiKey) {
      GROQ_CONFIG.apiKey = data.customApiKey;
      console.log('Loaded custom API key.');
    }



    // Load custom lists
    customWhitelist = data.customWhitelist || {};
    customBlacklist = data.customBlacklist || {};
    customMixedDomains = data.customMixedDomains || { MIXED_USE: [] };
    hiddenDefaultItems = data.hiddenDefaultItems || {};

    isInitialized = true;
    console.log('Essential data loaded. Extension is ready.');

    // Ensure blocking rules are active immediately after loading
    updateBlockingRules();
  } catch (error) {
    console.error('Error loading essential data:', error);
    // Set defaults in case of loading error
    isInitialized = true; // Still mark as initialized to prevent loops
  }
}

// Process messages after ensuring data is loaded
async function processMessage(request, sender, sendResponse) {
  // Ensure data is loaded before processing any message
  if (!isInitialized) {
    console.log('Waiting for initialization before processing message:', request.action);
    await loadEssentialData();
  }

  console.log('Received message:', request.action);

  if (request.action === 'getTabId') {
    // Send back the tab ID
    if (sender.tab) {
      sendResponse({ tabId: sender.tab.id });
    } else {
      sendResponse({ tabId: null });
    }
    return true;
  }
  else if (request.action === 'reloadCustomLists') {
    // Reload custom lists from storage
    loadFromStorage([
      'customWhitelist',
      'customBlacklist',
      'customMixedDomains',
      'hiddenDefaultItems'
    ]).then(result => {
      customWhitelist = result.customWhitelist || {};
      customBlacklist = result.customBlacklist || {};
      customMixedDomains = result.customMixedDomains || { MIXED_USE: [] };
      hiddenDefaultItems = result.hiddenDefaultItems || {};

      console.log('Reloaded custom whitelist categories:', Object.keys(customWhitelist).length);
      console.log('Reloaded custom blacklist categories:', Object.keys(customBlacklist).length);

      sendResponse({ success: true });
    }).catch(error => {
      console.error('Error reloading custom lists:', error);
      sendResponse({ success: false, error: error.toString() });
    });
    return true;
  }
  else if (request.action === 'getTaskAndApiKey') {
    console.log('Returning current task:', currentTask);
    sendResponse({
      task: currentTask,
      apiKey: GROQ_CONFIG.apiKey ? 'configured' : '',
      rawGeminiResponse: rawGeminiResponse
    });
    return true;
  }
  else if (request.action === 'getFilterLists') {
    // Return the whitelist, blacklist, and mixed-use domains for settings page
    console.log('Returning filter lists for settings page');
    sendResponse({
      success: true,
      defaultWhitelist: WEBSITE_WHITELIST,
      defaultBlacklist: WEBSITE_BLACKLIST,
      defaultMixedDomains: SPECIAL_DOMAINS
    });
    return true;
  }
  else if (request.action === 'getRawGeminiResponse') {
    sendResponse({
      rawGeminiResponse: rawGeminiResponse
    });
    return true;
  }
  else if (request.action === 'testNotification') {
    console.log('Testing notification system');

    // Create a test notification - use absolute URL for icon
    const iconUrl = chrome.runtime.getURL('icons/icon48.png');
    console.log('Using icon URL:', iconUrl);

    chrome.notifications.create('test_notification', {
      type: 'basic',
      iconUrl: iconUrl,
      title: 'Test Notification',
      message: 'This is a test notification from Focus Filter',
      priority: 2
    }, function (notificationId) {
      if (chrome.runtime.lastError) {
        console.error('Test notification error:', chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        console.log('Test notification created with ID:', notificationId);
        sendResponse({ success: true });
      }
    });

    return true; // Keep the message channel open for async response
  }
  else if (request.action === 'forceGenerateKeywords') {
    const task = request.task;
    if (!task) {
      sendResponse({ success: false, error: 'No task provided for keyword generation.' });
      return false;
    }

    // Update current task
    currentTask = task;
    saveToStorage({ lastTask: task })
      .then(() => console.log('Task saved to storage'))
      .catch(error => console.error('Error saving task:', error));

    // Update blocking rules immediately when task changes
    updateBlockingRules();

    if (GROQ_CONFIG.enabled && GROQ_CONFIG.apiKey) {
      // Force regeneration by clearing cache for this task first
      if (taskKeywordsCache[task]) {
        delete taskKeywordsCache[task];
        console.log('Cleared cached keywords for forced regeneration of:', task);
      }

      // Clear raw response in case there's an old one for this task
      rawGeminiResponse = '';

      // Save initial generation status
      saveToStorage({
        keywordGenerationStatus: {
          inProgress: true,
          task: task,
          startTime: Date.now(),
          progress: 0,
          message: 'Starting keyword generation...'
        }
      });

      // IMMEDIATELY respond that generation has started (don't wait for completion)
      sendResponse({ success: true, started: true, message: 'Keyword generation started in background' });

      // Run generation in the background independently (no dependency on popup)
      (async () => {
        try {
          const keywords = await generateKeywordsForTask(task);
          console.log(`Force generated ${keywords.length} keywords for task: ${task}`);

          // Store in cache
          taskKeywordsCache[task] = keywords;

          // Save to storage with completion status
          await saveToStorage({
            taskKeywords: taskKeywordsCache,
            rawGeminiResponse: rawGeminiResponse,
            lastTask: task,
            keywordGenerationStatus: {
              inProgress: false,
              completed: true,
              task: task,
              keywordCount: keywords.length,
              completedTime: Date.now(),
              progress: 100,
              message: `Generated ${keywords.length} keywords!`
            }
          });
          console.log('Background keyword generation completed and saved!');

          // Show badge notification on extension icon
          chrome.action.setBadgeText({ text: '✓' });
          chrome.action.setBadgeBackgroundColor({ color: '#22c55e' }); // Green
          // Clear badge after 10 seconds
          setTimeout(() => {
            chrome.action.setBadgeText({ text: '' });
          }, 10000);

        } catch (error) {
          console.error('Background keyword generation failed:', error);
          // Save error status
          await saveToStorage({
            keywordGenerationStatus: {
              inProgress: false,
              completed: false,
              error: error.toString(),
              task: task,
              completedTime: Date.now(),
              progress: 0,
              message: 'Error: ' + error.message
            }
          });

          // Show error badge on extension icon
          chrome.action.setBadgeText({ text: '✗' });
          chrome.action.setBadgeBackgroundColor({ color: '#ef4444' }); // Red
          // Clear badge after 10 seconds
          setTimeout(() => {
            chrome.action.setBadgeText({ text: '' });
          }, 10000);
        }
      })();

      return false; // Don't keep channel open - we already responded
    } else {
      sendResponse({ success: false, error: 'API key not configured or generation disabled.' });
      return false;
    }
  }
  else if (request.action === 'stopTask') {
    currentTask = '';
    saveToStorage({ lastTask: '' })
      .then(() => console.log('Task stopped and cleared from storage'))
      .catch(error => console.error('Error clearing task:', error));
      
    // Notify tabs that task is stopped (to clear overlays etc)
    chrome.tabs.query({}, function(tabs) {
      for (const tab of tabs) {
         chrome.tabs.sendMessage(tab.id, { action: 'taskUpdated', task: '' }).catch(() => {});
      }
    });

    updateBlockingRules();
    sendResponse({ success: true });
    return false;
  }
  else if (request.action === 'getKeywordGenerationStatus') {
    // Allow popup to check generation status when reopened
    loadFromStorage(['keywordGenerationStatus']).then(data => {
      sendResponse({ status: data.keywordGenerationStatus || null });
    }).catch(error => {
      sendResponse({ error: error.toString() });
    });
    return true;
  }
  else if (request.action === 'checkRelevance') {
    const url = request.url;
    let task = request.task;
    const siteInfo = request.siteInfo || {};

    // If no task is specified, use the current task
    if (!task) task = currentTask;

    if (!url) {
      sendResponse({ error: 'No URL provided for relevance check.' });
      return false;
    }

    if (!task) {
      sendResponse({ error: 'No task set for relevance check.' });
      return false;
    }

    // Get keywords for the task
    getKeywords(task)
      .then(keywords => {
        // Check if the URL is in the whitelist
        const isWhitelisted = isUrlWhitelisted(url);
        if (isWhitelisted) {
          const response = {
            isRelevant: true,
            relevanceScore: 1.0,
            matches: ['Whitelisted domain'],
            message: 'This domain is always allowed.',
            source: 'whitelist'
          };
          sendResponse(response);
          return;
        }

        // Perform relevance check using keywords
        const relevanceResult = checkRelevance(url, siteInfo, keywords);
        sendResponse(relevanceResult);

        // Auto-close if irrelevant and feature is enabled
        if (!relevanceResult.isRelevant) {
          if (RELEVANCE_CONFIG.autoCloseEnabled) {
            // If this is from the active tab, close it unless popup check
            if (sender.tab && url !== 'popup.html') {
              console.log(`Auto-closing irrelevant tab: ${url} (Score: ${relevanceResult.relevanceScore})`);
              closeTabIfIrrelevant(sender.tab.id);
            } else {
              console.log(`Irrelevant but not closing: sender.tab=${!!sender.tab}, url=${url}`);
            }
          } else {
            console.log(`Irrelevant but auto-close disabled: ${url}`);
          }
        }
      })
      .catch(error => {
        console.error('Error checking relevance:', error);
        sendResponse({ error: error.toString() });
      });

    return true; // Keep the message channel open for async response
  }
  else if (request.action === 'checkPageRelevance') {
    // This is called from the content script when a page loads
    if (!currentTask) {
      console.log('No current task set, skipping relevance check');
      sendResponse({ success: false, message: 'No current task set' });
      return true;
    }

    const siteInfo = request.siteInfo || {};
    const url = siteInfo.url || (sender.tab ? sender.tab.url : null);

    if (!url) {
      console.log('No URL available for relevance check');
      sendResponse({ success: false, message: 'No URL available' });
      return true;
    }

    // Check if auto-close is disabled
    if (!RELEVANCE_CONFIG.autoCloseEnabled) {
      console.log('Auto-close disabled, skipping relevance check for:', url);
      sendResponse({ success: true, message: 'Auto-close disabled' });
      return true;
    }

    // FAST BLOCK: Check blacklist immediately
    if (isUrlBlacklisted(url)) {
      console.log(`[FAST BLOCK] Blacklisted domain detected: ${url}`);

      // Close immediately if enabled
      if (RELEVANCE_CONFIG.autoCloseEnabled && sender.tab) {
        closeTabIfIrrelevant(sender.tab.id);
      }

      sendResponse({
        success: true,
        isRelevant: false,
        relevanceScore: 0.0,
        message: 'This site is in your distraction blacklist.'
      });
      return true;
    }

    // Get keywords for the current task
    getKeywords(currentTask)
      .then(keywords => {
        // Check if the URL is in the whitelist
        if (isUrlWhitelisted(url)) {
          console.log('Whitelisted domain, allowing:', url);
          sendResponse({
            success: true,
            isRelevant: true,
            message: 'Whitelisted domain'
          });
          return;
        }

        // OPTIMIZATION: Check cache first
        if (relevanceCache.has(url)) {
          const cached = relevanceCache.get(url);
          const now = Date.now();
          // Check if cache is valid (TTL and same task)
          if (now - cached.timestamp < CACHE_TTL && cached.task === currentTask) {
            console.log(`Using cached relevance result for: ${url}`);

            // If irrelevant, close the tab (logic duplicated for cache hit)
            if (!cached.result.isRelevant && sender.tab) {
              if (RELEVANCE_CONFIG.autoCloseEnabled) {
                console.log(`Auto-closing irrelevant tab (cached): ${url}`);
                closeTabIfIrrelevant(sender.tab.id);
              }
            }

            sendResponse({
              success: true,
              isRelevant: cached.result.isRelevant,
              relevanceScore: cached.result.relevanceScore,
              message: cached.result.message + ' (Cached)'
            });
            return;
          }
        }

        // Perform relevance check
        const relevanceResult = checkRelevance(url, siteInfo, keywords);

        // Cache the result
        relevanceCache.set(url, {
          timestamp: Date.now(),
          result: relevanceResult,
          task: currentTask
        });

        // If irrelevant, close the tab
        if (!relevanceResult.isRelevant && sender.tab) {
          console.log(`Auto-closing irrelevant tab: ${url}`);
          closeTabIfIrrelevant(sender.tab.id);
        }

        sendResponse({
          success: true,
          isRelevant: relevanceResult.isRelevant,
          relevanceScore: relevanceResult.relevanceScore,
          message: relevanceResult.message
        });
      })
      .catch(error => {
        console.error('Error in background relevance check:', error);
        sendResponse({
          success: false,
          error: error.toString()
        });
      });

    return true; // Keep message channel open for async response
  }
  else if (request.action === 'setAutoCloseEnabled') {


    RELEVANCE_CONFIG.autoCloseEnabled = request.enabled;
    saveToStorage({ autoCloseEnabled: request.enabled })
      .then(() => console.log('Auto-close setting saved'))
      .catch(error => console.error('Error saving auto-close setting:', error));

    // Update blocking rules immediately when setting changes
    updateBlockingRules();

    console.log('Auto-close feature is now', request.enabled ? 'enabled' : 'disabled');
    sendResponse({ success: true });
    return false;
  }

  return false; // No async response expected
}

// Extracts domain from a URL
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch (e) {
    console.error('Error extracting domain:', e);
    return url;
  }
}

// Check if a URL is whitelisted
function isUrlWhitelisted(url) {
  return WEBSITE_WHITELIST.some(domain => url.includes(domain));
}

// Check if a URL is blacklisted
function isUrlBlacklisted(url) {
  return WEBSITE_BLACKLIST.some(domain => url.includes(domain));
}

// Close a tab if it's determined to be irrelevant
// Close a tab if it's determined to be irrelevant
function closeTabIfIrrelevant(tabId, immediate = false) {
  // Send a message to the content script to show the notification
  // Only send notification if NOT immediate
  if (!immediate) {
    chrome.tabs.sendMessage(tabId, { action: 'forceCloseTab' }, function (response) {
      // Ignore errors here, we just want to try showing the notification
      if (chrome.runtime.lastError) {
        console.log('Could not send close notification (tab might be gone already)');
      }
    });
  }

  // Force close from background
  // If immediate is true, delay is 0, otherwise 2000ms
  const delay = immediate ? 0 : 2000;

  setTimeout(() => {
    chrome.tabs.remove(tabId, function () {
      if (chrome.runtime.lastError) {
        // console.error('Error closing tab:', chrome.runtime.lastError);
        // Silent fail is fine here
      } else {
        console.log(`Tab closed successfully via background script (Immediate: ${immediate})`);
      }
    });
  }, delay);
}

// Get keywords for a task (from cache or generate new ones)
async function getKeywords(task) {
  // Ensure data is initialized
  if (!isInitialized) {
    await loadEssentialData();
  }

  // Check if we have keywords in cache
  if (taskKeywordsCache[task]) {
    console.log(`Using cached ${taskKeywordsCache[task].length} keywords for task: ${task}`);
    return taskKeywordsCache[task];
  }

  // Try to load keywords from storage in case they weren't loaded at startup
  try {
    const data = await loadFromStorage(['taskKeywords']);
    if (data.taskKeywords && data.taskKeywords[task]) {
      // Update cache from storage
      taskKeywordsCache = data.taskKeywords;
      console.log(`Found ${taskKeywordsCache[task].length} keywords in storage for task: ${task}`);
      return taskKeywordsCache[task];
    }
  } catch (error) {
    console.error('Error checking storage for keywords:', error);
  }

  // Generate keywords using Gemini
  console.log(`No cached keywords found, generating for task: ${task}`);
  try {
    const keywords = await generateKeywordsForTask(task);

    // Cache the keywords
    taskKeywordsCache[task] = keywords;

    // Save to storage with error handling
    try {
      await saveToStorage({
        taskKeywords: taskKeywordsCache,
        rawGeminiResponse: rawGeminiResponse
      });

      // Backup save to a separate key just in case
      chrome.storage.local.set({
        backup_taskKeywords: taskKeywordsCache
      });

      console.log('Saved new keywords to storage (and backup)');
    } catch (error) {
      console.error('Error saving keywords to storage:', error);
      // Continue despite storage error - at least we have them in memory
    }

    return keywords;
  } catch (error) {
    console.error('Error generating keywords:', error);
    // Return empty array if generation fails
    return [];
  }
}

// Generate keywords for a task using Gemini API
async function generateKeywordsForTask(task) {
  console.log(`Generating keywords for task: ${task}`);

  // Send progress: Starting
  chrome.runtime.sendMessage({ action: 'keywordGenerationProgress', progress: 10, message: 'Initializing AI...' }).catch(() => { });

  // Check if we have an API key
  if (!GROQ_CONFIG.apiKey) {
    // Try to load from storage one last time
    const data = await loadFromStorage(['customApiKey']);
    if (data.customApiKey) {
      GROQ_CONFIG.apiKey = data.customApiKey;
    } else {
      throw new Error('Groq API Key is missing. Please configure it in the extension settings.');
    }
  }

  const prompt = `Generate 800 UNIQUE simple keywords for someone studying/researching: "${task}".

GOAL: Generate enough keywords so that ANY website related to this topic will be allowed (not blocked).

RULES:
1. ONLY simple standalone words (like "heat", "entropy", "physics", "study", "learn")
2. NO compound words, NO CamelCase, NO hyphens
3. Every word must be unique

INCLUDE KEYWORDS FROM ALL THESE AREAS:
- Core subject terms and concepts
- Related scientific fields and branches
- Famous scientists and researchers (surnames)
- Mathematical terms used in this field
- Units of measurement
- Laboratory equipment and tools
- Common educational words: study, learn, tutorial, guide, course, lesson, lecture, notes, exam, test, quiz, homework, assignment, chapter, textbook, pdf, video, explanation, solved, examples, problems, solutions, practice, review, summary, formula, equation, theory, law, principle, definition, concept, introduction, basics, advanced, beginner, intermediate
- Academic words: university, college, school, professor, student, research, paper, journal, article, thesis, dissertation, publication, academic, scholarly, science, scientific
- Website-related words: wiki, encyclopedia, khan, academy, tutorial, online, free, download, resource, reference, library, archive
- File types: pdf, doc, ppt, slides, notes, worksheet
- Action words: calculate, solve, derive, prove, explain, understand, analyze, compute, measure, experiment
- Descriptive words: thermal, physical, chemical, mechanical, electrical, numerical, theoretical, experimental, applied, practical

OUTPUT: Only a JSON array: ["word1", "word2", "word3", ...]
No explanations. Start with [ end with ]`;

  // Send progress: Sending request
  chrome.runtime.sendMessage({ action: 'keywordGenerationProgress', progress: 30, message: 'Contacting Groq AI...' }).catch(() => { });

  try {
    const response = await fetch(GROQ_CONFIG.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_CONFIG.apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are a keyword generator. Output ONLY a JSON array of simple words. No explanations. Just: ["word1", "word2", ...]'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.9,
        max_tokens: 16000,
        top_p: 0.95
      })
    });

    // Send progress: Processing response
    chrome.runtime.sendMessage({ action: 'keywordGenerationProgress', progress: 70, message: 'Processing response...' }).catch(() => { });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Groq API Error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();

    // Extract text from Groq response (OpenAI-compatible format)
    let text = data.choices?.[0]?.message?.content;

    if (!text) {
      throw new Error('Empty response from Groq API');
    }

    // Strip out any thinking/reasoning text - find the JSON array
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      text = jsonMatch[0];
    }

    // Save raw response for debugging
    rawGeminiResponse = text;

    // Parse JSON
    let keywords = [];
    try {
      // Clean up markdown code blocks if present
      const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
      keywords = JSON.parse(jsonStr);
    } catch (e) {
      console.error('Error parsing JSON from Groq:', e);
      // Fallback: try to split by newlines or commas if JSON parsing fails
      keywords = text.split(/[\n,]/).map(k => k.trim()).filter(k => k.length > 0);
    }

    if (!Array.isArray(keywords) || keywords.length === 0) {
      throw new Error('Failed to extract keywords from AI response');
    }

    // DEDUPLICATE, normalize, and filter out compound words
    const seen = new Set();
    keywords = keywords
      .map(k => String(k).trim())
      .filter(k => {
        // Skip empty
        if (k.length === 0) return false;

        // Skip CamelCase/compound words (has uppercase letter after first character)
        if (/[a-z][A-Z]/.test(k)) return false;

        // Skip words with numbers mixed in
        if (/\d/.test(k) && /[a-zA-Z]/.test(k)) return false;

        // Normalize to lowercase
        const normalized = k.toLowerCase();

        // Skip duplicates
        if (seen.has(normalized)) return false;

        seen.add(normalized);
        return true;
      })
      .map(k => k.toLowerCase()); // Final lowercase

    console.log(`After filtering: ${keywords.length} unique simple keywords`);

    // Send progress: Done
    chrome.runtime.sendMessage({ action: 'keywordGenerationProgress', progress: 100, message: `Generated ${keywords.length} unique keywords!` }).catch(() => { });

    return keywords;
  } catch (error) {
    console.error('Keyword generation failed:', error);
    chrome.runtime.sendMessage({ action: 'keywordGenerationProgress', progress: 0, message: 'Error: ' + error.message }).catch(() => { });
    throw error;
  }
}

// Extract keywords from GEMMA API response
function extractKeywordsFromResponse(responseText) {
  try {
    // Log the raw response for debugging
    console.log('Extracting keywords from response:', responseText?.substring(0, 200) + '...');

    // Try to find a JSON array in the response - looking for patterns like [...] or {"keywords": [...]}
    const jsonArrayMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonArrayMatch) {
      const jsonStr = jsonArrayMatch[0];
      try {
        const keywords = JSON.parse(jsonStr);

        // Validate and filter
        if (Array.isArray(keywords)) {
          const validKeywords = keywords
            .filter(k => typeof k === 'string' && k.trim().length > 0)
            .map(k => k.trim().toLowerCase());

          console.log(`Successfully parsed ${validKeywords.length} keywords from JSON array`);
          return validKeywords;
        }
      } catch (parseError) {
        console.error('Error parsing JSON array:', parseError);
      }
    }

    // Try to parse as a JSON object with a keywords field
    try {
      const jsonObj = JSON.parse(responseText);
      if (jsonObj && Array.isArray(jsonObj.keywords || jsonObj.result)) {
        const keywordArray = jsonObj.keywords || jsonObj.result;
        const validKeywords = keywordArray
          .filter(k => typeof k === 'string' && k.trim().length > 0)
          .map(k => k.trim().toLowerCase());

        console.log(`Successfully parsed ${validKeywords.length} keywords from JSON object`);
        return validKeywords;
      }
    } catch (parseObjError) {
      // Not a valid JSON object, continue to next method
    }

    // Fallback: split by commas, newlines, or quotes
    console.log('Using fallback keyword extraction method');
    const fallbackKeywords = responseText
      .replace(/["\[\]{}]/g, '')
      .split(/[,\n]+/)
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 0);

    return fallbackKeywords;
  } catch (error) {
    console.error('Error extracting keywords from response:', error);

    // Last resort fallback
    return responseText
      .split(/[\s,\n"]+/)
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 2);
  }
}

// Cache for relevance results to improve performance
// Key: URL, Value: { timestamp, result, task }
const relevanceCache = new Map();
const CACHE_TTL = 60000; // 60 seconds

// Check relevance of a URL based on keywords
function checkRelevance(url, siteInfo, keywords) {
  const domain = extractDomain(url);
  const title = siteInfo.title || '';
  const content = siteInfo.pageContent || '';

  // If no keywords, can't determine relevance
  if (!keywords || keywords.length === 0) {
    return {
      isRelevant: true, // Default to relevant if no keywords
      relevanceScore: 0.5,
      matches: ['No keywords available'],
      message: 'No keywords available for relevance check. Please generate keywords.',
      source: 'default'
    };
  }

  // Initialize matches array and score
  // Use a Set to avoid duplicate matches for the same keyword
  const uniqueMatches = new Set();
  let score = 0;

  // CHANGED: Use a saturation score instead of total keywords
  // This means if we get ~15 points worth of matches, we consider it 100% relevant
  // regardless of how many total keywords we have (500+)
  const saturationScore = 15.0;

  // Convert text to lowercase for case-insensitive matching
  const lowerTitle = title.toLowerCase();
  const lowerUrl = url.toLowerCase();
  const lowerContent = content.toLowerCase();

  // Calculate total text length for density check
  const totalTextLength = lowerTitle.length + lowerContent.length;
  let matchedChars = 0;

  // Check each keyword
  for (const keyword of keywords) {
    // OPTIMIZATION: Early exit if we already have enough score
    if (score >= saturationScore) {
      uniqueMatches.add('...and more (Early Exit)');
      break;
    }

    const lowerKeyword = keyword.toLowerCase();

    // Skip very short keywords to avoid noise
    if (lowerKeyword.length < 3) continue;

    let matchFound = false;

    // Check title (highest weight)
    if (lowerTitle.includes(lowerKeyword)) {
      if (!uniqueMatches.has(keyword)) {
        uniqueMatches.add(`Title: ${keyword}`);
        score += RELEVANCE_CONFIG.titleWeight;
        matchedChars += keyword.length;
        matchFound = true;
      }
    }

    // Check URL (medium weight)
    if (lowerUrl.includes(lowerKeyword)) {
      if (!uniqueMatches.has(keyword) && !matchFound) {
        uniqueMatches.add(`URL: ${keyword}`);
        score += RELEVANCE_CONFIG.urlWeight;
        // Don't add to matchedChars as URL isn't part of content density usually
        matchFound = true;
      }
    }

    // Check content (lowest weight)
    if (!matchFound && lowerContent.includes(lowerKeyword)) {
      if (!uniqueMatches.has(keyword)) {
        uniqueMatches.add(`Content: ${keyword}`);
        score += RELEVANCE_CONFIG.contentWeight;
        matchedChars += keyword.length;
      }
    }
  }

  // CHANGED: Calculate density bonus
  // If a significant percentage of the text matches keywords, boost the score
  let densityBonus = 0;
  if (totalTextLength > 0) {
    const density = matchedChars / totalTextLength;
    // If more than 5% of the text is keywords, that's very high density
    if (density > 0.05) {
      densityBonus = 5.0; // Big boost
      uniqueMatches.add(`High Keyword Density (${(density * 100).toFixed(1)}%)`);
    } else if (density > 0.02) {
      densityBonus = 2.0; // Moderate boost
      uniqueMatches.add(`Moderate Keyword Density (${(density * 100).toFixed(1)}%)`);
    }
  }

  score += densityBonus;

  // Calculate normalized relevance score (0.0-1.0)
  // Cap at 1.0
  const normalizedScore = Math.min(score / saturationScore, 1.0);

  // Determine if the page is relevant based on the score
  const isRelevant = normalizedScore >= RELEVANCE_CONFIG.relevanceThreshold;
  const isLowRelevance = normalizedScore < RELEVANCE_CONFIG.relevanceThreshold &&
    normalizedScore >= RELEVANCE_CONFIG.relevanceThresholdLow;

  // Create message based on relevance
  let message = '';
  if (isRelevant) {
    message = `This page is relevant to your task (${Math.round(normalizedScore * 100)}% match).`;
  } else if (isLowRelevance) {
    message = `This page has low relevance to your task (${Math.round(normalizedScore * 100)}% match).`;
  } else {
    message = `This page appears irrelevant to your task (${Math.round(normalizedScore * 100)}% match).`;
  }

  if (RELEVANCE_CONFIG.showTabDecisions) {
    console.log(`[${isRelevant ? 'RELEVANT' : 'IRRELEVANT'}] ${url} - Score: ${normalizedScore.toFixed(2)} (Raw: ${score}), Matches: ${uniqueMatches.size}`);
  }

  // Return the relevance results
  return {
    isRelevant,
    isLowRelevance,
    relevanceScore: normalizedScore,
    matches: Array.from(uniqueMatches).slice(0, 10), // Return only top 10 matches
    matchCount: uniqueMatches.size,
    message,
    source: 'keyword-match'
  };
}

// Make sure we reload our data if a suspend operation is canceled
chrome.runtime.onSuspendCancel.addListener(() => {
  console.log('Suspension canceled - reloading data...');
  isInitialized = false; // Reset initialization flag
  loadEssentialData(); // Reload all data
});

// Add this function to verify keyword storage integrity
function verifyKeywordStorage() {
  if (!currentTask) return;

  console.log('Verifying keyword storage for current task:', currentTask);

  // Check if we have keywords in memory but need to verify they're in storage
  if (taskKeywordsCache[currentTask]) {
    const keywordCount = taskKeywordsCache[currentTask].length;
    console.log(`Found ${keywordCount} keywords in memory for current task`);

    // Verify storage has the same data
    loadFromStorage(['taskKeywords']).then(data => {
      if (data.taskKeywords &&
        data.taskKeywords[currentTask] &&
        data.taskKeywords[currentTask].length === keywordCount) {
        console.log('Storage verification successful - keywords match');
      } else {
        console.warn('Storage verification failed - updating storage with memory cache');
        // Update storage with our in-memory cache
        saveToStorage({ taskKeywords: taskKeywordsCache })
          .then(() => console.log('Storage updated with memory cache'))
          .catch(err => console.error('Failed to update storage:', err));
      }
    }).catch(err => {
      console.error('Error verifying keyword storage:', err);
    });
  } else {
    console.log('No keywords in memory for current task, checking storage');
    // Try to load from storage
    loadFromStorage(['taskKeywords']).then(data => {
      if (data.taskKeywords && data.taskKeywords[currentTask]) {
        console.log(`Found ${data.taskKeywords[currentTask].length} keywords in storage for current task`);
        // Update memory cache
        taskKeywordsCache = data.taskKeywords;
      } else {
        console.log('No keywords found in storage for current task');
      }
    }).catch(err => {
      console.error('Error checking storage for keywords:', err);
    });
  }
}

// Run storage verification periodically to ensure data integrity
setInterval(verifyKeywordStorage, 30000); // Check every 30 seconds

// ULTRA-FAST BLOCKING: Use webNavigation to block sites immediately upon navigation
// This runs before the page even starts loading content
// CHANGED: Switched to onBeforeNavigate for even faster blocking (before network request)
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  // Only check main frame navigations
  if (details.frameId !== 0) return;

  // Check if auto-close is enabled
  if (!RELEVANCE_CONFIG.autoCloseEnabled) return;

  // Check if we have an active task
  if (!currentTask) return;

  const url = details.url;

  // Check if URL is blacklisted
  if (isUrlBlacklisted(url)) {
    console.log(`[FAST BLOCK] Blacklisted site detected (onBeforeNavigate): ${url}`);

    // DISABLED ULTRA-FAST BLOCKING to allow "Checking Relevance" screen to appear
    // The content script will show the overlay, and then the standard relevance check
    // will trigger the close.
    /*
    console.log(`[ULTRA-FAST BLOCK] Closing blacklisted site immediately (onBeforeNavigate): ${url}`);
    
    // Close the tab immediately using the new immediate flag
    closeTabIfIrrelevant(details.tabId, true);
    */
  }
});

// UPDATE DYNAMIC RULES (DNR)
// This uses the browser's native blocking engine for maximum speed
async function updateBlockingRules() {
  // DISABLED DNR BLOCKING to allow "Checking Relevance" screen to appear
  // We always remove rules now so the page can load enough to show the overlay
  console.log('Disabling DNR blocking rules to allow Validity Screen');
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1], // We'll use ID 1 for our blacklist rule set
      addRules: []
    });
  } catch (error) {
    console.error('Error clearing DNR rules:', error);
  }
}

// KEEP-ALIVE MECHANISM
// Prevents the Service Worker from sleeping while a task is active
// This ensures instant reaction times (milliseconds) without startup latency
setInterval(() => {
  if (currentTask) {
    // Perform a trivial async operation to reset the idle timer
    chrome.storage.local.get(['lastTask'], () => {
      if (RELEVANCE_CONFIG.debugMode) {
        console.log('Keep-Alive Heartbeat: Service Worker is active');
      }
      // Ensure rules are active
      updateBlockingRules();
    });
  } else {
    // Ensure rules are inactive if no task
    updateBlockingRules();
  }
}, 20000); // Run every 20 seconds (standard idle timeout is ~30s)
