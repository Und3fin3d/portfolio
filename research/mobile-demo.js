/* One responsive workspace keeps the original simulations and controls. */
(() => {
  "use strict";

  const configurations = {
    biology: {
      watch: ".anatomy", graph: ".scope", guide: [".steps"],
      playback: ["#playScenario", "#nextStepScenario", "#restartScenario"],
    },
    memristor: {
      watch: ".device", graph: ".scope", guide: [".steps"],
      playback: ["#play", "#nextStep", "#restart"],
    },
    memory: {
      watch: ".device", graph: ".scope", guide: [".steps"],
      playback: ["#replay", "#nextStep", "#restart"],
    },
    comparison: {
      graph: ".scope-wrap", guide: [".benchmark"],
      playback: ["#play", "#pause", "#replay"],
      graphNote: "Each trace is scaled to its own peak to compare shape and timing.",
    }
  };
  const config = configurations[document.body.dataset.demo];
  if (!config) return;

  const source = document.querySelector("main");

  function mount() {
    const status = source.querySelector("#status");
    const move = (element, parent) => {
      if (!element) return;
      parent.append(element);
    };
    const make = (tag, className, text) => {
      const element = document.createElement(tag);
      element.className = className;
      if (text) element.textContent = text;
      return element;
    };

    const reader = make("main", "phone-reader");
    const header = make("header", "phone-heading");
    move(source.querySelector("h1"), header);

    const tabs = make("div", "phone-tabs");
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Demo views");
    const stage = make("div", "phone-stage");
    const panels = new Map();
    const buttons = [];
    const views = config.watch
      ? [["watch", "Animation"], ["graph", "Graphs"], ["guide", document.body.dataset.demo === "comparison" ? "Results" : "Sequence"], ["settings", "Settings"]]
      : [["graph", "Compare"], ["guide", document.body.dataset.demo === "comparison" ? "Results" : "Sequence"], ["settings", "Settings"]];

    function select(id, focus = false) {
      if (wide.matches) id = config.watch ? "watch" : "graph";
      reader.dataset.view = id;
      const sidebarChoice = reader.querySelector(":scope > .phone-model-choice");
      if (sidebarChoice) sidebarChoice.hidden = id !== "graph";
      panels.forEach((panel, key) => {
        // Visibility keeps canvas dimensions available to the existing renderers.
        const active = key === id || (wide.matches && (key === "settings" || key === "guide"));
        panel.inert = !active;
        panel.setAttribute("aria-hidden", String(!active));
        panel.classList.toggle("is-active", active);
      });
      buttons.forEach(button => {
        const selected = button.dataset.view === id;
        button.setAttribute("aria-selected", String(selected));
        button.tabIndex = selected ? 0 : -1;
        if (selected && focus) button.focus();
      });
      if (!wide.matches && (id === "guide" || id === "settings")) {
        document.dispatchEvent(new Event("demo:pause"));
      }
      window.dispatchEvent(new Event("resize"));
    }

    views.forEach(([id, title], index) => {
      const panel = make("section", `phone-panel phone-panel--${id}`);
      panel.id = `phone-panel-${id}`;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", `phone-tab-${id}`);
      panel.tabIndex = 0;
      panels.set(id, panel);
      stage.append(panel);
      const button = make("button", "phone-tab", title);
      button.type = "button";
      button.id = `phone-tab-${id}`;
      button.dataset.view = id;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", panel.id);
      button.addEventListener("click", () => select(id));
      button.addEventListener("keydown", event => {
        const visibleButtons = buttons.filter(item => !item.hidden);
        const current = visibleButtons.indexOf(button);
        let next;
        if (event.key === "ArrowRight") next = (current + 1) % visibleButtons.length;
        if (event.key === "ArrowLeft") next = (current + visibleButtons.length - 1) % visibleButtons.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = visibleButtons.length - 1;
        if (next === undefined) return;
        event.preventDefault();
        select(visibleButtons[next].dataset.view, true);
      });
      buttons.push(button);
      tabs.append(button);
    });

    if (config.watch) {
      const watch = panels.get("watch");
      if (document.body.dataset.demo === "memristor") {
        const switcher = make("div", "phone-animation-switch");
        switcher.setAttribute("role", "group");
        switcher.setAttribute("aria-label", "Animation view");
        const scene = make("div", "phone-animation-scene");
        watch.append(switcher, scene);
        const scenes = [["device", "Device", ".device"], ["neurons", "Neurons", ".pathway"]].map(([id, title, selector]) => {
          const button = make("button", "", title);
          button.type = "button";
          const element = source.querySelector(selector);
          element.id ||= `animation-${id}`;
          button.setAttribute("aria-controls", element.id);
          button.addEventListener("click", () => {
            scenes.forEach(item => {
              const active = item.button === button;
              item.button.setAttribute("aria-pressed", String(active));
              item.element.classList.toggle("is-active", active);
              item.element.inert = !active;
              item.element.setAttribute("aria-hidden", String(!active));
            });
            window.dispatchEvent(new Event("resize"));
          });
          button.setAttribute("aria-pressed", String(id === "device"));
          element.classList.toggle("is-active", id === "device");
          element.inert = id !== "device";
          element.setAttribute("aria-hidden", String(id !== "device"));
          switcher.append(button);
          move(element, scene);
          return { button, element };
        });
      } else move(source.querySelector(config.watch), watch);
    }
    const graph = panels.get("graph");
    move(source.querySelector(".phone-model-choice"), graph);
    if (document.body.dataset.demo === "memristor") {
      const pairs = make("div", "phone-trace-switch");
      pairs.setAttribute("role", "group");
      pairs.setAttribute("aria-label", "Graph pair");
      document.body.dataset.tracePair = "input";
      [["input", "Input & device"], ["output", "Current & neuron"]].forEach(([id, title]) => {
        const button = make("button", "", title);
        button.type = "button";
        button.setAttribute("aria-pressed", String(id === "input"));
        button.addEventListener("click", () => {
          document.body.dataset.tracePair = id;
          [...pairs.children].forEach(child => child.setAttribute("aria-pressed", String(child === button)));
          window.dispatchEvent(new Event("resize"));
        });
        pairs.append(button);
      });
      graph.append(pairs);
    }
    if(config.graphNote) graph.append(make("p", "phone-graph-note", config.graphNote));
    const graphContent = source.querySelector(config.graph);
    move(graphContent, graph);
    const wide = matchMedia("(min-width: 960px)");
    const landscape = matchMedia("(max-width: 959px) and (max-height: 500px) and (orientation: landscape)");
    const liveGraph = config.watch ? make("div", "demo-live-graph") : null;
    if (liveGraph) panels.get("watch").append(liveGraph);
    function placeGraph() {
      if (!liveGraph) return;
      const combined = wide.matches;
      panels.get("watch").classList.toggle("has-live-graph", combined);
      (combined ? liveGraph : graph).append(graphContent);
      liveGraph.hidden = !combined;
      buttons.find(button => button.dataset.view === "graph").hidden = combined;
    }

    const dock = make("div", "phone-playback");
    dock.setAttribute("role", "group");
    dock.setAttribute("aria-label", "Playback controls");
    config.playback.forEach(selector => move(document.querySelector(selector), dock));


    const speed = make("div", "phone-speed");
    move(source.querySelector("#speed")?.closest("label"), speed);

    const settings = panels.get("settings");
    settings.append(make("h2", "", "Input settings"));
    const controls = source.querySelector(".controls");
    if (controls) move(controls, settings);
    if (config.settings) {
      const extra = make("div", "phone-extra-settings");
      source.querySelectorAll(config.settings).forEach(element => move(element, extra));
      settings.append(extra);
    }

    const guide = panels.get("guide");
    config.guide.forEach(selector => move(source.querySelector(selector), guide));
    const caption = make("div", "phone-caption");
    move(status, caption);
    reader.append(header, tabs, stage, caption, speed, dock);
    source.after(reader);
    source.hidden = true;
    document.body.classList.add("demo-mobile");

    function placeLayout() {
      reader.dataset.layout = wide.matches ? "wide" : "tabbed";
      tabs.hidden = wide.matches;
      if (wide.matches) {
        stage.before(settings);
        reader.append(guide);
      } else {
        stage.append(guide, settings);
      }
      if (document.body.dataset.demo === "comparison") {
        const choice = reader.querySelector(".phone-model-choice");
        choice.hidden = false;
        if (wide.matches) controls.append(choice);
        else if (landscape.matches) caption.before(choice);
        else graph.prepend(choice);
      }
      views.forEach(([id, title]) => {
        const panel = panels.get(id);
        panel.setAttribute("role", wide.matches ? "region" : "tabpanel");
        if (wide.matches) {
          panel.setAttribute("aria-label", title);
          panel.removeAttribute("aria-labelledby");
          panel.removeAttribute("tabindex");
        } else {
          panel.removeAttribute("aria-label");
          panel.setAttribute("aria-labelledby", `phone-tab-${id}`);
          panel.tabIndex = 0;
        }
      });
      placeGraph();
      select(reader.dataset.view || views[0][0]);
    }
    wide.addEventListener("change", placeLayout);
    landscape.addEventListener("change", placeLayout);
    placeLayout();

    // Use one accessible picker across desktop, touch, and viewport previews.
    const picker = make("dialog", "demo-picker");
    const pickerHeader = make("div", "demo-picker-header");
    const pickerTitle = make("h2", "");
    pickerTitle.id = "demo-picker-title";
    picker.setAttribute("aria-labelledby", pickerTitle.id);
    const closePicker = make("button", "demo-picker-close", "Close");
    closePicker.type = "button";
    closePicker.addEventListener("click", () => picker.close());
    pickerHeader.append(pickerTitle, closePicker);
    const pickerOptions = make("div", "demo-picker-options");
    picker.append(pickerHeader, pickerOptions);
    document.body.append(picker);
    let pickerTrigger = null;
    picker.addEventListener("close", () => {
      pickerTrigger?.setAttribute("aria-expanded", "false");
      pickerTrigger?.focus();
    });
    [...reader.querySelectorAll("select")].forEach(select => {
      const label = select.closest("label");
      const title = [...label.childNodes].filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent.trim()).join(" ").trim();
      const trigger = make("button", "phone-select-trigger");
      trigger.type = "button";
      trigger.setAttribute("aria-haspopup", "dialog");
      trigger.setAttribute("aria-expanded", "false");
      const update = () => {
        trigger.textContent = select.selectedOptions[0]?.textContent || "Choose";
        trigger.setAttribute("aria-label", `${title}: ${trigger.textContent}`);
      };
      select.hidden = true;
      select.after(trigger);
      select.addEventListener("change", update);
      update();
      trigger.addEventListener("click", event => {
        event.preventDefault();
        pickerTrigger = trigger;
        pickerTitle.textContent = title;
        pickerOptions.replaceChildren();
        let lastGroup = null;
        const optionButtons = [...select.options].map(option => {
          const group = option.parentElement.tagName === "OPTGROUP" ? option.parentElement.label : null;
          if (group && group !== lastGroup) pickerOptions.append(make("h3", "", group));
          lastGroup = group;
          const button = make("button", "demo-picker-option", option.textContent);
          button.type = "button";
          button.disabled = option.disabled;
          button.setAttribute("aria-pressed", String(option.selected));
          if (option.selected) {
            const mark = make("span", "demo-picker-check", "✓");
            mark.setAttribute("aria-hidden", "true");
            button.append(mark);
          }
          button.addEventListener("click", () => {
            select.value = option.value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            picker.close();
          });
          pickerOptions.append(button);
          return button;
        });
        optionButtons.forEach((button, index) => button.addEventListener("keydown", event => {
          let next;
          if (event.key === "ArrowDown") next = (index + 1) % optionButtons.length;
          if (event.key === "ArrowUp") next = (index + optionButtons.length - 1) % optionButtons.length;
          if (event.key === "Home") next = 0;
          if (event.key === "End") next = optionButtons.length - 1;
          if (next !== undefined) { event.preventDefault(); optionButtons[next].focus(); }
        }));
        trigger.setAttribute("aria-expanded", "true");
        picker.showModal();
        optionButtons[select.selectedIndex]?.focus();
      });
    });

    // Canvas dimensions can change when captions wrap or browser chrome moves.
    let resizeFrame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    });
    observer.observe(stage);
    const requestedView = new URLSearchParams(location.search).get('view');
    select(views.some(([id]) => id === requestedView) ? requestedView : views[0][0]);
    if (new URLSearchParams(location.search).get('preview') === '1') document.dispatchEvent(new Event('demo:preview'));

  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) document.dispatchEvent(new Event("demo:pause"));
  });
  mount();
})();
