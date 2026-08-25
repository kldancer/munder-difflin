(() => {
  "use strict";

  const data = window.MUNDER_MANUAL_DATA;
  if (!data) throw new Error("MUNDER_MANUAL_DATA 未加载");

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const list = (items) => `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
  const layerById = new Map(data.layers.map((layer) => [layer.id, layer]));

  $("[data-version]").textContent = data.version;

  // ── Chapters ─────────────────────────────────────────────────────────────
  const validChapters = new Set(["architecture", "journey", "files", "failures"]);

  function showChapter(chapter, updateHash = true) {
    const next = validChapters.has(chapter) ? chapter : "architecture";
    $$("[data-chapter]").forEach((button) => {
      const active = button.dataset.chapter === next;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    $$("[data-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === next));
    if (updateHash && window.location.hash !== `#${next}`) history.replaceState(null, "", `#${next}`);
  }

  $$("[data-chapter]").forEach((button) => button.addEventListener("click", () => showChapter(button.dataset.chapter)));
  showChapter(window.location.hash.slice(1), false);

  // ── Architecture ─────────────────────────────────────────────────────────
  const city = $("[data-city]");
  const layerInspector = $("[data-layer-inspector]");
  city.innerHTML = `
    <svg class="city-wires" viewBox="0 0 680 560" preserveAspectRatio="none" aria-hidden="true">
      <path d="M340 60 L340 168"/><path d="M340 168 L122 280"/><path d="M340 168 L340 280"/><path d="M340 168 L558 280"/>
      <path d="M122 330 L122 462"/><path d="M340 330 L122 462"/><path d="M340 330 L558 462"/><path d="M558 330 L558 462"/>
      <circle cx="340" cy="168" r="5"/>
    </svg>
    <div class="human-node"><span>🧑🏻‍💼</span><span>你：目标、结论与最终授权</span></div>
  `;

  data.layers.forEach((layer) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "layer-node";
    button.dataset.layer = layer.id;
    button.style.setProperty("--layer-color", layer.color);
    button.innerHTML = `<span class="node-icon">${layer.icon}</span><span><strong>${layer.name}</strong><small>${layer.metaphor}</small></span>`;
    city.appendChild(button);
  });

  function showLayer(id) {
    const layer = layerById.get(id) || data.layers[0];
    $$("[data-layer]", city).forEach((button) => {
      const active = button.dataset.layer === layer.id;
      button.classList.toggle("is-active", active);
      button.classList.toggle("is-dim", !active);
    });
    layerInspector.style.setProperty("--layer-color", layer.color);
    layerInspector.innerHTML = `
      <div class="inspector-header">
        <span class="big-icon">${layer.icon}</span>
        <div><h3>${layer.name}</h3><span>${layer.metaphor}</span></div>
      </div>
      <p class="inspector-summary">${layer.summary}</p>
      <div class="fact-block positive"><h4>它拥有的权威事实</h4>${list(layer.owns)}</div>
      <div class="fact-block negative"><h4>它明确不负责</h4>${list(layer.notOwns)}</div>
      <div class="fact-block"><h4>读取</h4>${list(layer.reads)}</div>
      <div class="fact-block"><h4>写入</h4>${list(layer.writes)}</div>
      <a class="source-link" href="${layer.href}">查看权威来源 → ${layer.source}</a>
    `;
  }

  $$("[data-layer]", city).forEach((button) => button.addEventListener("click", () => showLayer(button.dataset.layer)));
  showLayer("munder");

  // ── Task journey ─────────────────────────────────────────────────────────
  const journeyTrack = $("[data-journey-track]");
  const stepCard = $("[data-step-card]");
  const stepCount = $("[data-step-count]");
  const journeyProgress = $("[data-journey-progress]");
  const prevStep = $("[data-prev-step]");
  const nextStep = $("[data-next-step]");
  const playJourney = $("[data-play-journey]");
  let journeyIndex = 0;
  let journeyTimer = null;

  data.taskSteps.forEach((step, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "journey-node";
    button.dataset.step = String(index);
    button.innerHTML = `<span class="step-index">${index + 1}</span><strong>${step.icon} ${step.title}</strong>`;
    journeyTrack.appendChild(button);
  });

  function stopJourney() {
    if (journeyTimer) window.clearInterval(journeyTimer);
    journeyTimer = null;
    playJourney.textContent = "▶ 自动播放";
  }

  function showJourneyStep(index) {
    journeyIndex = Math.max(0, Math.min(data.taskSteps.length - 1, index));
    const step = data.taskSteps[journeyIndex];
    const target = layerById.get(step.target);
    $$("[data-step]", journeyTrack).forEach((node, nodeIndex) => {
      node.classList.toggle("is-current", nodeIndex === journeyIndex);
      node.classList.toggle("is-past", nodeIndex < journeyIndex);
    });
    stepCount.textContent = `${journeyIndex + 1} / ${data.taskSteps.length}`;
    journeyProgress.style.width = `${((journeyIndex + 1) / data.taskSteps.length) * 100}%`;
    prevStep.disabled = journeyIndex === 0;
    nextStep.disabled = journeyIndex === data.taskSteps.length - 1;
    stepCard.innerHTML = `
      <div>
        <div class="step-hero-icon">${step.icon}</div>
        <div class="step-label">第 ${journeyIndex + 1} 步 · ${step.actor.toUpperCase()}</div>
        <h3>${step.title}</h3>
        <p>${step.text}</p>
      </div>
      <div class="target-chip">本步主要落点：${target ? `${target.icon} ${target.name}` : "系统边界"}</div>
    `;
  }

  $$("[data-step]", journeyTrack).forEach((button) => button.addEventListener("click", () => {
    stopJourney();
    showJourneyStep(Number(button.dataset.step));
  }));
  prevStep.addEventListener("click", () => { stopJourney(); showJourneyStep(journeyIndex - 1); });
  nextStep.addEventListener("click", () => { stopJourney(); showJourneyStep(journeyIndex + 1); });
  playJourney.addEventListener("click", () => {
    if (journeyTimer) { stopJourney(); return; }
    if (journeyIndex === data.taskSteps.length - 1) showJourneyStep(0);
    playJourney.textContent = "Ⅱ 暂停播放";
    journeyTimer = window.setInterval(() => {
      if (journeyIndex === data.taskSteps.length - 1) { stopJourney(); return; }
      showJourneyStep(journeyIndex + 1);
    }, 2600);
  });
  showJourneyStep(0);

  // ── File microscope ──────────────────────────────────────────────────────
  const fileList = $("[data-file-list]");
  const fileInspector = $("[data-file-inspector]");
  let fileGroup = "hive";
  let fileIndex = 0;

  function showFile(index) {
    const entries = data.files[fileGroup];
    fileIndex = Math.max(0, Math.min(entries.length - 1, index));
    const file = entries[fileIndex];
    $$("[data-file-index]", fileList).forEach((row) => row.classList.toggle("is-active", Number(row.dataset.fileIndex) === fileIndex));
    fileInspector.innerHTML = `
      <div class="inspector-header"><span class="big-icon">${file.icon}</span><div><h3>${file.name}</h3><span>${file.owner}</span></div></div>
      <code class="path-box">${file.path}</code>
      <div class="file-fact"><span>默认写入者</span><p>${file.owner}</p></div>
      <div class="file-fact"><span>保存内容</span><p>${file.stores}</p></div>
      <div class="file-fact danger"><span>禁止混入</span><p>${file.excludes}</p></div>
    `;
  }

  function renderFileGroup(group) {
    fileGroup = Object.prototype.hasOwnProperty.call(data.files, group) ? group : "hive";
    fileIndex = 0;
    $$("[data-file-group]").forEach((button) => button.classList.toggle("is-active", button.dataset.fileGroup === fileGroup));
    fileList.innerHTML = "";
    data.files[fileGroup].forEach((file, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "file-row";
      button.dataset.fileIndex = String(index);
      button.innerHTML = `<span class="file-icon">${file.icon}</span><span><strong>${file.name}</strong><code>${file.path}</code></span>`;
      button.addEventListener("click", () => showFile(index));
      fileList.appendChild(button);
    });
    showFile(0);
  }

  $$("[data-file-group]").forEach((button) => button.addEventListener("click", () => renderFileGroup(button.dataset.fileGroup)));
  renderFileGroup("hive");

  // ── Failure recovery ─────────────────────────────────────────────────────
  const failureList = $("[data-failure-list]");
  const failureDetail = $("[data-failure-detail]");

  data.failures.forEach((failure, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "failure-button";
    button.dataset.failureIndex = String(index);
    button.innerHTML = `<span>${failure.icon}</span><span>${failure.title}</span>`;
    failureList.appendChild(button);
  });

  function showFailure(index) {
    const safeIndex = Math.max(0, Math.min(data.failures.length - 1, index));
    const failure = data.failures[safeIndex];
    $$("[data-failure-index]", failureList).forEach((button) => button.classList.toggle("is-active", Number(button.dataset.failureIndex) === safeIndex));
    failureDetail.innerHTML = `
      <div class="step-hero-icon">${failure.icon}</div>
      <h3>${failure.title}</h3>
      <p>${failure.symptom}</p>
      <div class="preserved-title">不会丢失</div>
      <div class="preserved-chips">${failure.preserved.map((item) => `<span>${item}</span>`).join("")}</div>
      <div class="response-title">恢复链</div>
      <div class="response-flow">${failure.response.map((item, step) => `<div><b>${step + 1}</b> ${item}</div>`).join("")}</div>
      <div class="forbidden"><b>禁止的假恢复：</b>${failure.forbidden}</div>
    `;
  }

  $$("[data-failure-index]", failureList).forEach((button) => button.addEventListener("click", () => showFailure(Number(button.dataset.failureIndex))));
  showFailure(0);
})();
