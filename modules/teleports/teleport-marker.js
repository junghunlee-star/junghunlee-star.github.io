// modules/teleports/teleport-marker.js
// -----------------------------------------------------------------------------
// 텔레포트 3D 마커 (링 + 디스크 + 빛기둥 + 방향 화살표) 생성기.
// THREE 주입 방식 (DI) — 호출자가 Three.js 인스턴스를 넘겨줘야 함.
// Pure 함수 (전역 상태 접근 X). 결과 group.userData._anim 에
// update 루프가 건드릴 자식 참조들을 모아둠.
//
// 호출자 기대:
//   const marker = buildTeleportMarker(THREE, teleportData);
//   scene.add(marker);
// -----------------------------------------------------------------------------

const PILLAR_HEIGHT = 500;
const DEFAULT_COLOR = 0x5cc8ff; // 시안

/**
 * @param {object} THREE
 * @param {object} t  - teleport data. 기대 필드:
 *   trigger: {x,y,z} (Vector3 또는 plain)
 *   markerY: number   (링 y 위치; 없으면 trigger.y)
 *   arrowYaw: number  (rad)
 */
export function buildTeleportMarker(THREE, t) {
    const group = new THREE.Group();
    group.position.set(t.trigger.x, t.markerY ?? t.trigger.y, t.trigger.z);

    const color = DEFAULT_COLOR;

    // 바깥 링
    const outerRing = _makeRing(THREE, 0.95, 1.15, 64, color, 0.9);
    outerRing.rotation.x = -Math.PI / 2;
    group.add(outerRing);

    // 안쪽 링 (가늘게) — 반대 방향 회전으로 포탈 느낌
    const innerRing = _makeRing(THREE, 0.55, 0.72, 48, color, 0.7);
    innerRing.rotation.x = -Math.PI / 2;
    group.add(innerRing);

    // 중심 디스크 (은은한 글로우)
    const discGeom = new THREE.CircleGeometry(1.15, 64);
    const discMat = _addBasicMat(THREE, color, 0.18);
    const disc = new THREE.Mesh(discGeom, discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.001; // z-fighting 방지
    group.add(disc);

    // 수직 빛기둥 — 하늘까지 위로만 뻗음. 바닥 관통 방지 위해 아래로는 안 보냄.
    const pillarGeom = new THREE.CylinderGeometry(0.9, 0.9, PILLAR_HEIGHT, 32, 1, true);
    const pillarMat = _addBasicMat(THREE, color, 0.10);
    const pillar = new THREE.Mesh(pillarGeom, pillarMat);
    pillar.position.y = PILLAR_HEIGHT / 2;
    group.add(pillar);

    // 방향 화살표 (바닥 flat)
    const arrowGroup = new THREE.Group();
    const arrow = _makeArrowMesh(THREE, color);
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.y = 0.002;
    arrowGroup.add(arrow);
    arrowGroup.rotation.y = t.arrowYaw || 0;
    group.add(arrowGroup);

    // 충돌/선택 raycast 제외 플래그
    group.traverse((c) => {
        c.userData.isTeleportMarker = true;
        c.userData.noCollide = true;
    });

    // 애니메이션 루프에서 접근할 자식 참조들
    group.userData._anim = { outerRing, innerRing, disc, pillar, arrow, arrowGroup };
    return group;
}

function _makeRing(THREE, inner, outer, seg, color, opacity) {
    const geom = new THREE.RingGeometry(inner, outer, seg);
    const mat = _addBasicMat(THREE, color, opacity);
    return new THREE.Mesh(geom, mat);
}

function _addBasicMat(THREE, color, opacity) {
    return new THREE.MeshBasicMaterial({
        color, transparent: true, opacity,
        side: THREE.DoubleSide, depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
}

function _makeArrowMesh(THREE, color) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.9);       // tip
    shape.lineTo(0.45, 0.25);   // right shoulder
    shape.lineTo(0.17, 0.25);
    shape.lineTo(0.17, -0.55);
    shape.lineTo(-0.17, -0.55);
    shape.lineTo(-0.17, 0.25);
    shape.lineTo(-0.45, 0.25);
    shape.lineTo(0, 0.9);       // close
    const geom = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.85,
        side: THREE.DoubleSide, depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    return new THREE.Mesh(geom, mat);
}

/**
 * teleport data 에서 이동할 URL 문자열 생성 (?data=&px=... 등).
 * Pure.
 */
export function buildTeleportHref(t, viewerPath = './viewer.html') {
    const qs = new URLSearchParams();
    qs.set('data', t.destUrl);
    if (t.destPx !== undefined && t.destPx !== '') qs.set('px', t.destPx);
    if (t.destPy !== undefined && t.destPy !== '') qs.set('py', t.destPy);
    if (t.destPz !== undefined && t.destPz !== '') qs.set('pz', t.destPz);
    if (t.destYaw !== undefined && t.destYaw !== '') qs.set('yaw', t.destYaw);
    if (t.destPitch !== undefined && t.destPitch !== '') qs.set('pitch', t.destPitch);
    return `${viewerPath}?${qs.toString()}`;
}
