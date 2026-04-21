// modules/notes/notes-storage.js
// -----------------------------------------------------------------------------
// Note 도메인의 CRUD + CSV 동기화.
//   - 정적 CSV(notes.csv) rows
//   - localStorage 의 userNotes
//   - localStorage 의 noteDeletions
// teleports-storage.js 와 동일 설계를 note 전용으로 제공.
//
// 의존:
//   - modules/persistence/local-store.js
//   - modules/persistence/csv-utils.js
// -----------------------------------------------------------------------------

import {
    loadUserNotes,
    loadNoteDeletions,
    noteRowKey,
} from '../persistence/local-store.js';
import { parseNotesCSV, buildCsvText } from '../persistence/csv-utils.js';

export const NOTES_CSV_HEADER = [
    'scene_match',
    'world_px', 'world_py', 'world_pz',
    'title', 'body',
];

export async function fetchNotesCSV(path = './notes.csv') {
    try {
        const res = await fetch(path);
        if (!res.ok) return [];
        return parseNotesCSV(await res.text());
    } catch { return []; }
}

/**
 * csvRows + userRows + deletions → 최종 rows
 *   - user row 가 같은 위치(0.1m 이내) 정적 row 를 override
 *   - deletions 에 있는 key 의 row 제외
 * 위치 비교는 world_px / world_pz 기준 (teleport 와 동일 규약).
 */
export function mergeNoteRows(csvRows = [], userRows = [], deletions = []) {
    const dels = new Set(deletions);
    let rows = [...csvRows];
    for (const u of userRows) {
        const dupIdx = rows.findIndex(r =>
            r.scene_match === u.scene_match &&
            Math.abs(parseFloat(r.world_px) - parseFloat(u.world_px)) < 0.1 &&
            Math.abs(parseFloat(r.world_pz) - parseFloat(u.world_pz)) < 0.1,
        );
        if (dupIdx >= 0) rows[dupIdx] = u;
        else rows.push(u);
    }
    rows = rows.filter(r =>
        !dels.has(noteRowKey(r.scene_match, r.world_px, r.world_py, r.world_pz)),
    );
    return rows;
}

export async function buildUpdatedNotesCsv(path = './notes.csv') {
    const csvRows = await fetchNotesCSV(path);
    const userRows = loadUserNotes();
    const deletions = loadNoteDeletions();
    const merged = mergeNoteRows(csvRows, userRows, deletions);
    return buildCsvText(NOTES_CSV_HEADER, merged);
}

/**
 * 주어진 sceneMatch(extractSceneMatch 로 추출된 정확 일치 값)에 속한 활성 note row 들.
 * teleports 와 달리 note 는 scene_match 를 "정확 일치" 로 비교 (기존 규약 유지).
 */
export async function getActiveNotesForScene(sceneMatch, csvPath = './notes.csv') {
    const csvRows = await fetchNotesCSV(csvPath);
    const userRows = loadUserNotes();
    const deletions = loadNoteDeletions();
    const merged = mergeNoteRows(csvRows, userRows, deletions);
    return merged.filter(r => r.scene_match === sceneMatch);
}
