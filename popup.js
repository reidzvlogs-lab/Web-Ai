const taskInput = document.getElementById("taskInput");
const runButton = document.getElementById("runButton");
const stepButton = document.getElementById("stepButton");
const stopButton = document.getElementById("stopButton");
const modeToggle = document.getElementById("modeToggle");
const demoMode = document.getElementById("demoMode");
const statusLog = document.getElementById("statusLog");

function appendLog({ message, level, timestamp }) {
  const item = document.createElement("div");
  item.className = `status-item ${level || "info"}`;
  const time = timestamp ? new Date(timestamp).toLocaleTimeString() : "";
  item.textContent = time ? `[${time}] ${message}` : message;
  statusLog.prepend(item);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "STATUS_LOG") {
    appendLog(message);
  }
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getSettings() {
  return chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
}

runButton.addEventListener("click", async () => {
  const tab = await getActiveTab();
  const settings = await getSettings();
  const mode = modeToggle.checked ? "step" : "auto";
  await chrome.tabs.sendMessage(tab.id, {
    type: "RUN_TASK",
    task: taskInput.value,
    mode,
    demoMode: demoMode.checked,
    maxSteps: settings.maxSteps,
    safety: settings.safety,
    allowlist: settings.allowlist,
    denylist: settings.denylist
  });
});

stepButton.addEventListener("click", async () => {
  const tab = await getActiveTab();
  await chrome.tabs.sendMessage(tab.id, { type: "STEP_CONTINUE" });
});

stopButton.addEventListener("click", async () => {
  const tab = await getActiveTab();
  await chrome.tabs.sendMessage(tab.id, { type: "STOP_TASK" });
});
