// background.js - Service Worker

chrome.runtime.onInstalled.addListener(() => {
  console.log('AI 翻译插件已安装');
});

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSettings') {
    chrome.storage.local.get(['apiKey', 'apiUrl', 'sourceLang', 'targetLang'], (result) => {
      sendResponse(result);
    });
    return true;
  }
});
