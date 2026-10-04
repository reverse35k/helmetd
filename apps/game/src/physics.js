export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const ratios=[0,2.667,2,1.6,1.3,1.13,1.04];
const primary=1.925,final=2.687,radius=.305,mass=268;
export function engineTorque(rpm){const points=[[1200,25],[3000,48],[5000,61],[6800,68],[8500,63],[10500,42],[11200,0]];for(let i=1;i<points.length;i++){if(rpm<points[i][0]){const [x,y]=points[i-1],[xx,yy]=points[i];return y+(yy-y)*clamp((rpm-x)/(xx-x),0,1)}}return 0}
export function turnRate(speed,steer,lean,reversing=false){
 // A four-metre parking turn blends smoothly into lean-based steering at speed.
 const slow=steer*speed*.25*(reversing?-1:1);
 if(reversing)return slow;
 const t=clamp((speed-2)/6,0,1),blend=t*t*(3-2*t);
 const banking=speed>.05?-9.81*Math.tan(lean)/speed:0;
 return slow+(banking-slow)*blend;
}
export class MotorcyclePhysics{
 constructor(){this.reset({x:0,z:0,y:0,heading:0})}
 reset(spawn){Object.assign(this,{...spawn,speed:0,reversing:false,rpm:1300,gear:1,lean:0,pitch:0,slip:0,throttle:0,brake:0,steer:0,shiftCut:0,crashed:false,crashTime:0,crashGrace:0,distance:0,acceleration:0,suspension:0,suspensionVelocity:0,wheelie:0,lastShift:0,clutch:0,surface:'asphalt'})}
 recover(pose){const distance=this.distance;this.reset(pose);this.distance=distance;this.crashGrace=1.5}
 shift(direction){const next=clamp(this.gear+direction,0,6);if(this.reversing||next===this.gear||this.shiftCut>0)return false;const old=this.gear;this.gear=next;this.shiftCut=.09;this.lastShift=direction;if(next&&old)this.rpm=clamp(this.rpm*ratios[next]/ratios[old],1300,11200);return true}
 crash(){if(this.crashed||this.crashGrace>0)return;this.crashed=true;this.crashTime=0;this.throttle=0}
 step(dt,input,ground){
  this.crashGrace=Math.max(0,this.crashGrace-dt);
  if(this.crashed){this.crashTime+=dt;this.speed=0;this.lean+=(1.45-this.lean)*Math.min(1,dt*6);return}
  this.shiftCut=Math.max(0,this.shiftCut-dt);this.throttle+=(input.throttle-this.throttle)*Math.min(1,dt*6);this.brake=input.brake;this.clutch=input.clutch||0;this.steer+=(input.steer-this.steer)*Math.min(1,dt*7);
  const mu=ground.surface==='grass'?.43:ground.surface==='gravel'?.6:1.08;this.surface=ground.surface;
  const reverse=input.reverse||0;
  if(this.reversing||(reverse>0&&this.speed===0&&input.throttle===0)){
   // Slow assisted backing: releasing S stops; W brakes before moving forward.
   this.reversing=true;
   const backing=reverse>0&&input.throttle===0&&!input.rearBrake,oldSpeed=this.speed;
   this.speed=backing?Math.min(2,this.speed+1.6*reverse*dt):Math.max(0,this.speed-(input.throttle>0||input.rearBrake?4:2.5)*dt);
   this.acceleration=(oldSpeed-this.speed)/dt;this.throttle=0;this.slip=0;
   this.brake=!backing&&oldSpeed>0?1:0;
   this.rpm+=((backing?1500:1300)-this.rpm)*Math.min(1,dt*14);
   if(this.speed===0&&!backing)this.reversing=false;
  }else{
  const ratio=ratios[this.gear]*primary*final;
  const wheelRpm=this.speed/radius*60/(2*Math.PI);const coupled=wheelRpm*ratio;
  const launchRpm=1300+this.throttle*3200;const target=this.gear&&!this.clutch?Math.max(launchRpm,coupled):1300+this.throttle*9600;
  this.rpm+=(target-this.rpm)*Math.min(1,dt*14);this.rpm=clamp(this.rpm,1200,11200);
  const limiter=this.rpm>10800?.05:1;const clutchTransfer=(1-this.clutch)*clamp((this.rpm-1200)/1200,0,1);
  let drive=engineTorque(this.rpm)*this.throttle*ratio*.93/radius*clutchTransfer*limiter*(this.shiftCut>0?0:1);
  const rearLoad=mass*9.81*.53+mass*this.acceleration*.57/1.4;const traction=mu*Math.max(400,rearLoad);
  this.slip=clamp((drive-traction)/1800,0,1);drive=Math.min(drive,traction);
  const maxBrake=mass*9.81*mu;const brake=this.brake*maxBrake*.9;this.slip=Math.max(this.slip,input.rearBrake*this.speed/20);
  const engineBrake=this.gear&&!this.clutch?(1-this.throttle)*ratio*1.9:0;
  const drag=.5*1.225*.36*this.speed*this.speed;const roll=mass*9.81*.014*(this.speed>.01?1:0);
  const slope=ground.slope||0;this.acceleration=(drive-brake-engineBrake-drag-roll-mass*9.81*slope)/mass;
  this.speed=clamp(this.speed+this.acceleration*dt,0,90);
  }
  // Speed-sensitive countersteer/lean response with low-speed balancing assistance.
  const targetLean=this.reversing?0:-this.steer*clamp(this.speed/9,0,1)*.82;
  this.lean+=(targetLean-this.lean)*Math.min(1,dt*(4.5+1/(this.speed+1)));
  const velocity=this.reversing?-this.speed:this.speed;
  const yaw=turnRate(this.speed,this.steer,this.lean,this.reversing);
  this.heading+=yaw*dt;this.x+=Math.sin(this.heading)*velocity*dt;this.z-=Math.cos(this.heading)*velocity*dt;this.distance+=this.speed*dt;
  const loadPitch=clamp(-this.acceleration*.009,-.09,.075);this.pitch+=(loadPitch-this.pitch)*Math.min(1,dt*5);
  const springTarget=clamp(-this.acceleration*.0025,-.025,.03)+Math.sin(this.distance*1.3)*.002*Math.min(this.speed/8,1);
  this.suspensionVelocity+=(springTarget-this.suspension)*90*dt-this.suspensionVelocity*15*dt;this.suspension+=this.suspensionVelocity*dt;
  this.y+=(ground.height-this.y)*Math.min(1,dt*12);this.wheelie+=(Math.max(0,this.acceleration-7)*.02-this.wheelie)*Math.min(1,dt*3);
  if(Math.abs(this.lean)>.6&&mu<.5&&this.speed>17)this.crash();
 }
}
