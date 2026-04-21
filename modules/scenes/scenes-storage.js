// modules/scenes/scenes-storage.js
// -----------------------------------------------------------------------------
// 씬 카탈로그 (scenes.csv / scenes-outdoor.csv) 의 CRUD + CSV 동기화.
// teleports-storage / notes-storage 와 동일 패턴.
// -----------------------------------------------------------------------------

import {
    loadUserScenes, saveUserScenes,
    loadSceneDeletions, saveSceneDeletions,
} from '../persistence/local-store.js';
import { buildCsvText } from '../persistence/csv-utils.js';

export const SCENES_CSV_HEADER = ['name','url','px','py','pz','yaw','pitch','mesh'];

/** 기존 index.html 에서 썼던 것과 동일한 단순 파서. URL 에 쉼표 없다는 가정. */
function parseScenesCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const header = lines[0].split(',').map(h => h.trim());
    return lines.slice(1)
        .map(line => {
            const parts = line.split(',').map(p => p.trim());
            const row = {};
            header.forEach((key, i) => {
                if (parts[i] !== undefined && parts[i] !== '') row[key] = parts[i];
            });
            return row;
        })
        .filter(r => r.name && r.url);
}

export function scenesCsvPath(group) {
    return group === 'outdoor' ? './scenes-outdoor.csv' : './scenes.csv';
}

export async function fetchScenesCSV(group) {
    try {
        const res = await fetch(scenesCsvPath(group));
        if (!res.ok) return [];
        return parseScenesCSV(await res.text());
    } catch { return []; }
}

/**
 * csvRows + userRows 병합. 같은 url 이면 user 우선.
 * deletions 에 기록된 URL 은 결과에서 제외.
 */
export function mergeSceneRows(csvRows = [], userRows = [], deletions = []) {
    const dels = new Set(deletions);
    let rows = [...csvRows];
    for (const u of userRows) {
        const dupIdx = rows.findIndex(r => r.url === u.url);
        if (dupIdx >= 0) rows[dupIdx] = u;
        else rows.push(u);
    }
    rows = rows.filter(r => !dels.has(r.url));
    return rows;
}

/** index.html 카드 목록에 쓸 최종 rows 배열. */
export async function getAllScenes(group) {
    const csvRows = await fetchScenesCSV(group);
    const userRows = loadUserScenes(group);
    const deletions = loadSceneDeletions();
    return mergeSceneRows(csvRows, userRows, deletions);
}

/** 다운로드용 CSV 텍스트. */
export async function buildUpdatedScenesCsv(group) {
    const csvRows = await fetchScenesCSV(group);
    const userRows = loadUserScenes(group);
    const deletions = loadSceneDeletions();
    const merged = mergeSceneRows(csvRows, userRows, deletions);
    return buildCsvText(SCENES_CSV_HEADER, merged);
}

/**
 * 씬 삭제 — user scene 배열에서 URL 제거 + deletions 에 기록(정적 CSV 도 숨김).
 * @param {string} group  'indoor' | 'outdoor'
 * @param {string} url
 */
export function deleteSceneByUrl(group, url) {
    if (!url) return;
    // user 쪽 제거
    const rows = loadUserScenes(group).filter(r => r.url !== url);
    saveUserScenes(group, rows);
    // deletions 기록 (정적 CSV 항목도 숨김)
    const dels = loadSceneDeletions();
    if (!dels.includes(url)) {
        dels.push(url);
        saveSceneDeletions(dels);
    }
}

/**
 * 새 씬 추가 (name + url + group + optional mesh).
 * 이후 setup 모드에서 spawn 포즈가 확정되면 updateSceneSpawn 으로 덮어씀.
 */
export function upsertUserScene(group, row) {
    const rows = loadUserScenes(group);
    const dupIdx = rows.findIndex(r => r.url === row.url);
    if (dupIdx >= 0) rows[dupIdx] = { ...rows[dupIdx], ...row };
    else rows.push(row);
    saveUserScenes(group, rows);
}

export function updateSceneSpawn(group, url, pose) {
    const rows = loadUserScenes(group);
    const idx = rows.findIndex(r => r.url === url);
    if (idx < 0) return false;
    rows[idx] = {
        ...rows[idx],
        px: pose.px, py: pose.py, pz: pose.pz,
        yaw: pose.yaw, pitch: pose.pitch,
    };
    saveUserScenes(group, rows);
    return true;
}

export function removeUserScene(group, url) {
    const rows = loadUserScenes(group).filter(r => r.url !== url);
    saveUserScenes(group, rows);
}

/**
 * 주어진 .lcc URL 이 indoor / outdoor 중 어디에 등록돼 있는지 판별.
 * 정적 CSV + user scenes 를 모두 검색 → 매칭되는 그룹 문자열 반환.
 * 어디에도 없으면 null.
 */
export async function detectSceneGroup(url) {
    if (!url) return null;
    for (const group of ['indoor', 'outdoor']) {
        const rows = await getAllScenes(group);
        if (rows.some(r => r.url === url)) return group;
    }
    return null;
}
