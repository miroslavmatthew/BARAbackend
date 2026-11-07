import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

export const id = value => createHash('sha256').update(value).digest('hex').slice(0, 24);
const label = 'SIMULATED DATA — generated scenario, not a real observation.';
const centers = [[113.91, -2.21], [101.45, 0.51], [104.75, -2.99], [109.34, -0.03]];
export function generate({ seed = 'bara-demo', sessions = 100, captures = 12, start = '2026-11-06T00:00:00Z', intervalSeconds = 60 } = {}) {
  if (![sessions, captures, intervalSeconds].every(n => Number.isSafeInteger(n) && n > 0) || sessions > 10000 || captures > 1000 || sessions * captures > 100000) throw new Error('Use positive integers; maximum 10,000 sessions, 1,000 captures/session and 100,000 total captures.');
  const epoch = Date.parse(start);
  if (!Number.isFinite(epoch)) throw new Error('Invalid start timestamp.');
  // Hash-derived draws keep a seed reproducible while varying every observation.
  const draw = (s, c, field) => parseInt(id(`${seed}:${s}:${c}:${field}`).slice(0, 8), 16) / 0x100000000;
  const pick = (s, c, field, values) => values[Math.floor(draw(s, c, field) * values.length)];
  const incidents = [], sessionRows = [], snapshots = [];
  const incidentCount = Math.max(1, Math.ceil(sessions / 5));
  for (let i = 0; i < incidentCount; i++) {
    const center = centers[i % centers.length];
    incidents.push({ _id: id(`${seed}:incident:${i}`), synthetic: true, label,
      name: `Simulation ${i + 1}`, kind: ['woodland', 'grass', 'waste', 'building', 'smoke-only'][i % 5],
      // Scenario truth only: never infer a fire coordinate from a witness GPS fix.
      groundTruthOrigin: { type: 'Point', coordinates: [center[0] + Math.floor(i / 4) * 0.025, center[1]] } });
  }
  for (let s = 0; s < sessions; s++) {
    const incident = incidents[s % incidentCount];
    const sessionId = id(`${seed}:session:${s}`);
    const began = epoch + (s % 5) * 20000;
    sessionRows.push({ _id: sessionId, startedAt: new Date(began), endedAt: new Date(began + (captures - 1) * intervalSeconds * 1000 + 1000), status: 'ended', synthetic: true, incidentId: incident._id });
    for (let c = 0; c < captures; c++) {
      const progress = c / Math.max(1, captures - 1);
      const phase = progress < 0.2 ? 'reported' : progress < 0.55 ? 'active' : progress < 0.8 ? 'suppression' : 'monitoring';
      const obscured = draw(s, c, 'clarity') < 0.13;
      const unavailable = draw(s, c, 'availability') < 0.035;
      const burning = !obscured && incident.kind !== 'smoke-only' && draw(s, c, 'flames') < ({ reported: 0.2, active: 0.8, suppression: 0.5, monitoring: 0 })[phase];
      const smoke = !obscured && draw(s, c, 'smoke') < (burning ? 0.8 : phase === 'monitoring' ? 0.35 : 0.55);
      const suppression = !obscured && phase === 'suppression' && incident.kind !== 'smoke-only' && draw(s, c, 'suppression') < 0.7;
      const smokeCategory = obscured ? 'UNCERTAIN' : !smoke ? 'NOT_APPLICABLE' : ['WHITE', 'GRAY', 'BLACK', 'BROWN', 'MIXED'][Math.floor(draw(s, c, 'color') * 5)];
      const smokeOrigin = obscured ? 'UNCERTAIN' : !smoke ? 'NOT_APPLICABLE' : draw(s, c, 'origin') < 0.65 ? 'VISIBLE' : pick(s, c, 'hidden-origin', ['OBSCURED', 'OUTSIDE_FRAME', 'UNCERTAIN']);
      const targetLocatable = !obscured && (burning || (smoke && smokeOrigin === 'VISIBLE'));
      const [lon, lat] = incident.groundTruthOrigin.coordinates;
      const angle = (s * 73 + c * 2) * Math.PI / 180;
      const radius = 0.004 + (s % 4) * 0.001;
      const coordinates = [lon + Math.sin(angle) * radius, lat + Math.cos(angle) * radius];
      const direction = (Math.atan2((lon - coordinates[0]) * Math.cos(lat * Math.PI / 180), lat - coordinates[1]) * 180 / Math.PI + 360) % 360;
      const classification = obscured ? 'UNCERTAIN' : burning ? 'VISIBLE' : 'NOT_VISIBLE';
      const limitations = obscured ? pick(s, c, 'limitation', ['Simulated vegetation obstruction.', 'Simulated heavy blur.', 'Simulated darkness.', 'Simulated dense haze.']) : 'Synthetic observation; no real image evidence.';
      const visualEvidence = obscured ? 'The simulated view cannot establish whether flames are present.' : burning ? 'Simulated identifiable flames at the source.' : 'No identifiable flames in this simulated view; incident-wide absence is not established.';
      const locationInImage = obscured ? 'not applicable' : pick(s, c, 'frame-location', ['lower left', 'lower center', 'lower right', 'center', 'upper left', 'upper right']);
      const materialUnknown = burning && draw(s, c, 'material-clarity') < 0.18;
      const categoryPool = ({ woodland: ['TREES', 'SHRUBS', 'GROUND_SURFACE', 'GRASS'], grass: ['GRASS', 'SHRUBS'], waste: ['WASTE'], building: ['BUILDINGS', 'WASTE'] })[incident.kind] ?? [];
      const materialCategories = !burning ? [] : materialUnknown ? ['UNKNOWN'] : categoryPool.filter((_, i) => i === Math.floor(draw(s, c, 'primary-material') * categoryPool.length) || draw(s, c, `extra-material-${i}`) < 0.3);
      const forestMaterial = { TREES: 'trees', SHRUBS: 'shrubs', GROUND_SURFACE: 'surface litter', GRASS: 'ground vegetation', WASTE: 'other', BUILDINGS: 'other', UNKNOWN: 'unknown' };
      const settingUnclear = obscured || draw(s, c, 'setting-clarity') < 0.14;
      const forestVisible = burning && !materialUnknown && !settingUnclear && incident.kind === 'woodland';
      const suppressionUnclear = obscured || (phase === 'suppression' && draw(s, c, 'action-clarity') < 0.2);
      const method = pick(s, c, 'method', ['hose stream', 'extinguisher discharge', 'tool applied to burning material', 'aerial drop']);
      const roleEvidence = {
        FIREFIGHTER: 'Simulated readable firefighter marking tied to the actor.',
        OTHER_RESPONDER: 'Simulated readable emergency response unit marking tied to the actor.',
        CIVILIAN: 'Simulated readable volunteer resident group identification tied to the actor.',
        PERSON_ROLE_UNKNOWN: 'Actor visible; no reliable role identifier.',
        OPERATOR_NOT_VISIBLE: 'Equipment discharge visible; operator outside the simulated frame.',
      };
      const actorRoles = ['FIREFIGHTER', 'OTHER_RESPONDER', 'CIVILIAN', 'PERSON_ROLE_UNKNOWN', 'OPERATOR_NOT_VISIBLE'];
      const actors = suppressionUnclear ? (obscured || draw(s, c, 'possible-actor') < 0.5 ? [] : [{ role: 'PERSON_ROLE_UNKNOWN', linkedAction: `Possible ${method} near ${locationInImage}; connection to source unclear.`, roleEvidence: roleEvidence.PERSON_ROLE_UNKNOWN }]) : !suppression ? [{ role: 'NOT_APPLICABLE', linkedAction: 'not applicable', roleEvidence: 'not applicable' }] : Array.from({ length: method === 'aerial drop' ? 1 : draw(s, c, 'actor-count') < 0.3 ? 2 : 1 }, (_, i) => {
        const role = method === 'aerial drop' ? 'OPERATOR_NOT_VISIBLE' : pick(s, c, `actor-role-${i}`, actorRoles);
        return { role, linkedAction: `Simulated ${method} directed at the source near ${locationInImage}.`, roleEvidence: roleEvidence[role] };
      });
      const suppliedMeasurement = targetLocatable && draw(s, c, 'measured-reference') < 0.3;
      const horizontalMeters = Math.round(Math.hypot((lon - coordinates[0]) * Math.cos(lat * Math.PI / 180), lat - coordinates[1]) * 111320 / 10) * 10;
      const relativeDepth = targetLocatable ? pick(s, c, 'depth', ['FOREGROUND', 'MIDGROUND', 'BACKGROUND']) : 'UNCERTAIN';
      const common = { visualEvidence, locationInImage, limitations };
      const results = {
        visible_flames: { classification, ...common },
        forest_woodland_fire: { classification: settingUnclear || materialUnknown ? 'UNCERTAIN' : forestVisible ? 'FOREST_FIRE_VISIBLE' : 'NO_VISIBLE_FOREST_FIRE', activeBurningEvidence: visualEvidence, forestSettingEvidence: settingUnclear ? 'Simulated setting is obscured or outside the frame.' : incident.kind === 'woodland' ? 'Simulated wooded setting.' : 'not established', burningMaterial: materialCategories.map(category => forestMaterial[category]), locationInImage, limitations: settingUnclear ? 'Wooded setting or connection to burning cannot be assessed.' : limitations },
        fire_suppression: { classification: suppressionUnclear ? 'UNCERTAIN' : suppression ? 'VISIBLE' : 'NOT_VISIBLE', visualEvidence: suppressionUnclear ? 'Suppression action or its connection to source cannot be assessed.' : suppression ? `Simulated ${method} directed at the source.` : 'none identifiable', apparentMethodAndTarget: suppressionUnclear ? 'Possible suppression; method or target not reliably established.' : suppression ? `${method} at source.` : 'not identifiable', actors, locationInImage: suppression || suppressionUnclear ? locationInImage : 'not applicable', limitations: suppressionUnclear ? 'Action, target or operator obscured or ambiguous.' : limitations },
        smoke_visibility_color_origin: { classification: obscured ? 'UNCERTAIN' : smoke ? 'VISIBLE' : 'NOT_VISIBLE', smokeCategory, visualEvidence: obscured ? 'Smoke cannot be assessed in the simulated obstructed view.' : smoke ? `Simulated ${smokeCategory.toLowerCase()} smoke plume.` : 'No identifiable smoke in this simulated view.', locationInImage: smoke ? 'center' : 'not applicable', apparentOrigin: smokeOrigin, originEvidence: smokeOrigin === 'VISIBLE' ? 'Simulated smoke emerging at source.' : smokeOrigin === 'NOT_APPLICABLE' ? 'not applicable' : 'Source hidden.', limitations },
        visibly_burning_material: { classification: obscured || materialUnknown ? 'UNCERTAIN' : burning ? 'IDENTIFIABLE' : 'NO_VISIBLE_BURNING', burningMaterials: materialCategories.map(category => ({ category, visualEvidence: category === 'UNKNOWN' ? 'Simulated combustion visible; material cannot be identified.' : `Simulated combustion visibly associated with ${category.toLowerCase()}.`, locationInImage })), ...common, peatInvolvement: 'UNCONFIRMED', peatExplanation: 'Peat involvement cannot be established from an image alone.' },
        camera_to_fire_distance: { classification: suppliedMeasurement ? 'ESTIMABLE' : targetLocatable ? 'RELATIVE_ONLY' : 'NOT_DETERMINABLE', target: burning ? 'VISIBLE_FIRE' : targetLocatable ? 'APPARENT_SMOKE_ORIGIN' : 'NOT_LOCATABLE', targetLocationInImage: targetLocatable ? locationInImage : 'not applicable', approximateDistance: suppliedMeasurement ? `approximately ${horizontalMeters} meters horizontal map distance` : 'not determinable', relativeDepth: suppliedMeasurement ? 'BACKGROUND' : relativeDepth, evidenceAndLimitations: suppliedMeasurement ? `SIMULATED supplied mapped target (${lat}, ${lon}) and witness GPS (${coordinates[1]}, ${coordinates[0]}) support a horizontal map distance rounded to 10 meters; not inferred from the image.` : targetLocatable ? `Simulated visual depth cues place the source in the ${relativeDepth.toLowerCase()}; no measured reference supplied.` : 'Target cannot be located in this simulated view; no numeric distance is supported.' },
      };
      const time = new Date(began + c * intervalSeconds * 1000);
      snapshots.push({ _id: id(`${seed}:snapshot:${s}:${c}`), sessionId, time, createdAt: new Date(time.getTime() + 2000 + (s % 7) * 1000), analyzedAt: new Date(time.getTime() + 3000 + (s % 7) * 1000), location: { type: 'Point', coordinates }, direction,
        synthetic: true, incidentId: incident._id, simulation: { phase, clarity: obscured ? 'obscured' : 'clear', unavailable,
          unavailableCriteria: Object.keys(results).filter(key => draw(s, c, `available-${key}`) < 0.025),
          ...(suppliedMeasurement ? { suppliedMappedTarget: { type: 'Point', coordinates: [lon, lat] }, measurementSource: 'synthetic supplied map reference' } : {}) }, results,
        analysisMessage: `${label} Scenario phase: ${phase}. Flames: ${classification}. Smoke: ${results.smoke_visibility_color_origin.classification}. ${limitations} Monitoring does not confirm extinguishment.` });
    }
  }
  return { incidents, sessions: sessionRows, snapshots: snapshots.sort((a, b) => a.createdAt - b.createdAt || a._id.localeCompare(b._id)) };
}

// A deliberately schematic PNG fixture; no photograph or AI analysis is claimed.
export function fixturePng() {
  const crc = bytes => { let c = 0xffffffff; for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const payload = Buffer.concat([Buffer.from(type), data]); const size = Buffer.alloc(4); size.writeUInt32BE(data.length); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(payload)); return Buffer.concat([size, payload, sum]); };
  const w = 320, h = 180, pixels = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const offset = y * (w * 3 + 1) + 1 + x * 3;
    const stripe = y < 30 || y > 150;
    const color = stripe ? (Math.floor((x + y) / 16) % 2 ? [245, 184, 45] : [35, 35, 40]) : [42, 52, 62];
    pixels.set(color, offset);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(w); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('tEXt', Buffer.from('Description\0SYNTHETIC SIMULATION PLACEHOLDER - not a photograph')), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
