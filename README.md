# voidboxViewer.github.io

3D Gaussian Splatting (LCC) 웹 뷰어 + 메시 오버레이 / 주석 / 클리핑 툴.

브라우저만 있으면 정적 호스팅으로 돌아가는 **빌드 프로세스 없는** Three.js + LCC SDK 기반 뷰어입니다.

---

## 파일 구조

```
voidboxViewer.github.io/
├── index.html              # 장면 목록 (스플랫 선택 랜딩)
├── viewer.html             # 1인칭 스플랫 뷰어 + 메시/주석 툴
├── scenes.csv              # 실내 장면 목록
├── scenes-outdoor.csv      # 야외 장면 목록
├── gs_to_rhino.py          # GS PLY → Rhino 가져올 수 있는 컬러 PLY 변환
├── engine/three/           # Three.js 및 addon 모듈 (importmap 경유)
│   ├── three.module.js
│   ├── FirstPersonControls.js
│   ├── OrbitControls.js
│   └── jsm/                # OBJLoader, 3DMLoader, TransformControls 등
├── sdk/
│   └── lcc-0.5.5.js        # LCC Gaussian Splat 렌더 SDK
└── standalone-viewer/      # 별도의 PLY/SOG 테스트용 뷰어
```

---

## 실행

빌드 없음. 정적 서버만 필요 (`file://` 로는 ES 모듈 로드가 막혀서 동작 안 함).

```bash
# 파이썬 (가장 간편)
python -m http.server 5500

# 또는 node
npx http-server -p 5500

# VS Code 의 Live Server 확장도 가능
```

그다음 <http://localhost:5500/> 접속.

---

## 주요 기능

### 1. Gaussian Splat 렌더
- LCC SDK (`lcc-0.5.5.js`) 로 `.lcc` 포맷 스플랫 스트리밍
- `modelMatrix` 로 원본 Splat 좌표 (`(x, y, z)`) 를 표시용으로 변환 — **X 반전 + Y↔Z 스왑** (즉 `world_Y ≡ raw_Z`)
- 내부 collider (`lccObj.intersectsSphere`) 지원 시 자동 활성화

### 2. 1인칭 네비게이션
| 입력 | 동작 |
|------|------|
| `W`/`A`/`S`/`D` | XZ 평면 이동 |
| `R`/`F` | 높이 +/- |
| 마우스 드래그 | 시점 회전 |
| 오른쪽 슬라이더 | **Splat 클리핑** (CEIL → FLOOR) |
| 좌측 조이스틱 (모바일) | 이동 |
| 우측 조이스틱 (모바일) | 시점 |
| `RESET ↺` | 초기 spawn 위치로 복귀 |

**모바일 감지**: `matchMedia('(pointer: coarse)')` 또는 `maxTouchPoints > 0` — 해상도 기반 X (iPad 가로 등 오인식 방지)

### 3. 메시 드래그앤드롭 (OBJ / 3DM)
뷰어 어디든 `.obj` 또는 `.3dm` 파일을 떨구면 로드.

- **OBJ**: `OBJLoader` (동기), 텍스트 파싱
- **3DM**: `Rhino3dmLoader` + `rhino3dm.wasm` (jsdelivr CDN에서 자동 다운로드)
- 로드된 메시는 Splat 과 동일한 `modelMatrix` 가 적용된 `objGroup` 에 들어감 → 좌표 정렬

좌측 하단 **Loaded Models 패널**에서 관리:
- 모델별 `Shown`/`Hidden` 토글
- 상단 `Collider On/Off` 토글 — 켜면 메시 벽에 부딪힘 (raycast 16-direction ring)

### 4. Transform Gizmo (검볼)
메시 클릭 시 선택 → 하단 중앙 `Transform` 패널 등장.

- **기본**: 개별 mesh (leaf) 선택 — USD처럼 자식별 독립 조작
- **Alt/Shift+Click**: root 모델 전체 선택
- `Move` / `Rotate` / `Scale` 모드 전환
- `Delete` 버튼 또는 `Backspace`/`Delete` 키로 삭제
- **선택 하이라이트**: 시안색 EdgesGeometry 오버레이 (`depthTest: false`)
- **Pivot 재설정**: 로드 시점에 각 mesh의 geometry 를 bbox 중심으로 이동 + 위치 보정 → gizmo 가 메시 **중앙**에 뜸

단축키 (선택된 상태에서만):
| 키 | 동작 |
|-----|------|
| `G` | Move |
| `T` | Rotate (R은 FPS 이동과 충돌) |
| `Y` | Scale |
| `Esc` | 선택 해제 |
| `Delete`/`Backspace` | 삭제 |

### 5. Splat 클리핑
오른쪽 슬라이더 (`CEIL` ↔ `FLOOR`) 로 Splat 상단을 잘라냄.

- LCC SDK 의 `setClipBox({ position, rotation, scale, clipSide })` API 활용
- **메시는 영향 없음** — Splat 만 잘림 (건물 내부 투시 등에 유용)
- Shader 가 splat 의 raw 좌표계를 쓰므로 박스 높이는 `scale.z` (raw_Z ≡ world_Y)
- 슬라이더 최상단: `setClipBox(null)` → 클리핑 비활성화
- `Reset ↺` 버튼은 슬라이더도 최상단으로 복원

### 6. 3D 주석 핀 (Annotation)
메시에 `+` 버튼을 붙여 정보 팝업.

**워크플로 (일반):**
1. `+ NOTE` 버튼 (상단 우측) 클릭
2. 메시 선택된 상태면 → 그 메시 bbox 중심에 바로 핀 생성
3. 선택 없는 상태면 → 커서 크로스헤어 → 메시 아무 곳이나 클릭해 배치
4. 모달에서 제목/내용 입력 → `Save`
5. 이후 핀(+) 클릭 → 편집/삭제 가능

**워크플로 (Invisible note):**
1. 메시 선택
2. `+ INV NOTE` 클릭 → 모달
3. 저장 시 **메시는 숨겨지고 + 핀만 공중에 남음**. 핀 삭제 시 메시 자동 복원.

**동작 원리:**
- 핀 = `Object3D` anchor 를 target mesh 의 자식으로 부착
- 매 프레임 `anchor.getWorldPosition().project(camera)` → CSS `translate3d`
- 메시가 gizmo 로 움직이면 anchor 도 따라감 → 핀이 정확히 따라다님
- `transform` 에 CSS transition 을 주지 않아 카메라 움직임 시 lag 없음

### 7. Scan Mesh 오버레이 (CSV `mesh` 열)
CSV 의 `mesh` 컬럼에 OBJ URL 을 지정하면, 해당 장면 로드 시 **보이지 않는 매칭 메시**가 자동으로 깔림.

- 용도: Gaussian Splat 위에 **클릭 가능한 서페이스** 를 제공 → 핀 배치 정확도 up
- 구현: Three.js **layers** 시스템
  - `SCAN_LAYER = 5` 에만 올려놓음 → 카메라(default layer 0)가 안 봄 = 렌더 안 됨
  - `_selectRaycaster.layers.enable(SCAN_LAYER)` → 선택 raycaster 만 볼 수 있음
  - `userData.isScanMesh = true` 플래그 → gizmo 선택에선 필터링으로 제외, 핀 배치에선 허용
  - Collision raycaster 는 layer 0 만 → scan mesh 통과 (이동 제약 X)

---

## CSV 스키마

```csv
name,url,px,py,pz,yaw,pitch,mesh
```

| 컬럼 | 설명 |
|------|------|
| `name` | 표시 이름 (필수) |
| `url` | `.lcc` 파일 URL (필수) |
| `px`,`py`,`pz` | Spawn 위치 (선택) |
| `yaw`,`pitch` | Spawn 시점 회전, deg (선택) — YXZ Euler |
| `mesh` | 스캔 결과 OBJ URL (선택) — pin raycast 용, 렌더 안됨 |

예시:
```csv
Voidbox HQ 2,https://.../voidbox3층.lcc,-5.54,-0.27,-8.08,-152.3,0.5,https://.../voidbox3층.obj
이정헌 집,https://.../one-room-interior.lcc,-0.02,-0.18,0.90,8.1,-9.4,
```

---

## URL 파라미터 (viewer.html)

`viewer.html?data=...&px=...&py=...&pz=...&yaw=...&pitch=...&mesh=...`

- `data`: `.lcc` 파일 URL (필수)
- `px`, `py`, `pz`: spawn 위치 (기본값 `-7.43, 0.08, -5.85`)
- `yaw`, `pitch`: spawn 회전 (deg)
- `mesh`: scan mesh OBJ URL

---

## `gs_to_rhino.py` 스크립트

3D Gaussian Splat 원본 `point_cloud.ply` (학습 결과) 를 **Rhino가 읽을 수 있는 컬러 PointCloud** 로 변환.

### 사용법

```bash
# 기본 (point_cloud.ply → point_cloud_rhino.ply)
python gs_to_rhino.py

# 또는 입출력 경로 지정
python gs_to_rhino.py input.ply output.ply
```

### 동작
1. GS PLY 의 `x/y/z/f_dc_0/f_dc_1/f_dc_2/opacity` 읽기
2. SH 0차 계수 → 선형 RGB 변환 (`0.5 + SH_C0 * f_dc`)
3. `sigmoid(opacity) > 0.1` 로 플로터 제거
4. **Viewer 와 동일한 modelMatrix 적용**: `(x, y, z) → (-x, z, y)` — Rhino 에서 봤을 때 뷰어와 같은 방향
5. 최대 800,000 포인트로 서브샘플
6. 표준 컬러 PLY (`x,y,z,red,green,blue`) 로 저장

### 요구
- `numpy` 만 (plyfile 불필요 — binary PLY 직접 파싱)

---

## 구현 노트

### 좌표계
- **LCC Splat raw**: 학습 결과 그대로. Y 가 가장 긴 축 (depth).
- **Viewer world (scene)**: `modelMatrix` 적용 후 → `world_X = -raw_X`, `world_Y = raw_Z`, `world_Z = raw_Y`.
- **메시 / 3DM / scan mesh**: `objGroup` / `scanObjGroup` 이 `modelMatrix` 를 적용 → Splat 과 같은 world 좌표.
- **LCC setClipBox**: shader가 splat raw 좌표를 쓰므로 "world 수직" 은 raw Z → 박스 `scale.z` 가 height 역할.

### 조명
```
Ambient   0.25   기본 채움 (검정 방지)
Hemi      0.55   sky(#bcd7ff) / ground(#443322) 톤 분리
Key dir   1.4    (8, 14, 6) → 주광 사선 — 음영의 핵심
Fill dir  0.35   (-6, 4, -4) 푸른 빛 채움
```
Splat 은 자체 색상이라 영향 X. 메시(OBJ/3DM) 에만 음영 들어감.

### Mesh collision
- 카메라 주위 수평 16방향 raycast (`PLAYER_RADIUS = 0.3m`)
- hit 발견 시 penetration 만큼 역방향으로 푸시
- 숨겨진 모델은 자동 스킵 (raycaster 의 `visible` 체크)
- SCAN_LAYER 는 raycaster 의 default layer 0 에 포함 안 되므로 scan mesh 는 충돌 안 됨

### Pivot 재설정 (gizmo 정렬)
```js
mesh.geometry.translate(-center.x, -center.y, -center.z);
mesh.position.add(center);  // 로컬 transform 보정
```
원본 visual 유지 + pivot 만 bbox 중심으로 이동.

---

## 알려진 한계

1. **Splat raycasting 불가** — LCC SDK 는 Splat 표면 raycast API 를 제공하지 않음. 그래서 scan mesh (보이지 않는 OBJ) 를 오버레이해서 pin 배치용으로 사용.
2. **LCC clipPlane 은 NDC 공간** — 셰이더 코드 확인 결과 `dot(ndc, clipPlane.xyz) < clipPlane.w` 기반이라 화면 공간 마스크로만 동작. 대신 `setClipBox` 로 진짜 3D 클리핑.
3. **rhino3dm CDN 의존** — 첫 3DM 드롭 시 WASM 다운로드 (~2.5MB). 오프라인 사용 필요하면 `rhino3dm.js/.wasm` 로컬에 두고 `setLibraryPath('./rhino3dm/')` 로 바꿀 것.
4. **Scan mesh 좌표 정렬** — Splat 과 매칭된 OBJ 가 같은 modelMatrix (X반전+YZ스왑) 과 정확히 일치해야 핀 위치가 정확. 스캔 파이프라인에서 맞춰 export 필요.
5. **기울기 내재** — Splat 학습 시 카메라가 수평이 아니면 raw 데이터 자체가 tilted. Rhino 에서 `_Rotate3D` 로 수동 정렬 필요.

---

## 개발 히스토리 (이 세션)

1. **OBJ 드래그앤드롭** — `OBJLoader` 로 브라우저 내에서 직접 파싱
2. **3DM 드래그앤드롭** — `Rhino3dmLoader` + CDN WASM
3. **Loaded Models 패널** — 모델별 visibility / collider 토글
4. **Transform Gizmo** — `TransformControls` 로 이동/회전/스케일, edges outline 하이라이트
5. **조명 개선** — 음영 있는 lighting setup
6. **Mesh collision** — raycast ring
7. **Pivot 재설정** — gizmo 가 mesh 중앙에 뜨도록
8. **Splat 클리핑** — `setClipBox` API 활용, 오른쪽 슬라이더 재활용
9. **Annotation 핀** — `+ NOTE` / `+ INV NOTE` 버튼, HTML 프로젝션 방식
10. **`gs_to_rhino.py`** — GS PLY → Rhino 컬러 PointCloud 변환기
11. **CSV `mesh` 열** — 보이지 않는 scan mesh 를 자동 로드, pin raycast 전용

---

## 참고

- Three.js: <https://threejs.org/>
- rhino3dm: <https://github.com/mcneel/rhino3dm>
- 3D Gaussian Splatting: <https://github.com/graphdeco-inria/gaussian-splatting>
