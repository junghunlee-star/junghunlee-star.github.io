// modules/persistence/csv-utils.js
// -----------------------------------------------------------------------------
// CSV 파싱 / 직렬화 / 파일 다운로드 유틸.
// 의존성 없음. 브라우저 환경 (Blob / URL.createObjectURL) 사용.
// -----------------------------------------------------------------------------

// URL에 쉼표가 없다고 가정하는 간단 파서 (teleport CSV 용).
// scene_match, trigger_px/py/pz, radius, dest_url 등. URL은 percent-encoded.
export function parseTeleportsCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const header = lines[0].split(',').map(h => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        const parts = line.split(',').map(p => p.trim());
        const row = {};
        header.forEach((k, j) => { row[k] = parts[j]; });
        rows.push(row);
    }
    return rows;
}

// 쌍따옴표 escape 지원 파서 (note CSV 용 — 본문에 쉼표/개행 가능).
export function parseNotesCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const header = lines[0].split(',').map(h => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        const parts = splitCsvLine(line);
        const row = {};
        header.forEach((k, j) => { row[k] = parts[j] ?? ''; });
        if (row.scene_match) rows.push(row);
    }
    return rows;
}

// RFC 4180 스타일 단일 라인 파서. `"` escape 로 `""` 사용.
export function splitCsvLine(line) {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (q) {
            if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
            else if (c === '"') q = false;
            else cur += c;
        } else {
            if (c === '"') q = true;
            else if (c === ',') { out.push(cur); cur = ''; }
            else cur += c;
        }
    }
    out.push(cur);
    return out.map(s => s.trim());
}

// 쉼표/개행/따옴표 포함 값이면 따옴표로 감싸고 내부 `"` 는 `""` 로 escape.
export function escapeCsvValue(v) {
    if (v === undefined || v === null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// header 배열 + rows 객체 배열 → 완성된 CSV 텍스트 (trailing newline 포함).
export function buildCsvText(header, rows) {
    const lines = [header.join(',')];
    for (const r of rows) {
        lines.push(header.map(h => escapeCsvValue(r[h])).join(','));
    }
    return lines.join('\n') + '\n';
}

// 브라우저 다운로드 트리거 — Blob + <a download> 트릭.
export function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}
