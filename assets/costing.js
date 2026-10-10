/*
 * bop Aero SR22T program costing — the ONE implementation of the program math.
 *
 * Inputs live in data/costing.json (edited only through the private costing
 * editor). This file turns them into every derived figure. It is shared by:
 *   - the SR22T Ownership Program document (index.html)
 *   - the costing editor's validation, in the browser and in the Worker
 *   - the public SR22T calculator on bopaero.com
 * so the arithmetic exists in exactly one place.
 *
 * Same model as the SF50 costing (sf50Program/assets/costing.js), without
 * JetStream or pre-owned programs, plus:
 *   - maxHours: the yearly flying-hour cap per share (the SR22T is capped; the
 *     SF50 is unlimited with scheduling limits)
 *   - bridge: the pre-owned bridge aircraft that serves the program until the
 *     new aircraft is delivered. Internal economics only (Raymond, 2026-10-04):
 *     shown in the costing editor, never as line items to customers.
 *
 * Plain ES5, no dependencies. Exposes SR22TCosting as a global and as a
 * CommonJS export.
 */
(function (root) {
  'use strict';

  var LIMITS = {
    shares:           { min: 1,    max: 30,     integer: true },
    sharesRemaining:  { min: 0,    max: 30,     integer: true },   // sales status: unsold shares
    maxHours:         { min: 10,   max: 500,    integer: true },   // flying hours per share per year
    acquisition:      { min: 1e5,  max: 5e6 },
    basePrice:        { min: 3e5,  max: 5e6 },     // new aircraft: Cirrus base price (GTS)
    options:          { min: 0,    max: 2e6 },     // new aircraft: options & equipment
    yearFrom:         { min: 2000, max: 2040, integer: true },
    yearTo:           { min: 2000, max: 2040, integer: true },
    roundTo:          { min: 1000, max: 100000, integer: true },
    maxListingAgeDays:{ min: 7,    max: 365, integer: true },
    connectivityCost: { min: 0,    max: 2e5 },
    management:       { min: 0,    max: 1e6 },
    reserve:          { min: 0,    max: 2e6 },
    fixedCost:        { min: 0,    max: 1e6 },
    closing:          { min: 0,    max: 2e5 },
    taxRate:          { min: 0,    max: 0.2 },
    // Founder's Circle add-on (Raymond 2026-10-10): optional premium tier on a program's shares
    activationRate:   { min: 0,    max: 0.5 },     // one-time fee, share of the share purchase
    premiumRate:      { min: 0,    max: 2 },       // annual premium, share of the Annual Program Fee
    reserveShare:     { min: 0,    max: 1 },       // share of each annual premium allocated to the liquidity reserve
    positions:        { min: 0,    max: 30,     integer: true },   // Founder positions on a program
    commissionRate:   { min: 0,    max: 0.1 },     // sales commission, on aircraft acquisition value
    // Bridge aircraft
    purchasePrice:    { min: 1e5,  max: 3e6 },     // what bop Aero paid (fixed; not a market estimate)
    monthlyLoan:      { min: 0,    max: 1e5 },
    monthlyInsurance: { min: 0,    max: 5e4 },
    // The bop Aero SR22T Leasing Program (bopaero.com/sr22t-leasing-program)
    leaseMonthly:     { min: 0,    max: 1e5 },     // monthly lease price, prepaid
    leaseIncludedHours:{ min: 0,   max: 300, integer: true },   // hours included in the monthly lease
    leaseExtraHourRate:{ min: 0,   max: 5000 },    // per hour beyond the included hours
    leaseHourlyRate:  { min: 0,    max: 5000 }     // hourly lease (case by case)
  };

  function checkNumber(errors, where, field, value) {
    var lim = LIMITS[field];
    if (typeof value !== 'number' || !isFinite(value)) {
      errors.push(where + ' ' + field + ' must be a number');
      return;
    }
    if (lim.integer && Math.floor(value) !== value) errors.push(where + ' ' + field + ' must be a whole number');
    if (value < lim.min || value > lim.max) errors.push(where + ' ' + field + ' must be between ' + lim.min + ' and ' + lim.max);
  }

  // Features per program. The status alone sets the wording shown everywhere, so
  // the words can never contradict the mark; an optional short detail follows it.
  var FEATURE_TEXT = { included: 'Included', depends: 'Depends on aircraft', excluded: 'Not included' };
  var FEATURE_STATUS = Object.keys(FEATURE_TEXT);
  var DETAIL_MAX = 80;
  function featureText(f) { return f ? FEATURE_TEXT[f.status] + (f.detail ? ' · ' + f.detail : '') : ''; }

  function checkFeatures(errors, where, features, labels) {
    Object.keys(features || {}).forEach(function (k) {
      var f = features[k] || {};
      if (!labels[k]) errors.push(where + ' feature ' + k + ' has no label in featureLabels');
      if (FEATURE_STATUS.indexOf(f.status) < 0) errors.push(where + ' feature ' + k + ' status must be ' + FEATURE_STATUS.join(', '));
      if (f.standard !== undefined && f.standard !== true) errors.push(where + ' feature ' + k + ' standard must be true or left out');
      if (f.standard && (f.status !== 'included' || f.detail !== undefined)) errors.push(where + ' feature ' + k + ' is standard, so it must be included with no detail');
      if (f.detail !== undefined) {
        if (typeof f.detail !== 'string' || !f.detail.trim() || f.detail.length > DETAIL_MAX) errors.push(where + ' feature ' + k + ' detail must be 1-' + DETAIL_MAX + ' characters, or left out');
        else if (FEATURE_STATUS.some(function (s) { return FEATURE_TEXT[s].toLowerCase() === f.detail.trim().toLowerCase(); }))
          errors.push(where + ' feature ' + k + ' detail only repeats a status; leave it blank');
      }
    });
  }

  // Returns a list of problems; empty means the costing can be published.
  function validate(c) {
    var errors = [];
    if (!c || typeof c !== 'object') return ['costing is missing'];
    if (!/^v\d{4}-\d{2}-\d{2}\.\d+$/.test(c.version || '')) errors.push('version must look like v2026-10-04.1');
    var common = c.common || {}, labels = c.featureLabels || {};
    ['fixedCost', 'closing', 'taxRate', 'commissionRate'].forEach(function (f) { checkNumber(errors, 'common', f, common[f]); });
    if (!Array.isArray(c.programs) || !c.programs.length) { errors.push('programs are missing'); return errors; }
    var keys = {};
    c.programs.forEach(function (p) {
      var where = 'program ' + (p && p.key);
      if (!p || typeof p.key !== 'string' || !p.key) { errors.push('a program is missing its key'); return; }
      if (keys[p.key]) errors.push('duplicate program ' + p.key);
      keys[p.key] = true;
      if (typeof p.approx !== 'boolean') errors.push(where + ' approx must be true or false');
      ['shares', 'sharesRemaining', 'maxHours', 'connectivityCost', 'management', 'reserve'].forEach(function (f) { checkNumber(errors, where, f, p[f]); });
      if (p.sharesRemaining > p.shares) errors.push(where + ' has more shares remaining (' + p.sharesRemaining + ') than shares available (' + p.shares + ')');
      // Price is either one acquisition value or base + options (new)
      var split = p.basePrice !== undefined || p.options !== undefined;
      if (split && p.acquisition !== undefined) errors.push(where + ' has both an acquisition value and base + options');
      if (split) { checkNumber(errors, where, 'basePrice', p.basePrice); checkNumber(errors, where, 'options', p.options); }
      else checkNumber(errors, where, 'acquisition', p.acquisition);
      if (p.founders !== undefined) {
        checkNumber(errors, where, 'positions', (p.founders || {}).positions);
        if ((p.founders || {}).positions > p.shares) errors.push(where + ' has more Founder positions than shares available');
        if (common.founders === undefined) errors.push(where + ' has Founder positions but common Founder settings are missing');
      }
      if (p.features !== undefined) checkFeatures(errors, where, p.features, labels);
    });
    if (!keys[c.baseline]) errors.push('baseline must name one of the programs');
    if (common.founders !== undefined) {
      ['activationRate', 'premiumRate', 'reserveShare'].forEach(function (f) { checkNumber(errors, 'common founders', f, (common.founders || {})[f]); });
    }
    if (common.market !== undefined) {
      checkNumber(errors, 'common', 'roundTo', (common.market || {}).roundTo);
      checkNumber(errors, 'common', 'maxListingAgeDays', (common.market || {}).maxListingAgeDays);
    }
    if (c.bridge !== undefined) {
      var b = c.bridge || {};
      if (typeof b.model !== 'string' || !b.model.trim()) errors.push('bridge aircraft model is missing');
      ['purchasePrice', 'monthlyLoan', 'monthlyInsurance', 'leaseMonthly', 'leaseIncludedHours', 'leaseExtraHourRate', 'leaseHourlyRate'].forEach(function (f) { checkNumber(errors, 'bridge', f, b[f]); });
      if (b.market !== undefined) {
        var m = b.market || {};
        if (typeof m.model !== 'string' || !m.model) errors.push('bridge comparables model is missing');
        if (typeof m.generation !== 'string' || !m.generation) errors.push('bridge comparables generation is missing');
        checkNumber(errors, 'bridge', 'yearFrom', m.yearFrom); checkNumber(errors, 'bridge', 'yearTo', m.yearTo);
        if (m.yearFrom > m.yearTo) errors.push('bridge comparables years run backwards');
      }
      if (b.features !== undefined) checkFeatures(errors, 'bridge', b.features, labels);
    }
    if (!Array.isArray(c.sensitivitySteps) || !c.sensitivitySteps.every(function (n) { return typeof n === 'number' && n > 0; }))
      errors.push('sensitivitySteps must be positive numbers');
    return errors;
  }

  function deriveFeatures(src) {
    if (!src) return undefined;
    var out = {};
    for (var k in src) {
      out[k] = { status: src[k].status, text: featureText(src[k]) };
      if (src[k].detail) out[k].detail = src[k].detail;
    }
    return out;
  }

  // Inputs → every derived figure. Does not modify its argument.
  function derive(c) {
    var common = c.common;
    var programs = c.programs.map(function (src) {
      var p = {};
      for (var k in src) p[k] = src[k];
      if (p.basePrice !== undefined) p.acquisition = p.basePrice + p.options;   // new aircraft
      p.interests      = p.shares + 1;                 // one interest retained by bop Aero
      p.equity         = 1 / p.interests;
      p.allocation     = 1 / p.shares;
      p.tax            = Math.round(p.acquisition * common.taxRate);
      p.commission     = Math.round(p.acquisition * common.commissionRate);   // capitalized, not taxed; never its own customer line
      p.capitalization = p.acquisition + p.connectivityCost + p.tax + p.commission + common.closing;
      p.capPerShare    = p.capitalization / p.shares;
      p.annualTotal    = common.fixedCost + p.management + p.reserve;
      p.annualFee      = p.annualTotal / p.shares;
      p.reserve5       = p.reserve * 5;
      // Founder's Circle add-on: same share, plus a one-time activation fee and an annual premium;
      // part of each premium seeds the liquidity reserve that bridges a Founder repurchase.
      if (src.founders && common.founders) {
        var fc = common.founders;
        p.founderActivation   = p.capPerShare * fc.activationRate;
        p.founderPremium      = p.annualFee * fc.premiumRate;
        p.founderAnnualFee    = p.annualFee + p.founderPremium;
        p.founderReserveYear  = p.founderPremium * fc.reserveShare;
        p.founderReserve5     = p.founderActivation + 5 * p.founderReserveYear;
        p.founderReservePct   = p.founderReserve5 / p.capPerShare;
      }
      p.aircraftHours  = p.maxHours * p.shares;        // flying hours the shares can use in a year
      if (src.features) p.features = deriveFeatures(src.features);
      return p;
    });
    var byKey = {};
    programs.forEach(function (p) { byKey[p.key] = p; });
    var bridge = null;
    if (c.bridge) {
      var b = c.bridge;
      bridge = {};
      for (var bk in b) bridge[bk] = b[bk];
      bridge.tax              = Math.round(b.purchasePrice * common.taxRate);
      bridge.monthlyCost      = b.monthlyLoan + b.monthlyInsurance;          // carrying cost while it serves the program
      bridge.annualCost       = bridge.monthlyCost * 12;
      // Revenue from one monthly lease (included hours only), all year
      bridge.monthlyLease     = b.leaseMonthly;
      bridge.annualLease      = b.leaseMonthly * 12;
      bridge.includedHourRate = b.leaseIncludedHours ? b.leaseMonthly / b.leaseIncludedHours : null;   // effective rate of the included hours
      bridge.monthlyNet       = bridge.monthlyLease - bridge.monthlyCost;
      bridge.annualNet        = bridge.monthlyNet * 12;
      // Hours a month, included + extra, for one monthly lease to cover the carrying cost
      bridge.breakEvenHours   = bridge.monthlyNet >= 0 ? b.leaseIncludedHours
                              : b.leaseExtraHourRate ? b.leaseIncludedHours + (-bridge.monthlyNet) / b.leaseExtraHourRate : null;
      if (b.features) bridge.features = deriveFeatures(b.features);
    }
    return {
      version: c.version, publishedAt: c.publishedAt, common: common,
      programs: programs, byKey: byKey, baseline: byKey[c.baseline],
      bridge: bridge,
      sensitivitySteps: c.sensitivitySteps.slice(),
      featureLabels: c.featureLabels || {}
    };
  }

  var api = { validate: validate, derive: derive, featureText: featureText, LIMITS: LIMITS,
              FEATURE_STATUS: FEATURE_STATUS, FEATURE_TEXT: FEATURE_TEXT, DETAIL_MAX: DETAIL_MAX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SR22TCosting = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
