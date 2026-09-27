(() => {
  const SPEC_KEY = "baw_human_spec_v1";
  const DONE_KEY = "baw_onboard_done_v1";
  const $ = id => document.getElementById(id);
  const groups = {
    networks: ["n_base", "n_sol", "n_btc", "n_ltc", "n_eth", "n_poly"],
    style: ["st_neon", "st_glass", "st_minimal", "st_play", "st_brutal"],
    custody: ["c_seed", "c_hw", "c_aa", "c_multisig", "c_mpc"],
    assets: ["btc", "eth", "sol", "ltc", "usdc", "usdt"],
    features: ["f_send", "f_nft", "f_swap", "f_portfolio", "f_wc", "f_alerts"],
  };
  const spec = { name: "", assets: [], networks: [], custody: "", security: [],
    features: [], platforms: ["p_android"], privacy: [], style: "", theme: "t_dark", accent: "a_green" };
  try {
    const old = JSON.parse(localStorage.getItem(SPEC_KEY) || "{}");
    if (old && typeof old === "object" && !Array.isArray(old)) {
      for (const key of Object.keys(spec)) if (Object.hasOwn(old, key)) spec[key] = old[key];
    }
  } catch { /* invalid local draft starts fresh */ }
  const catalog = {};
  let activeStep = 0;
  function persist() {
    localStorage.setItem(SPEC_KEY, JSON.stringify(spec));
  }
  function show(step) {
    activeStep = step;
    $("onboardLoading").hidden = step !== 0;
    $("onboardOne").hidden = step !== 1;
    $("onboardTwo").hidden = step !== 2;
    $("onboardProgress").textContent = step ? `STEP ${step} OF 2` : "VERIFIED EMAIL";
    $("onboardBar").style.width = step === 2 ? "100%" : step === 1 ? "50%" : "10%";
    if (step === 1) $("onboardName").focus();
    if (step === 2) $("onboardTwo").querySelector("button").focus();
    $("onboard").querySelector(".onboardCard").scrollTop = 0;
  }
  function selected(group, id) {
    return Array.isArray(spec[group]) ? spec[group].includes(id) : spec[group] === id;
  }
  function renderChoices(group, hostId) {
    const host = $(hostId);
    host.replaceChildren();
    for (const id of groups[group]) {
      const item = catalog[group]?.find(entry => entry.id === id);
      if (!item) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "onboardChoice";
      button.setAttribute("aria-pressed", String(selected(group, id)));
      const title = document.createElement("strong"), detail = document.createElement("small");
      title.textContent = item.label;
      detail.textContent = item.blurb || "Add this trait to your design.";
      button.append(title, detail);
      button.addEventListener("click", () => {
        if (Array.isArray(spec[group])) {
          spec[group] = selected(group, id) ? spec[group].filter(value => value !== id) : [...spec[group], id];
        } else spec[group] = id;
        persist();
        renderChoices(group, hostId);
      });
      host.appendChild(button);
    }
  }
  async function load() {
    $("onboardError").textContent = "";
    $("onboardRetry").hidden = true;
    $("onboardContinue").hidden = true;
    show(0);
    try {
      const [accountResponse, catalogResponse] = await Promise.all([
        fetch("/human/account", { credentials: "same-origin", cache: "no-store" }),
        fetch("/machine/human/catalog", { credentials: "same-origin" }),
      ]);
      if (!accountResponse.ok || !catalogResponse.ok) throw Error("Account or catalog service is unavailable. Please retry.");
      const account = await accountResponse.json(), data = await catalogResponse.json();
      if (!account.email || !Array.isArray(data.groups)) throw Error("The verified account response was incomplete.");
      $("onboardEmail").textContent = `Signed in as ${account.email}`;
      for (const group of data.groups) catalog[group.key] = group.items || [];
      for (const [group, host] of Object.entries({
        networks: "onboardNetworks", style: "onboardStyles", custody: "onboardCustody",
        assets: "onboardAssets", features: "onboardFeatures",
      })) renderChoices(group, host);
      $("onboardName").value = spec.name || "";
      if (localStorage.getItem(DONE_KEY) === "1") {
        $("onboardTitle").textContent = "Welcome back to your Studio.";
        $("onboardWelcome").textContent = "Your verified account is ready. Continue your saved design, or make a new pass through the setup choices.";
        $("onboardContinue").hidden = false;
        $("onboardRetry").textContent = "Review setup choices";
        $("onboardRetry").hidden = false;
        $("onboardRetry").onclick = () => show(1);
      } else show(1);
    } catch (error) {
      $("onboardError").textContent = error instanceof Error ? error.message : "Could not prepare your account.";
      $("onboardRetry").textContent = "Retry account setup";
      $("onboardRetry").hidden = false;
      $("onboardRetry").onclick = load;
    }
  }
  $("onboardContinue").addEventListener("click", () => { location.href = "/human/studio"; });
  $("onboardOne").addEventListener("submit", event => {
    event.preventDefault();
    const name = $("onboardName").value.trim();
    if (name.length < 2 || !Array.isArray(spec.networks) || spec.networks.length === 0) {
      $("onboardOneError").textContent = "Enter a wallet name and choose at least one chain.";
      return;
    }
    $("onboardOneError").textContent = "";
    spec.name = name.slice(0, 40);
    if (!spec.style) spec.style = "st_glass";
    persist();
    show(2);
  });
  $("onboardBack").addEventListener("click", () => show(1));
  $("onboardTwo").addEventListener("submit", event => {
    event.preventDefault();
    if (!spec.custody) {
      $("onboardTwoError").textContent = "Choose who would control the keys in this design.";
      return;
    }
    $("onboardTwoError").textContent = "";
    persist();
    localStorage.setItem(DONE_KEY, "1");
    location.href = "/human/studio";
  });
  $("onboard").addEventListener("keydown", event => {
    if (event.key !== "Tab") return;
    const focusable = [...$("onboard").querySelectorAll("button:not([hidden]),input:not([hidden])")]
      .filter(element => !element.closest("[hidden]"));
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  $("startOnboarding").addEventListener("click", event => { event.preventDefault(); $("onboard").hidden = false; show(1); });
  load();
})();
