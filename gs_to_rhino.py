"""
3D Gaussian Splat PLY → Rhino import 가능한 컬러 PointCloud PLY 변환기.

입력: 3DGS 학습 결과 point_cloud.ply (x, y, z, f_dc_0..2, opacity, scale, rot 등)
출력: 표준 컬러 PLY (x, y, z, red, green, blue) — Rhino `_Import` 로 바로 읽힘

외부 의존성: numpy 만 필요 (plyfile 불필요, binary PLY를 직접 파싱).
"""

import numpy as np
import struct
import sys
import os

SH_C0 = 0.28209479177387814  # Spherical Harmonics 0차 계수


def parse_header(f):
    """Text header를 읽어서 (vertex_count, property_names, ascii_or_binary) 반환."""
    line = f.readline().strip()
    if line != b'ply':
        raise ValueError(f'PLY 매직이 아님: {line!r}')

    vertex_count = None
    props = []  # (dtype_str, name)
    fmt = None

    while True:
        line = f.readline()
        if not line:
            raise ValueError('unexpected EOF in header')
        s = line.strip()
        if s == b'end_header':
            break
        parts = s.split()
        if len(parts) == 0:
            continue
        key = parts[0]
        if key == b'format':
            fmt = parts[1].decode('ascii')
        elif key == b'element' and parts[1] == b'vertex':
            vertex_count = int(parts[2])
        elif key == b'property':
            # property <type> <name>
            dtype_str = parts[1].decode('ascii')
            name = parts[2].decode('ascii')
            props.append((dtype_str, name))
        # comment / element face 등은 무시

    if vertex_count is None:
        raise ValueError('vertex element를 찾지 못함')
    if fmt != 'binary_little_endian':
        raise ValueError(
            f'이 스크립트는 binary_little_endian 만 지원. 현재: {fmt}'
        )

    return vertex_count, props


def ply_type_to_numpy(t):
    return {
        'float': '<f4', 'float32': '<f4',
        'double': '<f8', 'float64': '<f8',
        'uchar': '<u1', 'uint8': '<u1',
        'char': '<i1', 'int8': '<i1',
        'ushort': '<u2', 'uint16': '<u2',
        'short': '<i2', 'int16': '<i2',
        'uint': '<u4', 'uint32': '<u4',
        'int': '<i4', 'int32': '<i4',
    }[t]


def apply_viewer_model_matrix(xyz):
    """뷰어 viewer.html 의 modelMatrix 와 동일한 좌표 변환.

    modelMatrix = [[-1, 0, 0, 0],
                   [ 0, 0, 1, 0],
                   [ 0, 1, 0, 0],
                   [ 0, 0, 0, 1]]

    즉 (x, y, z) -> (-x, z, y). X 반전 + Y <-> Z 스왑.
    Rhino 에서 import 한 결과가 viewer 와 완전히 같은 방향/위치로 보이도록 정렬.
    """
    out = np.empty_like(xyz)
    out[:, 0] = -xyz[:, 0]
    out[:, 1] = xyz[:, 2]
    out[:, 2] = xyz[:, 1]
    return out


def convert(in_path, out_path, opacity_thr=0.1, max_points=None, seed=0,
            apply_viewer_matrix=True):
    size = os.path.getsize(in_path)
    print(f'[1/5] 입력: {in_path} ({size/1024/1024:.1f} MB)')

    with open(in_path, 'rb') as f:
        vcount, props = parse_header(f)
        header_end = f.tell()
        print(f'      vertex_count = {vcount:,}')
        print(f'      properties   = {len(props)} '
              f'({", ".join(p[1] for p in props[:6])}...)')

        # 구조화된 dtype 생성
        dtype = np.dtype([(name, ply_type_to_numpy(t)) for (t, name) in props])
        record_size = dtype.itemsize
        expected = vcount * record_size
        remaining = size - header_end
        if remaining < expected:
            raise ValueError(
                f'파일이 예상보다 작음: {remaining} < {expected} '
                f'(레코드 {record_size} bytes * {vcount})'
            )

        print(f'[2/5] 바이너리 페이로드 읽는 중 '
              f'({expected/1024/1024:.1f} MB)...')
        arr = np.frombuffer(f.read(expected), dtype=dtype, count=vcount)

    # 필수 필드 확인
    needed = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity']
    missing = [n for n in needed if n not in arr.dtype.names]
    if missing:
        raise ValueError(f'필수 필드 누락: {missing}')

    print('[3/5] SH → RGB 변환 + opacity 필터링...')
    # SH DC term → 선형 RGB → [0,1] clip → 8bit
    rgb = np.stack([arr['f_dc_0'], arr['f_dc_1'], arr['f_dc_2']], axis=-1)
    rgb = np.clip(0.5 + SH_C0 * rgb, 0.0, 1.0)
    rgb = (rgb * 255.0 + 0.5).astype(np.uint8)

    # opacity 로짓 → sigmoid (안정적 계산)
    op_raw = arr['opacity']
    op = np.where(
        op_raw >= 0,
        1.0 / (1.0 + np.exp(-op_raw)),
        np.exp(op_raw) / (1.0 + np.exp(op_raw)),
    )
    mask = op > opacity_thr

    xyz = np.stack([arr['x'], arr['y'], arr['z']], axis=-1)
    xyz = xyz[mask]
    rgb = rgb[mask]
    kept = len(xyz)
    print(f'      opacity > {opacity_thr} : {kept:,} / {vcount:,} '
          f'({kept/vcount*100:.1f}%)')

    if apply_viewer_matrix:
        print('      viewer modelMatrix 적용: (x, y, z) -> (-x, z, y)')
        xyz = apply_viewer_model_matrix(xyz)

    if max_points and kept > max_points:
        rng = np.random.default_rng(seed)
        idx = rng.choice(kept, max_points, replace=False)
        xyz = xyz[idx]
        rgb = rgb[idx]
        print(f'      서브샘플 → {len(xyz):,}')

    n = len(xyz)

    print(f'[4/5] 출력 작성 중: {out_path}')
    with open(out_path, 'wb') as f:
        header = (
            'ply\n'
            'format binary_little_endian 1.0\n'
            'comment converted from 3D Gaussian Splat PLY\n'
            'comment SH DC -> RGB, opacity filtered, ready for Rhino _Import\n'
            f'element vertex {n}\n'
            'property float x\n'
            'property float y\n'
            'property float z\n'
            'property uchar red\n'
            'property uchar green\n'
            'property uchar blue\n'
            'end_header\n'
        )
        f.write(header.encode('ascii'))

        # 레코드 단위로 interleave: (float x 3) + (uchar x 3) = 15 bytes
        out_dtype = np.dtype([
            ('x', '<f4'), ('y', '<f4'), ('z', '<f4'),
            ('r', '<u1'), ('g', '<u1'), ('b', '<u1'),
        ])
        rec = np.empty(n, dtype=out_dtype)
        rec['x'] = xyz[:, 0]
        rec['y'] = xyz[:, 1]
        rec['z'] = xyz[:, 2]
        rec['r'] = rgb[:, 0]
        rec['g'] = rgb[:, 1]
        rec['b'] = rgb[:, 2]
        f.write(rec.tobytes())

    out_size = os.path.getsize(out_path)
    print(f'[5/5] 완료! {n:,} points, {out_size/1024/1024:.1f} MB')
    bbox_min = xyz.min(axis=0)
    bbox_max = xyz.max(axis=0)
    print(f'      bbox min = {bbox_min}')
    print(f'      bbox max = {bbox_max}')
    print(f'      size (W×D×H) = {bbox_max - bbox_min}')


if __name__ == '__main__':
    # 기본 입출력 경로 (인자 없을 때)
    default_in = os.path.join(os.path.dirname(__file__), 'point_cloud.ply')
    default_out = os.path.join(os.path.dirname(__file__), 'point_cloud_rhino.ply')

    in_path = sys.argv[1] if len(sys.argv) > 1 else default_in
    out_path = sys.argv[2] if len(sys.argv) > 2 else default_out

    convert(
        in_path,
        out_path,
        opacity_thr=0.1,          # 낮은 opacity 제거 (플로터 제거)
        max_points=800_000,       # Rhino 쾌적하게 다루는 상한
        apply_viewer_matrix=True, # viewer.html 의 modelMatrix 와 같은 방향으로 정렬
    )
