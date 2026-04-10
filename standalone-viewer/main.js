const MOBILE_BREAKPOINT = 800;

const viewerFrame = document.getElementById('viewerFrame');
const viewerIframe = document.getElementById('viewerIframe');
const loadingOverlay = document.getElementById('loadingOverlay');
const activationOverlay = document.getElementById('activationOverlay');
const viewerActions = document.getElementById('viewerActions');
const exitButton = document.getElementById('exitButton');
const resetButton = document.getElementById('resetButton');
const collisionButton = document.getElementById('collisionButton');
const mobileGuide = document.getElementById('mobileGuide');
const desktopGuide = document.getElementById('desktopGuide');

const state = {
  ready: false,
  interactive: false,
  collisionEnabled: true,
};

const params = new URLSearchParams(window.location.search);
const viewerPath = params.get('viewer') ?? './viewer/index.html';
const contentPath = params.get('content') ?? './test.sog';
const collisionPath = params.get('collision');

const iframeUrl = new URL(viewerPath, window.location.href);
iframeUrl.searchParams.set('content', new URL(contentPath, window.location.href).href);

if (collisionPath) {
  iframeUrl.searchParams.set('collision', new URL(collisionPath, window.location.href).href);
}

iframeUrl.searchParams.set('noui', '');

const getViewerWindow = () => viewerIframe.contentWindow;

const blurActiveElement = () => {
  const active = document.activeElement;
  active?.blur?.();
};

const setInteractive = (interactive) => {
  state.interactive = interactive;
  activationOverlay.classList.toggle('hidden', interactive || !state.ready);
  viewerActions.classList.toggle('hidden', !interactive || !state.ready);
};

const updateGuideLayout = () => {
  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
  mobileGuide.classList.toggle('hidden', !isMobile);
  desktopGuide.classList.toggle('hidden', isMobile);
};

const activateViewer = () => {
  if (!state.ready) return;

  setInteractive(true);
  blurActiveElement();

  const viewerWindow = getViewerWindow();
  viewerWindow?.stopViewerAttractMode?.();

  if (window.innerWidth <= MOBILE_BREAKPOINT) {
    viewerWindow?.startViewerMobileControls?.();
  }

  viewerIframe.focus();
  viewerWindow?.focus?.();
};

const deactivateViewer = () => {
  setInteractive(false);
  blurActiveElement();

  const viewerWindow = getViewerWindow();
  viewerWindow?.stopViewerMobileControls?.();
  viewerWindow?.startViewerAttractMode?.();

  viewerIframe.blur();
  window.focus();
};

const resetViewerCamera = () => {
  blurActiveElement();
  const viewerWindow = getViewerWindow();
  viewerWindow?.resetViewerCamera?.();
  viewerIframe.focus();
  viewerWindow?.focus?.();
};

const toggleCollision = () => {
  state.collisionEnabled = !state.collisionEnabled;

  const viewerWindow = getViewerWindow();
  viewerWindow?.setViewerCollisionEnabled?.(state.collisionEnabled);

  collisionButton.textContent = state.collisionEnabled ? 'Collision On' : 'Collision Off';
  collisionButton.setAttribute('aria-pressed', String(state.collisionEnabled));

  if (!state.collisionEnabled) {
    deactivateViewer();
  }
};

const handleKeyDown = (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    deactivateViewer();
    return;
  }

  if (event.code === 'Space' && state.interactive) {
    event.preventDefault();
    event.stopPropagation();
    blurActiveElement();
    const viewerWindow = getViewerWindow();
    viewerWindow?.viewerJump?.();
    viewerIframe.focus();
    viewerWindow?.focus?.();
  }
};

const handleViewerReady = () => {
  state.ready = true;
  loadingOverlay.classList.add('hidden');
  activationOverlay.classList.remove('hidden');

  const viewerWindow = getViewerWindow();
  viewerWindow?.setViewerCollisionEnabled?.(state.collisionEnabled);
  viewerWindow?.startViewerAttractMode?.();
};

const attachViewerHooks = () => {
  const viewerWindow = getViewerWindow();

  if (!viewerWindow) return;

  viewerWindow.firstFrame = handleViewerReady;

  try {
    viewerWindow.addEventListener('keydown', handleKeyDown);
    viewerWindow.document?.addEventListener?.('keydown', handleKeyDown);
  } catch {
    // Same-origin is expected here; ignore if the document is not ready yet.
  }
};

viewerIframe.addEventListener('load', attachViewerHooks);

window.addEventListener('keydown', handleKeyDown, true);
window.addEventListener('resize', updateGuideLayout);

document.addEventListener(
  'pointerdown',
  (event) => {
    if (!state.interactive) return;
    const target = event.target;
    if (target instanceof Node && !viewerFrame.contains(target)) {
      deactivateViewer();
    }
  },
  true
);

activationOverlay.addEventListener('click', activateViewer);
exitButton.addEventListener('click', () => {
  blurActiveElement();
  deactivateViewer();
});
resetButton.addEventListener('click', () => {
  blurActiveElement();
  resetViewerCamera();
});
collisionButton.addEventListener('click', () => {
  blurActiveElement();
  toggleCollision();
});

updateGuideLayout();
viewerIframe.src = iframeUrl.toString();
