"use strict";

function syncLargestMotorSection(){}

function largestMotorCalculation(){
  return {
    service:0,
    generator:0,
    additionalVA:0,
    type:""
  };
}

const STORAGE_KEY =
"loadcalcpro_generator_mobile_nec2023_v1";

const MANAGED_QTY_STORAGE_KEY =
"loadcalcpro_generator_mobile_managed_quantities_v1";

let suppressAutoSave = false;
let restorePromptOpen = false;
let saveStatusTimer = null;

const managedQuantities = readManagedQuantities();

const APPLIANCES = [
  {row:10,label:"Dishwasher"},
  {row:11,label:"Disposal"},
  {row:12,label:"Refrigerator"},
  {row:13,label:"Microwave"},
  {row:14,label:"Hood Fan"},
  {row:15,label:"Freezer"},
  {row:16,label:"Range — Nameplate"},
  {row:17,label:"Wall Oven — Nameplate"},
  {row:18,label:"Cooktop"},
  {row:19,label:"Bath Fan",editable:true},
  {row:20,label:"Wine Cooler",editable:true},
  {row:21,label:"Coffee Machine",editable:true},
  {row:22,label:"Garage Door Opener",editable:true},
  {row:23,label:"Golf Cart Charger",editable:true},
  {row:24,label:"Pool Equipment",editable:true},
  {row:25,label:"Irrigation Pump",editable:true},
  {row:26,label:"Sauna",editable:true},
  {row:27,label:"",editable:true},
  {row:28,label:"",editable:true},
  {row:29,label:"Water Heater"},
  {row:30,label:"Dryer"}
];

const MANAGED_ROWS = [
  10,11,12,13,14,15,16,17,18,19,20,
  21,22,23,24,25,26,27,28,29,30,
  37,38,39,40,41,42,43,47
];

const INPUT_ROWS = [
  5,6,7,
  10,11,12,13,14,15,16,17,18,19,20,
  21,22,23,24,25,26,27,28,29,30,
  37,38,39,40,42,43,47
];

function numberValue(id){
  const el = document.getElementById(id);
  const n = Number(el ? el.value : 0);
  return Number.isFinite(n) ? n : 0;
}

function positiveQuantity(id){
  const n = Math.floor(numberValue(id));
  return n > 0 ? n : 0;
}

function formatted(value){
  const n = Number(value);

  if(!Number.isFinite(n) || n === 0){
    return "";
  }

  return Math.round(n).toLocaleString("en-US");
}

function setOutput(id,value){
  const el = document.getElementById(id);

  if(el){
    el.textContent = formatted(value);
  }
}

function readOutput(id){
  const el = document.getElementById(id);

  if(!el){
    return 0;
  }

  const n = Number(
    String(el.textContent || "")
    .replace(/[^0-9.-]/g,"")
  );

  return Number.isFinite(n) ? n : 0;
}

function readManagedQuantities(){
  try{
    const saved =
      localStorage.getItem(MANAGED_QTY_STORAGE_KEY);

    return saved ? JSON.parse(saved) : {};
  }catch(e){
    return {};
  }
}

function saveManagedQuantities(){
  try{
    localStorage.setItem(
      MANAGED_QTY_STORAGE_KEY,
      JSON.stringify(managedQuantities)
    );
  }catch(e){}
}

function totalQuantity(row){
  return positiveQuantity("q" + row);
}

function managedQuantity(row){
  const total = totalQuantity(row);

  let selected =
    Math.floor(Number(managedQuantities[row] || 0));

  if(!Number.isFinite(selected) || selected < 0){
    selected = 0;
  }

  if(selected > total){
    selected = total;
  }

  managedQuantities[row] = selected;

  return selected;
}

function updateManagedControl(row){
  const check =
    document.getElementById("m" + row);

  const quantityButton =
    document.getElementById("mq" + row);

  if(!check || !quantityButton){
    return;
  }

  let selected = managedQuantity(row);

  const isHVACRow =
    row >= 37 && row <= 40;

  const applicable =
    !isHVACRow ||
    typeof window.isHVACManagedRowApplicable !== "function" ||
    window.isHVACManagedRowApplicable(row);

  if(
    !applicable ||
    totalQuantity(row) < 1 ||
    numberValue("v" + row) <= 0
  ){
    selected = 0;
  }

  check.classList.toggle(
    "checked",
    selected > 0
  );

  check.textContent =
    selected > 0 ? "✓" : "";

  quantityButton.classList.toggle(
    "show",
    selected > 0
  );

  quantityButton.textContent =
    String(selected);

  check.title =
    selected > 0
      ? "Click to remove managed selection"
      : "Click to manage all entered units";

  quantityButton.title =
    "Click to reduce the managed quantity";
}

function toggleManaged(row){
  if(
    row >= 37 &&
    row <= 40 &&
    typeof window.isHVACManagedRowApplicable === "function" &&
    !window.isHVACManagedRowApplicable(row)
  ){
    return;
  }

  const total = totalQuantity(row);
  const selected = managedQuantity(row);

  managedQuantities[row] =
    selected > 0 ? 0 : total;

  saveManagedQuantities();
  updateManagedControl(row);
  calculate();
}

function reduceManagedQuantity(row){
  if(
    row >= 37 &&
    row <= 40 &&
    typeof window.isHVACManagedRowApplicable === "function" &&
    !window.isHVACManagedRowApplicable(row)
  ){
    return;
  }

  const total = totalQuantity(row);

  if(total < 1){
    return;
  }

  let selected =
    managedQuantity(row) - 1;

  if(selected < 0){
    selected = total;
  }

  managedQuantities[row] = selected;

  saveManagedQuantities();
  updateManagedControl(row);
  calculate();
}

function generatorRowValue(row,serviceValue){
  const total = totalQuantity(row);

  if(total < 1){
    return serviceValue;
  }

  const selected = managedQuantity(row);

  return (
    serviceValue *
    Math.max(total - selected,0) /
    total
  );
}

function applianceDescription(row,defaultLabel){
  const input =
    document.getElementById("d" + row);

  if(input){
    return String(input.value || "").trim();
  }

  return defaultLabel || "";
}

function createApplianceRows(){
  const container =
    document.getElementById("applianceRows");

  if(!container){
    return;
  }

  container.innerHTML = "";

  for(const item of APPLIANCES){
    const row =
      document.createElement("div");

    row.className = "load-row";

    const nameArea =
      document.createElement("div");

    nameArea.className = "load-name";

    if(item.editable){
      const description =
        document.createElement("input");

      description.id = "d" + item.row;
      description.type = "text";
      description.className = "descInput";

      description.placeholder =
        item.label || "Enter load description";

      description.value =
        item.label || "";

      description.addEventListener(
        "input",
        function(){
          saveState();
        }
      );

      nameArea.appendChild(description);

    }else{
      nameArea.textContent = item.label;
    }

    const inputs =
      document.createElement("div");

    inputs.className = "load-inputs";

    const qtyBlock =
      document.createElement("div");

    qtyBlock.className = "input-block";

    const qtyLabel =
      document.createElement("label");

    qtyLabel.setAttribute(
      "for",
      "q" + item.row
    );

    qtyLabel.textContent = "Qty";

    const qtyInput =
      document.createElement("input");

    qtyInput.id = "q" + item.row;
    qtyInput.type = "number";
    qtyInput.min = "0";
    qtyInput.step = "1";
    qtyInput.inputMode = "numeric";

    if(item.qty !== undefined){
      qtyInput.value = item.qty;
    }

    qtyInput.addEventListener(
      "input",
      function(){
        const currentTotal =
          totalQuantity(item.row);

        if(
          managedQuantity(item.row) >
          currentTotal
        ){
          managedQuantities[item.row] =
            currentTotal;
        }

        updateManagedControl(item.row);
        calculate();
      }
    );

    qtyBlock.appendChild(qtyLabel);
    qtyBlock.appendChild(qtyInput);

    const vaBlock =
      document.createElement("div");

    vaBlock.className = "input-block";

    const vaLabel =
      document.createElement("label");

    vaLabel.setAttribute(
      "for",
      "v" + item.row
    );

    vaLabel.textContent = "VA";

    const vaInput =
      document.createElement("input");

    vaInput.id = "v" + item.row;
    vaInput.type = "number";
    vaInput.min = "0";
    vaInput.step = "any";
    vaInput.inputMode = "decimal";

    if(item.va !== undefined){
      vaInput.value = item.va;
    }

    vaInput.addEventListener(
      "input",
      calculate
    );

    vaBlock.appendChild(vaLabel);
    vaBlock.appendChild(vaInput);

    inputs.appendChild(qtyBlock);
    inputs.appendChild(vaBlock);

    const outputRow =
      document.createElement("div");

    outputRow.className = "row-output";

    const serviceBox =
      document.createElement("div");

    serviceBox.className = "output-box";

    serviceBox.innerHTML =
      '<div class="output-label">' +
      'Service Load VA' +
      '</div>' +
      '<div id="e' +
      item.row +
      '" class="output-value"></div>';
    const generatorBox =
      document.createElement("div");

    generatorBox.className = "output-box";

    generatorBox.innerHTML =
      '<div class="output-label">' +
      'Generator Load VA' +
      '</div>' +
      '<div id="f' +
      item.row +
      '" class="output-value"></div>';

    outputRow.appendChild(serviceBox);
    outputRow.appendChild(generatorBox);

    const managedRow =
      document.createElement("div");

    managedRow.className = "managed-row";

    const managedLabel =
      document.createElement("div");

    managedLabel.className =
      "managed-label";

    managedLabel.textContent =
      "Managed Load";

    const managedControls =
      document.createElement("div");

    managedControls.className =
      "managed-controls";

    const checkButton =
      document.createElement("button");

    checkButton.id = "m" + item.row;
    checkButton.className =
      "managed-check";
    checkButton.type = "button";

    checkButton.setAttribute(
      "aria-label",
      "Toggle managed load"
    );

    checkButton.addEventListener(
      "click",
      function(){
        toggleManaged(item.row);
      }
    );

    const qtyButton =
      document.createElement("button");

    qtyButton.id = "mq" + item.row;
    qtyButton.className =
      "managed-qty";
    qtyButton.type = "button";
    qtyButton.textContent = "0";

    qtyButton.setAttribute(
      "aria-label",
      "Reduce managed quantity"
    );

    qtyButton.addEventListener(
      "click",
      function(event){
        event.stopPropagation();
        reduceManagedQuantity(item.row);
      }
    );

    managedControls.appendChild(
      checkButton
    );

    managedControls.appendChild(
      qtyButton
    );

    managedRow.appendChild(
      managedLabel
    );

    managedRow.appendChild(
      managedControls
    );

    row.appendChild(nameArea);
    row.appendChild(inputs);
    row.appendChild(outputRow);
    row.appendChild(managedRow);

    container.appendChild(row);
  }
}

function rowVA(row){
  const quantity =
    positiveQuantity("q" + row);

  let va = numberValue("v" + row);

  if(row === 43 && quantity > 0){
    va = Math.max(va,7200);
  }

  return quantity * va;
}

function ensureRequiredLoadWarning(){
  let warning =
    document.getElementById(
      "necRequiredLoadWarning"
    );

  if(warning){
    return warning;
  }

  const q7 =
    document.getElementById("q7");

  const generalCard =
    q7 ? q7.closest(".card") : null;

  const body =
    generalCard
      ? generalCard.querySelector(".card-body")
      : null;

  if(!body){
    return null;
  }

  warning =
    document.createElement("div");

  warning.id =
    "necRequiredLoadWarning";

  warning.className =
    "nec-required-warning";

  body.appendChild(warning);

  return warning;
}

function validateRequiredGeneralLoads(){
  const small =
    positiveQuantity("q6");

  const laundry =
    positiveQuantity("q7");

  const q6 =
    document.getElementById("q6");

  const q7 =
    document.getElementById("q7");

  const warning =
    ensureRequiredLoadWarning();

  const smallValid =
    small >= 2;

  const laundryValid =
    laundry >= 1;

  const valid =
    smallValid && laundryValid;

  if(q6){
    q6.classList.toggle(
      "nec-invalid-input",
      !smallValid
    );
  }

  if(q7){
    q7.classList.toggle(
      "nec-invalid-input",
      !laundryValid
    );
  }

  if(warning){
    const missing = [];

    if(!smallValid){
      missing.push(
        "at least 2 small-appliance circuits"
      );
    }

    if(!laundryValid){
      missing.push(
        "at least 1 laundry circuit"
      );
    }

    warning.textContent =
      valid
        ? ""
        : "Required dwelling loads are incomplete: enter " +
          missing.join(" and ") +
          ".";

    warning.classList.toggle(
      "show",
      !valid
    );
  }

  return {
    valid:valid,
    smallApplianceValid:smallValid,
    laundryValid:laundryValid
  };
}

function showIncompleteResults(){
  for(const id of [
    "serviceAmps",
    "generatorAmps"
  ]){
    const el =
      document.getElementById(id);

    if(el){
      el.textContent =
        "Required loads incomplete";

      el.classList.add(
        "incomplete"
      );
    }
  }
}

function clearIncompleteResultStyle(){
  for(const id of [
    "serviceAmps",
    "generatorAmps"
  ]){
    const el =
      document.getElementById(id);

    if(el){
      el.classList.remove(
        "incomplete"
      );
    }
  }
}

function generalLoadCalculation(){
  const squareFeet =
    numberValue("q5");

  const lighting =
    squareFeet * 3;

  const smallAppliance =
    positiveQuantity("q6") * 1500;

  const laundry =
    positiveQuantity("q7") * 1500;

  setOutput(
    "e5",
    lighting
  );

  setOutput(
    "f5",
    lighting
  );

  setOutput(
    "e6",
    smallAppliance
  );

  setOutput(
    "f6",
    smallAppliance
  );

  setOutput(
    "e7",
    laundry
  );

  setOutput(
    "f7",
    laundry
  );

  const total =
    lighting +
    smallAppliance +
    laundry;

  setOutput(
    "e8",
    total
  );

  setOutput(
    "f8",
    total
  );

  return total;
}

function applianceLoadCalculation(){
  let serviceApplianceTotal = 0;
  let generatorApplianceTotal = 0;

  for(const item of APPLIANCES){
    const serviceValue =
      rowVA(item.row);

    const generatorValue =
      generatorRowValue(
        item.row,
        serviceValue
      );

    setOutput(
      "e" + item.row,
      serviceValue
    );

    setOutput(
      "f" + item.row,
      generatorValue
    );

    serviceApplianceTotal +=
      serviceValue;

    generatorApplianceTotal +=
      generatorValue;
  }

  setOutput(
    "e31",
    serviceApplianceTotal
  );

  setOutput(
    "f31",
    generatorApplianceTotal
  );

  return {
    service:serviceApplianceTotal,
    generator:generatorApplianceTotal
  };
}

function optionalMethodDemand(load){
  const total =
    Math.max(
      Number(load) || 0,
      0
    );

  if(total <= 10000){
    return total;
  }

  return (
    10000 +
    ((total - 10000) * 0.40)
  );
}

function combinedDemandCalculation(
  generalLoad,
  applianceLoads
){
  const serviceCombined =
    generalLoad +
    applianceLoads.service;

  const generatorCombined =
    generalLoad +
    applianceLoads.generator;

  const serviceAfterDemand =
    optionalMethodDemand(
      serviceCombined
    );

  const generatorAfterDemand =
    optionalMethodDemand(
      generatorCombined
    );

  setOutput(
    "e35",
    serviceAfterDemand
  );

  setOutput(
    "f35",
    generatorAfterDemand
  );

  return {
    service:serviceAfterDemand,
    generator:generatorAfterDemand
  };
}

function calculateHeatingDemand(
  firstHeatingLoad,
  secondHeatingLoad,
  firstQuantity,
  secondQuantity
){
  const totalHeating =
    firstHeatingLoad +
    secondHeatingLoad;

  const totalHeatingUnits =
    firstQuantity +
    secondQuantity;

  if(totalHeatingUnits >= 4){
    return totalHeating * 0.40;
  }

  return totalHeating;
}

function hvacLoadCalculation(){
  const ac1Service =
    rowVA(37);

  const heat1Service =
    rowVA(38);

  const ac2Service =
    rowVA(39);

  const heat2Service =
    rowVA(40);

  const ac1Generator =
    generatorRowValue(
      37,
      ac1Service
    );

  const heat1Generator =
    generatorRowValue(
      38,
      heat1Service
    );

  const ac2Generator =
    generatorRowValue(
      39,
      ac2Service
    );

  const heat2Generator =
    generatorRowValue(
      40,
      heat2Service
    );

  setOutput(
    "e37",
    ac1Service
  );

  setOutput(
    "f37",
    ac1Generator
  );

  setOutput(
    "e38",
    heat1Service
  );

  setOutput(
    "f38",
    heat1Generator
  );

  setOutput(
    "e39",
    ac2Service
  );

  setOutput(
    "f39",
    ac2Generator
  );

  setOutput(
    "e40",
    heat2Service
  );

  setOutput(
    "f40",
    heat2Generator
  );

  const serviceAC =
    ac1Service +
    ac2Service;

  const generatorAC =
    ac1Generator +
    ac2Generator;

  const serviceHeating =
    calculateHeatingDemand(
      heat1Service,
      heat2Service,
      positiveQuantity("q38"),
      positiveQuantity("q40")
    );

  const generatorHeatingUnits =
    Math.max(
      positiveQuantity("q38") -
      managedQuantity(38),
      0
    ) +
    Math.max(
      positiveQuantity("q40") -
      managedQuantity(40),
      0
    );

  const generatorHeatingTotal =
    heat1Generator +
    heat2Generator;

const generatorHeating =
  generatorHeatingUnits >= 4
    ? generatorHeatingTotal * 0.40
    : generatorHeatingTotal;

const serviceHVAC =
  Math.max(
    serviceAC,
    serviceHeating
  );

const generatorHVAC =
  Math.max(
    generatorAC,
    generatorHeating
  );

return {
  service:serviceHVAC,
  generator:generatorHVAC,
  serviceAC:serviceAC,
  generatorAC:generatorAC,
  serviceHeating:serviceHeating,
  generatorHeating:generatorHeating
};
}

function applicableManagedLoadCount(){
  let total = 0;

  for(const row of MANAGED_ROWS){
    if(row === 41) continue;

    const quantity =
      positiveQuantity("q" + row);

    const va =
      numberValue("v" + row);

    if(quantity < 1 || va <= 0){
      continue;
    }

    if(
      row >= 37 &&
      row <= 40 &&
      typeof window.isHVACManagedRowApplicable === "function" &&
      !window.isHVACManagedRowApplicable(row)
    ){
      continue;
    }

    total += Math.min(
      managedQuantity(row),
      quantity
    );
  }

  return total;
}

function continuousLoadCalculation(){
  const evService =
    rowVA(43);

  const evGenerator =
    generatorRowValue(
      43,
      evService
    );

  setOutput("e43",evService);
  setOutput("f43",evGenerator);

  const continuous100Service =
    rowVA(47);

  const continuous100Generator =
    generatorRowValue(
      47,
      continuous100Service
    );

  setOutput(
    "e47",
    continuous100Service
  );

  setOutput(
    "f47",
    continuous100Generator
  );

  const additionalContinuousService =
    rowVA(42) * 1.25;

  const additionalContinuousGenerator =
    generatorRowValue(
      42,
      additionalContinuousService
    );

  setOutput(
    "e42",
    additionalContinuousService
  );

  setOutput(
    "f42",
    additionalContinuousGenerator
  );

  return {
    service:
      evService +
      continuous100Service +
      additionalContinuousService,

    generator:
      evGenerator +
      continuous100Generator +
      additionalContinuousGenerator,

    evService:evService,
    evGenerator:evGenerator,

    continuous100Service:
      continuous100Service,

    continuous100Generator:
      continuous100Generator,

    additionalService:
      additionalContinuousService,

    additionalGenerator:
      additionalContinuousGenerator
  };
}

function serviceVoltage(){
  const voltage =
    numberValue("q46");

  return voltage > 0
    ? voltage
    : 240;
}

function calculateAmps(
  totalVA,
  voltage
){
  if(
    !Number.isFinite(totalVA) ||
    !Number.isFinite(voltage) ||
    voltage <= 0
  ){
    return 0;
  }

  return totalVA / voltage;
}

function displayAmps(
  id,
  amps
){
  const el =
    document.getElementById(id);

  if(!el){
    return;
  }

  const rounded =
    Math.ceil(
      Number(amps) || 0
    );

  el.textContent =
    rounded.toLocaleString("en-US") +
    " A";
}

function calculate(){

  /* V5.41: protect a saved calculation while
     the Continue / Start New prompt is open. */
  if(restorePromptOpen){
    return;
  }

  const generalLoad =
    generalLoadCalculation();

  const applianceLoads =
    applianceLoadCalculation();

  const continuousLoads =
    (
      typeof window.continuousLoadCalculation ===
      "function"
    )
      ? window.continuousLoadCalculation()
      : continuousLoadCalculation();

  const largestMotor =
    largestMotorCalculation();

  /* NEC 2023 Optional Method:
     EVSE and largest-motor adder
     are included before demand
     is applied. */

  const demandLoads =
    combinedDemandCalculation(
      generalLoad,
      {
        service:
          applianceLoads.service +
          continuousLoads.evService +
          largestMotor.additionalVA,

        generator:
          applianceLoads.generator +
          continuousLoads.evGenerator +
          largestMotor.additionalVA
      }
    );

  const hvacLoads =
    (
      typeof window.hvacLoadCalculation ===
      "function"
    )
      ? window.hvacLoadCalculation()
      : hvacLoadCalculation();

  /* EVSE and largest-motor adder
     already included above. */

  const serviceHVACContinuous =
    hvacLoads.service +
    (
      continuousLoads.service -
      continuousLoads.evService
    );

  const generatorHVACContinuous =
    hvacLoads.generator +
    (
      continuousLoads.generator -
      continuousLoads.evGenerator
    );

  setOutput(
    "e44",
    hvacLoads.service
  );

  setOutput(
    "f44",
    hvacLoads.generator
  );

  setOutput(
    "e45",
    continuousLoads.service
  );

  setOutput(
    "f45",
    continuousLoads.generator
  );

  const serviceTotalVA =
    demandLoads.service +
    serviceHVACContinuous;

  const generatorTotalVA =
    demandLoads.generator +
    generatorHVACContinuous;

  const voltage =
    serviceVoltage();

  const serviceCurrent =
    calculateAmps(
      serviceTotalVA,
      voltage
    );

  const generatorCurrent =
    calculateAmps(
      generatorTotalVA,
      voltage
    );

  const requiredLoads =
    validateRequiredGeneralLoads();

  clearIncompleteResultStyle();

  displayAmps(
    "serviceAmps",
    serviceCurrent
  );

  displayAmps(
    "generatorAmps",
    generatorCurrent
  );

  updatePrintRows({
    generalLoad:generalLoad,
    applianceLoads:applianceLoads,
    demandLoads:demandLoads,
    hvacLoads:hvacLoads,
    continuousLoads:continuousLoads,
    largestMotor:largestMotor,
    serviceTotalVA:serviceTotalVA,
    generatorTotalVA:generatorTotalVA,
    serviceCurrent:serviceCurrent,
    generatorCurrent:generatorCurrent,
    voltage:voltage,
    requiredLoadsValid:
      requiredLoads.valid,

    managedLoadCount:
      (
        typeof window.getCompleteManagedLoadCount ===
        "function"
      )
        ? window.getCompleteManagedLoadCount()
        : applicableManagedLoadCount()
  });

  for(const row of MANAGED_ROWS){
    updateManagedControl(row);
  }

  /* Final HVAC refresh keeps the
     controlling rows clickable. */
  [37,38,39,40].forEach(
    function(row){
      updateManagedControl(row);
    }
  );

  if(!suppressAutoSave){
    saveState(false);
  }
}

function connectStaticManagedControls(){

  const staticRows = [
    37,38,39,40,42,43
  ];

  for(const row of staticRows){

    const check =
      document.getElementById(
        "m" + row
      );

    const quantity =
      document.getElementById(
        "mq" + row
      );

    if(check){
      check.addEventListener(
        "click",
        function(){
          toggleManaged(row);
        }
      );
    }

    if(quantity){
      quantity.addEventListener(
        "click",
        function(event){
          event.stopPropagation();
          reduceManagedQuantity(row);
        }
      );
    }
  }
}

function connectCalculatorInputs(){

  const ids = [
    "q5","q6","q7",
    "q37","v37",
    "q38","v38",
    "q39","v39",
    "q40","v40",
    "q42","v42",
    "q43","v43",
    "q47","v47",
    "q46"
  ];

  for(const id of ids){

    const el =
      document.getElementById(id);

    if(!el){
      continue;
    }

    const eventName =
      el.tagName === "SELECT"
        ? "change"
        : "input";

    el.addEventListener(
      eventName,
      function(){

        const rowMatch =
          id.match(/^q(\d+)$/);

        if(rowMatch){

          const row =
            Number(rowMatch[1]);

          if(
            MANAGED_ROWS.includes(row)
          ){
            const total =
              totalQuantity(row);

            if(
              managedQuantity(row) >
              total
            ){
              managedQuantities[row] =
                total;
            }

            updateManagedControl(row);
          }
        }

        calculate();
      }
    );
  }

  document
    .querySelectorAll(
      'input[name="largestMotorType"]'
    )
    .forEach(function(el){
      el.addEventListener(
        "change",
        function(){
          calculate();
        }
      );
    });

  const projectIds = [
    "projectName",
    "projectNumber",
    "projectAddress",
    "projectCityState"
  ];

  for(const id of projectIds){

    const el =
      document.getElementById(id);

    if(el){
      el.addEventListener(
        "input",
        function(){
          saveState(false);
        }
      );
    }
  }
}

function calculatorState(){

  const state = {
    savedAt:
      new Date().toISOString(),

    project:{},

    inputs:{},

    descriptions:{},

    managedQuantities:{
      ...managedQuantities
    }
  };

  const projectIds = [
    "projectName",
    "projectNumber",
    "projectAddress",
    "projectCityState"
  ];

  for(const id of projectIds){

    const el =
      document.getElementById(id);

    state.project[id] =
      el ? el.value : "";
  }

  for(const row of INPUT_ROWS){

    const quantity =
      document.getElementById(
        "q" + row
      );

    const va =
      document.getElementById(
        "v" + row
      );

    if(quantity){
      state.inputs[
        "q" + row
      ] = quantity.value;
    }

    if(va){
      state.inputs[
        "v" + row
      ] = va.value;
    }

    const description =
      document.getElementById(
        "d" + row
      );

    if(description){
      state.descriptions[
        "d" + row
      ] = description.value;
    }
  }

  const voltage =
    document.getElementById(
      "q46"
    );

  if(voltage){
    state.inputs.q46 =
      voltage.value;
  }

  const motorCheckbox =
    document.getElementById(
      "includeLargestMotor"
    );

  const motorVA =
    document.getElementById(
      "largestMotorVA"
    );

  const motorType =
    document.querySelector(
      'input[name="largestMotorType"]:checked'
    );

  state.largestMotor = {
    included:
      Boolean(
        motorCheckbox &&
        motorCheckbox.checked
      ),

    va:
      motorVA
        ? motorVA.value
        : "",

    type:
      motorType
        ? motorType.value
        : ""
  };

  return state;
}

function showSaveStatus(text){

  const status =
    document.getElementById(
      "saveStatus"
    );

  if(!status){
    return;
  }

  status.textContent =
    text || "";

  if(saveStatusTimer){
    clearTimeout(
      saveStatusTimer
    );
  }

  if(text){
    saveStatusTimer =
      setTimeout(
        function(){
          status.textContent = "";
        },
        1800
      );
  }
}

function saveState(showMessage){

  /* V5.41:
     never overwrite saved work
     while the restore choice is pending. */

  if(
    suppressAutoSave ||
    restorePromptOpen
  ){
    return;
  }

  try{

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        calculatorState()
      )
    );

    saveManagedQuantities();

    if(showMessage !== false){
      showSaveStatus(
        "Calculation saved"
      );
    }

  }catch(e){

    if(showMessage !== false){
      showSaveStatus(
        "Unable to save calculation"
      );
    }
  }
}

function savedState(){

  try{

    const raw =
      localStorage.getItem(
        STORAGE_KEY
      );

    if(!raw){
      return null;
    }

    const data =
      JSON.parse(raw);

    return (
      data &&
      typeof data === "object"
    )
      ? data
      : null;

  }catch(e){
    return null;
  }
}

function hasSavedCalculation(){

  const data =
    savedState();

  if(!data){
    return false;
  }

  const values = [
    ...Object.values(
      data.project || {}
    ),

    ...Object.values(
      data.inputs || {}
    ),

    ...Object.values(
      data.descriptions || {}
    ),

    ...Object.values(
      data.largestMotor || {}
    )
  ];

  return values.some(
    function(value){
      return String(
        value || ""
      ).trim() !== "";
    }
  );
}

function restoreState(){

  const state =
    savedState();

  if(!state){
    return false;
  }

  suppressAutoSave = true;

  try{

    for(
      const [id,value]
      of Object.entries(
        state.project || {}
      )
    ){

      const el =
        document.getElementById(id);

      if(el){
        el.value =
          value === null ||
          value === undefined
            ? ""
            : value;
      }
    }

    for(
      const [id,value]
      of Object.entries(
        state.inputs || {}
      )
    ){

      const el =
        document.getElementById(id);

      if(el){
        el.value =
          value === null ||
          value === undefined
            ? ""
            : value;
      }
    }

    for(
      const [id,value]
      of Object.entries(
        state.descriptions || {}
      )
    ){

      const el =
        document.getElementById(id);

      if(el){
        el.value =
          value === null ||
          value === undefined
            ? ""
            : value;
      }
    }

    const savedManaged =
      state.managedQuantities || {};

    for(
      const key
      of Object.keys(
        managedQuantities
      )
    ){
      delete managedQuantities[key];
    }

    for(
      const [row,value]
      of Object.entries(
        savedManaged
      )
    ){

      managedQuantities[row] =
        Math.max(
          Math.floor(
            Number(value) || 0
          ),
          0
        );
    }

    saveManagedQuantities();

  }finally{
    suppressAutoSave = false;
  }

  calculate();

  showSaveStatus(
    "Previous calculation restored"
  );

  return true;
}

function clearCalculatorFields(){

  suppressAutoSave = true;

  try{

    const projectIds = [
      "projectName",
      "projectNumber",
      "projectAddress",
      "projectCityState"
    ];

    for(const id of projectIds){

      const el =
        document.getElementById(id);

      if(el){
        el.value = "";
      }
    }

    for(const row of INPUT_ROWS){

      const quantity =
        document.getElementById(
          "q" + row
        );

      const va =
        document.getElementById(
          "v" + row
        );

      const description =
        document.getElementById(
          "d" + row
        );

      if(quantity){
        quantity.value = "";
      }

      if(va){
        va.value = "";
      }

      if(description){

        const appliance =
          APPLIANCES.find(
          function(item){
            return item.row === row;
          }
        );

        description.value =
          appliance &&
          appliance.label
            ? appliance.label
            : "";
      }
    }

    const voltage =
      document.getElementById("q46");

    if(voltage){
      voltage.value = "240";
    }

    const motorCheckbox =
      document.getElementById(
        "includeLargestMotor"
      );

    const motorVA =
      document.getElementById(
        "largestMotorVA"
      );

    if(motorCheckbox){
      motorCheckbox.checked = false;
    }

    if(motorVA){
      motorVA.value = "";
    }

    document
      .querySelectorAll(
        'input[name="largestMotorType"]'
      )
      .forEach(function(el){
        el.checked = false;
      });

    syncLargestMotorSection();

    for(
      const key
      of Object.keys(
        managedQuantities
      )
    ){
      delete managedQuantities[key];
    }

    if(
      typeof window.resetHeatingMethodSelection ===
      "function"
    ){
      window.resetHeatingMethodSelection();

    }else{
      try{
        localStorage.removeItem(
          "loadcalcpro_generator_mobile_heating_method_v2"
        );
      }catch(e){}
    }

    localStorage.removeItem(
      STORAGE_KEY
    );

    localStorage.removeItem(
      MANAGED_QTY_STORAGE_KEY
    );

  }catch(e){

  }finally{
    suppressAutoSave = false;
  }

  calculate();
}

function clearInputs(){

  clearCalculatorFields();

  showSaveStatus(
    "New calculation started"
  );
}

function startNewCalculationFromButton(){

  const hasData =
    hasSavedCalculation();

  if(
    hasData &&
    !window.confirm(
      "Start a new calculation? " +
      "The saved calculation on this device will be cleared."
    )
  ){
    return;
  }

  clearInputs();
}

function openRestorePrompt(){

  const modal =
    document.getElementById(
      "restoreModal"
    );

  if(!modal){
    return;
  }

  restorePromptOpen = true;

  modal.classList.add(
    "show"
  );
}

function closeRestorePrompt(){

  const modal =
    document.getElementById(
      "restoreModal"
    );

  if(modal){
    modal.classList.remove(
      "show"
    );
  }

  restorePromptOpen = false;
}

function continuePreviousCalculation(){

  closeRestorePrompt();

  restoreState();
}

function startNewFromSavedPrompt(){

  closeRestorePrompt();

  clearInputs();
}

function initializeSavedCalculation(){

  /* V5.41:
     saved work gets first priority;
     later startup calculations are
     blocked until a choice is made. */

  if(hasSavedCalculation()){
    openRestorePrompt();

  }else{
    calculate();
  }
}

function escapeHTML(value){

  return String(
    value || ""
  )
  .replace(/&/g,"&amp;")
  .replace(/</g,"&lt;")
  .replace(/>/g,"&gt;")
  .replace(/"/g,"&quot;")
  .replace(/'/g,"&#039;");
}

function printNumber(value){

  const number =
    Math.round(
      Number(value) || 0
    );

  return number > 0
    ? number.toLocaleString(
        "en-US"
      )
    : "";
}

function printLoadRow(
  description,
  quantity,
  serviceValue,
  generatorValue
){

  if(
    Number(serviceValue) <= 0 &&
    Number(generatorValue) <= 0
  ){
    return "";
  }

  const quantityText =
    quantity === null ||
    quantity === undefined ||
    String(quantity).trim() === ""
      ? ""
      : escapeHTML(
          String(quantity)
        );

  return (
    "<tr>" +
    "<td>" +
    escapeHTML(description) +
    "</td>" +
    "<td class=\"quantity\">" +
    quantityText +
    "</td>" +
    "<td class=\"number\">" +
    printNumber(serviceValue) +
    "</td>" +
    "<td class=\"number\">" +
    printNumber(generatorValue) +
    "</td>" +
    "</tr>"
  );
}

function printHVACMethod(){

  return (
    typeof window.getHVACMethodSummary ===
    "function"
  )
    ? window.getHVACMethodSummary()
    : "Not selected";
}

function printHeatPumpCondition(){

  const validation =
    (
      typeof window.validateHVACMethodSelection ===
      "function"
    )
      ? window.validateHVACMethodSelection()
      : {method:""};

  if(
    validation.method !==
    "heatpump"
  ){
    return "";
  }

  const summary =
    printHVACMethod();

  if(
    summary.indexOf(
      "compressor at 100%"
    ) >= 0
  ){
    return (
      "Compressor and supplemental electric heat " +
      "can operate simultaneously"
    );
  }

  if(
    summary.indexOf(
      "compressor locked out"
    ) >= 0
  ){
    return (
      "Compressor locked out during " +
      "supplemental electric heat"
    );
  }

  return (
    "Operating condition not selected"
  );
}

function updatePrintRows(data){

  const report =
    document.getElementById(
      "printReport"
    );

  if(!report){
    return;
  }

  let html = "";

  html += `
<div class="print-page">

<h1>
<span class="print-title-text">
Generator Optional Method Calculator
</span>

<span class="print-brand">
<span class="bolt">⚡</span>LoadCalcPro<span class="brand-x">X</span>
</span>
</h1>

<div class="print-project">

<div>
<strong>Project:</strong>
${escapeHTML(
  document.getElementById(
    "projectName"
  ).value
)}
</div>

<div>
<strong>Project #:</strong>
${escapeHTML(
  document.getElementById(
    "projectNumber"
  ).value
)}
</div>

<div>
<strong>Address:</strong>
${escapeHTML(
  document.getElementById(
    "projectAddress"
  ).value
)}
</div>

<div>
<strong>City / State:</strong>
${escapeHTML(
  document.getElementById(
    "projectCityState"
  ).value
)}
</div>

</div>

<div class="print-method-details">

<div>
<strong>HVAC Method:</strong>
${escapeHTML(
  printHVACMethod()
)}
</div>

${
  printHeatPumpCondition()
    ? `<div>
<strong>Heat-Pump Operating Condition:</strong>
${escapeHTML(
  printHeatPumpCondition()
)}
</div>`
    : ""
}

<div>
<strong>Service Voltage:</strong>
${printNumber(
  data.voltage
)} V
</div>

<div>
<strong>Service Total:</strong>
${printNumber(
  data.serviceTotalVA
)} VA /
${Math.ceil(
  data.serviceCurrent
)} A
</div>

<div>
<strong>Generator Total:</strong>
${printNumber(
  data.generatorTotalVA
)} VA /
${Math.ceil(
  data.generatorCurrent
)} A
</div>

</div>

<table class="print-table">

<thead>

<tr>
<th>Description</th>
<th>Quantity</th>
<th>Service VA</th>
<th>Generator VA</th>
</tr>

</thead>

<tbody>
`;

  html += printLoadRow(
    "General Lighting",
    numberValue("q5"),
    readOutput("e5"),
    readOutput("f5")
  );

  html += printLoadRow(
    "Small Appliance Circuits",
    positiveQuantity("q6"),
    readOutput("e6"),
    readOutput("f6")
  );

  html += printLoadRow(
    "Laundry Circuit",
    positiveQuantity("q7"),
    readOutput("e7"),
    readOutput("f7")
  );

  for(const item of APPLIANCES){

    const label =
      applianceDescription(
        item.row,
        item.label
      );

    html += printLoadRow(
      label,
      positiveQuantity(
        "q" + item.row
      ),
      readOutput(
        "e" + item.row
      ),
      readOutput(
        "f" + item.row
      )
    );
  }

  html += printLoadRow(
    typeof window.getHVACRowLabel === "function"
      ? window.getHVACRowLabel(37)
      : "Air Conditioning",
    positiveQuantity("q37"),
    readOutput("e37"),
    readOutput("f37")
  );

  html += printLoadRow(
    typeof window.getHVACRowLabel === "function"
      ? window.getHVACRowLabel(38)
      : "Heating",
    positiveQuantity("q38"),
    readOutput("e38"),
    readOutput("f38")
  );

  html += printLoadRow(
    typeof window.getHVACRowLabel === "function"
      ? window.getHVACRowLabel(39)
      : "Air Conditioning",
    positiveQuantity("q39"),
    readOutput("e39"),
    readOutput("f39")
  );

  html += printLoadRow(
    typeof window.getHVACRowLabel === "function"
      ? window.getHVACRowLabel(40)
      : "Heating",
    positiveQuantity("q40"),
    readOutput("e40"),
    readOutput("f40")
  );

  html += printLoadRow(
    "EV Charger",
    positiveQuantity("q43"),
    readOutput("e43"),
    readOutput("f43")
  );

  const continuous100Description =
    String(
      (
        document.getElementById(
          "d47"
        ) || {}
      ).value || ""
    ).trim() ||
    "Additional Continuous Load (100%)";

  html += printLoadRow(
    continuous100Description,
    positiveQuantity("q47"),
    readOutput("e47"),
    readOutput("f47")
  );

  const continuousDescription =
    String(
      (
        document.getElementById(
          "d42"
        ) || {}
      ).value || ""
    ).trim() ||
    "Additional Continuous Load (125%)";

  html += printLoadRow(
    continuousDescription,
    positiveQuantity("q42"),
    readOutput("e42"),
    readOutput("f42")
  );

  if(
    data.largestMotor &&
    data.largestMotor.additionalVA > 0
  ){
    html += printLoadRow(
      data.largestMotor.type +
      " — Additional 25%",
      "",
      data.largestMotor.additionalVA,
      data.largestMotor.additionalVA
    );
  }

  html += `
</tbody>

<tfoot>

<tr>
<td><strong>Demand Load</strong></td>
<td>${printNumber(data.demandLoads.service)}</td>
<td>${printNumber(data.demandLoads.generator)}</td>
</tr>

<tr>
<td><strong>HVAC + Continuous</strong></td>
<td>${printNumber(
  data.hvacLoads.service +
  data.continuousLoads.service +
  (
    data.largestMotor
      ? data.largestMotor.additionalVA
      : 0
  )
)}</td>

<td>${printNumber(
  data.hvacLoads.generator +
  data.continuousLoads.generator +
  (
    data.largestMotor
      ? data.largestMotor.additionalVA
      : 0
  )
)}</td>

</tr>

<tr>

<td>
<strong>Total VA</strong>
</td>

<td>
${printNumber(
  data.serviceTotalVA
)}
</td>

<td>
${printNumber(
  data.generatorTotalVA
)}
</td>

</tr>

<tr>

<td>
<strong>
Calculated Amps
</strong>
</td>

<td>
${Math.ceil(
  data.serviceCurrent
)} A
</td>

<td>
${Math.ceil(
  data.generatorCurrent
)} A
</td>

</tr>

</tfoot>

</table>

<div class="print-code-note">

Calculated using the NEC 2023 optional method
for one-family dwellings.

Final approval remains subject to the authority
having jurisdiction, actual equipment ratings,
and equipment control conditions.

</div>

</div>
`;

  report.innerHTML = html;
}
function organizeInlineLoadControls(){

  const rows =
    document.querySelectorAll(".load-row");

  for(const row of rows){

    const inputs =
      row.querySelector(".load-inputs");

    const managedRow =
      row.querySelector(".managed-row");

    const controls =
      managedRow
        ? managedRow.querySelector(".managed-controls")
        : null;

    if(
      !inputs ||
      !managedRow ||
      !controls
    ){
      continue;
    }

    inputs.classList.add(
      "inline-load-row"
    );

    controls.classList.add(
      "inline-managed-controls"
    );

    inputs.appendChild(controls);

    managedRow.remove();
  }
}

function initializeCalculator(){

  createApplianceRows();

  organizeInlineLoadControls();

  connectStaticManagedControls();

  connectCalculatorInputs();

  syncLargestMotorSection();

  for(const row of MANAGED_ROWS){
    updateManagedControl(row);
  }

  /* Check for saved data before the first calculation.
     Calling calculate() first would auto-save a blank state and overwrite
     the previous calculation before it could be restored. */

  initializeSavedCalculation();
}

document.addEventListener(
  "DOMContentLoaded",
  initializeCalculator
);

window.addEventListener(
  "beforeunload",
  function(){
    saveState(false);
  }
);

function printCalculation(){

  calculate();

  window.print();
}

function goHome(){

  window.location.href =
    "member-dashboard.html";
}

function connectToolbarButtons(){

  const homeButton =
    document.getElementById(
      "homeButton"
    );

  const printButton =
    document.getElementById(
      "printButton"
    );

  const newButton =
    document.getElementById(
      "newCalculationButton"
    );

  if(homeButton){
    homeButton.addEventListener(
      "click",
      goHome
    );
  }

  if(printButton){
    printButton.addEventListener(
      "click",
      function(){
        calculate();
        window.print();
      }
    );
  }

  if(newButton){
    newButton.addEventListener(
      "click",
      startNewCalculationFromButton
    );
  }
}

function connectRestoreButtons(){

  const continueButton =
    document.getElementById(
      "continuePreviousButton"
    );

  const startNewButton =
    document.getElementById(
      "startNewSavedButton"
    );

  if(continueButton){
    continueButton.addEventListener(
      "click",
      continuePreviousCalculation
    );
  }

  if(startNewButton){
    startNewButton.addEventListener(
      "click",
      startNewFromSavedPrompt
    );
  }
}

function preparePrintReport(){

  calculate();

  if(!validateRequiredGeneralLoads().valid){

    const report =
      document.getElementById(
        "printReport"
      );

    if(report){
      report.innerHTML =
        '<div class="print-page">' +
        '<h1>Calculation Incomplete</h1>' +
        '<p>Enter at least 2 small-appliance circuits and 1 laundry circuit before printing.</p>' +
        '</div>';
    }
  }
}

window.addEventListener(
  "beforeprint",
  preparePrintReport
);

document.addEventListener(
  "keydown",
  function(event){

    if(
      event.key === "Escape" &&
      restorePromptOpen
    ){
      closeRestorePrompt();
    }
  }
);

document.addEventListener(
  "DOMContentLoaded",
  function(){

    connectToolbarButtons();

    connectRestoreButtons();
  }
);
(function(){

function applyInlineInputPlaceholders(root){

  const scope =
    root && root.querySelectorAll
      ? root
      : document;

  scope
    .querySelectorAll('.input-block')
    .forEach(function(block){

      const label =
        block.querySelector('label');

      const input =
        block.querySelector(
          'input, select'
        );

      if(!label || !input){
        return;
      }

      const placeholderText =
        label.textContent
          .replace(/\s+/g, ' ')
          .trim();

      if(
        input.tagName === 'INPUT' &&
        placeholderText &&
        !input.getAttribute(
          'placeholder'
        )
      ){
        input.setAttribute(
          'placeholder',
          placeholderText
        );
      }
    });

  const projectPlaceholders = {
    projectName:'Project Name',
    projectNumber:'Project Number',
    projectAddress:'Address',
    projectCityState:'City / State'
  };

  Object
    .keys(projectPlaceholders)
    .forEach(function(id){

      const input =
        document.getElementById(id);

      if(
        input &&
        !input.getAttribute(
          'placeholder'
        )
      ){
        input.setAttribute(
          'placeholder',
          projectPlaceholders[id]
        );
      }
    });
}

function initializeInlinePlaceholders(){

  applyInlineInputPlaceholders(
    document
  );

  const observer =
    new MutationObserver(
      function(mutations){

        mutations.forEach(
          function(mutation){

            mutation.addedNodes.forEach(
              function(node){

                if(node.nodeType === 1){
                  applyInlineInputPlaceholders(
                    node
                  );
                }
              }
            );
          }
        );
      }
    );

  observer.observe(
    document.body,
    {
      childList:true,
      subtree:true
    }
  );
}

if(document.readyState === 'loading'){

  document.addEventListener(
    'DOMContentLoaded',
    initializeInlinePlaceholders
  );

}else{

  initializeInlinePlaceholders();
}

})();


(function(){

function finishLayout(){

  document
    .querySelectorAll('.load-row')
    .forEach(function(row){

      var inputs =
        row.querySelector(
          '.load-inputs'
        );

      var managed =
        row.querySelector(
          '.managed-controls'
        );

      if(
        inputs &&
        managed &&
        !inputs.contains(managed)
      ){
        managed.classList.add(
          'inline-managed-controls'
        );

        inputs.classList.add(
          'inline-load-row'
        );

        inputs.appendChild(
          managed
        );
      }
    });

  var voltage =
    Array.from(
      document.querySelectorAll(
        'main .card'
      )
    ).find(function(card){

      var h =
        card.querySelector(
          '.card-heading'
        );

      return (
        h &&
        h.textContent
          .replace(/\s+/g,' ')
          .trim() ===
          'Service Voltage'
      );
    });

  var general =
    Array.from(
      document.querySelectorAll(
        'main .card'
      )
    ).find(function(card){

      var h =
        card.querySelector(
          '.card-heading'
        );

      return (
        h &&
        h.textContent
          .replace(/\s+/g,' ')
          .trim() ===
          'General Loads'
      );
    });

  if(
    voltage &&
    general &&
    voltage.nextElementSibling !==
      general
  ){
    general.parentNode.insertBefore(
      voltage,
      general
    );
  }

  if(
    typeof window
      .syncFortyMethodEntryControls ===
      'function'
  ){
    window
      .syncFortyMethodEntryControls();
  }
}

if(document.readyState === 'loading'){

  document.addEventListener(
    'DOMContentLoaded',
    finishLayout
  );

}else{

  finishLayout();
}

new MutationObserver(
  finishLayout
).observe(
  document.documentElement,
  {
    childList:true,
    subtree:true
  }
);

})();


(function(){

'use strict';

const METHOD_KEY =
  'loadcalcpro_generator_mobile_heating_method_v3';

const HP_COMPRESSOR_KEY =
  'loadcalcpro_generator_mobile_hp_compressor_supplemental_v2';

const METHODS = {
  CENTRAL:'central65',
  FORTY:'separate40',
  HEATPUMP:'heatpump'
};

let selectedMethod = '';

let hpCompressorSupplemental = '';

let activeHVACManagedRows =
  new Set();

function value(id){

  const el =
    document.getElementById(id);

  const n =
    el ? Number(el.value) : 0;

  return (
    Number.isFinite(n) &&
    n > 0
  )
    ? n
    : 0;
}

function rowService(row){

  return (
    value('q' + row) *
    value('v' + row)
  );
}

function remainingQty(row){

  return Math.max(
    Math.floor(
      value('q' + row)
    ) -
    managedQuantity(row),
    0
  );
}

function remainingVA(row){

  return (
    remainingQty(row) *
    value('v' + row)
  );
}

function heatQty(){

  return (
    Math.floor(value('q38')) +
    Math.floor(value('q40'))
  );
}

function heatVA(){

  return (
    rowService(38) +
    rowService(40)
  );
}

function findHVACBody(){

  const card =
    Array.from(
      document.querySelectorAll(
        'main .card'
      )
    ).find(function(el){

      const heading =
        el.querySelector(
          '.card-heading'
        );

      return (
        heading &&
        heading.textContent
          .replace(/\s+/g,' ')
          .trim() ===
          'HVAC Loads'
      );
    });

  return card
    ? card.querySelector(
        '.card-body'
      )
    : null;
}

function ensureMethodPanel(){

  let panel =
    document.getElementById(
      'heatingMethodPanel'
    );

  if(panel){

    panel
      .querySelectorAll(
        '.heating-method-choice'
      )
      .forEach(function(button){

        if(
          button.dataset
            .primaryBound === '1'
        ){
          return;
        }

        button.dataset
          .primaryBound = '1';

        button.addEventListener(
          'click',
          function(){

            selectMethod(
              button.dataset.method
            );
          }
        );
      });

    return panel;
  }

  const body =
    findHVACBody();

  if(!body){
    return null;
  }

  const note =
    body.querySelector(
      '.section-note'
    );

  panel =
    document.createElement(
      'div'
    );

  panel.id =
    'heatingMethodPanel';

  panel.className =
    'heating-method-panel';

  panel.innerHTML = `
<div class="heating-method-title">
Select Heating Method
</div>

<button
type="button"
class="heating-method-choice"
data-method="${METHODS.CENTRAL}">
<span class="heating-method-check"></span>
<span class="heating-method-text">
Cooling at 100% / Central Electric Heat at 65%
</span>
</button>

<button
type="button"
class="heating-method-choice"
data-method="${METHODS.FORTY}">
<span class="heating-method-check"></span>
<span class="heating-method-text">
Separately Controlled Electric Heating Systems at 40% — Four or More Required
</span>
</button>

<button
type="button"
class="heating-method-choice"
data-method="${METHODS.HEATPUMP}">
<span class="heating-method-check"></span>
<span class="heating-method-text">
Heat Pump with Supplemental Electric Heat
</span>
</button>

<button
id="multipleHvacSystemsChoice"
type="button"
aria-pressed="false">
<span class="multiple-hvac-check"></span>
<span class="multiple-hvac-text">
Multiple Systems
</span>
</button>

<div
id="heatingMethodRequiredNote"
class="heating-method-required-note">
Select one HVAC method before the final calculation can be completed.
</div>

<div
id="fortyUnitWarning"
class="forty-unit-warning">
The 40% rows are shown for entry and testing, but four or more separately controlled heating units are required for the final calculation.
</div>
`;

  if(note){

    note.insertAdjacentElement(
      'afterend',
      panel
    );

  }else{

    body.insertBefore(
      panel,
      body.firstChild
    );
  }

  panel
    .querySelectorAll(
      '.heating-method-choice'
    )
    .forEach(function(button){

      button.addEventListener(
        'click',
        function(){

          selectMethod(
            button.dataset.method
          );
        }
      );
    });

  return panel;
}

function ensureHeatPumpQuestions(){

  let panel =
    document.getElementById(
      'heatPumpQuestions'
    );

  if(panel){
    return panel;
  }

  const methodPanel =
    ensureMethodPanel();

  if(
    !methodPanel ||
    !methodPanel.parentNode
  ){
    return null;
  }

  panel =
    document.createElement(
      'div'
    );

  panel.id =
    'heatPumpQuestions';

  panel.className =
    'heatpump-questions';

  panel.innerHTML = `
<div class="heatpump-question-title">
Can the heat-pump compressor and supplemental electric heat operate simultaneously?
</div>

<button
type="button"
class="heatpump-answer"
data-hp-value="yes">
<span class="heatpump-answer-check"></span>
<span class="heatpump-answer-text">
Yes — compressor at 100% plus supplemental heat at 65%
</span>
</button>

<button
type="button"
class="heatpump-answer"
data-hp-value="no">
<span class="heatpump-answer-check"></span>
<span class="heatpump-answer-text">
No — controls lock out the compressor during supplemental heat
</span>
</button>

<div
id="heatPumpRequiredNote"
class="heatpump-required-note">
Select one heat-pump operating condition.
</div>
`;

  methodPanel.insertAdjacentElement(
    'afterend',
    panel
  );

  panel
    .querySelectorAll(
      '.heatpump-answer'
    )
    .forEach(function(button){

      button.addEventListener(
        'click',
        function(){

          const value =
            button.dataset.hpValue;

          hpCompressorSupplemental =
            (
              hpCompressorSupplemental ===
              value
            )
              ? ''
              : value;

          saveHeatPumpAnswer();

          updateMethodUI();

          calculate();
        }
      );
    });

  return panel;
}

function create40PercentRow(
  sourceRow,
  index
){

  const id =
    'phoneHeat40Row' + index;

  let row =
    document.getElementById(id);

  if(row){
    return row;
  }

  const sourceInput =
    document.getElementById(
      'q' + sourceRow
    );

  const source =
    sourceInput
      ? sourceInput.closest(
          '.load-row'
        )
      : null;

  if(
    !source ||
    !source.parentNode
  ){
    return null;
  }

  row =
    document.createElement(
      'div'
    );

  row.id = id;

  row.className =
    'load-row';

  row.dataset.sourceHeatingRow =
    String(sourceRow);

  row.innerHTML = `
<div class="load-name">
Heat at 40%
</div>

<div class="load-inputs inline-load-row">

<div class="input-block">
<input
id="q41_${index}"
class="heat40-auto-field"
type="number"
readonly
placeholder="Qty">
</div>

<div class="input-block">
<input
id="v41_${index}"
class="heat40-auto-field"
type="text"
readonly
placeholder="40% VA">
</div>

<div class="inline-managed-controls">

<button
id="m41_${index}"
class="managed-check"
type="button"
aria-label="Manage heating row ${index} at 40 percent">
</button>

<button
id="mq41_${index}"
class="managed-qty"
type="button"
aria-label="Reduce managed heating quantity for row ${index}">
0
</button>

</div>
</div>
`;

  source.insertAdjacentElement(
    'afterend',
    row
  );

  row
    .querySelector(
      '#m41_' + index
    )
    .addEventListener(
      'click',
      function(){

        toggleManaged(
          sourceRow
        );

        sync40PercentManagedControls();
      }
    );

  row
    .querySelector(
      '#mq41_' + index
    )
    .addEventListener(
      'click',
      function(){

        reduceManagedQuantity(
          sourceRow
        );

        sync40PercentManagedControls();
      }
    );

  return row;
}

function ensure40Rows(){

  const row1 =
    create40PercentRow(
      38,
      1
    );

  const row2 =
    create40PercentRow(
      40,
      2
    );

  if(
    !document.getElementById(
      'e41'
    )
  ){

    const holder =
      document.createElement(
        'div'
      );

    holder.innerHTML =
      '<div id="e41" hidden></div>' +
      '<div id="f41" hidden></div>';

    const body =
      findHVACBody();

    if(body){
      body.appendChild(holder);
    }
  }

  return [
    row1,
    row2
  ];
}
function syncFortyMethodEntryControls(){

  const fortySelected =
    selectedMethod === METHODS.FORTY;

  const qualifies =
    heatQty() >= 4;

  [38,40].forEach(function(row){

    const container =
      rowFor(row);

    const inputs =
      container
        ? container.querySelector(
            '.load-inputs'
          )
        : null;

    const check =
      document.getElementById(
        'm' + row
      );

    const qty =
      document.getElementById(
        'mq' + row
      );

    const controls =
      check
        ? check.closest(
            '.inline-managed-controls'
          )
        : null;

    if(inputs){
      inputs.classList.toggle(
        'forty-method-entry-only',
        fortySelected
      );
    }

    if(controls){

      controls.hidden =
        fortySelected;

      controls.style.display =
        fortySelected
          ? 'none'
          : '';

      controls.setAttribute(
        'aria-hidden',
        fortySelected
          ? 'true'
          : 'false'
      );
    }

    if(check){

      check.tabIndex =
        fortySelected
          ? -1
          : 0;

      check.style.pointerEvents =
        fortySelected
          ? 'none'
          : '';
    }

    if(qty){

      qty.tabIndex =
        fortySelected
          ? -1
          : 0;

      qty.style.pointerEvents =
        fortySelected
          ? 'none'
          : '';
    }
  });

  const warning =
    document.getElementById(
      'fortyUnitWarning'
    );

  if(warning){
    warning.classList.toggle(
      'show',
      fortySelected &&
      !qualifies
    );
  }
}

function sync40PercentManagedControls(){

  [
    {source:38,index:1},
    {source:40,index:2}
  ].forEach(function(item){

    const selected =
      managedQuantity(
        item.source
      );

    const total =
      Math.floor(
        value(
          'q' + item.source
        )
      );

    const valid =
      total > 0 &&
      value(
        'v' + item.source
      ) > 0;

    const check =
      document.getElementById(
        'm41_' + item.index
      );

    const qty =
      document.getElementById(
        'mq41_' + item.index
      );

    if(check){

      check.classList.toggle(
        'checked',
        valid &&
        selected > 0
      );

      check.textContent =
        valid &&
        selected > 0
          ? '✓'
          : '';

      check.disabled =
        !valid ||
        selectedMethod !==
          METHODS.FORTY;
    }

    if(qty){

      qty.classList.toggle(
        'show',
        valid &&
        selected > 0
      );

      qty.textContent =
        String(
          valid
            ? selected
            : 0
        );

      qty.disabled =
        !valid ||
        selectedMethod !==
          METHODS.FORTY;
    }
  });
}

function rowFor(row){

  const input =
    document.getElementById(
      'q' + row
    );

  return input
    ? input.closest(
        '.load-row'
      )
    : null;
}

function setLabel(
  row,
  label
){

  const container =
    rowFor(row);

  const name =
    container &&
    container.querySelector(
      '.load-name'
    );

  if(name){
    name.textContent =
      label;
  }
}

function disableHeatingRows(
  disabled
){

  [38,40].forEach(
    function(row){

      const container =
        rowFor(row);

      if(container){
        container.classList.toggle(
          'heating-row-disabled',
          disabled
        );
      }

      [
        'q',
        'v',
        'm',
        'mq'
      ].forEach(
        function(prefix){

          const control =
            document.getElementById(
              prefix + row
            );

          if(control){
            control.disabled =
              disabled;
          }
        }
      );
    }
  );
}

function saveMethod(){

  try{

    localStorage.setItem(
      METHOD_KEY,
      selectedMethod
    );

  }catch(e){}
}

function readMethod(){

  try{

    const method =
      localStorage.getItem(
        METHOD_KEY
      ) || '';

    return Object
      .values(METHODS)
      .includes(method)
        ? method
        : '';

  }catch(e){
    return '';
  }
}

function saveHeatPumpAnswer(){

  try{

    if(
      hpCompressorSupplemental
    ){
      localStorage.setItem(
        HP_COMPRESSOR_KEY,
        hpCompressorSupplemental
      );

    }else{

      localStorage.removeItem(
        HP_COMPRESSOR_KEY
      );
    }

  }catch(e){}
}

function readHeatPumpAnswer(){

  try{

    const answer =
      localStorage.getItem(
        HP_COMPRESSOR_KEY
      ) || '';

    return (
      answer === 'yes' ||
      answer === 'no'
    )
      ? answer
      : '';

  }catch(e){
    return '';
  }
}

function setManagedRowsActive(
  rows
){

  activeHVACManagedRows =
    new Set(rows);

  [37,38,39,40]
    .forEach(function(row){

      const active =
        activeHVACManagedRows
          .has(row) &&
        rowService(row) > 0;

      const check =
        document.getElementById(
          'm' + row
        );

      const qty =
        document.getElementById(
          'mq' + row
        );

      const useFortyRowControl =
        selectedMethod ===
          METHODS.FORTY &&
        (
          row === 38 ||
          row === 40
        );

      if(check){

        check.classList.toggle(
          'managed-control-inactive',
          !active ||
          useFortyRowControl
        );

        check.disabled =
          !active ||
          useFortyRowControl;
      }

      if(qty){

        qty.classList.toggle(
          'managed-control-inactive',
          !active ||
          useFortyRowControl
        );

        qty.disabled =
          !active ||
          useFortyRowControl;
      }
    });

  sync40PercentManagedControls();
}

function updateMethodUI(){

  const panel =
    ensureMethodPanel();

  const rows40 =
    ensure40Rows();

  const hpPanel =
    ensureHeatPumpQuestions();

  if(panel){

    panel
      .querySelectorAll(
        '.heating-method-choice'
      )
      .forEach(function(button){

        const active =
          button.dataset.method ===
          selectedMethod;

        button.classList.toggle(
          'selected',
          active
        );

        button.setAttribute(
          'aria-pressed',
          active
            ? 'true'
            : 'false'
        );

        const check =
          button.querySelector(
            '.heating-method-check'
          );

        if(check){
          check.textContent =
            active
              ? '✓'
              : '';
        }
      });

    const requiredNote =
      document.getElementById(
        'heatingMethodRequiredNote'
      );

    panel.classList.toggle(
      'method-required',
      !selectedMethod
    );

    if(requiredNote){

      requiredNote.classList.toggle(
        'show',
        !selectedMethod
      );
    }
  }

  if(hpPanel){

    hpPanel.classList.toggle(
      'show',
      selectedMethod ===
        METHODS.HEATPUMP
    );

    hpPanel
      .querySelectorAll(
        '.heatpump-answer'
      )
      .forEach(function(button){

        const active =
          button.dataset.hpValue ===
          hpCompressorSupplemental;

        button.classList.toggle(
          'selected',
          active
        );

        button.setAttribute(
          'aria-pressed',
          active
            ? 'true'
            : 'false'
        );

        const check =
          button.querySelector(
            '.heatpump-answer-check'
          );

        if(check){
          check.textContent =
            active
              ? '✓'
              : '';
        }
      });

    const note =
      document.getElementById(
        'heatPumpRequiredNote'
      );

    if(note){

      note.style.display =
        (
          selectedMethod ===
            METHODS.HEATPUMP &&
          !hpCompressorSupplemental
        )
          ? 'block'
          : 'none';
    }
  }

  disableHeatingRows(
    !selectedMethod
  );

  rows40.forEach(
    function(row){

      if(!row){
        return;
      }

      const showFortyRow =
        selectedMethod ===
          METHODS.FORTY;

      row.classList.toggle(
        'show',
        showFortyRow
      );

      row.hidden =
        !showFortyRow;

      row.setAttribute(
        'aria-hidden',
        showFortyRow
          ? 'false'
          : 'true'
      );
    }
  );

  syncFortyMethodEntryControls();

  sync40PercentManagedControls();

  if(
    selectedMethod ===
    METHODS.HEATPUMP
  ){

    setLabel(
      37,
      'Heat Pump Compressor'
    );

    setLabel(
      38,
      'Supplemental Electric Heat'
    );

    setLabel(
      39,
      'Heat Pump Compressor'
    );

    setLabel(
      40,
      'Supplemental Electric Heat'
    );

  }else{

    setLabel(
      37,
      'Air Conditioning'
    );

    setLabel(
      38,
      'Heating'
    );

    setLabel(
      39,
      'Air Conditioning'
    );

    setLabel(
      40,
      'Heating'
    );
  }
}

function selectMethod(
  method
){

  if(
    !Object
      .values(METHODS)
      .includes(method)
  ){
    return;
  }

  selectedMethod =
    selectedMethod === method
      ? ''
      : method;

  /* A managed selection from a different
     HVAC method must not carry over. */

  [37,38,39,40,41]
    .forEach(function(row){

      managedQuantities[row] =
        0;
    });

  if(
    selectedMethod !==
    METHODS.HEATPUMP
  ){

    hpCompressorSupplemental =
      '';

    saveHeatPumpAnswer();
  }

  saveMethod();

  saveManagedQuantities();

  updateMethodUI();

  calculate();
}

window.validateHVACMethodSelection =
  function(){

    const methodSelected =
      Boolean(
        selectedMethod
      );

    const heatPumpReady =
      selectedMethod !==
        METHODS.HEATPUMP ||
      hpCompressorSupplemental ===
        'yes' ||
      hpCompressorSupplemental ===
        'no';

    const fortyPercentReady =
      selectedMethod !==
        METHODS.FORTY ||
      heatQty() >= 4;

    return {
      valid:
        methodSelected &&
        heatPumpReady &&
        fortyPercentReady,

      method:
        selectedMethod,

      methodSelected:
        methodSelected,

      heatPumpReady:
        heatPumpReady,

      fortyPercentReady:
        fortyPercentReady,

      heatingUnitCount:
        heatQty()
    };
  };

window.focusHVACMethodSelection =
  function(){

    if(
      selectedMethod ===
        METHODS.HEATPUMP &&
      !hpCompressorSupplemental
    ){

      const hpPanel =
        ensureHeatPumpQuestions();

      if(hpPanel){

        hpPanel.scrollIntoView({
          behavior:'smooth',
          block:'center'
        });

        const first =
          hpPanel.querySelector(
            '.heatpump-answer'
          );

        if(first){
          first.focus();
        }

        return;
      }
    }

    const panel =
      ensureMethodPanel();

    if(panel){

      panel.scrollIntoView({
        behavior:'smooth',
        block:'center'
      });

      const first =
        panel.querySelector(
          '.heating-method-choice'
        );

      if(first){
        first.focus();
      }
    }
  };

window.getHVACRowLabel =
  function(row){

    if(
      selectedMethod ===
      METHODS.HEATPUMP
    ){
      return (
        row === 37 ||
        row === 39
      )
        ? 'Heat Pump Compressor'
        : 'Supplemental Electric Heat';
    }

    return (
      row === 37 ||
      row === 39
    )
      ? 'Air Conditioning'
      : 'Heating';
  };

window.syncFortyMethodEntryControls =
  syncFortyMethodEntryControls;

window.getHVACMethodSummary =
  function(){

    if(
      selectedMethod ===
      METHODS.CENTRAL
    ){
      return (
        'Cooling Only / Central Electric Heat — ' +
        'larger of cooling at 100% or heat at 65%'
      );
    }

    if(
      selectedMethod ===
      METHODS.FORTY
    ){
      return (
        'Four or More Separately Controlled Electric Heating Systems — ' +
        'larger of cooling at 100% or qualifying heat at 40%'
      );
    }

    if(
      selectedMethod ===
      METHODS.HEATPUMP
    ){

      if(
        hpCompressorSupplemental ===
        'yes'
      ){
        return (
          'Heat Pump — compressor at 100% plus supplemental ' +
          'electric heat at 65%; compared with cooling'
        );
      }

      if(
        hpCompressorSupplemental ===
        'no'
      ){
        return (
          'Heat Pump — compressor locked out during supplemental heat; ' +
          'supplemental heat at 65% compared with cooling'
        );
      }

      return (
        'Heat Pump — operating condition not selected'
      );
    }

    return 'Not selected';
  };

window.isHVACManagedRowApplicable =
  function(row){

    return (
      activeHVACManagedRows.has(
        Number(row)
      ) &&
      rowService(
        Number(row)
      ) > 0
    );
  };

window.hvacLoadCalculation =
  function(){

    ensure40Rows();

    updateMethodUI();

    const ac1 =
      rowService(37);

    const ac2 =
      rowService(39);

    const heat1 =
      rowService(38);

    const heat2 =
      rowService(40);

    const serviceAC =
      ac1 + ac2;

    const serviceHeatTotal =
      heat1 + heat2;

    let service =
      serviceAC;

    let generator = 0;

    let generatorAC = 0;

    let generatorHeat = 0;

    if(!selectedMethod){

      setManagedRowsActive([]);

      setOutput('e37',serviceAC);
      setOutput('e38',0);
      setOutput('e39',0);
      setOutput('e40',0);
      setOutput('e41',0);

      setOutput('f37',0);
      setOutput('f38',0);
      setOutput('f39',0);
      setOutput('f40',0);
      setOutput('f41',0);

      return {
        service:service,
        generator:0,
        serviceAC:serviceAC,
        generatorAC:0,
        serviceHeating:0,
        generatorHeating:0,
        method:''
      };
    }

    if(
      selectedMethod ===
      METHODS.CENTRAL
    ){

      /* Central method always remains cooling at 100%
         versus electric heat at 65%. Entering four or
         more heating units does not switch methods. */

      const serviceHeating =
        serviceHeatTotal *
        0.65;

      const acControls =
        serviceAC >=
        serviceHeating;

      if(acControls){

        setManagedRowsActive(
          [37,39]
        );

        generatorAC =
          remainingVA(37) +
          remainingVA(39);

        generator =
          generatorAC;

      }else{

        setManagedRowsActive(
          [38,40]
        );

        generatorHeat =
          (
            remainingVA(38) +
            remainingVA(40)
          ) * 0.65;

        generator =
          generatorHeat;
      }

      service =
        Math.max(
          serviceAC,
          serviceHeating
        );

      setOutput(
        'e37',
        acControls
          ? ac1
          : 0
      );

      setOutput(
        'e39',
        acControls
          ? ac2
          : 0
      );

      setOutput(
        'e38',
        acControls
          ? 0
          : heat1 * 0.65
      );

      setOutput(
        'e40',
        acControls
          ? 0
          : heat2 * 0.65
      );

      setOutput(
        'e41',
        0
      );

      setOutput(
        'f37',
        acControls
          ? remainingVA(37)
          : 0
      );

      setOutput(
        'f39',
        acControls
          ? remainingVA(39)
          : 0
      );

      setOutput(
        'f38',
        acControls
          ? 0
          : remainingVA(38) *
            0.65
      );

      setOutput(
        'f40',
        acControls
          ? 0
          : remainingVA(40) *
            0.65
      );

      setOutput(
        'f41',
        0
      );

      return {
        service:service,
        generator:generator,
        serviceAC:serviceAC,
        generatorAC:generatorAC,
        serviceHeating:
          serviceHeating,
        generatorHeating:
          generatorHeat,
        method:selectedMethod
      };
    }

    if(
      selectedMethod ===
      METHODS.FORTY
    ){

      const totalQty =
        heatQty();

      const qualifies =
        totalQty >= 4;

      const serviceHeating =
        serviceHeatTotal *
        0.40;

      const acControls =
        serviceAC >=
        serviceHeating;

      const q41_1 =
        document.getElementById(
          'q41_1'
        );

      const v41_1 =
        document.getElementById(
          'v41_1'
        );

      const q41_2 =
        document.getElementById(
          'q41_2'
        );

      const v41_2 =
        document.getElementById(
          'v41_2'
        );

      if(q41_1){

        q41_1.value =
          value('q38') > 0
            ? String(
                Math.floor(
                  value('q38')
                )
              )
            : '';
      }

      if(v41_1){

        v41_1.value =
          heat1 > 0
            ? Math.round(
                heat1 * 0.40
              ).toLocaleString(
                'en-US'
              ) + ' VA'
            : '';
      }

      if(q41_2){

        q41_2.value =
          value('q40') > 0
            ? String(
                Math.floor(
                  value('q40')
                )
              )
            : '';
      }

      if(v41_2){

        v41_2.value =
          heat2 > 0
            ? Math.round(
                heat2 * 0.40
              ).toLocaleString(
                'en-US'
              ) + ' VA'
            : '';
      }

      service =
        Math.max(
          serviceAC,
          serviceHeating
        );

      /* In the 40% method, only the Heat at 40%
         controls may be used. */

      setManagedRowsActive(
        [38,40]
      );

      if(acControls){

        generatorAC =
          serviceAC;

        generator =
          generatorAC;

      }else{

        /* Each heating row is reduced independently
           before applying 40%. */

        generatorHeat =
          (
            remainingVA(38) +
            remainingVA(40)
          ) * 0.40;

        generator =
          generatorHeat;
      }

      setOutput(
        'e37',
        acControls
          ? ac1
          : 0
      );

      setOutput(
        'e39',
        acControls
          ? ac2
          : 0
      );

      setOutput('e38',0);
      setOutput('e40',0);

      setOutput(
        'e41',
        acControls
          ? 0
          : serviceHeating
      );

      setOutput(
        'f37',
        acControls
          ? remainingVA(37)
          : 0
      );

      setOutput(
        'f39',
        acControls
          ? remainingVA(39)
          : 0
      );

      setOutput('f38',0);
      setOutput('f40',0);

      setOutput(
        'f41',
        acControls
          ? 0
          : generatorHeat
      );

      syncFortyMethodEntryControls();

      sync40PercentManagedControls();

      return {
        service:service,
        generator:generator,
        serviceAC:serviceAC,
        generatorAC:generatorAC,
        serviceHeating:
          serviceHeating,
        generatorHeating:
          generatorHeat,
        method:selectedMethod,
        qualifies:qualifies
      };
    }

    if(
      !hpCompressorSupplemental
    ){

      setManagedRowsActive([]);

      setOutput('e37',0);
      setOutput('e38',0);
      setOutput('e39',0);
      setOutput('e40',0);
      setOutput('e41',0);

      setOutput('f37',0);
      setOutput('f38',0);
      setOutput('f39',0);
      setOutput('f40',0);
      setOutput('f41',0);

      return {
        service:0,
        generator:0,
        serviceAC:serviceAC,
        generatorAC:0,
        serviceHeating:0,
        generatorHeating:0,
        method:selectedMethod,
        heatPumpReady:false
      };
    }

    const compressorWithSupplemental =
      hpCompressorSupplemental ===
      'yes';

    const serviceCompressor =
      serviceAC;

    const serviceSupplemental =
      serviceHeatTotal *
      0.65;

    /* Standard heat-pump heating condition:
       YES = compressor once at 100%
       + supplemental heat at 65%.
       NO = compressor locked out;
       supplemental heat at 65% only.
       Compare with cooling and use larger. */

    const serviceHeating =
      (
        compressorWithSupplemental
          ? serviceCompressor
          : 0
      ) +
      serviceSupplemental;

    const coolingControls =
      serviceAC >=
      serviceHeating;

    service =
      Math.max(
        serviceAC,
        serviceHeating
      );

    if(coolingControls){

      setManagedRowsActive(
        [37,39]
      );

      generatorAC =
        remainingVA(37) +
        remainingVA(39);

      generator =
        generatorAC;

    }else{

      const activeRows =
        compressorWithSupplemental
          ? [37,38,39,40]
          : [38,40];

      setManagedRowsActive(
        activeRows
      );

      generatorAC =
        compressorWithSupplemental
          ? remainingVA(37) +
            remainingVA(39)
          : 0;

      generatorHeat =
        (
          remainingVA(38) +
          remainingVA(40)
        ) * 0.65;

      generator =
        generatorAC +
        generatorHeat;
    }

    setOutput(
      'e37',
      coolingControls
        ? ac1
        : (
            compressorWithSupplemental
              ? ac1
              : 0
          )
    );

    setOutput(
      'e39',
      coolingControls
        ? ac2
        : (
            compressorWithSupplemental
              ? ac2
              : 0
          )
    );

    setOutput(
      'e38',
      coolingControls
        ? 0
        : heat1 * 0.65
    );

    setOutput(
      'e40',
      coolingControls
        ? 0
        : heat2 * 0.65
    );

    setOutput(
      'e41',
      0
    );

    setOutput(
      'f37',
      coolingControls
        ? remainingVA(37)
        : (
            compressorWithSupplemental
              ? remainingVA(37)
              : 0
          )
    );

    setOutput(
      'f39',
      coolingControls
        ? remainingVA(39)
        : (
            compressorWithSupplemental
              ? remainingVA(39)
              : 0
          )
    );

    setOutput(
      'f38',
      coolingControls
        ? 0
        : remainingVA(38) *
          0.65
    );

    setOutput(
      'f40',
      coolingControls
        ? 0
        : remainingVA(40) *
          0.65
    );

    setOutput(
      'f41',
      0
    );

    return {
      service:service,
      generator:generator,
      serviceAC:serviceAC,
      generatorAC:generatorAC,
      serviceHeating:
        serviceHeating,
      generatorHeating:
        generatorHeat,
      method:selectedMethod,
      heatPumpReady:true,
      compressorSupplemental:
        hpCompressorSupplemental
    };
  };

window.resetHeatingMethodSelection =
  function(){

    selectedMethod = '';

    hpCompressorSupplemental = '';

    activeHVACManagedRows =
      new Set();

    managedQuantities[41] = 0;

    try{

      localStorage.removeItem(
        METHOD_KEY
      );

      localStorage.removeItem(
        HP_COMPRESSOR_KEY
      );

    }catch(e){}

    saveManagedQuantities();

    updateMethodUI();

    setManagedRowsActive([]);

    sync40PercentManagedControls();
  };

function initialize(){

  ensureMethodPanel();

  ensure40Rows();

  ensureHeatPumpQuestions();

  selectedMethod =
    readMethod();

  hpCompressorSupplemental =
    readHeatPumpAnswer();

  updateMethodUI();

  calculate();
}

if(
  document.readyState ===
  'loading'
){

  document.addEventListener(
    'DOMContentLoaded',
    initialize
  );

}else{

  initialize();
}

})();
(function(){

  function numberText(value){

    const n =
      Math.round(
        Number(value) || 0
      );

    return n > 0
      ? n.toLocaleString('en-US')
      : '';
  }

  function classifyCards(){

    document
      .querySelectorAll('main .card')
      .forEach(card=>{

        const h =
          card.querySelector(
            '.card-heading'
          );

        const title =
          (
            h
              ? h.textContent
              : ''
          )
          .trim()
          .toLowerCase();

        if(
          title.includes('project')
        ){
          card.classList.add(
            'project-card'
          );
        }

        if(
          title.includes('general')
        ){
          card.classList.add(
            'general-card'
          );
        }

        if(
          title.includes('appliance')
        ){
          card.classList.add(
            'appliance-card'
          );
        }

        if(
          title.includes('hvac')
        ){
          card.classList.add(
            'hvac-card'
          );
        }

        if(
          title.includes(
            'service voltage'
          )
        ){
          card.classList.add(
            'voltage-card'
          );
        }
      });
  }

  function addColumnHeader(
    card,
    includeInputLabels = true
  ){

    if(
      !card ||
      card.querySelector(
        '.v3-column-header'
      )
    ){
      return;
    }

    const body =
      card.querySelector(
        '.card-body'
      );

    if(!body){
      return;
    }

    const header =
      document.createElement(
        'div'
      );

    header.className =
      'v3-column-header';

    header.innerHTML =
      '<span>Description</span>' +
      '<span>Quantity</span>' +
      '<span>' +
      (
        includeInputLabels
          ? 'VA'
          : ''
      ) +
      '</span>' +
      '<span>' +
      (
        includeInputLabels
          ? 'Managed'
          : ''
      ) +
      '</span>' +
      '<span>Service Load</span>' +
      '<span>Generator Load</span>';

    const note =
      body.querySelector(
        '.section-note'
      );

    if(note){

      note.insertAdjacentElement(
        'afterend',
        header
      );

    }else{

      body.insertBefore(
        header,
        body.firstChild
      );
    }
  }

  function addDemandCard(){

    if(
      document.getElementById(
        'v3DemandCard'
      )
    ){
      return;
    }

    const appliance =
      document.querySelector(
        '.appliance-card'
      );

    if(!appliance){
      return;
    }

    const section =
      document.createElement(
        'section'
      );

    section.className =
      'card demand-card';

    section.id =
      'v3DemandCard';

    section.innerHTML = `
<h2 class="card-heading">
Demand Load
</h2>

<div class="card-body">

<div class="v3-column-header">
<span>Description</span>
<span></span>
<span></span>
<span></span>
<span>Service Load</span>
<span>Generator Load</span>
</div>

<div class="demand-row">
<span class="demand-description">
First 10,000 at 100%
</span>
<span
id="demandServiceFirst"
class="demand-service">
</span>
<span
id="demandGeneratorFirst"
class="demand-generator">
</span>
</div>

<div class="demand-row">
<span class="demand-description">
Remainder at 40%
</span>
<span
id="demandServiceRemainder"
class="demand-service">
</span>
<span
id="demandGeneratorRemainder"
class="demand-generator">
</span>
</div>

<div class="demand-row total">
<span class="demand-description">
Demand Total
</span>
<span
id="demandServiceTotal"
class="demand-service">
</span>
<span
id="demandGeneratorTotal"
class="demand-generator">
</span>
</div>

</div>`;

    appliance.insertAdjacentElement(
      'afterend',
      section
    );
  }

  function removeOutputVA(){

    document
      .querySelectorAll(
        '.output-label'
      )
      .forEach(el=>{

        el.textContent =
          el.textContent
            .replace(
              /\s+VA\s*$/i,
              ''
            )
            .trim();
      });
  }

  function updateDemandDisplay(
    serviceCombined,
    generatorCombined,
    serviceTotal,
    generatorTotal
  ){

    const sFirst =
      Math.min(
        Math.max(
          serviceCombined,
          0
        ),
        10000
      );

    const gFirst =
      Math.min(
        Math.max(
          generatorCombined,
          0
        ),
        10000
      );

    const sRem =
      Math.max(
        serviceCombined -
        10000,
        0
      ) * .40;

    const gRem =
      Math.max(
        generatorCombined -
        10000,
        0
      ) * .40;

    const values = {
      demandServiceFirst:
        sFirst,

      demandGeneratorFirst:
        gFirst,

      demandServiceRemainder:
        sRem,

      demandGeneratorRemainder:
        gRem,

      demandServiceTotal:
        serviceTotal,

      demandGeneratorTotal:
        generatorTotal
    };

    Object
      .entries(values)
      .forEach(
        ([id,val])=>{

          const el =
            document.getElementById(
              id
            );

          if(el){
            el.textContent =
              numberText(val);
          }
        }
      );
  }

  // Preserve the existing demand mathematics
  // while exposing its components.

  window.combinedDemandCalculation =
    function(
      generalLoad,
      applianceLoads
    ){

      const serviceCombined =
        generalLoad +
        applianceLoads.service;

      const generatorCombined =
        generalLoad +
        applianceLoads.generator;

      const serviceAfterDemand =
        optionalMethodDemand(
          serviceCombined
        );

      const generatorAfterDemand =
        optionalMethodDemand(
          generatorCombined
        );

      setOutput(
        'e35',
        serviceAfterDemand
      );

      setOutput(
        'f35',
        generatorAfterDemand
      );

      updateDemandDisplay(
        serviceCombined,
        generatorCombined,
        serviceAfterDemand,
        generatorAfterDemand
      );

      return {
        service:
          serviceAfterDemand,

        generator:
          generatorAfterDemand,

        serviceCombined:
          serviceCombined,

        generatorCombined:
          generatorCombined
      };
    };

  const originalUpdatePrintRows =
    window.updatePrintRows;

  window.updatePrintRows =
    function(data){

      originalUpdatePrintRows(
        data
      );

      const table =
        document.querySelector(
          '#printReport .print-table'
        );

      if(!table){
        return;
      }

      const tbody =
        table.querySelector(
          'tbody'
        );

      const tfoot =
        table.querySelector(
          'tfoot'
        );

      if(
        !tbody ||
        !tfoot
      ){
        return;
      }

      const serviceCombined =
        (
          data.demandLoads &&
          Number.isFinite(
            data.demandLoads
              .serviceCombined
          )
        )
          ? data.demandLoads
              .serviceCombined
          : (
              readOutput('e8') +
              readOutput('e31')
            );

      const generatorCombined =
        (
          data.demandLoads &&
          Number.isFinite(
            data.demandLoads
              .generatorCombined
          )
        )
          ? data.demandLoads
              .generatorCombined
          : (
              readOutput('f8') +
              readOutput('f31')
            );

      const sFirst =
        Math.min(
          Math.max(
            serviceCombined,
            0
          ),
          10000
        );

      const gFirst =
        Math.min(
          Math.max(
            generatorCombined,
            0
          ),
          10000
        );

      const sRem =
        Math.max(
          serviceCombined -
          10000,
          0
        ) * .40;

      const gRem =
        Math.max(
          generatorCombined -
          10000,
          0
        ) * .40;

      /* Move HVAC and continuous-load
         detail rows below the demand
         calculation, matching the order
         in which they are added to the
         final service load. */

      const hvacLabels =
        new Set();

      [37,38,39,40]
        .forEach(row=>{

          const label =
            (
              typeof window
                .getHVACRowLabel ===
                'function'
            )
              ? window
                  .getHVACRowLabel(
                    row
                  )
              : (
                  row === 37 ||
                  row === 39
                    ? 'Air Conditioning'
                    : 'Heating'
                );

          if(label){
            hvacLabels.add(
              String(label).trim()
            );
          }
        });

      const continuous100Description =
        String(
          (
            document.getElementById(
              'd47'
            ) || {}
          ).value || ''
        ).trim() ||
        'Additional Continuous Load (100%)';

      const continuousDescription =
        String(
          (
            document.getElementById(
              'd42'
            ) || {}
          ).value || ''
        ).trim() ||
        'Additional Continuous Load (125%)';

      const hvacRows = [];

      const continuousRows = [];

      Array.from(
        tbody.querySelectorAll(
          'tr'
        )
      ).forEach(row=>{

        const firstCell =
          row.querySelector(
            'td'
          );

        const label =
          firstCell
            ? firstCell.textContent
                .trim()
            : '';

        if(
          hvacLabels.has(label)
        ){

          hvacRows.push(
            row.outerHTML
          );

          row.remove();

        }else if(
          label === 'EV Charger' ||
          label ===
            continuous100Description ||
          label ===
            continuousDescription
        ){

          continuousRows.push(
            row.outerHTML
          );

          row.remove();
        }
      });

      let footerHTML =
        `<tr class="print-section-row">
<td colspan="4">Demand Load</td>
</tr>

<tr class="demand-breakdown-row">
<td>First 10,000 at 100%</td>
<td></td>
<td class="number">
${numberText(sFirst)}
</td>
<td class="number">
${numberText(gFirst)}
</td>
</tr>

<tr class="demand-breakdown-row">
<td>Remainder at 40%</td>
<td></td>
<td class="number">
${numberText(sRem)}
</td>
<td class="number">
${numberText(gRem)}
</td>
</tr>

<tr class="demand-total-row">
<td><strong>Demand Total</strong></td>
<td></td>
<td class="number">
<strong>
${numberText(
  data.demandLoads.service
)}
</strong>
</td>
<td class="number">
<strong>
${numberText(
  data.demandLoads.generator
)}
</strong>
</td>
</tr>`;

      if(hvacRows.length){

        footerHTML +=
          `<tr class="print-section-row">
<td colspan="4">HVAC Load</td>
</tr>` +
          hvacRows.join('');
      }

      if(
        continuousRows.length
      ){

        footerHTML +=
          `<tr class="print-section-row">
<td colspan="4">Continuous Loads</td>
</tr>` +
          continuousRows.join('');
      }

      footerHTML +=
        `<tr class="final-total-row">
<td><strong>Total VA</strong></td>
<td></td>
<td class="number">
<strong>
${numberText(
  data.serviceTotalVA
)}
</strong>
</td>
<td class="number">
<strong>
${numberText(
  data.generatorTotalVA
)}
</strong>
</td>
</tr>

<tr class="final-amps-row">
<td><strong>Calculated Amps</strong></td>
<td></td>
<td class="number">
<strong>
${Math.ceil(
  data.serviceCurrent
)} A
</strong>
</td>
<td class="number">
<strong>
${Math.ceil(
  data.generatorCurrent
)} A
</strong>
</td>
</tr>`;

      tfoot.innerHTML =
        footerHTML;

      table
        .querySelectorAll('th')
        .forEach(th=>{

          th.textContent =
            th.textContent
              .replace(
                'Service VA',
                'Service Load'
              )
              .replace(
                'Generator VA',
                'Generator Load'
              );
        });
    };

  document.addEventListener(
    'DOMContentLoaded',
    function(){

      classifyCards();

      addColumnHeader(
        document.querySelector(
          '.general-card'
        ),
        false
      );

      addColumnHeader(
        document.querySelector(
          '.appliance-card'
        ),
        true
      );

      addColumnHeader(
        document.querySelector(
          '.hvac-card'
        ),
        true
      );

      addDemandCard();

      removeOutputVA();

      setTimeout(
        function(){

          removeOutputVA();

          calculate();
        },
        0
      );
    }
  );

})();
(function(){

  function managedCount(){

    if(
      typeof window
        .getCompleteManagedLoadCount ===
      'function'
    ){
      return window
        .getCompleteManagedLoadCount();
    }

    if(
      typeof applicableManagedLoadCount ===
      'function'
    ){
      return applicableManagedLoadCount();
    }

    let total = 0;

    (
      window.MANAGED_ROWS || []
    ).forEach(function(row){

      if(
        typeof managedQuantity ===
        'function'
      ){
        total += managedQuantity(row);
      }
    });

    return total;
  }

  function addManagedCountToCalculator(){

    const card =
      document.querySelector(
        '.result-card.generator'
      );

    if(!card){
      return;
    }

    let line =
      card.querySelector(
        '.managed-loads-count'
      );

    if(!line){

      line =
        document.createElement(
          'div'
        );

      line.className =
        'managed-loads-count';

      card.appendChild(line);
    }

    line.textContent =
      'Managed Loads: ' +
      managedCount();
  }

  function numText(value){

    const n =
      Math.round(
        Number(value) || 0
      );

    return n > 0
      ? n.toLocaleString(
          'en-US'
        )
      : '';
  }

  function qty(row){

    return (
      typeof positiveQuantity ===
      'function'
    )
      ? positiveQuantity(
          'q' + row
        )
      : 0;
  }

  function output(id){

    return (
      typeof readOutput ===
      'function'
    )
      ? readOutput(id)
      : 0;
  }

  function rowHTML(
    label,
    quantity,
    service,
    generator
  ){

    if(
      Number(service) <= 0 &&
      Number(generator) <= 0
    ){
      return '';
    }

    return (
      '<tr>' +
      '<td>' +
      escapeHTML(label) +
      '</td>' +
      '<td class="quantity">' +
      (quantity || '') +
      '</td>' +
      '<td class="number">' +
      numText(service) +
      '</td>' +
      '<td class="number">' +
      numText(generator) +
      '</td>' +
      '</tr>'
    );
  }

  function buildHVACRows(data){

    /*
      V5.14 separate HVAC sections store
      their values independently from the
      hidden legacy q37-q40 inputs.

      Build print rows from the active
      V5.7 data.
    */

    let selected = [];

    let sectionData = {};

    let sectionManaged = {};

    try{

      selected =
        JSON.parse(
          localStorage.getItem(
            'loadcalcpro_hvac_selected_methods_v1'
          ) || '[]'
        );

      sectionData =
        JSON.parse(
          localStorage.getItem(
            'loadcalcpro_hvac_method_sections_v57'
          ) || '{}'
        );

      sectionManaged =
        JSON.parse(
          localStorage.getItem(
            'loadcalcpro_hvac_method_managed_v57'
          ) || '{}'
        );

    }catch(e){

      selected = [];

      sectionData = {};

      sectionManaged = {};
    }

    if(
      !Array.isArray(selected)
    ){
      selected = [];
    }

    const hp =
      localStorage.getItem(
        'loadcalcpro_hvac_multi_hp_answer_v1'
      ) || '';

    function sectionValue(
      method,
      type
    ){

      const d =
        sectionData[
          method + '_' + type
        ] || {};

      const q =
        Math.max(
          0,
          Math.floor(
            Number(d.qty) || 0
          )
        );

      const va =
        Math.max(
          0,
          Number(d.va) || 0
        );

      const service =
        q * va;

      const generator =
        sectionManaged[
          method + '_' + type
        ]
          ? 0
          : service;

      return {
        q:q,
        service:service,
        generator:generator
      };
    }

    const rows = [];

    selected.forEach(
      function(method){

        const ac =
          sectionValue(
            method,
            'ac'
          );

        const heat =
          sectionValue(
            method,
            'heat'
          );

        if(
          method ===
          'central65'
        ){

          const heatS =
            heat.service * .65;

          const heatG =
            heat.generator * .65;

          if(
            ac.service >= heatS
          ){

            rows.push(
              rowHTML(
                'Air Conditioning 100%',
                ac.q,
                ac.service,
                ac.generator
              )
            );

          }else{

            rows.push(
              rowHTML(
                'Central Electric Heat 65%',
                heat.q,
                heatS,
                heatG
              )
            );
          }

        }else if(
          method ===
          'separate40'
        ){

          const heatTypes = [
            'heat',
            'heat2',
            'heat3',
            'heat4'
          ];

          const heatRows =
            heatTypes.map(
              function(t){

                return sectionValue(
                  method,
                  t
                );
              }
            );

          const heatService =
            heatRows.reduce(
              function(sum,r){

                return (
                  sum +
                  r.service
                );
              },
              0
            );

          const heatGenerator =
            heatRows.reduce(
              function(sum,r){

                return (
                  sum +
                  r.generator
                );
              },
              0
            );

          const heat40Service =
            heatService * .40;

          const heat40Generator =
            heatGenerator * .40;

          if(
            ac.service >=
            heat40Service
          ){

            rows.push(
              rowHTML(
                'Air Conditioning 100%',
                ac.q,
                ac.service,
                ac.generator
              )
            );

          }else{

            heatRows.forEach(
              function(r,i){

                rows.push(
                  rowHTML(
                    'Separately Controlled Electric Heat Unit ' +
                    (i + 1) +
                    ' at 40%',
                    r.q,
                    r.service * .40,
                    r.generator * .40
                  )
                );
              }
            );
          }

        }else if(
          method ===
          'heatpump'
        ){

          if(hp === 'yes'){

            rows.push(
              rowHTML(
                'Heat Pump Compressor 100%',
                ac.q,
                ac.service,
                ac.generator
              )
            );

            rows.push(
              rowHTML(
                'Supplemental Electric Heat 65%',
                heat.q,
                heat.service * .65,
                heat.generator * .65
              )
            );

          }else if(
            hp === 'no'
          ){

            rows.push(
              rowHTML(
                'Supplemental Electric Heat 65%',
                heat.q,
                heat.service * .65,
                heat.generator * .65
              )
            );
          }
        }
      }
    );

    if(rows.length){
      return rows.join('');
    }

    /*
      Legacy fallback for calculations
      saved before the separate sections.
    */

    const method =
      data.hvacLoads &&
      data.hvacLoads.method
        ? data.hvacLoads.method
        : '';

    if(
      method === 'forty'
    ){

      const s =
        output('e41');

      const g =
        output('f41');

      if(
        s > 0 ||
        g > 0
      ){

        rows.push(
          rowHTML(
            'Heating 40%',
            qty(38) + qty(40),
            s,
            g
          )
        );
      }

      [37,39].forEach(
        function(r){

          const s =
            output(
              'e' + r
            );

          const g =
            output(
              'f' + r
            );

          if(
            s > 0 ||
            g > 0
          ){

            rows.push(
              rowHTML(
                'Air Conditioning 100%',
                qty(r),
                s,
                g
              )
            );
          }
        }
      );

      return rows.join('');
    }

    if(
      method ===
      'heatpump'
    ){

      [37,39].forEach(
        function(r){

          const s =
            output(
              'e' + r
            );

          const g =
            output(
              'f' + r
            );

          if(
            s > 0 ||
            g > 0
          ){

            rows.push(
              rowHTML(
                'Heat Pump Compressor 100%',
                qty(r),
                s,
                g
              )
            );
          }
        }
      );

      [38,40].forEach(
        function(r){

          const s =
            output(
              'e' + r
            );

          const g =
            output(
              'f' + r
            );

          if(
            s > 0 ||
            g > 0
          ){

            rows.push(
              rowHTML(
                'Supplemental Electric Heat 65%',
                qty(r),
                s,
                g
              )
            );
          }
        }
      );

      return rows.join('');
    }

    [37,39].forEach(
      function(r){

        const s =
          output(
            'e' + r
          );

        const g =
          output(
            'f' + r
          );

        if(
          s > 0 ||
          g > 0
        ){

          rows.push(
            rowHTML(
              'Air Conditioning 100%',
              qty(r),
              s,
              g
            )
          );
        }
      }
    );

    [38,40].forEach(
      function(r){

        const s =
          output(
            'e' + r
          );

        const g =
          output(
            'f' + r
          );

        if(
          s > 0 ||
          g > 0
        ){

          rows.push(
            rowHTML(
              'Heating 65%',
              qty(r),
              s,
              g
            )
          );
        }
      }
    );

    return rows.join('');
  }

  const priorUpdatePrintRows =
    window.updatePrintRows;

  window.updatePrintRows =
    function(data){

      priorUpdatePrintRows(
        data
      );

      addManagedCountToCalculator();

      const report =
        document.getElementById(
          'printReport'
        );

      if(!report){
        return;
      }

      const summary =
        report.querySelector(
          '.print-method-details'
        );

      if(summary){

        summary.innerHTML =
          '<div class="summary-item">' +
          '<strong>Service Voltage</strong>' +
          '<span>' +
          numText(data.voltage) +
          ' V</span>' +
          '</div>' +

          '<div class="summary-item">' +
          '<strong>Managed Loads</strong>' +
          '<span>' +
          managedCount() +
          '</span>' +
          '</div>' +

          '<div class="summary-item">' +
          '<strong>Service Total</strong>' +
          '<span>' +
          numText(
            data.serviceTotalVA
          ) +
          ' VA / ' +
          Math.ceil(
            data.serviceCurrent
          ) +
          ' A</span>' +
          '</div>' +

          '<div class="summary-item">' +
          '<strong>Generator Total</strong>' +
          '<span>' +
          numText(
            data.generatorTotalVA
          ) +
          ' VA / ' +
          Math.ceil(
            data.generatorCurrent
          ) +
          ' A</span>' +
          '</div>';
      }

      const table =
        report.querySelector(
          '.print-table'
        );

      if(!table){
        return;
      }

      const tfoot =
        table.querySelector(
          'tfoot'
        );

      if(!tfoot){
        return;
      }

      const serviceCombined =
        (
          data.demandLoads &&
          Number.isFinite(
            data.demandLoads
              .serviceCombined
          )
        )
          ? data.demandLoads
              .serviceCombined
          : (
              output('e8') +
              output('e31')
            );

      const generatorCombined =
        (
          data.demandLoads &&
          Number.isFinite(
            data.demandLoads
              .generatorCombined
          )
        )
          ? data.demandLoads
              .generatorCombined
          : (
              output('f8') +
              output('f31')
            );

      const sFirst =
        Math.min(
          Math.max(
            serviceCombined,
            0
          ),
          10000
        );

      const gFirst =
        Math.min(
          Math.max(
            generatorCombined,
            0
          ),
          10000
        );

      const sRem =
        Math.max(
          serviceCombined -
          10000,
          0
        ) * .40;

      const gRem =
        Math.max(
          generatorCombined -
          10000,
          0
        ) * .40;

      let html =
        '<tr class="print-section-row">' +
        '<td colspan="4">Demand Load</td>' +
        '</tr>' +

        '<tr>' +
        '<td>First 10,000 at 100%</td>' +
        '<td></td>' +
        '<td class="number">' +
        numText(sFirst) +
        '</td>' +
        '<td class="number">' +
        numText(gFirst) +
        '</td>' +
        '</tr>' +

        '<tr>' +
        '<td>Remainder at 40%</td>' +
        '<td></td>' +
        '<td class="number">' +
        numText(sRem) +
        '</td>' +
        '<td class="number">' +
        numText(gRem) +
        '</td>' +
        '</tr>' +

        '<tr>' +
        '<td><strong>Demand Total</strong></td>' +
        '<td></td>' +
        '<td class="number"><strong>' +
        numText(
          data.demandLoads.service
        ) +
        '</strong></td>' +
        '<td class="number"><strong>' +
        numText(
          data.demandLoads.generator
        ) +
        '</strong></td>' +
        '</tr>';

      const hvac =
        buildHVACRows(data);

      if(hvac){

        html +=
          '<tr class="print-section-row">' +
          '<td colspan="4">HVAC Load</td>' +
          '</tr>' +
          hvac;
      }

      let continuous = '';

      continuous +=
        rowHTML(
          'EV Charger',
          qty(43),
          output('e43'),
          output('f43')
        );

      const desc100 =
        String(
          (
            document.getElementById(
              'd47'
            ) || {}
          ).value || ''
        ).trim() ||
        'Additional Continuous Load (100%)';

      continuous +=
        rowHTML(
          desc100,
          qty(47),
          output('e47'),
          output('f47')
        );

      const desc =
        String(
          (
            document.getElementById(
              'd42'
            ) || {}
          ).value || ''
        ).trim() ||
        'Additional Continuous Load (125%)';

      continuous +=
        rowHTML(
          desc,
          qty(42),
          output('e42'),
          output('f42')
        );

      if(
        data.largestMotor &&
        data.largestMotor
          .additionalVA > 0
      ){

        continuous +=
          rowHTML(
            data.largestMotor.type +
            ' — Additional 25%',
            '',
            data.largestMotor
              .additionalVA,
            data.largestMotor
              .additionalVA
          );
      }

      if(continuous){

        html +=
          '<tr class="print-section-row">' +
          '<td colspan="4">Continuous Loads</td>' +
          '</tr>' +
          continuous;
      }

      html +=
        '<tr class="final-total-row">' +
        '<td><strong>Total VA</strong></td>' +
        '<td></td>' +
        '<td class="number"><strong>' +
        numText(
          data.serviceTotalVA
        ) +
        '</strong></td>' +
        '<td class="number"><strong>' +
        numText(
          data.generatorTotalVA
        ) +
        '</strong></td>' +
        '</tr>' +

        '<tr class="final-amps-row">' +
        '<td><strong>Calculated Amps</strong></td>' +
        '<td></td>' +
        '<td class="number"><strong>' +
        Math.ceil(
          data.serviceCurrent
        ) +
        ' A</strong></td>' +
        '<td class="number"><strong>' +
        Math.ceil(
          data.generatorCurrent
        ) +
        ' A</strong></td>' +
        '</tr>';

      tfoot.innerHTML =
        html;

      if(
        summary &&
        table
      ){
        table.insertAdjacentElement(
          'afterend',
          summary
        );
      }
    };

  function initialize(){

    addManagedCountToCalculator();

    const target =
      document.getElementById(
        'generatorAmps'
      );

    if(
      target &&
      window.MutationObserver
    ){

      new MutationObserver(
        addManagedCountToCalculator
      ).observe(
        target,
        {
          childList:true,
          characterData:true,
          subtree:true
        }
      );
    }

    document.addEventListener(
      'click',
      function(){

        setTimeout(
          addManagedCountToCalculator,
          0
        );
      }
    );

    document.addEventListener(
      'input',
      function(){

        setTimeout(
          addManagedCountToCalculator,
          0
        );
      }
    );
  }

  if(
    document.readyState ===
    'loading'
  ){

    document.addEventListener(
      'DOMContentLoaded',
      initialize
    );

  }else{

    initialize();
  }

})();
(function(){

  function valueFrom(id){

    const el =
      document.getElementById(id);

    const n =
      Number(
        String(
          el &&
          el.textContent ||
          ''
        ).replace(
          /[^0-9.-]/g,
          ''
        )
      );

    return Number.isFinite(n)
      ? n
      : 0;
  }

  function fmt(n){

    return Math.round(
      n
    ).toLocaleString(
      'en-US'
    );
  }

  function managedCount(){

    if(
      typeof window
        .applicableManagedLoadCount ===
      'function'
    ){
      return window
        .applicableManagedLoadCount();
    }

    let total = 0;

    if(
      Array.isArray(
        window.MANAGED_ROWS
      )
    ){

      window.MANAGED_ROWS
        .forEach(function(r){

          if(
            typeof window
              .managedQuantity ===
            'function'
          ){
            total +=
              window.managedQuantity(
                r
              );
          }
        });
    }

    return total;
  }

  function sync(){

    /*
      e35/f35 already include EVSE demand.

      Add HVAC and only the non-EV
      portion of continuous loads to
      avoid omitting or double-counting.
    */

    const service =
      valueFrom('e35') +
      valueFrom('e44') +
      Math.max(
        valueFrom('e45') -
        valueFrom('e43'),
        0
      );

    const generator =
      valueFrom('f35') +
      valueFrom('f44') +
      Math.max(
        valueFrom('f45') -
        valueFrom('f43'),
        0
      );

    const s =
      document.getElementById(
        'serviceTotalVAView'
      );

    const g =
      document.getElementById(
        'generatorTotalVAView'
      );

    const m =
      document.getElementById(
        'bottomManagedLoadCount'
      );

    if(s){
      s.textContent =
        fmt(service);
    }

    if(g){
      g.textContent =
        fmt(generator);
    }

    if(m){
      m.textContent =
        String(
          managedCount()
        );
    }
  }

  function start(){

    sync();

    [
      'serviceAmps',
      'generatorAmps',
      'e35',
      'f35',
      'e44',
      'f44'
    ].forEach(function(id){

      const el =
        document.getElementById(
          id
        );

      if(
        el &&
        window.MutationObserver
      ){

        new MutationObserver(
          sync
        ).observe(
          el,
          {
            childList:true,
            characterData:true,
            subtree:true
          }
        );
      }
    });

    document.addEventListener(
      'input',
      function(){

        setTimeout(
          sync,
          0
        );
      }
    );

    document.addEventListener(
      'click',
      function(){

        setTimeout(
          sync,
          0
        );
      }
    );
  }

  if(
    document.readyState ===
    'loading'
  ){

    document.addEventListener(
      'DOMContentLoaded',
      start
    );

  }else{

    start();
  }

})();
(function(){

  function restore(){

    const version =
      document.querySelector(
        '.app-version'
      );

    if(version){
      version.textContent =
        'NEC 2023 | Version 2.0 — V5.41 Auto Save Restore Fixed';
    }

    const buttons =
      document.querySelectorAll(
        '.header-actions button'
      );

    if(buttons[0]){
      buttons[0].textContent =
        'Calculators';
    }

    if(buttons[1]){
      buttons[1].textContent =
        'Print / PDF';
    }

    if(buttons[2]){
      buttons[2].textContent =
        'New Calculation';
    }
  }

  if(
    document.readyState ===
    'loading'
  ){

    document.addEventListener(
      'DOMContentLoaded',
      restore
    );

  }else{

    restore();
  }

})();


(function(){

'use strict';

const MULTI_KEY =
  'loadcalcpro_hvac_multiple_selector_v1';

const METHODS_KEY =
  'loadcalcpro_hvac_selected_methods_v1';

const HP_KEY =
  'loadcalcpro_hvac_multi_hp_answer_v1';

const VALID = [
  'central65',
  'separate40',
  'heatpump'
];

let multiple = false;

let selected =
  new Set();

let hpAnswer = '';

let activeRows =
  new Set();

function num(id){

  const e =
    document.getElementById(id);

  const n =
    Number(
      e ? e.value : 0
    );

  return (
    Number.isFinite(n) &&
    n > 0
  )
    ? n
    : 0;
}

function rowVA(r){

  return (
    num('q' + r) *
    num('v' + r)
  );
}

function remain(r){

  const total =
    Math.floor(
      num('q' + r)
    );

  const managed =
    typeof managedQuantity ===
    'function'
      ? managedQuantity(r)
      : 0;

  return Math.max(
    total - managed,
    0
  ) * num('v' + r);
}

function load(){

  try{

    multiple =
      localStorage.getItem(
        MULTI_KEY
      ) === '1';

    const a =
      JSON.parse(
        localStorage.getItem(
          METHODS_KEY
        ) || '[]'
      );

    selected =
      new Set(
        Array.isArray(a)
          ? a.filter(
              x =>
                VALID.includes(x)
            )
          : []
      );

    hpAnswer =
      localStorage.getItem(
        HP_KEY
      ) || '';

  }catch(e){

    multiple = false;

    selected =
      new Set();

    hpAnswer = '';
  }

  if(
    !multiple &&
    selected.size > 1
  ){

    selected =
      new Set([
        Array.from(
          selected
        )[0]
      ]);
  }
}

function save(){

  try{

    localStorage.setItem(
      MULTI_KEY,
      multiple
        ? '1'
        : '0'
    );

    localStorage.setItem(
      METHODS_KEY,
      JSON.stringify(
        Array.from(
          selected
        )
      )
    );

    if(hpAnswer){

      localStorage.setItem(
        HP_KEY,
        hpAnswer
      );

    }else{

      localStorage.removeItem(
        HP_KEY
      );
    }

  }catch(e){}
}

function cloneWithoutListeners(
  el
){

  if(!el){
    return null;
  }

  const c =
    el.cloneNode(true);

  el.replaceWith(c);

  return c;
}

function ensureUI(){

  const panel =
    document.getElementById(
      'heatingMethodPanel'
    );

  if(!panel){
    return false;
  }

  panel
    .querySelectorAll(
      '.heating-method-choice'
    )
    .forEach(btn=>{

      const fresh =
        cloneWithoutListeners(
          btn
        );

      fresh.addEventListener(
        'click',
        () =>
          toggleMethod(
            fresh.dataset.method
          )
      );
    });

  let multi =
    document.getElementById(
      'multipleHvacSystemsChoice'
    );

  if(!multi){

    multi =
      document.createElement(
        'button'
      );

    multi.id =
      'multipleHvacSystemsChoice';

    multi.type =
      'button';

    multi.innerHTML =
      '<span class="multiple-hvac-check"></span>' +
      '<span class="multiple-hvac-text">Multiple Systems</span>';

    panel.appendChild(
      multi
    );

  }else{

    multi =
      cloneWithoutListeners(
        multi
      );

    multi
      .querySelector(
        '.multiple-hvac-text'
      )
      .textContent =
        'Multiple Systems';
  }

  multi.removeAttribute(
    'aria-controls'
  );

  multi.addEventListener(
    'click',
    toggleMultiple
  );

  const hp =
    document.getElementById(
      'heatPumpQuestions'
    );

  if(hp){

    hp
      .querySelectorAll(
        '.heatpump-answer'
      )
      .forEach(btn=>{

        const fresh =
          cloneWithoutListeners(
            btn
          );

        fresh.addEventListener(
          'click',
          ()=>{

            const v =
              fresh.dataset.hpValue;

            hpAnswer =
              hpAnswer === v
                ? ''
                : v;

            save();

            syncUI();

            calculate();
          }
        );
      });
  }

  return true;
}

function toggleMultiple(){

  multiple =
    !multiple;

  if(
    !multiple &&
    selected.size > 1
  ){

    selected =
      new Set([
        Array.from(
          selected
        )[0]
      ]);
  }

  save();

  syncUI();

  calculate();
}

function toggleMethod(method){

  if(
    !VALID.includes(method)
  ){
    return;
  }

  if(
    selected.has(method)
  ){

    selected.delete(
      method
    );

  }else{

    if(!multiple){
      selected.clear();
    }

    selected.add(
      method
    );
  }

  if(
    !selected.has(
      'heatpump'
    )
  ){
    hpAnswer = '';
  }

  save();

  syncUI();

  calculate();
}

function syncUI(){

  const panel =
    document.getElementById(
      'heatingMethodPanel'
    );

  if(!panel){
    return;
  }

  panel
    .querySelectorAll(
      '.heating-method-choice'
    )
    .forEach(btn=>{

      const on =
        selected.has(
          btn.dataset.method
        );

      btn.classList.toggle(
        'selected',
        on
      );

      btn.setAttribute(
        'aria-pressed',
        on
          ? 'true'
          : 'false'
      );

      const c =
        btn.querySelector(
          '.heating-method-check'
        );

      if(c){
        c.textContent =
          on
            ? '✓'
            : '';
      }
    });

  const multi =
    document.getElementById(
      'multipleHvacSystemsChoice'
    );

  if(multi){

    multi.classList.toggle(
      'selected',
      multiple
    );

    multi.setAttribute(
      'aria-pressed',
      multiple
        ? 'true'
        : 'false'
    );

    const c =
      multi.querySelector(
        '.multiple-hvac-check'
      );

    if(c){
      c.textContent =
        multiple
          ? '✓'
          : '';
    }
  }

  const hp =
    document.getElementById(
      'heatPumpQuestions'
    );

  if(hp){

    const show =
      selected.has(
        'heatpump'
      );

    hp.classList.toggle(
      'show',
      show
    );

    hp
      .querySelectorAll(
        '.heatpump-answer'
      )
      .forEach(btn=>{

        const on =
          btn.dataset.hpValue ===
          hpAnswer;

        btn.classList.toggle(
          'selected',
          on
        );

        btn.setAttribute(
          'aria-pressed',
          on
            ? 'true'
            : 'false'
        );

        const c =
          btn.querySelector(
            '.heatpump-answer-check'
          );

        if(c){
          c.textContent =
            on
              ? '✓'
              : '';
        }
      });

    const note =
      document.getElementById(
        'heatPumpRequiredNote'
      );

    if(note){

      note.style.display =
        show &&
        !hpAnswer
          ? 'block'
          : 'none';
    }
  }

  const hasAny =
    selected.size > 0;

  [38].forEach(r=>{

    const row =
      document
        .getElementById(
          'q' + r
        )
        ?.closest(
          '.load-row'
        );

    if(row){

      row.classList.toggle(
        'heating-row-disabled',
        !hasAny
      );
    }

    [
      'q',
      'v',
      'm',
      'mq'
    ].forEach(p=>{

      const e =
        document.getElementById(
          p + r
        );

      if(e){
        e.disabled =
          !hasAny;
      }
    });
  });

  [
    'q39',
    'v39',
    'q40',
    'v40'
  ].forEach(id=>{

    const e =
      document.getElementById(id);

    if(e){
      e.value = '';
    }
  });

  const r39 =
    document
      .getElementById(
        'q39'
      )
      ?.closest(
        '.load-row'
      );

  const r40 =
    document
      .getElementById(
        'q40'
      )
      ?.closest(
        '.load-row'
      );

  if(r39){
    r39.style.display =
      'none';
  }

  if(r40){
    r40.style.display =
      'none';
  }

  const label37 =
    document
      .getElementById(
        'q37'
      )
      ?.closest(
        '.load-row'
      )
      ?.querySelector(
        '.load-name'
      );

  const label38 =
    document
      .getElementById(
        'q38'
      )
      ?.closest(
        '.load-row'
      )
      ?.querySelector(
        '.load-name'
      );

  if(label37){

    label37.textContent =
      selected.size === 1 &&
      selected.has(
        'heatpump'
      )
        ? 'Heat Pump Compressor'
        : 'Air Conditioning';
  }

  if(label38){

    label38.textContent =
      selected.size === 1 &&
      selected.has(
        'heatpump'
      )
        ? 'Supplemental Electric Heat'
        : 'Heating';
  }
}

function setActive(rows){

  activeRows =
    new Set(rows);

  [37,38,39,40]
    .forEach(r=>{

      const active =
        activeRows.has(r) &&
        rowVA(r) > 0;

      const c =
        document.getElementById(
          'm' + r
        );

      const q =
        document.getElementById(
          'mq' + r
        );

      if(c){

        c.disabled =
          !active;

        c.classList.toggle(
          'managed-control-inactive',
          !active
        );
      }

      if(q){

        q.disabled =
          !active;

        q.classList.toggle(
          'managed-control-inactive',
          !active
        );
      }
    });
}

function heatContribution(
  method,
  ac,
  heat
){

  if(
    method ===
    'central65'
  ){
    return heat * .65;
  }

  if(
    method ===
    'separate40'
  ){
    return heat * .40;
  }

  if(
    method ===
    'heatpump'
  ){

    if(
      hpAnswer ===
      'yes'
    ){
      return (
        ac +
        heat * .65
      );
    }

    if(
      hpAnswer ===
      'no'
    ){
      return heat * .65;
    }
  }

  return 0;
}

function generatorHeatContribution(
  method
){

  if(
    method ===
    'central65'
  ){
    return (
      remain(38) *
      .65
    );
  }

  if(
    method ===
    'separate40'
  ){
    return (
      remain(38) *
      .40
    );
  }

  if(
    method ===
    'heatpump'
  ){

    if(
      hpAnswer ===
      'yes'
    ){
      return (
        remain(37) +
        remain(38) *
        .65
      );
    }

    if(
      hpAnswer ===
      'no'
    ){
      return (
        remain(38) *
        .65
      );
    }
  }

  return 0;
}

window.isHVACManagedRowApplicable =
  function(row){

    return (
      activeRows.has(
        Number(row)
      ) &&
      rowVA(
        Number(row)
      ) > 0
    );
  };

window.validateHVACMethodSelection =
  function(){

    const methodSelected =
      selected.size > 0;

    const heatPumpReady =
      !selected.has(
        'heatpump'
      ) ||
      !!hpAnswer;

    const fortyPercentReady =
      !selected.has(
        'separate40'
      ) ||
      Math.floor(
        num('q38')
      ) >= 4;

    return {
      valid:
        methodSelected &&
        heatPumpReady &&
        fortyPercentReady,

      method:
        Array.from(
          selected
        ).join(','),

      methodSelected:
        methodSelected,

      heatPumpReady:
        heatPumpReady,

      fortyPercentReady:
        fortyPercentReady,

      heatingUnitCount:
        Math.floor(
          num('q38')
        )
    };
  };

window.getHVACMethodSummary =
  function(){

    if(!selected.size){
      return 'Not selected';
    }

    const names = {
      central65:
        'Central electric heat at 65%',

      separate40:
        'Separately controlled electric heat at 40%',

      heatpump:
        'Heat pump with supplemental electric heat'
    };

    return (
      multiple
        ? 'Multiple systems: '
        : 'Heating method: '
    ) +
    Array.from(
      selected
    )
    .map(
      m => names[m]
    )
    .join(' + ');
  };

window.getHVACRowLabel =
  function(row){

    if(row === 37){

      return (
        selected.size === 1 &&
        selected.has(
          'heatpump'
        )
      )
        ? 'Heat Pump Compressor'
        : 'Air Conditioning';
    }

    if(row === 38){

      return (
        selected.size === 1 &&
        selected.has(
          'heatpump'
        )
      )
        ? 'Supplemental Electric Heat'
        : 'Heating';
    }

    return row === 39
      ? 'Air Conditioning'
      : 'Heating';
  };

window.hvacLoadCalculation =
  function(){

    const ac =
      rowVA(37);

    const heat =
      rowVA(38);

    let serviceHeat = 0;

    let controlling = '';

    selected.forEach(m=>{

      const v =
        heatContribution(
          m,
          ac,
          heat
        );

      if(
        v > serviceHeat
      ){

        serviceHeat = v;

        controlling = m;
      }
    });

    const coolingControls =
      ac >= serviceHeat;

    const service =
      Math.max(
        ac,
        serviceHeat
      );

    let generator = 0;

    let gAC = 0;

    let gHeat = 0;

    if(!selected.size){

      setActive([]);

      generator = 0;

    }else if(
      coolingControls
    ){

      setActive(
        [37]
      );

      gAC =
        remain(37);

      generator =
        gAC;

    }else{

      const rows =
        [38];

      if(
        controlling ===
          'heatpump' &&
        hpAnswer ===
          'yes'
      ){
        rows.push(37);
      }

      setActive(rows);

      gHeat =
        generatorHeatContribution(
          controlling
        );

      generator =
        gHeat;
    }

    setOutput(
      'e37',
      coolingControls
        ? ac
        : (
            controlling ===
              'heatpump' &&
            hpAnswer ===
              'yes'
              ? ac
              : 0
          )
    );

    setOutput(
      'e38',
      coolingControls
        ? 0
        : serviceHeat
    );

    setOutput('e39',0);
    setOutput('e40',0);
    setOutput('e41',0);

    setOutput(
      'f37',
      coolingControls
        ? remain(37)
        : (
            controlling ===
              'heatpump' &&
            hpAnswer ===
              'yes'
              ? remain(37)
              : 0
          )
    );

    setOutput(
      'f38',
      coolingControls
        ? 0
        : (
            controlling ===
              'separate40'
              ? remain(38) *
                .40
              : (
                  controlling
                    ? remain(38) *
                      .65
                    : 0
                )
          )
    );

    setOutput('f39',0);
    setOutput('f40',0);
    setOutput('f41',0);

    return {
      service,
      generator,
      serviceAC:ac,
      generatorAC:gAC,
      serviceHeating:
        serviceHeat,
      generatorHeating:
        gHeat,
      method:
        Array.from(
          selected
        ).join(','),
      multipleHeatTypes:
        multiple
    };
  };

const priorReset =
  window.resetHeatingMethodSelection;

window.resetHeatingMethodSelection =
  function(){

    try{

      if(
        typeof priorReset ===
        'function'
      ){
        priorReset();
      }

    }catch(e){}

    multiple = false;

    selected.clear();

    hpAnswer = '';

    save();

    syncUI();
  };

function init(){

  load();

  if(!ensureUI()){
    return;
  }

  syncUI();

  calculate();
}

if(
  document.readyState ===
  'loading'
){

  document.addEventListener(
    'DOMContentLoaded',
    init
  );

}else{

  setTimeout(
    init,
    0
  );
}

})();
(function(){

'use strict';

const METHODS_KEY =
  'loadcalcpro_hvac_selected_methods_v1';

const HP_KEY =
  'loadcalcpro_hvac_multi_hp_answer_v1';

const DATA_KEY =
  'loadcalcpro_hvac_method_sections_v57';

/*
  V5.30:
  HVAC managed-load controls now follow
  the same all/none and quantity-cycle
  behavior as appliance and continuous-load
  controls.
*/

const MANAGED_KEY =
  'loadcalcpro_hvac_method_managed_v57';

const METHODS = {

  central65:{
    title:
      'Cooling at 100% / Central Electric Heat at 65%',

    rows:[
      [
        'ac',
        'Air Conditioning Unit 1'
      ],
      [
        'ac2',
        'Air Conditioning Unit 2'
      ],
      [
        'ac3',
        'Air Conditioning Unit 3'
      ],
      [
        'heat',
        'Central Electric Heat Unit 1'
      ],
      [
        'heat2',
        'Central Electric Heat Unit 2'
      ],
      [
        'heat3',
        'Central Electric Heat Unit 3'
      ]
    ]
  },

  separate40:{
    title:
      'Separately Controlled Electric Heating Systems at 40%',

    rows:[
      [
        'ac',
        'Air Conditioning Unit 1'
      ],
      [
        'ac2',
        'Air Conditioning Unit 2'
      ],
      [
        'ac3',
        'Air Conditioning Unit 3'
      ],
      [
        'heat',
        'Electric Heating Unit 1'
      ],
      [
        'heat2',
        'Electric Heating Unit 2'
      ],
      [
        'heat3',
        'Electric Heating Unit 3'
      ],
      [
        'heat4',
        'Electric Heating Unit 4'
      ]
    ]
  },

  heatpump:{
    title:
      'Heat Pump with Supplemental Electric Heat',

    rows:[
      [
        'ac',
        'Heat Pump Compressor 1'
      ],
      [
        'ac2',
        'Heat Pump Compressor 2'
      ],
      [
        'ac3',
        'Heat Pump Compressor 3'
      ],
      [
        'heat',
        'Supplemental Electric Heat Unit 1'
      ],
      [
        'heat2',
        'Supplemental Electric Heat Unit 2'
      ],
      [
        'heat3',
        'Supplemental Electric Heat Unit 3'
      ]
    ]
  }
};

let data = {};

let managed = {};

function readJSON(
  key,
  fallback
){

  try{

    const v =
      JSON.parse(
        localStorage.getItem(
          key
        ) || ''
      );

    return (
      v &&
      typeof v === 'object'
    )
      ? v
      : fallback;

  }catch(e){

    return fallback;
  }
}

function save(){

  try{

    localStorage.setItem(
      DATA_KEY,
      JSON.stringify(data)
    );

    localStorage.setItem(
      MANAGED_KEY,
      JSON.stringify(managed)
    );

  }catch(e){}
}

function selections(){

  const a =
    readJSON(
      METHODS_KEY,
      []
    );

  return Array.isArray(a)
    ? a.filter(
        x => METHODS[x]
      )
    : [];
}

function hpAnswer(){

  return (
    localStorage.getItem(
      HP_KEY
    ) || ''
  );
}

function number(id){

  const e =
    document.getElementById(
      id
    );

  const n =
    Number(
      e ? e.value : 0
    );

  return (
    Number.isFinite(n) &&
    n > 0
  )
    ? n
    : 0;
}

function fmt(n){

  return n
    ? Math.round(n)
        .toLocaleString(
          'en-US'
        )
    : '';
}

function key(
  method,
  type
){

  return (
    method +
    '_' +
    type
  );
}

function total(
  method,
  type
){

  const k =
    key(
      method,
      type
    );

  const d =
    data[k] || {};

  return (
    (
      Number(d.qty) ||
      0
    ) *
    (
      Number(d.va) ||
      0
    )
  );
}

function remaining(
  method,
  type
){

  const k =
    key(
      method,
      type
    );

  const d =
    data[k] || {};

  const q =
    Math.max(
      0,
      Math.floor(
        Number(d.qty) ||
        0
      )
    );

  const m =
    managed[k]
      ? q
      : 0;

  return (
    Math.max(
      q - m,
      0
    ) *
    (
      Number(d.va) ||
      0
    )
  );
}

const AC_TYPES = [
  'ac',
  'ac2',
  'ac3'
];

const HEAT_TYPES = [
  'heat',
  'heat2',
  'heat3',
  'heat4'
];

const FORTY_HEAT_TYPES = [
  'heat',
  'heat2',
  'heat3',
  'heat4'
];

function categoryTotal(
  method,
  types,
  generator
){

  return types.reduce(
    (
      sum,
      t
    ) =>
      sum +
      (
        generator
          ? remaining(
              method,
              t
            )
          : total(
              method,
              t
            )
      ),
    0
  );
}

function acTotal(
  method,
  generator
){

  return categoryTotal(
    method,
    AC_TYPES,
    generator
  );
}

function heatTotal(
  method,
  generator
){

  return categoryTotal(
    method,
    HEAT_TYPES,
    generator
  );
}

function fortyHeatTotal(
  generator
){

  return categoryTotal(
    'separate40',
    FORTY_HEAT_TYPES,
    generator
  );
}

function fortyUnitCount(){

  return FORTY_HEAT_TYPES
    .reduce(
      (
        sum,
        t
      ) =>
        sum +
        Math.max(
          0,
          Math.floor(
            Number(
              (
                data[
                  key(
                    'separate40',
                    t
                  )
                ] || {}
              ).qty
            ) || 0
          )
        ),
      0
    );
}

function methodService(
  method
){

  const ac =
    acTotal(
      method,
      false
    );

  const heat =
    method ===
      'separate40'
      ? fortyHeatTotal(
          false
        )
      : heatTotal(
          method,
          false
        );

  if(
    method ===
    'central65'
  ){
    return Math.max(
      ac,
      heat * .65
    );
  }

  if(
    method ===
    'separate40'
  ){
    return Math.max(
      ac,
      heat * .40
    );
  }

  if(
    method ===
    'heatpump'
  ){

    const hp =
      hpAnswer();

    return hp === 'yes'
      ? (
          ac +
          heat * .65
        )
      : (
          hp === 'no'
            ? heat * .65
            : 0
        );
  }

  return 0;
}

function methodGenerator(
  method
){

  const ac =
    acTotal(
      method,
      true
    );

  const heat =
    method ===
      'separate40'
      ? fortyHeatTotal(
          true
        )
      : heatTotal(
          method,
          true
        );

  if(
    method ===
    'central65'
  ){
    return Math.max(
      ac,
      heat * .65
    );
  }

  if(
    method ===
    'separate40'
  ){
    return Math.max(
      ac,
      heat * .40
    );
  }

  if(
    method ===
    'heatpump'
  ){

    const hp =
      hpAnswer();

    return hp === 'yes'
      ? (
          ac +
          heat * .65
        )
      : (
          hp === 'no'
            ? heat * .65
            : 0
        );
  }

  return 0;
}

function rowContribution(
  method,
  type,
  generator
){

  const ac =
    acTotal(
      method,
      generator
    );

  const heat =
    method ===
      'separate40'
      ? fortyHeatTotal(
          generator
        )
      : heatTotal(
          method,
          generator
        );

  const isAC =
    AC_TYPES.includes(
      type
    );

  const isHeat =
    HEAT_TYPES.includes(
      type
    );

  const individual =
    generator
      ? remaining(
          method,
          type
        )
      : total(
          method,
          type
        );

  if(
    method ===
    'central65'
  ){

    const heatLoad =
      heat * .65;

    if(isAC){

      return ac >=
        heatLoad
          ? individual
          : 0;
    }

    if(isHeat){

      return heatLoad >
        ac
          ? individual *
            .65
          : 0;
    }

    return 0;
  }

  if(
    method ===
    'separate40'
  ){

    const heatLoad =
      heat * .40;

    if(isAC){

      return ac >=
        heatLoad
          ? individual
          : 0;
    }

    if(
      FORTY_HEAT_TYPES
        .includes(type)
    ){

      return heatLoad >
        ac
          ? individual *
            .40
          : 0;
    }

    return 0;
  }

  if(
    method ===
    'heatpump'
  ){

    const hp =
      hpAnswer();

    if(
      hp === 'yes'
    ){

      if(isAC){
        return individual;
      }

      if(isHeat){
        return (
          individual *
          .65
        );
      }
    }

    if(
      hp === 'no' &&
      isHeat
    ){

      return (
        individual *
        .65
      );
    }

    return 0;
  }

  return 0;
}

function input(
  method,
  type,
  field,
  placeholder
){

  const k =
    key(
      method,
      type
    );

  const v =
    (
      data[k] &&
      data[k][field]
    ) || '';

  return (
    '<input ' +
    'data-v57-method="' +
    method +
    '" ' +
    'data-v57-type="' +
    type +
    '" ' +
    'data-v57-field="' +
    field +
    '" ' +
    'type="number" ' +
    'min="0" ' +
    'step="' +
    (
      field === 'qty'
        ? '1'
        : 'any'
    ) +
    '" ' +
    'inputmode="' +
    (
      field === 'qty'
        ? 'numeric'
        : 'decimal'
    ) +
    '" ' +
    'placeholder="' +
    placeholder +
    '" ' +
    'value="' +
    v +
    '">'
  );
}

function rowHTML(
  method,
  type,
  label
){

  const k =
    key(
      method,
      type
    );

  const on =
    !!managed[k];

  return (
    '<div class="v57-method-row">' +

    '<div class="v57-method-name">' +
    label +
    '</div>' +

    '<div class="v57-method-inputs">' +
    input(
      method,
      type,
      'qty',
      'Qty'
    ) +
    input(
      method,
      type,
      'va',
      'VA'
    ) +
    '</div>' +

    '<div class="v57-method-managed">' +

    '<button ' +
    'type="button" ' +
    'class="v57-managed-button ' +
    (
      on
        ? 'checked'
        : ''
    ) +
    '" ' +
    'data-v57-managed="' +
    k +
    '" ' +
    'aria-label="Toggle managed load">' +
    (
      on
        ? '✓'
        : ''
    ) +
    '</button>' +

    '</div>' +

    '<div class="v57-method-output">' +

    '<div class="v57-output-box">' +
    '<div class="v57-output-label">' +
    'Service Load VA' +
    '</div>' +
    '<div class="v57-output-value" ' +
    'data-v57-output="' +
    method +
    '_' +
    type +
    '_service">' +
    '</div>' +
    '</div>' +

    '<div class="v57-output-box">' +
    '<div class="v57-output-label">' +
    'Generator Load VA' +
    '</div>' +
    '<div class="v57-output-value" ' +
    'data-v57-output="' +
    method +
    '_' +
    type +
    '_generator">' +
    '</div>' +
    '</div>' +

    '</div>' +

    '</div>'
  );
}

function fortyComparisonHTML(){

  return (
    '<div class="v57-forty-comparison">' +

    '<div>' +
    '<span>Cooling at 100%</span>' +
    '<strong data-v57-compare="cooling"></strong>' +
    '</div>' +

    '<div>' +
    '<span>Heating total</span>' +
    '<strong data-v57-compare="heating-total"></strong>' +
    '</div>' +

    '<div>' +
    '<span>Heating at 40%</span>' +
    '<strong data-v57-compare="heating-40"></strong>' +
    '</div>' +

    '<div class="v57-forty-used">' +
    '<span>HVAC load used</span>' +
    '<strong data-v57-compare="used"></strong>' +
    '</div>' +

    '</div>'
  );
}

function cardHTML(method){

  const m =
    METHODS[method];

  let rows =
    m.rows
      .map(
        r =>
          rowHTML(
            method,
            r[0],
            r[1]
          )
      )
      .join('');

  let hp = '';

  if(
    method ===
    'heatpump'
  ){

    const a =
      hpAnswer();

    hp =
      '<div class="v57-hp-question">' +

      '<div class="v57-hp-question-title">' +
      'Can the heat-pump compressor and supplemental electric heat operate simultaneously?' +
      '</div>' +

      '<div class="v57-hp-options">' +

      '<button type="button" ' +
      'class="v57-hp-option ' +
      (
        a === 'yes'
          ? 'selected'
          : ''
      ) +
      '" ' +
      'data-v57-hp="yes">' +

      '<span class="v57-hp-check">' +
      (
        a === 'yes'
          ? '✓'
          : ''
      ) +
      '</span>' +

      '<span>' +
      'Yes — compressor at 100% plus supplemental heat at 65%' +
      '</span>' +

      '</button>' +

      '<button type="button" ' +
      'class="v57-hp-option ' +
      (
        a === 'no'
          ? 'selected'
          : ''
      ) +
      '" ' +
      'data-v57-hp="no">' +

      '<span class="v57-hp-check">' +
      (
        a === 'no'
          ? '✓'
          : ''
      ) +
      '</span>' +

      '<span>' +
      'No — controls lock out the compressor during supplemental heat' +
      '</span>' +

      '</button>' +

      '</div>' +

      '</div>';
  }

  const comparison =
    method ===
      'separate40'
      ? fortyComparisonHTML()
      : '';

  return (
    '<section class="v57-method-card" ' +
    'data-v57-card="' +
    method +
    '">' +

    '<div class="v57-method-heading">' +
    m.title +
    '</div>' +

    rows +
    comparison +
    hp +

    '</section>'
  );
}

function ensureContainer(){

  let c =
    document.getElementById(
      'v57HvacMethodSections'
    );

  if(c){
    return c;
  }

  const card =
    document.querySelector(
      'section.card h2.card-heading'
    );

  const hvacHeading =
    [
      ...document.querySelectorAll(
        'section.card h2.card-heading'
      )
    ].find(
      h =>
        h.textContent.trim() ===
        'HVAC Loads'
    );

  if(!hvacHeading){
    return null;
  }

  const body =
    hvacHeading
      .parentElement
      .querySelector(
        '.card-body'
      );

  if(!body){
    return null;
  }

  c =
    document.createElement(
      'div'
    );

  c.id =
    'v57HvacMethodSections';

  const summary =
    body.querySelector(
      '.summary-strip'
    );

  body.insertBefore(
    c,
    summary || null
  );

  [
    'q37',
    'q38',
    'q39',
    'q40'
  ].forEach(id=>{

    const r =
      document
        .getElementById(id)
        ?.closest(
          '.load-row'
        );

    if(r){
      r.classList.add(
        'v57-hide-legacy-hvac'
      );
    }
  });

  const old =
    document.getElementById(
      'heatPumpQuestions'
    );

  if(old){

    old.classList.add(
      'v57-hide-legacy-hvac'
    );
  }

  return c;
}

function render(){

  const c =
    ensureContainer();

  if(!c){
    return;
  }

  const sel =
    selections();

  c.innerHTML =
    sel.length
      ? sel
          .map(
            cardHTML
          )
          .join('')
      : '<div id="v57NoMethodMessage">' +
        'Select a heating method above to open its HVAC load section.' +
        '</div>';

  c
    .querySelectorAll(
      '[data-v57-method]'
    )
    .forEach(el=>{

      el.addEventListener(
        'input',
        ()=>{

          const m =
            el.dataset.v57Method;

          const t =
            el.dataset.v57Type;

          const f =
            el.dataset.v57Field;

          const k =
            key(
              m,
              t
            );

          data[k] =
            data[k] || {};

          data[k][f] =
            el.value;

          save();

          calculate();
        }
      );
    });

  c
    .querySelectorAll(
      '[data-v57-managed]'
    )
    .forEach(b=>{

      b.addEventListener(
        'click',
        ()=>{

          const k =
            b.dataset.v57Managed;

          managed[k] =
            !managed[k];

          save();

          render();

          calculate();
        }
      );
    });

  c
    .querySelectorAll(
      '[data-v57-hp]'
    )
    .forEach(b=>{

      b.addEventListener(
        'click',
        ()=>{

          const v =
            b.dataset.v57Hp;

          const current =
            hpAnswer();

          if(
            current === v
          ){

            localStorage.removeItem(
              HP_KEY
            );

          }else{

            localStorage.setItem(
              HP_KEY,
              v
            );
          }

          render();

          calculate();
        }
      );
    });

  updateOutputs();
}

function updateOutputs(){

  selections()
    .forEach(
      m =>
        METHODS[m].rows
          .forEach(r=>{

            const t =
              r[0];

            const s =
              document.querySelector(
                '[data-v57-output="' +
                m +
                '_' +
                t +
                '_service"]'
              );

            const g =
              document.querySelector(
                '[data-v57-output="' +
                m +
                '_' +
                t +
                '_generator"]'
              );

            if(s){

              s.textContent =
                fmt(
                  rowContribution(
                    m,
                    t,
                    false
                  )
                );
            }

            if(g){

              g.textContent =
                fmt(
                  rowContribution(
                    m,
                    t,
                    true
                  )
                );
            }
          })
    );

  if(
    selections()
      .includes(
        'separate40'
      )
  ){

    const ac =
      acTotal(
        'separate40',
        false
      );

    const heat =
      fortyHeatTotal(
        false
      );

    const heat40 =
      heat * .40;

    const used =
      Math.max(
        ac,
        heat40
      );

    const values = {
      cooling:ac,
      'heating-total':heat,
      'heating-40':heat40,
      used:used
    };

    Object
      .keys(values)
      .forEach(k=>{

        const e =
          document.querySelector(
            '[data-v57-compare="' +
            k +
            '"]'
          );

        if(e){

          e.textContent =
            fmt(
              values[k]
            ) +
            (
              k === 'used'
                ? (
                    heat40 > ac
                      ? ' — Heating'
                      : ' — Cooling'
                  )
                : ''
            );
        }
      });
  }
}

const priorCalc =
  window.hvacLoadCalculation;

window.hvacLoadCalculation =
  function(){

    const sel =
      selections();

    let service = 0;

    let generator = 0;

    let serviceAC = 0;

    let generatorAC = 0;

    let serviceHeating = 0;

    let generatorHeating = 0;

    sel.forEach(m=>{

      service +=
        methodService(m);

      generator +=
        methodGenerator(m);

      METHODS[m].rows
        .forEach(r=>{

          const t =
            r[0];

          const sv =
            rowContribution(
              m,
              t,
              false
            );

          const gv =
            rowContribution(
              m,
              t,
              true
            );

          if(
            AC_TYPES.includes(t)
          ){

            serviceAC += sv;

            generatorAC += gv;

          }else if(
            HEAT_TYPES.includes(t)
          ){

            serviceHeating +=
              sv;

            generatorHeating +=
              gv;
          }
        });
    });

    setOutput(
      'e37',
      serviceAC
    );

    setOutput(
      'e38',
      serviceHeating
    );

    setOutput(
      'e39',
      0
    );

    setOutput(
      'e40',
      0
    );

    setOutput(
      'e41',
      0
    );

    setOutput(
      'f37',
      generatorAC
    );

    setOutput(
      'f38',
      generatorHeating
    );

    setOutput(
      'f39',
      0
    );

    setOutput(
      'f40',
      0
    );

    setOutput(
      'f41',
      0
    );

    updateOutputs();

    return {
      service,
      generator,
      serviceAC,
      generatorAC,
      serviceHeating,
      generatorHeating,
      method:
        sel.join(','),
      multipleHeatTypes:
        sel.length > 1
    };
  };

window.validateHVACMethodSelection =
  function(){

    const sel =
      selections();

    const hpReady =
      !sel.includes(
        'heatpump'
      ) ||
      !!hpAnswer();

    const fortyQty =
      fortyUnitCount();

    const fortyReady =
      !sel.includes(
        'separate40'
      ) ||
      fortyQty >= 4;

    return {
      valid:
        sel.length > 0 &&
        hpReady &&
        fortyReady,

      method:
        sel.join(','),

      methodSelected:
        sel.length > 0,

      heatPumpReady:
        hpReady,

      fortyPercentReady:
        fortyReady,

      heatingUnitCount:
        fortyQty
    };
  };

window.getHVACMethodSummary =
  function(){

    const sel =
      selections();

    const names = {
      central65:
        'Central electric heat at 65%',

      separate40:
        'Separately controlled electric heat at 40%',

      heatpump:
        'Heat pump with supplemental electric heat'
    };

    return sel.length
      ? (
          sel.length > 1
            ? 'Multiple systems: '
            : 'Heating method: '
        ) +
        sel
          .map(
            m => names[m]
          )
          .join(' + ')
      : 'Not selected';
  };

function watchSelectors(){

  const panel =
    document.getElementById(
      'heatingMethodPanel'
    );

  if(!panel){
    return;
  }

  panel.addEventListener(
    'click',
    () =>
      setTimeout(
        ()=>{

          render();

          calculate();
        },
        0
      ),
    true
  );
}

const previousReset =
  window.resetHeatingMethodSelection;

window.resetHeatingMethodSelection =
  function(){

    if(
      typeof previousReset ===
      'function'
    ){
      previousReset();
    }

    data = {};

    managed = {};

    save();

    render();

    calculate();
  };

const previousManagedCount =
  window.applicableManagedLoadCount;

window.applicableManagedLoadCount =
  function(){

    let total =
      typeof previousManagedCount ===
      'function'
        ? previousManagedCount()
        : 0;

    selections()
      .forEach(
        m =>
          METHODS[m].rows
            .forEach(r=>{

              const k =
                key(
                  m,
                  r[0]
                );

              const d =
                data[k] || {};

              if(
                managed[k]
              ){

                total +=
                  Math.max(
                    0,
                    Math.floor(
                      Number(d.qty) ||
                      0
                    )
                  );
              }
            })
      );

    return total;
  };

function init(){

  data =
    readJSON(
      DATA_KEY,
      {}
    );

  managed =
    readJSON(
      MANAGED_KEY,
      {}
    );

  ensureContainer();

  watchSelectors();

  render();

  calculate();
}

if(
  document.readyState ===
  'loading'
){

  document.addEventListener(
    'DOMContentLoaded',
    () =>
      setTimeout(
        init,
        20
      )
  );

}else{

  setTimeout(
    init,
    20
  );
}

})();
(function(){

'use strict';

const METHODS_KEY =
  'loadcalcpro_hvac_selected_methods_v1';

const MULTI_KEY =
  'loadcalcpro_hvac_multiple_selector_v1';

const HP_KEY =
  'loadcalcpro_hvac_multi_hp_answer_v1';

const DATA_KEY =
  'loadcalcpro_hvac_method_sections_v57';

const MANAGED_KEY =
  'loadcalcpro_hvac_method_managed_v57';

const COUNT_KEY =
  'loadcalcpro_hvac_visible_system_counts_v522';

const METHODS = {

  central65:{
    title:
      'Cooling at 100% / Central Electric Heat at 65%',
    cool:
      'Air Conditioning Unit',
    heat:
      'Central Electric Heat Unit'
  },

  heatpump:{
    title:
      'Heat Pump with Supplemental Electric Heat',
    cool:
      'Heat Pump Unit',
    heat:
      'Supplemental Electric Heat Unit'
  },

  separate40:{
    title:
      'Separately Controlled Electric Heating Systems at 40%',
    cool:
      'Cooling Unit',
    heat:
      'Heating Unit'
  }
};

let data =
  readJSON(
    DATA_KEY,
    {}
  );

let managed =
  readJSON(
    MANAGED_KEY,
    {}
  );

let counts =
  readJSON(
    COUNT_KEY,
    {}
  );

function readJSON(
  k,
  f
){

  try{

    const v =
      JSON.parse(
        localStorage.getItem(k) ||
        ''
      );

    return (
      v &&
      typeof v === 'object'
    )
      ? v
      : f;

  }catch(e){

    return f;
  }
}

function save(){

  try{

    localStorage.setItem(
      DATA_KEY,
      JSON.stringify(data)
    );

    localStorage.setItem(
      MANAGED_KEY,
      JSON.stringify(managed)
    );

    localStorage.setItem(
      COUNT_KEY,
      JSON.stringify(counts)
    );

  }catch(e){}
}

function selected(){

  const a =
    readJSON(
      METHODS_KEY,
      []
    );

  return Array.isArray(a)
    ? a.filter(
        x => METHODS[x]
      )
    : [];
}

function hpAnswer(){

  return (
    localStorage.getItem(
      HP_KEY
    ) || ''
  );
}

function typeFor(
  kind,
  index
){

  return (
    kind +
    (
      index === 1
        ? ''
        : index
    )
  );
}

function key(
  method,
  type
){

  return (
    method +
    '_' +
    type
  );
}

function item(
  method,
  type
){

  return (
    data[
      key(
        method,
        type
      )
    ] || {}
  );
}

function qty(
  method,
  type
){

  return Math.max(
    0,
    Math.floor(
      Number(
        item(
          method,
          type
        ).qty
      ) || 0
    )
  );
}

function va(
  method,
  type
){

  return Math.max(
    0,
    Number(
      item(
        method,
        type
      ).va
    ) || 0
  );
}

function total(
  method,
  type
){

  return (
    qty(
      method,
      type
    ) *
    va(
      method,
      type
    )
  );
}

function managedQty(
  method,
  type
){

  const k =
    key(
      method,
      type
    );

  const q =
    qty(
      method,
      type
    );

  const raw =
    managed[k];

  let n =
    raw === true
      ? q
      : Math.floor(
          Number(raw) || 0
        );

  if(n < 0){
    n = 0;
  }

  if(n > q){
    n = q;
  }

  managed[k] = n;

  return n;
}

function remaining(
  method,
  type
){

  const q =
    qty(
      method,
      type
    );

  if(q < 1){

    return total(
      method,
      type
    );
  }

  return (
    Math.max(
      q -
      managedQty(
        method,
        type
      ),
      0
    ) *
    va(
      method,
      type
    )
  );
}

function fmt(n){

  return n
    ? Math.round(n)
        .toLocaleString(
          'en-US'
        )
    : '';
}

function count(method){

  const n =
    Math.max(
      1,
      Math.min(
        3,
        Math.floor(
          Number(
            counts[method]
          ) || 1
        )
      )
    );

  counts[method] = n;

  return n;
}

function coolingTotal(
  method,
  generator
){

  let s = 0;

  for(
    let i = 1;
    i <= count(method);
    i++
  ){

    s += (
      generator
        ? remaining
        : total
    )(
      method,
      typeFor(
        'ac',
        i
      )
    );
  }

  return s;
}

function heatingTotal(
  method,
  generator
){

  let s = 0;

  for(
    let i = 1;
    i <= count(method);
    i++
  ){

    s += (
      generator
        ? remaining
        : total
    )(
      method,
      typeFor(
        'heat',
        i
      )
    );
  }

  return s;
}

function heatingQty(method){

  let s = 0;

  for(
    let i = 1;
    i <= count(method);
    i++
  ){

    s += qty(
      method,
      typeFor(
        'heat',
        i
      )
    );
  }

  return s;
}

function fortyApplies(){

  return (
    heatingQty(
      'separate40'
    ) >= 4
  );
}

function applicableHeat(
  method,
  generator
){

  const h =
    heatingTotal(
      method,
      generator
    );

  if(
    method ===
    'central65'
  ){
    return h * .65;
  }

  if(
    method ===
    'separate40'
  ){
    return fortyApplies()
      ? h * .40
      : h;
  }

  if(
    method ===
    'heatpump'
  ){
    return h * .65;
  }

  return 0;
}

function methodResult(
  method,
  generator
){

  const c =
    coolingTotal(
      method,
      generator
    );

  const h =
    applicableHeat(
      method,
      generator
    );

  if(
    method ===
    'heatpump'
  ){

    const hp =
      hpAnswer();

    if(
      hp === 'yes'
    ){
      return c + h;
    }

    if(
      hp === 'no'
    ){
      return h;
    }

    return 0;
  }

  return Math.max(
    c,
    h
  );
}

function inputHTML(
  method,
  type,
  field,
  placeholder
){

  const v =
    item(
      method,
      type
    )[field] || '';

  return (
    '<input ' +
    'data-v522-method="' +
    method +
    '" ' +
    'data-v522-type="' +
    type +
    '" ' +
    'data-v522-field="' +
    field +
    '" ' +
    'type="number" ' +
    'min="0" ' +
    'step="' +
    (
      field === 'qty'
        ? '1'
        : 'any'
    ) +
    '" ' +
    'inputmode="' +
    (
      field === 'qty'
        ? 'numeric'
        : 'decimal'
    ) +
    '" ' +
    'placeholder="' +
    placeholder +
    '" ' +
    'value="' +
    v +
    '">'
  );
}

function entryRow(
  method,
  type,
  label
){

  const k =
    key(
      method,
      type
    );

  const selected =
    managedQty(
      method,
      type
    );

  const on =
    selected > 0;

  return (
    '<div class="v57-method-row">' +

    '<div class="v57-method-name">' +
    label +
    '</div>' +

    '<div class="v57-method-inputs">' +

    inputHTML(
      method,
      type,
      'qty',
      'Qty'
    ) +

    inputHTML(
      method,
      type,
      'va',
      'VA'
    ) +

    '</div>' +

    '<div class="v57-method-managed">' +

    '<button ' +
    'type="button" ' +
    'class="v57-managed-button ' +
    (
      on
        ? 'checked'
        : ''
    ) +
    '" ' +
    'data-v522-managed="' +
    k +
    '" ' +
    'aria-label="Toggle managed load">' +
    (
      on
        ? '✓'
        : ''
    ) +
    '</button>' +

    '<button ' +
    'type="button" ' +
    'class="v57-managed-qty ' +
    (
      on
        ? 'show'
        : ''
    ) +
    '" ' +
    'data-v522-managed-qty="' +
    k +
    '" ' +
    'aria-label="Reduce managed quantity">' +
    selected +
    '</button>' +

    '</div>' +

    '<div class="v57-method-output">' +

    '<div class="v57-output-box">' +
    '<div class="v57-output-label">' +
    'Service Load VA' +
    '</div>' +
    '<div class="v57-output-value" ' +
    'data-v522-output="' +
    k +
    '_service">' +
    '</div>' +
    '</div>' +

    '<div class="v57-output-box">' +
    '<div class="v57-output-label">' +
    'Generator Load VA' +
    '</div>' +
    '<div class="v57-output-value" ' +
    'data-v522-output="' +
    k +
    '_generator">' +
    '</div>' +
    '</div>' +

    '</div>' +

    '</div>'
  );
}

function fortyRow(index){

  return (
    '<div class="v57-method-row v522-calculated-row">' +

    '<div class="v57-method-name">' +
    'Heating at 40% — System ' +
    index +
    '</div>' +

    '<div class="v522-calculated-note" ' +
    'data-v522-forty-note="' +
    index +
    '">' +
    '</div>' +

    '<div></div>' +

    '<div class="v57-method-output">' +

    '<div class="v57-output-box">' +
    '<div class="v57-output-label">' +
    'Service Load VA' +
    '</div>' +
    '<div class="v57-output-value" ' +
    'data-v522-forty="' +
    index +
    '_service">' +
    '</div>' +
    '</div>' +

    '<div class="v57-output-box">' +
    '<div class="v57-output-label">' +
    'Generator Load VA' +
    '</div>' +
    '<div class="v57-output-value" ' +
    'data-v522-forty="' +
    index +
    '_generator">' +
    '</div>' +
    '</div>' +

    '</div>' +

    '</div>'
  );
}

function systemHTML(
  method,
  index
){

  const m =
    METHODS[method];

  const ac =
    typeFor(
      'ac',
      index
    );

  const heat =
    typeFor(
      'heat',
      index
    );

  return (
    '<div class="v522-system-group">' +

    '<div class="v522-system-title">' +
    'HVAC System ' +
    index +
    '</div>' +

    entryRow(
      method,
      ac,
      m.cool +
      ' ' +
      index
    ) +

    entryRow(
      method,
      heat,
      m.heat +
      ' ' +
      index
    ) +

    (
      method ===
      'separate40'
        ? fortyRow(index)
        : ''
    ) +

    '</div>'
  );
}

function hpHTML(){

  const a =
    hpAnswer();

  return (
    '<div class="v57-hp-question">' +

    '<div class="v57-hp-question-title">' +
    'Can the heat-pump compressor and supplemental electric heat operate simultaneously?' +
    '</div>' +

    '<div class="v57-hp-options">' +

    '<button type="button" ' +
    'class="v57-hp-option ' +
    (
      a === 'yes'
        ? 'selected'
        : ''
    ) +
    '" ' +
    'data-v522-hp="yes">' +

    '<span class="v57-hp-check">' +
    (
      a === 'yes'
        ? '✓'
        : ''
    ) +
    '</span>' +

    '<span>' +
    'Yes — compressor at 100% plus supplemental heat at 65%' +
    '</span>' +

    '</button>' +

    '<button type="button" ' +
    'class="v57-hp-option ' +
    (
      a === 'no'
        ? 'selected'
        : ''
    ) +
    '" ' +
    'data-v522-hp="no">' +

    '<span class="v57-hp-check">' +
    (
      a === 'no'
        ? '✓'
        : ''
    ) +
    '</span>' +

    '<span>' +
    'No — controls lock out the compressor during supplemental heat' +
    '</span>' +

    '</button>' +

    '</div>' +

    '</div>'
  );
}

function comparisonHTML(){

  return (
    '<div class="v57-forty-comparison">' +

    '<div>' +
    '<span>Total heating quantity</span>' +
    '<strong data-v522-compare="qty"></strong>' +
    '</div>' +

    '<div>' +
    '<span>Cooling at 100%</span>' +
    '<strong data-v522-compare="cooling"></strong>' +
    '</div>' +

    '<div>' +
    '<span data-v522-heat-label>' +
    'Heating at 100%' +
    '</span>' +
    '<strong data-v522-compare="heating-used"></strong>' +
    '</div>' +

    '<div class="v57-forty-used">' +
    '<span>HVAC load used</span>' +
    '<strong data-v522-compare="used"></strong>' +
    '</div>' +

    '</div>'
  );
}

function cardHTML(method){

  let systems = '';

  for(
    let i = 1;
    i <= count(method);
    i++
  ){

    systems +=
      systemHTML(
        method,
        i
      );
  }

  const controls =
    '<div class="v523-system-controls">' +

    (
      count(method) < 3
        ? (
            '<button type="button" ' +
            'class="v522-add-system" ' +
            'data-v522-add="' +
            method +
            '">' +
            '+ Add HVAC System' +
            '</button>'
          )
        : ''
    ) +

    (
      count(method) > 1
        ? (
            '<button type="button" ' +
            'class="v523-remove-system" ' +
            'data-v523-remove="' +
            method +
            '">' +
            '− Remove HVAC System' +
            '</button>'
          )
        : ''
    ) +

    '</div>';

  return (
    '<section class="v57-method-card" ' +
    'data-v522-card="' +
    method +
    '">' +

    '<div class="v57-method-heading">' +
    METHODS[method].title +
    '</div>' +

    systems +

    (
      method ===
      'separate40'
        ? (
            comparisonHTML() +
            controls
          )
        : controls
    ) +

    (
      method ===
      'heatpump'
        ? hpHTML()
        : ''
    ) +

    '</section>'
  );
}

function container(){

  return document.getElementById(
    'v57HvacMethodSections'
  );
}

function bind(c){

  c
    .querySelectorAll(
      '[data-v522-method]'
    )
    .forEach(el=>{

      el.addEventListener(
        'input',
        ()=>{

          const k =
            key(
              el.dataset.v522Method,
              el.dataset.v522Type
            );

          data[k] =
            data[k] || {};

          data[k][
            el.dataset.v522Field
          ] =
            el.value;

          const q =
            Math.max(
              0,
              Math.floor(
                Number(
                  data[k].qty
                ) || 0
              )
            );

          if(
            Math.floor(
              Number(
                managed[k]
              ) || 0
            ) > q
          ){
            managed[k] = q;
          }

          save();

          calculate();

          updateOutputs();
        }
      );
    });

  c
    .querySelectorAll(
      '[data-v522-managed]'
    )
    .forEach(b=>{

      b.addEventListener(
        'click',
        ()=>{

          const k =
            b.dataset.v522Managed;

          const parts =
            k.split('_');

          const method =
            parts.shift();

          const type =
            parts.join('_');

          const q =
            qty(
              method,
              type
            );

          managed[k] =
            managedQty(
              method,
              type
            ) > 0
              ? 0
              : q;

          save();

          render();

          calculate();
        }
      );
    });

  c
    .querySelectorAll(
      '[data-v522-managed-qty]'
    )
    .forEach(b=>{

      b.addEventListener(
        'click',
        event=>{

          event.stopPropagation();

          const k =
            b.dataset
              .v522ManagedQty;

          const parts =
            k.split('_');

          const method =
            parts.shift();

          const type =
            parts.join('_');

          const q =
            qty(
              method,
              type
            );

          if(q < 1){
            return;
          }

          let n =
            managedQty(
              method,
              type
            ) - 1;

          if(n < 0){
            n = q;
          }

          managed[k] = n;

          save();

          render();

          calculate();
        }
      );
    });

  c
    .querySelectorAll(
      '[data-v522-add]'
    )
    .forEach(b=>{

      b.addEventListener(
        'click',
        ()=>{

          const m =
            b.dataset.v522Add;

          counts[m] =
            Math.min(
              3,
              count(m) + 1
            );

          save();

          render();

          calculate();
        }
      );
    });

  c
    .querySelectorAll(
      '[data-v523-remove]'
    )
    .forEach(b=>{

      b.addEventListener(
        'click',
        ()=>{

          const m =
            b.dataset.v523Remove;

          const current =
            count(m);

          if(
            current <= 1
          ){
            return;
          }

          const removed =
            current;

          for(
            const type of [
              typeFor(
                'ac',
                removed
              ),
              typeFor(
                'heat',
                removed
              )
            ]
          ){

            delete data[
              key(
                m,
                type
              )
            ];

            delete managed[
              key(
                m,
                type
              )
            ];
          }

          counts[m] =
            current - 1;

          save();

          render();

          calculate();
        }
      );
    });

  c
    .querySelectorAll(
      '[data-v522-hp]'
    )
    .forEach(b=>{

      b.addEventListener(
        'click',
        ()=>{

          const v =
            b.dataset.v522Hp;

          if(
            hpAnswer() === v
          ){

            localStorage.removeItem(
              HP_KEY
            );

          }else{

            localStorage.setItem(
              HP_KEY,
              v
            );
          }

          render();

          calculate();
        }
      );
    });
}

function render(){

  const c =
    container();

  if(!c){
    return;
  }

  const sel =
    selected();

  c.innerHTML =
    sel.length
      ? sel
          .map(
            cardHTML
          )
          .join('')
      : (
          '<div id="v57NoMethodMessage">' +
          'Select a heating method above to open its HVAC load section.' +
          '</div>'
        );

  bind(c);

  updateOutputs();
}

function setText(
  selector,
  value
){

  const e =
    document.querySelector(
      selector
    );

  if(e){
    e.textContent =
      value;
  }
}

function updateOutputs(){

  selected()
    .forEach(method=>{

      const cTotal =
        coolingTotal(
          method,
          false
        );

      const hBase =
        heatingTotal(
          method,
          false
        );

      const hApplicable =
        applicableHeat(
          method,
          false
        );

      const coolControls =
        method ===
        'heatpump'
          ? false
          : cTotal >=
            hApplicable;

      for(
        let i = 1;
        i <= count(method);
        i++
      ){

        const ac =
          typeFor(
            'ac',
            i
          );

        const heat =
          typeFor(
            'heat',
            i
          );

        const acS =
          total(
            method,
            ac
          );

        const acG =
          remaining(
            method,
            ac
          );

        const hS =
          total(
            method,
            heat
          );

        const hG =
          remaining(
            method,
            heat
          );

        let acSO = 0;
        let acGO = 0;
        let hSO = 0;
        let hGO = 0;

        if(
          method ===
          'heatpump'
        ){

          if(
            hpAnswer() ===
            'yes'
          ){

            acSO = acS;
            acGO = acG;

            hSO =
              hS * .65;

            hGO =
              hG * .65;

          }else if(
            hpAnswer() ===
            'no'
          ){

            hSO =
              hS * .65;

            hGO =
              hG * .65;
          }

        }else if(
          coolControls
        ){

          acSO = acS;
          acGO = acG;

        }else{

          const factor =
            method ===
            'central65'
              ? .65
              : (
                  fortyApplies()
                    ? .40
                    : 1
                );

          hSO =
            hS * factor;

          hGO =
            hG * factor;
        }

        setText(
          '[data-v522-output="' +
          key(
            method,
            ac
          ) +
          '_service"]',
          fmt(acSO)
        );

        setText(
          '[data-v522-output="' +
          key(
            method,
            ac
          ) +
          '_generator"]',
          fmt(acGO)
        );

        setText(
          '[data-v522-output="' +
          key(
            method,
            heat
          ) +
          '_service"]',
          fmt(hSO)
        );

        setText(
          '[data-v522-output="' +
          key(
            method,
            heat
          ) +
          '_generator"]',
          fmt(hGO)
        );

        if(
          method ===
          'separate40'
        ){

          const applies =
            fortyApplies();

          setText(
            '[data-v522-forty="' +
            i +
            '_service"]',
            applies
              ? fmt(
                  hS * .40
                )
              : ''
          );

          setText(
            '[data-v522-forty="' +
            i +
            '_generator"]',
            applies
              ? fmt(
                  hG * .40
                )
              : ''
          );

          setText(
            '[data-v522-forty-note="' +
            i +
            '"]',
            applies
              ? 'Calculated automatically'
              : 'Not applied — fewer than 4 total heating units'
          );
        }
      }

      if(
        method ===
        'separate40'
      ){

        const applies =
          fortyApplies();

        const used =
          Math.max(
            cTotal,
            hApplicable
          );

        setText(
          '[data-v522-compare="qty"]',
          String(
            heatingQty(method)
          )
        );

        setText(
          '[data-v522-compare="cooling"]',
          fmt(cTotal)
        );

        setText(
          '[data-v522-compare="heating-used"]',
          fmt(
            hApplicable
          )
        );

        const label =
          document.querySelector(
            '[data-v522-heat-label]'
          );

        if(label){

          label.textContent =
            applies
              ? 'Heating at 40%'
              : 'Heating at 100%';
        }

        setText(
          '[data-v522-compare="used"]',
          fmt(used) +
          (
            hApplicable >
            cTotal
              ? ' — Heating'
              : ' — Cooling'
          )
        );
      }
    });
}

window.hvacLoadCalculation =
  function(){

    let service = 0;

    let generator = 0;

    let serviceAC = 0;

    let generatorAC = 0;

    let serviceHeating = 0;

    let generatorHeating = 0;

    selected()
      .forEach(method=>{

        const cS =
          coolingTotal(
            method,
            false
          );

        const cG =
          coolingTotal(
            method,
            true
          );

        const hS =
          applicableHeat(
            method,
            false
          );

        const hG =
          applicableHeat(
            method,
            true
          );

        const hp =
          hpAnswer();

        if(
          method ===
          'heatpump'
        ){

          if(
            hp === 'yes'
          ){

            service +=
              cS + hS;

            generator +=
              cG + hG;

            serviceAC += cS;
            generatorAC += cG;

            serviceHeating += hS;
            generatorHeating += hG;

          }else if(
            hp === 'no'
          ){

            service += hS;
            generator += hG;

            serviceHeating += hS;
            generatorHeating += hG;
          }

        }else if(
          cS >= hS
        ){

          service += cS;
          generator += cG;

          serviceAC += cS;
          generatorAC += cG;

        }else{

          service += hS;
          generator += hG;

          serviceHeating += hS;
          generatorHeating += hG;
        }
      });

    setOutput(
      'e37',
      serviceAC
    );

    setOutput(
      'e38',
      serviceHeating
    );

    setOutput(
      'e39',
      0
    );

    setOutput(
      'e40',
      0
    );

    setOutput(
      'e41',
      0
    );

    setOutput(
      'f37',
      generatorAC
    );

    setOutput(
      'f38',
      generatorHeating
    );

    setOutput(
      'f39',
      0
    );

    setOutput(
      'f40',
      0
    );

    setOutput(
      'f41',
      0
    );

    updateOutputs();

    return {
      service,
      generator,
      serviceAC,
      generatorAC,
      serviceHeating,
      generatorHeating,
      method:
        selected().join(','),
      multipleHeatTypes:
        selected().length > 1
    };
  };

window.validateHVACMethodSelection =
  function(){

    const sel =
      selected();

    const hpReady =
      !sel.includes(
        'heatpump'
      ) ||
      !!hpAnswer();

    return {
      valid:
        sel.length > 0 &&
        hpReady,

      method:
        sel.join(','),

      methodSelected:
        sel.length > 0,

      heatPumpReady:
        hpReady,

      fortyPercentReady:
        true,

      heatingUnitCount:
        heatingQty(
          'separate40'
        )
    };
  };

window.getHVACMethodSummary =
  function(){

    const sel =
      selected();

    const names = {

      central65:
        'Central electric heat at 65%',

      separate40:
        (
          fortyApplies()
            ? 'Separately controlled electric heat at 40%'
            : 'Separately controlled electric heat at 100% — fewer than four units'
        ),

      heatpump:
        'Heat pump with supplemental electric heat'
    };

    return sel.length
      ? (
          'Heating method: ' +
          sel
            .map(
              m => names[m]
            )
            .join(' + ')
        )
      : 'Not selected';
  };

const oldReset =
  window.resetHeatingMethodSelection;

window.resetHeatingMethodSelection =
  function(){

    try{

      if(
        typeof oldReset ===
        'function'
      ){
        oldReset();
      }

    }catch(e){}

    data = {};

    managed = {};

    counts = {};

    save();

    render();

    calculate();
  };

function init(){

  const version =
    document.querySelector(
      '.app-version'
    );

  if(version){

    version.textContent =
      'NEC 2023 | Version 2.0 — V5.41 Auto Save Restore Fixed';
  }

  render();

  calculate();

  const panel =
    document.getElementById(
      'heatingMethodPanel'
    );

  if(panel){

    panel.addEventListener(
      'click',
      () =>
        setTimeout(
          ()=>{

            render();

            calculate();
          },
          60
        ),
      true
    );
  }
}

if(
  document.readyState ===
  'loading'
){

  document.addEventListener(
    'DOMContentLoaded',
    () =>
      setTimeout(
        init,
        120
      )
  );

}else{

  setTimeout(
    init,
    120
  );
}

})();
(function(){

'use strict';

const METHODS_KEY =
  'loadcalcpro_hvac_selected_methods_v1';

const HP_KEY =
  'loadcalcpro_hvac_multi_hp_answer_v1';

const DATA_KEY =
  'loadcalcpro_hvac_method_sections_v57';

const MANAGED_KEY =
  'loadcalcpro_hvac_method_managed_v57';

const COUNT_KEY =
  'loadcalcpro_hvac_visible_system_counts_v522';

const BASE_MANAGED_ROWS = [
  10,11,12,13,14,15,16,17,18,19,
  20,21,22,23,24,25,26,27,28,29,
  30,42,43,47
];

const METHODS = {
  central65:true,
  separate40:true,
  heatpump:true
};

function readJSON(
  key,
  fallback
){

  try{

    const v =
      JSON.parse(
        localStorage.getItem(key) ||
        ''
      );

    return (
      v &&
      typeof v === 'object'
    )
      ? v
      : fallback;

  }catch(e){

    return fallback;
  }
}

function selected(){

  const a =
    readJSON(
      METHODS_KEY,
      []
    );

  return Array.isArray(a)
    ? a.filter(
        m => METHODS[m]
      )
    : [];
}

function hpAnswer(){

  return (
    localStorage.getItem(
      HP_KEY
    ) || ''
  );
}

function data(){

  return readJSON(
    DATA_KEY,
    {}
  );
}

function managed(){

  return readJSON(
    MANAGED_KEY,
    {}
  );
}

function counts(){

  return readJSON(
    COUNT_KEY,
    {}
  );
}

function typeFor(
  kind,
  index
){

  return (
    kind +
    (
      index === 1
        ? ''
        : index
    )
  );
}

function key(
  method,
  type
){

  return (
    method +
    '_' +
    type
  );
}

function count(method){

  const n =
    Math.floor(
      Number(
        counts()[method]
      ) || 1
    );

  return Math.max(
    1,
    Math.min(
      3,
      n
    )
  );
}

function item(
  method,
  type
){

  return (
    data()[
      key(
        method,
        type
      )
    ] || {}
  );
}

function qty(
  method,
  type
){

  return Math.max(
    0,
    Math.floor(
      Number(
        item(
          method,
          type
        ).qty
      ) || 0
    )
  );
}

function va(
  method,
  type
){

  return Math.max(
    0,
    Number(
      item(
        method,
        type
      ).va
    ) || 0
  );
}

function total(
  method,
  type
){

  return (
    qty(
      method,
      type
    ) *
    va(
      method,
      type
    )
  );
}

function managedQty(
  method,
  type
){

  const q =
    qty(
      method,
      type
    );

  const raw =
    managed()[
      key(
        method,
        type
      )
    ];

  let n =
    raw === true
      ? q
      : Math.floor(
          Number(raw) || 0
        );

  return Math.max(
    0,
    Math.min(
      q,
      n
    )
  );
}

function remaining(
  method,
  type
){

  return (
    Math.max(
      qty(
        method,
        type
      ) -
      managedQty(
        method,
        type
      ),
      0
    ) *
    va(
      method,
      type
    )
  );
}

function aggregate(
  method,
  kind,
  generator
){

  let n = 0;

  for(
    let i = 1;
    i <= count(method);
    i++
  ){

    n += (
      generator
        ? remaining
        : total
    )(
      method,
      typeFor(
        kind,
        i
      )
    );
  }

  return n;
}

function heatQty(method){

  let n = 0;

  for(
    let i = 1;
    i <= count(method);
    i++
  ){

    n += qty(
      method,
      typeFor(
        'heat',
        i
      )
    );
  }

  return n;
}

function heatFactor(method){

  return (
    method ===
    'separate40'
  )
    ? (
        heatQty(method) >= 4
          ? .40
          : .65
      )
    : .65;
}

function fmt(n){

  return n
    ? Math.round(n)
        .toLocaleString(
          'en-US'
        )
    : '';
}

function set(
  selector,
  value
){

  const e =
    document.querySelector(
      selector
    );

  if(e){
    e.textContent =
      value;
  }
}

function methodResult(
  method,
  generator
){

  const c =
    aggregate(
      method,
      'ac',
      generator
    );

  const hBase =
    aggregate(
      method,
      'heat',
      generator
    );

  const h =
    hBase *
    heatFactor(method);

  if(
    method ===
    'heatpump'
  ){

    const hp =
      hpAnswer();

    if(
      hp === 'yes'
    ){

      return {
        total:c + h,
        c:c,
        h:h,
        controller:'both'
      };
    }

    if(
      hp === 'no'
    ){

      return c >= h
        ? {
            total:c,
            c:c,
            h:0,
            controller:'cooling'
          }
        : {
            total:h,
            c:0,
            h:h,
            controller:'heating'
          };
    }

    return {
      total:0,
      c:0,
      h:0,
      controller:''
    };
  }

  return c >= h
    ? {
        total:c,
        c:c,
        h:0,
        controller:'cooling'
      }
    : {
        total:h,
        c:0,
        h:h,
        controller:'heating'
      };
}

function updateSectionOutputs(){

  selected()
    .forEach(
      function(method){

        const sf =
          methodResult(
            method,
            false
          );

        const gf =
          methodResult(
            method,
            true
          );

        const factor =
          heatFactor(method);

        for(
          let i = 1;
          i <= count(method);
          i++
        ){

          const ac =
            typeFor(
              'ac',
              i
            );

          const heat =
            typeFor(
              'heat',
              i
            );

          const acS =
            (
              sf.controller ===
                'cooling' ||
              sf.controller ===
                'both'
            )
              ? total(
                  method,
                  ac
                )
              : 0;

          const acG =
            (
              gf.controller ===
                'cooling' ||
              gf.controller ===
                'both'
            )
              ? remaining(
                  method,
                  ac
                )
              : 0;

          const hS =
            (
              sf.controller ===
                'heating' ||
              sf.controller ===
                'both'
            )
              ? total(
                  method,
                  heat
                ) *
                factor
              : 0;

          const hG =
            (
              gf.controller ===
                'heating' ||
              gf.controller ===
                'both'
            )
              ? remaining(
                  method,
                  heat
                ) *
                factor
              : 0;

          set(
            '[data-v522-output="' +
            key(
              method,
              ac
            ) +
            '_service"]',
            fmt(acS)
          );

          set(
            '[data-v522-output="' +
            key(
              method,
              ac
            ) +
            '_generator"]',
            fmt(acG)
          );

          set(
            '[data-v522-output="' +
            key(
              method,
              heat
            ) +
            '_service"]',
            fmt(hS)
          );

          set(
            '[data-v522-output="' +
            key(
              method,
              heat
            ) +
            '_generator"]',
            fmt(hG)
          );

          if(
            method ===
            'separate40'
          ){

            set(
              '[data-v522-forty="' +
              i +
              '_service"]',
              heatQty(method) >= 4
                ? fmt(
                    total(
                      method,
                      heat
                    ) *
                    .40
                  )
                : ''
            );

            set(
              '[data-v522-forty="' +
              i +
              '_generator"]',
              heatQty(method) >= 4
                ? fmt(
                    remaining(
                      method,
                      heat
                    ) *
                    .40
                  )
                : ''
            );

            set(
              '[data-v522-forty-note="' +
              i +
              '"]',
              heatQty(method) >= 4
                ? 'Calculated automatically'
                : '65% applied — fewer than 4 total heating units'
            );
          }
        }

        if(
          method ===
          'separate40'
        ){

          const c =
            aggregate(
              method,
              'ac',
              false
            );

          const h =
            aggregate(
              method,
              'heat',
              false
            ) *
            factor;

          const used =
            Math.max(
              c,
              h
            );

          set(
            '[data-v522-compare="qty"]',
            String(
              heatQty(method)
            )
          );

          set(
            '[data-v522-compare="cooling"]',
            fmt(c)
          );

          set(
            '[data-v522-compare="heating-used"]',
            fmt(h)
          );

          const label =
            document.querySelector(
              '[data-v522-heat-label]'
            );

          if(label){

            label.textContent =
              heatQty(method) >= 4
                ? 'Heating at 40%'
                : 'Heating at 65%';
          }

          set(
            '[data-v522-compare="used"]',
            fmt(used) +
            (
              h > c
                ? ' — Heating'
                : ' — Cooling'
            )
          );
        }
      }
    );
}

window.hvacLoadCalculation =
  function(){

    let service = 0;

    let generator = 0;

    let serviceAC = 0;

    let generatorAC = 0;

    let serviceHeating = 0;

    let generatorHeating = 0;

    selected()
      .forEach(
        function(method){

          const s =
            methodResult(
              method,
              false
            );

          const g =
            methodResult(
              method,
              true
            );

          service +=
            s.total;

          generator +=
            g.total;

          serviceAC +=
            s.c;

          serviceHeating +=
            s.h;

          generatorAC +=
            g.c;

          generatorHeating +=
            g.h;
        }
      );

    setOutput(
      'e37',
      serviceAC
    );

    setOutput(
      'e38',
      serviceHeating
    );

    setOutput('e39',0);
    setOutput('e40',0);
    setOutput('e41',0);

    setOutput(
      'f37',
      generatorAC
    );

    setOutput(
      'f38',
      generatorHeating
    );

    setOutput('f39',0);
    setOutput('f40',0);
    setOutput('f41',0);

    updateSectionOutputs();

    return {
      service:service,
      generator:generator,
      serviceAC:serviceAC,
      generatorAC:generatorAC,
      serviceHeating:
        serviceHeating,
      generatorHeating:
        generatorHeating,
      method:
        selected().join(','),
      multipleHeatTypes:
        selected().length > 1
    };
  };

window.validateHVACMethodSelection =
  function(){

    const sel =
      selected();

    const hpReady =
      !sel.includes(
        'heatpump'
      ) ||
      !!hpAnswer();

    return {
      valid:
        sel.length > 0 &&
        hpReady,

      method:
        sel.join(','),

      methodSelected:
        sel.length > 0,

      heatPumpReady:
        hpReady,

      fortyPercentReady:
        true,

      heatingUnitCount:
        heatQty(
          'separate40'
        )
    };
  };

window.getHVACMethodSummary =
  function(){

    const names = {

      central65:
        'Central electric heat at 65%',

      separate40:
        (
          heatQty(
            'separate40'
          ) >= 4
            ? 'Separately controlled electric heat at 40%'
            : 'Separately controlled electric heat at 65% — fewer than four units'
        ),

      heatpump:
        'Heat pump with supplemental electric heat'
    };

    const sel =
      selected();

    return sel.length
      ? (
          'Heating method: ' +
          sel
            .map(
              m => names[m]
            )
            .join(' + ')
        )
      : 'Not selected';
  };

window.getCompleteManagedLoadCount =
  function(){

    let n = 0;

    BASE_MANAGED_ROWS
      .forEach(
        function(r){

          const q =
            typeof positiveQuantity ===
            'function'
              ? positiveQuantity(
                  'q' + r
                )
              : 0;

          if(
            q > 0 &&
            typeof managedQuantity ===
              'function'
          ){

            n += Math.min(
              q,
              managedQuantity(r)
            );
          }
        }
      );

    const m =
      managed();

    selected()
      .forEach(
        function(method){

          for(
            let i = 1;
            i <= count(method);
            i++
          ){

            n += managedQty(
              method,
              typeFor(
                'ac',
                i
              )
            );

            n += managedQty(
              method,
              typeFor(
                'heat',
                i
              )
            );
          }
        }
      );

    return n;
  };

window.applicableManagedLoadCount =
  window.getCompleteManagedLoadCount;

function printRow(
  label,
  q,
  s,
  g
){

  if(
    s <= 0 &&
    g <= 0
  ){
    return '';
  }

  return (
    '<tr>' +
    '<td>' +
    escapeHTML(label) +
    '</td>' +
    '<td class="quantity">' +
    (q || '') +
    '</td>' +
    '<td class="number">' +
    fmt(s) +
    '</td>' +
    '<td class="number">' +
    fmt(g) +
    '</td>' +
    '</tr>'
  );
}

function buildPrintHVAC(){

  let html = '';

  selected()
    .forEach(
      function(method){

        const sr =
          methodResult(
            method,
            false
          );

        const gr =
          methodResult(
            method,
            true
          );

        const factor =
          heatFactor(method);

        for(
          let i = 1;
          i <= count(method);
          i++
        ){

          const ac =
            typeFor(
              'ac',
              i
            );

          const heat =
            typeFor(
              'heat',
              i
            );

          if(
            sr.controller ===
              'cooling' ||
            sr.controller ===
              'both' ||
            gr.controller ===
              'cooling' ||
            gr.controller ===
              'both'
          ){

            html +=
              printRow(
                method ===
                  'heatpump'
                  ? (
                      'Heat Pump Compressor ' +
                      i
                    )
                  : (
                      'Air Conditioning Unit ' +
                      i
                    ),

                qty(
                  method,
                  ac
                ),

                (
                  sr.controller ===
                    'cooling' ||
                  sr.controller ===
                    'both'
                )
                  ? total(
                      method,
                      ac
                    )
                  : 0,

                (
                  gr.controller ===
                    'cooling' ||
                  gr.controller ===
                    'both'
                )
                  ? remaining(
                      method,
                      ac
                    )
                  : 0
              );
          }

          if(
            sr.controller ===
              'heating' ||
            sr.controller ===
              'both' ||
            gr.controller ===
              'heating' ||
            gr.controller ===
              'both'
          ){

            html +=
              printRow(
                (
                  method ===
                    'heatpump'
                    ? 'Supplemental Electric Heat '
                    : (
                        method ===
                          'central65'
                          ? 'Central Electric Heat '
                          : 'Separately Controlled Electric Heat '
                      )
                ) +
                i +
                ' at ' +
                Math.round(
                  factor * 100
                ) +
                '%',

                qty(
                  method,
                  heat
                ),

                (
                  sr.controller ===
                    'heating' ||
                  sr.controller ===
                    'both'
                )
                  ? total(
                      method,
                      heat
                    ) *
                    factor
                  : 0,

                (
                  gr.controller ===
                    'heating' ||
                  gr.controller ===
                    'both'
                )
                  ? remaining(
                      method,
                      heat
                    ) *
                    factor
                  : 0
              );
          }
        }
      }
    );

  return html;
}

const priorPrint =
  window.updatePrintRows;

window.updatePrintRows =
  function(d){

    priorPrint(d);

    d.managedLoadCount =
      window
        .getCompleteManagedLoadCount();

    const report =
      document.getElementById(
        'printReport'
      );

    if(!report){
      return;
    }

    const summary =
      report.querySelector(
        '.print-method-details'
      );

    if(summary){

      const parts =
        summary.querySelectorAll(
          '.summary-item span'
        );

      if(parts[1]){

        parts[1].textContent =
          String(
            d.managedLoadCount
          );
      }
    }

    const table =
      report.querySelector(
        '.print-table'
      );

    const tfoot =
      table &&
      table.querySelector(
        'tfoot'
      );

    if(tfoot){

      const rows =
        Array.from(
          tfoot.children
        );

      const start =
        rows.findIndex(
          r =>
            r.classList.contains(
              'print-section-row'
            ) &&
            r.textContent.trim() ===
              'HVAC Load'
        );

      if(start >= 0){

        let end =
          start + 1;

        while(
          end < rows.length &&
          !rows[end]
            .classList.contains(
              'print-section-row'
            ) &&
          !rows[end]
            .classList.contains(
              'final-total-row'
            )
        ){
          end++;
        }

        for(
          let i = end - 1;
          i > start;
          i--
        ){
          rows[i].remove();
        }

        const hv =
          buildPrintHVAC();

        if(hv){

          rows[start]
            .insertAdjacentHTML(
              'afterend',
              hv
            );

        }else{

          rows[start].remove();
        }
      }
    }

    let note =
      report.querySelector(
        '.v534-print-advisory'
      );

    const incomplete =
      numberValue('q5') <= 0 ||
      positiveQuantity('q6') < 2 ||
      positiveQuantity('q7') < 1;

    if(incomplete){

      if(!note){

        note =
          document.createElement(
            'div'
          );

        note.className =
          'v534-print-advisory';

        const code =
          report.querySelector(
            '.print-code-note'
          );

        if(code){

          code.parentNode
            .insertBefore(
              note,
              code
            );

        }else{

          report.appendChild(
            note
          );
        }
      }

      note.textContent =
        'Note: General dwelling load information is incomplete. Verify dwelling square footage, required small-appliance circuits, and laundry circuit before using this report as a complete NEC 2023 Optional Method dwelling load calculation.';

    }else if(note){

      note.remove();
    }

    syncBottom(d);
  };

function syncBottom(d){

  const sa =
    document.getElementById(
      'serviceAmpsView'
    );

  const ga =
    document.getElementById(
      'generatorAmpsView'
    );

  const sv =
    document.getElementById(
      'serviceTotalVAView'
    );

  const gv =
    document.getElementById(
      'generatorTotalVAView'
    );

  const mc =
    document.getElementById(
      'bottomManagedLoadCount'
    );

  if(sa){
    sa.textContent =
      Math.ceil(
        d.serviceCurrent
      ) +
      ' A';
  }

  if(ga){
    ga.textContent =
      Math.ceil(
        d.generatorCurrent
      ) +
      ' A';
  }

  if(sv){

    sv.textContent =
      fmt(
        d.serviceTotalVA
      ) || '0';
  }

  if(gv){

    gv.textContent =
      fmt(
        d.generatorTotalVA
      ) || '0';
  }

  if(mc){

    mc.textContent =
      String(
        window
          .getCompleteManagedLoadCount()
      );
  }
}

function init(){

  const v =
    document.querySelector(
      '.app-version'
    );

  if(v){

    v.textContent =
      'NEC 2023 | Version 2.0 — V5.41 Auto Save Restore Fixed';
  }

  document.addEventListener(
    'input',
    function(){

      setTimeout(
        updateSectionOutputs,
        0
      );
    }
  );

  setTimeout(
    function(){

      if(
        !restorePromptOpen
      ){
        calculate();
      }
    },
    180
  );
}

if(
  document.readyState ===
  'loading'
){

  document.addEventListener(
    'DOMContentLoaded',
    init
  );

}else{

  init();
}

})();
(function(){

'use strict';

const METHODS_KEY =
  'loadcalcpro_hvac_selected_methods_v1';

const HP_KEY =
  'loadcalcpro_hvac_multi_hp_answer_v1';

const DATA_KEY =
  'loadcalcpro_hvac_method_sections_v57';

const MANAGED_KEY =
  'loadcalcpro_hvac_method_managed_v57';

const COUNT_KEY =
  'loadcalcpro_hvac_visible_system_counts_v522';

const BASE_MANAGED_ROWS = [
  10,11,12,13,14,15,16,17,18,19,
  20,21,22,23,24,25,26,27,28,29,
  30,42,43,47
];

const VALID = {
  central65:true,
  separate40:true,
  heatpump:true
};

function readJSON(
  k,
  f
){

  try{

    const v =
      JSON.parse(
        localStorage.getItem(k) ||
        ''
      );

    return (
      v &&
      typeof v === 'object'
    )
      ? v
      : f;

  }catch(e){

    return f;
  }
}

function writeJSON(
  k,
  v
){

  try{

    localStorage.setItem(
      k,
      JSON.stringify(v)
    );

  }catch(e){}
}

function selected(){

  const a =
    readJSON(
      METHODS_KEY,
      []
    );

  return Array.isArray(a)
    ? a.filter(
        m => VALID[m]
      )
    : [];
}

function hpAnswer(){

  return (
    localStorage.getItem(
      HP_KEY
    ) || ''
  );
}

function dataset(){

  return readJSON(
    DATA_KEY,
    {}
  );
}

function managedMap(){

  return readJSON(
    MANAGED_KEY,
    {}
  );
}

function counts(){

  return readJSON(
    COUNT_KEY,
    {}
  );
}

function typeFor(
  kind,
  index
){

  return (
    kind +
    (
      index === 1
        ? ''
        : index
    )
  );
}

function key(
  method,
  type
){

  return (
    method +
    '_' +
    type
  );
}

function count(method){

  const n =
    Math.floor(
      Number(
        counts()[method]
      ) || 1
    );

  return Math.max(
    1,
    Math.min(
      3,
      n
    )
  );
}

function item(
  method,
  type
){

  return (
    dataset()[
      key(
        method,
        type
      )
    ] || {}
  );
}

function qty(
  method,
  type
){

  return Math.max(
    0,
    Math.floor(
      Number(
        item(
          method,
          type
        ).qty
      ) || 0
    )
  );
}

function va(
  method,
  type
){

  return Math.max(
    0,
    Number(
      item(
        method,
        type
      ).va
    ) || 0
  );
}

function total(
  method,
  type
){

  return (
    qty(
      method,
      type
    ) *
    va(
      method,
      type
    )
  );
}

function managedQty(
  method,
  type
){

  const q =
    qty(
      method,
      type
    );

  const raw =
    managedMap()[
      key(
        method,
        type
      )
    ];

  let n =
    raw === true
      ? q
      : Math.floor(
          Number(raw) || 0
        );

  return Math.max(
    0,
    Math.min(
      q,
      n
    )
  );
}

function remaining(
  method,
  type
){

  return (
    Math.max(
      qty(
        method,
        type
      ) -
      managedQty(
        method,
        type
      ),
      0
    ) *
    va(
      method,
      type
    )
  );
}

function aggregate(
  method,
  kind,
  generator
){

  let n = 0;

  for(
    let i = 1;
    i <= count(method);
    i++
  ){

    n += (
      generator
        ? remaining
        : total
    )(
      method,
      typeFor(
        kind,
        i
      )
    );
  }

  return n;
}

function heatQty(method){

  let n = 0;

  for(
    let i = 1;
    i <= count(method);
    i++
  ){

    n += qty(
      method,
      typeFor(
        'heat',
        i
      )
    );
  }

  return n;
}

function heatFactor(method){

  return (
    method ===
    'separate40'
  )
    ? (
        heatQty(method) >= 4
          ? .40
          : .65
      )
    : .65;
}

function serviceController(method){

  const c =
    aggregate(
      method,
      'ac',
      false
    );

  const h =
    aggregate(
      method,
      'heat',
      false
    ) *
    heatFactor(method);

  if(
    method ===
      'heatpump' &&
    hpAnswer() ===
      'yes'
  ){
    return 'both';
  }

  if(
    method ===
      'heatpump' &&
    !hpAnswer()
  ){
    return '';
  }

  return c >= h
    ? 'cooling'
    : 'heating';
}

function methodResult(
  method,
  generator
){

  const controller =
    serviceController(
      method
    );

  const factor =
    heatFactor(method);

  const c =
    aggregate(
      method,
      'ac',
      generator
    );

  const h =
    aggregate(
      method,
      'heat',
      generator
    ) *
    factor;

  if(
    controller ===
    'both'
  ){

    return {
      total:c + h,
      c:c,
      h:h,
      controller:controller
    };
  }

  if(
    controller ===
    'cooling'
  ){

    return {
      total:c,
      c:c,
      h:0,
      controller:controller
    };
  }

  if(
    controller ===
    'heating'
  ){

    return {
      total:h,
      c:0,
      h:h,
      controller:controller
    };
  }

  return {
    total:0,
    c:0,
    h:0,
    controller:''
  };
}

function isActive(
  method,
  type
){

  const c =
    serviceController(
      method
    );

  return (
    c === 'both' ||
    (
      c === 'cooling' &&
      type.indexOf('ac') === 0
    ) ||
    (
      c === 'heating' &&
      type.indexOf('heat') === 0
    )
  );
}

function comparisonReady(
  method
){

  const cooling =
    aggregate(
      method,
      'ac',
      false
    );

  const heating =
    aggregate(
      method,
      'heat',
      false
    );

  if(
    method ===
      'heatpump' &&
    hpAnswer() ===
      'yes'
  ){
    return (
      cooling > 0 ||
      heating > 0
    );
  }

  return (
    cooling > 0 &&
    heating > 0
  );
}

function clearInactiveManaged(){

  const m =
    managedMap();

  let changed = false;

  selected()
    .forEach(method=>{

      if(
        !comparisonReady(
          method
        )
      ){
        return;
      }

      for(
        let i = 1;
        i <= count(method);
        i++
      ){

        for(
          const kind of [
            'ac',
            'heat'
          ]
        ){

          const t =
            typeFor(
              kind,
              i
            );

          const k =
            key(
              method,
              t
            );

          if(
            !isActive(
              method,
              t
            ) &&
            m[k]
          ){

            m[k] = 0;

            changed = true;
          }
        }
      }
    });

  if(changed){

    writeJSON(
      MANAGED_KEY,
      m
    );
  }

  return changed;
}

function fmt(n){

  return n
    ? Math.round(n)
        .toLocaleString(
          'en-US'
        )
    : '';
}

function setText(
  sel,
  v
){

  const e =
    document.querySelector(
      sel
    );

  if(e){
    e.textContent = v;
  }
}

function syncManagedUI(){

  clearInactiveManaged();

  document
    .querySelectorAll(
      '[data-v522-managed]'
    )
    .forEach(btn=>{

      const k =
        btn.dataset
          .v522Managed || '';

      const p =
        k.split('_');

      const method =
        p.shift();

      const type =
        p.join('_');

      const hasLoad =
        qty(
          method,
          type
        ) > 0 &&
        va(
          method,
          type
        ) > 0;

      const compared =
        !!VALID[method] &&
        comparisonReady(
          method
        );

      const controlling =
        !compared ||
        isActive(
          method,
          type
        );

      const usable =
        hasLoad &&
        controlling;

      const controls =
        btn.closest(
          '.v57-method-managed'
        );

      if(controls){

        controls.classList.toggle(
          'v539-hide-noncontrolling-managed',
          compared &&
          !controlling
        );

        controls.setAttribute(
          'aria-hidden',
          compared &&
          !controlling
            ? 'true'
            : 'false'
        );
      }

      btn.disabled =
        !usable;

      btn.classList.toggle(
        'v535-managed-inactive',
        !usable
      );

      btn.setAttribute(
        'aria-disabled',
        usable
          ? 'false'
          : 'true'
      );

      const row =
        btn.closest(
          '.v57-method-row'
        );

      if(row){

        row.classList.remove(
          'v535-noncontrolling-row'
        );
      }

      const qb =
        document.querySelector(
          '[data-v522-managed-qty="' +
          k +
          '"]'
        );

      if(qb){

        qb.disabled =
          !usable;

        qb.classList.toggle(
          'v535-managed-inactive',
          !usable
        );
      }
    });
}

function updateOutputs(){

  selected()
    .forEach(method=>{

      const s =
        methodResult(
          method,
          false
        );

      const g =
        methodResult(
          method,
          true
        );

      const factor =
        heatFactor(method);

      for(
        let i = 1;
        i <= count(method);
        i++
      ){

        const ac =
          typeFor(
            'ac',
            i
          );

        const heat =
          typeFor(
            'heat',
            i
          );

        const activeAC =
          s.controller ===
            'cooling' ||
          s.controller ===
            'both';

        const activeHeat =
          s.controller ===
            'heating' ||
          s.controller ===
            'both';

        setText(
          '[data-v522-output="' +
          key(
            method,
            ac
          ) +
          '_service"]',
          fmt(
            activeAC
              ? total(
                  method,
                  ac
                )
              : 0
          )
        );

        setText(
          '[data-v522-output="' +
          key(
            method,
            ac
          ) +
          '_generator"]',
          fmt(
            activeAC
              ? remaining(
                  method,
                  ac
                )
              : 0
          )
        );

        setText(
          '[data-v522-output="' +
          key(
            method,
            heat
          ) +
          '_service"]',
          fmt(
            activeHeat
              ? total(
                  method,
                  heat
                ) *
                factor
              : 0
          )
        );

        setText(
          '[data-v522-output="' +
          key(
            method,
            heat
          ) +
          '_generator"]',
          fmt(
            activeHeat
              ? remaining(
                  method,
                  heat
                ) *
                factor
              : 0
          )
        );

        if(
          method ===
          'separate40'
        ){

          setText(
            '[data-v522-forty="' +
            i +
            '_service"]',
            heatQty(method) >= 4
              ? fmt(
                  total(
                    method,
                    heat
                  ) *
                  .40
                )
              : ''
          );

          setText(
            '[data-v522-forty="' +
            i +
            '_generator"]',
            heatQty(method) >= 4 &&
            activeHeat
              ? fmt(
                  remaining(
                    method,
                    heat
                  ) *
                  .40
                )
              : ''
          );

          setText(
            '[data-v522-forty-note="' +
            i +
            '"]',
            heatQty(method) >= 4
              ? 'Calculated automatically'
              : '65% applied — fewer than 4 total heating units'
          );
        }
      }

      if(
        method ===
        'separate40'
      ){

        const c =
          aggregate(
            method,
            'ac',
            false
          );

        const h =
          aggregate(
            method,
            'heat',
            false
          ) *
          factor;

        const used =
          Math.max(
            c,
            h
          );

        setText(
          '[data-v522-compare="qty"]',
          String(
            heatQty(method)
          )
        );

        setText(
          '[data-v522-compare="cooling"]',
          fmt(c)
        );

        setText(
          '[data-v522-compare="heating-used"]',
          fmt(h)
        );

        const label =
          document.querySelector(
            '[data-v522-heat-label]'
          );

        if(label){

          label.textContent =
            heatQty(method) >= 4
              ? 'Heating at 40%'
              : 'Heating at 65%';
        }

        setText(
          '[data-v522-compare="used"]',
          fmt(used) +
          (
            h > c
              ? ' — Heating'
              : ' — Cooling'
          )
        );
      }
    });

  syncManagedUI();
}

window.hvacLoadCalculation =
  function(){

    clearInactiveManaged();

    let service = 0;

    let generator = 0;

    let serviceAC = 0;

    let generatorAC = 0;

    let serviceHeating = 0;

    let generatorHeating = 0;

    selected()
      .forEach(method=>{

        const s =
          methodResult(
            method,
            false
          );

        const g =
          methodResult(
            method,
            true
          );

        service += s.total;

        generator += g.total;

        serviceAC += s.c;

        serviceHeating += s.h;

        generatorAC += g.c;

        generatorHeating += g.h;
      });

    setOutput(
      'e37',
      serviceAC
    );

    setOutput(
      'e38',
      serviceHeating
    );

    setOutput('e39',0);
    setOutput('e40',0);
    setOutput('e41',0);

    setOutput(
      'f37',
      generatorAC
    );

    setOutput(
      'f38',
      generatorHeating
    );

    setOutput('f39',0);
    setOutput('f40',0);
    setOutput('f41',0);

    updateOutputs();

    return {
      service,
      generator,
      serviceAC,
      generatorAC,
      serviceHeating,
      generatorHeating,
      method:
        selected().join(','),
      multipleHeatTypes:
        selected().length > 1
    };
  };

window.getCompleteManagedLoadCount =
  function(){

    let n = 0;

    BASE_MANAGED_ROWS
      .forEach(r=>{

        const q =
          typeof positiveQuantity ===
            'function'
            ? positiveQuantity(
                'q' + r
              )
            : 0;

        if(
          q > 0 &&
          typeof managedQuantity ===
            'function'
        ){

          n += Math.min(
            q,
            managedQuantity(r)
          );
        }
      });

    selected()
      .forEach(method=>{

        for(
          let i = 1;
          i <= count(method);
          i++
        ){

          for(
            const kind of [
              'ac',
              'heat'
            ]
          ){

            const t =
              typeFor(
                kind,
                i
              );

            if(
              isActive(
                method,
                t
              )
            ){

              n += managedQty(
                method,
                t
              );
            }
          }
        }
      });

    return n;
  };

window.applicableManagedLoadCount =
  window.getCompleteManagedLoadCount;

function escape(s){

  return String(s)
    .replace(
      /[&<>"']/g,
      ch => ({
        '&':'&amp;',
        '<':'&lt;',
        '>':'&gt;',
        '"':'&quot;',
        "'":'&#39;'
      }[ch])
    );
}

function printRow(
  label,
  q,
  s,
  g
){

  if(
    s <= 0 &&
    g <= 0
  ){
    return '';
  }

  return (
    '<tr>' +
    '<td>' +
    escape(label) +
    '</td>' +
    '<td class="quantity">' +
    (q || '') +
    '</td>' +
    '<td class="number">' +
    fmt(s) +
    '</td>' +
    '<td class="number">' +
    fmt(g) +
    '</td>' +
    '</tr>'
  );
}

function buildPrintHVAC(){

  let html = '';

  selected()
    .forEach(method=>{

      const sr =
        methodResult(
          method,
          false
        );

      const factor =
        heatFactor(method);

      for(
        let i = 1;
        i <= count(method);
        i++
      ){

        const ac =
          typeFor(
            'ac',
            i
          );

        const heat =
          typeFor(
            'heat',
            i
          );

        if(
          sr.controller ===
            'cooling' ||
          sr.controller ===
            'both'
        ){

          html +=
            printRow(
              method ===
                'heatpump'
                ? (
                    'Heat Pump Compressor ' +
                    i
                  )
                : (
                    'Air Conditioning Unit ' +
                    i
                  ),

              qty(
                method,
                ac
              ),

              total(
                method,
                ac
              ),

              remaining(
                method,
                ac
              )
            );
        }

        if(
          sr.controller ===
            'heating' ||
          sr.controller ===
            'both'
        ){

          html +=
            printRow(
              (
                method ===
                  'heatpump'
                  ? 'Supplemental Electric Heat '
                  : (
                      method ===
                        'central65'
                        ? 'Central Electric Heat '
                        : 'Separately Controlled Electric Heat '
                    )
              ) +
              i +
              ' at ' +
              Math.round(
                factor * 100
              ) +
              '%',

              qty(
                method,
                heat
              ),

              total(
                method,
                heat
              ) *
              factor,

              remaining(
                method,
                heat
              ) *
              factor
            );
        }
      }
    });

  return html;
}

const priorPrint =
  window.updatePrintRows;

window.updatePrintRows =
  function(d){

    priorPrint(d);

    d.managedLoadCount =
      window
        .getCompleteManagedLoadCount();

    const report =
      document.getElementById(
        'printReport'
      );

    if(!report){
      return;
    }

    const summary =
      report.querySelector(
        '.print-method-details'
      );

    if(summary){

      const p =
        summary.querySelectorAll(
          '.summary-item span'
        );

      if(p[1]){

        p[1].textContent =
          String(
            d.managedLoadCount
          );
      }
    }

    const table =
      report.querySelector(
        '.print-table'
      );

    const tfoot =
      table &&
      table.querySelector(
        'tfoot'
      );

    if(tfoot){

      const rows =
        Array.from(
          tfoot.children
        );

      const start =
        rows.findIndex(
          r =>
            r.classList.contains(
              'print-section-row'
            ) &&
            r.textContent.trim() ===
              'HVAC Load'
        );

      if(start >= 0){

        let end =
          start + 1;

        while(
          end < rows.length &&
          !rows[end]
            .classList.contains(
              'print-section-row'
            ) &&
          !rows[end]
            .classList.contains(
              'final-total-row'
            )
        ){
          end++;
        }

        for(
          let i = end - 1;
          i > start;
          i--
        ){
          rows[i].remove();
        }

        const hv =
          buildPrintHVAC();

        if(hv){

          rows[start]
            .insertAdjacentHTML(
              'afterend',
              hv
            );

        }else{

          rows[start].remove();
        }
      }
    }

    const mc =
      document.getElementById(
        'bottomManagedLoadCount'
      );

    if(mc){

      mc.textContent =
        String(
          d.managedLoadCount
        );
    }

    syncManagedUI();
  };

function refresh(){

  clearInactiveManaged();

  updateOutputs();

  if(
    typeof calculate ===
    'function'
  ){
    calculate();
  }
}

const observer =
  new MutationObserver(
    () =>
      setTimeout(
        syncManagedUI,
        0
      )
  );

function init(){

  const v =
    document.querySelector(
      '.app-version'
    );

  if(v){

    v.textContent =
      'NEC 2023 | Version 2.0 — V5.41 Auto Save Restore Fixed';
  }

  const c =
    document.getElementById(
      'v57HvacMethodSections'
    );

  if(c){

    observer.observe(
      c,
      {
        childList:true,
        subtree:true
      }
    );
  }

  document.addEventListener(
    'input',
    () =>
      setTimeout(
        syncManagedUI,
        0
      )
  );

  document.addEventListener(
    'click',
    () =>
      setTimeout(
        syncManagedUI,
        20
      ),
    true
  );

  setTimeout(
    refresh,
    220
  );
}

if(
  document.readyState ===
  'loading'
){

  document.addEventListener(
    'DOMContentLoaded',
    init
  );

}else{

  init();
}

})();
(function(){

'use strict';

const METHODS_KEY =
  'loadcalcpro_hvac_selected_methods_v1';

const LEGACY_HP_KEY =
  'loadcalcpro_hvac_multi_hp_answer_v1';

const HP_SYSTEM_KEY =
  'loadcalcpro_hvac_heatpump_answers_v543';

const DATA_KEY =
  'loadcalcpro_hvac_method_sections_v57';

const MANAGED_KEY =
  'loadcalcpro_hvac_method_managed_v57';

const COUNT_KEY =
  'loadcalcpro_hvac_visible_system_counts_v522';

const BASE_MANAGED_ROWS = [
  10,11,12,13,14,15,16,17,18,19,
  20,21,22,23,24,25,26,27,28,29,
  30,42,43,47
];

const VALID = {
  central65:true,
  separate40:true,
  heatpump:true
};

function readJSON(
  k,
  f
){

  try{

    const v =
      JSON.parse(
        localStorage.getItem(k) ||
        ''
      );

    return (
      v &&
      typeof v === 'object'
    )
      ? v
      : f;

  }catch(e){

    return f;
  }
}

function writeJSON(
  k,
  v
){

  try{

    localStorage.setItem(
      k,
      JSON.stringify(v)
    );

  }catch(e){}
}

function selected(){

  const a =
    readJSON(
      METHODS_KEY,
      []
    );

  return Array.isArray(a)
    ? a.filter(
        m => VALID[m]
      )
    : [];
}

function dataset(){

  return readJSON(
    DATA_KEY,
    {}
  );
}

function managedMap(){

  return readJSON(
    MANAGED_KEY,
    {}
  );
}

function counts(){

  return readJSON(
    COUNT_KEY,
    {}
  );
}

function count(method){

  const n =
    Math.floor(
      Number(
        counts()[method]
      ) || 1
    );

  return Math.max(
    1,
    Math.min(
      3,
      n
    )
  );
}

function typeFor(
  kind,
  index
){

  return (
    kind +
    (
      index === 1
        ? ''
        : index
    )
  );
}

function key(
  method,
  type
){

  return (
    method +
    '_' +
    type
  );
}

function item(
  method,
  type
){

  return (
    dataset()[
      key(
        method,
        type
      )
    ] || {}
  );
}

function qty(
  method,
  type
){

  return Math.max(
    0,
    Math.floor(
      Number(
        item(
          method,
          type
        ).qty
      ) || 0
    )
  );
}

function va(
  method,
  type
){

  return Math.max(
    0,
    Number(
      item(
        method,
        type
      ).va
    ) || 0
  );
}

function total(
  method,
  type
){

  return (
    qty(
      method,
      type
    ) *
    va(
      method,
      type
    )
  );
}

function managedQty(
  method,
  type
){

  const q =
    qty(
      method,
      type
    );

  const raw =
    managedMap()[
      key(
        method,
        type
      )
    ];

  let n =
    raw === true
      ? q
      : Math.floor(
          Number(raw) || 0
        );

  return Math.max(
    0,
    Math.min(
      q,
      n
    )
  );
}

function remaining(
  method,
  type
){

  return (
    Math.max(
      qty(
        method,
        type
      ) -
      managedQty(
        method,
        type
      ),
      0
    ) *
    va(
      method,
      type
    )
  );
}

function aggregate(
  method,
  kind,
  generator
){

  let n = 0;

  for(
    let i = 1;
    i <= count(method);
    i++
  ){

    n += (
      generator
        ? remaining
        : total
    )(
      method,
      typeFor(
        kind,
        i
      )
    );
  }

  return n;
}

function heatQty(method){

  let n = 0;

  for(
    let i = 1;
    i <= count(method);
    i++
  ){

    n += qty(
      method,
      typeFor(
        'heat',
        i
      )
    );
  }

  return n;
}

function heatFactor(method){

  return (
    method ===
    'separate40'
  )
    ? (
        heatQty(method) >= 4
          ? .40
          : .65
      )
    : .65;
}

function hpAnswers(){

  return readJSON(
    HP_SYSTEM_KEY,
    {}
  );
}

function saveHpAnswers(v){

  writeJSON(
    HP_SYSTEM_KEY,
    v
  );
}

function hpAnswer(index){

  const a =
    hpAnswers();

  return (
    a[
      String(index)
    ] || ''
  );
}

function migrateLegacyAnswer(){

  const a =
    hpAnswers();

  if(
    Object.keys(a).length
  ){
    return;
  }

  const old =
    localStorage.getItem(
      LEGACY_HP_KEY
    ) || '';

  if(
    old === 'yes' ||
    old === 'no'
  ){

    const next = {};

    for(
      let i = 1;
      i <= count(
        'heatpump'
      );
      i++
    ){

      next[
        String(i)
      ] = old;
    }

    saveHpAnswers(
      next
    );
  }
}

function trimHpAnswers(){

  const a =
    hpAnswers();

  const max =
    count(
      'heatpump'
    );

  let changed = false;

  Object.keys(a)
    .forEach(k=>{

      if(
        Number(k) >
        max
      ){

        delete a[k];

        changed = true;
      }
    });

  if(changed){

    saveHpAnswers(a);
  }
}

function keepLegacyCompatibility(){

  /*
    Older scripts still read one
    heat-pump answer.

    Keep them permissive so they
    cannot clear managed selections
    before the final V5.43 logic runs.
  */

  if(
    selected()
      .includes(
        'heatpump'
      )
  ){

    try{

      localStorage.setItem(
        LEGACY_HP_KEY,
        'yes'
      );

    }catch(e){}
  }
}

function fmt(n){

  return n
    ? Math.round(n)
        .toLocaleString(
          'en-US'
        )
    : '';
}

function setText(
  sel,
  v
){

  const e =
    document.querySelector(
      sel
    );

  if(e){
    e.textContent = v;
  }
}

function normalMethodResult(
  method,
  generator
){

  const factor =
    heatFactor(method);

  const c =
    aggregate(
      method,
      'ac',
      generator
    );

  const h =
    aggregate(
      method,
      'heat',
      generator
    ) *
    factor;

  return c >= h
    ? {
        total:c,
        c:c,
        h:0,
        controller:'cooling'
      }
    : {
        total:h,
        c:0,
        h:h,
        controller:'heating'
      };
}

function heatPumpSystemResult(
  index,
  generator
){

  const ac =
    typeFor(
      'ac',
      index
    );

  const heat =
    typeFor(
      'heat',
      index
    );

  const c =
    (
      generator
        ? remaining
        : total
    )(
      'heatpump',
      ac
    );

  const h =
    (
      generator
        ? remaining
        : total
    )(
      'heatpump',
      heat
    ) * .65;

  const answer =
    hpAnswer(index);

  if(
    answer ===
    'yes'
  ){

    return {
      total:c + h,
      c:c,
      h:h,
      controller:'both',
      answer
    };
  }

  if(
    answer ===
    'no'
  ){

    return (
      total(
        'heatpump',
        ac
      ) >=
      total(
        'heatpump',
        heat
      ) * .65
    )
      ? {
          total:c,
          c:c,
          h:0,
          controller:'cooling',
          answer
        }
      : {
          total:h,
          c:0,
          h:h,
          controller:'heating',
          answer
        };
  }

  return {
    total:0,
    c:0,
    h:0,
    controller:'',
    answer:''
  };
}

function methodResult(
  method,
  generator
){

  if(
    method !==
    'heatpump'
  ){

    return normalMethodResult(
      method,
      generator
    );
  }

  let r = {
    total:0,
    c:0,
    h:0,
    controller:
      'per-system'
  };

  for(
    let i = 1;
    i <= count(
      'heatpump'
    );
    i++
  ){

    const x =
      heatPumpSystemResult(
        i,
        generator
      );

    r.total += x.total;
    r.c += x.c;
    r.h += x.h;
  }

  return r;
}

function controllerFor(
  method,
  index
){

  if(
    method ===
    'heatpump'
  ){

    return heatPumpSystemResult(
      index,
      false
    ).controller;
  }

  return normalMethodResult(
    method,
    false
  ).controller;
}

function comparisonReady(
  method,
  index
){

  if(
    method ===
    'heatpump'
  ){

    const answer =
      hpAnswer(index);

    if(!answer){
      return false;
    }

    if(
      answer ===
      'yes'
    ){

      return (
        total(
          method,
          typeFor(
            'ac',
            index
          )
        ) > 0 ||
        total(
          method,
          typeFor(
            'heat',
            index
          )
        ) > 0
      );
    }

    return (
      total(
        method,
        typeFor(
          'ac',
          index
        )
      ) > 0 &&
      total(
        method,
        typeFor(
          'heat',
          index
        )
      ) > 0
    );
  }

  return (
    aggregate(
      method,
      'ac',
      false
    ) > 0 &&
    aggregate(
      method,
      'heat',
      false
    ) > 0
  );
}

function isActive(
  method,
  type
){

  const m =
    String(type)
      .match(
        /^(ac|heat)(\d*)$/
      );

  if(!m){
    return false;
  }

  const kind =
    m[1];

  const index =
    m[2]
      ? Number(m[2])
      : 1;

  const c =
    controllerFor(
      method,
      index
    );

  return (
    c === 'both' ||
    (
      c ===
        'cooling' &&
      kind ===
        'ac'
    ) ||
    (
      c ===
        'heating' &&
      kind ===
        'heat'
    )
  );
}

function clearInactiveManaged(){

  const m =
    managedMap();

  let changed = false;

  selected()
    .forEach(method=>{

      for(
        let i = 1;
        i <= count(method);
        i++
      ){

        if(
          !comparisonReady(
            method,
            i
          )
        ){
          continue;
        }

        for(
          const kind of [
            'ac',
            'heat'
          ]
        ){

          const t =
            typeFor(
              kind,
              i
            );

          const k =
            key(
              method,
              t
            );

          if(
            !isActive(
              method,
              t
            ) &&
            m[k]
          ){

            m[k] = 0;

            changed = true;
          }
        }
      }
    });

  if(changed){

    writeJSON(
      MANAGED_KEY,
      m
    );
  }
}

function syncManagedUI(){

  clearInactiveManaged();

  document
    .querySelectorAll(
      '[data-v522-managed]'
    )
    .forEach(btn=>{

      const k =
        btn.dataset
          .v522Managed || '';

      const p =
        k.split('_');

      const method =
        p.shift();

      const type =
        p.join('_');

      const mm =
        type.match(
          /^(ac|heat)(\d*)$/
        );

      const index =
        mm &&
        mm[2]
          ? Number(mm[2])
          : 1;

      const hasLoad =
        qty(
          method,
          type
        ) > 0 &&
        va(
          method,
          type
        ) > 0;

      const compared =
        comparisonReady(
          method,
          index
        );

      const controlling =
        !compared ||
        isActive(
          method,
          type
        );

      const answerReady =
        method !==
          'heatpump' ||
        !!hpAnswer(index);

      const usable =
        hasLoad &&
        controlling &&
        answerReady;

      const controls =
        btn.closest(
          '.v57-method-managed'
        );

      if(controls){

        controls.classList.remove(
          'v539-hide-noncontrolling-managed'
        );

        controls.removeAttribute(
          'aria-hidden'
        );
      }

      btn.disabled =
        !usable;

      btn.classList.toggle(
        'v535-managed-inactive',
        !usable
      );

      btn.setAttribute(
        'aria-disabled',
        usable
          ? 'false'
          : 'true'
      );

      const row =
        btn.closest(
          '.v57-method-row'
        );

      if(row){

        row.classList.remove(
          'v535-noncontrolling-row'
        );
      }

      const qb =
        document.querySelector(
          '[data-v522-managed-qty="' +
          k +
          '"]'
        );

      if(qb){

        qb.disabled =
          !usable;

        qb.classList.toggle(
          'v535-managed-inactive',
          !usable
        );
      }
    });
}

function questionHTML(index){

  const a =
    hpAnswer(index);

  return (
    '<div class="v543-hp-question" ' +
    'data-v543-hp-question="' +
    index +
    '">' +

    '<div class="v543-hp-question-title">' +
    'Can the heat-pump compressor and supplemental electric heat operate simultaneously?' +
    '</div>' +

    '<div class="v543-hp-options">' +

    '<button type="button" ' +
    'class="v543-hp-option ' +
    (
      a === 'yes'
        ? 'selected'
        : ''
    ) +
    '" ' +
    'data-v543-hp-index="' +
    index +
    '" ' +
    'data-v543-hp-answer="yes">' +

    '<span class="v543-hp-check">' +
    (
      a === 'yes'
        ? '✓'
        : ''
    ) +
    '</span>' +

    '<span>' +
    'Yes — compressor at 100% plus supplemental heat at 65%' +
    '</span>' +

    '</button>' +

    '<button type="button" ' +
    'class="v543-hp-option ' +
    (
      a === 'no'
        ? 'selected'
        : ''
    ) +
    '" ' +
    'data-v543-hp-index="' +
    index +
    '" ' +
    'data-v543-hp-answer="no">' +

    '<span class="v543-hp-check">' +
    (
      a === 'no'
        ? '✓'
        : ''
    ) +
    '</span>' +

    '<span>' +
    'No — controls lock out the compressor during supplemental heat' +
    '</span>' +

    '</button>' +

    '</div>' +

    '</div>'
  );
}

function patchUI(){

  migrateLegacyAnswer();

  trimHpAnswers();

  keepLegacyCompatibility();

  document
    .querySelectorAll(
      '.v522-add-system'
    )
    .forEach(b=>{

      b.textContent =
        '+ Add HVAC Section';
    });

  const card =
    document.querySelector(
      '[data-v522-card="heatpump"]'
    );

  if(card){

    Array.from(
      card.children
    )
    .forEach(ch=>{

      if(
        ch.classList &&
        ch.classList.contains(
          'v57-hp-question'
        )
      ){
        ch.remove();
      }
    });

    const groups =
      card.querySelectorAll(
        '.v522-system-group'
      );

    groups.forEach(
      (
        g,
        idx
      )=>{

        const i =
          idx + 1;

        let q =
          g.querySelector(
            '.v543-hp-question'
          );

        if(!q){

          g.insertAdjacentHTML(
            'beforeend',
            questionHTML(i)
          );

        }else if(
          q.dataset
            .v543HpQuestion !==
          String(i)
        ){

          q.remove();

          g.insertAdjacentHTML(
            'beforeend',
            questionHTML(i)
          );
        }
      }
    );

    card
      .querySelectorAll(
        '.v543-hp-option'
      )
      .forEach(b=>{

        if(
          b.dataset.v543Bound
        ){
          return;
        }

        b.dataset.v543Bound =
          '1';

        b.addEventListener(
          'click',
          ()=>{

            const i =
              String(
                b.dataset
                  .v543HpIndex
              );

            const v =
              b.dataset
                .v543HpAnswer;

            const a =
              hpAnswers();

            if(
              a[i] === v
            ){

              delete a[i];

            }else{

              a[i] = v;
            }

            saveHpAnswers(a);

            keepLegacyCompatibility();

            patchUI();

            if(
              typeof calculate ===
              'function'
            ){
              calculate();
            }

            setTimeout(
              ()=>{

                updateOutputs();

                syncManagedUI();
              },
              0
            );
          }
        );
      });
  }

  updateOutputs();

  syncManagedUI();
}

function updateOutputs(){

  selected()
    .forEach(method=>{

      const factor =
        heatFactor(method);

      if(
        method ===
        'heatpump'
      ){

        for(
          let i = 1;
          i <= count(method);
          i++
        ){

          const r =
            heatPumpSystemResult(
              i,
              false
            );

          const rg =
            heatPumpSystemResult(
              i,
              true
            );

          const ac =
            typeFor(
              'ac',
              i
            );

          const heat =
            typeFor(
              'heat',
              i
            );

          setText(
            '[data-v522-output="' +
            key(
              method,
              ac
            ) +
            '_service"]',
            fmt(r.c)
          );

          setText(
            '[data-v522-output="' +
            key(
              method,
              ac
            ) +
            '_generator"]',
            fmt(rg.c)
          );

          setText(
            '[data-v522-output="' +
            key(
              method,
              heat
            ) +
            '_service"]',
            fmt(r.h)
          );

          setText(
            '[data-v522-output="' +
            key(
              method,
              heat
            ) +
            '_generator"]',
            fmt(rg.h)
          );
        }

      }else{

        const s =
          normalMethodResult(
            method,
            false
          );

        const g =
          normalMethodResult(
            method,
            true
          );

        const activeAC =
          s.controller ===
          'cooling';

        const activeHeat =
          s.controller ===
          'heating';

        for(
          let i = 1;
          i <= count(method);
          i++
        ){

          const ac =
            typeFor(
              'ac',
              i
            );

          const heat =
            typeFor(
              'heat',
              i
            );

          setText(
            '[data-v522-output="' +
            key(
              method,
              ac
            ) +
            '_service"]',
            fmt(
              activeAC
                ? total(
                    method,
                    ac
                  )
                : 0
            )
          );

          setText(
            '[data-v522-output="' +
            key(
              method,
              ac
            ) +
            '_generator"]',
            fmt(
              activeAC
                ? remaining(
                    method,
                    ac
                  )
                : 0
            )
          );

          setText(
            '[data-v522-output="' +
            key(
              method,
              heat
            ) +
            '_service"]',
            fmt(
              activeHeat
                ? total(
                    method,
                    heat
                  ) *
                  factor
                : 0
            )
          );

          setText(
            '[data-v522-output="' +
            key(
              method,
              heat
            ) +
            '_generator"]',
            fmt(
              activeHeat
                ? remaining(
                    method,
                    heat
                  ) *
                  factor
                : 0
            )
          );

          if(
            method ===
            'separate40'
          ){

            setText(
              '[data-v522-forty="' +
              i +
              '_service"]',
              heatQty(method) >= 4
                ? fmt(
                    total(
                      method,
                      heat
                    ) *
                    .40
                  )
                : ''
            );

            setText(
              '[data-v522-forty="' +
              i +
              '_generator"]',
              heatQty(method) >= 4 &&
              activeHeat
                ? fmt(
                    remaining(
                      method,
                      heat
                    ) *
                    .40
                  )
                : ''
            );

            setText(
              '[data-v522-forty-note="' +
              i +
              '"]',
              heatQty(method) >= 4
                ? 'Calculated automatically'
                : '65% applied — fewer than 4 total heating units'
            );
          }
        }

        if(
          method ===
          'separate40'
        ){

          const c =
            aggregate(
              method,
              'ac',
              false
            );

          const h =
            aggregate(
              method,
              'heat',
              false
            ) *
            factor;

          const used =
            Math.max(
              c,
              h
            );

          setText(
            '[data-v522-compare="qty"]',
            String(
              heatQty(method)
            )
          );

          setText(
            '[data-v522-compare="cooling"]',
            fmt(c)
          );

          setText(
            '[data-v522-compare="heating-used"]',
            fmt(h)
          );

          const label =
            document.querySelector(
              '[data-v522-heat-label]'
            );

          if(label){

            label.textContent =
              heatQty(method) >= 4
                ? 'Heating at 40%'
                : 'Heating at 65%';
          }

          setText(
            '[data-v522-compare="used"]',
            fmt(used) +
            (
              h > c
                ? ' — Heating'
                : ' — Cooling'
            )
          );
        }
      }
    });
}

window.hvacLoadCalculation =
  function(){

    clearInactiveManaged();

    let service = 0;

    let generator = 0;

    let serviceAC = 0;

    let generatorAC = 0;

    let serviceHeating = 0;

    let generatorHeating = 0;

    selected()
      .forEach(method=>{

        const s =
          methodResult(
            method,
            false
          );

        const g =
          methodResult(
            method,
            true
          );

        service += s.total;

        generator += g.total;

        serviceAC += s.c;

        serviceHeating += s.h;

        generatorAC += g.c;

        generatorHeating += g.h;
      });

    setOutput(
      'e37',
      serviceAC
    );

    setOutput(
      'e38',
      serviceHeating
    );

    setOutput('e39',0);
    setOutput('e40',0);
    setOutput('e41',0);

    setOutput(
      'f37',
      generatorAC
    );

    setOutput(
      'f38',
      generatorHeating
    );

    setOutput('f39',0);
    setOutput('f40',0);
    setOutput('f41',0);

    updateOutputs();

    syncManagedUI();

    return {
      service,
      generator,
      serviceAC,
      generatorAC,
      serviceHeating,
      generatorHeating,
      method:
        selected().join(','),
      multipleHeatTypes:
        selected().length > 1
    };
  };

window.validateHVACMethodSelection =
  function(){

    const sel =
      selected();

    let hpReady = true;

    if(
      sel.includes(
        'heatpump'
      )
    ){

      for(
        let i = 1;
        i <= count(
          'heatpump'
        );
        i++
      ){

        if(
          !hpAnswer(i)
        ){
          hpReady = false;
        }
      }
    }

    return {
      valid:
        sel.length > 0 &&
        hpReady,

      method:
        sel.join(','),

      methodSelected:
        sel.length > 0,

      heatPumpReady:
        hpReady,

      fortyPercentReady:
        true,

      heatingUnitCount:
        heatQty(
          'separate40'
        )
    };
  };

window.getHVACMethodSummary =
  function(){

    const names = {

      central65:
        'Central electric heat at 65%',

      separate40:
        (
          heatQty(
            'separate40'
          ) >= 4
            ? 'Separately controlled electric heat at 40%'
            : 'Separately controlled electric heat at 65% — fewer than four units'
        ),

      heatpump:
        'Heat pump with supplemental electric heat'
    };

    const sel =
      selected();

    return sel.length
      ? (
          'Heating method: ' +
          sel
            .map(
              m => names[m]
            )
            .join(' + ')
        )
      : 'Not selected';
  };

window.getCompleteManagedLoadCount =
  function(){

    let n = 0;

    BASE_MANAGED_ROWS
      .forEach(r=>{

        const q =
          typeof positiveQuantity ===
            'function'
            ? positiveQuantity(
                'q' + r
              )
            : 0;

        if(
          q > 0 &&
          typeof managedQuantity ===
            'function'
        ){

          n += Math.min(
            q,
            managedQuantity(r)
          );
        }
      });

    selected()
      .forEach(method=>{

        for(
          let i = 1;
          i <= count(method);
          i++
        ){

          for(
            const kind of [
              'ac',
              'heat'
            ]
          ){

            const t =
              typeFor(
                kind,
                i
              );

            if(
              isActive(
                method,
                t
              )
            ){

              n += managedQty(
                method,
                t
              );
            }
          }
        }
      });

    return n;
  };

window.applicableManagedLoadCount =
  window.getCompleteManagedLoadCount;

function escape(s){

  return String(s)
    .replace(
      /[&<>"']/g,
      ch => ({
        '&':'&amp;',
        '<':'&lt;',
        '>':'&gt;',
        '"':'&quot;',
        "'":'&#39;'
      }[ch])
    );
}

function printRow(
  label,
  q,
  s,
  g
){

  if(
    s <= 0 &&
    g <= 0
  ){
    return '';
  }

  return (
    '<tr>' +
    '<td>' +
    escape(label) +
    '</td>' +
    '<td class="quantity">' +
    (q || '') +
    '</td>' +
    '<td class="number">' +
    fmt(s) +
    '</td>' +
    '<td class="number">' +
    fmt(g) +
    '</td>' +
    '</tr>'
  );
}

function buildPrintHVAC(){

  let html = '';

  selected()
    .forEach(method=>{

      const factor =
        heatFactor(method);

      if(
        method ===
        'heatpump'
      ){

        for(
          let i = 1;
          i <= count(method);
          i++
        ){

          const s =
            heatPumpSystemResult(
              i,
              false
            );

          const g =
            heatPumpSystemResult(
              i,
              true
            );

          const ac =
            typeFor(
              'ac',
              i
            );

          const heat =
            typeFor(
              'heat',
              i
            );

          if(
            s.c > 0 ||
            g.c > 0
          ){

            html +=
              printRow(
                'Heat Pump Compressor ' +
                i,
                qty(
                  method,
                  ac
                ),
                s.c,
                g.c
              );
          }

          if(
            s.h > 0 ||
            g.h > 0
          ){

            html +=
              printRow(
                'Supplemental Electric Heat ' +
                i +
                ' at 65%',
                qty(
                  method,
                  heat
                ),
                s.h,
                g.h
              );
          }
        }

      }else{

        const s =
          normalMethodResult(
            method,
            false
          );

        const g =
          normalMethodResult(
            method,
            true
          );

        for(
          let i = 1;
          i <= count(method);
          i++
        ){

          const ac =
            typeFor(
              'ac',
              i
            );

          const heat =
            typeFor(
              'heat',
              i
            );

          if(
            s.controller ===
            'cooling'
          ){

            html +=
              printRow(
                'Air Conditioning Unit ' +
                i,
                qty(
                  method,
                  ac
                ),
                total(
                  method,
                  ac
                ),
                g.controller ===
                  'cooling'
                  ? remaining(
                      method,
                      ac
                    )
                  : 0
              );
          }

          if(
            s.controller ===
            'heating'
          ){

            html +=
              printRow(
                (
                  method ===
                    'central65'
                    ? 'Central Electric Heat '
                    : 'Separately Controlled Electric Heat '
                ) +
                i +
                ' at ' +
                Math.round(
                  factor * 100
                ) +
                '%',

                qty(
                  method,
                  heat
                ),

                total(
                  method,
                  heat
                ) *
                factor,

                g.controller ===
                  'heating'
                  ? remaining(
                      method,
                      heat
                    ) *
                    factor
                  : 0
              );
          }
        }
      }
    });

  return html;
}

const priorPrint543 =
  window.updatePrintRows;

window.updatePrintRows =
  function(d){

    priorPrint543(d);

    d.managedLoadCount =
      window
        .getCompleteManagedLoadCount();

    const report =
      document.getElementById(
        'printReport'
      );

    if(!report){
      return;
    }

    const table =
      report.querySelector(
        '.print-table'
      );

    const tfoot =
      table &&
      table.querySelector(
        'tfoot'
      );

    if(tfoot){

      const rows =
        Array.from(
          tfoot.children
        );

      const start =
        rows.findIndex(
          r =>
            r.classList.contains(
              'print-section-row'
            ) &&
            r.textContent.trim() ===
              'HVAC Load'
        );

      if(start >= 0){

        let end =
          start + 1;

        while(
          end < rows.length &&
          !rows[end]
            .classList.contains(
              'print-section-row'
            ) &&
          !rows[end]
            .classList.contains(
              'final-total-row'
            )
        ){
          end++;
        }

        for(
          let i = end - 1;
          i > start;
          i--
        ){
          rows[i].remove();
        }

        const hv =
          buildPrintHVAC();

        if(hv){

          rows[start]
            .insertAdjacentHTML(
              'afterend',
              hv
            );

        }else{

          rows[start].remove();
        }
      }
    }

    const mc =
      document.getElementById(
        'bottomManagedLoadCount'
      );

    if(mc){

      mc.textContent =
        String(
          d.managedLoadCount
        );
    }
  };

const oldReset543 =
  window.resetHeatingMethodSelection;

window.resetHeatingMethodSelection =
  function(){

    try{

      localStorage.removeItem(
        HP_SYSTEM_KEY
      );

    }catch(e){}

    if(
      typeof oldReset543 ===
      'function'
    ){

      oldReset543();
    }
  };

const observer =
  new MutationObserver(
    () =>
      setTimeout(
        patchUI,
        0
      )
  );

function init(){

  const v =
    document.querySelector(
      '.app-version'
    );

  if(v){

    v.textContent =
      'NEC 2023 | Version 2.0 — V5.43 HVAC Section Questions & Polish';
  }

  migrateLegacyAnswer();

  keepLegacyCompatibility();

  const c =
    document.getElementById(
      'v57HvacMethodSections'
    );

  if(c){

    observer.observe(
      c,
      {
        childList:true,
        subtree:true
      }
    );
  }

  document.addEventListener(
    'input',
    () =>
      setTimeout(
        ()=>{

          updateOutputs();

          syncManagedUI();
        },
        20
      )
  );

  document.addEventListener(
    'click',
    () =>
      setTimeout(
        ()=>{

          patchUI();

          syncManagedUI();
        },
        60
      ),
    true
  );

  setTimeout(
    ()=>{

      patchUI();

      if(
        typeof calculate ===
        'function'
      ){
        calculate();
      }
    },
    300
  );
}

if(
  document.readyState ===
  'loading'
){

  document.addEventListener(
    'DOMContentLoaded',
    init
  );

}else{

  init();
}

})();
(function(){

'use strict';

function relocateHeatPumpControls(){

  const card =
    document.querySelector(
      '[data-v522-card="heatpump"]'
    );

  if(!card){
    return;
  }

  const controls =
    card.querySelector(
      '.v523-system-controls'
    );

  if(!controls){
    return;
  }

  const groups =
    card.querySelectorAll(
      '.v522-system-group'
    );

  if(!groups.length){
    return;
  }

  const lastGroup =
    groups[
      groups.length - 1
    ];

  /*
    Keep the existing control unchanged;
    simply place it after the Yes/No
    question that belongs to the current
    last heat-pump section.
  */

  if(
    lastGroup.nextElementSibling !==
    controls
  ){

    lastGroup.insertAdjacentElement(
      'afterend',
      controls
    );
  }
}

const observer =
  new MutationObserver(
    () =>
      setTimeout(
        relocateHeatPumpControls,
        0
      )
  );

function init(){

  const v =
    document.querySelector(
      '.app-version'
    );

  if(v){

    v.textContent =
      'NEC 2023 | Version 2.0 — V5.44 Heat Pump Add Section Relocated';
  }

  const c =
    document.getElementById(
      'v57HvacMethodSections'
    );

  if(c){

    observer.observe(
      c,
      {
        childList:true,
        subtree:true
      }
    );
  }

  document.addEventListener(
    'click',
    () =>
      setTimeout(
        relocateHeatPumpControls,
        80
      ),
    true
  );

  setTimeout(
    relocateHeatPumpControls,
    350
  );
}

if(
  document.readyState ===
  'loading'
){

  document.addEventListener(
    'DOMContentLoaded',
    init
  );

}else{

  init();
}

})();
