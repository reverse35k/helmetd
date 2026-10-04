import * as T from 'three';
import {roadSections} from './road-geometry.js';

const painted=road=>!['service','residential','living_street'].includes(road.class);
const named=road=>road.name&&road.name!=='Local road';
const length=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);

export function roadJunctions(roads){
 const nodes=new Map();
 for(const road of roads)for(let i=1;i<road.points.length;i++)for(const [at,other] of [[i-1,i],[i,i-1]]){
  const p=road.points[at],q=road.points[other],len=length(p,q);if(len<.01)continue;
  const node=road.nodeIds[at];if(!nodes.has(node))nodes.set(node,[]);
  nodes.get(node).push({road,point:p,dx:(q[0]-p[0])/len,dy:(q[1]-p[1])/len});
 }
 return nodes;
}

// Join compatible OSM ways into one rendered corridor. This gives pavement,
// solid lines and dash phases the same bends even if a way runs in reverse.
export function roadPaths(roads,junctions=roadJunctions(roads)){
 const ends=new Map(),used=new Set(),paths=[];
 for(const road of roads)for(const end of [0,road.points.length-1]){
  const node=road.nodeIds[end];if(!ends.has(node))ends.set(node,[]);ends.get(node).push({road,end});
 }
 const compatible=(a,b)=>a.class===b.class&&a.name===b.name&&a.surface===b.surface&&!!a.oneway===!!b.oneway&&a.lanes===b.lanes&&Math.abs(a.width-b.width)<.001&&Math.abs((a.laneWidth||3.35)-(b.laneWidth||3.35))<.001&&(a.pavementOffset||0)===(b.pavementOffset||0)&&!!a.curb===!!b.curb&&!!a.bridge===!!b.bridge;
 for(const seed of roads){
  if(used.has(seed))continue;used.add(seed);
  const path={...seed,points:seed.points.slice(),nodeIds:seed.nodeIds.slice(),sources:new Set([seed])};
  for(const tail of [true,false])while(true){
   const at=tail?path.points.length-1:0,p=path.points[at],prev=path.points[tail?at-1:1],node=path.nodeIds[at],len=length(p,prev);
   if(!len||!named(seed)&&(junctions.get(node)?.length||0)!==2)break;
   const candidates=(ends.get(node)||[]).filter(({road,end})=>!used.has(road)&&compatible(seed,road)&&(!seed.oneway||end===(tail?0:road.points.length-1))).map(entry=>{
    const q=entry.road.points[entry.end===0?1:entry.end-1],n=length(p,q)||1;
    return {...entry,dot:((p[0]-prev[0])*(q[0]-p[0])+(p[1]-prev[1])*(q[1]-p[1]))/(len*n)};
   }).filter(c=>c.dot>Math.cos(Math.PI/6)).sort((a,b)=>b.dot-a.dot);
   if(!candidates.length||candidates.length>1&&candidates[0].dot-candidates[1].dot<.02)break;
   const {road,end}=candidates[0],reverse=tail?end!==0:end===0;
   const points=reverse?road.points.slice().reverse():road.points,nodeIds=reverse?road.nodeIds.slice().reverse():road.nodeIds;
   if(tail){path.points.push(...points.slice(1));path.nodeIds.push(...nodeIds.slice(1))}
   else{path.points.unshift(...points.slice(0,-1));path.nodeIds.unshift(...nodeIds.slice(0,-1))}
   used.add(road);path.sources.add(road);
  }
  paths.push(path);
 }
 alignMarkings(paths,junctions);return paths;
}

function lineDefinitions(path){
 const laneWidth=path.laneWidth||3.35,half=path.lanes*laneWidth/2,lines=[];
 for(const side of [-1,1])lines.push({key:`edge:${side>0?'left':'right'}`,offset:side*half,width:.12,color:path.oneway&&side>0?'yellow':'white'});
 if(!path.oneway)for(const side of [-1,1])lines.push({key:`center:${side>0?'left':'right'}`,offset:side*(path.lanes%2&&path.lanes>2?laneWidth/2:.1),width:.10,color:'yellow'});
 for(let lane=1;lane<path.lanes;lane++){
  const offset=-half+lane*laneWidth;
  if(!path.oneway&&(Math.abs(offset)<.3||path.lanes%2&&Math.abs(Math.abs(offset)-laneWidth/2)<.1))continue;
  const key=path.oneway?`divider:${lane-1}`:`divider:${offset>0?'left':'right'}:${Math.round((half-Math.abs(offset))/laneWidth)-1}`;
  lines.push({key,offset,width:.12,color:'white',dashed:true});
 }
 return lines;
}

// Match corresponding lines across real lane-count changes. Taper inward to
// the shared narrower cross-section, keeping paint within both pavements.
function alignMarkings(paths,junctions){
 const ends=new Map(),links=new Map(),visited=new Set();
 for(const path of paths){
  if(!painted(path))continue;
  path.paintLines=lineDefinitions(path);path.paintLength=roadSections(path.points).at(-1).distance;path.paintTransitions=[null,null];
  for(const at of [0,1]){const node=path.nodeIds[at?path.nodeIds.length-1:0];if(!ends.has(node))ends.set(node,[]);ends.get(node).push({path,at})}
 }
 for(const [node,entries] of ends)for(const current of entries){
  const {path,at}=current;if(!named(path)&&(junctions.get(node)?.length||0)!==2)continue;
  const i=at?path.points.length-1:0,p=path.points[i],q=path.points[at?i-1:1],len=length(p,q)||1;
  const candidates=entries.filter(other=>other.path!==path&&other.path.name===path.name&&other.path.class===path.class&&!!other.path.oneway===!!path.oneway&&!!other.path.bridge===!!path.bridge&&(!path.oneway||other.at!==at)).map(other=>{
   const j=other.at?other.path.points.length-1:0,r=other.path.points[other.at?j-1:1],n=length(p,r)||1;
   return {...other,dot:-((q[0]-p[0])*(r[0]-p[0])+(q[1]-p[1])*(r[1]-p[1]))/(len*n)};
  }).filter(other=>other.dot>Math.cos(Math.PI/18)).sort((a,b)=>b.dot-a.dot);
  if(!candidates.length||candidates.length>1&&candidates[0].dot-candidates[1].dot<.02)continue;
  const other=candidates[0],flip=at===other.at,offsets=new Map(),missing=new Set();
  for(const line of path.paintLines){
   const key=flip?line.key.replace(/left|right/g,side=>side==='left'?'right':'left'):line.key;
   const match=other.path.paintLines.find(l=>l.key===key&&l.color===line.color);
   if(!match){missing.add(line.key);continue}
   const offset=match.offset*(flip?-1:1);offsets.set(line.key,Math.abs(offset)<Math.abs(line.offset)?offset:line.offset);
  }
  path.paintTransitions[at]={offsets,missing};if(!links.has(path))links.set(path,[]);links.get(path).push({...other,from:at,flip});
 }
 for(const root of paths){
  if(!root.paintLines||visited.has(root))continue;root.paintOrigin=0;root.paintDirection=1;visited.add(root);const queue=[root];
  for(let i=0;i<queue.length;i++)for(const link of links.get(queue[i])||[]){
   if(visited.has(link.path))continue;
   const current=queue[i],join=current.paintOrigin+current.paintDirection*(link.from?current.paintLength:0);
   link.path.paintDirection=current.paintDirection*(link.flip?-1:1);link.path.paintOrigin=join-link.path.paintDirection*(link.at?link.path.paintLength:0);
   visited.add(link.path);queue.push(link.path);
  }
 }
}

function paintSections(path,sections){
 const cuts=[];if(path.paintTransitions?.[0])cuts.push(20);if(path.paintTransitions?.[1])cuts.push(sections.at(-1).distance-20);
 const result=[sections[0]];
 for(let i=1;i<sections.length;i++){
  const a=sections[i-1],b=sections[i];
  for(const distance of cuts.filter(d=>d>a.distance&&d<b.distance).sort((x,y)=>x-y)){
   const t=(distance-a.distance)/(b.distance-a.distance);
   result.push({distance,point:a.point.map((v,k)=>v+(b.point[k]-v)*t),nx:a.nx+(b.nx-a.nx)*t,ny:a.ny+(b.ny-a.ny)*t});
  }
  result.push(b);
 }
 return result;
}

function lineOffset(path,line,distance,total){
 const start=path.paintTransitions?.[0]?.offsets.get(line.key),end=path.paintTransitions?.[1]?.offsets.get(line.key);
 // A short way cannot fit two full tapers. Join its endpoint targets directly,
 // so overlapping transitions never shift either shared endpoint sideways.
 if(total<40&&start!==undefined&&end!==undefined)return start+(end-start)*distance/total;
 const a=start===undefined?0:Math.max(0,1-distance/20),b=end===undefined?0:Math.max(0,1-(total-distance)/20);
 return line.offset+((start===undefined?0:(start-line.offset)*a)+(end===undefined?0:(end-line.offset)*b))/Math.max(1,a+b);
}

export function markingGaps(path,junctions,sections=roadSections(path.points)){
 const gaps=[],half=path.lanes*(path.laneWidth||3.35)/2;
 for(let i=0;i<sections.length;i++){
  const section=sections[i],entries=junctions.get(path.nodeIds[i])||[];
  if(entries.length<=2)continue;
  const n=Math.hypot(section.nx,section.ny),dx=section.ny/n,dy=-section.nx/n;
  let extent=0;
  for(const cross of entries){
   if(path.sources?.has(cross.road)||Math.abs(cross.point[2]-section.point[2])>2)continue;
   const sine=Math.abs(dx*cross.dy-dy*cross.dx),cosine=Math.abs(dx*cross.dx+dy*cross.dy);
   if(sine<.3)continue;
   extent=Math.max(extent,Math.min(60,(cross.road.width/2+Math.abs(cross.road.pavementOffset||0)+half*cosine)/sine+2.5));
  }
  if(extent)gaps.push([section.distance-extent,section.distance+extent]);
 }
 gaps.sort((a,b)=>a[0]-b[0]);const merged=[];
 for(const gap of gaps){const previous=merged.at(-1);if(previous&&gap[0]<=previous[1])previous[1]=Math.max(previous[1],gap[1]);else merged.push(gap.slice())}
 return merged;
}

export function roadMarkings(path,junctions=new Map()){
 const white=[],yellow=[];if(!painted(path))return {white,yellow};
 const base=roadSections(path.points),sections=paintSections(path,base),gaps=markingGaps(path,junctions,base),total=base.at(-1).distance,lines=path.paintLines||lineDefinitions(path);
 const cut=(start,end)=>{
  const ranges=[];let from=start;
  for(const [a,b] of gaps){if(b<=from)continue;if(a>=end)break;if(a>from)ranges.push([from,Math.min(a,end)]);from=Math.max(from,b);if(from>=end)break}
  if(from<end)ranges.push([from,end]);return ranges;
 };
 const strip=(i,start,end,line)=>{
  if(path.paintTransitions?.[0]?.missing.has(line.key))start=Math.max(start,20);
  if(path.paintTransitions?.[1]?.missing.has(line.key))end=Math.min(end,total-20);
  if(end-start<.02)return;
  const a=sections[i-1],b=sections[i],span=b.distance-a.distance;if(span<.01)return;
  const vertices=[];
  for(const distance of [start,end]){
   const t=(distance-a.distance)/span,point=a.point.map((v,k)=>v+(b.point[k]-v)*t),nx=a.nx+(b.nx-a.nx)*t,ny=a.ny+(b.ny-a.ny)*t;
   const offset=lineOffset(path,line,distance,total);
   for(const side of [-1,1]){const o=offset+side*line.width/2;vertices.push(point[0]+nx*o,point[2]+.026,-point[1]-ny*o)}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new T.Float32BufferAttribute([start/5,0,start/5,1,end/5,0,end/5,1],2));g.setIndex([0,2,1,2,3,1]);g.computeVertexNormals();(line.color==='yellow'?yellow:white).push(g);
 };
 for(let i=1;i<sections.length;i++)for(const [start,end] of cut(sections[i-1].distance,sections[i].distance)){
  for(const line of lines){
   if(!line.dashed){strip(i,start,end,line);continue}
   // Signed corridor distance also preserves dash phase on reversed ways.
   const origin=path.paintOrigin||0,direction=path.paintDirection||1,from=origin+direction*start,to=origin+direction*end;
   for(let at=Math.floor(Math.min(from,to)/12)*12;at<Math.max(from,to);at+=12){
    const a=(at-origin)/direction,b=(at+3-origin)/direction;
    strip(i,Math.max(start,Math.min(a,b)),Math.min(end,Math.max(a,b)),line);
   }
  }
 }
 return {white,yellow};
}
