const DEFAULT_SETTINGS = {
  apiKey: "",
  provider: "openai",
  model: "gpt-4o-mini",
  allowlist: [],
  denylist: [],
  safety: {
    requireConfirmRisky: true
  },
  maxSteps: 25
};

async function getSettings() {
  const stored = await chrome.storage.sync.get("settings");
  return { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
}

async function setSettings(settings) {
  await chrome.storage.sync.set({ settings });
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await setSettings(settings);
});

function validateModelResponse(data) {
  if (!data || typeof data !== "object") return false;
  if (!Array.isArray(data.actions)) return false;
  return true;
}

function demoActions(snapshot, stepCount) {
  const actions = [];
  if (stepCount === 0) {
    actions.push({
      type: "scroll",
      direction: "down",
      amount: 400,
      note: "Scroll down (demo)"
    });
  } else if (stepCount === 1 && snapshot.elements.length) {
    const firstInput = snapshot.elements.find((el) =>
      ["input", "textarea"].includes(el.tag)
    );
    if (firstInput) {
      actions.push({
        type: "type",
        targetElementId: firstInput.id,
        text: "Hello from WebCursor Agent",
        note: "Type in first input (demo)"
      });
    }
  } else if (stepCount === 2) {
    const firstLink = snapshot.elements.find((el) => el.tag === "a");
    if (firstLink) {
      actions.push({
        type: "click",
        targetElementId: firstLink.id,
        note: "Click first link (demo)"
      });
    }
  }

  return {
    thought: "Demo mode action",
    actions,
    done: stepCount >= 2,
    finalMessage: stepCount >= 2 ? "Demo complete" : ""
  };
}

async function callOpenAI({ apiKey, model, task, snapshot }) {
  const systemPrompt = `You are WebCursor Agent. Return STRICT JSON only.\n\nJSON schema:\n{\n  \"thought\": \"short non-sensitive reasoning\",\n  \"actions\": [\n    {\n      \"type\": \"click|type|scroll|wait|keypress|navigate|select\",\n      \"targetElementId\": \"el_123\",\n      \"text\": \"...\",\n      \"key\": \"Enter|Tab|ArrowDown|...\",\n      \"direction\": \"up|down\",\n      \"amount\": 120,\n      \"url\": \"https://example.com\",\n      \"note\": \"human-readable step label\"\n    }\n  ],\n  \"done\": false,\n  \"finalMessage\": \"...\"\n}`;

  const userContent = {
    task,
    snapshot
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(userContent) }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error("Model response was not valid JSON.");
  }

  if (!validateModelResponse(parsed)) {
    throw new Error("Model response did not match expected format.");
  }

  return parsed;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "MODEL_NEXT_ACTION") {
    (async () => {
      try {
        const settings = await getSettings();
        if (message.demoMode) {
          sendResponse(demoActions(message.snapshot, message.stepCount));
          return;
        }
        if (!settings.apiKey) {
          sendResponse({ error: "API key missing. Set it in options." });
          return;
        }
        if (settings.provider !== "openai") {
          sendResponse({ error: "Only OpenAI provider is configured." });
          return;
        }
        const result = await callOpenAI({
          apiKey: settings.apiKey,
          model: settings.model,
          task: message.task,
          snapshot: message.snapshot
        });
        sendResponse(result);
      } catch (error) {
        sendResponse({ error: error.message });
      }
    })();
    return true;
  }

  if (message.type === "GET_SETTINGS") {
    (async () => {
      const settings = await getSettings();
      sendResponse(settings);
    })();
    return true;
  }

  if (message.type === "SAVE_SETTINGS") {
    (async () => {
      await setSettings(message.settings);
      sendResponse({ ok: true });
    })();
    return true;
  }

  return false;
});
