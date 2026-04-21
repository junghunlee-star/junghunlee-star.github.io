// modules/utils/gs-to-rhino.js
// -----------------------------------------------------------------------------
// 3D Gaussian Splat PLY → Rhino import 가능한 컬러 PointCloud PLY 변환 (JS 포팅).
// gs_to_rhino.py 와 동일 로직을 브라우저 환경에서 수행.
//
// 입력: 3DGS 학습 결과 point_cloud.ply (x, y, z, f_dc_0..2, opacity, ...)
// 출력: 표준 컬러 PLY (x, y, z, red, green, blue) 의 ArrayBuffer
//        → Blob 으로 감싸 다운로드.
//
// 변환 단계:
//   1) PLY 헤더 파싱 (text)
//   2) binary_little_endian 페이로드 → interleaved record → 필드별 추출
//   3) SH DC → sRGB (0.5 + SH_C0 * dc, clip [0,1], *255)
//   4) sigmoid(opacity) > 0.1 필터
//   5) (x, y, z) → (-x, z, y) viewer modelMatrix 적용
//   6) 최대 max_points 로 서브샘플 (기본 800,000)
//   7) 표준 컬러 PLY 직렬화
// -----------------------------------------------------------------------------

const SH_C0 = 0.28209479177387814;

// PLY property type → (byteSize, readerName) 매핑. DataView 기준.
const TYPE_INFO = {
    'float':   { size: 4, reader: 'getFloat32' },
    'float32': { size: 4, reader: 'getFloat32' },
    'double':  { size: 8, reader: 'getFloat64' },
    'float64': { size: 8, reader: 'getFloat64' },
    'uchar':   { size: 1, reader: 'getUint8'  },
    'uint8':   { size: 1, reader: 'getUint8'  },
    'char':    { size: 1, reader: 'getInt8'   },
    'int8':    { size: 1, reader: 'getInt8'   },
    'ushort':  { size: 2, reader: 'getUint16' },
    'uint16':  { size: 2, reader: 'getUint16' },
    'short':   { size: 2, reader: 'getInt16'  },
    'int16':   { size: 2, reader: 'getInt16'  },
    'uint':    { size: 4, reader: 'getUint32' },
    'uint32':  { size: 4, reader: 'getUint32' },
    'int':     { size: 4, reader: 'getInt32'  },
    'int32':   { size: 4, reader: 'getInt32'  },
};

/**
 * ArrayBuffer → { vertexCount, props: [{name,type,offset,size,reader}], payloadOffset }
 * 헤더는 ASCII 라인 기반. binary_little_endian 만 지원.
 */
function parseHeader(buffer) {
    const bytes = new Uint8Array(buffer);
    // 헤더 끝 위치 찾기 ("end_header\n")
    let headerEnd = -1;
    const MAX_HEADER = Math.min(bytes.length, 64 * 1024); // 헤더는 수 KB 이내
    const endMarker = new TextEncoder().encode('end_header\n');
    outer: for (let i = 0; i < MAX_HEADER - endMarker.length; i++) {
        for (let j = 0; j < endMarker.length; j++) {
            if (bytes[i + j] !== endMarker[j]) continue outer;
        }
        headerEnd = i + endMarker.length;
        break;
    }
    if (headerEnd < 0) throw new Error('PLY end_header 를 찾지 못함 — 올바른 PLY 파일이 아닌 것 같습니다.');

    const headerText = new TextDecoder('ascii').decode(bytes.subarray(0, headerEnd));
    const lines = headerText.split(/\r?\n/);
    if (lines[0].trim() !== 'ply') throw new Error('PLY magic 아님: ' + lines[0]);

    let fmt = null, vertexCount = null;
    const props = []; // {type, name, offset, size, reader}
    let curOffset = 0;
    for (const rawLine of lines) {
        const s = rawLine.trim();
        if (!s || s === 'end_header') continue;
        const parts = s.split(/\s+/);
        const key = parts[0];
        if (key === 'format') {
            fmt = parts[1];
        } else if (key === 'element' && parts[1] === 'vertex') {
            vertexCount = parseInt(parts[2], 10);
        } else if (key === 'property') {
            const type = parts[1];
            const name = parts[2];
            const info = TYPE_INFO[type];
            if (!info) throw new Error(`지원 안 되는 PLY property type: ${type}`);
            props.push({ type, name, offset: curOffset, size: info.size, reader: info.reader });
            curOffset += info.size;
        }
    }
    if (fmt !== 'binary_little_endian 1.0' && fmt !== 'binary_little_endian') {
        throw new Error(`binary_little_endian 만 지원. 현재: ${fmt}`);
    }
    if (vertexCount === null) throw new Error('vertex element 를 찾지 못함');
    return { vertexCount, props, payloadOffset: headerEnd, recordSize: curOffset };
}

/** 진행률 로깅을 위한 소단위 마이크로태스크 양보 */
const yieldNow = () => new Promise(r => setTimeout(r, 0));

/**
 * GS PLY ArrayBuffer 를 Rhino 컬러 PLY ArrayBuffer 로 변환.
 *
 * @param {ArrayBuffer} inputBuffer
 * @param {object} [opts]
 *   opts.opacityThreshold   (기본 0.1)  — sigmoid(opacity) 이 값보다 크면 keep
 *   opts.maxPoints          (기본 800_000) — 서브샘플 상한. null 이면 제한 없음
 *   opts.applyViewerMatrix  (기본 true) — (x,y,z) → (-x,z,y) 적용
 *   opts.onProgress         (기본 noop) — ({stage, pct, msg}) 콜백
 * @returns {Promise<ArrayBuffer>}  Rhino PLY 바이너리
 */
export async function convertGsPlyToRhinoPly(inputBuffer, opts = {}) {
    const {
        opacityThreshold = 0.1,
        maxPoints = 800_000,
        applyViewerMatrix = true,
        onProgress = () => {},
    } = opts;

    onProgress({ stage: 'parse', pct: 0, msg: 'PLY 헤더 파싱 중…' });
    const { vertexCount, props, payloadOffset, recordSize } = parseHeader(inputBuffer);

    // 필수 필드 탐색
    const need = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity'];
    const byName = {};
    for (const p of props) byName[p.name] = p;
    const missing = need.filter(n => !byName[n]);
    if (missing.length) throw new Error('필수 필드 누락: ' + missing.join(', '));

    const payload = new DataView(inputBuffer, payloadOffset, vertexCount * recordSize);
    const totalBytes = vertexCount * recordSize;
    onProgress({ stage: 'read', pct: 5, msg: `vertex = ${vertexCount.toLocaleString()} / 레코드 ${recordSize}B` });

    // 각 필드 reader 함수
    const readField = (i, fieldName) => {
        const p = byName[fieldName];
        return payload[p.reader](i * recordSize + p.offset, true /* little endian */);
    };

    // 1) 필터 + 변환 — 스트리밍으로 진행 (vertex 가 많으면 수천만 개이므로 chunk 처리)
    const xyzOut = new Float32Array(vertexCount * 3); // 최대 크기로 할당, 끝에 자름
    const rgbOut = new Uint8Array(vertexCount * 3);
    let kept = 0;

    const CHUNK = 200_000;
    for (let chunkStart = 0; chunkStart < vertexCount; chunkStart += CHUNK) {
        const end = Math.min(chunkStart + CHUNK, vertexCount);
        for (let i = chunkStart; i < end; i++) {
            // opacity sigmoid (수치 안정 형태)
            const op = readField(i, 'opacity');
            let sig;
            if (op >= 0) {
                const e = Math.exp(-op);
                sig = 1 / (1 + e);
            } else {
                const e = Math.exp(op);
                sig = e / (1 + e);
            }
            if (sig <= opacityThreshold) continue;

            // SH DC → RGB
            const d0 = readField(i, 'f_dc_0');
            const d1 = readField(i, 'f_dc_1');
            const d2 = readField(i, 'f_dc_2');
            let r = 0.5 + SH_C0 * d0;
            let g = 0.5 + SH_C0 * d1;
            let b = 0.5 + SH_C0 * d2;
            if (r < 0) r = 0; else if (r > 1) r = 1;
            if (g < 0) g = 0; else if (g > 1) g = 1;
            if (b < 0) b = 0; else if (b > 1) b = 1;

            // 위치 + viewer modelMatrix
            let x = readField(i, 'x');
            let y = readField(i, 'y');
            let z = readField(i, 'z');
            if (applyViewerMatrix) {
                const nx = -x, ny = z, nz = y;
                x = nx; y = ny; z = nz;
            }

            const k = kept * 3;
            xyzOut[k]     = x;
            xyzOut[k + 1] = y;
            xyzOut[k + 2] = z;
            rgbOut[k]     = (r * 255 + 0.5) | 0;
            rgbOut[k + 1] = (g * 255 + 0.5) | 0;
            rgbOut[k + 2] = (b * 255 + 0.5) | 0;
            kept++;
        }
        onProgress({
            stage: 'filter',
            pct: 5 + Math.round(80 * end / vertexCount),
            msg: `필터 진행: ${end.toLocaleString()} / ${vertexCount.toLocaleString()} (keep ${kept.toLocaleString()})`,
        });
        await yieldNow(); // UI 블록 방지
    }

    // 2) 서브샘플 (선택)
    let nFinal = kept;
    let idxMap = null;
    if (maxPoints && kept > maxPoints) {
        // Fisher-Yates 로 상위 maxPoints 개 인덱스 선택
        idxMap = new Uint32Array(kept);
        for (let i = 0; i < kept; i++) idxMap[i] = i;
        for (let i = kept - 1; i > 0; i--) {
            const j = (Math.random() * (i + 1)) | 0;
            const t = idxMap[i]; idxMap[i] = idxMap[j]; idxMap[j] = t;
        }
        nFinal = maxPoints;
        onProgress({ stage: 'sample', pct: 88, msg: `서브샘플 → ${nFinal.toLocaleString()}` });
    }

    // 3) 출력 PLY 빌드
    onProgress({ stage: 'write', pct: 92, msg: '출력 바이너리 작성…' });
    const headerText =
        'ply\n' +
        'format binary_little_endian 1.0\n' +
        'comment converted from 3D Gaussian Splat PLY\n' +
        'comment SH DC -> RGB, opacity filtered, ready for Rhino _Import\n' +
        `element vertex ${nFinal}\n` +
        'property float x\n' +
        'property float y\n' +
        'property float z\n' +
        'property uchar red\n' +
        'property uchar green\n' +
        'property uchar blue\n' +
        'end_header\n';
    const headerBytes = new TextEncoder().encode(headerText);

    const recSize = 15; // 4*3 + 1*3
    const out = new ArrayBuffer(headerBytes.byteLength + nFinal * recSize);
    new Uint8Array(out, 0, headerBytes.byteLength).set(headerBytes);
    const dv = new DataView(out, headerBytes.byteLength);
    for (let i = 0; i < nFinal; i++) {
        const src = idxMap ? idxMap[i] : i;
        const s3 = src * 3;
        const o = i * recSize;
        dv.setFloat32(o,     xyzOut[s3],     true);
        dv.setFloat32(o + 4, xyzOut[s3 + 1], true);
        dv.setFloat32(o + 8, xyzOut[s3 + 2], true);
        dv.setUint8(o + 12, rgbOut[s3]);
        dv.setUint8(o + 13, rgbOut[s3 + 1]);
        dv.setUint8(o + 14, rgbOut[s3 + 2]);
    }
    onProgress({ stage: 'done', pct: 100, msg: `완료: ${nFinal.toLocaleString()} points` });
    return out;
}
