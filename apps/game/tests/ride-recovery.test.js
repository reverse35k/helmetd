import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MotorcyclePhysics} from '../src/physics.js';
import {RideRecovery} from '../src/ride-recovery.js';

const input={throttle:0,brake:0,steer:0,clutch:0,rearBrake:0};
const ground={height:7,surface:'asphalt'};
function ride(blocked,occupied){
 const p=new MotorcyclePhysics();p.reset({x:100,y:7,z:50,heading:Math.PI/2});
 return {p,recovery:new RideRecovery(p,blocked,occupied)};
}
function tick(recovery,seconds){for(let i=0;i<Math.ceil(seconds*120);i++)recovery.step(1/120,input,ground)}

test('building impact waits for restart, then recovers nearby with distance and elevation intact',()=>{
 const {p,recovery}=ride(p=>p.x>=110);p.distance=823;p.speed=14;
 for(let i=0;i<240&&!p.crashed;i++)recovery.step(1/120,input,ground);
 assert.ok(p.crashed);assert.ok(p.x<110);const impact=p.x,travel=p.distance;
 tick(recovery,3);assert.ok(p.crashed);assert.equal(p.x,impact);assert.equal(p.distance,travel);
 assert.equal(recovery.recover(),true);
 assert.equal(p.crashed,false);assert.ok(impact-p.x>=4&&impact-p.x<6);
 assert.equal(p.distance,travel);assert.equal(p.y,7);assert.equal(p.heading,Math.PI/2);
 assert.equal(p.lean,0);assert.equal(p.speed,0);assert.equal(p.gear,1);
});

test('a low-speed bump stops safely without a crash or clearing progress',()=>{
 const {p,recovery}=ride(p=>p.x>=110);p.x=109.99;p.speed=2;p.distance=900;
 recovery.step(1/120,input,ground);
 assert.equal(p.x,109.99);assert.equal(p.speed,0);assert.equal(p.crashed,false);assert.ok(p.distance>=900);
});

test('S can back away from a wall and reverse still stops at other obstacles',()=>{
 const {p,recovery}=ride(p=>p.x>=110||p.x<105);p.x=109.99;p.distance=900;
 const backing={...input,brake:1,reverse:1};
 for(let i=0;i<600;i++)recovery.step(1/120,backing,ground);
 assert.ok(p.x<106&&p.x>=105);assert.equal(p.crashed,false);assert.ok(p.distance>900);
 assert.equal(p.speed,0);
});

test('recovery grace still blocks buildings, barriers, and map edges',()=>{
 for(const blocked of [p=>p.x>=110,p=>p.x>=110&&p.x<=111&&p.y===7,p=>p.x>110]){
  const {p,recovery}=ride(blocked);p.recover({x:109.99,y:7,z:50,heading:Math.PI/2});p.speed=20;
  recovery.step(1/120,input,ground);
  assert.equal(p.x,109.99);assert.equal(p.speed,0);assert.equal(p.crashed,false);
 }
});

test('traffic recovery avoids occupied spots and prevents immediate repeated crashes',()=>{
 const {p,recovery}=ride(()=>false,p=>p.x>107);
 for(let x=101;x<=112;x++){p.x=x;recovery.remember()}
 p.distance=1520;p.crash();tick(recovery,.7);assert.equal(p.crashed,true);recovery.recover();
 assert.ok(p.x<=107);assert.equal(p.distance,1520);assert.equal(p.crashed,false);
 p.crash();assert.equal(p.crashed,false);
 tick(recovery,1.6);p.crash();assert.equal(p.crashed,true);
});

test('falls stay in place and resume once traffic clears without resetting the ride',()=>{
 let occupied=true;const {p,recovery}=ride(()=>false,()=>occupied);
 p.speed=30;p.distance=2050;p.crash();tick(recovery,2);
 assert.equal(p.crashed,true);assert.equal(p.x,100);assert.equal(p.z,50);
 assert.equal(recovery.recover(),false);
 occupied=false;tick(recovery,.01);assert.equal(p.crashed,true);assert.equal(recovery.recover(),true);
 assert.equal(p.crashed,false);assert.equal(p.distance,2050);
});

test('selecting a new start clears the old recovery trail',()=>{
 const {p,recovery}=ride(()=>false);p.x=110;recovery.remember();
 p.reset({x:500,y:7,z:300,heading:0});recovery.reset();p.distance=50;p.crash();tick(recovery,.7);recovery.recover();
 assert.equal(p.x,500);assert.equal(p.z,300);assert.equal(p.distance,50);assert.equal(p.crashed,false);
});
