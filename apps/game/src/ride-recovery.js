const pose=p=>({x:p.x,y:p.y,z:p.z,heading:p.heading});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

// Keep a short trail of places actually ridden, on the same road/elevation.
// Collision queries use the world's spatial grids; recovery adds no render work.
export class RideRecovery{
 constructor(physics,blocked,occupied=()=>false){
  this.physics=physics;this.blocked=blocked;this.occupied=occupied;this.reset();
 }
 reset(){this.trail=[];this.remember()}
 remember(){
  const p=this.physics,last=this.trail.at(-1);
  if(!p.crashed&&(!last||distance(p,last)>=1)&&!this.blocked(p)){
   this.trail.push(pose(p));if(this.trail.length>64)this.trail.shift();
  }
 }
 clear(p){
  if(this.occupied(p)||this.blocked(p))return false;
  // Leave enough room for the motorcycle, rather than recovering against a wall.
  for(const [x,z] of [[.8,0],[-.8,0],[0,.8],[0,-.8]]){
   if(this.blocked({...p,x:p.x+x,z:p.z+z}))return false;
  }
  return true;
 }
 recover(){
  const p=this.physics;
  let fallback=-1;
  for(let i=this.trail.length-1;i>=0;i--){
   const candidate=this.trail[i];
   if(!this.clear(candidate))continue;
   if(fallback<0)fallback=i;
   if(distance(candidate,p)<4)continue;
   this.physics.recover(candidate);this.trail.length=i+1;return true;
  }
  if(fallback>=0){this.physics.recover(this.trail[fallback]);this.trail.length=fallback+1;return true}
  // If traffic occupies the whole recent trail, wait for a clear spot.
  return false;
 }
 step(dt,input,ground){
  const p=this.physics,before=pose(p);
  p.step(dt,input,ground);
  if(this.blocked(p)){
   // Never let a fallen bike or the recovery grace period pass through a building.
   Object.assign(p,before);
   if(p.speed>3)p.crash();
   p.speed=0;p.throttle=0;p.acceleration=0;
  }
  // Stay fallen until the rider chooses to restart from the crash prompt.
  if(!p.crashed)this.remember();
 }
}
