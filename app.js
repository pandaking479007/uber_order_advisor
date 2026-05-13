const storageKeys = {
  settings: "rideDecision.settings.v2",
  history: "rideDecision.history.v2",
  daily: "rideDecision.daily.v1",
};

const vehicleCosts = {
  economy: 0.30,
  comfort: 0.40,
  suv: 0.55,
  ev: 0.35,
};

const defaultSettings = {
  minHourly: 30,
  minPerMile: 1.35,
  maxPickupMiles: 6,
  defaultCost: 0.35,
  electricCost: 0.05,
  homeElectricRate: 0.14,
  superchargerRate: 0.42,
  homeChargingShare: 90,
  kwhPerMile: 0.33,
  tireCost: 0.05,
  tireSetCost: 1200,
  tireLifeMiles: 30000,
  maintenanceCost: 0.03,
  maintenanceAmount: 600,
  maintenanceIntervalMiles: 20000,
  insuranceCost: 0.03,
  insuranceMonthlyPremium: 75,
  insuranceAnnualMiles: 30000,
  depreciationCost: 0.19,
  taxReserveRate: 20,
  penalizeSuburb: true,
  penalizeAirport: true,
  penalizeRemote: true,
};

let lastDecision = null;
let lastDaily = null;
let chartPeriod = "week";
let chartMetric = "gross";

const $ = (id) => document.getElementById(id);

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getLocalUserId() {
  const key = "rideDecision.userId.v1";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}`;
  localStorage.setItem(key, id);
  return id;
}

function loadSettings() {
  return { ...defaultSettings, ...readJson(storageKeys.settings, {}) };
}

function saveSettings(settings) {
  writeJson(storageKeys.settings, settings);
}

function loadHistory() {
  return readJson(storageKeys.history, []);
}

function saveHistory(history) {
  writeJson(storageKeys.history, history.slice(0, 30));
}

function loadDaily() {
  return readJson(storageKeys.daily, []);
}

function saveDaily(records) {
  writeJson(storageKeys.daily, records.slice(0, 60));
}

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function oneDecimal(value) {
  return Number(value || 0).toFixed(1);
}

function pct(value) {
  if (!Number.isFinite(value)) return "--";
  return `${Math.round(value * 100)}%`;
}

function getNumber(id) {
  return Number($(id).value || 0);
}

function setValue(id, value) {
  $(id).value = value;
}

function flashStatus(text) {
  $("storageStatus").textContent = text;
  window.setTimeout(() => {
    $("storageStatus").textContent = "Saved locally";
  }, 1400);
}

function currentCostPerMile(settings) {
  const vehicleType = $("vehicleType").value;
  if (vehicleType === "custom") return getNumber("customCost") || settings.defaultCost;
  return vehicleCosts[vehicleType] || settings.defaultCost;
}

function costBreakdownTotal() {
  return ["electricCost", "tireCost", "maintenanceCost", "insuranceCost", "depreciationCost"]
    .reduce((sum, id) => sum + getNumber(id), 0);
}

function calculateCostParts() {
  const homeShare = Math.min(100, Math.max(0, getNumber("homeChargingShare"))) / 100;
  const blendedElectricRate = (homeShare * getNumber("homeElectricRate")) + ((1 - homeShare) * getNumber("superchargerRate"));
  const electricCost = blendedElectricRate * getNumber("kwhPerMile");
  const tireCost = getNumber("tireLifeMiles") > 0 ? getNumber("tireSetCost") / getNumber("tireLifeMiles") : 0;
  const maintenanceCost = getNumber("maintenanceIntervalMiles") > 0 ? getNumber("maintenanceAmount") / getNumber("maintenanceIntervalMiles") : 0;
  const insuranceCost = getNumber("insuranceAnnualMiles") > 0 ? (getNumber("insuranceMonthlyPremium") * 12) / getNumber("insuranceAnnualMiles") : 0;

  $("electricCost").value = electricCost.toFixed(2);
  $("tireCost").value = tireCost.toFixed(2);
  $("maintenanceCost").value = maintenanceCost.toFixed(2);
  $("insuranceCost").value = insuranceCost.toFixed(2);
}

function updateCostTotal() {
  calculateCostParts();
  const total = costBreakdownTotal();
  $("defaultCost").value = total.toFixed(2);
  $("costTotalLabel").textContent = `${money(total)}/mi`;
  updateCurrentCostNote();
}

function updateCurrentCostNote() {
  const settings = loadSettings();
  const cost = $("vehicleType") ? currentCostPerMile(settings) : settings.defaultCost;
  const note = $("currentCostNote");
  if (note) {
    note.textContent = `Current full cost per mile: ${money(cost)}/mi. For quick one-off adjustments, choose Custom under vehicle cost profile. Long-term cost assumptions live in Settings.`;
  }
}

function calculateDecision() {
  const settings = loadSettings();
  const fare = getNumber("fare");
  const tripMiles = getNumber("tripMiles");
  const pickupMiles = getNumber("pickupMiles");
  const totalMinutes = getNumber("totalMinutes");
  const destinationType = $("destinationType").value;
  const totalMiles = tripMiles + pickupMiles;
  const costPerMile = currentCostPerMile(settings);
  const hours = totalMinutes / 60;
  const hourlyGross = hours > 0 ? fare / hours : 0;
  const perMileGross = totalMiles > 0 ? fare / totalMiles : 0;
  const estimatedCost = totalMiles * costPerMile;
  const netIncome = fare - estimatedCost;
  const taxReserve = Math.max(0, netIncome) * (settings.taxReserveRate / 100);
  const afterTaxNet = netIncome - taxReserve;
  const netHourly = hours > 0 ? netIncome / hours : 0;
  const reasons = [];
  let score = 100;

  if (hourlyGross < 22) {
    score -= 40;
    reasons.push(`Gross per hour is ${money(hourlyGross)}, below $22/hr. This is not worth repeating long term.`);
  } else if (hourlyGross < 24) {
    score -= 30;
    reasons.push(`Gross per hour is ${money(hourlyGross)}, below the $24/hr minimum.`);
  } else if (hourlyGross < settings.minHourly) {
    score -= 10;
    reasons.push(`Gross per hour is ${money(hourlyGross)}, below your ${money(settings.minHourly)} target.`);
  } else {
    reasons.push(`Gross per hour is ${money(hourlyGross)}, meeting your target.`);
  }

  if (perMileGross < 1.1) {
    score -= 40;
    reasons.push(`Gross per total mile is ${money(perMileGross)}, below $1.10 and hard on profit.`);
  } else if (perMileGross < 1.2) {
    score -= 30;
    reasons.push(`Gross per total mile is ${money(perMileGross)}, below the $1.20 minimum.`);
  } else if (perMileGross < settings.minPerMile) {
    score -= 10;
    reasons.push(`Gross per total mile is ${money(perMileGross)}, below your ${money(settings.minPerMile)} target.`);
  } else {
    reasons.push(`Gross per total mile is ${money(perMileGross)}, meeting your target.`);
  }

  if (pickupMiles >= 10) {
    score -= 40;
    reasons.push(`Pickup distance is ${oneDecimal(pickupMiles)} mi, too far unless it is high-paying or on your route.`);
  } else if (pickupMiles >= 8) {
    score -= 30;
    reasons.push(`Pickup distance is ${oneDecimal(pickupMiles)} mi, high enough that most offers should be declined.`);
  } else if (pickupMiles > settings.maxPickupMiles) {
    score -= 20;
    reasons.push(`Pickup distance is ${oneDecimal(pickupMiles)} mi, above your ${oneDecimal(settings.maxPickupMiles)} mi limit.`);
  } else if (pickupMiles > 3) {
    score -= 8;
    reasons.push(`Pickup distance is ${oneDecimal(pickupMiles)} mi. Acceptable, but not ideal.`);
  } else {
    reasons.push(`Pickup distance is ${oneDecimal(pickupMiles)} mi, which is strong.`);
  }

  if (destinationType === "suburb" && settings.penalizeSuburb) {
    score -= 10;
    reasons.push("Suburban destinations can create return-trip dead miles.");
  }
  if (destinationType === "remote" && settings.penalizeRemote) {
    score -= 25;
    reasons.push("Remote low-demand areas can pull you away from the Lehi / Draper / Provo / SLC corridor.");
  }
  if (destinationType === "airport" && settings.penalizeAirport) {
    score -= 5;
    reasons.push("Airport trips can involve waiting or queue risk.");
  }
  if (destinationType === "corridor") {
    reasons.push("Destination stays inside the core corridor, so follow-up trip opportunities are better.");
  }

  if (netIncome < 5) {
    score -= 20;
    reasons.push(`After vehicle cost, estimated net income is only ${money(netIncome)}.`);
  } else {
    reasons.push(`After vehicle cost, estimated net income is ${money(netIncome)}, or about ${money(netHourly)}/hr net before tax.`);
  }

  if (netHourly < settings.minHourly) {
    score -= 25;
    reasons.push(`Net hourly income is ${money(netHourly)}, below your ${money(settings.minHourly)} target.`);
  }

  if (taxReserve > 0) {
    reasons.push(`Tax reserve at ${settings.taxReserveRate}% of pretax net income is ${money(taxReserve)}. Estimated after-tax net is ${money(afterTaxNet)}.`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const status = score >= 80 ? "accept" : score >= 60 ? "maybe" : "decline";
  const label = status === "accept" ? "Accept" : status === "maybe" ? "Maybe" : "Decline";

  return {
    createdAt: new Date().toISOString(),
    fare,
    tripMiles,
    pickupMiles,
    totalMinutes,
    destinationType,
    vehicleType: $("vehicleType").value,
    costPerMile,
    totalMiles,
    hourlyGross,
    perMileGross,
    estimatedCost,
    netIncome,
    taxReserve,
    afterTaxNet,
    netHourly,
    score,
    status,
    label,
    reasons,
  };
}

function calculateDaily() {
  const settings = loadSettings();
  const gross = getNumber("dailyGross");
  const hours = getNumber("dailyHours");
  const startOdometer = getNumber("startOdometer");
  const endOdometer = getNumber("endOdometer");
  const odometerMiles = endOdometer > startOdometer ? endOdometer - startOdometer : 0;
  const totalMiles = odometerMiles || getNumber("dailyMiles");
  const bookedMiles = getNumber("bookedMiles");
  const tipsBonus = getNumber("tipsBonus");
  const homeChargeKwh = getNumber("homeChargeKwh");
  const superchargeKwh = getNumber("superchargeKwh");
  const chargeKwh = homeChargeKwh + superchargeKwh;
  const grossPerHour = hours > 0 ? gross / hours : 0;
  const grossPerMile = totalMiles > 0 ? gross / totalMiles : 0;
  const deadMiles = bookedMiles > 0 ? Math.max(0, totalMiles - bookedMiles) : null;
  const deadRate = deadMiles === null || totalMiles <= 0 ? null : deadMiles / totalMiles;
  const estimatedCost = totalMiles * settings.defaultCost;
  const pretaxProfit = gross - estimatedCost;
  const taxReserve = Math.max(0, pretaxProfit) * (settings.taxReserveRate / 100);
  const afterTaxProfit = pretaxProfit - taxReserve;
  const pretaxProfitHour = hours > 0 ? pretaxProfit / hours : 0;
  const afterTaxProfitHour = hours > 0 ? afterTaxProfit / hours : 0;
  const lowDemandArea = $("lowDemandArea").checked;
  const reasons = [];
  let score = 100;

  if (grossPerHour < 22) {
    score -= 35;
    reasons.push(`Gross / hour is ${money(grossPerHour)}, below $22/hr. Reduce this kind of driving window.`);
  } else if (grossPerHour < 24) {
    score -= 25;
    reasons.push(`Gross / hour is ${money(grossPerHour)}, below the $24/hr minimum.`);
  } else if (grossPerHour < settings.minHourly) {
    score -= 10;
    reasons.push(`Gross / hour is ${money(grossPerHour)}, below your ${money(settings.minHourly)} target.`);
  } else {
    reasons.push(`Gross / hour is ${money(grossPerHour)}, meeting your target.`);
  }

  if (grossPerMile < 1.15) {
    score -= 35;
    reasons.push(`Gross / total mile is ${money(grossPerMile)}, below $1.15 and not good for long-term Model Y use.`);
  } else if (grossPerMile < 1.2) {
    score -= 25;
    reasons.push(`Gross / total mile is ${money(grossPerMile)}, below the $1.20 minimum.`);
  } else if (grossPerMile < settings.minPerMile) {
    score -= 10;
    reasons.push(`Gross / total mile is ${money(grossPerMile)}, below your ${money(settings.minPerMile)} target.`);
  } else {
    reasons.push(`Gross / total mile is ${money(grossPerMile)}, meeting your target.`);
  }

  if (deadRate !== null) {
    if (deadRate >= 0.4) {
      score -= 30;
      reasons.push(`Dead-mile rate is ${pct(deadRate)}, which seriously eats profit.`);
    } else if (deadRate >= 0.35) {
      score -= 20;
      reasons.push(`Dead-mile rate is ${pct(deadRate)}, above the 35% limit.`);
    } else if (deadRate >= 0.25) {
      score -= 8;
      reasons.push(`Dead-mile rate is ${pct(deadRate)}. Acceptable, but still improvable.`);
    } else {
      reasons.push(`Dead-mile rate is ${pct(deadRate)}, which is healthy.`);
    }
  } else {
    reasons.push("Booked miles were not entered, so dead-mile rate is not calculated yet.");
  }

  if (pretaxProfitHour < 18) {
    score -= 25;
    reasons.push(`Pretax real profit after full vehicle cost is about ${money(pretaxProfitHour)}/hr, which is low.`);
  } else if (pretaxProfitHour < 25) {
    score -= 8;
    reasons.push(`Pretax real profit after full vehicle cost is about ${money(pretaxProfitHour)}/hr. Usable, but not excellent.`);
  } else {
    reasons.push(`Pretax real profit after full vehicle cost is about ${money(pretaxProfitHour)}/hr. Strong result.`);
  }

  if (lowDemandArea) {
    score -= 10;
    reasons.push("You entered a low-demand area today. Check whether it created return-trip dead miles.");
  }

  if (chargeKwh > 0) {
    const kwhPerMile = totalMiles > 0 ? chargeKwh / totalMiles : 0;
    reasons.push(`Logged ${oneDecimal(chargeKwh)} kWh total: ${oneDecimal(homeChargeKwh)} home and ${oneDecimal(superchargeKwh)} Supercharger, about ${kwhPerMile.toFixed(2)} kWh/mi.`);
  }

  if (odometerMiles > 0) {
    reasons.push(`Daily miles came from odometer: ${oneDecimal(startOdometer)} to ${oneDecimal(endOdometer)} = ${oneDecimal(odometerMiles)} mi.`);
  }

  if (tipsBonus > 0) {
    reasons.push(`Tips / bonus logged: ${money(tipsBonus)}.`);
  }

  if (taxReserve > 0) {
    reasons.push(`Tax reserve at ${settings.taxReserveRate}% of pretax profit is ${money(taxReserve)}. Estimated after-tax profit is ${money(afterTaxProfitHour)}/hr.`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const status = score >= 80 ? "accept" : score >= 60 ? "maybe" : "decline";
  const label = status === "accept" ? "Healthy" : status === "maybe" ? "Mixed" : "Weak";

  return {
    createdAt: new Date().toISOString(),
    date: $("dailyDate").value,
    platform: $("dailyPlatform").value,
    gross,
    hours,
    startOdometer,
    endOdometer,
    totalMiles,
    bookedMiles,
    tipsBonus,
    homeChargeKwh,
    superchargeKwh,
    chargeKwh,
    deadMiles,
    deadRate,
    grossPerHour,
    grossPerMile,
    estimatedCost,
    pretaxProfit,
    taxReserve,
    afterTaxProfit,
    pretaxProfitHour,
    afterTaxProfitHour,
    lowDemandArea,
    score,
    status,
    label,
    reasons,
  };
}

function renderDecision(decision) {
  const area = $("decisionArea");
  area.classList.remove("accept", "maybe", "decline");
  area.classList.add(decision.status);
  $("decisionLabel").textContent = decision.label;
  $("scoreRing").textContent = decision.score;
  $("hourlyGross").textContent = money(decision.hourlyGross);
  $("perMileGross").textContent = `${money(decision.perMileGross)}/mi`;
  $("estimatedCost").textContent = money(decision.estimatedCost);
  $("netIncome").textContent = money(decision.netIncome);
  $("taxReserve").textContent = money(decision.taxReserve);
  $("afterTaxNet").textContent = money(decision.afterTaxNet);
  $("reasonList").innerHTML = decision.reasons.map((reason) => `<li>${reason}</li>`).join("");
  $("saveRecord").disabled = false;
}

function renderDaily(daily) {
  const area = $("dailySummary");
  area.classList.remove("accept", "maybe", "decline");
  area.classList.add(daily.status);
  $("dailyStatus").textContent = daily.label;
  $("dailyScore").textContent = daily.score;
  $("dailyGrossHour").textContent = `${money(daily.grossPerHour)}/hr`;
  $("dailyGrossMile").textContent = `${money(daily.grossPerMile)}/mi`;
  $("deadMileRate").textContent = daily.deadRate === null ? "--" : pct(daily.deadRate);
  $("dailyProfit").textContent = `${money(daily.pretaxProfitHour)}/hr`;
  $("dailyTaxReserve").textContent = money(daily.taxReserve);
  $("dailyAfterTaxProfit").textContent = `${money(daily.afterTaxProfitHour)}/hr`;
  $("dailyChargeEnergy").textContent = daily.chargeKwh > 0 ? `${oneDecimal(daily.chargeKwh)} kWh` : "--";
  $("dailyKwhMile").textContent = daily.chargeKwh > 0 && daily.totalMiles > 0 ? `${(daily.chargeKwh / daily.totalMiles).toFixed(2)} kWh/mi` : "--";
  $("dailyReasons").innerHTML = daily.reasons.map((reason) => `<li>${reason}</li>`).join("");
}

function renderSettings() {
  const settings = loadSettings();
  $("minHourly").value = settings.minHourly;
  $("minPerMile").value = settings.minPerMile;
  $("maxPickupMiles").value = settings.maxPickupMiles;
  $("defaultCost").value = settings.defaultCost;
  $("homeElectricRate").value = settings.homeElectricRate;
  $("superchargerRate").value = settings.superchargerRate;
  $("homeChargingShare").value = settings.homeChargingShare;
  $("kwhPerMile").value = settings.kwhPerMile;
  $("electricCost").value = settings.electricCost;
  $("tireSetCost").value = settings.tireSetCost;
  $("tireLifeMiles").value = settings.tireLifeMiles;
  $("tireCost").value = settings.tireCost;
  $("maintenanceAmount").value = settings.maintenanceAmount;
  $("maintenanceIntervalMiles").value = settings.maintenanceIntervalMiles;
  $("maintenanceCost").value = settings.maintenanceCost;
  $("insuranceMonthlyPremium").value = settings.insuranceMonthlyPremium;
  $("insuranceAnnualMiles").value = settings.insuranceAnnualMiles;
  $("insuranceCost").value = settings.insuranceCost;
  $("depreciationCost").value = settings.depreciationCost;
  $("taxReserveRate").value = settings.taxReserveRate;
  $("penalizeSuburb").checked = Boolean(settings.penalizeSuburb);
  $("penalizeAirport").checked = Boolean(settings.penalizeAirport);
  $("penalizeRemote").checked = Boolean(settings.penalizeRemote);
  updateCostTotal();
}

function renderHistory() {
  const history = loadHistory();
  const historyList = $("historyList");
  if (!history.length) {
    historyList.innerHTML = '<p class="empty-state">No saved offers yet.</p>';
  } else {
    historyList.innerHTML = history.map((item) => {
      const date = new Date(item.createdAt);
      return `
        <article class="history-item">
          <header>
            <div>
              <strong>${money(item.fare)} / ${oneDecimal(item.totalMiles)} mi / ${item.totalMinutes} min</strong>
              <time>${date.toLocaleString("en-US", { hour12: false })}</time>
            </div>
            <span class="badge ${item.status}">${item.label} ${item.score}</span>
          </header>
          <p>Gross/hr ${money(item.hourlyGross)}, gross/mi ${money(item.perMileGross)}, net income ${money(item.netIncome)}, after-tax net ${money(item.afterTaxNet)}</p>
        </article>
      `;
    }).join("");
  }

  const dailyRecords = loadDaily();
  const dailyList = $("dailyList");
  if (!dailyRecords.length) {
    dailyList.innerHTML = '<p class="empty-state">No daily records yet.</p>';
    return;
  }
  dailyList.innerHTML = dailyRecords.map((item) => `
    <article class="history-item">
      <header>
        <div>
          <strong>${item.date} / ${item.platform} / ${money(item.gross)}</strong>
          <time>${oneDecimal(item.hours)} hr / ${oneDecimal(item.totalMiles)} mi</time>
        </div>
        <span class="badge ${item.status}">${item.label} ${item.score}</span>
      </header>
      <p>Gross/hr ${money(item.grossPerHour)}, gross/mi ${money(item.grossPerMile)}, pretax profit ${money(item.pretaxProfitHour)}/hr, after-tax profit ${money(item.afterTaxProfitHour)}/hr, dead-mile rate ${item.deadRate === null ? "--" : pct(item.deadRate)}</p>
    </article>
  `).join("");
}

function renderCharts() {
  const records = loadDaily()
    .filter((item) => item.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const axisGroups = buildAxisGroups(records, chartPeriod);
  const totals = axisGroups.reduce((sum, group) => ({
    gross: sum.gross + group.gross,
    cost: sum.cost + group.cost,
    pretax: sum.pretax + group.pretax,
    afterTax: sum.afterTax + group.afterTax,
  }), { gross: 0, cost: 0, pretax: 0, afterTax: 0 });

  $("chartTitle").textContent = `${capitalize(chartPeriod)}ly totals`;
  $("chartGrossTotal").textContent = money(totals.gross);
  $("chartCostTotal").textContent = money(totals.cost);
  $("chartPretaxTotal").textContent = money(totals.pretax);
  $("chartAfterTaxTotal").textContent = money(totals.afterTax);
  $("axisChartTitle").textContent = `${metricLabels[chartMetric]} by ${chartPeriod === "week" ? "day" : chartPeriod === "month" ? "week" : "month"}`;
  $("selectedMetricLabel").textContent = metricLabels[chartMetric];
  $("selectedMetricLegend").className = metricClasses[chartMetric].legend;

  const chart = $("axisChart");
  if (!records.length) {
    chart.innerHTML = '<p class="empty-state">No daily KPI records yet.</p>';
    return;
  }

  const rawMaxValue = Math.max(...axisGroups.map((group) => Math.max(0, group[chartMetric])), 1);
  const maxValue = getNiceAxisMax(rawMaxValue);
  chart.innerHTML = `
    <div class="y-axis">
      <span>${money(maxValue)}</span>
      <span>${money(maxValue * 0.75)}</span>
      <span>${money(maxValue * 0.5)}</span>
      <span>${money(maxValue * 0.25)}</span>
      <span>$0</span>
    </div>
    <div class="x-chart">
      ${axisGroups.map((group) => axisColumn(group, maxValue)).join("")}
    </div>
  `;
}

const metricLabels = {
  gross: "Gross revenue",
  cost: "Estimated cost",
  pretax: "Pretax net",
  afterTax: "After-tax net",
};

const metricClasses = {
  gross: { legend: "legend-gross", bar: "bar-gross" },
  cost: { legend: "legend-cost", bar: "bar-cost" },
  pretax: { legend: "legend-pretax", bar: "bar-pretax" },
  afterTax: { legend: "legend-aftertax", bar: "bar-aftertax" },
};

function buildAxisGroups(records, period) {
  if (period === "week") return buildWeekGroups(records);
  if (period === "month") return Object.values(groupDailyRecords(records, "week")).slice(-5);
  return Object.values(groupDailyRecords(records, "month")).slice(-3);
}

function buildWeekGroups(records) {
  const now = new Date();
  const monday = startOfWeek(now);
  const groups = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return {
      key: date.toISOString().slice(0, 10),
      label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index],
      fullLabel: date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      gross: 0,
      cost: 0,
      pretax: 0,
      afterTax: 0,
      miles: 0,
      hours: 0,
    };
  });
  const groupMap = Object.fromEntries(groups.map((group) => [group.key, group]));
  records.forEach((item) => {
    if (!groupMap[item.date]) return;
    addRecordToGroup(groupMap[item.date], item);
  });
  return groups;
}

function startOfWeek(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  return result;
}

function groupDailyRecords(records, period) {
  return records.reduce((groups, item) => {
    const key = getPeriodKey(item.date, period);
    if (!groups[key]) {
      groups[key] = {
        key,
        label: getPeriodLabel(item.date, period),
        fullLabel: getPeriodLabel(item.date, period),
        gross: 0,
        cost: 0,
        pretax: 0,
        afterTax: 0,
        miles: 0,
        hours: 0,
    };
  }
    addRecordToGroup(groups[key], item);
    return groups;
  }, {});
}

function addRecordToGroup(group, item) {
  group.gross += Number(item.gross || 0);
  group.cost += Number(item.estimatedCost || 0);
  group.pretax += Number(item.pretaxProfit || 0);
  group.afterTax += Number(item.afterTaxProfit || 0);
  group.miles += Number(item.totalMiles || 0);
  group.hours += Number(item.hours || 0);
}

function getPeriodKey(dateValue, period) {
  const date = new Date(`${dateValue}T00:00:00`);
  const year = date.getFullYear();
  if (period === "month") return `${year}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  if (period === "quarter") return `${year}-Q${Math.floor(date.getMonth() / 3) + 1}`;
  return `${year}-W${String(getWeekNumber(date)).padStart(2, "0")}`;
}

function getPeriodLabel(dateValue, period) {
  const date = new Date(`${dateValue}T00:00:00`);
  if (period === "month") {
    return date.toLocaleString("en-US", { month: "short", year: "numeric" });
  }
  if (period === "quarter") {
    return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
  }
  return `Week ${getWeekNumber(date)} ${date.getFullYear()}`;
}

function getWeekNumber(date) {
  const firstDay = new Date(date.getFullYear(), 0, 1);
  const dayOffset = Math.floor((date - firstDay) / 86400000);
  return Math.ceil((dayOffset + firstDay.getDay() + 1) / 7);
}

function barLine(label, value, maxValue, className) {
  const width = Math.max(0, Math.min(100, (Number(value || 0) / maxValue) * 100));
  return `
    <div class="bar-line">
      <span>${label}</span>
      <div class="bar-track"><div class="bar-fill ${className}" style="width:${width}%"></div></div>
      <strong>${money(value)}</strong>
    </div>
  `;
}

function axisColumn(group, maxValue) {
  const value = Math.max(0, Number(group[chartMetric] || 0));
  const height = Math.max(0, Math.min(100, (value / maxValue) * 100));
  const tooltip = `${group.fullLabel || group.label}<br>${metricLabels[chartMetric]}: ${money(value)}<br>${oneDecimal(group.miles)} mi / ${oneDecimal(group.hours)} hr`;
  return `
    <div class="axis-column">
      <div class="axis-bar-wrap">
        <div class="axis-bar ${metricClasses[chartMetric].bar}" tabindex="0" aria-label="${group.label} ${metricLabels[chartMetric]} ${money(value)}" style="height:${height}%">
          <span class="axis-tooltip">${tooltip}</span>
        </div>
      </div>
      <div class="axis-label">
        <span>${group.label}</span>
        <strong>${money(value)}</strong>
      </div>
    </div>
  `;
}

function getNiceAxisMax(value) {
  if (value <= 0) return 100;
  if (value <= 500) return Math.ceil(value / 100) * 100 || 100;
  if (value <= 1000) return Math.ceil(value / 250) * 250;
  if (value <= 5000) return Math.ceil(value / 500) * 500;
  return Math.ceil(value / 1000) * 1000;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function switchTab(tabId) {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabId);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === tabId);
  });
  if (tabId === "charts") renderCharts();
}

function resetDecision() {
  $("orderForm").reset();
  $("customCostRow").classList.add("hidden");
  $("saveRecord").disabled = true;
  $("decisionArea").classList.remove("accept", "maybe", "decline");
  $("decisionLabel").textContent = "Enter an offer to calculate";
  $("scoreRing").textContent = "--";
  $("hourlyGross").textContent = "--";
  $("perMileGross").textContent = "--";
  $("estimatedCost").textContent = "--";
  $("netIncome").textContent = "--";
  $("taxReserve").textContent = "--";
  $("afterTaxNet").textContent = "--";
  $("reasonList").innerHTML = "<li>The result uses hourly pay, gross per total mile, pickup distance, and destination risk.</li>";
  updateCurrentCostNote();
  lastDecision = null;
}

function wireEvents() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  $("vehicleType").addEventListener("change", () => {
    $("customCostRow").classList.toggle("hidden", $("vehicleType").value !== "custom");
    updateCurrentCostNote();
  });

  $("customCost").addEventListener("input", updateCurrentCostNote);

  ["startOdometer", "endOdometer"].forEach((id) => {
    $(id).addEventListener("input", () => {
      const start = getNumber("startOdometer");
      const end = getNumber("endOdometer");
      if (end > start) setValue("dailyMiles", (end - start).toFixed(1));
    });
  });

  document.querySelectorAll(".cost-source, .cost-part").forEach((input) => {
    input.addEventListener("input", updateCostTotal);
  });

  $("orderForm").addEventListener("submit", (event) => {
    event.preventDefault();
    lastDecision = calculateDecision();
    renderDecision(lastDecision);
  });

  $("dailyForm").addEventListener("submit", (event) => {
    event.preventDefault();
    lastDaily = calculateDaily();
    renderDaily(lastDaily);
    const records = loadDaily().filter((record) => record.date !== lastDaily.date || record.platform !== lastDaily.platform);
    saveDaily([lastDaily, ...records]);
    renderHistory();
    renderCharts();
    flashStatus("Daily KPI saved");
  });

  $("resetForm").addEventListener("click", resetDecision);

  $("settingsForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const defaultCost = costBreakdownTotal();
    saveSettings({
      minHourly: getNumber("minHourly"),
      minPerMile: getNumber("minPerMile"),
      maxPickupMiles: getNumber("maxPickupMiles"),
      defaultCost,
      homeElectricRate: getNumber("homeElectricRate"),
      superchargerRate: getNumber("superchargerRate"),
      homeChargingShare: getNumber("homeChargingShare"),
      kwhPerMile: getNumber("kwhPerMile"),
      electricCost: getNumber("electricCost"),
      tireSetCost: getNumber("tireSetCost"),
      tireLifeMiles: getNumber("tireLifeMiles"),
      tireCost: getNumber("tireCost"),
      maintenanceAmount: getNumber("maintenanceAmount"),
      maintenanceIntervalMiles: getNumber("maintenanceIntervalMiles"),
      maintenanceCost: getNumber("maintenanceCost"),
      insuranceMonthlyPremium: getNumber("insuranceMonthlyPremium"),
      insuranceAnnualMiles: getNumber("insuranceAnnualMiles"),
      insuranceCost: getNumber("insuranceCost"),
      depreciationCost: getNumber("depreciationCost"),
      taxReserveRate: getNumber("taxReserveRate"),
      penalizeSuburb: $("penalizeSuburb").checked,
      penalizeAirport: $("penalizeAirport").checked,
      penalizeRemote: $("penalizeRemote").checked,
    });
    flashStatus("Settings saved");
  });

  $("saveRecord").addEventListener("click", () => {
    if (!lastDecision) return;
    saveHistory([lastDecision, ...loadHistory()]);
    renderHistory();
    flashStatus("Offer saved");
  });

  $("clearHistory").addEventListener("click", () => {
    saveHistory([]);
    renderHistory();
    flashStatus("Offer records cleared");
  });

  $("checkTeslaBackend").addEventListener("click", checkTeslaBackend);
  $("syncTeslaToday").addEventListener("click", syncTeslaToday);
  $("registerTeslaDomain").addEventListener("click", registerTeslaDomain);

  document.querySelectorAll("[data-chart-period]").forEach((button) => {
    button.addEventListener("click", () => {
      chartPeriod = button.dataset.chartPeriod;
      document.querySelectorAll("[data-chart-period]").forEach((item) => {
        item.classList.toggle("active-period", item === button);
      });
      renderCharts();
    });
  });

  $("chartMetric").addEventListener("change", () => {
    chartMetric = $("chartMetric").value;
    renderCharts();
  });
}

async function checkTeslaBackend() {
  const status = $("teslaBackendStatus");
  const note = $("teslaBackendNote");
  const link = $("teslaConnectLink");

  if (location.protocol === "file:") {
    status.textContent = "Static local file";
    note.textContent = "Tesla sync requires the Netlify URL, not the local file version. Open your deployed site to check backend status.";
    link.setAttribute("aria-disabled", "true");
    return;
  }

  try {
    const response = await fetch("/.netlify/functions/tesla-config");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const config = await response.json();
    if (!config.configured) {
      status.textContent = "Backend installed, Tesla env vars missing";
      const missing = Object.entries(config.missing)
        .filter(([, value]) => value)
        .map(([key]) => key)
        .join(", ");
      note.textContent = `Set these Netlify env vars: ${missing}. Tesla redirect URI: ${config.redirectUri}`;
      link.setAttribute("aria-disabled", "true");
      return;
    }

    if (!config.canStoreTokens) {
      status.textContent = "OAuth ready, token storage missing";
      note.textContent = `Tesla OAuth can start, but daily sync needs Supabase token storage. Redirect URI: ${config.redirectUri}`;
    } else {
      status.textContent = "Ready to connect Tesla";
      note.textContent = `Use this redirect URI in Tesla Developer Portal: ${config.redirectUri}`;
    }

    link.href = `/.netlify/functions/tesla-auth-start?user=${encodeURIComponent(getLocalUserId())}`;
    link.setAttribute("aria-disabled", "false");
  } catch (error) {
    status.textContent = "Backend unavailable";
    note.textContent = "Netlify Functions are not reachable yet. Redeploy the updated package or check the Netlify deploy logs.";
    link.setAttribute("aria-disabled", "true");
  }
}

async function syncTeslaToday() {
  const status = $("teslaBackendStatus");
  const note = $("teslaBackendNote");
  if (location.protocol === "file:") {
    status.textContent = "Static local file";
    note.textContent = "Open the deployed Netlify app to run Tesla sync.";
    return;
  }

  status.textContent = "Syncing Tesla...";
  note.textContent = "Requesting Tesla odometer and charging data. If the vehicle is asleep, this may fail without waking it.";

  try {
    const user = encodeURIComponent(getLocalUserId());
    const date = encodeURIComponent($("dailyDate").value || new Date().toISOString().slice(0, 10));
    const response = await fetch(`/.netlify/functions/tesla-daily-sync?user=${user}&date=${date}`);
    const data = await response.json();
    if (!response.ok) {
      const details = data.details ? ` Details: ${JSON.stringify(data.details)}` : "";
      throw new Error(`${data.message || data.error || "Tesla sync failed."}${details}`);
    }

    if (data.startOdometer) setValue("startOdometer", Number(data.startOdometer).toFixed(1));
    if (data.endOdometer) setValue("endOdometer", Number(data.endOdometer).toFixed(1));
    if (data.totalMiles) setValue("dailyMiles", Number(data.totalMiles).toFixed(1));
    if (data.homeChargeKwh) setValue("homeChargeKwh", Number(data.homeChargeKwh).toFixed(1));
    if (data.superchargeKwh) setValue("superchargeKwh", Number(data.superchargeKwh).toFixed(1));

    status.textContent = "Tesla sync completed";
    note.textContent = data.note || `Synced ${data.vehicle?.displayName || "Tesla"} for ${data.date}.`;

    if (getNumber("dailyGross") && getNumber("dailyHours") && getNumber("dailyMiles")) {
      lastDaily = calculateDaily();
      renderDaily(lastDaily);
    }
  } catch (error) {
    status.textContent = "Tesla sync failed";
    note.textContent = error.message;
  }
}

async function registerTeslaDomain() {
  const status = $("teslaBackendStatus");
  const note = $("teslaBackendNote");
  if (location.protocol === "file:") {
    status.textContent = "Static local file";
    note.textContent = "Open the deployed Netlify app to register the Tesla domain.";
    return;
  }

  status.textContent = "Registering Tesla domain...";
  note.textContent = "Calling Tesla partner account registration for this Netlify domain.";

  try {
    const response = await fetch("/.netlify/functions/tesla-register-domain", { method: "POST" });
    const data = await response.json();
    if (!response.ok) {
      const details = data.details ? ` Details: ${JSON.stringify(data.details)}` : "";
      throw new Error(`${data.message || data.error || "Tesla domain registration failed."}${details}`);
    }
    status.textContent = "Tesla domain registered";
    note.textContent = `Registered ${data.domain}. Public key: ${data.publicKeyUrl}`;
  } catch (error) {
    status.textContent = "Tesla domain registration failed";
    note.textContent = error.message;
  }
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

$("dailyDate").value = new Date().toISOString().slice(0, 10);
renderSettings();
renderHistory();
renderCharts();
wireEvents();
checkTeslaBackend();
registerServiceWorker();
