import * as THREE from "three";

/**
 * 创建安全波次的商店建筑：
 * - 一个更好看的小店：底座/墙体/屋顶/门/招牌/灯/栏杆
 * - 建筑前方左边红色地板（打开商店）
 * - 建筑前方右边绿色地板（进入下一战斗波）
 * - ✅ 返回一个不可见 collider（玩家碰撞用）
 */
export function createShopBuilding(scene) {
  const group = new THREE.Group();

  // ===== 基础材质 =====
  const matStone = new THREE.MeshPhongMaterial({ color: 0x6f6f78 });
  const matWood = new THREE.MeshPhongMaterial({ color: 0x8b5a2b });
  const matRoof = new THREE.MeshPhongMaterial({ color: 0x3b2f2f });
  const matMetal = new THREE.MeshPhongMaterial({ color: 0x4a4a4a });
  const matGold = new THREE.MeshPhongMaterial({ color: 0xd4af37 });
  const matGlass = new THREE.MeshPhongMaterial({
    color: 0x88ccff,
    emissive: 0x224466,
    shininess: 120,
  });

  // ===== 底座平台 =====
  const base = new THREE.Mesh(new THREE.BoxGeometry(18, 1, 14), matStone);
  base.position.set(0, 0.5, 1);
  group.add(base);

  // ===== 主体墙体 =====
  const body = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 8), matWood);
  body.position.set(0, 1 + 3, 0);
  group.add(body);

  // ===== 屋顶（小房顶）=====
  const roof = new THREE.Mesh(new THREE.ConeGeometry(7.5, 3, 4), matRoof);
  roof.position.set(0, 1 + 6.8, 0);
  roof.rotation.y = Math.PI / 4;
  group.add(roof);

  // ===== 门 =====
  const door = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.2, 0.2), matMetal);
  door.position.set(0, 1 + 1.9, 4.1);
  group.add(door);

  // 门框
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.6, 0.25), matStone);
  doorFrame.position.set(0, 1 + 2.0, 4.15);
  group.add(doorFrame);

  // ===== 窗户（带点发光感）=====
  const winL = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 0.2), matGlass);
  winL.position.set(-3.5, 1 + 3.2, 4.05);
  group.add(winL);

  const winR = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 0.2), matGlass);
  winR.position.set(3.5, 1 + 3.2, 4.05);
  group.add(winR);

  // ===== 招牌 =====
  const signPole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 5, 12), matMetal);
  signPole.position.set(-6.5, 1 + 2.6, 4.2);
  group.add(signPole);

  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.2, 0.25), matGold);
  signBoard.position.set(-6.5, 1 + 4.6, 4.2);
  group.add(signBoard);

  // ===== 两盏小灯（点亮门口）=====
  const lampMat = new THREE.MeshPhongMaterial({ color: 0xffeeaa, emissive: 0x664400 });
  const lampL = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 10), lampMat);
  lampL.position.set(-1.4, 1 + 3.0, 4.25);
  group.add(lampL);

  const lampR = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 10), lampMat);
  lampR.position.set(1.4, 1 + 3.0, 4.25);
  group.add(lampR);

  // ===== 门口小台阶 =====
  const step = new THREE.Mesh(new THREE.BoxGeometry(4, 0.5, 2), matStone);
  step.position.set(0, 0.25, 6.2);
  group.add(step);

  // ===== 红/绿地板（交互区）=====
  const tileGeom = new THREE.BoxGeometry(4.4, 0.22, 4.4);

  const redMat = new THREE.MeshPhongMaterial({
    color: 0xff3333,
    emissive: 0x220000,
    shininess: 50,
  });
  const greenMat = new THREE.MeshPhongMaterial({
    color: 0x33ff66,
    emissive: 0x002200,
    shininess: 50,
  });

  const redTile = new THREE.Mesh(tileGeom, redMat);
  redTile.position.set(-4.8, 0.12, 9.0);
  group.add(redTile);

  const greenTile = new THREE.Mesh(tileGeom, greenMat);
  greenTile.position.set(4.8, 0.12, 9.0);
  group.add(greenTile);

  // 再加一个“箭头”提示（纯装饰）
  const arrowGeom = new THREE.ConeGeometry(0.6, 1.6, 12);
  const arrowRed = new THREE.Mesh(arrowGeom, new THREE.MeshPhongMaterial({ color: 0xffffff }));
  arrowRed.position.set(-4.8, 1.2, 9.0);
  arrowRed.rotation.x = Math.PI;
  group.add(arrowRed);

  const arrowGreen = new THREE.Mesh(arrowGeom, new THREE.MeshPhongMaterial({ color: 0xffffff }));
  arrowGreen.position.set(4.8, 1.2, 9.0);
  arrowGreen.rotation.x = Math.PI;
  group.add(arrowGreen);

  // ===== ✅ 碰撞体（不可见）=====
  // 用一个盒子包住“主体建筑 + 屋顶投影”，避免玩家穿模
  const colliderHalfX = 7.5;
  const colliderHalfZ = 6.0;
  const colliderH = 8.0;

  const collider = new THREE.Mesh(
    new THREE.BoxGeometry(colliderHalfX * 2, colliderH, colliderHalfZ * 2),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0 })
  );
  collider.position.set(0, colliderH / 2, 0);
  collider.visible = false; // 永远不可见
  collider.userData.halfX = colliderHalfX;
  collider.userData.halfZ = colliderHalfZ;
  group.add(collider);

  group.visible = false; // 默认不显示，只有安全波次显示
  scene.add(group);

  return {
    group,
    redTile,
    greenTile,
    collider, // ✅ 新增返回
  };
}
