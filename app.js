// Renders Shivam_Kumar_Resume.pdf on the page. To update the site, just replace
// that PDF (same filename) and push. Nothing in this file needs editing.
import * as pdfjsLib from './vendor/pdf.min.js';

const PDF_URL = './assets/Shivam_Kumar_Resume.pdf';
const INTRODUCTION_URL = './assets/introduction.txt';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.js', import.meta.url).href;

const sheetsEl = document.getElementById('sheets');
const statusEl = document.getElementById('status');

let pdf = null;
let renderToken = 0;
let lastWidth = 0;

async function loadIntroduction() {
  const summaryEl = document.getElementById('profile-summary');
  try {
    const response = await fetch(INTRODUCTION_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error('Introduction file could not be loaded');
    const introduction = (await response.text()).trim();
    if (!introduction) throw new Error('Introduction file is empty');

    const parts = introduction.split(/(\*\*[^*]+\*\*)/g);
    const fragment = document.createDocumentFragment();
    parts.forEach((part) => {
      if (!part) return;
      if (part.startsWith('**') && part.endsWith('**')) {
        const strong = document.createElement('strong');
        strong.textContent = part.slice(2, -2);
        fragment.append(strong);
      } else {
        fragment.append(document.createTextNode(part));
      }
    });
    summaryEl.replaceChildren(fragment);
  } catch (error) {
    summaryEl.textContent = '';
    console.error(error);
  }
}

function showError() {
  sheetsEl.replaceChildren();
  statusEl.hidden = false;
  statusEl.innerHTML = 'Could not load the preview. <a href="' + PDF_URL + '">Open the PDF directly</a>.';
}

async function renderPage(page, sheet, token) {
  const cssWidth = sheet.clientWidth;
  const base = page.getViewport({ scale: 1 });
  const cssScale = cssWidth / base.width;
  const outScale = Math.min(window.devicePixelRatio || 1, 2);

  const canvas = document.createElement('canvas');
  const viewport = page.getViewport({ scale: cssScale * outScale });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Resume page ' + page.pageNumber);

  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  if (token !== renderToken) return null;

  const textDiv = document.createElement('div');
  textDiv.className = 'textLayer';
  textDiv.style.setProperty('--scale-factor', cssScale);
  textDiv.style.setProperty('--user-unit', 1);

  const frag = document.createDocumentFragment();
  frag.append(canvas, textDiv);

  try {
    const textLayer = new pdfjsLib.TextLayer({
      textContentSource: page.streamTextContent(),
      container: textDiv,
      viewport: page.getViewport({ scale: cssScale }),
    });
    await textLayer.render();
  } catch (e) {
    // The visual page is still fine without selectable text.
  }
  return frag;
}

async function renderAll() {
  const token = ++renderToken;
  const width = sheetsEl.clientWidth;
  lastWidth = width;

  const sheets = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const sheet = document.createElement('div');
    sheet.className = 'sheet pending';
    sheets.push(sheet);
  }
  sheetsEl.replaceChildren(...sheets);

  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const sheet = sheets[n - 1];
    const content = await renderPage(page, sheet, token);
    if (token !== renderToken || !content) return;
    sheet.classList.remove('pending');
    sheet.replaceChildren(content);
  }
}

async function init() {
  // Show a placeholder sheet right away.
  const placeholder = document.createElement('div');
  placeholder.className = 'sheet pending';
  sheetsEl.append(placeholder);

  try {
    pdf = await pdfjsLib.getDocument({ url: PDF_URL }).promise;
  } catch (e) {
    showError();
    return;
  }

  try {
    await renderAll();
  } catch (e) {
    showError();
    return;
  }

  let timer;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      // Re-render only when the width changed (ignores mobile address-bar jitter).
      if (Math.abs(sheetsEl.clientWidth - lastWidth) > 2) renderAll().catch(showError);
    }, 180);
  });
}

// Glass highlight that follows the cursor over the resume sheet (purely cosmetic).
let highlightFrame = 0;
let highlightEvent;
sheetsEl.addEventListener('pointermove', (e) => {
  const sheet = e.target.closest && e.target.closest('.sheet');
  if (!sheet) return;
  highlightEvent = { sheet, x: e.clientX, y: e.clientY };
  if (highlightFrame) return;
  highlightFrame = requestAnimationFrame(() => {
    highlightFrame = 0;
    const { sheet: target, x, y } = highlightEvent;
    if (!target.isConnected) return;
    const r = target.getBoundingClientRect();
    target.style.setProperty('--mx', ((x - r.left) / r.width * 100).toFixed(1) + '%');
    target.style.setProperty('--my', ((y - r.top) / r.height * 100).toFixed(1) + '%');
  });
});

// Typewriter for the profile summary and the footer quote.
// Each one types once, when it first scrolls into view. Inline markup (e.g. <strong>) is kept.
// Falls back to plain static text if motion is reduced or IntersectionObserver is missing.
function setupTypewriterAnimations() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !('IntersectionObserver' in window)) return;

  function typewriter(p, opts) {
    if (!p) return;
    const wrap = p.parentElement;
    const html = p.innerHTML;

    const sr = document.createElement('span');       // real text for screen readers
    sr.className = 'sr-only';
    sr.innerHTML = html;
    const ghost = document.createElement('span');    // invisible full copy reserves the height
    ghost.className = 'tw-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.innerHTML = html;
    const typed = document.createElement('span');    // the visible, growing copy
    typed.className = 'tw-typed';
    typed.setAttribute('aria-hidden', 'true');
    typed.innerHTML = html;
    p.replaceChildren(sr, ghost, typed);

    const parts = [];
    const walker = document.createTreeWalker(typed, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) parts.push({ node: walker.currentNode, text: walker.currentNode.data });
    parts.forEach((x) => { x.node.data = ''; });
    const total = parts.reduce((s, x) => s + x.text.length, 0);
    wrap.classList.add('tw-ready');

    function run() {
      const start = performance.now();
      let lastCount = -1;
      function step(now) {
        const count = Math.min(total, Math.floor((now - start) * opts.charactersPerSecond / 1000));
        if (count !== lastCount) {
          let left = count;
          for (const x of parts) {
            const visible = Math.max(0, Math.min(left, x.text.length));
            x.node.data = x.text.slice(0, visible);
            left -= x.text.length;
          }
          lastCount = count;
        }
        if (count < total) requestAnimationFrame(step);
        else wrap.classList.add('tw-done');
      }
      requestAnimationFrame(step);
    }

    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      setTimeout(run, opts.delay);
    }, { threshold: opts.threshold });
    io.observe(wrap);
  }

  typewriter(document.querySelector('.summary p'), { charactersPerSecond: 180, delay: 200, threshold: 0.5 });
  typewriter(document.querySelector('.quote p'),   { charactersPerSecond: 180, delay: 150, threshold: 0.6 });
}

async function initPage() {
  await loadIntroduction();
  setupTypewriterAnimations();
  init();
}

initPage();