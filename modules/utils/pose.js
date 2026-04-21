// modules/utils/pose.js
// -----------------------------------------------------------------------------
// 카메라 포즈 추출 + URL 기반 씬 식별 유틸.
// Three.js 에 강결합되지 않도록 THREE 를 주입받음 (DI).
// -----------------------------------------------------------------------------

const RAD2DEG = 180 / Math.PI;

// 카메라 월드 포즈 → CSV 등 외부 저장용 수치 형태.
// YXZ Euler 순서 (debug HUD / teleport yaw/pitch 와 동일 규약).
//
// @param {object} THREE  Three.js 모듈 (Euler 생성에 필요)
// @param {THREE.Camera} camera
// @return { px, py, pz, yaw, pitch }   — 위치는 m, 각도는 degree
export function getCameraPose(THREE, camera) {
    const e = new THREE.Euler();
    e.setFromQuaternion(camera.quaternion, 'YXZ');
    return {
        px: +camera.position.x.toFixed(3),
        py: +camera.position.y.toFixed(3),
        pz: +camera.position.z.toFixed(3),
        yaw:   +(e.y * RAD2DEG).toFixed(2),
        pitch: +(e.x * RAD2DEG).toFixed(2),
    };
}

// URL 경로의 마지막 세그먼트에서 `.lcc` 제거 → 씬 식별자 문자열.
// 예: "https://.../daerim_alley/daerim_alley.lcc" → "daerim_alley"
//     "https://.../voidbox3층.lcc"                → "voidbox3층"
// teleport/note CSV 의 `scene_match` 컬럼과 비교하는 기준.
export function extractSceneMatch(url) {
    try {
        const parts = new URL(url).pathname.split('/').filter(Boolean);
        const last = parts[parts.length - 1] || '';
        return last.replace(/\.lcc$/i, '') || parts[parts.length - 2] || 'scene';
    } catch { return 'scene'; }
}

// 단위 변환 상수 — 바깥에서도 쓸 수 있도록 export
export { RAD2DEG };
export const DEG2RAD = Math.PI / 180;
