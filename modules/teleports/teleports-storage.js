// modules/teleports/teleports-storage.js
// -----------------------------------------------------------------------------
// Teleport 도메인의 CRUD + CSV 동기화.
//   - 정적 CSV(teleports.csv) 의 row 들
//   - localStorage 의 userTeleports (override/add)
//   - localStorage 의 teleportDeletions (삭제 기록)
// 이 세 소스를 합쳐 "현재 유효한 teleport 목록" 을 제공.
//
// 의존:
//   - modules/persistence/local-store.js
//   - modules/persistence/csv-utils.js
// -----------------------------------------------------------------------------

import {
    loadUserTeleports,
    loadTeleportDeletions,
    teleportRowKey,
} from '../persistence/local-store.js';
import { parseTeleportsCSV, buildCsvText } from '../persistence/csv-utils.js';

// CSV 파일 스키마 (column 순서 고정)
export const TELEPORT_CSV_HEADER = [
    'scene_match',
    'trigger_px', 'trigger_py', 'trigger_pz',
    'radius', 'marker_y', 'arrow_yaw',
    'dest_url', 'dest_px', 'dest_py', 'dest_pz', 'dest_yaw', 'dest_pitch',
    'label',
];

/**
 * teleports.csv fetch + parse. 실패 시 빈 배열 (파일 없음 == 에러가 아님).
 */
export async function fetchTeleportsCSV(path = './teleports.csv') {
    try {
        const res = await fetch(path);
        if (!res.ok) return [];
        return parseTeleportsCSV(await res.text());
    } catch { return []; }
}

/**
 * 정적 CSV rows + localStorage user rows + deletions → 최종 rows 배열.
 *   - user row 가 같은 위치(0.1m 이내)의 정적 row 를 override
 *   - deletions 에 있는 key 의 row 는 제외
 */
export function mergeTeleportRows(csvRows = [], userRows = [], deletions = []) {
    const dels = new Set(deletions);
    let rows = [...csvRows];
    for (const u of userRows) {
        const dupIdx = rows.findIndex(r =>
            r.scene_match === u.scene_match &&
            Math.abs(parseFloat(r.trigger_px) - parseFloat(u.trigger_px)) < 0.1 &&
            Math.abs(parseFloat(r.trigger_pz) - parseFloat(u.trigger_pz)) < 0.1,
        );
        if (dupIdx >= 0) rows[dupIdx] = u;
        else rows.push(u);
    }
    rows = rows.filter(r =>
        !dels.has(teleportRowKey(r.scene_match, r.trigger_px, r.trigger_pz)),
    );
    return rows;
}

/**
 * "현재 저장 상태" 를 정확히 반영한 teleports.csv 전체 텍스트를 생성.
 * 다운로드 → 디스크 덮어쓰기 용도.
 */
export async function buildUpdatedTeleportsCsv(path = './teleports.csv') {
    const csvRows = await fetchTeleportsCSV(path);
    const userRows = loadUserTeleports();
    const deletions = loadTeleportDeletions();
    const merged = mergeTeleportRows(csvRows, userRows, deletions);
    return buildCsvText(TELEPORT_CSV_HEADER, merged);
}

/**
 * 특정 씬(DATA_PATH URL)에 속한 활성 teleport row 들만 필터링.
 * (scene_match 문자열이 URL 에 포함되는지로 판정 — 기존 viewer 규약 유지)
 * 반환되는 row 들은 raw CSV 객체 형태. 3D 마커 변환은 호출자 몫.
 */
export async function getActiveTeleportsForScene(dataPath, csvPath = './teleports.csv') {
    const csvRows = await fetchTeleportsCSV(csvPath);
    const userRows = loadUserTeleports();
    const deletions = loadTeleportDeletions();
    const merged = mergeTeleportRows(csvRows, userRows, deletions);
    return merged.filter(r =>
        r.scene_match && dataPath && dataPath.includes(r.scene_match),
    );
}
