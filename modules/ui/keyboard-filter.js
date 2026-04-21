// modules/ui/keyboard-filter.js
// -----------------------------------------------------------------------------
// INPUT / TEXTAREA / contenteditable 에 포커스가 있는 동안의 키 이벤트가
// window 레벨 리스너 (예: FirstPersonControls 의 W/A/S/D/R/F/Digit1~5)
// 까지 bubble 되지 않도록 document.body 에서 stopPropagation().
//
// 의존성 없음. 어떤 viewer 조합에서도 한 번 호출해두면 안전.
// -----------------------------------------------------------------------------

/**
 * @param {object} [opts]
 * @param {string[]} [opts.allowKeys=['Escape']]  이 키들은 차단하지 않음 (모달 닫기 등)
 * @returns {() => void}  installer 호출 시 반환되는 uninstall 함수
 */
export function installKeyboardFilter(opts = {}) {
    const allow = opts.allowKeys ?? ['Escape'];
    const handler = (e) => {
        const t = e.target;
        if (!t) return;
        const tag = t.tagName;
        const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable;
        if (!isEditable) return;
        if (allow.includes(e.key)) return;
        e.stopPropagation();
    };
    document.body.addEventListener('keydown', handler);
    document.body.addEventListener('keyup', handler);
    return () => {
        document.body.removeEventListener('keydown', handler);
        document.body.removeEventListener('keyup', handler);
    };
}
