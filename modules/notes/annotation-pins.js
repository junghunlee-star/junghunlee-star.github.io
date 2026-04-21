// modules/notes/annotation-pins.js
// -----------------------------------------------------------------------------
// 3D annotation pin 의 DOM 생성 + 매 프레임 projection 갱신 유틸.
//
// 두 함수를 제공:
//   createAnnotationDOM()        — $pin + $bubble 쌍 생성 (순수 DOM, 이벤트 X)
//   updateAnnotationPins(ctx)    — annotations 배열의 모든 핀/말풍선 위치 갱신
//
// 이벤트 바인딩(toggle/edit/delete) 은 호출자(viewer.html 의 createAnnotation) 가
// 담당. 이유: 삭제 confirm, 모달 연결 등 viewer 측 상태에 의존하는 로직이라
// 여기서 추상화하면 결합도만 늘어남.
// -----------------------------------------------------------------------------

/**
 * 새 annotation 의 DOM 요소들을 만들어 document.body 에 append.
 *   { $pin, $bubble, $bubbleTitle, $bubbleBody, $bubbleEdit, $bubbleDelete }
 *
 * 호출자는 반환된 요소들에 click 핸들러를 연결.
 * 핀은 초기 상태로 'anno-pin unsaved' (빨강) — 저장 후 호출자가 unsaved 를 제거.
 */
export function createAnnotationDOM({ title = '', body = '' } = {}) {
    const $pin = document.createElement('button');
    $pin.type = 'button';
    $pin.className = 'anno-pin unsaved';
    $pin.textContent = '+';
    $pin.title = title || '(제목 없음)';

    const $bubble = document.createElement('div');
    $bubble.className = 'anno-bubble hidden';

    const $bubbleTitle = document.createElement('div');
    $bubbleTitle.className = 'anno-bubble-title';
    $bubbleTitle.textContent = title;

    const $bubbleBody = document.createElement('div');
    $bubbleBody.className = 'anno-bubble-body';
    $bubbleBody.textContent = body;

    const $bubbleActions = document.createElement('div');
    $bubbleActions.className = 'anno-bubble-actions';

    const $bubbleEdit = document.createElement('button');
    $bubbleEdit.className = 'anno-bubble-btn';
    $bubbleEdit.type = 'button';
    $bubbleEdit.textContent = 'Edit';

    const $bubbleDelete = document.createElement('button');
    $bubbleDelete.className = 'anno-bubble-btn';
    $bubbleDelete.type = 'button';
    $bubbleDelete.textContent = 'Delete';

    $bubbleActions.appendChild($bubbleEdit);
    $bubbleActions.appendChild($bubbleDelete);
    $bubble.appendChild($bubbleTitle);
    $bubble.appendChild($bubbleBody);
    $bubble.appendChild($bubbleActions);

    // 말풍선 내부 클릭 시 배경 클릭 (선택 해제 등) 으로 bubble 되지 않게
    $bubble.addEventListener('click', (ev) => ev.stopPropagation());

    document.body.appendChild($pin);
    document.body.appendChild($bubble);

    return { $pin, $bubble, $bubbleTitle, $bubbleBody, $bubbleEdit, $bubbleDelete };
}

/**
 * 매 프레임 호출 — 모든 annotation 의 anchor world 위치를 스크린에 투영해 핀/말풍선 transform 갱신.
 *
 * @param {object} ctx
 *   ctx.THREE        Three.js 모듈 (Vector3 생성용)
 *   ctx.annotations  [{ anchor, $pin, $bubble }, ...] 배열
 *   ctx.camera       THREE.Camera
 *   ctx._scratch?    (선택) { world, view } Vector3 캐시. 제공 안 하면 모듈 내부 static 사용.
 */
const _world = /* lazy init */ null;
const _view = null;
export function updateAnnotationPins(ctx) {
    const { annotations, camera, THREE } = ctx;
    if (!annotations || annotations.length === 0) return;

    // 정적 스크래치 (모듈 스코프) — 한 viewer 당 하나로 충분
    const w = updateAnnotationPins._w || (updateAnnotationPins._w = new THREE.Vector3());
    const v = updateAnnotationPins._v || (updateAnnotationPins._v = new THREE.Vector3());

    camera.updateMatrixWorld();
    const invView = camera.matrixWorldInverse;
    const hw = window.innerWidth / 2;
    const hh = window.innerHeight / 2;

    for (const a of annotations) {
        a.anchor.updateMatrixWorld(true);
        a.anchor.getWorldPosition(w);

        // 카메라 뒤쪽 (view-space z >= 0) → 숨김
        v.copy(w).applyMatrix4(invView);
        if (v.z >= 0) {
            a.$pin.classList.add('hidden');
            if (a.$bubble) a.$bubble.classList.add('hidden');
            continue;
        }

        // NDC → 픽셀
        w.project(camera);
        const x = w.x * hw + hw;
        const y = -w.y * hh + hh;

        a.$pin.classList.remove('hidden');
        a.$pin.style.transform = `translate3d(${x - 16}px, ${y - 16}px, 0)`;

        // 말풍선은 열려있을 때만 위치 갱신 (hidden 이면 transform 건드릴 필요 없음)
        if (a.$bubble && !a.$bubble.classList.contains('hidden')) {
            a.$bubble.style.transform = `translate3d(${x + 26}px, ${y - 18}px, 0)`;
        }
    }
}
