// Test tooling only; index.html itself has no dependencies.
const { JSDOM } = require('jsdom');
const FakeTimers = require('@sinonjs/fake-timers');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let clock;
const dom = new JSDOM(fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8'), {
  runScripts: 'dangerously',
  beforeParse(window) { clock = FakeTimers.withGlobal(window).install(); }
});
const w = dom.window;
const d = w.document;
const el = id => d.getElementById(id);
const text = id => el(id).textContent;
const scenario = name => d.querySelector(`[data-scenario="${name}"]`).click();
const base = () => {
  assert.equal(text('seatValue'), '105°');
  assert.equal(text('climateValue'), '24°C · 3단');
  assert.equal(text('lightValue'), '60%');
  assert.equal(text('audioValue'), '보통');
  assert.equal(d.querySelectorAll('body.sleeping, body.waking, .vehicle-badge.active, .live.on').length, 0);
};
let cases = 0;
for (const name of ['driving', 'unplugged', 'failure']) {
  scenario(name);
  assert(el('startButton').disabled && el('voiceButton').disabled && el('voiceConfirm').disabled);
  w.startNap(); // Even programmatic/voice invocation cannot bypass the guard.
  clock.tick(10000);
  base();
  assert(!el('safetyNotice').hidden);
  assert.equal(text('napTimer'), '00:00');
  scenario('normal');
  assert(!el('startButton').disabled);
  assert.equal(text('modeTitle'), '파워냅 준비');
  base();
  cases++;
}
for (const state of ["{gear:'D',speed:0}", "{gear:'P',speed:1}"]) {
  w.eval(`Object.assign(vehicle, ${state}); startNap()`);
  assert(el('startButton').disabled);
  base();
  scenario('normal');
  cases++;
}
for (const phase of ['sleeping', 'waking']) {
  for (const name of ['driving', 'unplugged', 'failure']) {
    el('startButton').click();
    clock.tick(4000);
    assert.equal(text('seatValue'), '135°');
    if (phase === 'waking') {el('wakeButton').click(); clock.tick(300);}
    scenario(name);
    const charge = text('percent');
    clock.tick(10000);
    base();
    assert.equal(text('percent'), charge);
    assert.equal(text('napTimer'), '00:00');
    assert(!el('wakeButton').classList.contains('visible'));
    scenario('normal');
    assert.equal(text('modeTitle'), '파워냅 준비');
    cases++;
  }
}
// Partial sleep application: seat succeeds, climate fails, all pending work stops.
el('failNextControl').checked = true;
el('startButton').click();
clock.tick(300);
assert.equal(text('seatValue'), '135°');
clock.tick(600);
base();
assert(el('startButton').disabled);
clock.tick(10000);
base();
scenario('normal');
cases++;
// The same adapter failure while waking must also roll back.
el('startButton').click();
clock.tick(4000);
el('failNextControl').checked = true;
el('wakeButton').click();
clock.tick(1200);
base();
assert(el('startButton').disabled);
scenario('normal');
cases++;
// A vehicle update while voice confirmation is open closes the modal.
el('voiceButton').click();
assert(el('voiceModal').classList.contains('open'));
scenario('driving');
assert(!el('voiceModal').classList.contains('open'));
scenario('normal');
cases++;
// Voice -> sleep -> manual wake -> natural completion -> replay.
el('voiceButton').click();
el('voiceConfirm').click();
clock.tick(4000);
assert.equal(text('seatValue'), '135°');
assert(el('voiceButton').disabled);
el('wakeButton').click();
clock.tick(3200);
assert.equal(text('seatValue'), '118°');
clock.tick(60000);
assert.equal(text('modeTitle'), '파워냅 완료');
assert.equal(text('percent'), '80');
base();
el('startButton').click();
assert.equal(text('modeTitle'), '파워냅 준비');
cases++;
// Fully automatic sleep -> wake -> completion.
el('startButton').click();
clock.tick(44500);
assert.equal(text('modeTitle'), '점진적 기상 중');
clock.tick(20000);
assert.equal(text('modeTitle'), '파워냅 완료');
base();
el('startButton').click();
cases++;
// Rapid stop and rapid recovery/start cannot be overwritten by old callbacks.
el('startButton').click();
el('startButton').click();
clock.tick(10000);
base();
assert.equal(text('percent'), '58');
el('startButton').click();
el('startButton').click();
clock.tick(300);
scenario('unplugged');
scenario('normal');
el('startButton').click();
clock.tick(4000);
assert.equal(text('seatValue'), '135°');
assert(el('safetyNotice').hidden);
scenario('normal');
base();
cases++;
assert.equal(clock.countTimers(), 0);
clock.uninstall();
w.close();
console.log(`PASS ${cases} scenarios: guards, partial rollback, interruptions, cancellation, normal flow and replay`);
