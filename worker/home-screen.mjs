// Pure decisions for the on-demand draft opener: which CapCut windows are what, and where the
// exact draft card is on an OCR'd home screen. Nothing here touches the desktop.
export const HOME_CLASS_PREFIX = 'HomePageX';

// `role` is the QML page type seen through UI Automation (HomePageX_QMLTYPE_190 for home);
// `class` is the generic Win32 Qt class and cannot tell pages apart.
const page = w => w.role || '';
export function classifyWindows(windows) {
  const visible = (windows || []).filter(w => w && w.width > 100 && w.height > 100);
  const home = visible.filter(w => page(w).startsWith(HOME_CLASS_PREFIX) && w.title === 'CapCut');
  const editors = visible.filter(w => !page(w).startsWith(HOME_CLASS_PREFIX) && w.width >= 800 && w.height >= 500);
  const others = visible.filter(w => !home.includes(w) && !editors.includes(w));
  return {home: home[0] || null, homeCount: home.length, editor: editors[0] || null, editorCount: editors.length, others};
}

// The home screen is idle when exactly one CapCut window exists, it is the home page, and no
// project is open (no .locked markers). Anything else defers the operation.
export function homeReady({windows, lockedProjects, idleMs, minimumIdleMs = 3000}) {
  const view = classifyWindows(windows);
  if (!view.home) return {ok: false, reason: 'CapCut home window is not visible.'};
  if (view.homeCount !== 1 || view.editor || view.others.length) return {ok: false, reason: 'Another CapCut window or dialog is open; leaving it alone.'};
  if (view.home.minimized) return {ok: false, reason: 'CapCut home window is minimized.'};
  if (lockedProjects !== 0) return {ok: false, reason: 'A project is open in the editor.'};
  if (Number.isFinite(idleMs) && idleMs < minimumIdleMs) return {ok: false, reason: 'The user is actively using the desktop.'};
  return {ok: true, home: view.home};
}

const fold = text => (text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Locate the exact card by the eight-character job suffix that every batch project name carries.
// The suffix is unique per job, survives OCR better than punctuation, and distinguishes versions.
// Observed layout (CapCut 9.6 home, 2026-10-22): a square cover about ten text heights tall sits
// directly above the name line, so four text heights above the name lands in its lower middle.
export function findDraftCard(lines, {projectName, jobId}, {coverLinesAbove = 4} = {}) {
  const suffix = jobId.slice(0, 8).toLowerCase();
  const expected = fold(projectName);
  const matches = (lines || []).filter(line => {
    const text = fold(line.text);
    return text.includes(suffix) || (expected.length > 12 && text.includes(expected));
  });
  if (!matches.length) return {found: false, reason: `No card text contains "${suffix}"; the name may be truncated or off screen.`};
  if (matches.length > 1) return {found: false, reason: `Ambiguous: ${matches.length} lines contain "${suffix}".`};
  const line = matches[0];
  if (!(line.h > 6 && line.w > 20)) return {found: false, reason: 'Matched text has an implausible size.'};
  // The cover image sits above the name; aim a few text heights above the name's center line.
  const x = Math.round(line.x + line.w / 2);
  const y = Math.round(line.y - coverLinesAbove * line.h);
  if (y < 0) return {found: false, reason: 'Card cover would be above the window.'};
  return {found: true, line: {text: line.text, x: line.x, y: line.y, w: line.w, h: line.h}, target: {x, y}};
}

// Translate an image point into a screen point for the captured window.
export function toScreen(window, point) {
  return {x: window.left + point.x, y: window.top + point.y};
}
