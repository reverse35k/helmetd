import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {RiderCamera} from '../src/rider-camera.js';

function setup(){
 const bike=new T.Group(),helmet=new T.Group(),camera=new T.PerspectiveCamera();
 helmet.position.set(0,1.526,.05);bike.add(helmet);
 return {bike,helmet,camera,view:new RiderCamera(bike,helmet)};
}
test('helmet view follows the rider eyes immediately through translation, yaw, lean and pitch',()=>{
 const {bike,helmet,camera,view}=setup();
 for(const [x,y,z,pitch,yaw,lean] of [[0,0,0,0,0,0],[100,8,-50,.15,1.2,-.5],[-80,2,45,-.2,-2,.6]]){
  bike.position.set(x,y,z);bike.rotation.set(pitch,yaw,lean,'YXZ');camera.position.set(999,999,999);
  view.update(camera,2);
  const expected=helmet.localToWorld(new T.Vector3(0,.04,-.075));
  assert.ok(camera.position.distanceTo(expected)<1e-9);
  const facing=new T.Vector3(0,0,-1).applyQuaternion(view.helmetPitch).transformDirection(helmet.matrixWorld);
  assert.ok(camera.getWorldDirection(new T.Vector3()).distanceTo(facing)<1e-9);
 }
});
test('cockpit view looks down from the same eye position instead of moving into the bike',()=>{
 const {bike,camera,view}=setup();bike.position.set(20,3,-12);
 view.update(camera,2);const eyes=camera.position.clone(),helmetFacing=camera.getWorldDirection(new T.Vector3());
 view.update(camera,3);
 assert.ok(camera.position.distanceTo(eyes)<1e-9);
 assert.ok(camera.getWorldDirection(new T.Vector3()).y<helmetFacing.y);
});
test('first-person attachment follows head rotation and suspension without depending on frame rate',()=>{
 const {bike,helmet,camera,view}=setup();
 helmet.rotation.y=.1;bike.position.y=.025;view.update(camera,2);const original=camera.position.clone();
 bike.position.y+=.03;view.update(camera,2);
 assert.ok(Math.abs(camera.position.y-original.y-.03)<1e-9);
 assert.ok(camera.getWorldDirection(new T.Vector3()).x<0);
});
