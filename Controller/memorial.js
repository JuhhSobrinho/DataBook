// Memorial de cálculo: leitura e comparação com os campos do certificado.
//
// Suporta os dois modelos de memorial:
//   ANTIGO — "Composite Design Assessment" (Design Lifetime:, Defect Location:, Internal Design Pressure: ... barg)
//   NOVO   — modelo ISO 24817 2026 (Repair design lifetime, Cause of defect, Maximum repair design pressure ... kPa)
//
// Ao anexar o memorial (etapa 6):
//   1. PREENCHE (os campos continuam editáveis): vida útil, garantia (corrosão interna = 1 ano, externa = 5 anos)
//      e pressão/temperatura de projeto e de operação (estas só se o campo estiver vazio ou ainda "automático");
//   2. MOSTRA embaixo de cada campo o valor do cálculo, p.ex. "cálculo: 101 kPa", com ✓ se confere e ⚠ se diverge.
// É só informação: nada bloqueia a digitação nem a geração do book.

const _n = s => parseFloat(String(s).replace(',', '.'));

// ── Leitura ────────────────────────────────────────────────────────────────

async function extrairDadosMemorial(buffer) {
  if (!window.pdfjsLib) return null;
  const doc = await pdfjsLib.getDocument({ data: _toU8(buffer) }).promise;
  let texto = '';
  for (let i = 1; i <= Math.min(doc.numPages, 40); i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    texto += ' ' + tc.items.map(x => x.str).join(' ');
  }
  texto = texto.replace(/\s+/g, ' ').trim();
  if (texto.length < 50) return { semTexto: true };
  return interpretarMemorial(texto);
}

// Recebe o texto do memorial (já normalizado) e devolve os dados. Campos não encontrados ficam null.
//   pProjKpa / pOperKpa: pressões em kPa | tProj / tOper: °C | vida: anos | local: 'internal'|'external'
function interpretarMemorial(texto) {
  const r = { semTexto: false, modelo: null, texto, vida: null, local: null, garantia: null, pProjKpa: null, pOperKpa: null, tProj: null, tOper: null };
  const achar = (...res) => { for (const re of res) { const m = texto.match(re); if (m) return m; } return null; };
  const NUM = '(\\d+(?:[.,]\\d+)?)', NEG = '(-?\\d+(?:[.,]\\d+)?)';
  let m;

  r.modelo = /Cause\s+of\s+defect|Maximum\s+repair\s+design/i.test(texto) ? 'novo'
           : /Composite\s+Design\s+Assessment|Design\s+Lifetime/i.test(texto) ? 'antigo' : null;

  // vida útil
  if ((m = achar(new RegExp('Repair\\s+design\\s+lifetime\\s+(?:t\\s*life\\s+)?' + NUM + '\\s*years?', 'i'),
                 new RegExp('Selected\\s+lifetime\\s+' + NUM + '\\s*years?', 'i'),
                 new RegExp('Design\\s+Lifetime\\s*:\\s*' + NUM, 'i'),
                 new RegExp('Design\\s+Lifetime\\s+Considered\\s+t\\s*lifetime\\s+' + NUM, 'i')))) r.vida = String(_n(m[1]));

  // local da corrosão -> garantia
  if ((m = achar(/Cause\s+of\s+defect\s+(Internal|External)\b/i, /Defect\s+Location\s*:\s*(External|Internal)/i))) {
    r.local = m[1].toLowerCase();
    r.garantia = r.local === 'internal' ? '1' : '5';
  }

  // pressão de projeto (kPa): NOVO "... p 0.10 Nmm-2 101.0 kPa" | ANTIGO "Internal Design Pressure: P 1,0 barg"
  if ((m = texto.match(new RegExp('Maximum\\s+repair\\s+design\\s+pressure(?:\\s*\\(internal\\))?\\s+(?:p\\s+)?' + NUM + '\\s*N\\s*mm\\s*-?\\s*2?\\s*(?:' + NUM + '\\s*kPa)?', 'i')))) {
    r.pProjKpa = m[2] ? _n(m[2]) : _n(m[1]) * 1000;
  } else if ((m = achar(new RegExp('Internal\\s+Design\\s+Pressure\\s*:\\s*P\\s+' + NUM + '\\s*barg', 'i'),
                        new RegExp('Design\\s+Pressure\\s*\\(Internal\\)\\s*:\\s*' + NUM, 'i'),
                        new RegExp('(?<!Minimum\\s)(?<!External\\s)(?<!Internal\\s)\\bDesign\\s+Pressure\\s*:\\s*' + NUM, 'i')))) {
    r.pProjKpa = _n(m[1]) * 100;
  }

  // pressão de operação (kPa): NOVO "System internal operating pressure p op 0.10 Nmm-2" | ANTIGO "Operating Pressure: 1,0"
  if ((m = texto.match(new RegExp('System\\s+internal\\s+operating\\s+pressure\\s+(?:p\\s*op\\s+)?' + NUM + '\\s*N\\s*mm', 'i')))) {
    r.pOperKpa = _n(m[1]) * 1000;
  } else if ((m = texto.match(new RegExp('(?<!Minimum\\s)(?<!Maximum\\s)\\bOperating\\s+Pressure\\s*:\\s*' + NUM, 'i')))) {
    r.pOperKpa = _n(m[1]) * 100;
  }

  // temperatura de projeto (°C)
  if ((m = achar(new RegExp('Maximum\\s+repair\\s+design\\s+temperature\\s+(?:T\\s+)?' + NEG + '\\s*°?\\s*C', 'i'),
                 new RegExp('Maximum\\s+design\\s+temperature\\s+(?:T\\s+)?' + NEG + '\\s*°?\\s*C', 'i'),
                 new RegExp('(?<!Minimum\\s)Design\\s+Temperature\\s*:\\s*(?:T\\s*d\\s+)?' + NEG, 'i')))) r.tProj = _n(m[1]);

  // temperatura de operação (°C) — só no modelo NOVO tem rótulo inequívoco
  if ((m = texto.match(new RegExp('System\\s+operating\\s+temperature\\s+(?:T\\s*op\\s+)?' + NEG + '\\s*°?\\s*C', 'i')))) r.tOper = _n(m[1]);

  return r;
}

// ── Comparação ─────────────────────────────────────────────────────────────

const _fmtNum = n => { const v = Math.round(n * 10) / 10; return String(v).replace('.', ','); };

// Pressão digitada -> candidatos em kPa. Sem unidade é ambíguo (kPa ou bar): devolve os dois.
function _pressaoDigitadaKpa(txt) {
  const m = String(txt || '').trim().toLowerCase().match(/^(\d+(?:[.,]\d+)?)\s*([a-z/²0-9.]*)/);
  if (!m) return null;
  const n = _n(m[1]), u = m[2].replace(/[.\s]/g, '');
  const f = { '': null, kpa: 1, mpa: 1000, bar: 100, barg: 100, bara: 100, 'n/mm2': 1000, 'n/mm²': 1000, nmm2: 1000, 'kgf/cm2': 98.0665, 'kgf/cm²': 98.0665, psi: 6.89476 }[u];
  if (u === '') return [n, n * 100];
  return f ? [n * f] : null;
}

// Campos do certificado que são lidos/comparados com o memorial
const MEM_CAMPOS = [
  { id: 'cgPProj',    tipo: 'pressao', get: d => d.pProjKpa, nome: 'pressão de projeto' },
  { id: 'cgPOper',    tipo: 'pressao', get: d => d.pOperKpa, nome: 'pressão de operação' },
  { id: 'cgTProj',    tipo: 'temp',    get: d => d.tProj,    nome: 'temperatura de projeto' },
  { id: 'cgTOper',    tipo: 'temp',    get: d => d.tOper,    nome: 'temperatura de operação' },
  { id: 'cgVida',     tipo: 'anos',    get: d => d.vida,     nome: 'vida útil' },
  { id: 'cgGarantia', tipo: 'anos',    get: d => d.garantia, nome: 'garantia' },
  { id: 'cgTag',      tipo: 'tag',     nome: 'TAG' },
  { id: 'cgSerial',   tipo: 'lot',     nome: 'Lot No.' },
];

const _normTexto = s => String(s || '').toUpperCase().replace(/[″”“’'`´]/g, '"').replace(/\s+/g, '');

// valor do cálculo no formato em que vai para o campo do certificado
function _valorParaCampo(c, d) {
  const v = c.get && c.get(d);
  if (v == null) return null;
  return c.tipo === 'pressao' ? _fmtNum(v) + ' KPA' : c.tipo === 'temp' ? _fmtNum(v) : String(v);
}

function _preencherCampo(id, valor) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = valor;
  el.classList.add('campo-sincronizado'); // borda verde = preenchido automaticamente; some quando o usuário edita
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function _hintDoCampo(id) {
  const el = document.getElementById(id);
  const campo = el && el.closest('.field');
  if (!campo) return null;
  let h = campo.querySelector('.calc-hint');
  if (!h) { h = document.createElement('small'); h.className = 'calc-hint'; campo.appendChild(h); }
  return h;
}

// "101 kPa", "70 °C", "20 anos", "1 ano (corrosão interna)" — para a nota embaixo dos campos
function _valorLegivel(c, d) {
  const v = c.get(d);
  if (c.tipo === 'pressao') return _fmtNum(v) + ' kPa';
  if (c.tipo === 'temp') return _fmtNum(v) + ' °C';
  return anosTxt(v) + (c.id === 'cgGarantia' ? ' (corrosão ' + (d.local === 'internal' ? 'interna' : 'externa') + ')' : '');
}

// Reescreve o texto de comparação embaixo de cada campo, de acordo com o memorial atual e o que está digitado
function atualizarComparacaoMemorial() {
  const d = STATE.memorial;
  for (const c of MEM_CAMPOS) {
    const h = _hintDoCampo(c.id);
    if (!h) continue;
    const el = document.getElementById(c.id);
    const digitado = (el.value || '').trim();
    h.className = 'calc-hint';
    h.textContent = '';
    if (!d || d.semTexto) { h.style.display = 'none'; continue; }
    h.style.display = 'block';

    let texto = '', status = null, usar = null;
    if (c.tipo === 'tag' || c.tipo === 'lot') {
      if (!digitado) { h.style.display = 'none'; continue; }
      const alvo = c.tipo === 'tag' ? _normTexto(digitado) : digitado.replace(/\s+/g, '');
      const achou = _normTexto(d.texto).includes(alvo);
      status = achou ? 'ok' : 'diverge';
      texto = achou ? (c.nome + ' confere com o memorial') : (c.nome + ' não aparece no memorial');
    } else {
      const v = c.get(d);
      if (v == null) { h.classList.add('neutro'); h.textContent = 'cálculo: não encontrado no memorial'; continue; }
      if (c.tipo === 'pressao') {
        texto = 'cálculo: ' + _fmtNum(v) + ' kPa (' + String(Math.round(v) / 100).replace('.', ',') + ' bar)';
        const cand = _pressaoDigitadaKpa(digitado);
        if (cand) status = cand.some(k => Math.abs(k - v) <= Math.max(2, v * 0.05)) ? 'ok' : 'diverge';
      } else if (c.tipo === 'temp') {
        texto = 'cálculo: ' + _fmtNum(v) + ' °C';
        const t = parseFloat(digitado.replace(',', '.'));
        if (!isNaN(t)) status = Math.abs(t - v) <= 0.5 ? 'ok' : 'diverge';
      } else { // anos
        texto = 'cálculo: ' + anosTxt(v) + (c.id === 'cgGarantia' ? ' (corrosão ' + (d.local === 'internal' ? 'interna' : 'externa') + ')' : ' (Design Lifetime)');
        const t = parseFloat(digitado.replace(',', '.'));
        if (!isNaN(t)) status = Math.abs(t - _n(v)) < 0.001 ? 'ok' : 'diverge';
      }
      if (status !== 'ok') usar = _valorParaCampo(c, d);
    }
    h.classList.add(status || 'neutro');
    h.appendChild(document.createTextNode((status === 'ok' ? '✓ ' : status === 'diverge' ? '⚠ ' : '') + texto + (status === 'diverge' && c.tipo !== 'tag' && c.tipo !== 'lot' ? ' — diferente do campo' : '')));
    if (usar) {
      const a = document.createElement('a');
      a.href = '#'; a.className = 'calc-usar'; a.textContent = 'usar';
      a.onclick = e => { e.preventDefault(); _preencherCampo(c.id, usar); };
      h.append(' · ', a);
    }
  }
}

// ── Fluxo: anexar o memorial ───────────────────────────────────────────────

// fonte: File ou ArrayBuffer. preencher=false: só lê e compara (usado ao restaurar rascunho)
async function lerMemorialParaCertificado(fonte, { preencher = true } = {}) {
  const nota = document.getElementById('memorialNota');
  const mostrar = (txt, erro) => { if (!nota) return; nota.textContent = txt; nota.style.display = txt ? 'block' : 'none'; nota.style.color = erro ? '#d32f2f' : ''; };
  try {
    const d = await extrairDadosMemorial(fonte instanceof ArrayBuffer ? fonte : await fonte.arrayBuffer());
    if (!d) return;
    STATE.memorial = d;
    if (d.semTexto) {
      mostrar('Memorial sem texto legível (imagem): preencha os dados do certificado manualmente.', true);
      atualizarComparacaoMemorial();
      return;
    }
    const lidos = [], faltou = [];
    for (const c of MEM_CAMPOS) {
      if (c.tipo === 'tag' || c.tipo === 'lot') continue;
      const valor = _valorParaCampo(c, d);
      if (valor == null) { faltou.push(c.nome); continue; }
      lidos.push(c.nome + ' ' + _valorLegivel(c, d));
      if (!preencher) continue;
      const el = document.getElementById(c.id);
      const sempre = c.tipo === 'anos'; // vida útil e garantia vêm com valor padrão: o memorial prevalece ao anexar
      if (sempre || !el.value.trim() || el.classList.contains('campo-sincronizado')) _preencherCampo(c.id, valor);
    }
    if (!lidos.length) mostrar('Não encontrei os dados do cálculo no memorial (modelo não reconhecido): preencha manualmente.', true);
    else mostrar((preencher ? 'Lido do memorial' : 'Memorial') + (d.modelo ? ' (modelo ' + d.modelo + ')' : '') + ': ' + lidos.join(' · ') + '. Os campos continuam editáveis; embaixo de cada um aparece o valor do cálculo.'
      + (faltou.length ? ' Não encontrei: ' + faltou.join(', ') + '.' : ''));
    atualizarComparacaoMemorial();
  } catch (e) {
    console.warn('lerMemorialParaCertificado:', e);
    mostrar('Não consegui ler o memorial: preencha os dados do certificado manualmente.', true);
  }
}

// Ao restaurar rascunho: o memorial vem junto nos uploads; só refaz a comparação (não mexe nos campos)
function reanalisarMemorial() {
  if (STATE.uploads.mem) lerMemorialParaCertificado(STATE.uploads.mem, { preencher: false });
}

// ── Ligações ───────────────────────────────────────────────────────────────
(function () {
  const memFile = document.getElementById('memFile');
  if (memFile) memFile.addEventListener('change', () => { const f = memFile.files[0]; if (f) lerMemorialParaCertificado(f); });
  // recompara enquanto o usuário edita os campos (TAG do certificado é espelhada da contracapa: espera a sincronização)
  const atualizar = () => setTimeout(atualizarComparacaoMemorial, 0);
  [...MEM_CAMPOS.map(c => c.id), 'tagEquip'].forEach(id => {
    const el = document.getElementById(id);
    if (el) ['input', 'change'].forEach(ev => el.addEventListener(ev, atualizar));
  });
})();
