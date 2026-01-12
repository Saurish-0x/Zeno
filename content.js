// Content script to gather site information

// Function to extract site information
function getSiteInfo() {
  // Get page title
  const title = document.title || '';
  
  // Get site name (try several methods)
  let siteName = '';
  // Try to get from meta tags
  const siteNameMeta = document.querySelector('meta[property="og:site_name"]');
  if (siteNameMeta) {
    siteName = siteNameMeta.getAttribute('content');
  }
  // If not found, try to extract from URL
  if (!siteName) {
    try {
      const urlObj = new URL(window.location.href);
      siteName = urlObj.hostname.replace('www.', '');
    } catch (e) {
      console.error('Error extracting hostname:', e);
    }
  }
  
  // Get page description
  let description = '';
  // Try meta description
  const descMeta = document.querySelector('meta[name="description"]');
  if (descMeta) {
    description = descMeta.getAttribute('content');
  }
  // Try OpenGraph description
  if (!description) {
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) {
      description = ogDesc.getAttribute('content');
    }
  }
  
  // Get main content text (first few paragraphs)
  if (!description) {
    const paragraphs = document.querySelectorAll('p');
    const textContent = Array.from(paragraphs)
      .slice(0, 3)
      .map(p => p.textContent)
      .join(' ')
      .trim();
    
    if (textContent) {
      description = textContent.substring(0, 200) + (textContent.length > 200 ? '...' : '');
    }
  }
  
  // Extract page content for keyword matching
  let pageContent = '';
  
  // Get text from main content areas, prioritize likely content containers
  const contentSelectors = [
    'main',
    'article',
    '#content',
    '.content',
    '.main',
    '.article',
    '.post',
    '#main-content',
    '.main-content'
  ];
  
  // Try to find a content container first
  let contentContainer = null;
  for (const selector of contentSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      contentContainer = element;
      break;
    }
  }
  
  // If a content container is found, extract text from it
  if (contentContainer) {
    pageContent = contentContainer.innerText;
  } else {
    // Fallback: collect text from paragraphs, headings and list items
    const contentElements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li');
    pageContent = Array.from(contentElements)
      .map(el => el.innerText)
      .join(' ')
      .trim();
  }
  
  // Limit content length to avoid excessive data
  pageContent = pageContent.substring(0, 5000);
  
  return {
    title,
    siteName, 
    description,
    pageContent
  };
}

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSiteInfo') {
    const siteInfo = getSiteInfo();
    sendResponse(siteInfo);
  }
  return true;
}); 