import * as T from 'three';

export class RiderCamera{
 constructor(bike,helmet){
  this.head=helmet||bike;
  // Eye position inside the visor, relative to the actual rider head.
  this.eye=helmet?new T.Vector3(0,.04,-.075):new T.Vector3(0,1.566,-.025);
  this.helmetPitch=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-.025);
  this.cockpitPitch=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-.24);
 }
 update(camera,mode){
  // Use the current bike transform directly, including lean, pitch and suspension.
  // No trailing interpolation or offset outside the rider's head.
  this.head.updateWorldMatrix(true,false);
  camera.position.copy(this.eye).applyMatrix4(this.head.matrixWorld);
  this.head.getWorldQuaternion(camera.quaternion);
  camera.quaternion.multiply(mode===3?this.cockpitPitch:this.helmetPitch);
 }
}
