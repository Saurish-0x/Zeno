// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function () {
  // UI elements
  const elements = {
    taskInput: document.getElementById('task'),
    startTaskBtn: document.getElementById('start-task-btn'),
    stopTaskBtn: document.getElementById('stop-task-btn'),
    statusTask: document.getElementById('status-task'),
    keywordStats: document.getElementById('keyword-stats'),
    showKeywordsBtn: document.getElementById('show-keywords-btn'),
    keywordsDisplay: document.getElementById('keywords-display-area'),
    progressContainer: document.getElementById('progress-container'),
    progressBar: document.getElementById('progress-bar'),
    progressText: document.getElementById('progress-text'),
    // Youtube settings
    youtubeSearchToggle: document.getElementById('youtube-search-filter-toggle'),
    youtubeChannelToggle: document.getElementById('youtube-channel-filter-toggle'),
    youtubeStatus: document.getElementById('youtube-filter-status'),
    // Auto-Close & API Key
    autoCloseToggle: document.getElementById('auto-close-toggle'),
    apiKeyInput: document.getElementById('apiKeyInput'),
    saveApiKeyBtn: document.getElementById('saveApiKeyBtn'),
    apiKeyStatus: document.getElementById('apiKeyStatus')
  };

  // Initialize
  loadInitialData();
  setupEventListeners();

  // Load initial data from storage
  function loadInitialData() {
    chrome.runtime.sendMessage({ action: 'getTaskAndApiKey' }, function (response) {
      if (chrome.runtime.lastError) return;

      if (response && response.task) {
        // Task is running
        elements.taskInput.value = response.task;
        elements.taskInput.disabled = true;
        updateUIState(true);
        updateKeywordStats(response.task);
      } else {
        // No task running
        updateUIState(false);
      }
    });

    // Load settings
    chrome.storage.local.get(['searchFilterEnabled', 'channelFilterEnabled', 'autoCloseEnabled', 'customApiKey'], function (result) {
      if (elements.youtubeSearchToggle) {
        elements.youtubeSearchToggle.checked = result.hasOwnProperty('searchFilterEnabled') ? result.searchFilterEnabled : true;
      }
      if (elements.youtubeChannelToggle) {
        elements.youtubeChannelToggle.checked = result.hasOwnProperty('channelFilterEnabled') ? result.channelFilterEnabled : true;
      }
      if (elements.autoCloseToggle) {
        elements.autoCloseToggle.checked = result.hasOwnProperty('autoCloseEnabled') ? result.autoCloseEnabled : true;
      }
      if (elements.apiKeyInput && result.customApiKey) {
        elements.apiKeyInput.value = result.customApiKey;
      }
    });

    // Check if keyword generation is in progress
    checkGenerationStatus();
  }

  function updateUIState(isTaskRunning) {
    if (isTaskRunning) {
      elements.startTaskBtn.style.display = 'none';
      elements.stopTaskBtn.style.display = 'block';
      elements.taskInput.disabled = true;
    } else {
      elements.startTaskBtn.style.display = 'block';
      elements.stopTaskBtn.style.display = 'none';
      elements.taskInput.disabled = false;
      elements.keywordStats.textContent = '';
    }
  }

  // Check generation status and show progress bar if in progress
  function checkGenerationStatus() {
    chrome.runtime.sendMessage({ action: 'getKeywordGenerationStatus' }, function (response) {
      if (chrome.runtime.lastError) return;

      const status = response?.status;
      if (status && status.inProgress) {
        // Show progress bar with current status
        if (elements.progressContainer) {
          elements.progressContainer.style.display = 'block';
          elements.progressBar.style.width = (status.progress || 10) + '%';
          elements.progressText.textContent = status.message || 'Generating keywords...';
        }
        elements.startTaskBtn.disabled = true;
        elements.taskInput.disabled = true;
        
        // Start polling for updates
        pollGenerationStatus();
      }
    });
  }

  // Poll for generation status updates
  function pollGenerationStatus() {
    const pollInterval = setInterval(() => {
      chrome.runtime.sendMessage({ action: 'getKeywordGenerationStatus' }, function (response) {
        if (chrome.runtime.lastError) {
          clearInterval(pollInterval);
          return;
        }

        const status = response?.status;
        if (!status) {
          clearInterval(pollInterval);
          return;
        }

        if (status.inProgress) {
          // Update progress bar
          if (elements.progressContainer) {
            elements.progressContainer.style.display = 'block';
            elements.progressBar.style.width = (status.progress || 10) + '%';
            elements.progressText.textContent = status.message || 'Generating...';
          }
        } else {
          // Generation finished
          clearInterval(pollInterval);
          elements.startTaskBtn.disabled = false;

          if (status.completed) {
            if (elements.progressContainer) {
              elements.progressBar.style.width = '100%';
              elements.progressText.textContent = `Generated ${status.keywordCount} keywords!`;
              setTimeout(() => {
                elements.progressContainer.style.display = 'none';
              }, 2000);
            }
            showStatus(`Task Started: ${status.keywordCount} keywords generated!`, true, elements.statusTask);
            updateKeywordStats(status.task);
            updateUIState(true);
          } else if (status.error) {
            if (elements.progressContainer) {
              elements.progressContainer.style.display = 'none';
            }
            showStatus('Error: ' + status.error, false, elements.statusTask);
            elements.taskInput.disabled = false; // Re-enable input on error
          }
        }
      });
    }, 1000); // Poll every second
  }

  // Set up event listeners
  function setupEventListeners() {
    // Start Task
    if (elements.startTaskBtn) {
      elements.startTaskBtn.addEventListener('click', function () {
        const taskValue = elements.taskInput.value.trim();
        if (!taskValue) {
          showStatus('Please enter a task', false, elements.statusTask);
          return;
        }

        // Check for API key first
        chrome.storage.local.get(['customApiKey'], function(result) {
          if (!result.customApiKey && !elements.apiKeyInput.value.trim()) {
            showStatus('Please save your Groq API Key first', false, elements.statusTask);
            return;
          }

          showStatus('Starting task...', true, elements.statusTask);
          elements.startTaskBtn.disabled = true;
          elements.taskInput.disabled = true;
  
          chrome.runtime.sendMessage({
            action: 'forceGenerateKeywords',
            task: taskValue
          }, function (response) {
            if (chrome.runtime.lastError) {
              elements.startTaskBtn.disabled = false;
              elements.taskInput.disabled = false;
              showStatus('Error: ' + chrome.runtime.lastError.message, false, elements.statusTask);
              return;
            }
  
            if (response && response.started) {
              // Generation started in background - start polling
              showStatus('Generating keywords...', true, elements.statusTask);
              if (elements.progressContainer) {
                elements.progressContainer.style.display = 'block';
                elements.progressBar.style.width = '10%';
                elements.progressText.textContent = 'Starting...';
              }
              pollGenerationStatus();
            } else if (response && !response.success) {
              elements.startTaskBtn.disabled = false;
              elements.taskInput.disabled = false;
              showStatus('Failed: ' + (response?.error || 'Unknown error'), false, elements.statusTask);
            }
          });
        });
      });
    }

    // Stop Task
    if (elements.stopTaskBtn) {
      elements.stopTaskBtn.addEventListener('click', function() {
        chrome.runtime.sendMessage({ action: 'stopTask' }, function(response) {
          if (response && response.success) {
             elements.taskInput.value = '';
             updateUIState(false);
             showStatus('Task stopped', true, elements.statusTask);
          }
        });
      });
    }

    // YouTube Filter Toggles
    if (elements.youtubeSearchToggle) {
      elements.youtubeSearchToggle.addEventListener('change', function() {
        const enabled = this.checked;
        chrome.storage.local.set({ searchFilterEnabled: enabled });
        chrome.runtime.sendMessage({ 
          action: 'updateSearchFilterPreference', 
          enabled: enabled 
        });
      });
    }

    if (elements.youtubeChannelToggle) {
      elements.youtubeChannelToggle.addEventListener('change', function() {
        const enabled = this.checked;
        chrome.storage.local.set({ channelFilterEnabled: enabled });
        chrome.runtime.sendMessage({ 
          action: 'updateChannelFilterPreference', 
          enabled: enabled 
        });
      });
    }

    // Auto-Close Toggle
    if (elements.autoCloseToggle) {
      elements.autoCloseToggle.addEventListener('change', function() {
        const enabled = this.checked;
        chrome.storage.local.set({ autoCloseEnabled: enabled });
        chrome.runtime.sendMessage({
          action: 'setAutoCloseEnabled',
          enabled: enabled
        });
      });
    }

    // API Key Save
    if (elements.saveApiKeyBtn) {
      elements.saveApiKeyBtn.addEventListener('click', function() {
        const apiKey = elements.apiKeyInput.value.trim();
        chrome.storage.local.set({ customApiKey: apiKey }, function() {
          if (chrome.runtime.lastError) {
            elements.apiKeyStatus.textContent = 'Error saving key';
            elements.apiKeyStatus.style.color = '#ef4444';
          } else {
            elements.apiKeyStatus.textContent = apiKey ? 'API Key saved!' : 'API Key cleared';
            elements.apiKeyStatus.style.color = '#10b981';
            setTimeout(() => { elements.apiKeyStatus.textContent = ''; }, 3000);
          }
        });
      });
    }
  }

  // Helper: Show status message
  function showStatus(message, isSuccess, element, duration = 3000) {
    if (!element) return;

    element.textContent = message;
    element.className = 'status ' + (isSuccess ? 'success' : 'error');
    element.style.display = 'block';

    if (duration > 0) {
      setTimeout(() => {
        element.style.display = 'none';
      }, duration);
    }
  }

  // Helper: Update keyword stats display
  function updateKeywordStats(task) {
    if (!task || !elements.keywordStats) return;

    chrome.storage.local.get(['taskKeywords'], function (result) {
      if (result.taskKeywords && result.taskKeywords[task]) {
        const keywordCount = result.taskKeywords[task].length;
        elements.keywordStats.textContent = `${keywordCount} keywords active`;
        elements.keywordStats.style.display = 'block';
      }
    });
  }
});