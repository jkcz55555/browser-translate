document.addEventListener('DOMContentLoaded', () => {
  const sourceLangSelect = document.getElementById('sourceLang');
  const targetLangSelect = document.getElementById('targetLang');
  const apiKeyInput = document.getElementById('apiKey');
  const apiUrlInput = document.getElementById('apiUrl');
  const translateBtn = document.getElementById('translateBtn');
  const stopBtn = document.getElementById('stopBtn');
  const statusDiv = document.getElementById('status');
  const autoTranslateToggle = document.getElementById('autoTranslateToggle');
  const showTranslationToggle = document.getElementById('showTranslationToggle');

  // 加载保存的设置
  chrome.storage.local.get(['apiKey', 'apiUrl', 'sourceLang', 'targetLang', 'autoTranslateEnabled', 'showTranslation'], (result) => {
    if (result.apiKey) apiKeyInput.value = result.apiKey;
    if (result.apiUrl) apiUrlInput.value = result.apiUrl;
    if (result.sourceLang) sourceLangSelect.value = result.sourceLang;
    if (result.targetLang) targetLangSelect.value = result.targetLang;
    if (result.autoTranslateEnabled !== undefined) autoTranslateToggle.checked = result.autoTranslateEnabled;
    if (result.showTranslation !== undefined) showTranslationToggle.checked = result.showTranslation;
  });

  // 保存设置
  function saveSettings() {
    chrome.storage.local.set({
      apiKey: apiKeyInput.value,
      apiUrl: apiUrlInput.value || 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      sourceLang: sourceLangSelect.value,
      targetLang: targetLangSelect.value
    });
  }

  apiKeyInput.addEventListener('change', saveSettings);
  apiUrlInput.addEventListener('change', saveSettings);
  sourceLangSelect.addEventListener('change', saveSettings);
  targetLangSelect.addEventListener('change', saveSettings);

  // 自动翻译开关
  autoTranslateToggle.addEventListener('change', async () => {
    const enabled = autoTranslateToggle.checked;
    chrome.storage.local.set({ autoTranslateEnabled: enabled });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'toggleAutoTranslate',
        enabled: enabled
      });
    }

    if (enabled) {
      showStatus('自动翻译已开启', 'success');
    } else {
      showStatus('自动翻译已关闭', 'info');
    }
  });

  // 显示译文开关
  showTranslationToggle.addEventListener('change', async () => {
    const enabled = showTranslationToggle.checked;
    chrome.storage.local.set({ showTranslation: enabled });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'toggleShowTranslation',
        enabled: enabled
      });
    }

    if (enabled) {
      showStatus('已显示译文', 'success');
    } else {
      showStatus('已隐藏译文，仅显示原文', 'info');
    }
  });

  // 开始翻译
  translateBtn.addEventListener('click', async () => {
    if (!apiKeyInput.value.trim()) {
      showStatus('请先输入 API Key', 'error');
      return;
    }

    saveSettings();

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    showStatus('正在注入翻译脚本...', 'translating');
    translateBtn.disabled = true;
    stopBtn.disabled = false;

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });

      chrome.tabs.sendMessage(tab.id, {
        action: 'startTranslate',
        apiKey: apiKeyInput.value,
        apiUrl: apiUrlInput.value || 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        sourceLang: sourceLangSelect.value,
        targetLang: targetLangSelect.value
      });

      showStatus('翻译已开始', 'success');
    } catch (error) {
      showStatus('翻译失败: ' + error.message, 'error');
      translateBtn.disabled = false;
      stopBtn.disabled = true;
    }
  });

  // 停止翻译
  stopBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    chrome.tabs.sendMessage(tab.id, { action: 'stopTranslate' });
    showStatus('翻译已停止', 'success');
    translateBtn.disabled = false;
    stopBtn.disabled = true;
  });

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
  }
});
