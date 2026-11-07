import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spacecraftPassage} from '../ambient.js';

// Read the actual per-page schedules so a future scene edit cannot silently
// reintroduce a ship on every visit or shorten the long quiet interval.
const source=await readFile(new URL('../ambient.js',import.meta.url),'utf8');
const flights=[...source.matchAll(/\{name:'([^']+)',kind:'ship',[^\n]*flight:\{([^}]+)\}/g)].map(([,name,definition])=>({
  name,
  ...Object.fromEntries(['delay','duration','gap'].map(key=>[key,Number(definition.match(new RegExp(`\\b${key}:([\\d.]+)`))?.[1])])),
}));

test('every page has a delayed and genuinely rare spacecraft schedule',()=>{
  assert.equal(flights.length,6,'all six page scenes have a spacecraft schedule');
  for(const flight of flights){
    assert.ok(flight.delay>=135&&flight.delay<=210,`${flight.name} waits at least two minutes after entry`);
    assert.ok(flight.duration>=32&&flight.duration<=42,`${flight.name} preserves a complete, calm crossing`);
    assert.ok(flight.gap>=660,`${flight.name} stays absent for at least eleven minutes between crossings`);
    assert.ok(flight.duration/(flight.duration+flight.gap)<.06,`${flight.name} is absent for more than 94 percent of recurring scene time`);
  }
});

for(const flight of flights){
  test(`${flight.name}: delayed entry, full crossing, quiet interval and repeated boundaries`,()=>{
    const period=flight.duration+flight.gap;
    for(const time of [-10,0,flight.delay-.001])assert.deepEqual(spacecraftPassage(time,flight),{state:'waiting',flying:false,progress:0});
    for(const cycle of [0,1,2,8,100]){
      const start=flight.delay+cycle*period;
      assert.deepEqual(spacecraftPassage(start,flight),{state:'flight',flying:true,progress:0});
      assert.deepEqual(spacecraftPassage(start+flight.duration/2,flight),{state:'flight',flying:true,progress:.5});
      const last=spacecraftPassage(start+flight.duration-.001,flight);
      assert.equal(last.flying,true);assert.ok(last.progress>.999&&last.progress<1);
      assert.deepEqual(spacecraftPassage(start+flight.duration,flight),{state:'quiet',flying:false,progress:1});
      assert.deepEqual(spacecraftPassage(start+flight.duration+flight.gap/2,flight),{state:'quiet',flying:false,progress:1});
      assert.deepEqual(spacecraftPassage(start+period-.001,flight),{state:'quiet',flying:false,progress:1});
      assert.deepEqual(spacecraftPassage(start+period,flight),{state:'flight',flying:true,progress:0});
    }
  });
}
