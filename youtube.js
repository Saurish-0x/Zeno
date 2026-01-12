// YouTube specific content script to hide irrelevant videos

// Keep track of the current task
let currentTask = '';
let taskKeywords = []; // AI-generated keywords from Gemini
let videoCheckQueue = [];
let isProcessingQueue = false;
let lastUrl = location.href; // Track URL changes to detect navigation
let isSearchPage = false; // Track if we're on a search page
let isChannelPage = false; // Track if we're on a channel page
let isShortsPage = false; // Track if we're on a Shorts page
let searchFilterEnabled = true; // Track if filtering is enabled for search pages
let channelFilterEnabled = true; // Track if filtering is enabled for channel pages

// Configuration for aggressive filtering
const CONFIG = {
  // Start processing immediately
  initialDelay: 50, // Increased from 10ms to 50ms to reduce CPU usage

  // Process batches less frequently
  processingDelay: 100, // Increased from 10ms to 100ms to reduce CPU usage

  // Process fewer videos at once
  batchSize: 40, // Increased from 20 to 40 for faster processing

  // Smaller initial batch for homepage
  initialBatchSize: 60, // Increased from 40 to 60

  // Smaller batch size for search pages
  searchPageBatchSize: 80, // Increased from 50 to 80

  // Strong blur effect
  blurAmount: '16px',

  // Lower opacity for more visible effect
  blurOpacity: '0.2',

  // With larger keyword sets, we can be more confident in local decisions
  localKeywordMatchThreshold: 1,

  // Show videos until proven irrelevant
  blurByDefault: true,

  // Configuration for large keyword sets
  largeKeywordSetSize: 200,
  largeKeywordSetMatchThreshold: 2,

  // Check less frequently for new videos
  processingInterval: 100, // Decreased from 200ms to 100ms for faster reaction

  // Viewport buffer (px above/below visible area to consider "visible")
  viewportBuffer: 500, // Reduced from 800px to 500px to focus more on what's actually visible

  // Minimum time between notifications (ms)
  notificationThrottle: 3000, // New setting to prevent notification spam

  // Max visible videos to filter at once
  maxVisibleVideos: 15 // New setting to limit how many videos are processed at once
};

// Counter for local vs API decisions
const STATS = {
  localDecisions: 0,
  apiCalls: 0,
  totalProcessed: 0,
  apiErrors: 0
};

// YouTube specific categories and keywords
const YOUTUBE_CATEGORIES = {
  EDUCATIONAL: [
    'tutorial', 'how to', 'learn', 'course', 'lecture', 'lesson', 'explanation', 'educational',
    'documentary', 'analysis', 'review', 'breakdown', 'summary', 'instruction', 'guide',
    'demonstration', 'tips', 'tricks', 'advice', 'study', 'teach', 'training', 'university',
    'educational', 'education', 'academic', 'science', 'history', 'math', 'physics', 'chemistry',
    'biology', 'programming', 'coding', 'development', 'software', 'engineering', 'technology',
    'introduction', 'beginner', 'advanced', 'masterclass', 'complete', 'comprehensive', 'in-depth'
  ],
  ENTERTAINMENT: [
    'funny', 'comedy', 'prank', 'challenge', 'reaction', 'meme', 'entertainment', 'music video',
    'gameplay', 'gaming', 'vlog', 'haul', 'unboxing', 'storytime', 'mukbang', 'asmr',
    'compilation', 'highlight', 'trailer', 'teaser', 'review', 'reaction', 'podcast', 'interview',
    'music', 'song', 'dance', 'singing', 'concert', 'live performance', 'top 10', 'countdown',
    'best of', 'worst of', 'fails', 'win', 'try not to laugh', 'satisfying', 'oddly satisfying',
    'life hack', 'DIY', 'do it yourself', 'experiment', 'shorts', 'animation', 'cartoon'
  ],
  DISTRACTING: [
    'prank', 'funny', 'fail', 'epic', 'react', 'drama', 'scandal', 'shocking', 'secret',
    'exposed', 'clickbait', 'gone wrong', 'insane', 'cringe', 'fight', 'crazy', 'intense',
    'extreme', 'viral', 'challenge', 'trend', 'hype', 'drama', 'controversy', 'reaction',
    'caught on camera', 'you won\'t believe', 'unbelievable', 'cops called', 'arrested',
    'gone sexual', 'prank call', 'social experiment', 'fidget spinner', 'try not to laugh',
    'savage', 'roast', 'destroyed', 'owned', 'trolling', 'rage', 'screaming', 'freakout',
    'public', 'embarrassing', 'shameful', 'exposed', 'celebrity', 'gossip', 'tea', 'drama',
    'storytime', 'story time', 'mukbang', 'eating show', 'food challenge', 'most expensive',
    'gold', 'diamond', 'billionaire', 'mansion', 'luxury', 'rich', 'lamborghini', 'ferrari'
  ],
  PRODUCTIVITY: [
    'productivity', 'effective', 'efficient', 'tips', 'tricks', 'hack', 'workflow', 'strategy',
    'organize', 'organization', 'planner', 'planning', 'schedule', 'time management', 'focus',
    'deep work', 'concentrate', 'concentration', 'pomodoro', 'method', 'technique', 'system',
    'habits', 'routine', 'morning routine', 'night routine', 'work', 'office', 'desk', 'setup'
  ]
};

// Initialize when page is ready
initialize();
window.addEventListener('load', initialize);

// Initialize the script
function initialize() {
  // Only initialize once
  if (document.body.hasAttribute('data-neod-initialized')) {
    return;
  }
  document.body.setAttribute('data-neod-initialized', 'true');

  console.log('YouTube filter script initializing - V4 (Show until proven irrelevant)');
  injectStyles();

  // Add immediate search detection
  setupEarlySearchDetection();

  // Get API key and current task from background script
  chrome.runtime.sendMessage({ action: 'getTaskAndApiKey' }, response => {
    if (!response) {
      console.log('No response from background for initial task/API key');
      return;
    }

    if (chrome.runtime.lastError) {
      console.error('Error getting task/API key:', chrome.runtime.lastError.message);
      return;
    }

    if (response && response.task) {
      currentTask = response.task;
      console.log('Initial task:', currentTask);

      // Load user preference for search filtering
      loadSearchFilterPreference(() => {
        // Update page type detection
        updatePageDetection();

        // Get any AI-generated keywords for this task
        loadKeywordsForTask(currentTask, () => {
          if (currentTask) {
            // Apply initial filtering
            notifyStatus('filteringEnabled');

            // Set up observers and event handlers
            observeYouTubeContent();
            setupScrollHandler();
            setupNavigationDetection();
            setupPeriodicChecks();

            // Check if we're on a search page and respect filter preference
            if (isSearchPage && !searchFilterEnabled) {
              console.log('On search page with filtering disabled - showing all videos');
              notifyStatus('filteringDisabled');
              forceRemoveAllFilters();
            }
            // Check if we're on a channel page and respect filter preference
            else if (isChannelPage && !channelFilterEnabled) {
              console.log('On channel page with filtering disabled - showing all videos');
              notifyStatus('filteringDisabled');
              forceRemoveAllFilters();
            }
            else {
              // Start filtering immediately with high priority
              filterVideosAggressively(true);

              // Force check for channel pages specifically
              if (isChannelPage && channelFilterEnabled) {
                console.log('Detected channel page - forcing aggressive filtering');
                setTimeout(() => {
                  // Get all video elements specific to channel pages
                  const channelVideos = document.querySelectorAll([
                    'ytd-grid-video-renderer',
                    'ytd-rich-item-renderer',
                    'ytd-video-renderer'
                  ].join(', '));

                  if (channelVideos.length > 0) {
                    console.log(`Found ${channelVideos.length} videos on channel page - processing now`);
                    Array.from(channelVideos).forEach(video => {
                      if (!video.hasAttribute('data-relevance-checked')) {
                        checkVideoRelevance(video);
                      }
                    });
                  }
                }, 1000);
              }
            }
          }
        });
      });
    } else {
      console.log('No initial task set.');
    }
  });

  // Listen for tasks updates
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'taskUpdated') {
      currentTask = request.task;
      console.log('Task updated:', currentTask);

      // Load AI-generated keywords for this task
      loadKeywordsForTask(currentTask, () => {
        if (currentTask) {
          // Mark all videos as unchecked
          resetAllVideoChecks();

          notifyStatus('taskUpdated');

          // Reset stats
          STATS.localDecisions = 0;
          STATS.apiCalls = 0;
          STATS.totalProcessed = 0;
          STATS.apiErrors = 0;

          // Update page type detection
          updatePageDetection();

          // Check if we're on a search page and respect filter preference
          if (isSearchPage && !searchFilterEnabled) {
            console.log('On search page with filtering disabled - showing all videos');
            notifyStatus('filteringDisabled');
            forceRemoveAllFilters();
          }
          // Check if we're on a channel page and respect filter preference
          else if (isChannelPage && !channelFilterEnabled) {
            console.log('On channel page with filtering disabled - showing all videos');
            notifyStatus('filteringDisabled');
            forceRemoveAllFilters();
          }
          else {
            // Use setTimeout to avoid blocking
            setTimeout(filterVideosAggressively, 100);
          }
        } else {
          // If task is cleared, remove all blurs and overlays
          removeAllBlursAndOverlays();
        }
        sendResponse({ success: true });
      });
    }
    // Listen for search filter preference updates from popup
    else if (request.action === 'updateSearchFilterPreference') {
      const previousSetting = searchFilterEnabled;
      searchFilterEnabled = request.enabled;
      console.log(`Search filter preference updated from popup: ${searchFilterEnabled ? 'enabled' : 'disabled'}`);

      // If on search page, apply the change immediately and reload the page
      if (isSearchPage) {
        if (previousSetting !== searchFilterEnabled) {
          if (searchFilterEnabled) {
            notifyStatus('filteringEnabled');
            setTimeout(filterVideosAggressively, 100);
          } else {
            notifyStatus('filteringDisabled');
            forceRemoveAllFilters();
          }

          // Let the popup know we're reloading to update the UI
          sendResponse({ reloading: true });
        } else {
          sendResponse({ reloading: false });
        }
      } else {
        sendResponse({ reloading: false });
      }
    }
    // Listen for channel filter preference updates from popup
    else if (request.action === 'updateChannelFilterPreference') {
      const previousSetting = channelFilterEnabled;
      channelFilterEnabled = request.enabled;
      console.log(`Channel filter preference updated from popup: ${channelFilterEnabled ? 'enabled' : 'disabled'}`);

      // If on channel page, apply the change immediately
      if (isChannelPage) {
        if (previousSetting !== channelFilterEnabled) {
          if (channelFilterEnabled) {
            notifyStatus('filteringEnabled');
            setTimeout(filterVideosAggressively, 100);
          } else {
            notifyStatus('filteringDisabled');
            forceRemoveAllFilters();
          }

          // Let the popup know we're reloading to update the UI
          sendResponse({ reloading: true });
        } else {
          sendResponse({ reloading: false });
        }
      } else {
        sendResponse({ reloading: false });
      }
    }

    return true; // Keep the message channel open for async response
  });
}

// Load user preference for search filtering
function loadSearchFilterPreference(callback) {
  chrome.storage.local.get(['searchFilterEnabled'], function (result) {
    if (result.hasOwnProperty('searchFilterEnabled')) {
      searchFilterEnabled = result.searchFilterEnabled;
      console.log(`Loaded search filter preference: ${searchFilterEnabled ? 'enabled' : 'disabled'}`);
    } else {
      // Default to enabled if not set
      searchFilterEnabled = true;
      chrome.storage.local.set({ searchFilterEnabled: true });
    }

    // Load channel filter preference after loading search filter preference
    loadChannelFilterPreference(callback);
  });
}

// Load channel filter preference from storage
function loadChannelFilterPreference(callback) {
  chrome.storage.local.get(['channelFilterEnabled'], function (result) {
    if (result.hasOwnProperty('channelFilterEnabled')) {
      channelFilterEnabled = result.channelFilterEnabled;
      console.log(`Loaded channel filter preference: ${channelFilterEnabled ? 'enabled' : 'disabled'}`);
    } else {
      // Default to enabled if not set
      channelFilterEnabled = true;
      chrome.storage.local.set({ channelFilterEnabled: true });
    }

    if (callback) callback();
  });
}

// Set up detection for YouTube SPA navigation
function setupNavigationDetection() {
  // Create mutation observer to detect URL changes in YouTube SPA
  const observer = new MutationObserver(mutations => {
    // Check for URL changes
    if (location.href !== lastUrl) {
      console.log('URL changed from', lastUrl, 'to', location.href);

      // Save previous page types
      const wasSearchPage = isSearchPage;
      const wasChannelPage = isChannelPage;

      // Update detection of page types
      updatePageDetection();

      // Pre-emptively apply blur to all videos during navigation to prevent flashing
      if (currentTask && searchFilterEnabled && location.href.includes('/results?search_query=')) {
        console.log('Search page transition detected - applying pre-emptive blur');

        // Apply temporary blur to all videos until proper filtering can be applied
        const allVideos = document.querySelectorAll([
          'ytd-video-renderer',
          'ytd-grid-video-renderer',
          'ytd-rich-item-renderer'
        ].join(', '));

        // Apply temporary class to all videos
        Array.from(allVideos).forEach(video => {
          // Only apply to videos that haven't been checked yet
          if (!video.hasAttribute('data-relevance-checked')) {
            video.classList.add('neod-checking');
          }
        });

        // Apply immediate filtering with highest priority
        setTimeout(() => {
          if (searchFilterEnabled) {
            filterVideosAggressively(true);
          } else {
            forceRemoveAllFilters();
          }
        }, 10);
      }

      // Handle changes between different types of pages
      if (isSearchPage) {
        console.log('Detected navigation to search page');
        if (!searchFilterEnabled) {
          console.log('Search filtering disabled - showing all videos');
          notifyStatus('filteringDisabled');
          forceRemoveAllFilters();
        } else {
          console.log('Search filtering enabled - will check videos');
          resetAllVideoChecks();
          notifyStatus('filteringEnabled');
          setTimeout(filterVideosAggressively, 100);
        }
      }
      else if (isChannelPage) {
        console.log('Detected navigation to channel page');
        if (!channelFilterEnabled) {
          console.log('Channel filtering disabled - showing all videos');
          notifyStatus('filteringDisabled');
          forceRemoveAllFilters();
        } else {
          console.log('Channel filtering enabled - will check videos');
          resetAllVideoChecks();
          notifyStatus('filteringEnabled');
          setTimeout(filterVideosAggressively, 100);
        }
      }
      else {
        // Navigation to home, watch, or other page
        console.log('Detected navigation to other YouTube page');
        resetAllVideoChecks();
        setTimeout(filterVideosAggressively, 100);
      }

      // Update last URL
      lastUrl = location.href;
    }
  });

  // Start observing changes to the document
  observer.observe(document, { subtree: true, childList: true });
  console.log('Navigation detection set up');

  // Also listen for 'yt-navigate-start' event which fires before navigation
  document.addEventListener('yt-navigate-start', function (event) {
    // This event fires earlier than URL changes
    console.log('YouTube navigation starting');

    // If navigating to search page, pre-blur everything
    const targetUrl = event.detail?.endpoint?.commandMetadata?.webCommandMetadata?.url;
    if (targetUrl && targetUrl.includes('/results?search_query=') && searchFilterEnabled) {
      // Apply temporary blur to all videos until proper filtering can be applied
      const allVideos = document.querySelectorAll([
        'ytd-video-renderer',
        'ytd-grid-video-renderer',
        'ytd-rich-item-renderer'
      ].join(', '));

      console.log('Pre-emptive blur during navigation to search page');
      Array.from(allVideos).forEach(video => {
        video.classList.add('neod-checking');
      });
    }
  });

  // Also watch for navigation events directly
  window.addEventListener('beforeunload', function () {
    console.log('Page about to unload - applying temporary blur');

    // Apply temporary class to all videos
    const allVideos = document.querySelectorAll([
      'ytd-video-renderer',
      'ytd-grid-video-renderer',
      'ytd-rich-item-renderer'
    ].join(', '));

    Array.from(allVideos).forEach(video => {
      video.classList.add('neod-checking');
    });
  });
}

// New function to specifically target and process search results immediately
function processSearchResultsAggressively() {
  if (!currentTask || !isSearchPage || !searchFilterEnabled) return;

  console.log('Processing search results with ultra aggressive settings');

  // Target search result videos specifically
  const searchResults = document.querySelectorAll('ytd-video-renderer, ytd-grid-video-renderer');
  if (searchResults.length === 0) {
    console.log('No search result videos found yet');
    return;
  }

  console.log(`Found ${searchResults.length} search result videos`);

  // Process a larger batch size for search results and prioritize visible ones
  const batchSize = CONFIG.searchPageBatchSize;

  // Create a new priority queue just for these search results
  const searchVideoQueue = Array.from(searchResults).filter(video =>
    // ENHANCED: Skip videos already marked as relevant to prevent re-blurring
    !video.hasAttribute('data-relevance-checked') ||
    (video.getAttribute('data-relevance-checked') !== 'true' &&
      video.getAttribute('data-relevance-checked') !== 'user-revealed')
  );

  // If nothing to process, exit early
  if (searchVideoQueue.length === 0) {
    console.log('All search results already checked');
    return;
  }

  console.log(`Processing ${searchVideoQueue.length} unchecked search results`);
  // Only notify if there are many videos to process
  if (searchVideoQueue.length > 10) {
    notifyStatus('checkingVideos', searchVideoQueue.length);
  }

  // Process them in parallel with maximum speed
  const promises = searchVideoQueue.slice(0, batchSize).map(videoElement => {
    return new Promise(async (resolve) => {
      try {
        await checkVideoRelevance(videoElement);
      } catch (error) {
        console.error('Error checking search result relevance:', error);
      }
      resolve();
    });
  });

  // Wait for all to complete
  Promise.all(promises).then(() => {
    console.log('Finished processing search results batch');

    // Check if there are any videos left unchecked
    const remainingUnchecked = document.querySelectorAll('ytd-video-renderer:not([data-relevance-checked]), ytd-grid-video-renderer:not([data-relevance-checked])');
    if (remainingUnchecked.length > 0) {
      console.log(`Still have ${remainingUnchecked.length} unchecked search results - processing again`);
      setTimeout(processSearchResultsAggressively, 100);
    }
  });
}

// Filter all videos on the page
function filterVideos(isInitialLoad = false, useMaxBatch = false) {
  if (!currentTask) return;

  // Update page type detection to ensure we have current state
  updatePageDetection();

  // Skip filtering on search pages if disabled
  if (isSearchPage && !searchFilterEnabled) {
    console.log('Filtering skipped: on search page with filtering disabled');
    forceRemoveAllFilters(); // Ensure all videos are visible
    return;
  }

  // Skip filtering on channel pages if disabled
  if (isChannelPage && !channelFilterEnabled) {
    console.log('Filtering skipped: on channel page with filtering disabled');
    forceRemoveAllFilters(); // Ensure all videos are visible
    return;
  }

  videoCheckQueue = []; // Clear queue before repopulating

  // Get all videos that haven't been checked yet
  const allUncheckedVideos = Array.from(getUncheckedVideoElements());

  // If no unchecked videos, don't proceed further
  if (allUncheckedVideos.length === 0) {
    return;
  }

  // Find visible videos (prioritize these) with improved viewport detection
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const buffer = CONFIG.viewportBuffer;

  const visibleVideos = allUncheckedVideos.filter(el => {
    const rect = el.getBoundingClientRect();
    // Element is in or near viewport
    return (rect.top < viewportHeight + buffer && rect.bottom > -buffer);
  });

  // Limit visible videos to reduce processing
  const limitedVisibleVideos = visibleVideos.slice(0, CONFIG.maxVisibleVideos);

  // Only process a small batch of non-visible videos if this is initial load
  let nonVisibleVideosToProcess = [];
  if (isInitialLoad || useMaxBatch) {
    const remainingSlots = CONFIG.batchSize - limitedVisibleVideos.length;
    if (remainingSlots > 0) {
      const nonVisibleVideos = allUncheckedVideos.filter(v => !visibleVideos.includes(v));
      nonVisibleVideosToProcess = nonVisibleVideos.slice(0, remainingSlots);
    }
  }

  // Build the queue, prioritizing visible videos
  videoCheckQueue = [...limitedVisibleVideos, ...nonVisibleVideosToProcess];

  // If we have videos to process, start processing
  if (videoCheckQueue.length > 0) {
    if (!isProcessingQueue) {
      // Only show notification for larger batches or initial load
      if (videoCheckQueue.length > 5 || isInitialLoad) {
        const visibleCount = limitedVisibleVideos.length;
        const totalCount = videoCheckQueue.length;

        if (visibleCount === totalCount) {
          notifyStatus('checkingVideos', visibleCount);
        } else {
          // Less frequent notification with more information
          if (totalCount > 10) {
            notifyStatus('checkingVideos', totalCount);
          }
        }
      }
      processVideoQueue(isInitialLoad);
    }
  } else if (isInitialLoad) {
    console.log("No new videos found for relevance checking.");
  }
}

// Process videos in queue with rate limiting
async function processVideoQueue(isFirstBatch = false) {
  if (isProcessingQueue || videoCheckQueue.length === 0 || !currentTask) return;

  isProcessingQueue = true;

  // Take smaller batches to process at a time
  const maxBatchSize = isFirstBatch ?
    Math.min(CONFIG.initialBatchSize, 20) :
    Math.min(CONFIG.batchSize, 10);

  const currentBatch = videoCheckQueue.splice(0, maxBatchSize);

  // Only log if we're processing a significant number of videos
  if (currentBatch.length > 3) {
    console.log(`Processing batch of ${currentBatch.length} videos`);
  }

  // Use a memory-efficient approach: process in series instead of all parallel
  // This dramatically reduces RAM usage while being almost as fast
  const batchPromises = [];

  // Process videos in smaller concurrent chunks to reduce memory pressure
  const chunkSize = 3; // Process 3 videos at a time max

  for (let i = 0; i < currentBatch.length; i += chunkSize) {
    const chunk = currentBatch.slice(i, i + chunkSize);

    // Process this small chunk in parallel
    const chunkPromise = Promise.all(
      chunk.map(videoElement =>
        new Promise(async (resolve) => {
          try {
            await checkVideoRelevance(videoElement);
          } catch (error) {
            console.error('Error checking video relevance:', error);
          }
          resolve();
        })
      )
    );

    batchPromises.push(chunkPromise);

    // Add a small delay between chunks to give browser UI time to respond
    if (i + chunkSize < currentBatch.length) {
      batchPromises.push(new Promise(resolve => setTimeout(resolve, 10)));
    }
  }

  // Wait for all chunks to be processed
  await Promise.all(batchPromises);

  // All videos in this batch processed
  isProcessingQueue = false;

  // If there are more videos to process, continue after a delay
  if (videoCheckQueue.length > 0) {
    setTimeout(processVideoQueue, CONFIG.processingDelay);
  } else {
    // Only log stats for larger batches
    if (currentBatch.length > 5) {
      console.log(`Filter stats: ${STATS.localDecisions} local decisions, ${STATS.apiCalls} API calls (${STATS.totalProcessed} total)`);
    }
  }
}

// Show a temporary notification
let lastNotificationTime = 0; // Track when the last notification was shown
let lastNotificationMessage = ''; // Track the last notification message
let notificationQueue = []; // Queue for pending notifications
let isNotificationVisible = false; // Track if a notification is currently visible
let notificationTimeoutId = null; // To track and clear notification timeouts

function showNotification(message, duration = 3000, priority = 'normal') {
  // Check if this is a duplicate notification (same message within 5 seconds)
  const now = Date.now();
  if (message === lastNotificationMessage && now - lastNotificationTime < 5000) {
    console.log(`Duplicate notification suppressed: ${message}`);
    return;
  }

  // Filter out low-priority notifications if too frequent
  if (priority === 'low' && now - lastNotificationTime < CONFIG.notificationThrottle * 2) {
    console.log(`Low priority notification throttled: ${message}`);
    return;
  }

  // For normal priority, use standard throttling
  if (priority === 'normal' && now - lastNotificationTime < CONFIG.notificationThrottle) {
    // Instead of showing immediately, queue it
    notificationQueue.push({ message, duration, priority });
    console.log(`Notification queued: ${message}`);
    return;
  }

  // Always allow high priority notifications
  if (priority === 'high' || !isNotificationVisible) {
    // If another notification is showing, clear it
    if (isNotificationVisible) {
      const existingNotification = document.getElementById('neod-youtube-notification');
      if (existingNotification) {
        existingNotification.remove();
      }

      if (notificationTimeoutId) {
        clearTimeout(notificationTimeoutId);
      }
    }

    // Update tracking variables
    lastNotificationTime = now;
    lastNotificationMessage = message;
    displayNotification(message, duration);
  } else {
    // Queue this notification
    notificationQueue.push({ message, duration, priority });
    console.log(`Notification queued during active notification: ${message}`);
  }
}

// Function to actually display the notification
function displayNotification(message, duration) {
  // Check if notification already exists
  let notification = document.getElementById('neod-youtube-notification');

  // If it exists, update text instead of creating new
  if (notification) {
    notification.textContent = message;
    isNotificationVisible = true;
    return;
  }

  // Create notification element
  notification = document.createElement('div');
  notification.id = 'neod-youtube-notification';
  notification.textContent = message;

  // Style the notification
  Object.assign(notification.style, {
    position: 'fixed',
    bottom: '70px',
    right: '20px',
    backgroundColor: 'rgba(33, 33, 33, 0.9)',
    color: '#fff',
    padding: '10px 15px',
    borderRadius: '6px',
    zIndex: '9999',
    fontSize: '14px',
    opacity: '0',
    transition: 'opacity 0.3s ease, transform 0.3s ease',
    transform: 'translateY(20px)',
    boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
    maxWidth: '300px',
    lineHeight: '1.4',
    border: '1px solid rgba(255,255,255,0.1)'
  });

  // Add to document
  document.body.appendChild(notification);

  // Force reflow for animation
  notification.offsetHeight;

  // Show with animation
  notification.style.opacity = '0.95';
  notification.style.transform = 'translateY(0)';

  isNotificationVisible = true;

  // Fade out after duration
  notificationTimeoutId = setTimeout(() => {
    if (notification.parentNode) {
      notification.style.opacity = '0';
      notification.style.transform = 'translateY(20px)';

      setTimeout(() => {
        // Only remove if it still exists
        if (notification.parentNode) {
          notification.remove();
          isNotificationVisible = false;

          // Process next notification in queue if any
          if (notificationQueue.length > 0) {
            const nextNotification = notificationQueue.shift();
            displayNotification(nextNotification.message, nextNotification.duration);
          }
        }
      }, 300); // Animation duration
    }
  }, duration);
}

// Simplified high-level notification function for important status updates
function notifyStatus(action, count = null) {
  let message = '';

  switch (action) {
    case 'taskUpdated':
      message = `Task updated: ${currentTask}`;
      showNotification(message, 2000, 'high');
      break;
    case 'filteringEnabled':
      message = 'Focus Mode enabled - checking videos for relevance';
      showNotification(message, 2000, 'high');
      break;
    case 'filteringDisabled':
      message = 'All videos visible';
      showNotification(message, 2000, 'high');
      break;
    case 'checkingVideos':
      message = count ? `Checking ${count} videos for relevance` : 'Checking videos for relevance';
      showNotification(message, 1500, 'low');
      break;
    case 'searchNavigation':
      message = 'Applying filters to search results...';
      showNotification(message, 1500, 'high');
      break;
    default:
      break;
  }
}

// Function to update detection of different page types
function updatePageDetection() {
  // Detect search page
  isSearchPage = location.href.includes('/results?search_query=');

  // Detect channel page (includes channels, playlists, user pages)
  isChannelPage = location.href.includes('/channel/') ||
    location.href.includes('/c/') ||
    location.href.includes('/user/') ||
    location.href.includes('/playlists') ||
    location.href.includes('/featured') ||
    location.href.includes('/videos') ||
    // Make channel detection more robust by checking for @ symbol more thoroughly
    location.href.includes('/@') ||
    // Additional checks for channel pages
    document.querySelector('ytd-channel-renderer, ytd-channel-about-metadata-renderer, ytd-browse[page-subtype="channels"]') !== null;

  // Detect shorts page
  isShortsPage = location.href.includes('/shorts/') ||
    location.href.includes('/hashtag/shorts');

  console.log(`Page detection: Search=${isSearchPage}, Channel=${isChannelPage}, Shorts=${isShortsPage}`);
}

// Function to apply pre-emptive blur immediately
function applyPreemptiveBlur() {
  if (!currentTask || !searchFilterEnabled) return;

  console.log('Search action detected - applying immediate blur');

  // Apply temporary blur to all visible videos
  const allVideos = document.querySelectorAll([
    'ytd-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-rich-item-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-shelf-renderer'
  ].join(', '));

  Array.from(allVideos).forEach(video => {
    video.classList.add('neod-checking');

    // Also add stronger direct styles for immediate effect
    const thumbnails = video.querySelectorAll('img, yt-image, #thumbnail, ytd-thumbnail');
    thumbnails.forEach(thumb => {
      thumb.style.filter = 'blur(8px)';
      thumb.style.opacity = '0.2';
    });

    const titles = video.querySelectorAll('#video-title, .title, yt-formatted-string#video-title');
    titles.forEach(title => {
      title.style.filter = 'blur(6px)';
      title.style.opacity = '0.3';
    });
  });

  // Use the simpler notification system
  notifyStatus('searchNavigation');
}

// Function to check if video content is related to sports
function isSportsRelated(title = '', description = '') {
  const lowerTitle = title.toLowerCase();
  const lowerDesc = description.toLowerCase();
  const combinedText = lowerTitle + ' ' + lowerDesc;

  // Sports-related keywords
  const sportsKeywords = [
    // General sports terms
    'sports', 'game', 'match', 'player', 'team', 'league', 'championship', 'tournament', 'highlights',
    'score', 'scores', 'scoring', 'play', 'plays', 'playing', 'vs', 'versus', 'competition',

    // Popular sports
    'football', 'soccer', 'nfl', 'basketball', 'nba', 'baseball', 'mlb', 'hockey', 'nhl',
    'tennis', 'golf', 'cricket', 'rugby', 'volleyball', 'boxing', 'mma', 'ufc',
    'wrestling', 'olympics', 'athletics', 'swimming', 'gymnastics',

    // Football specific
    'quarterback', 'touchdown', 'field goal', 'interception', 'tackle', 'fumble',
    'penalty', 'yard', 'yards', 'rushing', 'passing', 'kick', 'punt', 'goal',

    // Soccer specific
    'goal', 'kick', 'penalty', 'free kick', 'corner', 'offside', 'fifa', 'striker',
    'midfielder', 'defender', 'goalkeeper', 'goalie', 'premier league', 'la liga', 'bundesliga',

    // Teams and leagues (partial list)
    'manchester', 'liverpool', 'arsenal', 'chelsea', 'barcelona', 'madrid', 'juventus',
    'bayern', 'cowboys', 'patriots', 'lakers', 'celtics', 'yankees', 'world cup',
    'champions league', 'super bowl', 'nfl', 'nba', 'mlb', 'nhl', 'premier league'
  ];

  // Count how many sports keywords appear in title/description
  const matches = sportsKeywords.filter(word => combinedText.includes(word)).length;

  // If we have multiple sports keywords, consider it sports-related
  return matches >= 2;
}

// Check if content is obviously relevant/irrelevant without using API
function checkRelevanceLocally(title, task, description = '') {
  if (!title || !task) {
    // Without a title or task, default to irrelevant
    return { isDecisive: true, isRelevant: false };
  }

  const titleLower = title.toLowerCase();
  const taskLower = task.toLowerCase();
  const descLower = description.toLowerCase();

  // Use combined text for better matching (include description)
  const combinedText = titleLower + ' ' + descLower;
  const totalLength = combinedText.length;

  // Break into words for analysis
  const taskWords = taskLower.split(/\s+/).filter(word => word.length > 3);

  // Initialize Scoring
  let score = 0;
  const matches = [];

  // 1. Check for Sports (Special Case)
  // If task is NOT sports related, but video IS sports related -> Penalty
  if (isSportsRelated(title, description)) {
    const isTaskSports = taskLower.includes('sport') || taskLower.includes('football') ||
      taskLower.includes('soccer') || taskLower.includes('basketball') ||
      taskLower.includes('game') || taskLower.includes('match');

    if (!isTaskSports) {
      score -= 10; // Heavy penalty for sports content on non-sports task
      matches.push('Sports content penalty');
    }
  }

  // 2. Check Irrelevant Keywords (Weighted Penalty instead of Hard Block)
  const irrelevantKeywords = [
    // Entertainment & Distraction
    'funny', 'prank', 'reaction', 'meme', 'gossip', 'scandal', 'challenge',
    'crazy', 'insane', 'incredible', 'epic', 'amazing', 'shocking', 'unbelievable', 'viral',
    'top 10', 'top ten', 'ranked', 'compilation', 'fails', 'moments', 'caught on camera',
    'gone wrong', 'clickbait', 'drama', 'exposed', 'reveal', 'secret', 'leaked',
    // Social media related
    'influencer', 'celebrity', 'famous', 'trending', 'viral', 'tiktok', 'instagram',
    // Gaming related
    'gameplay', 'playthrough', 'walkthrough', 'stream', 'streaming', 'live', 'gaming',
    'gamer', 'fortnite', 'minecraft', 'roblox', 'among us', 'battle royale',
    // Entertainment formats
    'react', 'reacts', 'reacting', 'unboxing', // Removed 'review' as it can be educational
    'haul', 'shopping', 'try on', 'trying', 'testing', 'taste test', 'mukbang',
    'asmr', 'satisfying', 'relaxing', 'sleep', 'meditation',
    // Clickbait phrases
    'you won\'t believe', 'must see', 'watch this', 'mind blowing', 'changed my life',
    'never seen before', 'shocking truth', 'this happened', 'i can\'t believe',
    'gone sexual', 'police called', 'arrested', '3am', 'do not try',
    // Music video related
    'official video', 'official audio', 'music video', 'lyric video', 'concert',
    'live performance', 'behind the scenes', 'making of', 'dance', 'choreography'
  ];

  // Check for obviously irrelevant content
  irrelevantKeywords.forEach(word => {
    if (combinedText.includes(word)) {
      score -= 5; // Penalty for each irrelevant keyword
      matches.push(`Irrelevant: ${word}`);
    }
  });

  // 3. Check AI Keywords (Positive Score)
  let matchedChars = 0;
  if (taskKeywords.length > 0) {
    taskKeywords.forEach(keyword => {
      const kLower = keyword.toLowerCase();
      if (kLower.length < 3) return; // Skip short noise

      if (titleLower.includes(kLower)) {
        score += 3; // Title match is strong
        matchedChars += kLower.length;
        matches.push(`Title: ${keyword}`);
      } else if (descLower.includes(kLower)) {
        score += 1; // Description match is weaker
        matchedChars += kLower.length;
        matches.push(`Desc: ${keyword}`);
      }
    });
  }

  // 4. Check Task Words (Strong Positive Score)
  taskWords.forEach(word => {
    if (titleLower.includes(word)) {
      score += 5; // Very strong signal
      matchedChars += word.length;
      matches.push(`Task(Title): ${word}`);
    } else if (descLower.includes(word)) {
      score += 2;
      matchedChars += word.length;
      matches.push(`Task(Desc): ${word}`);
    }
  });

  // 5. Density Bonus (Percentage based)
  if (totalLength > 0) {
    const density = matchedChars / totalLength;
    if (density > 0.10) { // >10% of text is keywords
      score += 10;
      matches.push(`High Density (${(density * 100).toFixed(1)}%)`);
    } else if (density > 0.05) { // >5%
      score += 5;
      matches.push(`Med Density (${(density * 100).toFixed(1)}%)`);
    }
  }

  // 6. Educational Category Bonus
  const isEducational = YOUTUBE_CATEGORIES.EDUCATIONAL.some(term =>
    combinedText.includes(term)
  );
  if (isEducational) {
    score += 2;
    matches.push('Educational category');
  }

  console.log(`Local Check: "${title.substring(0, 30)}..." -> Score: ${score} (${matches.join(', ')})`);

  // Final Decision
  // If score is positive, it's likely relevant.
  // If score is negative, it's likely irrelevant.
  // If score is 0, we're unsure (but default to irrelevant for strictness, or relevant for leniency?)
  // User asked for "obvious videos" to be allowed, so let's be slightly lenient.

  if (score > 0) {
    return { isDecisive: true, isRelevant: true };
  } else if (score < -5) {
    // Only decisively block if it's clearly negative
    return { isDecisive: true, isRelevant: false };
  }

  // If score is between -5 and 0, it's ambiguous.
  // Previously we defaulted to irrelevant.
  // Let's stick to that for now unless it has at least one strong task match.
  return { isDecisive: true, isRelevant: false };
}

// Check if the video content is relevant to the task using the API
async function checkRelevance(videoInfo) {
  try {
    // Use the backend API to check relevance
    const response = await chrome.runtime.sendMessage({
      action: 'checkRelevance',
      url: 'youtube.com/video',
      task: currentTask,
      siteInfo: {
        title: videoInfo.title,
        siteName: 'YouTube',
        description: `${videoInfo.description} | Channel: ${videoInfo.channelName}`
      }
    });

    if (!response) {
      console.error('No response received from relevance check');
      return { isRelevant: true }; // Default to showing if error
    }

    // If we get an error response, show the video and track the error
    if (response.error) {
      console.warn('Relevance check returned error:', response.error);

      // Add error counter to stats if not already there
      if (STATS.apiErrors === undefined) {
        STATS.apiErrors = 0;
      }
      STATS.apiErrors++;

      // If we're getting too many errors, slow down processing
      if (STATS.apiErrors > 5) {
        CONFIG.processingDelay = Math.min(5000, CONFIG.processingDelay * 1.5);
        CONFIG.batchSize = Math.max(1, CONFIG.batchSize - 1);
        console.log(`Adjusting rate limits due to errors: delay=${CONFIG.processingDelay}ms, batch=${CONFIG.batchSize}`);
      }

      return { isRelevant: true }; // Default to showing the video
    }

    return response;
  } catch (error) {
    console.error('Error checking relevance:', error);
    // Default to showing the video if there's an error
    return { isRelevant: true };
  }
}

// Remove blur and mark video as relevant
function unblurRelevantVideo(videoElement) {
  if (!videoElement) return;

  // Mark as checked and relevant
  videoElement.setAttribute('data-relevance-checked', 'true');
  videoElement.classList.remove('neod-checking', 'neod-blurred-by-default');
  videoElement.classList.add('neod-relevant-video');

  // Remove all blur classes
  videoElement.querySelectorAll('.neod-blurred-thumbnail, .neod-blurred-text-title, .neod-blurred-text-meta').forEach(el => {
    el.classList.remove('neod-blurred-thumbnail', 'neod-blurred-text-title', 'neod-blurred-text-meta');

    // Also remove any inline styles that might have been applied
    el.style.filter = '';
    el.style.opacity = '';
    el.style.visibility = '';
    el.style.display = '';
  });

  // Ensure all text elements are visible
  videoElement.querySelectorAll('#video-title, .title, #metadata, .metadata, #text, .text-wrapper, #description, .description, yt-formatted-string').forEach(el => {
    el.style.opacity = '';
    el.style.visibility = '';
    el.style.display = '';
  });

  // Remove any overlay if present
  const overlay = videoElement.querySelector('.neod-irrelevant-overlay');
  if (overlay) overlay.remove();

  // Remove any barriers
  const barrier = videoElement.querySelector('.neod-block-barrier');
  if (barrier) barrier.remove();

  // Re-enable all links and clickable elements
  const allClickables = videoElement.querySelectorAll('a, .yt-simple-endpoint, [role="link"], [tabindex]');
  allClickables.forEach(el => {
    el.style.pointerEvents = '';
    el.removeAttribute('aria-disabled');
    el.style.cursor = '';
    el.style.zIndex = '';
  });
}

// Finalize an irrelevant video (add overlay, etc.)
function finalizeIrrelevantVideo(videoElement) {
  if (!videoElement) return;

  // Mark as checked but irrelevant
  videoElement.setAttribute('data-relevance-checked', 'false');
  videoElement.classList.remove('neod-checking');
  videoElement.classList.add('neod-blurred-by-default');

  // Ensure all thumbnails and links are blocked
  const links = videoElement.querySelectorAll('a, .yt-simple-endpoint, [role="link"]');
  links.forEach(link => {
    link.style.pointerEvents = 'none';
    link.setAttribute('aria-disabled', 'true');
    link.style.cursor = 'not-allowed';
  });

  // Make sure blur classes stay applied
  const thumbnails = videoElement.querySelectorAll('img, yt-image, #thumbnail, video');
  thumbnails.forEach(thumb => {
    if (!thumb.classList.contains('neod-blurred-thumbnail')) {
      thumb.classList.add('neod-blurred-thumbnail');
    }
  });

  // Enhanced text hiding for all text elements
  // This is especially important for titles, metadata and other text elements
  const allTextElements = videoElement.querySelectorAll([
    // Title elements
    '#video-title', '.title', 'yt-formatted-string#video-title', 'h3', 'a[title]',

    // Metadata and descriptions
    '#metadata', '.metadata', '#text', '.text-wrapper', '#description', '.description',

    // Channel and byline elements
    '#hashtag', '.hashtag', 'ytd-badge-supported-renderer', 'ytd-channel-name',
    '#channel-name', 'span.inline-metadata-item', '.byline', '#byline', '.details',

    // Any other text containers
    '.content', '.info', '.meta', '.stat', 'yt-formatted-string:not(.neod-reveal-btn)', 'span:not(.neod-reveal-btn)',

    // Time stamps and overlays
    'ytd-thumbnail-overlay-time-status-renderer', '.ytd-thumbnail-overlay-time-status-renderer',
    'ytd-video-meta-block'
  ].join(', '));

  allTextElements.forEach(el => {
    // Multiple approaches to ensure text is properly hidden
    el.style.opacity = '0';
    el.style.visibility = 'hidden';
    el.style.display = 'none';

    // Add appropriate blur class based on element type
    if (el.matches('#video-title, .title, h3')) {
      el.classList.add('neod-blurred-text-title');
    } else {
      el.classList.add('neod-blurred-text-meta');
    }
  });

  // For Shorts videos, we need to handle the adjacent title elements
  if (isShortVideo(videoElement)) {
    hideShortsTitles(videoElement);
  }

  // Add overlay to explain why it's blurred
  addOverlayToVideo(videoElement);

  // For channel pages, ensure parent containers are also properly handled
  if (isChannelPage) {
    // Find parent containers that might contain text elements
    const parentContainers = [
      videoElement.parentElement,
      videoElement.closest('ytd-grid-renderer'),
      videoElement.closest('ytd-rich-grid-row')
    ].filter(Boolean); // Filter out null/undefined

    parentContainers.forEach(container => {
      // Look for text elements that might be outside the video element itself
      const textElements = container.querySelectorAll('#video-title, .title, #metadata, .metadata, #text:not(.neod-irrelevant-overlay *)');
      textElements.forEach(el => {
        // Skip elements that are children of the overlay
        if (el.closest('.neod-irrelevant-overlay')) return;

        // Check if this text element belongs to our video
        // This is a bit heuristic but helps with channel pages
        const videoParent = el.closest('ytd-grid-video-renderer, ytd-rich-item-renderer, ytd-video-renderer');
        if (videoParent === videoElement || !videoParent) {
          el.style.opacity = '0';
          el.style.visibility = 'hidden';
          el.style.display = 'none';
        }
      });
    });
  }
}

// Check if an element is a Short video
function isShortVideo(element) {
  // Check if it's a shorts element or in the shorts container
  return element.matches('ytd-reel-video-renderer, ytd-shorts, ytd-shorts-video-renderer, ytd-reel-item-renderer') ||
    element.closest('ytd-shorts, #shorts-container, #reel-feed') !== null ||
    element.closest('ytd-rich-grid-slim-media, ytd-rich-grid-media') !== null;
}

// Aggressively hide titles for Shorts videos by finding siblings and parent's children
function hideShortsTitles(videoElement) {
  // Find all siblings of the video element
  let siblings = [];
  let nextSibling = videoElement.nextElementSibling;

  // Get the next 5 siblings to ensure we capture titles
  for (let i = 0; i < 5 && nextSibling; i++) {
    siblings.push(nextSibling);
    nextSibling = nextSibling.nextElementSibling;
  }

  // Also get parent's children that might contain titles
  let parent = videoElement.parentElement;
  if (parent) {
    Array.from(parent.children).forEach(child => {
      // Skip the video element itself
      if (child !== videoElement && !siblings.includes(child)) {
        siblings.push(child);
      }
    });

    // Also try parent's parent for grid layouts
    let grandparent = parent.parentElement;
    if (grandparent) {
      Array.from(grandparent.querySelectorAll('#details, #meta, .meta, .details, .metadata, #metadata, #video-title, .title, #text-container, yt-formatted-string')).forEach(element => {
        siblings.push(element);
      });
    }
  }

  // Hide all potential title containers and text elements
  siblings.forEach(sibling => {
    if (sibling) {
      // Hide the element itself
      sibling.style.opacity = '0';
      sibling.style.visibility = 'hidden';
      sibling.style.display = 'none';

      // Also hide all text elements inside
      const textElements = sibling.querySelectorAll('span, a, yt-formatted-string, #text, .text, #title, .title, #video-title');
      textElements.forEach(el => {
        el.style.opacity = '0';
        el.style.visibility = 'hidden';
        el.style.display = 'none';
      });
    }
  });

  // As a last resort, try to find any text elements outside our normal hierarchy
  const container = videoElement.closest('ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-rich-grid-media, ytd-rich-grid-slim-media');
  if (container) {
    const allTextElements = container.querySelectorAll('#video-title, .title, yt-formatted-string, a[title], span, #metadata, .metadata, #text, .text, #details, .details');
    allTextElements.forEach(el => {
      el.style.opacity = '0';
      el.style.visibility = 'hidden';
      el.style.display = 'none';
    });
  }
}

// Add overlay to video that was deemed irrelevant
function addOverlayToVideo(videoElement) {
  // Check if overlay already exists
  if (videoElement.querySelector('.neod-irrelevant-overlay')) return;

  // Add an overlay with explanation
  const overlay = document.createElement('div');
  overlay.className = 'neod-irrelevant-overlay';
  overlay.innerHTML = '<span>Not relevant to your current task</span>';

  // Add action button to reveal if needed
  const revealBtn = document.createElement('button');
  revealBtn.className = 'neod-reveal-btn';
  revealBtn.textContent = 'Show anyway';

  // Disable all existing click events on the video
  const existingClickables = videoElement.querySelectorAll('a, button, [role="button"], [tabindex]');
  existingClickables.forEach(el => {
    el.style.pointerEvents = 'none';
    el.setAttribute('aria-disabled', 'true');
    el.style.cursor = 'not-allowed';
  });

  // Use capture phase to ensure we get the click before other handlers
  revealBtn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();

    // Unblur the video when user chooses to reveal it
    unblurRelevantVideo(videoElement);

    // Mark as user-revealed
    videoElement.setAttribute('data-relevance-checked', 'user-revealed');
  }, true);

  // Make the overlay block all other events
  overlay.addEventListener('click', function (e) {
    // Only allow clicks on the button to pass through
    if (e.target !== revealBtn) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // Make the overlay capture and block all interactions
  overlay.addEventListener('mousedown', e => {
    if (e.target !== revealBtn) e.stopPropagation();
  }, true);
  overlay.addEventListener('mouseup', e => {
    if (e.target !== revealBtn) e.stopPropagation();
  }, true);
  overlay.addEventListener('touchstart', e => {
    if (e.target !== revealBtn) e.stopPropagation();
  }, true);
  overlay.addEventListener('touchend', e => {
    if (e.target !== revealBtn) e.stopPropagation();
  }, true);

  // Style the overlay with direct styles for immediate effect
  Object.assign(overlay.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
    zIndex: '1000',
    pointerEvents: 'auto'
  });

  overlay.appendChild(revealBtn);
  videoElement.appendChild(overlay);
}

// Remove all blur effects and reset video state
function removeAllBlursAndOverlays() {
  // If search filtering is disabled on a search page, use the force method
  if (isSearchPage && !searchFilterEnabled) {
    forceRemoveAllFilters();
    return;
  }

  // If channel filtering is disabled on a channel page, use the force method
  if (isChannelPage && !channelFilterEnabled) {
    forceRemoveAllFilters();
    return;
  }

  // Remove all blurs and overlays
  document.querySelectorAll('.neod-blurred-by-default, .neod-checking, .neod-relevant-video').forEach(video => {
    // Remove all applied classes
    video.classList.remove('neod-blurred-by-default', 'neod-checking', 'neod-relevant-video');

    // Remove relevance checked attribute
    video.removeAttribute('data-relevance-checked');

    // Remove all blur classes from child elements
    video.querySelectorAll('.neod-blurred-thumbnail, .neod-blurred-text-title, .neod-blurred-text-meta').forEach(el => {
      el.classList.remove('neod-blurred-thumbnail', 'neod-blurred-text-title', 'neod-blurred-text-meta');
    });

    // Remove any overlays
    const overlay = video.querySelector('.neod-irrelevant-overlay');
    if (overlay) overlay.remove();

    // Remove any barriers
    const barrier = video.querySelector('.neod-block-barrier');
    if (barrier) barrier.remove();
  });

  console.log('Reset all video blur states');
}

// New function to forcefully remove all filters and show all videos without re-checking
function forceRemoveAllFilters() {
  console.log('Forcefully removing all filters and showing all videos');

  // First, stop any ongoing filtering by clearing the queue
  videoCheckQueue = [];
  isProcessingQueue = false;

  // Get ALL video elements, including those already checked
  const allVideos = document.querySelectorAll([
    'ytd-rich-item-renderer',
    'ytd-grid-video-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-reel-item-renderer',
    'ytd-shorts',
    'ytd-reel-video-renderer',
    'ytd-shorts-video-renderer',
    'ytd-playlist-video-renderer',
    'ytd-playlist-panel-video-renderer',
    'ytd-watch-card-compact-video-renderer',
    'ytd-channel-video-renderer',
    'ytd-mini-guide-entry-renderer',
    'ytd-video-preview'
  ].join(', '));

  console.log(`Found ${allVideos.length} videos to unblur`);

  // Immediately process all videos to remove any filters
  Array.from(allVideos).forEach(video => {
    // Force mark as relevant to ensure no re-checking
    video.setAttribute('data-relevance-checked', 'true');
    video.classList.remove('neod-checking');
    video.classList.remove('neod-blurred-by-default');
    video.classList.add('neod-relevant-video');

    // Remove all blur classes
    const blurredElements = video.querySelectorAll('.neod-blurred-thumbnail, .neod-blurred-text-title, .neod-blurred-text-meta');
    blurredElements.forEach(el => {
      el.classList.remove('neod-blurred-thumbnail', 'neod-blurred-text-title', 'neod-blurred-text-meta');

      // Also remove any inline styles that might be causing issues
      el.style.filter = '';
      el.style.opacity = '';
      el.style.pointerEvents = '';
    });

    // Also check and restore visibility to all text elements (titles, metadata, etc.)
    const textElements = video.querySelectorAll('#video-title, .title, #metadata, .metadata, #text, .text-wrapper, #description, .description, #hashtag, .hashtag, ytd-badge-supported-renderer, ytd-channel-name, #channel-name, span.inline-metadata-item, .byline, #byline, .details');
    textElements.forEach(el => {
      el.style.opacity = '';
      el.style.visibility = '';
      el.style.display = '';
    });

    // Remove any overlays
    const overlay = video.querySelector('.neod-irrelevant-overlay');
    if (overlay) overlay.remove();

    // Remove any barriers
    const barrier = video.querySelector('.neod-block-barrier');
    if (barrier) barrier.remove();

    // Re-enable all links and clickable elements
    const allClickables = video.querySelectorAll('a, .yt-simple-endpoint, [role="link"], [tabindex]');
    allClickables.forEach(el => {
      el.style.pointerEvents = 'auto';
      el.removeAttribute('aria-disabled');
      el.style.cursor = '';
      el.style.zIndex = '';
    });

    // Make sure hover elements are re-enabled
    const hoverElements = video.querySelectorAll('#hover-overlays, .hover-overlays, #mouseover-overlay, .mouseover-overlay');
    hoverElements.forEach(el => {
      el.style.display = '';
      el.style.opacity = '';
      el.style.visibility = '';
      el.style.pointerEvents = '';
    });
  });

  // Set up an interval to catch any new videos that might appear immediately after
  let checkCount = 0;
  const maxChecks = 5;
  const checkInterval = setInterval(() => {
    if (checkCount >= maxChecks) {
      clearInterval(checkInterval);
      return;
    }

    checkCount++;

    // Find any videos that still have blur classes or aren't marked as relevant
    const stillBlurredVideos = document.querySelectorAll([
      '.neod-blurred-by-default',
      '.neod-checking',
      'ytd-rich-item-renderer:not([data-relevance-checked="true"])',
      'ytd-video-renderer:not([data-relevance-checked="true"])',
      'ytd-grid-video-renderer:not([data-relevance-checked="true"])'
    ].join(', '));

    if (stillBlurredVideos.length > 0) {
      console.log(`Found ${stillBlurredVideos.length} videos still blurred in follow-up check`);

      Array.from(stillBlurredVideos).forEach(video => {
        // Force mark as relevant
        video.setAttribute('data-relevance-checked', 'true');
        video.classList.remove('neod-checking');
        video.classList.remove('neod-blurred-by-default');
        video.classList.add('neod-relevant-video');

        // Remove all blur-related classes from child elements
        video.querySelectorAll('*').forEach(el => {
          if (el.classList) {
            el.classList.remove('neod-blurred-thumbnail', 'neod-blurred-text-title', 'neod-blurred-text-meta');
            el.style.filter = '';
            el.style.opacity = '';
            el.style.display = '';
            el.style.visibility = '';
          }
        });

        // Remove any overlay
        const overlay = video.querySelector('.neod-irrelevant-overlay');
        if (overlay) overlay.remove();
      });
    } else {
      // If no blurred videos found, we can stop checking early
      clearInterval(checkInterval);
    }
  }, 200);

  // Final cleanup for any text elements that might still be hidden
  document.querySelectorAll([
    '#video-title[style*="opacity"]',
    '.title[style*="opacity"]',
    '.title[style*="display: none"]',
    '#metadata[style*="opacity"]',
    '.metadata[style*="opacity"]',
    'yt-formatted-string[style*="opacity"]',
    'span[style*="opacity"]'
  ].join(', ')).forEach(el => {
    el.style.opacity = '';
    el.style.visibility = '';
    el.style.display = '';
  });

  // Use the more subtle notification
  notifyStatus('filteringDisabled');
}

// Add CSS to the page
function injectStyles() {
  // If styles already injected, don't add again
  if (document.getElementById('neod-youtube-styles')) return;

  const style = document.createElement('style');
  style.id = 'neod-youtube-styles';
  style.textContent = `
    /* Temporary blur for videos being checked */
    .neod-checking img, .neod-checking yt-image, .neod-checking #thumbnail,
    .neod-checking #video-title, .neod-checking .title,
    .neod-checking #channel-name, .neod-checking .channel-name, 
    .neod-checking #byline, .neod-checking .metadata, .neod-checking .meta {
      filter: blur(5px) !important;
      opacity: 0.5 !important;
      transition: opacity 0.3s ease, filter 0.3s ease !important;
    }
    
    /* Styles for default blurred state */
    .neod-blurred-by-default {
      position: relative !important; /* Needed for overlay */
      pointer-events: none !important; /* Prevent hover effects */
    }
    
    /* Block all thumbnails from being clickable */
    .neod-blurred-by-default a,
    .neod-blurred-by-default a[href],
    .neod-blurred-by-default [role="link"],
    .neod-blurred-by-default [tabindex],
    .neod-blurred-by-default .yt-simple-endpoint {
      pointer-events: none !important;
      cursor: default !important;
      z-index: -1 !important; /* Push links below the overlay layer */
    }
    
    /* Complete barrier div to block any clicks */
    .neod-block-barrier {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 10; /* Higher than other elements but lower than overlay */
      cursor: not-allowed;
    }
    
    /* Allow events only on overlay and its children */
    .neod-blurred-by-default .neod-irrelevant-overlay,
    .neod-blurred-by-default .neod-irrelevant-overlay * {
      pointer-events: auto !important;
      z-index: 1000 !important;
    }
    
    /* High visibility styling for relevant videos */
    .neod-relevant-video {
      position: relative !important;
      /* Removed: transform: scale(1); */
      /* Removed: transition: transform 0.3s ease; */
      z-index: 1;
      pointer-events: auto !important;
    }
    .neod-relevant-video:hover {
      /* Removed: transform: scale(1.02); */
    }
    .neod-relevant-video::after {
      /* Removed green border
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      border: 2px solid #4CAF50;
      pointer-events: none;
      opacity: 0.5;
      */
    }
    
    /* Search page specific fixes */
    /* Fix for search page titles */
    ytd-video-renderer #video-title,
    ytd-video-renderer yt-formatted-string,
    ytd-video-renderer .title {
      display: block !important; 
      visibility: visible !important;
      opacity: 1 !important;
    }
    
    /* But keep irrelevant video titles hidden */
    ytd-video-renderer.neod-blurred-by-default #video-title,
    ytd-video-renderer.neod-blurred-by-default yt-formatted-string#video-title,
    ytd-video-renderer.neod-blurred-by-default .title {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
    }
    
    /* Ensure relevant videos have visible titles */
    .neod-relevant-video #video-title,
    .neod-relevant-video .title,
    .neod-relevant-video yt-formatted-string#video-title,
    .neod-relevant-video #text {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      filter: none !important;
    }
    
    /* Specific blur effects for different elements */
    .neod-blurred-thumbnail {
      filter: blur(${CONFIG.blurAmount}) !important;
      opacity: ${CONFIG.blurOpacity} !important;
      pointer-events: none !important;
    }
    .neod-blurred-text-title {
      filter: blur(6px) !important;
      opacity: 0.4 !important;
    }
    .neod-blurred-text-meta {
      filter: blur(4px) !important;
      opacity: 0.5 !important;
    }
    
    /* Enhanced title and text hiding for all videos */
    .neod-blurred-by-default #video-title,
    .neod-blurred-by-default .title,
    .neod-blurred-by-default .metadata,
    .neod-blurred-by-default #metadata,
    .neod-blurred-by-default yt-formatted-string[id="video-title"],
    .neod-blurred-by-default yt-formatted-string[id="text"],
    .neod-blurred-by-default ytd-video-meta-block,
    .neod-blurred-by-default ytd-channel-name,
    .neod-blurred-by-default #channel-name,
    .neod-blurred-by-default .channel-name,
    .neod-blurred-by-default a.yt-simple-endpoint.style-scope.yt-formatted-string,
    .neod-blurred-by-default #description,
    .neod-blurred-by-default #description-text,
    .neod-blurred-by-default .description,
    .neod-blurred-by-default .content,
    .neod-blurred-by-default .text-wrapper,
    .neod-blurred-by-default .details,
    .neod-blurred-by-default .badges,
    .neod-blurred-by-default .badge,
    .neod-blurred-by-default ytd-icon.ytd-badge-supported-renderer,
    .neod-blurred-by-default span.inline-metadata-item.style-scope.ytd-video-meta-block,
    .neod-blurred-by-default #byline,
    .neod-blurred-by-default .byline,
    .neod-blurred-by-default #owner-text,
    .neod-blurred-by-default #hashtag,
    .neod-blurred-by-default .hashtag,
    .neod-blurred-by-default ytd-badge-supported-renderer,
    .neod-blurred-by-default ytd-thumbnail-overlay-time-status-renderer,
    .neod-blurred-by-default .ytd-thumbnail-overlay-time-status-renderer,
    .neod-blurred-by-default ytd-video-meta-block {
      opacity: 0 !important;
      visibility: hidden !important;
      display: none !important;
    }
    
    /* Fix for YouTube Shorts titles being visible */
    ytd-reel-video-renderer .neod-blurred-by-default #overlay,
    ytd-reel-video-renderer .neod-blurred-by-default #text,
    ytd-reel-video-renderer .neod-blurred-by-default #video-title,
    ytd-reel-video-renderer .neod-blurred-by-default .video-title,
    ytd-reel-video-renderer .neod-blurred-by-default yt-formatted-string,
    ytd-shorts .neod-blurred-by-default #overlay,
    ytd-shorts .neod-blurred-by-default #text,
    ytd-shorts .neod-blurred-by-default .video-title,
    ytd-shorts .neod-blurred-by-default yt-formatted-string {
      display: none !important;
    }
    
    /* Specific styles for Shorts - Enhanced to completely hide titles */
    .shorts-player-overlay .neod-blurred-by-default,
    .shorts-player .neod-blurred-by-default,
    ytd-shorts-player .neod-blurred-by-default,
    #shorts-container .neod-blurred-by-default,
    .shorts-container .neod-blurred-by-default,
    #shorts-player .neod-blurred-by-default {
      position: relative !important;
    }
    
    /* Hide Shorts player controls and UI when blurred */
    .shorts-player .neod-blurred-by-default .ytp-chrome-bottom,
    #shorts-player .neod-blurred-by-default .ytp-chrome-bottom,
    .shorts-player .neod-blurred-by-default .ytp-player-content,
    .shorts-player .neod-blurred-by-default .html5-video-player,
    .shorts-player-overlay-content .neod-blurred-by-default {
      opacity: 0.1 !important;
      pointer-events: none !important;
    }
    
    /* Completely hide Shorts titles - these appear below the videos */
    ytd-rich-grid-slim-media .neod-blurred-by-default + #video-title-link,
    ytd-rich-grid-slim-media .neod-blurred-by-default + * #video-title-link,
    ytd-rich-grid-slim-media .neod-blurred-by-default ~ * #video-title-link,
    ytd-rich-grid-slim-media .neod-blurred-by-default ~ * #video-title,
    ytd-rich-grid-slim-media .neod-blurred-by-default ~ * .title,
    ytd-rich-grid-slim-media .neod-blurred-by-default ~ * .details,
    ytd-rich-grid-slim-media .neod-blurred-by-default ~ * .metadata,
    ytd-rich-grid-slim-media .neod-blurred-by-default ~ * yt-formatted-string,
    ytd-rich-grid-slim-media .neod-blurred-by-default ~ * span,
    ytd-rich-grid-slim-media .neod-blurred-by-default ~ * #metadata,
    ytd-rich-grid-slim-media .neod-blurred-by-default ~ * #text,
    ytd-rich-grid-slim-media .neod-blurred-by-default ~ * a,
    ytd-rich-grid-slim-media .neod-blurred-by-default + a,
    ytd-rich-grid-media .neod-blurred-by-default + #video-title-link,
    ytd-rich-grid-media .neod-blurred-by-default + * #video-title-link,
    ytd-rich-grid-media .neod-blurred-by-default ~ * #video-title-link,
    ytd-rich-grid-media .neod-blurred-by-default ~ * #video-title,
    ytd-rich-grid-media .neod-blurred-by-default ~ * .title,
    ytd-rich-grid-media .neod-blurred-by-default ~ * .details,
    ytd-rich-grid-media .neod-blurred-by-default ~ * .metadata,
    ytd-rich-grid-media .neod-blurred-by-default ~ * yt-formatted-string,
    ytd-rich-grid-media .neod-blurred-by-default ~ * span,
    ytd-rich-grid-media .neod-blurred-by-default ~ * #metadata,
    ytd-rich-grid-media .neod-blurred-by-default ~ * #text,
    ytd-rich-grid-media .neod-blurred-by-default ~ * a,
    ytd-rich-grid-media .neod-blurred-by-default + a,
    ytd-rich-item-renderer .neod-blurred-by-default ~ * #video-title-link,
    ytd-rich-item-renderer .neod-blurred-by-default ~ * #video-title,
    ytd-rich-item-renderer .neod-blurred-by-default ~ * .title,
    ytd-rich-item-renderer .neod-blurred-by-default ~ * .details,
    ytd-rich-item-renderer .neod-blurred-by-default ~ * .metadata,
    ytd-rich-item-renderer .neod-blurred-by-default ~ * yt-formatted-string,
    ytd-rich-item-renderer .neod-blurred-by-default ~ * span,
    ytd-rich-item-renderer .neod-blurred-by-default ~ * #metadata,
    ytd-rich-item-renderer .neod-blurred-by-default ~ * #text,
    .ytd-thumbnail-overlay-time-status-renderer {
      opacity: 0 !important;
      visibility: hidden !important;
      display: none !important;
    }
    
    /* Disable hover video previews completely for blurred videos */
    .neod-blurred-by-default:hover #mouseover-overlay,
    .neod-blurred-by-default ytd-thumbnail-overlay-toggle-button-renderer,
    .neod-blurred-by-default ytd-thumbnail-overlay-hover-text-renderer,
    .neod-blurred-by-default ytd-thumbnail-overlay-now-playing-renderer,
    .neod-blurred-by-default ytd-thumbnail-overlay-time-status-renderer,
    .neod-blurred-by-default .ytp-mouseover-image,
    .neod-blurred-by-default .mouseover-overlay,
    .neod-blurred-by-default .thumbnail-overlay,
    .neod-blurred-by-default #hover-overlays,
    .neod-blurred-by-default .hover-overlays,
    .neod-blurred-by-default #hover-overlays *,
    .neod-blurred-by-default .hover-overlays * {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
    
    /* Make overlays more prominent on Shorts */
    .shorts-player .neod-irrelevant-overlay,
    #shorts-player .neod-irrelevant-overlay,
    ytd-shorts .neod-irrelevant-overlay,
    ytd-reel-video-renderer .neod-irrelevant-overlay {
      background-color: rgba(0, 0, 0, 0.85) !important;
      z-index: 2000 !important; /* Higher z-index to ensure it shows above all controls */
      font-size: 16px !important;
      padding: 20px !important;
    }
    
    /* Make the reveal button more visible on Shorts */
    .shorts-player .neod-reveal-btn,
    #shorts-player .neod-reveal-btn,
    ytd-shorts .neod-reveal-btn,
    ytd-reel-video-renderer .neod-reveal-btn {
      padding: 8px 16px !important;
      font-size: 14px !important;
      margin-top: 12px !important;
      background: rgba(255, 255, 255, 0.3) !important;
    }
    
    /* Disable video preview on hover */
    .neod-blurred-by-default video {
      display: none !important;
    }
    
    .neod-blurred-thumbnail, .neod-blurred-text-title, .neod-blurred-text-meta {
        transition: opacity 0.3s ease, filter 0.3s ease !important;
    }
    
    /* Overlay styling */
    .neod-irrelevant-overlay {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background-color: rgba(0, 0, 0, 0.75); color: white; font-weight: bold; text-align: center; z-index: 1000;
      font-size: 14px; padding:5px;
      pointer-events: auto !important;
    }
    .neod-irrelevant-overlay span { margin-bottom: 8px; }
    .neod-reveal-btn {
      padding: 5px 10px; background: rgba(255,255,255,0.2); border: 1px solid white;
      color: white; border-radius: 4px; cursor: pointer; font-size: 12px;
    }
    .neod-reveal-btn:hover { background: rgba(255,255,255,0.4); }
    
    /* Notification styles */
    #neod-youtube-notification { 
        position: fixed; bottom: 70px; right: 20px; background-color: rgba(0,0,0,0.85); 
        color: #fff; padding: 10px 15px; border-radius: 5px; z-index: 9999; 
        font-size: 14px; opacity: 0.95; transition: opacity 0.5s ease; box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    }
  `;

  document.head.appendChild(style);
}

// Periodically check for new content (YouTube loads content dynamically)
let periodicCheckInterval;

function setupPeriodicChecks() {
  // Clear any existing interval
  if (periodicCheckInterval) {
    clearInterval(periodicCheckInterval);
  }

  // Set up a less aggressive periodic check
  periodicCheckInterval = setInterval(() => {
    if (!currentTask) return;

    // Skip if filtering is disabled for this page type
    if ((isSearchPage && !searchFilterEnabled) ||
      (isChannelPage && !channelFilterEnabled)) {
      return;
    }

    // Get ALL video elements on the page
    const allVideos = getVideoElements();
    const uncheckedVideos = Array.from(allVideos).filter(video =>
      !video.hasAttribute('data-relevance-checked')
    );

    // Only process if we have a reasonable number of unchecked videos
    if (uncheckedVideos.length > 5 && uncheckedVideos.length < 100) {
      console.log(`Found ${uncheckedVideos.length} unchecked videos during periodic check`);

      // Find only visible videos to prioritize
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const visibleVideos = uncheckedVideos.filter(el => {
        const rect = el.getBoundingClientRect();
        return (rect.top < viewportHeight + CONFIG.viewportBuffer && rect.bottom > -CONFIG.viewportBuffer);
      });

      if (visibleVideos.length > 0) {
        // Limit to just a few to avoid performance issues
        const videosToProcess = visibleVideos.slice(0, CONFIG.maxVisibleVideos);

        // Process them to check relevance without notification
        // (only using a notification if there are many)
        if (videosToProcess.length > 5) {
          showNotification(`Checking ${videosToProcess.length} new videos`, 1000);
        }

        // Process videos directly without using the queue
        videosToProcess.forEach(async (videoElement) => {
          try {
            await checkVideoRelevance(videoElement);
          } catch (error) {
            console.error('Error in periodic check:', error);
          }
        });
      } else if (uncheckedVideos.length > 20) {
        // If there are many unchecked videos but none visible,
        // queue a small batch for processing
        filterVideos(false, false);
      }
    }
  }, CONFIG.processingInterval);

  // Also set up a more thorough but less frequent background check
  setInterval(() => {
    // Once every 10 seconds, process any videos that might have been missed
    if (currentTask && !isProcessingQueue && videoCheckQueue.length === 0) {
      const uncheckedCount = getUncheckedVideoElements().length;
      if (uncheckedCount > 0 && uncheckedCount < 100) {
        console.log(`Background check found ${uncheckedCount} unchecked videos`);
        filterVideos(false, false);
      }
    }
  }, 10000); // Every 10 seconds
}

// Initialize when page is ready
initialize();
window.addEventListener('load', initialize);

// Apply temporary checking blur to indicate processing
function applyTemporaryCheckingBlur(videoElement) {
  if (!videoElement) return;

  // Mark as checking
  videoElement.classList.add('neod-checking');

  // Apply more aggressive blurring to text elements
  const textElements = videoElement.querySelectorAll('#video-title, .title, #metadata, .metadata, #text, .text-wrapper, #description, .description, #hashtag, .hashtag, ytd-badge-supported-renderer, ytd-channel-name, #channel-name');
  textElements.forEach(el => {
    el.classList.add('neod-blurred-text-title');
  });
}

// Extract title and other metadata from a video element
// Extract title and other metadata from a video element
function extractVideoInfo(videoElement) {
  let title = '';
  let channelName = '';
  let description = '';

  // Special handling for Shorts
  const isShort = videoElement.matches('ytd-reel-video-renderer, ytd-shorts, ytd-shorts-video-renderer, ytd-reel-item-renderer') ||
    videoElement.closest('ytd-shorts, #shorts-container');

  if (isShort) {
    // For Shorts, try to find the title in different places
    const shortsTitle = videoElement.querySelector('.title, yt-formatted-string.title, .text-wrapper .text, #video-title');
    if (shortsTitle) {
      title = shortsTitle.textContent.trim();
    }

    // Try to get channel name from Shorts
    const shortsChannel = videoElement.querySelector('.channel-name, #channel-name, #author-text, .shorts-info #text');
    if (shortsChannel) {
      channelName = shortsChannel.textContent.trim();
    }
  } else {
    // Standard videos
    const titleElement = videoElement.querySelector('#video-title, .title');
    if (titleElement) {
      title = titleElement.textContent.trim();
    }

    // Try to get channel name
    const channelElement = videoElement.querySelector('#channel-name, .channel-name, #byline');
    if (channelElement) {
      channelName = channelElement.textContent.trim();
    }

    // Try to get description
    const descElement = videoElement.querySelector('#description-text, .description, #description, .content, #metadata-line');
    if (descElement) {
      description = descElement.textContent.trim();
    }
  }

  // If title is still not found, try to get it from any attribute that might contain it
  if (!title) {
    const possibleTitleElements = videoElement.querySelectorAll('[title], [aria-label]');
    for (const el of possibleTitleElements) {
      if (el.getAttribute('title') && el.getAttribute('title').length > 5) {
        title = el.getAttribute('title');
        break;
      } else if (el.getAttribute('aria-label') && el.getAttribute('aria-label').length > 5) {
        title = el.getAttribute('aria-label');
        break;
      }
    }
  }

  return {
    title,
    channelName,
    description,
    type: isShort ? 'YouTube Short' : 'YouTube Video'
  };
}

// Check if a video is relevant to the current task
async function checkVideoRelevance(videoElement) {
  if (!currentTask || !videoElement) return;

  // If on search page with filtering disabled, mark all videos as relevant immediately
  if (isSearchPage && !searchFilterEnabled) {
    unblurRelevantVideo(videoElement);
    return;
  }

  // If on channel page with filtering disabled, mark all videos as relevant immediately
  if (isChannelPage && !channelFilterEnabled) {
    unblurRelevantVideo(videoElement);
    return;
  }

  // ADDED: If already marked as relevant by user or system, don't recheck
  if (videoElement.hasAttribute('data-relevance-checked') &&
    (videoElement.getAttribute('data-relevance-checked') === 'true' ||
      videoElement.getAttribute('data-relevance-checked') === 'user-revealed')) {
    return;
  }

  // STRICT MODE: Blur immediately if configured
  if (CONFIG.blurByDefault) {
    videoElement.classList.add('neod-blurred-by-default');

    // Apply blur to thumbnails immediately
    const thumbnails = videoElement.querySelectorAll('img, yt-image, #thumbnail, video');
    thumbnails.forEach(thumb => {
      thumb.classList.add('neod-blurred-thumbnail');
    });

    // Hide text immediately
    const textElements = videoElement.querySelectorAll('#video-title, .title, #metadata, .metadata');
    textElements.forEach(el => {
      el.style.opacity = '0';
    });
  }

  // Mark as checking in progress
  videoElement.classList.add('neod-checking');
  STATS.totalProcessed++;

  // Extract video information
  const videoInfo = extractVideoInfo(videoElement);

  if (!videoInfo.title) {
    // Skip if we couldn't get the title
    videoElement.classList.remove('neod-checking');
    return;
  }

  // Always try local checking first
  const localResult = checkRelevanceLocally(videoInfo.title, currentTask, videoInfo.description);

  if (localResult.isDecisive) {
    STATS.localDecisions++;

    if (localResult.isRelevant) {
      // For relevant videos, mark as relevant and leave visible
      unblurRelevantVideo(videoElement);
    } else {
      // For irrelevant videos, apply blur and add overlay
      finalizeIrrelevantVideo(videoElement);
    }

    // Remove checking class
    videoElement.classList.remove('neod-checking');
    return;
  }

  // If local check wasn't decisive, use API
  // Only call backend if really necessary
  // For now, we'll assume irrelevant if local check failed (strict mode)
  // UNLESS we have a small keyword set, then we might query API?
  // But to save API calls and be strict, let's default to irrelevant or use a more expensive check

  // For this implementation, we will treat indecisive as irrelevant in strict mode
  // OR we can send to API. Let's send to API but keep it blurred until then.

  try {
    const apiResult = await checkRelevance(videoInfo);
    if (apiResult.isRelevant) {
      unblurRelevantVideo(videoElement);
    } else {
      finalizeIrrelevantVideo(videoElement);
    }
  } catch (e) {
    console.error('API check failed', e);
    // On error, keep blurred (strict)
  }

  videoElement.classList.remove('neod-checking');
}


// Mark video as relevant (no blur, no overlay)
function markAsRelevant(videoElement) {
  if (!videoElement) return;

  // Mark as checked and relevant
  videoElement.setAttribute('data-relevance-checked', 'true');
  videoElement.classList.remove('neod-checking', 'neod-blurred-by-default');
  videoElement.classList.add('neod-relevant-video');

  // Remove any blur classes that might have been applied
  videoElement.querySelectorAll('.neod-blurred-thumbnail, .neod-blurred-text-title, .neod-blurred-text-meta').forEach(el => {
    el.classList.remove('neod-blurred-thumbnail', 'neod-blurred-text-title', 'neod-blurred-text-meta');

    // Also remove any inline styles that might have been applied
    el.style.filter = '';
    el.style.opacity = '';
    el.style.visibility = '';
    el.style.display = '';
  });

  // Ensure all text elements are visible
  videoElement.querySelectorAll('#video-title, .title, #metadata, .metadata, #text, .text-wrapper, #description, .description, yt-formatted-string').forEach(el => {
    el.style.opacity = '';
    el.style.visibility = '';
    el.style.display = '';
  });

  // Remove any overlay if present
  const overlay = videoElement.querySelector('.neod-irrelevant-overlay');
  if (overlay) overlay.remove();

  // Remove any barriers
  const barrier = videoElement.querySelector('.neod-block-barrier');
  if (barrier) barrier.remove();

  // Re-enable all links and clickable elements
  const allClickables = videoElement.querySelectorAll('a, .yt-simple-endpoint, [role="link"], [tabindex]');
  allClickables.forEach(el => {
    el.style.pointerEvents = '';
    el.removeAttribute('aria-disabled');
    el.style.cursor = '';
    el.style.zIndex = '';
  });
}

// New function to reset all video checks without blurring them
function resetAllVideoChecks() {
  // Get all video elements of any kind
  const allVideos = getVideoElements();
  console.log(`Resetting ${allVideos.length} videos for rechecking`);

  // Reset checks but don't blur by default
  Array.from(allVideos).forEach(video => {
    // Mark all videos as unchecked
    video.removeAttribute('data-relevance-checked');
    video.classList.remove('neod-relevant-video');
    video.classList.remove('neod-blurred-by-default');
    video.classList.remove('neod-checking');

    // Remove existing blurs
    const blurredElements = video.querySelectorAll('.neod-blurred-thumbnail, .neod-blurred-text-title, .neod-blurred-text-meta');
    blurredElements.forEach(el => {
      el.classList.remove('neod-blurred-thumbnail', 'neod-blurred-text-title', 'neod-blurred-text-meta');
    });

    // Remove existing overlays
    const existingOverlay = video.querySelector('.neod-irrelevant-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }

    // Remove any barriers
    const barrier = video.querySelector('.neod-block-barrier');
    if (barrier) {
      barrier.remove();
    }
  });

  // Add notification explaining the new checks
  showNotification('Checking all videos for relevance to your task...', 3000);
}

// Load AI-generated keywords for a task from storage
function loadKeywordsForTask(task, callback) {
  if (!task) {
    taskKeywords = [];
    if (callback) callback();
    return;
  }

  // Force reload from storage each time to ensure we get the latest keywords
  chrome.storage.local.get(['taskKeywords', 'rawGeminiResponse'], function (result) {
    if (result.taskKeywords && result.taskKeywords[task]) {
      taskKeywords = result.taskKeywords[task];
      console.log(`Loaded ${taskKeywords.length} AI keywords for "${task}"`);

      // If we have keywords, apply filtering right away
      if (taskKeywords.length > 0) {
        // No need to show notification about keywords here
        setTimeout(filterVideosAggressively, 100);
      } else {
        console.log('No AI keywords found for this task (array exists but empty)');
        // Request keywords from background script
        refreshKeywords(task);
      }
    } else {
      console.log('No AI keywords for this task in storage, requesting generation');
      taskKeywords = [];
      // Request keyword generation from background
      refreshKeywords(task);
    }

    if (callback) callback();
  });
}

// Request fresh keywords from background script
function refreshKeywords(task) {
  if (!task) return;

  console.log(`Requesting fresh keywords for task: ${task}`);
  showNotification('Generating keywords for task...', 1500, 'low');

  chrome.runtime.sendMessage({
    action: 'forceGenerateKeywords',
    task: task
  }, function (response) {
    if (chrome.runtime.lastError) {
      console.error('Error generating keywords:', chrome.runtime.lastError);
      return;
    }

    if (response && response.success) {
      console.log(`Generated ${response.keywordCount} keywords for task`);

      // Re-fetch the keywords from storage
      chrome.storage.local.get(['taskKeywords'], function (result) {
        if (result.taskKeywords && result.taskKeywords[task]) {
          taskKeywords = result.taskKeywords[task];
          console.log(`Refreshed ${taskKeywords.length} AI keywords for "${task}"`);

          // Apply filtering with new keywords
          setTimeout(filterVideosAggressively, 100);
          // Only show notification if significant number of keywords
          if (taskKeywords.length > 100) {
            showNotification(`Generated ${taskKeywords.length} keywords for filtering`, 2000, 'low');
          }
        }
      });
    } else {
      console.error('Failed to generate keywords:', response?.error || 'Unknown error');
    }
  });
}

// More aggressive filtering for homepage
function filterVideosAggressively(isNewTaskOrLoad = false) {
  if (!currentTask) return;

  // If on search page with filtering disabled, don't filter
  if (isSearchPage && !searchFilterEnabled) {
    console.log('Search filtering disabled - skipping filter');
    forceRemoveAllFilters();
    return;
  }

  // If on channel page with filtering disabled, don't filter
  if (isChannelPage && !channelFilterEnabled) {
    console.log('Channel filtering disabled - skipping filter');
    forceRemoveAllFilters();
    return;
  }

  // On new task or full load, reset all video checks
  if (isNewTaskOrLoad) {
    resetAllVideoChecks();

    // Show notification explaining approach
    notifyStatus('filteringEnabled');
  }

  // Start relevance checking - more aggressive with larger batches
  filterVideos(isNewTaskOrLoad, true);
}

// Apply default blur effect to a video element
function applyDefaultBlur(videoElement) {
  if (!videoElement) return;

  // Skip if already marked as relevant
  if (videoElement.hasAttribute('data-relevance-checked') &&
    (videoElement.getAttribute('data-relevance-checked') === 'true' ||
      videoElement.getAttribute('data-relevance-checked') === 'user-revealed')) {
    return;
  }

  // Mark video as blurred by default
  videoElement.classList.add('neod-blurred-by-default');

  // Add an invisible barrier div to block all clicks
  if (!videoElement.querySelector('.neod-block-barrier')) {
    const barrier = document.createElement('div');
    barrier.className = 'neod-block-barrier';
    videoElement.appendChild(barrier);
  }

  // Handle more specific elements for shorts and regular videos
  const elementsToProcess = [
    // Basic video elements
    ...Array.from(videoElement.querySelectorAll('img, yt-image, #thumbnail, video')),

    // Title elements - more specific selection
    ...Array.from(videoElement.querySelectorAll('#video-title, .title, yt-formatted-string[aria-label], [title]')),

    // Channel and metadata
    ...Array.from(videoElement.querySelectorAll('#channel-name, .channel-name, #byline, #metadata, .metadata, .meta')),

    // Shorts specific elements
    ...Array.from(videoElement.querySelectorAll('#overlay, #text, .text-wrapper, .content, yt-formatted-string')),

    // Hover overlays
    ...Array.from(videoElement.querySelectorAll('#hover-overlays, .hover-overlays, #mouseover-overlay, .mouseover-overlay'))
  ];

  // Process each element appropriately
  elementsToProcess.forEach(el => {
    // Skip if null or already processed
    if (!el || el.classList.contains('neod-blurred-thumbnail') ||
      el.classList.contains('neod-blurred-text-title') ||
      el.classList.contains('neod-blurred-text-meta')) {
      return;
    }

    if (el.matches('#video-title, .title, yt-formatted-string[aria-label], [title]')) {
      el.classList.add('neod-blurred-text-title');
    } else if (el.matches('img, yt-image, #thumbnail, video')) {
      el.classList.add('neod-blurred-thumbnail');

      // For thumbnail links, disable them
      if (el.parentElement && el.parentElement.tagName === 'A') {
        el.parentElement.style.pointerEvents = 'none';
        el.parentElement.setAttribute('aria-disabled', 'true');
        el.parentElement.style.cursor = 'not-allowed';
      }
    } else {
      el.classList.add('neod-blurred-text-meta');
    }
  });

  // Check for YouTube video preview elements (which run on mouseover)
  const hoverElements = videoElement.querySelectorAll('#hover-overlays, .hover-overlays, #mouseover-overlay, .mouseover-overlay');
  hoverElements.forEach(el => {
    // Hide and disable hover elements
    el.style.display = 'none';
    el.style.opacity = '0';
    el.style.visibility = 'hidden';
    el.style.pointerEvents = 'none';
  });

  // Find and disable all links
  const links = videoElement.querySelectorAll('a, .yt-simple-endpoint');
  links.forEach(link => {
    link.style.pointerEvents = 'none';
    link.setAttribute('aria-disabled', 'true');
    link.style.cursor = 'not-allowed';
  });

  // For Shorts, we need to completely hide the title as blur doesn't work well
  const shortsTitle = videoElement.querySelectorAll('#overlay, #text, .text-wrapper, .content, .overlay-text');
  if (videoElement.matches('ytd-shorts, ytd-reel-item-renderer, ytd-reel-video-renderer')) {
    shortsTitle.forEach(el => {
      el.style.display = 'none';
    });
  }
}

function getVideoElements() {
  const selectors = [
    'ytd-rich-item-renderer',
    'ytd-grid-video-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-reel-item-renderer',
    'ytd-shorts',
    'ytd-reel-video-renderer',
    'ytd-shorts-video-renderer',
    'ytd-playlist-video-renderer',
    'ytd-playlist-panel-video-renderer',
    'ytd-watch-card-compact-video-renderer',
    'ytd-channel-video-renderer',
    'ytd-mini-guide-entry-renderer',
    'ytd-video-preview'
  ];
  // Get all video elements
  return document.querySelectorAll(selectors.join(', '));
}

function getUncheckedVideoElements() {
  const selectors = [
    'ytd-rich-item-renderer', 'ytd-grid-video-renderer', 'ytd-video-renderer',
    'ytd-compact-video-renderer', 'ytd-reel-item-renderer'
  ];
  // Select elements that do NOT have data-relevance-checked="true"
  return document.querySelectorAll(selectors.map(s => `${s}:not([data-relevance-checked="true"])`).join(', '));
}

// Set up scroll handler to detect and filter videos that become visible during scrolling
function setupScrollHandler() {
  // Track the last time we ran filtering to avoid excessive processing
  let lastFilterTime = 0;

  // Use a throttled scroll handler to avoid performance issues
  let scrollTimeout;

  window.addEventListener('scroll', function () {
    // Clear timeout if it exists
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }

    // Only set up filtering if it's been at least 500ms since last filter
    const now = Date.now();
    if (now - lastFilterTime < 500) {
      return; // Skip if we filtered very recently
    }

    // Set a timeout to run after scrolling stops
    scrollTimeout = setTimeout(function () {
      if (!currentTask) return;

      // Skip if filtering is disabled for this page type
      if ((isSearchPage && !searchFilterEnabled) ||
        (isChannelPage && !channelFilterEnabled)) {
        return;
      }

      // Update timestamp for last filter operation
      lastFilterTime = Date.now();

      // Only check for visible videos that haven't been filtered yet
      const uncheckedVideos = Array.from(getUncheckedVideoElements());
      if (uncheckedVideos.length === 0) return;

      // Find videos that are now visible in the viewport
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const buffer = 300; // Smaller buffer for scroll events

      const visibleVideos = uncheckedVideos.filter(el => {
        const rect = el.getBoundingClientRect();
        return (rect.top < viewportHeight + buffer && rect.bottom > -buffer);
      });

      // If we have visible unchecked videos, process them
      if (visibleVideos.length > 0) {
        // Limit to just a few at a time for smoother scrolling
        const videosBatch = visibleVideos.slice(0, CONFIG.maxVisibleVideos);

        // Only show notification for larger batches
        if (videosBatch.length > 5) {
          showNotification(`Checking ${videosBatch.length} newly visible videos`, 1000);
        }

        // Process the visible videos immediately
        videosBatch.forEach(async (videoElement) => {
          try {
            await checkVideoRelevance(videoElement);
          } catch (error) {
            console.error('Error checking scrolled video:', error);
          }
        });
      }
    }, 250);
  });
}

// Set up mutation observer to detect new videos being loaded
function observeYouTubeContent() {
  // More aggressive observer that watches the entire body
  const observer = new MutationObserver((mutations) => {
    if (!currentTask) return;

    // If we're on a search page and filtering is disabled, don't process new videos
    if (isSearchPage && !searchFilterEnabled) {
      // Instead of processing, just make sure all videos are visible
      const newVideos = document.querySelectorAll([
        'ytd-rich-item-renderer:not([data-relevance-checked="true"])',
        'ytd-grid-video-renderer:not([data-relevance-checked="true"])',
        'ytd-video-renderer:not([data-relevance-checked="true"])',
        'ytd-compact-video-renderer:not([data-relevance-checked="true"])',
        'ytd-reel-item-renderer:not([data-relevance-checked="true"])',
        'ytd-shorts:not([data-relevance-checked="true"])',
        'ytd-reel-video-renderer:not([data-relevance-checked="true"])',
        'ytd-shorts-video-renderer:not([data-relevance-checked="true"])'
      ].join(', '));

      if (newVideos.length > 0) {
        console.log(`Found ${newVideos.length} new videos while filtering is disabled - marking all as relevant`);
        Array.from(newVideos).forEach(video => {
          video.setAttribute('data-relevance-checked', 'true');
          video.classList.remove('neod-checking');
          video.classList.add('neod-relevant-video');
        });
      }
      return;
    }

    // If we're on a channel page and filtering is disabled, don't process new videos
    if (isChannelPage && !channelFilterEnabled) {
      // Instead of processing, just make sure all videos are visible
      const newVideos = document.querySelectorAll([
        'ytd-rich-item-renderer:not([data-relevance-checked="true"])',
        'ytd-grid-video-renderer:not([data-relevance-checked="true"])',
        'ytd-video-renderer:not([data-relevance-checked="true"])',
        'ytd-compact-video-renderer:not([data-relevance-checked="true"])',
        'ytd-reel-item-renderer:not([data-relevance-checked="true"])',
        'ytd-shorts:not([data-relevance-checked="true"])',
        'ytd-reel-video-renderer:not([data-relevance-checked="true"])',
        'ytd-shorts-video-renderer:not([data-relevance-checked="true"])'
      ].join(', '));

      if (newVideos.length > 0) {
        console.log(`Found ${newVideos.length} new videos on channel page while filtering is disabled - marking all as relevant`);
        Array.from(newVideos).forEach(video => {
          video.setAttribute('data-relevance-checked', 'true');
          video.classList.remove('neod-checking');
          video.classList.add('neod-relevant-video');
        });
      }
      return;
    }

    let hasNewContent = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        hasNewContent = true;

        // Check added nodes immediately for videos
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) { // Element node
            // Check if this node is a video element itself
            const videoSelectors = [
              'ytd-rich-item-renderer',
              'ytd-grid-video-renderer',
              'ytd-video-renderer',
              'ytd-compact-video-renderer',
              'ytd-reel-item-renderer',
              'ytd-shorts',
              'ytd-reel-video-renderer',
              'ytd-shorts-video-renderer'
            ];

            // Don't blur by default - just mark for checking
            if (videoSelectors.some(selector => node.matches && node.matches(selector))) {
              // Only mark for checking if not already checked
              if (!node.hasAttribute('data-relevance-checked')) {
                node.classList.add('neod-checking');
              }
            }

            // Check for video elements inside the added node
            if (node.querySelectorAll) {
              const videos = node.querySelectorAll(videoSelectors.join(', '));
              if (videos.length > 0) {
                // Process new videos immediately
                videos.forEach(video => {
                  if (!video.hasAttribute('data-relevance-checked')) {
                    video.classList.add('neod-checking');
                  }
                });
              }
            }
          }
        }

        break;
      }
    }

    if (hasNewContent) {
      // Check if we're on a search page with filtering disabled
      if (isSearchPage && !searchFilterEnabled) {
        forceRemoveAllFilters();
      }
      // Check if we're on a channel page with filtering disabled
      else if (isChannelPage && !channelFilterEnabled) {
        forceRemoveAllFilters();
      }
      else {
        // Debounce the filter call but with shorter delay for more responsiveness
        setTimeout(() => filterVideos(), 50);
      }
    }
  });

  // Observe the entire document for maximum coverage
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false
  });
}

// New function to specifically process Shorts videos
function processShortsAggressively() {
  if (!currentTask) return;

  console.log('Processing Shorts with aggressive settings');

  // Target shorts video elements specifically
  const shortsVideos = document.querySelectorAll([
    'ytd-reel-video-renderer',
    'ytd-shorts',
    'ytd-shorts-video-renderer',
    'ytd-reel-item-renderer',
    '#shorts-container video-container-renderer',
    '.shorts-video-container video-container-renderer',
    'ytd-player[video-id] video',
    'ytd-rich-grid-slim-media',
    'ytd-rich-grid-media'
  ].join(', '));

  if (shortsVideos.length === 0) {
    console.log('No Shorts videos found yet');
    return;
  }

  console.log(`Found ${shortsVideos.length} Shorts videos`);

  // Process a larger batch size for Shorts
  const batchSize = 50;

  // Create a priority queue for these Shorts
  const shortsQueue = Array.from(shortsVideos).filter(video =>
    !video.hasAttribute('data-relevance-checked') ||
    (video.getAttribute('data-relevance-checked') !== 'true' &&
      video.getAttribute('data-relevance-checked') !== 'user-revealed')
  );

  // If nothing to process, exit early
  if (shortsQueue.length === 0) {
    console.log('All Shorts already checked');

    // Even if all Shorts are checked, we still need to ensure titles are hidden
    // This is a fallback to catch any titles that might still be visible
    hideMissedShortsTitles();
    return;
  }

  console.log(`Processing ${shortsQueue.length} unchecked Shorts`);
  showNotification(`Checking ${shortsQueue.length} Shorts for relevance`, 1000);

  // Process them in parallel with maximum speed
  const promises = shortsQueue.slice(0, batchSize).map(videoElement => {
    return new Promise(async (resolve) => {
      try {
        await checkVideoRelevance(videoElement);
      } catch (error) {
        console.error('Error checking Shorts relevance:', error);
      }
      resolve();
    });
  });

  // Wait for all to complete
  Promise.all(promises).then(() => {
    console.log('Finished processing Shorts batch');

    // After processing, ensure all titles are hidden
    hideMissedShortsTitles();

    // Check if there are any videos left unchecked
    const remainingUnchecked = document.querySelectorAll([
      'ytd-reel-video-renderer:not([data-relevance-checked])',
      'ytd-shorts:not([data-relevance-checked])',
      'ytd-shorts-video-renderer:not([data-relevance-checked])'
    ].join(', '));

    if (remainingUnchecked.length > 0) {
      console.log(`Still have ${remainingUnchecked.length} unchecked Shorts - processing again`);
      setTimeout(processShortsAggressively, 100);
    }
  });
}

// Function to hide any Shorts titles that might have been missed
function hideMissedShortsTitles() {
  // Find all blurred videos first
  const blurredVideos = document.querySelectorAll('.neod-blurred-by-default');
  blurredVideos.forEach(video => {
    if (isShortVideo(video)) {
      hideShortsTitles(video);
    }
  });

  // Also target specific Shorts areas
  const shortsContainers = document.querySelectorAll([
    'ytd-rich-section-renderer[is-shorts]',
    '#shorts-container',
    '#shorts-inner-container',
    'ytd-reel-shelf-renderer',
    '[page-subtype="shorts"]',
    'ytd-shorts-feed'
  ].join(', '));

  shortsContainers.forEach(container => {
    // Find all irrelevant videos in this container
    const irrelevantVideos = container.querySelectorAll('.neod-blurred-by-default');

    // For each irrelevant video, hide associated titles
    irrelevantVideos.forEach(video => {
      hideShortsTitles(video);
    });

    // Also hide all titles in the shorts section that might not be directly tied to a video
    const allTitles = container.querySelectorAll('#video-title, .title, yt-formatted-string, span.title, a[title], #text, .text, #details, .details, #metadata, .metadata');
    allTitles.forEach(title => {
      // Only hide if it's below a blurred video
      const closestVideo = title.closest('ytd-grid-video-renderer, ytd-rich-grid-media, ytd-rich-item-renderer');
      if (closestVideo && closestVideo.querySelector('.neod-blurred-by-default')) {
        title.style.opacity = '0';
        title.style.visibility = 'hidden';
        title.style.display = 'none';
      }
    });
  });
}

// New function to detect search actions at the earliest possible moment
function setupEarlySearchDetection() {
  console.log('Setting up early search detection');

  // Function to apply pre-emptive blur immediately
  function applyPreemptiveBlur() {
    if (!currentTask || !searchFilterEnabled) return;

    console.log('Search action detected - applying immediate blur');

    // Apply temporary blur to all visible videos
    const allVideos = document.querySelectorAll([
      'ytd-video-renderer',
      'ytd-grid-video-renderer',
      'ytd-rich-item-renderer',
      'ytd-compact-video-renderer',
      'ytd-grid-video-renderer',
      'ytd-shelf-renderer'
    ].join(', '));

    Array.from(allVideos).forEach(video => {
      video.classList.add('neod-checking');

      // Also add stronger direct styles for immediate effect
      const thumbnails = video.querySelectorAll('img, yt-image, #thumbnail, ytd-thumbnail');
      thumbnails.forEach(thumb => {
        thumb.style.filter = 'blur(8px)';
        thumb.style.opacity = '0.2';
      });

      const titles = video.querySelectorAll('#video-title, .title, yt-formatted-string#video-title');
      titles.forEach(title => {
        title.style.filter = 'blur(6px)';
        title.style.opacity = '0.3';
      });
    });

    // Show notification
    showNotification('Navigating to search results...', 2000);
  }

  // Watch for clicks on the search button
  function setupSearchButtonListener() {
    // Monitor for when search button and form exist
    const searchButtonObserver = new MutationObserver(() => {
      const searchButton = document.querySelector('button#search-icon-legacy, ytd-searchbox button, button.ytd-masthead');
      const searchForm = document.querySelector('form#search-form');

      if (searchButton) {
        // Remove observer once we've found the button
        searchButtonObserver.disconnect();

        console.log('Search button found, adding listener');
        searchButton.addEventListener('click', applyPreemptiveBlur);
      }

      if (searchForm) {
        // Add listener to form submission as well
        console.log('Search form found, adding listener');
        searchForm.addEventListener('submit', applyPreemptiveBlur);
      }
    });

    // Start observing document for search elements
    searchButtonObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Monitor search input field for Enter key presses
  function setupSearchInputListener() {
    // Monitor for search input
    const searchInputObserver = new MutationObserver(() => {
      const searchInput = document.querySelector('input#search');

      if (searchInput) {
        // Remove observer once we've found the input
        searchInputObserver.disconnect();

        console.log('Search input found, adding keydown listener');
        searchInput.addEventListener('keydown', (e) => {
          // Check if Enter key is pressed
          if (e.key === 'Enter') {
            applyPreemptiveBlur();
          }
        });
      }
    });

    // Start observing document for search input
    searchInputObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Setup both listeners
  setupSearchButtonListener();
  setupSearchInputListener();

  // Also listen for search-related keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // YouTube uses '/' as a shortcut to focus search
    if (e.key === '/' && !e.target.matches('input, textarea')) {
      setTimeout(applyPreemptiveBlur, 10);
    }
  });
}