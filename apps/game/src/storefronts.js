import * as T from 'three';

export const genericShops=[
 {name:'RESTAURANT',kind:'restaurant',masonry:'red'},
 {name:'COFFEE & TEA',kind:'cafe',masonry:'brown'},
 {name:'BAKERY',kind:'bakery',masonry:'cream'},
 {name:'PIZZA & SUBS',kind:'fast_food',masonry:'red'},
 {name:'NEIGHBORHOOD MARKET',kind:'market',masonry:'brown'},
 {name:'GRILL & SHAWARMA',kind:'restaurant',masonry:'cream'},
 {name:'BARBER SHOP',kind:'shop',masonry:'red'},
 {name:'DESSERTS',kind:'ice_cream',masonry:'cream'},
 {name:'CLEANERS',kind:'shop',masonry:'brown'},
 {name:'HAIR SALON',kind:'shop',masonry:'red'},
 {name:'FLORIST',kind:'shop',masonry:'cream'},
 {name:'AVAILABLE',kind:'vacant',masonry:'brown'},
];

const contains=(p,poly)=>{let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside}return inside};
const closest=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=T.MathUtils.clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1),0,1);return [a[0]+dx*t,a[1]+dy*t]};
const edges=poly=>poly.map((a,i)=>[a,poly[(i+1)%poly.length]]);
const civicAmenities=new Set(['library','school','college','university','townhall','place_of_worship','police','fire_station','post_office','community_centre']);
const civic=building=>civicAmenities.has(building.amenity)||/\b(library|museum|school|church|mosque|synagogue|city hall)\b/i.test(building.name||'');

export function storefrontPlan(data,businesses=[]){
 const roadEdges=data.roads.filter(r=>r.name==='Michigan Avenue').flatMap(r=>r.points.slice(1).map((p,i)=>[r.points[i],p]));
 const plans=new Map(),shops=genericShops.slice();
 for(const building of data.buildings){
  if(civic(building)||!['yes','retail','commercial','office','restaurant','cafe','fast_food'].includes(building.type))continue;
  const points=building.points,center=[points.reduce((s,p)=>s+p[0],0)/points.length,points.reduce((s,p)=>s+p[1],0)/points.length];
  let target=null,distance=Infinity;
  for(const [a,b] of roadEdges){const p=closest(center,a,b),d=Math.hypot(p[0]-center[0],p[1]-center[1]);if(d<distance){distance=d;target=p}}
  const frontageDistance=Math.min(...points.map(p=>target?Math.hypot(p[0]-target[0],p[1]-target[1]):Infinity));
  if(frontageDistance<40){
   const named=building.name&&['restaurant','cafe','fast_food','bar','pub','ice_cream'].includes(building.amenity);
   const names=[];if(named){names.push(shops.length);shops.push({name:building.name,kind:building.amenity})}
   plans.set(building.id,{target,shops:names,inferred:!named});
  }
 }
 for(const business of businesses){
  if(!business.name)continue;
  let match=null,best=Infinity;
  for(const building of data.buildings){
   const p=business.point,poly=building.points;
   if(p[0]<building.bounds?.[0]-25||p[0]>building.bounds?.[2]+25||p[1]<building.bounds?.[1]-25||p[1]>building.bounds?.[3]+25)continue;
   const d=contains(p,poly)?0:Math.min(...edges(poly).map(([a,b])=>{const q=closest(p,a,b);return Math.hypot(q[0]-p[0],q[1]-p[1])}));
   if(d<best){best=d;match=building}
  }
  if(!match||best>20)continue;
  if(business.brand){
   let target=null,nearest=Infinity;
   for(const road of data.roads.filter(r=>r.name===(business.street||'Michigan Avenue')))for(const [a,b] of road.points.slice(1).map((p,i)=>[road.points[i],p])){
    const q=closest(business.point,a,b),distance=Math.hypot(q[0]-business.point[0],q[1]-business.point[1]);if(distance<nearest){nearest=distance;target=q}
   }
   if(!target)continue;
   if(!plans.has(match.id))plans.set(match.id,{target,shops:[],inferred:false});
   plans.get(match.id).target=target;
  }
  const plan=plans.get(match.id);if(!plan)continue;
  const index=shops.length;shops.push(business);plan.inferred=false;
  if(business.brand){(plan.featuredShops??=[]).push({index,point:business.point})}else plan.shops.push(index);
 }
 return {plans,shops};
}

// Only dress the closest street-facing wall, keeping side/rear walls as masonry.
export function frontageEdges(points,target){
 const candidates=[];
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  if(length<=3)continue;
  const mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2,tx=target[0]-mx,ty=target[1]-my;
  if((dy*tx-dx*ty)/(length*Math.hypot(tx,ty)||1)<.6)continue;
  const q=closest(target,a,b);candidates.push({edge:i,distance:Math.hypot(q[0]-target[0],q[1]-target[1])});
 }
 const nearest=Math.min(...candidates.map(c=>c.distance));
 return new Set(candidates.filter(c=>c.distance<=nearest+1).map(c=>c.edge));
}

// One opaque atlas for all restaurant/retail façades and their awning colors.
export function storefrontAtlas(shops){
 const columns=4,cellWidth=512,cellHeight=256,rows=Math.ceil(shops.length/columns),canvas=document.createElement('canvas');
 canvas.width=columns*cellWidth;canvas.height=rows*cellHeight;const c=canvas.getContext('2d');
 const colors=['#492e2a','#2e4039','#44413b','#504032','#454a3d','#453630','#303130','#41484a'];
 shops.forEach((shop,index)=>{
  c.save();c.translate(index%columns*cellWidth,Math.floor(index/columns)*cellHeight);
  const accent=shop.accent||colors[index%colors.length],brick={red:['#61473d','#915747','#a05f4d','#854b3f'],brown:['#645d50','#7b6755','#8c735e','#6e594a'],cream:['#a49a87','#c8bba2','#d2c6af','#bdb29d']}[shop.masonry||['red','brown','cream'][index%3]];
  c.fillStyle=brick[0];c.fillRect(0,0,512,256);
  for(let y=0;y<256;y+=5)for(let x=-13;x<512;x+=26){c.fillStyle=brick[1+Math.abs((x/26+y/5)|0)%3];c.fillRect(x+(y%10?13:0),y,25,4)}
  c.fillStyle='#c0b59f';c.fillRect(0,0,512,7);c.fillStyle='#453b2f';c.fillRect(0,7,512,2);
  const signWidth=shop.brand?480:356+(index%3)*34,signX=(512-signWidth)/2,signHeight=shop.brand?61:43;
  c.fillStyle='#40382d';c.fillRect(signX-1,24,signWidth+2,signHeight+3);
  c.fillStyle=accent;c.fillRect(signX,21,signWidth,signHeight);
  c.fillStyle=shop.ink||'#e7e1d5';c.textAlign='center';c.textBaseline='middle';c.font=`bold ${shop.brand?30:24}px Arial`;
  const name=(shop.signName||shop.name).toUpperCase();const width=c.measureText(name).width;if(width>465)c.font=`bold ${Math.floor(30*465/width)}px Arial`;
  if(shop.brand==='qahwah'){c.font='bold 30px Georgia';c.fillText(name,256,43)}else if(shop.brand==='jabal'){
   c.font='bold 38px Georgia';c.fillText('JABAL',256,40);c.font='12px Arial';c.fillText('COFFEE HOUSE',256,61);
  }else{c.fillText(name,256,42)}
  if(shop.brand||shop.detail){c.font='11px Arial';c.fillText(shop.detail||shop.kind.replaceAll('_',' ').toUpperCase(),256,shop.brand==='jabal'?77:66)}
  const glass=c.createLinearGradient(0,99,0,237);glass.addColorStop(0,'#687775');glass.addColorStop(.38,'#4c5d5b');glass.addColorStop(.65,index%2?'#42453c':'#49433c');glass.addColorStop(1,'#292e29');
  c.fillStyle='#443c32';c.fillRect(15,94,482,150);c.fillStyle='#d7c9af';c.fillRect(16,91,480,150);
  c.fillStyle=glass;c.fillRect(23,99,318,138);c.fillRect(351,99,138,138);
  // Interior detail and reflections remain opaque, with no room meshes or lights.
  c.fillStyle='#282d2766';for(let i=0;i<6;i++)c.fillRect(25+i*53,117+(i%3)*6,44,31);
  for(const x of [77,182,287]){
   c.fillStyle='#393f37';c.fillRect(x,101,1,30);c.beginPath();c.moveTo(x-12,137);c.lineTo(x-5,128);c.lineTo(x+5,128);c.lineTo(x+12,137);c.fill();
   c.fillStyle='#f0d3a0';c.fillRect(x-8,137,16,2);
  }
  const food=['restaurant','cafe','bakery','fast_food','ice_cream'].includes(shop.kind);
  if(food){c.fillStyle='#b6a17a';for(const x of [148,264]){c.fillRect(x,201,44,4);c.fillRect(x+21,205,3,30);c.fillStyle='#454a3c';c.fillRect(x-8,201,5,33);c.fillRect(x-10,185,17,17);c.fillStyle='#b6a17a'}}
  c.fillStyle='#e3ece41b';c.beginPath();c.moveTo(26,102);c.lineTo(115,102);c.lineTo(70,181);c.lineTo(26,196);c.fill();
  c.beginPath();c.moveTo(238,102);c.lineTo(330,102);c.lineTo(284,170);c.lineTo(238,185);c.fill();
  if(food){c.fillStyle='#d2b785';c.fillRect(54,173,44,44);c.fillStyle='#293c35';c.fillRect(57,176,38,38);c.fillStyle='#e9ddbd';c.font='9px Arial';c.fillText('MENU',76,184);for(let y=191;y<209;y+=5)c.fillRect(62,y,26-(y%3)*3,1)}
  c.fillStyle='#1e312b';for(const x of [31,320]){
   for(const [dx,dy] of [[0,0],[-5,-7],[5,-13],[-3,-19]]){c.beginPath();c.ellipse(x+dx,217+dy,5,9,dx*.1,0,Math.PI*2);c.fill()}
  }
  c.fillStyle='#9b7658';for(const x of [31,320])c.fillRect(x-7,220,14,16);
  c.fillStyle='#494f48';for(const x of [126,232,341,348])c.fillRect(x,96,5,144);
  c.fillRect(24,157,317,4);c.fillRect(351,126,138,4);
  c.fillStyle='#d7cbb5';for(const x of [126,232,348])c.fillRect(x,97,1,141);
  c.fillStyle='#263b32';c.fillRect(408,151,55,19);c.strokeStyle='#c5b999';c.strokeRect(408,151,55,19);c.fillStyle='#e4d5ad';c.font='10px Arial';c.fillText('OPEN',435,161);
  c.fillStyle='#252c28';c.fillRect(362,174,5,34);c.fillStyle='#e6dfcd';c.fillRect(359,172,4,33);
  c.fillStyle='#8d9184';c.fillRect(352,225,135,12);
  if(shop.kind==='vacant'){c.fillStyle='#d3cec0';c.fillRect(100,145,160,55);c.fillStyle='#413f39';c.font='bold 19px Arial';c.fillText('FOR LEASE',180,172)}
  c.fillStyle='#e2d2b6';c.fillRect(16,240,480,4);c.fillStyle='#84745f';c.fillRect(0,244,512,12);c.restore();
 });
 const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;
 return {map,columns,rows};
}

export function atlasUV(index,u,v,shopCount){
 const columns=4,rows=Math.ceil(shopCount/columns),padding=.004;
 return [(index%columns+padding+u*(1-2*padding))/columns,1-(Math.floor(index/columns)+padding+(1-v)*(1-2*padding))/rows];
}
