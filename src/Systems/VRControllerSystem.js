/* global Ammo */
import * as THREE from "three";
import { System } from "ecsy";
import {
  VRController,
  Draggable,
  Dragging,
  Parent,
  Object3D,
  ThreeContext
} from "../Components/components.js";

var raycaster = new THREE.Raycaster();
var tempMatrix = new THREE.Matrix4();
var intersected = [];

export class VRControllerSystem extends System {
  execute() {
    this.queries.dragging.results.forEach(entity => {
      this.reposition(entity.getComponent(Object3D).value, true);
    });

    var threeContext = this.queries.threeContext.results[0].getComponent(
      ThreeContext
    );

    this.queries.controllers.added.forEach(entity => {
      var renderer = threeContext.renderer;
      var scene = threeContext.scene;
      var controller = renderer.vr.getController(
        entity.getComponent(VRController).id
      );
      entity.addComponent(Object3D, { value: controller });
      controller.addEventListener("selectstart", this.onSelectStart.bind(this));
      controller.addEventListener("selectend", this.onSelectEnd.bind(this));

      let geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1], 3)
      );

      var line = new THREE.Line(geometry);
      line.name = "line";
      line.scale.z = 5;

      controller.add(line);

      if (entity.hasComponent(Parent)) {
        entity.getComponent(Parent).value.add(controller);
      } else {
        scene.add(controller);
      }
    });

    this.cleanIntersected();

    this.queries.controllers.results.forEach(controller => {
      // this.intersectObjects(controller.getComponent(Object3D).value);
    });
  }

  onSelectStart(event) {
    var controller = event.target;
    var intersections = this.getIntersections(controller);

    if (intersections.length > 0) {
      var intersection = intersections[0];

      tempMatrix.getInverse(controller.matrixWorld);

      var object = intersection.object;
      object.userData.entity.addComponent(Dragging);
      object.matrix.premultiply(tempMatrix);
      object.matrix.decompose(object.position, object.quaternion, object.scale);
      object.material.emissive.b = 1;
      object.userData.previousParent = object.parent;
      controller.add(object);

      controller.userData.selected = object;
    }
  }

  onSelectEnd(event) {
    var controller = event.target;

    if (controller.userData.selected !== undefined) {
      var object = controller.userData.selected;
      object.userData.entity.removeComponent(Dragging);

      object.matrix.premultiply(controller.matrixWorld);
      object.matrix.decompose(object.position, object.quaternion, object.scale);
      object.material.emissive.b = 0;
      object.userData.previousParent.add(object);

      controller.userData.selected = undefined;

      // Reposition
      // @todo This should be moved to the physics system
      /*
      const initialTransform = new Ammo.btTransform();
      initialTransform.setIdentity();
      initialTransform.setOrigin(
        new Ammo.btVector3(
          object.position.x,
          object.position.y,
          object.position.z
        )
      );
      initialTransform.setRotation(
        new Ammo.btQuaternion(
          object.quaternion.x,
          object.quaternion.y,
          object.quaternion.z,
          object.quaternion.w
        )
      );
      object.userData.body.setWorldTransform(initialTransform);
      */
      this.reposition(object);
    }
  }

  reposition(object, world) {
    if (world) {
      var position = new THREE.Vector3();
      var scale = new THREE.Vector3();
      var quaternion = new THREE.Quaternion();
      object.updateWorldMatrix(true);
      object.matrixWorld.decompose(position, quaternion, scale);

      var wxform = object.userData.body.getWorldTransform();
      wxform.setIdentity();
      var origin = wxform.getOrigin();
      var quat = wxform.getRotation();

      const initialTransform = new Ammo.btTransform();
      initialTransform.setIdentity();
      initialTransform.setOrigin(
        new Ammo.btVector3(position.x, position.y, position.z)
      );
      initialTransform.setRotation(
        new Ammo.btQuaternion(
          quaternion.x,
          quaternion.y,
          quaternion.z,
          quaternion.w
        )
      );
      object.userData.body.setWorldTransform(initialTransform);
    } else {
      const initialTransform = new Ammo.btTransform();
      initialTransform.setIdentity();
      initialTransform.setOrigin(
        new Ammo.btVector3(
          object.position.x,
          object.position.y,
          object.position.z
        )
      );
      initialTransform.setRotation(
        new Ammo.btQuaternion(
          object.quaternion.x,
          object.quaternion.y,
          object.quaternion.z,
          object.quaternion.w
        )
      );
      object.userData.body.setWorldTransform(initialTransform);

      /*
      var wxform = object.userData.body.getWorldTransform();
      wxform.setIdentity();
      var origin = wxform.getOrigin();
      var quat = wxform.getRotation();
      origin.setValue(object.position.x, object.position.y, object.position.z);
      quat.setValue(
        object.quaternion.x,
        object.quaternion.y,
        object.quaternion.z,
        object.quaternion.w
      );
      */
    }
  }

  intersectObjects(controller) {
    // Do not highlight when already selected
    if (controller.userData.selected !== undefined) return;
    var line = controller.getObjectByName("line");
    var intersections = this.getIntersections(controller);

    if (intersections.length > 0) {
      var intersection = intersections[0];
      var object = intersection.object;
      object.material.emissive.r = 1;
      intersected.push(object);

      line.scale.z = intersection.distance;
    } else {
      line.scale.z = 5;
    }
  }

  getIntersections(controller) {
    tempMatrix.identity().extractRotation(controller.matrixWorld);

    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
    // @fixme expensive
    var objects = this.queries.objects.results.map(entity => {
      var object = entity.getComponent(Object3D).value;
      object.userData.entity = entity;
      return object;
    });

    return raycaster.intersectObjects(objects);
  }

  cleanIntersected() {
    while (intersected.length) {
      var object = intersected.pop();
      object.material.emissive.r = 0;
    }
  }
}

VRControllerSystem.queries = {
  controllers: {
    components: [VRController],
    listen: {
      added: true
    }
  },
  objects: { components: [Draggable, Object3D] },
  dragging: { components: [Dragging] },
  threeContext: {
    components: [ThreeContext]
  }
};
