import * as T from 'three';

// Both pavement and paint use these exact cross-sections at every bend.
export function roadSections(points){
 const closed=points.length>3&&Math.hypot(points[0][0]-points.at(-1)[0],points[0][1]-points.at(-1)[1])<.01;
 let distance=0;
 return points.map((p,i)=>{
  const a=points[i-1]||(closed?points.at(-2):p),b=points[i+1]||(closed?points[1]:p);
  if(i)distance+=Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1]);
  let dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;dx/=len;dy/=len;
  const outgoing=i<points.length-1||closed;
  const ex=outgoing?b[0]-p[0]:p[0]-a[0],ey=outgoing?b[1]-p[1]:p[1]-a[1],el=Math.hypot(ex,ey)||1;
  const miter=Math.min(1.7,1/Math.max(.59,Math.abs(dx*ex/el+dy*ey/el)));
  return {point:p,distance,nx:-dy*miter,ny:dx*miter};
 });
}

export function roadStrip(a,b,width,offset=0,raise=0){
 if(Math.hypot(b[0]-a[0],b[1]-a[1])<.01)return null;
 return roadRibbon([a,b],width,offset,raise);
}

export function roadRibbon(points,width,offset=0,raise=0){
 const vertices=[],uv=[],indices=[];
 roadSections(points).forEach((section,i)=>{
  const {point:p,nx,ny,distance}=section;
  for(const side of [-1,1]){const o=offset+side*width/2;vertices.push(p[0]+nx*o,p[2]+raise,-p[1]-ny*o);uv.push(distance/5,(side+1)*width/10)}
  if(i){const k=(i-1)*2;indices.push(k,k+2,k+1,k+2,k+3,k+1)}
 });
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}

export function curbRibbon(points,offset){
 const top=roadRibbon(points,.22,offset,.14),p=top.getAttribute('position'),v=Array.from(p.array),indices=Array.from(top.index.array),count=p.count;
 for(let i=0;i<count;i++)v.push(p.getX(i),p.getY(i)-.15,p.getZ(i));
 for(let i=0;i<count-2;i+=2)indices.push(i,i+count,i+2,i+2,i+count,i+count+2,i+1,i+3,i+count+1,i+3,i+count+3,i+count+1);
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(v,3));const uv=Array.from(top.getAttribute('uv').array);geo.setAttribute('uv',new T.Float32BufferAttribute([...uv,...uv],2));geo.setIndex(indices);geo.computeVertexNormals();top.dispose();return geo;
}
