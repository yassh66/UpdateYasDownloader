// Bounded TTL tracking to prevent duplicate interceptions or event loops
const interceptedDownloads = new Map(); // downloadId -> { timestamp: number, dispatched: boolean, filename?: string }
const processedUrls = new Map(); // url -> timestamp
const DEDUPLICATION_TTL_MS = 60000; // 60 seconds TTL

// In-memory cache of autoIntercept setting for instant synchronous check
let isAutoInterceptEnabled = true;
chrome.storage.local.get({ autoIntercept: true }, (res) => {
  if (typeof res.autoIntercept === 'boolean') {
    isAutoInterceptEnabled = res.autoIntercept;
  }
});
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.autoIntercept) {
    isAutoInterceptEnabled = changes.autoIntercept.newValue;
  }
});

// Clean up expired deduplication entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, data] of interceptedDownloads.entries()) {
    if (now - (data.timestamp || 0) > DEDUPLICATION_TTL_MS) {
      interceptedDownloads.delete(id);
    }
  }
  for (const [url, time] of processedUrls.entries()) {
    if (now - time > DEDUPLICATION_TTL_MS) {
      processedUrls.delete(url);
    }
  }
}, 30000);

// Initialize context menu and settings
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "download-with-yas",
    title: "Download with YAS Downloader",
    contexts: ["link", "page"]
  });

  // Ensure default storage settings exist
  chrome.storage.local.get({ autoIntercept: true }, (res) => {
    if (typeof res.autoIntercept === 'undefined') {
      chrome.storage.local.set({ autoIntercept: true });
      isAutoInterceptEnabled = true;
    } else {
      isAutoInterceptEnabled = res.autoIntercept;
    }
  });
});

// Helper to check if URL should be ignored
function shouldIgnoreUrl(url) {
  if (!url || typeof url !== 'string') return true;
  const lower = url.toLowerCase().trim();
  return (
    lower.startsWith('blob:') ||
    lower.startsWith('data:') ||
    lower.startsWith('chrome:') ||
    lower.startsWith('chrome-extension:') ||
    lower.startsWith('brave:') ||
    lower.startsWith('edge:') ||
    lower.startsWith('about:') ||
    lower.startsWith('devtools:') ||
    lower.startsWith('javascript:')
  );
}

// Helper to safely extract cookies for a given URL
async function getCookiesForUrl(url) {
  try {
    const cookies = await chrome.cookies.getAll({ url });
    if (!cookies || cookies.length === 0) return '';
    return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  } catch (err) {
    // If host permissions or malformed URL prevents cookie access, fail gracefully
    return '';
  }
}

// Helper to extract clean filename from download item or URL
function extractFilename(downloadItem) {
  if (downloadItem.filename && downloadItem.filename.trim()) {
    const clean = downloadItem.filename.trim().replace(/^.*[\\\/]/, '');
    if (clean) return clean;
  }
  try {
    const urlStr = downloadItem.finalUrl || downloadItem.url;
    if (urlStr) {
      const parsed = new URL(urlStr);
      const basename = parsed.pathname.split('/').filter(Boolean).pop();
      if (basename) return decodeURIComponent(basename);
    }
  } catch (e) {}
  return 'downloaded_file';
}

// Native messaging dispatcher
function sendToNativeHost(payload, callback) {
  chrome.runtime.sendNativeMessage(
    "com.yas.downloader",
    payload,
    (response) => {
      if (chrome.runtime.lastError) {
        console.warn("[YAS Extension] Native Messaging error:", chrome.runtime.lastError.message);
        if (callback) callback(false, chrome.runtime.lastError.message);
      } else {
        console.log("[YAS Extension] Native Host response:", response);
        if (callback) callback(true, response);
      }
    }
  );
}

// Helper to perform immediate synchronous browser download cancellation & erasure
function cancelAndEraseBrowserDownload(downloadId) {
  if (!downloadId) return;
  try {
    chrome.downloads.cancel(downloadId, () => {
      if (chrome.runtime.lastError) {}
      try {
        chrome.downloads.erase({ id: downloadId }, () => {
          if (chrome.runtime.lastError) {}
        });
      } catch (e) {}
    });
  } catch (e) {}
}

// Handle Context Menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "download-with-yas") {
    const targetUrl = info.linkUrl || info.pageUrl;
    if (!targetUrl || shouldIgnoreUrl(targetUrl)) return;

    const cookies = await getCookiesForUrl(targetUrl);
    const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const payload = {
      action: "intercept-download",
      requestId,
      url: targetUrl,
      finalUrl: targetUrl,
      filename: "",
      fileSize: 0,
      mime: "",
      referrer: info.pageUrl || (tab && tab.url) || "",
      cookies: cookies || "",
      userAgent: navigator.userAgent
    };

    console.log("[YAS Extension] Sending context-menu download to YAS Downloader:", targetUrl);
    sendToNativeHost(payload);
  }
});

// Centralized Interception Handler
async function handleIntercept(downloadItem, source) {
  try {
    if (!downloadItem || !downloadItem.id) return;
    const downloadUrl = downloadItem.url || downloadItem.finalUrl;
    if (shouldIgnoreUrl(downloadUrl)) return;

    // Check if auto-interception is enabled
    if (!isAutoInterceptEnabled) {
      return;
    }

    // Step 1: Immediately cancel & erase browser download to stop any browser UI/bubble/shelf/disk-write
    cancelAndEraseBrowserDownload(downloadItem.id);

    const existingEntry = interceptedDownloads.get(downloadItem.id);
    const hasDispatched = existingEntry?.dispatched;

    // If already dispatched to YAS from onDeterminingFilename, don't duplicate
    if (hasDispatched) {
      return;
    }

    // Mark as being handled
    interceptedDownloads.set(downloadItem.id, {
      timestamp: Date.now(),
      dispatched: true,
      filename: downloadItem.filename || existingEntry?.filename || ''
    });

    // Suppress rapid duplicate URLs within 2 seconds
    const lastUrlTime = processedUrls.get(downloadUrl);
    if (lastUrlTime && (Date.now() - lastUrlTime < 2000)) {
      return;
    }
    processedUrls.set(downloadUrl, Date.now());

    // Extract cookies and rich metadata
    const cookies = await getCookiesForUrl(downloadUrl);
    const suggestedFilename = extractFilename(downloadItem);
    const totalBytes = typeof downloadItem.totalBytes === 'number' && downloadItem.totalBytes > 0 
      ? downloadItem.totalBytes 
      : (downloadItem.fileSize || 0);

    const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const payload = {
      action: "intercept-download",
      requestId,
      url: downloadUrl,
      finalUrl: downloadItem.finalUrl || downloadUrl,
      filename: suggestedFilename,
      fileSize: totalBytes,
      mime: downloadItem.mime || "",
      referrer: downloadItem.referrer || "",
      cookies: cookies || "",
      userAgent: navigator.userAgent
    };

    console.log(`[YAS Extension] Intercepted from ${source} [ID: ${downloadItem.id}]:`, suggestedFilename);
    sendToNativeHost(payload, (success, err) => {
      if (!success) {
        console.error("[YAS Extension] Failed to hand off download to YAS Downloader:", err);
      }
    });
  } catch (error) {
    console.error(`[YAS Extension] Error during ${source} interception:`, error);
  }
}

// 1. Hook onDeterminingFilename:
// In Chromium/Brave, registering this listener pauses the browser's filename determination and Save-As UI.
// Cancelling here guarantees the browser never shows the native download shelf, bubble, or save dialog.
if (chrome.downloads.onDeterminingFilename) {
  chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
    const downloadUrl = downloadItem.url || downloadItem.finalUrl;
    if (shouldIgnoreUrl(downloadUrl)) {
      if (suggest) suggest();
      return;
    }

    if (!isAutoInterceptEnabled) {
      if (suggest) suggest();
      return;
    }

    // Step A: Immediately cancel & erase before Chromium renders prompt/bubble
    cancelAndEraseBrowserDownload(downloadItem.id);

    // Step B: Resolve suggest immediately so Chromium doesn't hang waiting for callback
    if (suggest) {
      try {
        suggest();
      } catch (e) {}
    }

    // Step C: Route to centralized interception with rich Content-Disposition metadata
    handleIntercept(downloadItem, "onDeterminingFilename");
  });
}

// 2. Hook onCreated:
// Catches downloads at initial item instantiation stage
chrome.downloads.onCreated.addListener((downloadItem) => {
  const downloadUrl = downloadItem.url || downloadItem.finalUrl;
  if (shouldIgnoreUrl(downloadUrl)) return;
  if (!isAutoInterceptEnabled) return;

  // Fast cancel & erase at the earliest possible microtask
  cancelAndEraseBrowserDownload(downloadItem.id);

  // If onDeterminingFilename is available, it will fire right after with full filename/headers.
  // But if onDeterminingFilename is not fired within 150ms, handle via onCreated as fallback.
  setTimeout(() => {
    const entry = interceptedDownloads.get(downloadItem.id);
    if (!entry || !entry.dispatched) {
      handleIntercept(downloadItem, "onCreated");
    }
  }, 150);
});

// 3. Hook onChanged:
// When the download transitions to 'interrupted' state after cancellation, ensure it is completely erased from shelf/bubble/history
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.id) {
    // If state is interrupted, complete, or any change occurs on intercepted downloads, erase from UI
    if (interceptedDownloads.has(delta.id) || (delta.state && delta.state.current === 'interrupted')) {
      try {
        chrome.downloads.erase({ id: delta.id }, () => {
          if (chrome.runtime.lastError) {}
        });
      } catch (e) {}
    }
  }
});
