/* Panel schedule data model for the universal drawing workspace.
 * No UI side effects. A schedule's electrical data is independent of its
 * eventual sheet placement, visual scale, and NTS presentation.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LoadCalcProPanelSchedules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const number = (value, label) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new Error(label + ' must be a nonnegative finite number');
    return n;
  };
  function createCircuit(index, overrides = {}) {
    if (!Number.isInteger(index) || index < 1) throw new Error('Invalid circuit number');
    return {
      number: index, description: '', breakerAmps: null, poles: 1,
      phase: null, connectedVA: 0, status: 'space', ...overrides
    };
  }
  function createSchedule(options = {}) {
    const rows = options.rows == null ? 42 : Number(options.rows);
    if (!Number.isInteger(rows) || rows < 1 || rows > 120) throw new Error('Invalid circuit count');
    const phases = options.phases == null ? 3 : Number(options.phases);
    if (![1, 3].includes(phases)) throw new Error('phases must be 1 or 3');
    return {
      schemaVersion: 1,
      id: options.id || null,
      panelId: options.panelId || null,
      designation: options.designation || '',
      voltage: options.voltage || '',
      phases,
      wires: options.wires == null ? (phases === 3 ? 4 : 3) : options.wires,
      busAmps: options.busAmps == null ? null : number(options.busAmps, 'busAmps'),
      mainAmps: options.mainAmps == null ? null : number(options.mainAmps, 'mainAmps'),
      circuits: Array.from({ length: rows }, (_, i) => createCircuit(i + 1))
    };
  }
  function updateCircuit(schedule, circuitNumber, patch) {
    const index = schedule.circuits.findIndex(c => c.number === circuitNumber);
    if (index < 0) throw new Error('Circuit not found');
    const next = { ...schedule.circuits[index], ...patch, number: circuitNumber };
    next.connectedVA = number(next.connectedVA, 'connectedVA');
    if (!Number.isInteger(next.poles) || next.poles < 1 || next.poles > 3) throw new Error('Invalid pole count');
    if (next.breakerAmps != null) next.breakerAmps = number(next.breakerAmps, 'breakerAmps');
    if (next.phase != null && !['A', 'B', 'C'].includes(next.phase)) throw new Error('Invalid phase');
    if (schedule.phases === 1 && next.phase === 'C') throw new Error('Phase C unavailable');
    return { ...schedule, circuits: schedule.circuits.map((c, i) => i === index ? next : c) };
  }
  function totals(schedule) {
    const byPhase = { A: 0, B: 0, C: 0 };
    let unassignedVA = 0;
    for (const c of schedule.circuits) {
      const va = number(c.connectedVA, 'connectedVA');
      if (c.phase) byPhase[c.phase] += va;
      else unassignedVA += va;
    }
    return { connectedVA: Object.values(byPhase).reduce((a, b) => a + b, unassignedVA),
      byPhase, unassignedVA };
  }
  return Object.freeze({ createSchedule, createCircuit, updateCircuit, totals });
});
