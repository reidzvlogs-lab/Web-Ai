const WCA_STATE = {
  running: false,
  stopRequested: false,
  stepMode: false,
  awaitingStep: false,
  task: "",
  maxSteps: 25,
  stepCount: 0,
  demoMode: false,
  allowlist: [],
  denylist: [],
  safety: {
    requireConfirmRisky: true
  },
  elementMap: new Map(),
  urlAtStart: window.location.href
};

const ACTION_DELAY_MS = 600;
const OVERLAY_IDS = {
  root: "wca-overlay-root",
  cursor: "wca-cursor",
  highlight: "wca-highlight",
  label: "wca-label",
  ripple: "wca-click-ripple",
  typing: "wca-typing-indicator",
  modal: "wca-modal"
};

function ensureOverlay() {
  if (document.getElementById(OVERLAY_IDS.root)) return;
  const root = document.createElement("div");
  root.id = OVERLAY_IDS.root;

  const cursor = document.createElement("div");
  cursor.id = OVERLAY_IDS.cursor;

  const highlight = document.createElement("div");
  highlight.id = OVERLAY_IDS.highlight;

  const label = document.createElement("div");
  label.id = OVERLAY_IDS.label;

  const ripple = document.createElement("div");
  ripple.id = OVERLAY_IDS.ripple;

  const typing = document.createElement("div");
  typing.id = OVERLAY_IDS.typing;
  typing.textContent = "Typing...";

  root.append(cursor, highlight, label, ripple, typing);
  document.body.appendChild(root);
}

function logStatus(message, level = "info") {
  chrome.runtime.sendMessage({
    type: "STATUS_LOG",
    message,
    level,
    timestamp: new Date().toISOString()
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== "hidden" &&
    style.display !== "none"
  );
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function generateSelector(el) {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const parts = [];
  let current = el;
  while (current && current.nodeType === 1 && parts.length < 4) {
    let selector = current.tagName.toLowerCase();
    if (current.classList.length) {
      selector += `.${Array.from(current.classList)
        .slice(0, 2)
        .map((cls) => CSS.escape(cls))
        .join(".")}`;
    }
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (child) => child.tagName === current.tagName
      );
      if (siblings.length > 1) {
        selector += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
    }
    parts.unshift(selector);
    current = current.parentElement;
  }
  return parts.join(" > ");
}

function collectSnapshot() {
  const elements = [];
  WCA_STATE.elementMap.clear();
  const candidates = document.querySelectorAll(
    "a, button, input, textarea, select, [role=button], [contenteditable=true]"
  );
  let count = 0;
  candidates.forEach((el) => {
    if (!isVisible(el)) return;
    const rect = el.getBoundingClientRect();
    const id = `el_${count++}`;
    const elementData = {
      id,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role"),
      text: normalizeText(el.innerText || el.textContent || ""),
      placeholder: el.getAttribute("placeholder"),
      name: el.getAttribute("name"),
      type: el.getAttribute("type"),
      ariaLabel: el.getAttribute("aria-label"),
      cssSelector: generateSelector(el),
      boundingRect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      },
      isVisible: true,
      isEnabled: !el.disabled
    };
    elements.push(elementData);
    WCA_STATE.elementMap.set(id, el);
  });

  const bodyText = normalizeText(document.body.innerText || "");
  const trimmedText = bodyText.slice(0, 4000);

  return {
    url: window.location.href,
    title: document.title,
    visibleText: trimmedText,
    elements
  };
}

function moveCursorTo(x, y) {
  const cursor = document.getElementById(OVERLAY_IDS.cursor);
  if (!cursor) return;
  cursor.style.left = `${x}px`;
  cursor.style.top = `${y}px`;
}

function highlightElement(element, labelText) {
  const highlight = document.getElementById(OVERLAY_IDS.highlight);
  const label = document.getElementById(OVERLAY_IDS.label);
  if (!highlight || !label) return;
  const rect = element.getBoundingClientRect();
  highlight.style.left = `${rect.left}px`;
  highlight.style.top = `${rect.top}px`;
  highlight.style.width = `${rect.width}px`;
  highlight.style.height = `${rect.height}px`;
  label.style.left = `${rect.left}px`;
  label.style.top = `${rect.top}px`;
  label.textContent = labelText;
}

function showClickRipple(x, y) {
  const ripple = document.getElementById(OVERLAY_IDS.ripple);
  if (!ripple) return;
  ripple.style.left = `${x - 6}px`;
  ripple.style.top = `${y - 6}px`;
  ripple.style.opacity = "1";
  ripple.style.transform = "scale(1)";
  ripple.animate(
    [
      { transform: "scale(1)", opacity: 1 },
      { transform: "scale(3)", opacity: 0 }
    ],
    { duration: 400, easing: "ease-out" }
  );
  setTimeout(() => {
    ripple.style.opacity = "0";
  }, 420);
}

function showTypingIndicator(x, y, show) {
  const typing = document.getElementById(OVERLAY_IDS.typing);
  if (!typing) return;
  if (show) {
    typing.style.left = `${x + 8}px`;
    typing.style.top = `${y + 8}px`;
    typing.style.opacity = "1";
  } else {
    typing.style.opacity = "0";
  }
}

async function animateCursorToElement(element) {
  const rect = element.getBoundingClientRect();
  const targetX = rect.left + rect.width / 2;
  const targetY = rect.top + rect.height / 2;
  moveCursorTo(targetX, targetY);
  await sleep(200);
  return { x: targetX, y: targetY };
}

function isRiskyElement(element) {
  const text = normalizeText(
    `${element.innerText || ""} ${
      element.getAttribute("aria-label") || ""
    } ${element.getAttribute("name") || ""} ${
      element.getAttribute("placeholder") || ""
    }`
  ).toLowerCase();
  const type = (element.getAttribute("type") || "").toLowerCase();

  if (type === "submit" || element.tagName.toLowerCase() === "form") return true;
  if (/(pay|card|cvv|cvc|bank|iban|routing|swift)/.test(text)) return true;
  if (/(send|post|publish|submit)/.test(text)) return true;
  if (/(delete|remove|destroy|erase)/.test(text)) return true;
  if (/(password|passcode)/.test(text)) return true;
  return false;
}

function isRiskyAction(action, element) {
  if (!element) return false;
  if (action.type === "navigate") return false;
  if (action.type === "click" || action.type === "keypress" || action.type === "select") {
    return isRiskyElement(element);
  }
  if (action.type === "type") {
    return isRiskyElement(element);
  }
  return false;
}

function showConfirmationModal(message) {
  return new Promise((resolve) => {
    const existing = document.getElementById(OVERLAY_IDS.modal);
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = OVERLAY_IDS.modal;
    modal.innerHTML = `
      <div class="modal-content">
        <strong>Confirm risky action</strong>
        <p>${message}</p>
        <div class="modal-actions">
          <button class="cancel">Cancel</button>
          <button class="confirm">Confirm</button>
        </div>
      </div>
    `;
    const cancelButton = modal.querySelector(".cancel");
    const confirmButton = modal.querySelector(".confirm");
    cancelButton.addEventListener("click", () => {
      modal.remove();
      resolve(false);
    });
    confirmButton.addEventListener("click", () => {
      modal.remove();
      resolve(true);
    });
    document.body.appendChild(modal);
  });
}

async function executeAction(action) {
  if (action.type === "wait") {
    await sleep(action.duration || 500);
    return;
  }

  if (action.type === "scroll") {
    window.scrollBy({
      top: action.direction === "up" ? -action.amount : action.amount,
      behavior: "smooth"
    });
    await sleep(500);
    return;
  }

  if (action.type === "navigate") {
    window.location.href = action.url;
    return;
  }

  const element = WCA_STATE.elementMap.get(action.targetElementId);
  if (!element) {
    throw new Error(`Element ${action.targetElementId} not found`);
  }

  const { x, y } = await animateCursorToElement(element);
  highlightElement(element, action.note || action.type.toUpperCase());

  if (action.type === "click") {
    element.focus();
    element.click();
    showClickRipple(x, y);
  }

  if (action.type === "type") {
    element.focus();
    showTypingIndicator(x, y, true);
    if (element.isContentEditable) {
      element.textContent = action.text;
    } else {
      element.value = action.text;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await sleep(400);
    showTypingIndicator(x, y, false);
  }

  if (action.type === "select") {
    element.focus();
    element.value = action.text;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  if (action.type === "keypress") {
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: action.key, bubbles: true })
    );
    element.dispatchEvent(
      new KeyboardEvent("keyup", { key: action.key, bubbles: true })
    );
  }
}

async function waitForStep() {
  WCA_STATE.awaitingStep = true;
  logStatus("Waiting for Step command...", "info");
  return new Promise((resolve) => {
    const handler = (message) => {
      if (message.type === "STEP_CONTINUE") {
        chrome.runtime.onMessage.removeListener(handler);
        WCA_STATE.awaitingStep = false;
        resolve();
      }
    };
    chrome.runtime.onMessage.addListener(handler);
  });
}

async function runLoop() {
  WCA_STATE.stepCount = 0;
  WCA_STATE.stopRequested = false;
  WCA_STATE.running = true;
  WCA_STATE.urlAtStart = window.location.href;
  ensureOverlay();
  logStatus(`Starting task: ${WCA_STATE.task}`, "info");

  while (WCA_STATE.running && WCA_STATE.stepCount < WCA_STATE.maxSteps) {
    if (WCA_STATE.stopRequested) break;

    const snapshot = collectSnapshot();
    const response = await chrome.runtime.sendMessage({
      type: "MODEL_NEXT_ACTION",
      task: WCA_STATE.task,
      snapshot,
      stepCount: WCA_STATE.stepCount,
      maxSteps: WCA_STATE.maxSteps,
      demoMode: WCA_STATE.demoMode
    });

    if (!response || response.error) {
      logStatus(response?.error || "No response from model", "error");
      break;
    }

    if (response.done) {
      logStatus(response.finalMessage || "Task complete", "success");
      break;
    }

    for (const action of response.actions || []) {
      if (WCA_STATE.stopRequested) break;
      if (action.type === "wait") {
        await executeAction(action);
        continue;
      }

      const element = action.targetElementId
        ? WCA_STATE.elementMap.get(action.targetElementId)
        : null;

      if (WCA_STATE.safety.requireConfirmRisky && isRiskyAction(action, element)) {
        logStatus(`Risky action detected: ${action.note || action.type}`, "warn");
        const approved = await showConfirmationModal(
          `Allow agent to ${action.note || action.type}?`
        );
        if (!approved) {
          logStatus("Risky action cancelled by user", "warn");
          continue;
        }
      }

      try {
        logStatus(`Action: ${action.note || action.type}`, "info");
        await executeAction(action);
        WCA_STATE.stepCount += 1;
      } catch (error) {
        logStatus(`Action failed: ${error.message}`, "error");
      }

      if (WCA_STATE.stepMode) {
        await waitForStep();
      } else {
        await sleep(ACTION_DELAY_MS);
      }
    }

    if (window.location.href !== WCA_STATE.urlAtStart) {
      logStatus("Page changed, re-observing before continuing...", "info");
      WCA_STATE.urlAtStart = window.location.href;
      await sleep(800);
    }
  }

  WCA_STATE.running = false;
  logStatus("Agent stopped", "info");
}

function matchesDomainList(list, hostname) {
  return list.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

function checkDomainAccess(settings) {
  const hostname = window.location.hostname;
  if (settings.denylist.length && matchesDomainList(settings.denylist, hostname)) {
    logStatus("Domain is denylisted. Agent will not run.", "error");
    return false;
  }
  if (settings.allowlist.length && !matchesDomainList(settings.allowlist, hostname)) {
    logStatus("Domain not in allowlist. Agent will not run.", "error");
    return false;
  }
  return true;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RUN_TASK") {
    WCA_STATE.task = message.task || "";
    WCA_STATE.stepMode = message.mode === "step";
    WCA_STATE.demoMode = message.demoMode || false;
    WCA_STATE.maxSteps = message.maxSteps || 25;
    WCA_STATE.safety = message.safety || WCA_STATE.safety;
    WCA_STATE.allowlist = message.allowlist || [];
    WCA_STATE.denylist = message.denylist || [];

    if (!checkDomainAccess({ allowlist: WCA_STATE.allowlist, denylist: WCA_STATE.denylist })) {
      sendResponse({ ok: false });
      return true;
    }

    runLoop();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "STOP_TASK") {
    WCA_STATE.stopRequested = true;
    WCA_STATE.running = false;
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
