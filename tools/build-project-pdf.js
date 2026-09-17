#!/usr/bin/env node
/**
 * Сборка PROJECT.pdf из PROJECT.md (описание проекта для отправки заказчику).
 *
 * Как работает:
 *   1) читает PROJECT.md и конвертирует Markdown → HTML встроенным конвертером
 *      (без внешних зависимостей: заголовки, таблицы, код-блоки, списки, цитаты, ссылки);
 *   2) печатает HTML в PDF через headless Google Chrome / Chromium.
 *
 * Запуск:  npm run docs:pdf
 * Требуется: установленный Chrome/Chromium (или переменная CHROME_PATH).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'PROJECT.md');
const OUT = path.join(ROOT, 'PROJECT.pdf');
const HTML_PATH = path.join(os.tmpdir(), 'qazconhub-project.html');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium'
].filter(Boolean);

function findChrome() {
  for (const p of CHROME_CANDIDATES) {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch { /* пробуем следующий */ }
  }
  return null;
}

function esc(s) {
  return s.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
}

// Инлайн-разметка: `код`, **жирный**, *курсив*, [текст](ссылка), автолинки.
// Код и ссылки сначала заменяются плейсхолдерами, иначе `**\`код\`**` не собирается
// в жирный текст, а HTML-экранирование ломает атрибуты ссылок.
const PH_CODE = '\u0000C';
const PH_LINK = '\u0000L';
const PH_END = '\u0000';

function inline(text) {
  const codes = [];
  const links = [];
  let s = String(text);

  s = s.replace(/`([^`]+)`/g, (m, code) => {
    codes.push(code);
    return `${PH_CODE}${codes.length - 1}${PH_END}`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, href) => {
    links.push([label, href]);
    return `${PH_LINK}${links.length - 1}${PH_END}`;
  });

  s = esc(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1">$1</a>');
  s = s.replace(/\[ \]/g, '☐').replace(/\[x\]/gi, '☑');

  // Код восстанавливаем первым: тогда внутри текста ссылки не остаётся чужих
  // плейсхолдеров и рекурсивный вызов для подписи ссылки безопасен.
  s = s.replace(new RegExp(`${PH_CODE}(\\d+)${PH_END}`, 'g'), (m, i) => `<code>${esc(codes[Number(i)] || '')}</code>`);
  s = s.replace(new RegExp(`${PH_LINK}(\\d+)${PH_END}`, 'g'), (m, i) => {
    const [label, href] = links[Number(i)] || ['', ''];
    return `<a href="${esc(href)}">${inline(label)}</a>`;
  });
  return s;
}

function mdToHtml(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let inCode = false;
  let codeLang = '';
  let codeBuf = [];
  let listType = null;
  let para = [];
  let tableRows = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(' '))}</p>`);
      para = [];
    }
  };
  const closeList = () => {
    if (listType) {
      out.push(listType === 'ul' ? '</ul>' : '</ol>');
      listType = null;
    }
  };
  const flushTable = () => {
    if (!tableRows.length) return;
    const cells = (row) => row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
    const head = cells(tableRows[0]);
    const body = tableRows.slice(1).filter((r) => !/^[\s|:-]+$/.test(r));
    out.push('<table>');
    out.push(`<thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead>`);
    if (body.length) {
      out.push('<tbody>');
      for (const r of body) out.push(`<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`);
      out.push('</tbody>');
    }
    out.push('</table>');
    tableRows = [];
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');

    const fence = line.match(/^```(\w*)/);
    if (fence) {
      if (inCode) {
        out.push(`<pre><code>${esc(codeBuf.join('\n'))}</code></pre>`);
        codeBuf = [];
        inCode = false;
        codeLang = '';
      } else {
        flushPara(); closeList(); flushTable();
        inCode = true;
        codeLang = fence[1] || '';
      }
      continue;
    }
    if (inCode) { codeBuf.push(raw); continue; }

    if (/^\s*\|/.test(line)) { flushPara(); closeList(); tableRows.push(line); continue; }
    flushTable();

    if (!line.trim()) { flushPara(); closeList(); continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara(); closeList();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { flushPara(); closeList(); out.push('<hr>'); continue; }

    const q = line.match(/^>\s?(.*)$/);
    if (q) { flushPara(); closeList(); out.push(`<blockquote>${inline(q[1])}</blockquote>`); continue; }

    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ul) {
      flushPara();
      if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
      out.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ol) {
      flushPara();
      if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
      out.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }

    closeList();
    para.push(line.trim());
  }

  if (inCode && codeBuf.length) out.push(`<pre><code>${esc(codeBuf.join('\n'))}</code></pre>`);
  flushPara();
  closeList();
  flushTable();
  return out.join('\n');
}

const CSS = `
  @page { size: A4; margin: 15mm 13mm 16mm; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.55 -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
         color: #16202b; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1 { font-size: 21pt; margin: 0 0 14px; color: #0f2a45; }
  h2 { font-size: 15pt; margin: 22px 0 10px; padding-bottom: 5px; border-bottom: 2px solid #d7e3ef; color: #0f2a45; page-break-after: avoid; }
  h3 { font-size: 12.5pt; margin: 16px 0 7px; color: #16324f; page-break-after: avoid; }
  h4 { font-size: 11pt; margin: 13px 0 6px; color: #1d3f5e; page-break-after: avoid; }
  p { margin: 0 0 9px; }
  a { color: #0b62c4; text-decoration: none; }
  ul, ol { margin: 0 0 10px; padding-left: 20px; }
  li { margin: 3px 0; }
  hr { border: 0; border-top: 1px solid #dde5ee; margin: 18px 0; }
  blockquote { margin: 10px 0; padding: 6px 12px; border-left: 3px solid #9fc0e0; background: #f5f9fd; color: #33475c; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 9pt;
         background: #f1f4f8; padding: 1px 3px; border-radius: 3px; }
  pre { background: #f6f8fa; border: 1px solid #e3e9f0; border-radius: 6px; padding: 9px 11px;
        margin: 8px 0 12px; page-break-inside: avoid; }
  pre code { background: none; padding: 0; font-size: 8.6pt; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; font-size: 9pt; }
  th, td { border: 1px solid #d3dce6; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #eef3f9; font-weight: 600; color: #143450; }
  tr { page-break-inside: avoid; }
`;

function buildHtml(bodyHtml, title) {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`❌ Не найден ${SRC}`);
    process.exit(1);
  }
  const md = fs.readFileSync(SRC, 'utf8');
  const title = (md.match(/^#\s+(.*)$/m) || [, 'QazconHub — описание проекта'])[1];
  const html = buildHtml(mdToHtml(md), title);
  fs.writeFileSync(HTML_PATH, html, 'utf8');
  console.log(`📄 HTML собран: ${HTML_PATH}`);

  const chrome = findChrome();
  if (!chrome) {
    console.error('❌ Не найден Chrome/Chromium. Укажите путь: CHROME_PATH=/path/to/chrome npm run docs:pdf');
    console.error(`   HTML готов, можно распечатать вручную: ${HTML_PATH}`);
    process.exit(2);
  }

  execFileSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-pdf-header-footer',
    '--virtual-time-budget=4000',
    `--print-to-pdf=${OUT}`,
    `file://${HTML_PATH}`
  ], { stdio: 'pipe' });

  const size = fs.statSync(OUT).size;
  console.log(`✅ PDF обновлён: PROJECT.pdf (${(size / 1024).toFixed(0)} КБ) из PROJECT.md`);
}

main();
