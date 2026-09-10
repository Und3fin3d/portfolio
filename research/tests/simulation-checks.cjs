/* Run with: node research/tests/simulation-checks.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, 'animations', name + '.html'), 'utf8');
const between = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));
const helpers = fs.readFileSync(path.join(root, 'demo-visuals.js'), 'utf8');
const inputWaveform = fs.readFileSync(path.join(root, 'demo-input.js'), 'utf8');
function sandbox(extra = {}) { const context = { ...extra }; context.window=context; vm.createContext(context); vm.runInContext(helpers,context); vm.runInContext(inputWaveform,context); return context; }
// Preserve the comparison's stored input samples, including the pre-peak rise and undershoot.
{
 const context=sandbox();
 vm.runInContext(fs.readFileSync(path.join(root,'animations/model_output_comparison_data.js'),'utf8'),context);
 const reference=context.MODEL_OUTPUT_COMPARISON_DATA.protocols.single_spike;
 const baseline=reference.input[0], peak=Math.max(...reference.input)-baseline;
 reference.time_ms.forEach((time,index)=>assert(Math.abs(context.DemoInputSpike(time)-(reference.input[index]-baseline)/peak)<1e-10,'Shared input must match the stored comparison waveform.'));
 assert(context.DemoInputSpike(-.5)>0,'Preserve the rising voltage before the reference event.');
 assert(context.DemoInputSpike(.55)<0,'Preserve the post-peak undershoot.');
 assert.equal(context.DemoInputSpike(-10),0,'No waveform before the stored sample interval.');
 assert.equal(context.DemoInputSpike(90),0,'No waveform tail wraps into a later input.');
}
function biology(strength, frequency, kind='exc') {
  const context=sandbox({strengthSlider:{value:strength},frequencySlider:{value:frequency},kindSelect:{value:kind}});
  vm.runInContext(`let scenario='regular', responseCache=null;const firingLevel=4;`+between(source('neuro_signal_biology'),'  function timeline()','  function receivingVoltageAt(')+between(source('neuro_signal_biology'),'  function clockMap()','  function renderTime(')+`clockMap();this.trace=responseTrace();`,context);
  return context.trace;
}
const weak=biology(1,50), medium=biology(5,50), strong=biology(10,50), slow=biology(5,5), inhibitory=biology(10,100,'inh');
assert.equal(weak.spikeTimes.length,0,'Weak inputs must remain below threshold.');
assert(strong.spikeTimes.length>medium.spikeTimes.length,'Strength must change output spiking.');
assert(medium.spikeTimes.length>slow.spikeTimes.length,'Frequency must change temporal summation.');
assert.equal(inhibitory.spikeTimes.length,0,'Inhibitory input must not generate output spikes in this model.');
assert(inhibitory.voltages.some(v=>v<0),'Inhibitory input must lower voltage.');
for(const trace of [weak,medium,strong,slow,inhibitory]) {
 assert(trace.voltages.every(Number.isFinite));
 for(let i=1;i<trace.spikeTimes.length;i++)assert(trace.spikeTimes[i]-trace.spikeTimes[i-1]>=18-1e-8,'Absolute refractory interval.');
}
function memristor(strength,frequency=50) {
 const context=sandbox({strengthSlider:{value:strength},frequencySlider:{value:frequency},cursorSlider:{}});
 vm.runInContext(between(source('biological_memristor_synapse'),'  const SAMPLE_RATE_HZ','  function sampleAt(')+`buildTrace();this.trace=trace;`,context);
 return context.trace;
}
const defaultGroups=memristor(5,50);
assert.equal(defaultGroups.outputSpikes.length,3,'The default 14-input train must produce three output spikes.');
defaultGroups.outputSpikes.forEach((time,index)=>{
 const fourthInput=defaultGroups.pulses[index*4+3];
 const nextInput=defaultGroups.pulses[index*4+4];
 assert(time>=fourthInput&&time<nextInput,`Default output ${index+1} must follow input ${index*4+4}.`);
});
const outputCounts=[];
// Every manual stage must render the same sample in the diagram, readout, and graph.
{
 const context=sandbox({strengthSlider:{value:5},frequencySlider:{value:50},cursorSlider:{},steps:[],status:{textContent:''},cursorOut:{},captured:{}});
 vm.runInContext(between(source('biological_memristor_synapse'),'  const SAMPLE_RATE_HZ','  // --------------------------------------------------------- device drawing')+
   between(source('biological_memristor_synapse'),'  let lastForcedProgress = null;','  // --------------------------------------------------------------- playback')+
   `function drawScope(index){captured.index=index;}function drawDevice(sample){captured.device=sample;}function updatePathway(sample){captured.pathway=sample;}function updateReadouts(sample){captured.readout=sample;}function activeStep(){return 1;}
   buildTrace();this.check=(index,step)=>{render(index,null,step,.6);return {captured,sample:sampleAt(index)};};`,context);
 for(let step=1;step<=5;step++){
   const {captured,sample}=context.check(400.37+step*9,step);
   for(const name of ['device','pathway','readout'])for(const key of ['time','voltage','state','conductance','current','membrane','charge'])assert.equal(captured[name][key],sample[key]);
   assert.equal(captured.index,400.37+step*9);
 }
}

for(const strength of [1,5,10]) {
 const trace=memristor(strength); outputCounts.push(trace.outputSpikes.length);
 assert(trace.statePeakIndex>trace.inputPeakIndex&&trace.state[trace.statePeakIndex]>trace.state[trace.inputPeakIndex],'The conductance stage must show increasing conductance.');
 const firstGateIndex=trace.voltage.findIndex(voltage=>voltage>-20);
 for(let i=0;i<trace.count;i++){
  assert(trace.state[i]>=0&&trace.state[i]<=1,'State must remain bounded.');
  assert(trace.conductance[i]>=.6&&trace.conductance[i]<=13,'Conductance must remain bounded.');
  assert(Math.abs(trace.current[i]-(trace.conductance[i]-.6)*(0-trace.membrane[i]))<1e-8,'Displayed current and voltage must agree.');
  if(i<firstGateIndex)assert.equal(trace.current[i],0,'No injected current before the input reaches the device gate.');
 }
 for(let i=1;i<trace.outputSpikes.length;i++)assert(trace.outputSpikes[i]-trace.outputSpikes[i-1]>=20-1e-8);
 for(let i=0;i<=100;i++)assert(Math.abs(trace.clockMap.fraction(trace.clockMap.at(i/100))-i/100)<1e-10,'Playback mapping must preserve simulation time.');
}
// Constant playback must not accelerate between spikes or slow around outputs.
for(const trace of [medium,memristor(5)]) {
 const clock=trace.clockMap;
 const expected=(clock.at(1)-clock.at(0))/100;
 for(let i=1;i<=100;i++)assert(Math.abs(clock.at(i/100)-clock.at((i-1)/100)-expected)<1e-9,'Uniform progress must produce uniform simulation-time steps.');
}
// Particle position uses cumulative charge: its velocity must follow current.
{
 const trace=memristor(5);
 for(let i=1;i<trace.count;i++) {
  const meanCurrent=(trace.current[i-1]+trace.current[i])/2;
  const chargeRate=(trace.charge[i]-trace.charge[i-1])/.05;
  assert(Math.abs(chargeRate-meanCurrent)<1e-7,'Charge must increase at the displayed current rate.');
 }
 const sparse=memristor(1);
 assert.equal(sparse.charge[0],0);
 assert(trace.charge.at(-1)>sparse.charge.at(-1),'Stronger integrated current must move more charge.');
}
assert(outputCounts[2]>outputCounts[0],'Memristor strength must vary output spiking.');
const slowMemristor=memristor(10,5),fastMemristor=memristor(10,100);
assert(fastMemristor.outputSpikes.length>slowMemristor.outputSpikes.length,'Memristor frequency must change output spiking.');
assert.equal(slowMemristor.pulses[1],200);assert.equal(fastMemristor.pulses[1],10);
assert(fastMemristor.outputSpikes.every(t=>fastMemristor.current[Math.round((t+5)/.05)]>0),'Current must continue when the neuron fires.');
function memory(interval=60,tau=140) {
 const context=sandbox({scenario:{value:'pair'},interval:{value:interval},tau:{value:tau},trace:null});
 vm.runInContext(between(source('memristor_short_term_memory'),'function build(){','function historyPath(')+`build();this.trace=trace;`,context);return context.trace;
}
const retained=memory(), longGap=memory(280), fastRelaxation=memory(60,40);
function peak(trace,pulse){let peak=0;trace.times.forEach((time,i)=>{if(time>=pulse&&time<pulse+12)peak=Math.max(peak,trace.current[i]);});return peak;}
const first=peak(retained,40),second=peak(retained,100);
assert(second>first,'The same second pulse must produce more current when state remains.');
assert(peak(longGap,320)<second,'A longer gap must reduce facilitation.');
assert(peak(fastRelaxation,100)<second,'Faster relaxation must reduce facilitation.');
for(let i=0;i<retained.times.length;i++)assert.equal(retained.current[i],retained.voltage[i]*retained.conductance[i]);
const gapIndex=retained.times.indexOf(75);
assert.equal(retained.current[gapIndex],0);assert(retained.conductance[gapIndex]>10);
// The additional exploration input must retain ten spikes and complete outputs.
{
 const context={window:{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'animations/model_output_comparison_data.js'),'utf8'),context);
 const protocols=context.window.MODEL_OUTPUT_COMPARISON_DATA.protocols;
 const added=protocols.synthetic_two_bursts_10spikes;
 assert.equal(added.role,'exploration');
 const expectedEvents=[0,10,20,30,40,120,130,140,150,160];
 assert.equal(added.events_ms.length,expectedEvents.length);
 added.events_ms.forEach((time,i)=>assert(Math.abs(time-expectedEvents[i])<.001));
 for(const key of ['input','target','tm','exp2','fan','bohao']) {
  assert.equal(added[key].length,added.time_ms.length);
  assert(added[key].every(Number.isFinite));
 }
 const blum=protocols.blum_dynamic_ramp_hold_aff1;
 assert.equal(blum.events_ms.length,165,'The Blum dynamic train must retain all recorded spikes.');
 assert.equal(blum.timing_evidence,'recorded_single_ia_afferent_timing');
 assert(Math.abs(blum.events_ms.at(-1)-1352.2)<.051);
 assert.equal(blum.display_sample_count,blum.source_sample_count,'The dense train must retain its original samples.');
 for(const key of ['input','target','tm','exp2','fan','bohao']) {
  assert.equal(blum[key].length,blum.time_ms.length);
  assert(blum[key].every(Number.isFinite));
 }
 const options=[...source('model_output_comparison').matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)];
 for(const [,key,label] of options.filter(([,key])=>protocols[key])) {
  assert.equal(label.includes('· calibration'),protocols[key].role==='calibration','Only calibration inputs must carry the calibration marker.');
 }
 // The existing 220 ms view must follow playback through every stored input.
 const comparisonSource=source('model_output_comparison');
 const playback=sandbox({patterns:protocols,pattern:{},speed:{value:.5},initialProgress:.34,maximumViewMs:220,baseDuration:6500,
   canvas:{},modelChoice:{value:'tm'},laneDefinitions:[{key:'input'},{key:'target'},{key:'tm'}],matchMedia:()=>({matches:true})});
 playback.DemoPlot=(canvas,lanes,times,time,view)=>{playback.rendered={time,view};};
 vm.runInContext(between(comparisonSource,'  function selectedPattern()','  function resizeCanvas()')+
   between(comparisonSource,'  function selectedTime(','  function currentProgress(')+
   'function normalizedTrace(values){return values;}',playback);
 for(const [key,protocol] of Object.entries(protocols)) {
   playback.pattern.value=key;
   const start=protocol.time_ms[0],end=protocol.time_ms.at(-1),span=end-start,width=Math.min(span,220);
   playback.draw(playback.initialFraction());
   assert(Math.abs(playback.rendered.time-(start+width*.34))<1e-9,'The opening view must retain its previous position.');
   assert(Math.abs(span/playback.duration() - width/(6500/.5))<1e-12,'Long trains must keep the original simulation-time rate.');
   let previousStart=-Infinity;
   for(let frame=0;frame<=100;frame++) {
     playback.draw(frame/100);
     const {time,view}=playback.rendered;
     assert(Math.abs(time-(start+span*frame/100))<1e-9,'Playback must cover the full stored response.');
     assert(Math.abs(view.end-view.start-width)<1e-9,'The rolling view must keep the same time scale.');
     assert(view.start>=previousStart-1e-9&&view.start>=start-1e-9&&view.end<=end+1e-9);
     assert(time>=view.start-1e-9&&time<=view.end+1e-9,'The current response must remain visible.');
     previousStart=view.start;
   }
   assert.equal(playback.rendered.time,end,'Playback must reach the end of the stored response.');
   assert.equal(playback.rendered.view.end,end,'The final view must include the last response.');
   for(const event of protocol.events_ms) {
     playback.draw((event-start)/span);
     assert(event>=playback.rendered.view.start-1e-9&&event<=playback.rendered.view.end+1e-9,'Every input spike must enter the visible window.');
   }
 }
}
console.log('PASS: biological summation, inhibition and refractory interval; memristor coupling and playback time; memory current, retention and facilitation.');
console.log(JSON.stringify({biologySpikes:{weak:weak.spikeTimes.length,medium:medium.spikeTimes.length,strong:strong.spikeTimes.length,slow:slow.spikeTimes.length},memristorSpikes:outputCounts,memoryPulsePeaks:[first,second]}));
