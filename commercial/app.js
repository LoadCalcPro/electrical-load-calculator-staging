(function () {
  "use strict";
  const KEY = "loadcalcprox_commercial_standard_2023_v1";
  const $ = (id) => document.getElementById(id),
    esc = (v) =>
      String(v ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
  const fmt = (v) =>
      Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 }),
    rateFmt = (v) =>
      Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 }),
    va = (v) => fmt(v) + " VA",
    inputValue = (v) =>
      v !== "" && v !== undefined && Number(v) === 0 ? "" : v;
  const row = (label, extra = {}) => ({ label, qty: "", va: "", ...extra });
  function fresh() {
    return {
      version: 1,
      method: "standard",
      restaurantType: "",
      restaurantTotalLoadServed: false,
      projectName: "",
      projectNumber: "",
      projectAddress: "",
      projectCityState: "",
      phase: "3",
      voltage: "208",
      occupancy: "",
      sqft: "",
      actualLighting: "",
      hotelAllLighting: false,
      showWindowFt: "",
      trackFt: "",
      signQty: "",
      receptacles: "",
      hvacMode: "",
      cooling: "",
      heating: "",
      includedMotor: "",
      reportType: "branded",
      reportLayout: "full",
      occupancyAreas: [],
      other: [
        row("Ceiling Fan", { factor: 1 }),
        row("Exhaust Fan", { factor: 1 }),
        row("Hood Fan", { factor: 1 }),
        row("Hand Dryer", { factor: 1 }),
        row("Storage-Type Water Heater", { factor: 1.25 }),
      ],
      kitchen: [
        "Dishwasher",
        "Disposal",
        "Wine Cooler",
        "Cooktop",
        "Range",
        "Freezer",
        "Ice Maker",
        "Reach-In Refrigerator",
      ].map((x) => row(x)),
      motors: [row("Motor / Pump")],
      continuous: [
        row("EV Charger", {
          ev: true,
          managed: false,
          managedVa: "",
          factor: 1.25,
        }),
        row("Additional Continuous Load", { factor: 1.25 }),
        row("Other Noncontinuous Load", { factor: 1 }),
      ],
      special: [
        "Elevator Load",
        "Welder Load",
        "Commercial Dryer Load",
        "Multioutlet Assembly",
        "Other Project-Specific Load",
      ].map((x) => row(x, { factor: 1 })),
    };
  }
  let state = fresh(),
    result,
    saved = null,
    promptOpen = false;
  const scalars = [
    "method",
    "restaurantType",
    "restaurantTotalLoadServed",
    "projectName",
    "projectNumber",
    "projectAddress",
    "projectCityState",
    "phase",
    "voltage",
    "occupancy",
    "sqft",
    "actualLighting",
    "hotelAllLighting",
    "showWindowFt",
    "trackFt",
    "signQty",
    "receptacles",
    "hvacMode",
    "cooling",
    "heating",
    "includedMotor",
    "reportType",
    "reportLayout",
  ];
  const groups = ["other", "kitchen", "motors", "continuous", "special"];
  function line(label, value, total = false) {
    return `<div${total ? ' class="total"' : ""}><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  }
  function rowHTML(r, i, g) {
    const name = esc(r.label || "Load " + (i + 1)),
      restaurant = state.method === "restaurant22088";
    const factor =
      g === "other"
        ? restaurant
          ? '<div class="factor-field connected-treatment"><span class="mobile-label">Treatment</span>Connected load</div>'
          : `<label class="factor-field"><span class="mobile-label">Treatment</span><select data-key="factor" aria-label="${name} load treatment"><option value="1" ${Number(r.factor) !== 1.25 ? "selected" : ""}>100%</option><option value="1.25" ${Number(r.factor) === 1.25 ? "selected" : ""}>125% continuous</option></select></label>`
        : "";
    return `<div class="load-row ${factor ? "has-factor" : ""}" data-group="${g}" data-index="${i}"><div class="description-cell"><input class="description" data-key="label" aria-label="${name} description" value="${name}" maxlength="120">${g === "continuous" ? `<small class="row-note">${restaurant ? "Connected load — NEC 220.88" : r.ev ? (r.managed ? "Managed maximum used at 100%" : "7,200 VA minimum or nameplate × 125%") : Number(r.factor) === 1 ? "Noncontinuous — 100%" : "Continuous — 125%"}</small>` : g === "special" ? `<small class="row-note">${restaurant ? "Enter connected load before Standard Method demand adjustments." : "Enter the demand load already calculated under the applicable NEC article."}</small>` : ""}</div><label><span class="mobile-label">Qty</span><input data-key="qty" type="number" min="0" step="1" inputmode="numeric" placeholder="Qty" aria-label="${name} quantity" value="${esc(inputValue(r.qty))}"></label><label><span class="mobile-label">VA each</span><input data-key="va" type="number" min="0" step="any" inputmode="decimal" placeholder="VA" aria-label="${name} VA each" value="${esc(inputValue(r.va))}"></label>${factor}<output data-output="${g}-${i}" data-label="Load Used VA"></output>${g === "continuous" && r.ev ? `<div class="ev-management"><label><input type="checkbox" data-key="managed" ${r.managed ? "checked" : ""}> Managed EV load</label><label>Maximum permitted managed EV load (total VA)<input type="number" min="0" step="any" inputmode="decimal" data-key="managedVa" placeholder="Managed VA" value="${esc(inputValue(r.managedVa))}" ${r.managed ? "" : "disabled"}></label></div>` : ""}</div>`;
  }
  function renderGroup(g) {
    const hasTreatment = g === "other" && state.method !== "restaurant22088";
    $(g + "Rows").innerHTML =
      `<div class="load-head ${hasTreatment ? "has-factor" : ""}"><span>Load Description</span><span>Qty</span><span>VA Each</span>${hasTreatment ? "<span>Treatment</span>" : ""}<span>Load Used VA</span></div>` +
      state[g].map((r, i) => rowHTML(r, i, g)).join("");
  }
  function occupancyAreaHTML(a, i) {
    return `<div class="occupancy-area" data-area-index="${i}"><label class="occupancy-selector">Occupancy Type<select data-area-key="occupancy"><option value="">Select occupancy</option>${Object.entries(
      CommercialEngine.OCCUPANCIES,
    )
      .map(
        ([k, o]) =>
          `<option value="${k}" ${a.occupancy === k ? "selected" : ""}>${esc(o.label)}</option>`,
      )
      .join(
        "",
      )}</select></label><div class="fixed-load-row"><span class="fixed-load-description">Required General Lighting</span><label><span class="mobile-label">Square Footage</span><input data-area-key="sqft" type="number" min="0" step="any" inputmode="decimal" placeholder="Sq ft" value="${esc(inputValue(a.sqft))}"></label><output class="fixed-value" data-area-rate="${i}">—</output><output data-area-minimum="${i}"></output></div><div class="fixed-load-row actual-load-row"><span class="fixed-load-description">Actual Lighting Load, if Larger</span><span></span><span></span><label><span class="mobile-label">Actual Load VA</span><input data-area-key="actualLighting" type="number" min="0" step="any" inputmode="decimal" placeholder="VA" value="${esc(inputValue(a.actualLighting))}"></label></div><label class="check-field"><input data-area-key="hotelAllLighting" type="checkbox" ${a.hotelAllLighting ? "checked" : ""}> Entire-area lighting likely used at one time</label></div>`;
  }
  function renderOccupancyAreas() {
    $("occupancyAreaRows").innerHTML = state.occupancyAreas
      .map(occupancyAreaHTML)
      .join("");
  }
  function render() {
    scalars.forEach((k) => {
      const el = $(k);
      if (el)
        el.type === "checkbox"
          ? (el.checked = Boolean(state[k]))
          : (el.value = el.type === "number" ? inputValue(state[k]) : state[k]);
    });
    groups.forEach(renderGroup);
    renderOccupancyAreas();
    update(false);
  }
  function display(v) {
    return result.touched ? va(v) : "—";
  }
  function update(save = true) {
    result = CommercialEngine.calculate(state);
    const restaurantMode = state.method === "restaurant22088";
    document.querySelector(".calculation-sheet").hidden = false;
    $("restaurantMethodSection").hidden = !restaurantMode;
    $("specialLoadsNote").textContent = restaurantMode
      ? "Enter the connected load before Standard Method demand adjustments for elevators, welders, commercial dryers, multioutlet assemblies and similar project-specific loads. Each value is included once in the NEC 220.88 connected-load total."
      : "For elevators, welders, commercial dryers, multioutlet assemblies and similar specialized loads, calculate the demand under the applicable NEC article and enter that final demand load here. These entries are added once at 100% and are identified separately on the report.";
    if (restaurantMode) {
      const rr = result.restaurant;
      $("restaurantConnectedVA").textContent = display(
        result.restaurantConnected,
      );
      $("restaurantSummary").innerHTML =
        line(
          "Automatically Calculated Connected Load",
          display(result.restaurantConnected),
        ) +
        rr.steps.map((s) => line(s.label, display(s.va))).join("") +
        line("NEC 220.88 Demand Load", display(rr.demand), true);
      $("restaurantValidation").hidden = !result.errors.length;
      $("restaurantValidation").innerHTML =
        "<ul>" +
        result.errors.map((e) => "<li>" + esc(e) + "</li>").join("") +
        "</ul>";
      const restaurantValid =
        !result.errors.length && result.restaurantConnected > 0;
      $("restaurantFinalSummary").innerHTML =
        line(
          "Calculated Restaurant Demand",
          restaurantValid ? display(rr.demand) : "Incomplete",
          true,
        ) +
        line(
          "Calculated Service Load",
          restaurantValid
            ? result.amps.toLocaleString("en-US", {
                maximumFractionDigits: 1,
              }) + " A"
            : "Incomplete",
          true,
        );
    }
    const occ = result.occupancy;
    $("occupancyVA").textContent = occ ? rateFmt(occ.va) : "—";
    $("primaryLightingMinimum").textContent =
      Number(state.sqft) > 0 && occ
        ? display(result.lightingAreas[0]?.minimum || 0)
        : "";
    $("hotelAllWrap").hidden = state.occupancy !== "hotel";
    state.occupancyAreas.forEach((a, i) => {
      const areaOcc = CommercialEngine.OCCUPANCIES[a.occupancy],
        minimum = Number(a.sqft) * (areaOcc?.va || 0),
        rate = document.querySelector(`[data-area-rate="${i}"]`),
        total = document.querySelector(`[data-area-minimum="${i}"]`);
      if (rate) rate.textContent = areaOcc ? rateFmt(areaOcc.va) : "—";
      if (total)
        total.textContent = Number(a.sqft) > 0 && areaOcc ? va(minimum) : "";
    });
    groups.forEach((g) =>
      state[g].forEach((r, i) => {
        const el = document.querySelector(`[data-output="${g}-${i}"]`);
        if (!el) return;
        let used = Number(r.qty) * Number(r.va);
        if (!restaurantMode && g === "other")
          used *= Number(r.factor) === 1.25 ? 1.25 : 1;
        if (g === "continuous")
          used = r.ev
            ? r.managed
              ? Number(r.managedVa)
              : Number(r.qty) *
                Math.max(7200, Number(r.va)) *
                (restaurantMode ? 1 : 1.25)
            : used * (restaurantMode ? 1 : Number(r.factor) === 1 ? 1 : 1.25);
        el.textContent = Number(r.qty) > 0 && Number(r.va) > 0 ? fmt(used) : "";
      }),
    );
    $("lightingSummary").innerHTML =
      result.lightingAreas
        .map((a, i) => {
          const prefix = i ? "Area " + (i + 1) + " — " : "";
          return (
            line(
              prefix +
                (a.occupancy?.label || "Select occupancy") +
                " Minimum Lighting",
              display(a.minimum),
            ) +
            line(prefix + "Lighting Load Before Demand", display(a.base)) +
            (restaurantMode
              ? ""
              : line(prefix + a.demand.method, display(a.used), true))
          );
        })
        .join("") +
      line(
        restaurantMode
          ? "Connected General Lighting"
          : "Total Lighting Load Used",
        display(restaurantMode ? result.lightingBase : result.lighting),
        true,
      );
    const showWindowValue = restaurantMode
        ? Number(state.showWindowFt) * 200
        : result.showWindow,
      trackValue = restaurantMode
        ? Number(state.trackFt) > 0
          ? Math.ceil(Number(state.trackFt) / 2) * 150
          : 0
        : result.track,
      signValue = restaurantMode ? Number(state.signQty) * 1200 : result.signs;
    $("showWindowLoad").textContent =
      Number(state.showWindowFt) > 0 ? display(showWindowValue) : "";
    $("trackLoad").textContent =
      Number(state.trackFt) > 0 ? display(trackValue) : "";
    $("signLoad").textContent =
      Number(state.signQty) > 0 ? display(signValue) : "";
    const hasAdditionalLighting =
      Number(state.showWindowFt) > 0 ||
      Number(state.trackFt) > 0 ||
      Number(state.signQty) > 0;
    $("specialLightingSummary").innerHTML = line(
      restaurantMode
        ? "Connected Additional Lighting"
        : "Total Show-Window, Track and Sign Lighting Load",
      hasAdditionalLighting
        ? display(
            restaurantMode
              ? result.specialLightingConnected
              : result.lightingOther,
          )
        : "",
      true,
    );
    $("receptacleConnectedInput").textContent =
      Number(state.receptacles) > 0 ? display(result.receptacleCountVA) : "";
    $("receptacleSummary").innerHTML =
      (state.occupancy === "office"
        ? line(
            "Office Minimum Comparison — 1 VA/ft²",
            display(result.receptacleOfficeVA),
          )
        : "") +
      (restaurantMode
        ? ""
        : line(
            "Connected Receptacle Load — Larger of Count or Office Minimum",
            display(result.receptacleConnected),
          )) +
      (restaurantMode
        ? ""
        : line(
            "First 10,000 VA at 100% + Remainder at 50%",
            display(result.receptacles),
            true,
          )) +
      line(
        restaurantMode
          ? "Connected Receptacle Load Used"
          : "Receptacle Load Used",
        display(
          restaurantMode ? result.receptacleConnected : result.receptacles,
        ),
        true,
      );
    $("otherSummary").innerHTML = line(
      restaurantMode
        ? "Connected Other Loads"
        : "Other Loads After Selected Treatment",
      display(restaurantMode ? result.otherConnected : result.other),
      true,
    );
    $("kitchenSummary").innerHTML =
      line("Connected Kitchen Equipment", display(result.kitchenConnected)) +
      (restaurantMode
        ? ""
        : line(
            "Table 220.56 Percentage Result (" +
              fmt(result.kitchenFactor * 100) +
              "%)",
            display(result.kitchenTableDemand),
          ) +
          line(
            "Two Largest Appliances — Required Minimum",
            display(result.kitchenTwoLargest),
          ) +
          line(
            "Kitchen Load Used — Larger Result",
            display(result.kitchen),
            true,
          ));
    $("hvacSummary").innerHTML = line(
      state.hvacMode === "simultaneous"
        ? "Cooling + Heating"
        : "Larger of Cooling or Heating",
      display(result.hvac),
      true,
    );
    $("motorSummary").innerHTML =
      line(
        restaurantMode
          ? "Connected Motor Loads"
          : "Additional Motor Loads at 100%",
        display(result.motorBase),
      ) +
      (restaurantMode
        ? ""
        : line("Largest Applicable Motor", display(result.largestMotor)) +
          line(
            "Largest Motor Addition at 25%",
            display(result.motorAdder),
            true,
          ));
    $("continuousSummary").innerHTML = line(
      restaurantMode
        ? "Connected Continuous and Other Loads"
        : "Continuous and Other Load Used",
      display(restaurantMode ? result.continuousConnected : result.continuous),
      true,
    );
    $("specialSummary").innerHTML = line(
      "Project-Specific Demand Loads Used",
      display(result.special),
      true,
    );
    $("validation").hidden = restaurantMode || !result.errors.length;
    $("validation").innerHTML =
      "<ul>" +
      result.errors.map((e) => "<li>" + esc(e) + "</li>").join("") +
      "</ul>";
    const valid = result.touched && !result.errors.length;
    $("finalSummary").innerHTML =
      line(
        restaurantMode
          ? "NEC 220.88 Restaurant Demand Load"
          : "Total Calculated Load",
        valid ? display(result.total) : result.touched ? "Incomplete" : "—",
        true,
      ) +
      line(
        "Calculated Service Load",
        valid
          ? result.amps.toLocaleString("en-US", { maximumFractionDigits: 1 }) +
              " A"
          : result.touched
            ? "Incomplete"
            : "—",
        true,
      );
    $("floatingAmps").textContent = valid
      ? result.amps.toLocaleString("en-US", { maximumFractionDigits: 1 }) + " A"
      : result.touched
        ? "Incomplete"
        : "—";
    if (save && !promptOpen) {
      try {
        const meaningful =
          state.occupancy ||
          Number(state.sqft) ||
          scalars.slice(2, 6).some((k) => state[k]);
        if (meaningful) {
          localStorage.setItem(KEY, JSON.stringify(state));
          $("saveStatus").textContent = "Saved on this device.";
        } else {
          localStorage.removeItem(KEY);
          $("saveStatus").textContent = "";
        }
      } catch {
        $("saveStatus").textContent =
          "This browser could not save the calculation.";
      }
    }
  }
  document.addEventListener("input", (event) => {
    const el = event.target;
    if (el.type === "number" && el.value === "0") el.value = "";
    if (scalars.includes(el.id)) {
      state[el.id] = el.type === "checkbox" ? el.checked : el.value;
      if (el.id === "method") groups.forEach(renderGroup);
      update();
      return;
    }
    const area = el.closest("[data-area-index]");
    if (area && el.dataset.areaKey) {
      state.occupancyAreas[Number(area.dataset.areaIndex)][el.dataset.areaKey] =
        el.type === "checkbox" ? el.checked : el.value;
      update();
      return;
    }
    const parent = el.closest("[data-group]");
    if (parent && el.dataset.key) {
      const g = parent.dataset.group,
        r = state[g][Number(parent.dataset.index)];
      r[el.dataset.key] = el.type === "checkbox" ? el.checked : el.value;
      if (g === "continuous" && el.dataset.key === "managed") renderGroup(g);
      update();
    }
  });
  document.addEventListener("change", (event) => {
    const el = event.target;
    if (el.type === "number" && el.value !== "" && Number(el.value) === 0)
      el.value = "";
    if (
      el.tagName === "SELECT" ||
      el.type === "checkbox" ||
      el.type === "number"
    )
      el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest("#addOccupancyArea")) {
      state.occupancyAreas.push({
        occupancy: "",
        sqft: "",
        actualLighting: "",
        hotelAllLighting: false,
      });
      renderOccupancyAreas();
      update();
      return;
    }
    if (event.target.closest("#removeOccupancyArea")) {
      if (state.occupancyAreas.length) {
        state.occupancyAreas.pop();
        renderOccupancyAreas();
        update();
      }
      return;
    }
    const add = event.target.closest("[data-add]"),
      remove = event.target.closest("[data-remove-last]");
    if (add) {
      const g = add.dataset.add;
      state[g].push(
        row(
          g === "continuous"
            ? "Additional Continuous Load"
            : "Additional " +
                (g === "kitchen" ? "Kitchen Equipment" : g.replace(/s$/, "")),
          g === "continuous" ? { factor: 1.25 } : {},
        ),
      );
      renderGroup(g);
      update();
    }
    if (remove) {
      const g = remove.dataset.removeLast;
      if (!state[g].length) return;
      const r = state[g][state[g].length - 1];
      if (
        (Number(r.qty) || Number(r.va)) &&
        !confirm("Remove the last item and its entered values?")
      )
        return;
      state[g].pop();
      renderGroup(g);
      update();
    }
  });
  function reset() {
    state = fresh();
    render();
  }
  $("reset").onclick = () => {
    if (
      confirm(
        "Start a new calculation? This clears the current entries for this calculator.",
      )
    )
      reset();
  };
  $("mainSite").onclick = () => (location.href = "../index.html");
  $("calculators").onclick = () => (location.href = "../member-dashboard.html");
  $("continue").onclick = () => {
    state = saved;
    promptOpen = false;
    $("restore").close();
    render();
  };
  $("startNew").onclick = () => {
    promptOpen = false;
    $("restore").close();
    reset();
  };
  $("restore").addEventListener("cancel", (e) => e.preventDefault());
  function printRow(label, qty, each, total, cls = "") {
    return `<tr class="${cls}"><td>${esc(label)}</td><td>${qty ? esc(qty) : ""}</td><td>${each ? rateFmt(each) : ""}</td><td>${fmt(total)}</td></tr>`;
  }
  function section(title) {
    return `<tr class="section"><td colspan="4">${esc(title)}</td></tr>`;
  }
  function usedRowLoad(r, g) {
    let n = Number(r.qty) * Number(r.va),
      restaurant = state.method === "restaurant22088";
    if (!restaurant && g === "other") n *= Number(r.factor) === 1.25 ? 1.25 : 1;
    if (g === "continuous")
      n = r.ev
        ? r.managed
          ? Number(r.managedVa)
          : Number(r.qty) *
            Math.max(7200, Number(r.va)) *
            (restaurant ? 1 : 1.25)
        : n * (restaurant ? 1 : Number(r.factor) === 1 ? 1 : 1.25);
    return n;
  }
  function loadRows(g) {
    const restaurant = state.method === "restaurant22088";
    return state[g]
      .filter((r) => Number(r.qty) > 0 && Number(r.va) > 0)
      .map((r) =>
        printRow(
          r.label +
            (restaurant
              ? " — connected load"
              : g === "other" && Number(r.factor) === 1.25
                ? " — 125% continuous"
                : g === "continuous" && r.ev
                  ? r.managed
                    ? " — managed maximum"
                    : " — 7,200 VA/nameplate × 125%"
                  : ""),
          r.qty,
          r.va,
          usedRowLoad(r, g),
        ),
      )
      .join("");
  }
  function buildRestaurantReport() {
    const r = result,
      rr = r.restaurant;
    let html =
      section("Connected Load Worksheet") +
      printRow("General lighting connected load", "", "", r.lightingBase) +
      printRow(
        "Show-window, track and sign lighting",
        "",
        "",
        r.specialLightingConnected,
      ) +
      printRow("Receptacle connected load", "", "", r.receptacleConnected) +
      printRow("Other connected loads", "", "", r.otherConnected) +
      printRow(
        "Commercial kitchen connected equipment",
        "",
        "",
        r.kitchenConnected,
      ) +
      printRow(
        "Cooling / air conditioning — included",
        "",
        "",
        Number(state.cooling),
      ) +
      printRow("Heating — included", "", "", Number(state.heating)) +
      printRow("Connected motor loads", "", "", r.motorBase) +
      printRow(
        "Connected EV, continuous and other loads",
        "",
        "",
        r.continuousConnected,
      ) +
      printRow("Project-specific connected loads", "", "", r.special) +
      printRow(
        "TOTAL CONNECTED RESTAURANT LOAD",
        "",
        "",
        r.restaurantConnected,
        "total",
      ) +
      section("NEC 220.88 Demand Calculation") +
      rr.steps.map((s) => printRow(s.label, "", "", s.va)).join("") +
      printRow("NEC 220.88 DEMAND LOAD", "", "", rr.demand, "total");
    const warning = r.errors.length
      ? '<p class="validation">INCOMPLETE CALCULATION: ' +
        r.errors.map(esc).join(" ") +
        "</p>"
      : "";
    $("printReport").className =
      (state.reportLayout === "compact" ? "compact " : "") +
      (state.reportType === "calculation" ? "calculation-only" : "branded-report");
    $("printReport").innerHTML =
      `<div class="report-header"><div><h1>New Restaurant Optional Method Calculation</h1><p>NEC 2023 — 220.88 | ${state.restaurantType === "all-electric" ? "All Electric" : state.restaurantType === "not-all-electric" ? "Not All Electric" : "Configuration not selected"}</p></div>${state.reportType === "branded" ? '<div class="print-brand"><span class="print-brand-main">LoadCalc</span><span class="print-brand-accent">Pro X</span></div>' : ""}</div><div class="report-meta">${["projectName", "projectNumber", "projectAddress", "projectCityState"].map((k, i) => (state[k] ? "<div><strong>" + ["Project", "Project Number", "Address", "City / State"][i] + ":</strong> " + esc(state[k]) + "</div>" : "")).join("")}</div>${warning}<table><colgroup><col style="width:61%"><col style="width:9%"><col style="width:14%"><col style="width:16%"></colgroup><thead><tr><th>Load Description / Calculation</th><th>Qty</th><th>VA Each</th><th>Load VA</th></tr></thead><tbody>${html}</tbody></table><div class="report-result">Calculated Service Load: ${r.errors.length ? "Incomplete" : r.amps.toLocaleString("en-US", { maximumFractionDigits: 1 }) + " A"} &nbsp; | &nbsp; ${esc(state.voltage)} V ${state.phase === "3" ? "3Φ" : "1Φ"}</div><p class="report-foot">NEC 2023 Section 220.88 optional method for a new restaurant whose service or feeder supplies the restaurant total load. Total connected load includes all electrical loads and both heating and cooling. Verify eligibility, adopted-code amendments, conductor ampacity, overcurrent protection and neutral calculations separately.</p>`;
  }
  function buildReport() {
    update(false);
    if (state.method === "restaurant22088") {
      buildRestaurantReport();
      return;
    }
    const r = result;
    let html =
      section("General Lighting") +
      r.lightingAreas
        .map((a, i) => {
          const prefix = i ? "Area " + (i + 1) + " — " : "";
          return (
            printRow(
              prefix +
                (a.occupancy?.label || "Occupancy") +
                " — " +
                (a.occupancy?.va || 0) +
                " VA/ft²",
              a.sqft,
              a.occupancy?.va || 0,
              a.minimum,
            ) +
            printRow(prefix + "Lighting before demand", "", "", a.base) +
            printRow(prefix + a.demand.method, "", "", a.used, "total")
          );
        })
        .join("") +
      printRow("TOTAL LIGHTING LOAD USED", "", "", r.lighting, "total");
    if (r.lightingOther)
      html +=
        section("Additional Lighting — 125% Continuous Load") +
        printRow("Show-window lighting — 200 VA/ft × 125%", "", "", r.showWindow) +
        printRow("Track lighting — 150 VA/2 ft × 125%", "", "", r.track) +
        printRow("Sign / outline lighting — 1,200 VA × 125%", "", "", r.signs) +
        printRow("Additional lighting load", "", "", r.lightingOther, "total");
    if (r.receptacleCountVA || r.receptacleOfficeVA)
      html +=
        section("Receptacle Loads") +
        (r.receptacleCountVA
          ? printRow(
              "Receptacle yokes × 180 VA",
              state.receptacles,
              180,
              r.receptacleCountVA,
            )
          : "") +
        (r.receptacleOfficeVA
          ? printRow(
              "Office minimum — 1 VA/ft²",
              state.sqft,
              1,
              r.receptacleOfficeVA,
            )
          : "") +
        printRow("Receptacle demand", "", "", r.receptacles, "total");
    if (r.other)
      html +=
        section("Other Loads") +
        loadRows("other") +
        printRow("Other loads at 100%", "", "", r.other, "total");
    if (r.kitchen)
      html +=
        section("Commercial Kitchen Equipment") +
        loadRows("kitchen") +
        printRow(
          "Table 220.56 percentage result — " +
            fmt(r.kitchenFactor * 100) +
            "%",
          "",
          "",
          r.kitchenTableDemand,
        ) +
        printRow(
          "Two largest appliances — required minimum",
          "",
          "",
          r.kitchenTwoLargest,
        ) +
        printRow(
          "Kitchen load used — larger result",
          "",
          "",
          r.kitchen,
          "total",
        );
    if (r.hvac)
      html +=
        section("HVAC Loads") +
        printRow("Cooling input", "", "", Number(state.cooling)) +
        printRow("Heating input", "", "", Number(state.heating)) +
        printRow(
          state.hvacMode === "simultaneous"
            ? "Cooling + heating"
            : "Larger noncoincident load",
          "",
          "",
          r.hvac,
          "total",
        );
    if (r.motorBase || r.motorAdder)
      html +=
        section("Motors") +
        loadRows("motors") +
        printRow(
          "Largest applicable motor " + va(r.largestMotor) + " × 25%",
          "",
          "",
          r.motorAdder,
          "total",
        );
    if (r.continuous)
      html +=
        section("Continuous and Other Loads") +
        loadRows("continuous") +
        printRow(
          "Continuous and other total used",
          "",
          "",
          r.continuous,
          "total",
        );
    if (r.special)
      html +=
        section("Project-Specific NEC Demand Loads") +
        loadRows("special") +
        printRow(
          "Project-specific demand loads used",
          "",
          "",
          r.special,
          "total",
        );
    html += printRow("TOTAL CALCULATED LOAD", "", "", r.total, "total");
    const warning = r.errors.length
      ? '<p class="validation">INCOMPLETE CALCULATION: ' +
        r.errors.map(esc).join(" ") +
        "</p>"
      : "";
    $("printReport").className =
      (state.reportLayout === "compact" ? "compact " : "") +
      (state.reportType === "calculation" ? "calculation-only" : "branded-report");
    $("printReport").innerHTML =
      `<div class="report-header"><div>${state.reportType === "branded" ? '<div class="print-brand"><span class="print-brand-main">LoadCalc</span><span class="print-brand-accent">Pro X</span></div>' : ""}<h1>Commercial Standard Method Load Calculation</h1><p>NEC 2023</p></div></div><div class="report-meta">${["projectName", "projectNumber", "projectAddress", "projectCityState"].map((k, i) => (state[k] ? "<div><strong>" + ["Project", "Project Number", "Address", "City / State"][i] + ":</strong> " + esc(state[k]) + "</div>" : "")).join("")}</div>${warning}<table><colgroup><col style="width:61%"><col style="width:9%"><col style="width:14%"><col style="width:16%"></colgroup><thead><tr><th>Load Description / Calculation</th><th>Qty</th><th>VA Each</th><th>Load VA</th></tr></thead><tbody>${html}</tbody></table><div class="report-result">Calculated Service Load: ${r.errors.length ? "Incomplete" : r.amps.toLocaleString("en-US", { maximumFractionDigits: 1 }) + " A"} &nbsp; | &nbsp; ${esc(state.voltage)} V ${state.phase === "3" ? "3Φ" : "1Φ"}</div><p class="report-foot">Commercial Standard Method worksheet. Verify project-specific loads, adopted-code amendments, conductor ampacity, overcurrent protection and neutral calculations separately.</p>`;
  }
  $("print").onclick = () => {
    update(false);
    if (result.errors.length) {
      const validation =
        state.method === "restaurant22088"
          ? $("restaurantValidation")
          : $("validation");
      validation.hidden = false;
      validation.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    buildReport();
    window.print();
  };
  window.addEventListener("beforeprint", buildReport);
  Object.entries(CommercialEngine.OCCUPANCIES).forEach(([key, o]) =>
    $("occupancy").insertAdjacentHTML(
      "beforeend",
      `<option value="${key}">${esc(o.label)}</option>`,
    ),
  );
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "null");
    if (
      parsed &&
      parsed.version === 1 &&
      ["other", "kitchen", "motors", "continuous"].every((g) =>
        Array.isArray(parsed[g]),
      )
    )
      saved = {
        ...fresh(),
        ...parsed,
        occupancyAreas: Array.isArray(parsed.occupancyAreas)
          ? parsed.occupancyAreas
          : [],
        special: Array.isArray(parsed.special)
          ? parsed.special
          : fresh().special,
      };
  } catch {}
  render();
  if (saved) {
    promptOpen = true;
    $("restore").showModal();
  }
})();
