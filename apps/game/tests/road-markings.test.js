import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {roadRibbon} from '../src/road-geometry.js';
import {roadJunctions,roadPaths,roadMarkings} from '../src/road-markings.js';

const road={id:'main',name:'Main',class:'secondary',width:14.4,lanes:4,laneWidth:3.35,oneway:false,surface:'asphalt',curb:true,points:[[0,0,0],[0,50,0]],nodeIds:['a','b']};
const dispose=paint=>[...paint.white,...paint.yellow].forEach(g=>g.dispose());
const onPavement=(ray,mesh,p,i)=>{
 ray.ray.origin.set(p.getX(i),p.getY(i),p.getZ(i));if(ray.intersectObject(mesh).length)return true;
 // Float32 rounding puts some end-cap vertices fractions of a millimetre
 // outside the shared cap. Check just inside the paint, with a 0.5 mm tolerance.
 const center=new T.Vector3();for(let j=0;j<p.count;j++)center.add(new T.Vector3().fromBufferAttribute(p,j));center.divideScalar(p.count);
 ray.ray.origin.add(center.sub(ray.ray.origin).normalize().multiplyScalar(.0005));return ray.intersectObject(mesh).length>0;
};

test('solid lane lines share pavement bends without gaps or sideways jumps',()=>{
 const b={...road,oneway:true,points:[[0,0,0],[0,19,0],[18,32,0]],nodeIds:['a','b','c']},paint=roadMarkings(b);
 const first=paint.yellow[0].getAttribute('position'),second=paint.yellow[1].getAttribute('position');
 for(let i=0;i<2;i++)for(const axis of ['X','Y','Z'])assert.equal(first[`get${axis}`](i+2),second[`get${axis}`](i));
 const mesh=new T.Mesh(roadRibbon(b.points,b.width),new T.MeshBasicMaterial({side:T.DoubleSide}));mesh.updateMatrixWorld();
 const ray=new T.Raycaster(new T.Vector3(),new T.Vector3(0,-1,0),0,.1);
 for(const g of [...paint.white,...paint.yellow]){
  const p=g.getAttribute('position'),n=g.getAttribute('normal');
  for(let i=0;i<p.count;i++){
   assert.ok(n.getY(i)>.99);
   assert.ok(onPavement(ray,mesh,p,i),`paint vertex ${i} slipped off the curved pavement`);
  }
 }
 dispose(paint);mesh.geometry.dispose();mesh.material.dispose();
});

test('dash spacing continues through short segments and reversed OSM way splits',()=>{
 const a={...road,points:[[0,0,0],[0,8,0]],nodeIds:['a','b']};
 const b={...road,id:'second',points:[[0,26,0],[0,8,0]],nodeIds:['c','b']};
 const c={...road,id:'third',points:[[0,26,0],[0,50,0]],nodeIds:['c','d']};
 const paths=roadPaths([a,b,c]);assert.equal(paths.length,1);
 const paint=roadMarkings(paths[0]),intervals=[];
 for(const g of paint.white){
  const p=g.getAttribute('position'),x=Array.from({length:p.count},(_,i)=>p.getX(i)).reduce((sum,x)=>sum+x,0)/p.count;
  if(Math.abs(x-3.35)>.01)continue;
  const y=Array.from({length:p.count},(_,i)=>-p.getZ(i)||0);intervals.push([Math.min(...y),Math.max(...y)]);
 }
 const merged=[];for(const interval of intervals.sort((a,b)=>a[0]-b[0])){const prev=merged.at(-1);if(prev&&Math.abs(prev[1]-interval[0])<.001)prev[1]=interval[1];else merged.push(interval)}
 assert.deepEqual(merged,[[0,3],[12,15],[24,27],[36,39],[48,50]]);dispose(paint);
});

test('intersection clearance spans short approach segments and the full crossing width',()=>{
 const main={...road,points:[[0,-30,0],[0,-15,0],[0,-10,0],[0,-5,0],[0,0,0],[0,30,0]],nodeIds:['a','b','c','d','cross','e']};
 const side={...road,id:'side',name:'Side',width:28,lanes:8,points:[[-30,0,0],[0,0,0],[30,0,0]],nodeIds:['f','cross','g']};
 const paths=roadPaths([main,side]),paint=roadMarkings(paths[0],roadJunctions([main,side]));
 assert.ok(paint.white.length);
 for(const g of [...paint.white,...paint.yellow]){const p=g.getAttribute('position');for(let i=0;i<p.count;i++)assert.ok(Math.abs(p.getZ(i))>=16.5-.001,'paint extends past the crossing clearance')}
 dispose(paint);
 const bridge={...side,bridge:true,points:side.points.map(p=>[p[0],p[1],8])};
 const underneath=roadMarkings(roadPaths([main,bridge])[0],roadJunctions([main,bridge]));
 assert.ok(underneath.yellow.some(g=>Math.min(...Array.from({length:4},(_,i)=>Math.abs(g.getAttribute('position').getZ(i))))<.001));dispose(underneath);
});

test('four-to-five lane changes taper continuously and retain dash phase across reversed ways',()=>{
 const a={...road,lanes:5,width:17.75,points:[[0,0,0],[0,70,0]],nodeIds:['a','b']};
 const b={...road,id:'narrow',points:[[0,100,0],[0,70,0]],nodeIds:['c','b']};
 const c={...a,id:'wide',points:[[0,100,0],[0,170,0]],nodeIds:['c','d']};
 const paths=roadPaths([a,b,c]),paints=paths.map(path=>roadMarkings(path));assert.equal(paths.length,3);
 const cap=(geometries,north)=>geometries.flatMap(g=>{const p=g.getAttribute('position');return Array.from({length:p.count},(_,i)=>i).filter(i=>Math.abs(p.getZ(i)+north)<.001).map(i=>p.getX(i))}).sort((a,b)=>a-b);
 for(const color of ['yellow','white']){
  assert.deepEqual(cap(paints[0][color],70),cap(paints[1][color],70),'matching lines must meet at the narrower section');
  assert.deepEqual(cap(paints[1][color],100),cap(paints[2][color],100));
 }
 const intervals=[];
 for(const g of paints[1].white){
  const p=g.getAttribute('position'),x=Array.from({length:p.count},(_,i)=>p.getX(i)).reduce((sum,x)=>sum+x,0)/p.count;
  if(Math.abs(x-3.35)>.001)continue;
  const y=Array.from({length:p.count},(_,i)=>-p.getZ(i));intervals.push([Math.min(...y),Math.max(...y)]);
 }
 assert.deepEqual(intervals.sort((a,b)=>a[0]-b[0]),[[72,75],[84,87],[96,99]]);
 assert.ok(paints[0].yellow.some(g=>{
  const p=g.getAttribute('position');return Math.abs(p.getX(0))>1.6&&Math.abs(p.getX(2))<.16;
 }),'the wider center lane should taper rather than jump sideways');
 paints.forEach(dispose);
});

test('one-way roads have yellow on the left and white on the right, inside their shoulders',()=>{
 const r={...road,oneway:true,lanes:2,width:11.5,pavementOffset:-.9},paint=roadMarkings(r);
 for(const g of paint.yellow){const p=g.getAttribute('position');for(let i=0;i<p.count;i++)assert.ok(p.getX(i)<-3.2)}
 assert.ok(paint.white.some(g=>g.getAttribute('position').getX(0)>3.2));
 dispose(paint);
});

test('short lane-count transitions meet both neighboring ways without overlapping tapers',()=>{
 const a={...road,points:[[0,0,0],[0,70,0]],nodeIds:['a','b']};
 const b={...road,id:'short',lanes:5,width:17.75,points:[[0,70,0],[0,82,0]],nodeIds:['b','c']};
 const c={...road,id:'wide',lanes:6,width:21.1,points:[[0,82,0],[0,160,0]],nodeIds:['c','d']};
 const paints=roadPaths([a,b,c]).map(path=>roadMarkings(path));
 const cap=(list,y)=>list.flatMap(g=>{const p=g.getAttribute('position');return Array.from({length:p.count},(_,i)=>i).filter(i=>Math.abs(p.getZ(i)+y)<.001).map(i=>p.getX(i))}).sort((a,b)=>a-b);
 // Solid white edges meet exactly; interior dashes can legitimately end here.
 const edges=list=>list.filter(g=>{const p=g.getAttribute('position');return Math.max(...Array.from({length:p.count},(_,i)=>Math.abs(p.getX(i))))>6.5});
 for(const [left,right,y] of [[0,1,70],[1,2,82]]){
  assert.deepEqual(cap(edges(paints[left].white),y),cap(edges(paints[right].white),y));
  assert.deepEqual(cap(paints[left].yellow,y),cap(paints[right].yellow,y));
 }
 paints.forEach(dispose);
});

test('the entire active map keeps its paint on its rendered pavement with a bounded budget',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../public/assets/compact-world.json',import.meta.url))),nodes=roadJunctions(data.roads),paths=roadPaths(data.roads,nodes);
 const material=new T.MeshBasicMaterial({side:T.DoubleSide}),ray=new T.Raycaster(new T.Vector3(),new T.Vector3(0,-1,0),0,.08);let triangles=0;
 for(const path of paths){
  const paint=roadMarkings(path,nodes);if(!paint.white.length&&!paint.yellow.length)continue;
  const mesh=new T.Mesh(roadRibbon(path.points,path.width,path.pavementOffset||0),material);mesh.updateMatrixWorld();
  for(const g of [...paint.white,...paint.yellow]){
   triangles+=g.index.count/3;const p=g.getAttribute('position');
   for(let i=0;i<p.count;i++)assert.ok(onPavement(ray,mesh,p,i),`${path.name} paint leaves its pavement at ${p.getX(i)}, ${p.getZ(i)}`);
  }
  dispose(paint);mesh.geometry.dispose();
 }
 assert.ok(triangles>1000&&triangles<45000,`${triangles} paint triangles exceed the map budget`);material.dispose();
});
