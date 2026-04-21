// modules/persistence/local-store.js
// -----------------------------------------------------------------------------
// 브라우저 localStorage 기반 사용자 데이터 저장소.
// teleport / note 의 "CSV 오버라이드" 와 "삭제 기록" 을 관리.
//
// 의존성 없음 (pure JS). 어떤 viewer 조합에서도 import 해서 쓸 수 있음.
// -----------------------------------------------------------------------------

const KEYS = {
    USER_TELEPORTS:        'voidbox.userTeleports.v1',
    TELEPORT_DELETIONS:    'voidbox.teleportDeletions.v1',
    USER_NOTES:            'voidbox.userNotes.v1',
    NOTE_DELETIONS:        'voidbox.noteDeletions.v1',
    USER_SCENES_INDOOR:    'voidbox.userScenesIndoor.v1',
    USER_SCENES_OUTDOOR:   'voidbox.userScenesOutdoor.v1',
    SCENE_DELETIONS:       'voidbox.sceneDeletions.v1',
};

function readJSON(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch { return []; }
}

function writeJSON(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch { /* quota full 등 무시 */ }
}

// ── Teleports ───────────────────────────────────────────────────────────────
export function loadUserTeleports()     { return readJSON(KEYS.USER_TELEPORTS); }
export function saveUserTeleports(arr)  { writeJSON(KEYS.USER_TELEPORTS, arr); }

export function loadTeleportDeletions()    { return readJSON(KEYS.TELEPORT_DELETIONS); }
export function saveTeleportDeletions(arr) { writeJSON(KEYS.TELEPORT_DELETIONS, arr); }

// ── Notes ───────────────────────────────────────────────────────────────────
export function loadUserNotes()     { return readJSON(KEYS.USER_NOTES); }
export function saveUserNotes(arr)  { writeJSON(KEYS.USER_NOTES, arr); }

export function loadNoteDeletions()    { return readJSON(KEYS.NOTE_DELETIONS); }
export function saveNoteDeletions(arr) { writeJSON(KEYS.NOTE_DELETIONS, arr); }

// ── Scenes (사용자 추가 공간) ───────────────────────────────────────────────
export function loadUserScenes(group = 'indoor') {
    const key = group === 'outdoor' ? KEYS.USER_SCENES_OUTDOOR : KEYS.USER_SCENES_INDOOR;
    return readJSON(key);
}
export function saveUserScenes(group, arr) {
    const key = group === 'outdoor' ? KEYS.USER_SCENES_OUTDOOR : KEYS.USER_SCENES_INDOOR;
    writeJSON(key, arr);
}

// 씬 삭제 기록 — 정적 CSV 의 씬도 "숨김 처리" 할 수 있도록 URL 리스트로 관리.
export function loadSceneDeletions()     { return readJSON(KEYS.SCENE_DELETIONS); }
export function saveSceneDeletions(arr)  { writeJSON(KEYS.SCENE_DELETIONS, arr); }

// ── Row key helpers (좌표 기반 고유 식별자, 0.1m 단위 반올림) ───────────────
//    CSV 중복 제거 / 삭제 매칭의 기준.
export function teleportRowKey(sceneMatch, px, pz) {
    const rx = Math.round(parseFloat(px) * 10) / 10;
    const rz = Math.round(parseFloat(pz) * 10) / 10;
    return `${sceneMatch}|${rx}|${rz}`;
}

export function noteRowKey(sceneMatch, px, py, pz) {
    const rx = Math.round(parseFloat(px) * 10) / 10;
    const ry = Math.round(parseFloat(py) * 10) / 10;
    const rz = Math.round(parseFloat(pz) * 10) / 10;
    return `${sceneMatch}|${rx}|${ry}|${rz}`;
}

// 전체 로컬 데이터 초기화 (디버깅/설정 리셋용)
export function clearAllUserData() {
    for (const k of Object.values(KEYS)) localStorage.removeItem(k);
}
