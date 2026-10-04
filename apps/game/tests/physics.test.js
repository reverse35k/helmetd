import {test} from 'node:test';import assert from 'node:assert/strict';import {MotorcyclePhysics,ratios,turnRate} from '../src/physics.js';
const road={height:0,surface:'asphalt'};const input={throttle:1,brake:0,steer:0,clutch:0,rearBrake:0};
test('six ratios decrease and shifts affect coupled engine RPM',()=>{const p=new MotorcyclePhysics();p.speed=20;for(let i=0;i<120;i++)p.step(1/120,input,road);const before=p.rpm;p.shift(1);assert.equal(p.gear,2);assert.ok(p.rpm<before);assert.equal(ratios.length,7)});
test('neutral decouples engine from rear wheel',()=>{const p=new MotorcyclePhysics();p.gear=0;for(let i=0;i<600;i++)p.step(1/120,input,road);assert.equal(p.speed,0);assert.ok(p.rpm>9000)});
test('throttle accelerates, braking stops without reversing',()=>{const p=new MotorcyclePhysics();for(let i=0;i<600;i++)p.step(1/120,input,road);assert.ok(p.speed>10);for(let i=0;i<900;i++)p.step(1/120,{...input,throttle:0,brake:1},road);assert.equal(p.speed,0)});
test('lean and turn directions agree; state stays finite',()=>{const p=new MotorcyclePhysics();for(let i=0;i<1200;i++)p.step(1/120,{...input,steer:.5},road);assert.ok(p.heading>0);assert.ok(p.lean<0);for(const n of ['x','z','rpm','speed','lean'])assert.ok(Number.isFinite(p[n]))});

test('low-speed circles fit a four-metre radius and city-speed corners tighten both ways',()=>{
 for(const speed of [2,4.5,9])for(const steer of [-1,1]){
  const p=new MotorcyclePhysics(),controls={...input,throttle:0,clutch:1,steer};
  // Hold a cruise speed to measure the path independently of engine acceleration.
  for(let i=0;i<240;i++){p.speed=speed;p.step(1/120,controls,road)}
  const heading=p.heading,distance=p.distance;
  for(let i=0;i<120;i++){p.speed=speed;p.step(1/120,controls,road)}
  const radius=(p.distance-distance)/Math.abs(p.heading-heading);
  assert.ok(radius<(speed===2?4.05:speed===4.5?5:9),`${speed} m/s turning radius was ${radius} m`);
  assert.equal(Math.sign(p.heading),steer);assert.equal(p.crashed,false);
 }
});
test('turning stays smooth across walking speeds and restrained at high speeds',()=>{
 assert.equal(turnRate(0,1,-.5),0);
 for(const speed of [2,3,8])assert.ok(Math.abs(turnRate(speed-.001,1,-.25)-turnRate(speed+.001,1,-.25))<.005);
 assert.ok(Math.abs(turnRate(35,1,-.82))<.35);
 assert.equal(turnRate(2,1,0,true),-.5);
 const p=new MotorcyclePhysics();p.step(.1,{...input,throttle:0,steer:1},road);
 assert.ok(p.steer>=.65,'initial steering input should respond quickly');assert.equal(p.heading,0);
});

const backing={...input,throttle:0,brake:1,reverse:1};
const coast={...input,throttle:0};
test('S at a stop backs up slowly in the bike heading and adds to distance',()=>{
 for(const heading of [0,Math.PI/2,Math.PI]){
  const p=new MotorcyclePhysics();p.reset({x:30,z:40,y:0,heading});p.distance=500;
  for(let i=0;i<600;i++)p.step(1/120,backing,road);
  assert.equal(p.reversing,true);assert.equal(p.speed,2);
  const travel=p.distance-500;
  assert.ok(travel>5);assert.ok(Math.abs(p.x-(30-Math.sin(heading)*travel))<1e-8);
  assert.ok(Math.abs(p.z-(40+Math.cos(heading)*travel))<1e-8);
  assert.equal(p.brake,0);assert.equal(p.shift(1),false);
 }
});
test('S brakes a moving bike all the way to zero before engaging reverse',()=>{
 const p=new MotorcyclePhysics();p.speed=15;
 for(let i=0;i<1000&&p.speed>0;i++){
  const previousZ=p.z;p.step(1/120,backing,road);
  assert.equal(p.reversing,false);assert.ok(p.z<=previousZ);
 }
 assert.equal(p.speed,0);const stopped=p.z;
 p.step(1/120,backing,road);assert.equal(p.reversing,true);assert.ok(p.z>stopped);
});
test('releasing S stops reverse and W brakes before resuming forward motion',()=>{
 const p=new MotorcyclePhysics();for(let i=0;i<240;i++)p.step(1/120,backing,road);
 for(let i=0;i<120;i++)p.step(1/120,coast,road);
 assert.equal(p.speed,0);assert.equal(p.reversing,false);
 for(let i=0;i<240;i++)p.step(1/120,backing,road);
 for(let i=0;i<1000&&p.reversing;i++){
  const previous=p.z;p.step(1/120,input,road);assert.ok(p.z>=previous);
 }
 assert.equal(p.speed,0);const stopped=p.z;
 for(let i=0;i<120;i++)p.step(1/120,input,road);
 assert.equal(p.reversing,false);assert.ok(p.z<stopped);
});
test('backing steering turns correctly, stays upright and respects the rear brake',()=>{
 const p=new MotorcyclePhysics();for(let i=0;i<600;i++)p.step(1/120,{...backing,steer:.6},road);
 assert.ok(p.heading<0);assert.equal(p.lean,0);assert.equal(p.crashed,false);
 for(const n of ['x','z','rpm','speed','lean','suspension'])assert.ok(Number.isFinite(p[n]));
 for(let i=0;i<120;i++)p.step(1/120,{...backing,rearBrake:1},road);
 assert.equal(p.speed,0);
 const stopped=new MotorcyclePhysics();for(let i=0;i<120;i++)stopped.step(1/120,{...coast,brake:1,rearBrake:1},road);
 assert.equal(stopped.speed,0);assert.equal(stopped.reversing,false);
});
