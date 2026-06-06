// content.js - 网页内容翻译脚本（自动翻译优化版）

(function() {
  // 防止重复注入
  if (window.__translatorInjected) return;
  window.__translatorInjected = true;

  let isTranslating = false;
  let translationCache = new Map();
  let domainCache = {};
  let translatedNodes = new Set();
  let autoTranslateEnabled = false;
  let showTranslation = true;
  const DEFAULT_BATCH_SIZE = 40;
  const DEFAULT_CONCURRENCY = 2;
  const MIN_RETRY_BATCH_SIZE = 8;
  const MAX_RETRY_ATTEMPTS = 3;

  // 监听来自 popup 的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startTranslate') {
      startTranslation(request);
      sendResponse({ status: 'started' });
    } else if (request.action === 'stopTranslate') {
      stopTranslation();
      sendResponse({ status: 'stopped' });
    } else if (request.action === 'toggleAutoTranslate') {
      autoTranslateEnabled = request.enabled;
      chrome.storage.local.set({ autoTranslateEnabled: request.enabled });
      sendResponse({ status: 'ok' });
    } else if (request.action === 'toggleShowTranslation') {
      showTranslation = request.enabled;
      chrome.storage.local.set({ showTranslation: request.enabled });
      applyShowTranslation(showTranslation);
      sendResponse({ status: 'ok' });
    }
    return true;
  });

  // 页面加载完成后自动翻译
  function initAutoTranslate() {
    chrome.storage.local.get(['autoTranslateEnabled', 'apiKey', 'apiUrl', 'sourceLang', 'targetLang', 'showTranslation'], (result) => {
      autoTranslateEnabled = result.autoTranslateEnabled || false;
      showTranslation = result.showTranslation !== false; // 默认显示
      
      if (autoTranslateEnabled && result.apiKey) {
        console.log('Auto-translate enabled, starting...');
        startTranslation({
          apiKey: result.apiKey,
          apiUrl: result.apiUrl || 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
          sourceLang: result.sourceLang || 'auto',
          targetLang: result.targetLang || 'zh'
        });
      }
    });
  }

  // 立即尝试执行，如果页面还没加载完就等 load 事件
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initAutoTranslate();
  } else {
    window.addEventListener('load', initAutoTranslate);
  }

  // 获取当前域名
  function getCurrentDomain() {
    return window.location.hostname;
  }

  // 加载域名缓存
  async function loadDomainCache() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['domainTranslationCache'], (result) => {
        domainCache = result.domainTranslationCache || {};
        const currentDomain = getCurrentDomain();
        if (domainCache[currentDomain]) {
          Object.entries(domainCache[currentDomain]).forEach(([key, value]) => {
            translationCache.set(key, value);
          });
          console.log(`Loaded ${Object.keys(domainCache[currentDomain]).length} cached translations for ${currentDomain}`);
        }
        resolve();
      });
    });
  }

  // 保存域名缓存
  function saveDomainCache() {
    const currentDomain = getCurrentDomain();
    if (!domainCache[currentDomain]) {
      domainCache[currentDomain] = {};
    }
    translationCache.forEach((value, key) => {
      domainCache[currentDomain][key] = value;
    });
    chrome.storage.local.set({ domainTranslationCache: domainCache });
  }

  async function startTranslation(config) {
    if (isTranslating) return;
    isTranslating = true;

    console.log('Starting translation...');

    // 加载缓存
    await loadDomainCache();

    // 创建翻译面板
    createTranslationPanel();

    // 获取页面文本节点
    const textNodes = getTextNodes(document.body);
    console.log('Found', textNodes.length, 'text nodes');

    if (textNodes.length === 0) {
      updateStatus('未找到可翻译的文本', 'error');
      isTranslating = false;
      return;
    }

    // 按可见性排序
    const sortedNodes = sortByVisibility(textNodes);

    // 批量并行翻译（降低并发避免 429）
    const batchSize = DEFAULT_BATCH_SIZE;
    const concurrency = DEFAULT_CONCURRENCY;
    let completed = 0;

    for (let i = 0; i < sortedNodes.length && isTranslating; i += batchSize) {
      const batch = sortedNodes.slice(i, i + batchSize);
      await translateBatchOptimized(batch, config, concurrency);
      completed += batch.length;
      updateProgress(completed, sortedNodes.length);
    }

    // 保存缓存
    saveDomainCache();

    if (isTranslating) {
      updateStatus(`翻译完成！缓存 ${translationCache.size} 条`, 'success');
    }
  }

  function stopTranslation() {
    isTranslating = false;
    updateStatus('翻译已停止', 'info');
  }

  // 按可见性排序
  function sortByVisibility(nodes) {
    return nodes.map(node => {
      const rect = node.parentElement?.getBoundingClientRect();
      const isVisible = rect && rect.top < window.innerHeight && rect.bottom > 0;
      return { node, isVisible, top: rect?.top || Infinity };
    })
    .sort((a, b) => {
      if (a.isVisible !== b.isVisible) return b.isVisible - a.isVisible;
      return a.top - b.top;
    })
    .map(item => item.node);
  }

  // 获取文本节点
  function getTextNodes(element) {
    const nodes = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          const parent = node.parentElement;
          if (!parent || parent.closest('script, style, noscript, [data-translated], pre, code, [class*="code"], [class*="Code"], [class*="highlight"], [class*="syntax"]')) {
            return NodeFilter.FILTER_REJECT;
          }
          if (translatedNodes.has(node)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (node.textContent.trim().length > 2) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_REJECT;
        }
      }
    );

    let node;
    while (node = walker.nextNode()) {
      nodes.push(node);
    }
    return nodes;
  }

  // 优化的批量翻译
  async function translateBatchOptimized(nodes, config, concurrency) {
    const texts = nodes.map(n => n.textContent.trim());
    const uniqueTexts = [...new Set(texts)];

    // 分离已缓存和需要翻译的
    const toTranslate = [];
    const translations = {};

    uniqueTexts.forEach(text => {
      if (translationCache.has(text)) {
        translations[text] = translationCache.get(text);
      } else {
        toTranslate.push(text);
      }
    });

    const cachedCount = uniqueTexts.length - toTranslate.length;
    console.log(`Batch: ${uniqueTexts.length} texts, ${toTranslate.length} to translate, ${cachedCount} from cache`);

    // 并行批量翻译（降低并发避免 429）
    if (toTranslate.length > 0) {
      const chunks = chunkArray(toTranslate, Math.ceil(toTranslate.length / concurrency));
      const allResults = await Promise.all(
        chunks.map(chunk => translateBatchWithFallback(chunk, config))
      );
      
      // 合并结果
      let idx = 0;
      for (const results of allResults) {
        for (const result of results) {
          const text = toTranslate[idx];
          translations[text] = result;
          translationCache.set(text, result);
          idx++;
        }
      }
    }

    // 更新 DOM
    nodes.forEach(node => {
      if (!isTranslating) return;
      const text = node.textContent.trim();
      const translated = translations[text];
      if (translated && translated !== text) {
        wrapTextWithTranslation(node, text, translated);
        translatedNodes.add(node);
      }
    });
  }

  function chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  async function translateBatchWithFallback(texts, config, attempt = 0) {
    try {
      const results = await translateBatch(texts, config);
      if (results.length !== texts.length) {
        throw new Error(`Translation count mismatch: expected ${texts.length}, got ${results.length}`);
      }
      return results;
    } catch (error) {
      const shouldSplit = texts.length > MIN_RETRY_BATCH_SIZE && error.status !== 429;
      if (shouldSplit) {
        const middle = Math.ceil(texts.length / 2);
        const left = await translateBatchWithFallback(texts.slice(0, middle), config, attempt);
        const right = await translateBatchWithFallback(texts.slice(middle), config, attempt);
        return left.concat(right);
      }

      if (attempt < MAX_RETRY_ATTEMPTS) {
        const waitMs = error.status === 429
          ? Math.min(2000 * Math.pow(2, attempt), 12000)
          : Math.min(1000 * Math.pow(2, attempt), 6000);
        await delay(waitMs);
        return translateBatchWithFallback(texts, config, attempt + 1);
      }

      console.warn('Translation batch failed, keeping original text:', error);
      return texts;
    }
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 批量翻译函数 - 一次 API 调用翻译多个文本
  async function translateBatch(texts, config) {
    const endpoint = getApiEndpoint(config.apiUrl);
    const model = getModelName(config.apiUrl);
    
    // 将多个文本合并成一个请求
    const combinedText = texts.join('\n---SEP---\n');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'system',
              content: `你是一个专业的翻译助手。请将用户输入的文本从${config.sourceLang === 'auto' ? '自动检测的语言' : config.sourceLang}翻译为${config.targetLang}。文本之间用 ---SEP--- 分隔。请保持相同的分隔符返回翻译结果。只输出翻译结果，不要添加任何解释。`
            },
            {
              role: 'user',
              content: combinedText
            }
          ],
          temperature: 0.3,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // 429 限流，等待后重试
      if (response.status === 429) {
        const error = new Error('Rate limited');
        error.status = 429;
        throw error;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 请求失败: ${response.status}`);
      }

      const data = await response.json();
      const result = data.choices[0].message.content;
      
      // 分割结果
      return result.split('\n---SEP---\n').map(t => t.trim());
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('请求超时');
      }
      throw error;
    }
  }

  function getModelName(apiUrl) {
    if (apiUrl.includes('bigmodel.cn')) {
      return 'glm-4-flash';
    }
    if (apiUrl.includes('deepseek')) {
      return 'deepseek-chat';
    }
    return 'gpt-4o-mini';
  }

  function getApiEndpoint(apiUrl) {
    if (apiUrl.endsWith('/chat/completions')) {
      return apiUrl;
    }
    return `${apiUrl}/chat/completions`;
  }

  function wrapTextWithTranslation(node, original, translated) {
    if (!node || !node.parentNode) return;

    const container = document.createElement('span');
    container.className = 'translation-container-inline';
    container.setAttribute('data-translated', 'true');

    const originalSpan = document.createElement('span');
    originalSpan.className = 'original-text';
    originalSpan.textContent = original;

    const translatedSpan = document.createElement('span');
    translatedSpan.className = 'translated-text';
    translatedSpan.textContent = translated;
    if (!showTranslation) {
      translatedSpan.style.display = 'none';
    }

    container.appendChild(originalSpan);
    container.appendChild(translatedSpan);

    try {
      node.parentNode.replaceChild(container, node);
    } catch (e) {
      console.warn('Failed to replace node:', e);
    }
  }

  function applyShowTranslation(enabled) {
    document.querySelectorAll('.translated-text').forEach(el => {
      el.style.display = enabled ? '' : 'none';
    });
  }

  function createTranslationPanel() {
    const existing = document.getElementById('translation-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'translation-panel';
    panel.innerHTML = `
      <div class="panel-header" style="background: linear-gradient(135deg, #00b4d8 0%, #48cae4 100%);">
        <span> AI 翻译中...</span>
        <button id="close-translation-panel">×</button>
      </div>
      <div class="panel-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: 0%; background: linear-gradient(135deg, #00b4d8 0%, #48cae4 100%);"></div>
        </div>
        <span class="progress-text">0%</span>
      </div>
      <div class="panel-status">正在准备翻译...</div>
    `;

    document.body.appendChild(panel);

    panel.querySelector('#close-translation-panel').addEventListener('click', () => {
      stopTranslation();
      panel.remove();
    });
  }

  function updateProgress(current, total) {
    const panel = document.getElementById('translation-panel');
    if (!panel) return;

    const percent = Math.round((current / total) * 100);
    panel.querySelector('.progress-fill').style.width = percent + '%';
    panel.querySelector('.progress-text').textContent = percent + '%';
    panel.querySelector('.panel-status').textContent = `正在翻译... ${current}/${total}`;
  }

  function updateStatus(message, type) {
    const panel = document.getElementById('translation-panel');
    if (!panel) return;

    const statusEl = panel.querySelector('.panel-status');
    statusEl.textContent = message;
    statusEl.className = 'panel-status status-' + type;
  }
})();
