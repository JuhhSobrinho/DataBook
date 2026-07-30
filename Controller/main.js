const ASSETS_CACHE = {};
async function getAsset(cat){
  if(!ASSETS_CACHE[cat]){
    const r = await fetch('../Model/assets-'+cat+'.json');
    const d = await r.json();
    ASSETS_CACHE[cat] = d[cat];
  }
  return ASSETS_CACHE[cat];
}
const STATE = { uploads: {}, uploadNames: {}, logoCliente: null, logoClienteType: null, fotoAntes: null, fotoAntesType: null, fotoDepois: null, fotoDepoisType: null, assinatura: null, assinaturaType: null };

function b64ToBytes(b64){
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
async function fileToBuffer(file){
  return new Promise(r=>{
    const fr = new FileReader();
    fr.onload = ()=>r(fr.result);
    fr.readAsArrayBuffer(file);
  });
}
function $(id){return document.getElementById(id)}
function fmtDate(iso){
  if(!iso) return '';
  const [y,m,d]=iso.split('-');
  return d+'/'+m+'/'+y;
}
function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function cssEscape(s){return s.replace(/\\/g,'\\\\').replace(/"/g,'\\"')}
function normaliza(s){return s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim()}

function updateDocPreview(){
  $('docPreview').textContent = 'TEAM-8104-'+($('doc1').value||'XX')+'-'+($('doc2').value||'XXXX')+'-RFE-REP-'+($('doc3').value||'XXXX')+'-SS-'+($('doc4').value||'XX')+'-'+($('doc5').value||'20XX');
}
['doc1','doc2','doc3','doc4','doc5'].forEach(id => $(id).addEventListener('input', updateDocPreview));
updateDocPreview();
$('capaData').valueAsDate = new Date();

function setupUpload(inputId, zoneId, nameId, stateKey){
  const inp = $(inputId), zone = $(zoneId), nameLbl = $(nameId);
  inp.addEventListener('change', async ()=>{
    if(!inp.files[0]) return;
    const buf = await fileToBuffer(inp.files[0]);
    STATE.uploads[stateKey] = buf;
    STATE.uploadNames[stateKey] = inp.files[0].name;
    nameLbl.textContent = '[OK] ' + inp.files[0].name;
    zone.classList.add('has-file');
    updateStatus();
  });
}
setupUpload('ssFile','ssZone','ssName','ss');
setupUpload('rdoFile','rdoZone','rdoName','rdo');
setupUpload('relFile','relZone','relName','rel');
setupUpload('memFile','memZone','memName','mem');
setupUpload('arptFile','arptZone','arptName','arpt');

$('logoCliente').addEventListener('change', async ()=>{
  const f = $('logoCliente').files[0];
  if(!f) return;
  STATE.logoCliente = await fileToBuffer(f);
  STATE.logoClienteType = f.type;
  $('logoClienteName').textContent = '[OK] ' + f.name;
  $('logoClienteZone').classList.add('has-file');
  updateStatus();
});

function setupFoto(inputId, zoneId, nameId, stateKey){
  const inp = $(inputId);
  if(!inp) return;
  inp.addEventListener('change', async ()=>{
    const file = inp.files[0];
    if(!file) return;
    STATE[stateKey]        = await fileToBuffer(file);
    STATE[stateKey+'Type'] = file.type;
    $(nameId).textContent  = file.name;
    $(zoneId).classList.add('has-file');

    // Preview da imagem na zona de upload
    const previewId = inputId.replace('File', 'Preview');
    const prev = document.getElementById(previewId);
    if(prev){
      const url = URL.createObjectURL(file);
      prev.onload = () => URL.revokeObjectURL(url);
      prev.src = url;
      prev.style.display = 'block';
      $(nameId).style.display = 'none';
    }
  });
}
setupFoto('fotoAntesFile','fotoAntesZone','fotoAntesName','fotoAntes');
setupFoto('fotoDepoisFile','fotoDepoisZone','fotoDepoisName','fotoDepois');
setupFoto('assinaturaFile','assinaturaZone','assinaturaName','assinatura');

function coletarRevisoes(){
  return [...document.querySelectorAll('.revisao-row')].map(row=>({
    num:  row.querySelector('.rev-num').value.trim(),
    desc: row.querySelector('.rev-desc').value.trim(),
    data: fmtDate(row.querySelector('.rev-data').value),
  })).filter(r=>r.num||r.desc);
}
function adicionarRevisao(num, desc, data){
  const list = $('revisoesList');
  const idx  = list.querySelectorAll('.revisao-row').length;
  const row  = document.createElement('div');
  row.className = 'revisao-row';
  row.innerHTML =
    '<input type="text"  class="rev-num"  value="'+(num||'Rev'+idx)+'" placeholder="Rev0" style="width:72px">'+
    '<input type="text"  class="rev-desc" value="'+(desc||'')+'" placeholder="Descricao da revisao" style="flex:1">'+
    '<input type="date"  class="rev-data" value="'+(data||'')+'" style="width:138px">'+
    '<button type="button" class="btn-icon-remove" onclick="this.parentElement.remove()" title="Remover">✕</button>';
  list.appendChild(row);
}
function removerRevisao(btn){ btn.closest('.revisao-row').remove(); }

function updateCertifPreview(){
  const el = $('cgCertifPreview');
  if(!el) return;
  const data = ($('cgData')||{}).value||'';
  const plaqueta = (($('cgPlaqueta')||{}).value||'').trim();
  if(data && plaqueta){
    const [yy,mm,dd] = data.split('-');
    el.textContent = '# Certif: '+dd+mm+yy+'-'+plaqueta;
  } else {
    el.textContent = data ? '(informe a plaqueta)' : '';
  }
}
['cgData','cgPlaqueta'].forEach(id=>{ const el=$(id); if(el) el.addEventListener('input', updateCertifPreview); });

async function buildTecnicosList(){
  const [tecnicos, idcards] = await Promise.all([getAsset('tecnicos'), getAsset('idcards')]);
  const list = $('tecnicosList');
  list.innerHTML = '';
  const nomes = Object.keys(tecnicos).sort();
  const idkeys = Object.keys(idcards);
  const idmap = {};
  for(const n of idkeys) idmap[normaliza(n)] = n;
  for(const nome of nomes){
    const certs = tecnicos[nome];
    const certKeys = Object.keys(certs).sort();
    const idcardMatch = encontraIdcard(nome, idmap);
    const row = document.createElement('div');
    row.className = 'tecnico-row';
    if(idcardMatch) row.classList.add('has-jotun');
    row.dataset.nome = nome;
    let optsHtml = '<option value="">Selecione um certificado</option>';
    for(const c of certKeys){
      optsHtml += '<option value="'+c+'">'+c.replace('-',' Nivel ')+'</option>';
    }
    optsHtml += '<option value="__ALL__">Todos os disponiveis</option>';
    row.innerHTML =
      '<input type="checkbox" class="tec-check" data-nome="'+escapeHtml(nome)+'">'+
      '<div class="nome">'+escapeHtml(nome)+'</div>'+
      '<select class="tec-cert" data-nome="'+escapeHtml(nome)+'">'+optsHtml+'</select>'+
      (idcardMatch ? '<label class="checkbox-inline" title="ID Card Jotachar"><input type="checkbox" class="tec-jotun" data-idcard="'+escapeHtml(idcardMatch)+'"> ID Jotachar</label>' : '');
    list.appendChild(row);
    row.querySelector('.tec-check').addEventListener('change', e=>{
      row.classList.toggle('selected', e.target.checked);
      updateStatus();
    });
    row.querySelector('.tec-cert').addEventListener('change', updateStatus);
    const j = row.querySelector('.tec-jotun');
    if(j) j.addEventListener('change', updateStatus);
  }
}
function encontraIdcard(nome, idmap){
  const n = normaliza(nome);
  if(idmap[n]) return idmap[n];
  const parts = n.split(' ');
  const primeiro = parts[0], ultimo = parts[parts.length-1];
  for(const k of Object.keys(idmap)){
    if(k.includes(primeiro) && k.includes(ultimo)) return idmap[k];
    if(primeiro.length>3 && ultimo.length>3){
      const kp = k.split(' ');
      if(kp[0] === primeiro && kp[kp.length-1] === ultimo) return idmap[k];
    }
  }
  return null;
}
buildTecnicosList();

$('searchTec').addEventListener('input', e=>{
  const q = normaliza(e.target.value);
  document.querySelectorAll('.tecnico-row').forEach(row=>{
    const n = normaliza(row.dataset.nome);
    row.style.display = n.includes(q) ? '' : 'none';
  });
});

function updateStatus(){
  let count = 0;
  if($('capaElab').value.trim()) count++;
  document.querySelector('aside li:nth-child(1) a').classList.toggle('done', !!$('capaElab').value.trim());
  const tag2 = !!$('tagEquip').value.trim();
  if(tag2) count++;
  document.querySelector('aside li:nth-child(2) a').classList.toggle('done', tag2);
  const ups = [['ss',3],['rdo',4],['rel',5],['mem',6],['arpt',10]];
  for(const [k,n] of ups){
    const ok = !!STATE.uploads[k];
    if(ok) count++;
    document.querySelector('aside li:nth-child('+n+') a').classList.toggle('done', ok);
  }
  const proc = document.querySelector('input[name=proc]:checked');
  if(proc) count++;
  document.querySelector('aside li:nth-child(7) a').classList.toggle('done', !!proc);
  const fichas = document.querySelectorAll('input[name=ficha]:checked');
  if(fichas.length) count++;
  document.querySelector('aside li:nth-child(8) a').classList.toggle('done', fichas.length>0);
  const pdas = document.querySelectorAll('input[name=pda]:checked');
  if(pdas.length) count++;
  document.querySelector('aside li:nth-child(9) a').classList.toggle('done', pdas.length>0);
  const cgOk = $('cgCliente').value.trim() && $('cgTag').value.trim();
  if(cgOk) count++;
  document.querySelector('aside li:nth-child(11) a').classList.toggle('done', cgOk);
  const tec = document.querySelectorAll('.tec-check:checked');
  if(tec.length) count++;
  document.querySelector('aside li:nth-child(12) a').classList.toggle('done', tec.length>0);
  $('statusCount').textContent = count;
  let pages = 3;
  for(let i=1;i<=10;i++) pages += 1;
  for(const k of ['ss','rdo','rel','mem','arpt']) if(STATE.uploads[k]) pages += 2;
  if(proc) pages += 21;
  pages += fichas.length * 4;
  pages += pdas.length * 3;
  if(cgOk) pages += 2;
  pages += tec.length * 1.5;
  $('totalPages').innerHTML = '- estimativa: <strong>' + Math.round(pages) + '</strong> paginas';
}
['capaElab','tagEquip','cgCliente','cgTag'].forEach(id=>$(id).addEventListener('input', updateStatus));
document.querySelectorAll('input[name=proc],input[name=ficha],input[name=pda]').forEach(el=>el.addEventListener('change', updateStatus));
document.querySelectorAll('.nav-link').forEach(a=>{
  a.addEventListener('click', e=>{
    document.querySelectorAll('.nav-link').forEach(l=>l.classList.remove('active'));
    a.classList.add('active');
  });
});
updateStatus();

const { PDFDocument, StandardFonts, rgb } = PDFLib;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;
const TEAM_BLUE = rgb(0/255, 94/255, 184/255);
const TEAM_GRAY = rgb(0.23, 0.27, 0.32);
const BLACK = rgb(0,0,0);

async function gerarPDF(){
  const btn = $('btnGerar2');
  btn.disabled = true;
  const orig = btn.innerHTML;
  btn.innerHTML = '<span class="spinner"></span> Gerando...';
  try{
    let bytes;
    if (_correctedBytes) {
      // Usa bytes com correções de sobreposição já aplicadas (editadas no modo edição)
      bytes = _correctedBytes;
    } else {
      const blob = await montarDatabook();
      bytes = await blob.arrayBuffer();

      // Passo 1: aplica seleção do drawer (páginas desmarcadas são removidas)
      bytes = await _aplicarDrawerMask(bytes);

      // Passo 2: aplica remoções feitas dentro do preview (sobre o resultado do passo 1)
      if (_keptPageIndices !== null) {
        const src = await PDFDocument.load(bytes, {ignoreEncryption: true});
        const dst = await PDFDocument.create();
        const pages = await dst.copyPages(src, _keptPageIndices);
        pages.forEach(p => dst.addPage(p));
        bytes = await dst.save();
      }
    }

    const url = URL.createObjectURL(new Blob([bytes], {type:'application/pdf'}));
    const a = document.createElement('a');
    a.href = url;
    a.download = getDocNumero() + '.pdf';
    a.click();
    URL.revokeObjectURL(url);
    btn.innerHTML = 'OK - PDF gerado!';
    setTimeout(()=>{btn.innerHTML = orig; btn.disabled=false;}, 2500);
  }catch(e){
    console.error(e);
    alert('Erro ao gerar PDF: '+e.message);
    btn.innerHTML = orig;
    btn.disabled = false;
  }
}
function getDocNumero(){
  return 'TEAM-8104-'+($('doc1').value||'XX')+'-'+($('doc2').value||'XXXX')+'-RFE-REP-'+($('doc3').value||'XXXX')+'-SS-'+($('doc4').value||'XX')+'-'+($('doc5').value||'20XX');
}
// Converte qualquer fonte de bytes para Uint8Array com backing buffer próprio (sem risco de detach)
function _toU8(bytes) {
  if (bytes instanceof Uint8Array) return bytes.slice(0);
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes.slice(0));
  return new Uint8Array(bytes);
}

// Aplica a máscara do drawer ao ArrayBuffer de bytes de um PDF; retorna Uint8Array filtrado
async function _aplicarDrawerMask(bytes) {
  // Sempre retorna Uint8Array com buffer próprio
  if (!_drawerPageMask || !_drawerPageMask.some(v => !v)) return _toU8(bytes);
  const kept = _drawerPageMask.map((v, i) => v ? i : -1).filter(i => i >= 0);
  if (kept.length === 0) return _toU8(bytes);
  const src = await PDFDocument.load(bytes, {ignoreEncryption: true});
  const dst = await PDFDocument.create();
  const pages = await dst.copyPages(src, kept);
  pages.forEach(p => dst.addPage(p));
  return await dst.save();
}

let _previewBytes    = null;
let _previewUrl      = null;
let _keptPageIndices = null;  // índices das páginas mantidas após remoção DENTRO do preview
let _thumbPanelOpen  = false; // estado do painel de miniaturas
let _drawerPageMask  = null;  // null = todas as páginas; array de bool = seleção por página
let _sidebarHidden   = false; // estado da sidebar de guias
// Editor de sobreposição
let _editMode        = false;
let _editTool        = 'select'; // 'select' | 'add'
let _editPdfJsDoc    = null;
let _editCurrentPage = 1;
let _editScale       = 1.5;
let _editCorrections = [];    // [{page,x,y,w,h,text,fontSize,color}]
let _correctedBytes  = null;  // bytes com correções já aplicadas

function toggleSidebar(){
  _sidebarHidden = !_sidebarHidden;
  document.body.classList.toggle('sidebar-hidden', _sidebarHidden);
}

function toggleThumbPanel(){
  const drawer = document.getElementById('mainThumbDrawer');
  const btn    = document.getElementById('btnMiniaturas');
  _thumbPanelOpen = !_thumbPanelOpen;
  drawer.classList.toggle('open', _thumbPanelOpen);
  if (btn) btn.classList.toggle('active', _thumbPanelOpen);
  if (_thumbPanelOpen) renderizarThumbnails();
}

async function renderizarThumbnails(){
  const content = document.getElementById('mainThumbContent');
  if (!content) return;
  if (!window.pdfjsLib){ content.innerHTML = '<p class="thumb-empty">PDF.js nao carregado.</p>'; return; }

  content.innerHTML = '<p class="thumb-empty">Gerando PDF...</p>';
  try {
    const blob  = await montarDatabook();
    const bytes = await blob.arrayBuffer();
    const pdf   = await pdfjsLib.getDocument({data: new Uint8Array(bytes)}).promise;
    const total = pdf.numPages;

    // Inicializa máscara com todas as páginas marcadas
    _drawerPageMask = Array(total).fill(true);
    content.innerHTML = '';

    for (let i = 1; i <= total; i++){
      const idx      = i - 1;
      const page     = await pdf.getPage(i);
      const viewport = page.getViewport({scale: 0.31});
      const canvas   = document.createElement('canvas');
      canvas.width   = viewport.width;
      canvas.height  = viewport.height;
      await page.render({canvasContext: canvas.getContext('2d'), viewport}).promise;

      const chk      = document.createElement('input');
      chk.type       = 'checkbox';
      chk.className  = 'thumb-check';
      chk.checked    = true;

      const num      = document.createElement('span');
      num.className  = 'thumb-num';
      num.textContent = 'Pág. ' + i;

      const row      = document.createElement('div');
      row.className  = 'thumb-check-row';
      row.appendChild(chk);
      row.appendChild(num);

      const item     = document.createElement('div');
      item.className = 'thumb-item';
      item.appendChild(row);
      item.appendChild(canvas);

      chk.addEventListener('change', () => {
        _drawerPageMask[idx] = chk.checked;
        item.classList.toggle('excluded', !chk.checked);
      });

      content.appendChild(item);
    }
  } catch(e){
    content.innerHTML = '<p class="thumb-empty">Erro ao gerar miniaturas.</p>';
    console.error('Thumbnails:', e);
  }
}

async function abrirPreview(){
  _keptPageIndices = null; // nova sessão de preview — descarta estado anterior
  _correctedBytes  = null; // descarta correções de sobreposição anteriores
  _editCorrections = [];
  $('previewModal').classList.add('show');
  $('previewFrame').src = 'about:blank';
  $('pageList').innerHTML = '<p class="sidebar-info" style="padding:8px">Gerando...</p>';
  $('pageTotalInfo').textContent = '';
  $('btnRemovePages').disabled = true;
  try{
    const blob = await montarDatabook();
    const rawBytes = await blob.arrayBuffer();
    // Aplica seleção do drawer: preview mostra apenas páginas marcadas
    _previewBytes = await _aplicarDrawerMask(rawBytes);
    _atualizarFrame();
    await _atualizarListaPaginas();
  }catch(e){ alert('Erro: '+e.message); }
}

function _atualizarFrame(){
  if(_previewUrl) URL.revokeObjectURL(_previewUrl);
  _previewUrl = URL.createObjectURL(new Blob([_previewBytes], {type:'application/pdf'}));
  $('previewFrame').src = _previewUrl;
}

async function _atualizarListaPaginas(){
  const doc   = await PDFDocument.load(_toU8(_previewBytes), {ignoreEncryption: true});
  const total = doc.getPageCount();
  const list  = $('pageList');
  list.innerHTML = '';
  for(let i = 0; i < total; i++){
    const item = document.createElement('label');
    item.className = 'page-item';
    item.innerHTML = '<input type="checkbox" checked><span>Pág. '+(i+1)+'</span>';
    const chk = item.querySelector('input');
    chk.addEventListener('change', ()=>{
      item.classList.toggle('to-remove', !chk.checked);
      const anyUnchecked = !!$('pageList').querySelector('input:not(:checked)');
      $('btnRemovePages').disabled = !anyUnchecked;
    });
    list.appendChild(item);
  }
  $('pageTotalInfo').textContent = total+' página'+(total!==1?'s':'');
  $('btnRemovePages').disabled = true;
}

async function removerPaginasDesmarcadas(){
  if(!_previewBytes) return;
  const items = [...$('pageList').querySelectorAll('.page-item')];
  const keep  = items.map((el,i)=>({i, checked: el.querySelector('input').checked}))
                     .filter(x=>x.checked).map(x=>x.i);
  if(keep.length===0){ alert('Selecione ao menos uma página para manter.'); return; }

  // Mantém mapeamento para os índices do PDF original (para re-aplicar na geração final)
  if(_keptPageIndices === null){
    _keptPageIndices = keep;
  } else {
    _keptPageIndices = keep.map(i => _keptPageIndices[i]);
  }

  const src   = await PDFDocument.load(_toU8(_previewBytes), {ignoreEncryption: true});
  const dst   = await PDFDocument.create();
  const pages = await dst.copyPages(src, keep);
  pages.forEach(p=>dst.addPage(p));

  _previewBytes = await dst.save(); // Uint8Array
  _atualizarFrame();
  await _atualizarListaPaginas();
}

function pageListSelectAll(checked){
  $('pageList').querySelectorAll('input').forEach(c=>{
    c.checked = checked;
    c.closest('.page-item').classList.toggle('to-remove', !checked);
  });
  $('btnRemovePages').disabled = checked;
}

function fecharPreview(){
  if (_editMode) sairEdicao();
  $('previewModal').classList.remove('show');
  if(_previewUrl){ URL.revokeObjectURL(_previewUrl); _previewUrl = null; }
  _previewBytes = null;
  $('pageList').innerHTML = '<p class="sidebar-info" style="padding:8px">Abra o preview para listar.</p>';
  $('pageTotalInfo').textContent = '';
  $('btnRemovePages').disabled = true;
}

// ─── Modo de edição / sobreposição ──────────────────────────────────────────

async function entrarModoEdicao(){
  if(!_previewBytes){ alert('Abra o preview antes de editar.'); return; }
  _editMode = true;
  _editCurrentPage = 1;
  _editCorrections = [];

  // Começa no modo selecionar
  setEditTool('select');

  // Carrega PDF.js com uma CÓPIA dos bytes (getDocument transfere o buffer para o worker)
  _editPdfJsDoc = await pdfjsLib.getDocument({data: _toU8(_previewBytes)}).promise;

  // Troca iframe por editView
  $('previewFrame').style.display = 'none';
  $('editView').classList.add('active');

  // Atualiza controles
  _atualizarNavEdicao();
  await renderEditPage(_editCurrentPage);
}

function setEditTool(tool){
  _editTool = tool;
  document.getElementById('editToolSelect').classList.toggle('active', tool==='select');
  document.getElementById('editToolAdd').classList.toggle('active', tool==='add');
  const wrap = $('editCanvasWrap');
  if(wrap) wrap.classList.toggle('tool-add', tool==='add');
  const hint = document.getElementById('editHint');
  if(hint) hint.textContent = tool==='add'
    ? 'Clique na pagina para adicionar uma caixa de texto'
    : 'Arraste a caixa para mover; redimensione pelo canto inferior direito';
}

function sairEdicao(){
  _editMode = false;
  $('editView').classList.remove('active');
  $('previewFrame').style.display = '';
  // Limpa canvas e caixas
  const wrap = $('editCanvasWrap');
  wrap.querySelectorAll('.corr-box').forEach(b=>b.remove());
  const ctx = $('editCanvas').getContext('2d');
  ctx.clearRect(0,0,$('editCanvas').width,$('editCanvas').height);
  if(document.fullscreenElement) document.exitFullscreen().catch(()=>{});
}

function _atualizarNavEdicao(){
  const total = _editPdfJsDoc ? _editPdfJsDoc.numPages : 1;
  const numEl = document.getElementById('editPageNum');
  const totEl = document.getElementById('editTotalPages');
  if(numEl) numEl.textContent = _editCurrentPage;
  if(totEl) totEl.textContent = total;
  const prev = document.getElementById('editPrevBtn');
  const next = document.getElementById('editNextBtn');
  if(prev) prev.disabled = _editCurrentPage <= 1;
  if(next) next.disabled = _editCurrentPage >= total;
}

async function renderEditPage(num){
  if(!_editPdfJsDoc) return;
  _editCurrentPage = num;
  _atualizarNavEdicao();

  const page = await _editPdfJsDoc.getPage(num);
  const vp   = page.getViewport({scale: _editScale});

  const canvas = $('editCanvas');
  const ctx    = canvas.getContext('2d');
  canvas.width  = vp.width;
  canvas.height = vp.height;
  await page.render({canvasContext: ctx, viewport: vp}).promise;

  // Remove caixas antigas e reposiciona as da página atual
  const wrap = $('editCanvasWrap');
  wrap.querySelectorAll('.corr-box').forEach(b=>b.remove());
  _editCorrections
    .filter(c=>c.page===num)
    .forEach((c,idx)=>{ wrap.appendChild(_criarBoxDiv(c, idx)); });
}

async function editPrevPage(){
  if(_editCurrentPage>1) await renderEditPage(_editCurrentPage-1);
}
async function editNextPage(){
  if(_editPdfJsDoc && _editCurrentPage<_editPdfJsDoc.numPages) await renderEditPage(_editCurrentPage+1);
}

function editCanvasClick(e){
  if(!_editMode || _editTool !== 'add') return;
  // Ignora cliques originados de dentro de uma corr-box
  if(e.target.closest && e.target.closest('.corr-box')) return;

  const wrap   = $('editCanvasWrap');
  const rect   = wrap.getBoundingClientRect();
  const x      = e.clientX - rect.left;
  const y      = e.clientY - rect.top;
  const fsEl   = document.getElementById('editFontSize');
  const colEl  = document.getElementById('editColor');
  const fSize  = fsEl ? parseInt(fsEl.value)||12 : 12;
  const color  = colEl ? colEl.value : '#000000';

  const correction = {
    page: _editCurrentPage,
    x, y,
    w: 190, h: fSize + 10,
    text: '',
    fontSize: fSize,
    color
  };
  _editCorrections.push(correction);
  const idx = _editCorrections.length-1;
  const box = _criarBoxDiv(correction, idx);
  wrap.appendChild(box);
  // Foca no textarea para digitar imediatamente
  const ta = box.querySelector('textarea');
  if(ta) setTimeout(()=>ta.focus(), 30);
}

function _criarBoxDiv(corr, idx){
  const box = document.createElement('div');
  box.className = 'corr-box';
  box.dataset.idx = idx;
  box.style.left   = corr.x+'px';
  box.style.top    = corr.y+'px';
  box.style.width  = corr.w+'px';
  box.style.height = corr.h+'px';

  const ta = document.createElement('textarea');
  ta.value          = corr.text;
  ta.style.fontSize = corr.fontSize+'px';
  ta.style.color    = corr.color;
  ta.addEventListener('input', ()=>{ _editCorrections[idx].text = ta.value; });
  // Impede que clique/mousedown no textarea propague para o canvas
  ta.addEventListener('mousedown', e=>e.stopPropagation());
  ta.addEventListener('click',     e=>e.stopPropagation());

  // Drag para mover — ativado somente no modo 'select'
  let dragging=false, ox=0, oy=0;
  box.addEventListener('mousedown', e=>{
    if(e.target===ta) return; // textarea gerencia o próprio cursor
    if(_editTool !== 'select') return;
    dragging=true;
    ox = e.clientX - box.offsetLeft;
    oy = e.clientY - box.offsetTop;
    e.preventDefault();
    e.stopPropagation(); // não cria nova box no canvas
  });
  document.addEventListener('mousemove', e=>{
    if(!dragging) return;
    const nx = e.clientX - ox, ny = e.clientY - oy;
    box.style.left = nx+'px';
    box.style.top  = ny+'px';
    _editCorrections[idx].x = nx;
    _editCorrections[idx].y = ny;
  });
  document.addEventListener('mouseup', ()=>{ dragging=false; });

  // ResizeObserver acompanha redimensionamento nativo (CSS resize)
  if(window.ResizeObserver){
    new ResizeObserver(()=>{
      _editCorrections[idx].w = box.offsetWidth;
      _editCorrections[idx].h = box.offsetHeight;
    }).observe(box);
  }

  const del = document.createElement('button');
  del.className = 'corr-del';
  del.type = 'button';
  del.textContent = '×';
  del.addEventListener('mousedown', e=>e.stopPropagation());
  del.onclick = e=>{ e.stopPropagation(); deletarCorrecao(idx); };

  box.appendChild(ta);
  box.appendChild(del);
  return box;
}

function deletarCorrecao(idx){
  _editCorrections[idx] = null; // marca como deletada
  $('editCanvasWrap').querySelectorAll('.corr-box').forEach(b=>{
    if(parseInt(b.dataset.idx)===idx) b.remove();
  });
}

async function aplicarCorrecoes(){
  if(!_previewBytes){ alert('Nenhum PDF no preview.'); return; }

  const doc  = await PDFDocument.load(_toU8(_previewBytes), {ignoreEncryption: true});
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();

  const corrections = _editCorrections.filter(Boolean);
  for(const c of corrections){
    const pdfPage = pages[c.page-1];
    if(!pdfPage) continue;
    const {width, height} = pdfPage.getSize();
    // Converte coordenadas: canvas Y from top → pdf-lib Y from bottom
    const pdfX = c.x / _editScale;
    const boxH = Math.max(20, c.h) / _editScale;
    const pdfY = height - (c.y / _editScale) - boxH;
    const pdfW = c.w / _editScale;

    // Retângulo branco de cobertura
    pdfPage.drawRectangle({
      x: pdfX, y: pdfY, width: pdfW, height: boxH,
      color: rgb(1,1,1), opacity: 1,
    });

    // Converte cor hex → rgb
    const hex = c.color.replace('#','');
    const r = parseInt(hex.substring(0,2),16)/255;
    const g = parseInt(hex.substring(2,4),16)/255;
    const b = parseInt(hex.substring(4,6),16)/255;

    // Texto
    if(c.text.trim()){
      const lines = c.text.split('\n');
      const fsPt  = c.fontSize * 0.75; // px → pt aprox
      let lineY   = pdfY + boxH - fsPt - 2;
      for(const line of lines){
        if(!line) { lineY -= fsPt*1.3; continue; }
        pdfPage.drawText(line, {
          x: pdfX+3, y: lineY,
          size: fsPt, font,
          color: rgb(r,g,b),
          maxWidth: pdfW-6,
        });
        lineY -= fsPt*1.3;
      }
    }
  }

  _correctedBytes = await doc.save();
  _previewBytes   = _correctedBytes;

  // Recarrega o preview com o PDF corrigido
  sairEdicao();
  _atualizarFrame();

  alert('Correções aplicadas! O PDF final incluirá as sobreposições.');
}

function toggleFullscreen(){
  const box = document.querySelector('.modal-box');
  if(!box) return;
  if(document.fullscreenElement){
    document.exitFullscreen().catch(()=>{});
  } else {
    box.requestFullscreen().catch(()=>{});
  }
}

async function gerarPDFDoPreview(){
  // Gera o PDF direto do preview sem precisar fechar a modal
  fecharPreview();
  await gerarPDF();
}

async function montarDatabook(){
  const pdf = await PDFDocument.create();
  const fontReg = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [logo, procedimentos, fichas, pda, tecnicos, idcards, coverAssets] = await Promise.all([
    getAsset('logo'), getAsset('procedimentos'), getAsset('fichas'),
    getAsset('pda'), getAsset('tecnicos'), getAsset('idcards'), getAsset('cover')
  ]);
  const logoTeamPng = await pdf.embedPng(b64ToBytes(logo));
  let bgImg = null, sfImg = null, hdrImg = null, strip = [];
  try {
    if(coverAssets && coverAssets.background)  bgImg = await pdf.embedJpg(b64ToBytes(coverAssets.background));
    if(coverAssets && coverAssets.safetyfirst) sfImg = await pdf.embedPng(b64ToBytes(coverAssets.safetyfirst));
    if(coverAssets && coverAssets.teamHeader)  hdrImg = await pdf.embedJpg(b64ToBytes(coverAssets.teamHeader));
    for(const k of ['img1','img2','img3','img4','img5']){
      if(coverAssets && coverAssets[k]) strip.push(await pdf.embedPng(b64ToBytes(coverAssets[k])));
    }
  } catch(e){ console.warn('cover assets embed:', e); }
  const docNum = getDocNumero();
  const tag = $('tagEquip').value.trim();

  await desenhaCapa(pdf, fontReg, fontBold, logoTeamPng, docNum, bgImg, sfImg, hdrImg, strip);
  await desenhaContracapa(pdf, fontReg, fontBold, logoTeamPng, docNum, tag);
  await desenhaIndice(pdf, fontReg, fontBold, logoTeamPng, docNum);
  await desenhaSeparador(pdf, fontReg, fontBold, logoTeamPng, docNum, '1', 'SOLICITACAO DE SERVICO');
  if(STATE.uploads.ss) await anexarPdf(pdf, STATE.uploads.ss);

  await desenhaSeparador(pdf, fontReg, fontBold, logoTeamPng, docNum, '2', 'RELATORIO DIARIO DE OPERACOES');
  if(STATE.uploads.rdo) await anexarPdf(pdf, STATE.uploads.rdo);

  await desenhaSeparador(pdf, fontReg, fontBold, logoTeamPng, docNum, '3', 'RELATORIO DE EXECUCAO');
  if(STATE.uploads.rel) await anexarPdf(pdf, STATE.uploads.rel);

  await desenhaSeparador(pdf, fontReg, fontBold, logoTeamPng, docNum, '4', 'PROJETO');
  if(STATE.uploads.mem) await anexarPdf(pdf, STATE.uploads.mem);

  await desenhaSeparador(pdf, fontReg, fontBold, logoTeamPng, docNum, '5', 'PROCEDIMENTOS');
  const proc = document.querySelector('input[name=proc]:checked');
  if(proc) await anexarPdf(pdf, b64ToBytes(procedimentos[proc.value]));

  await desenhaSeparador(pdf, fontReg, fontBold, logoTeamPng, docNum, '6', 'FICHA TECNICA');
  for(const c of document.querySelectorAll('input[name=ficha]:checked')){
    await anexarPdf(pdf, b64ToBytes(fichas[c.value]));
  }

  await desenhaSeparador(pdf, fontReg, fontBold, logoTeamPng, docNum, '7', 'PDA');
  for(const c of document.querySelectorAll('input[name=pda]:checked')){
    await anexarPdf(pdf, b64ToBytes(pda[c.value]));
  }

  await desenhaSeparador(pdf, fontReg, fontBold, logoTeamPng, docNum, '8', 'ANALISE DE RISCO DO REPARO');
  if(STATE.uploads.arpt) await anexarPdf(pdf, STATE.uploads.arpt);

  await desenhaSeparador(pdf, fontReg, fontBold, logoTeamPng, docNum, '9', 'CERTIFICADO DE GARANTIA');
  await desenhaCertificadoGarantia(pdf, fontReg, fontBold, logoTeamPng);

  await desenhaSeparador(pdf, fontReg, fontBold, logoTeamPng, docNum, '10', 'CERTIFICADOS DE QUALIFICACAO DOS TECNICOS');
  for(const cb of document.querySelectorAll('.tec-check:checked')){
    const nome = cb.dataset.nome;
    const sel = document.querySelector('.tec-cert[data-nome="'+cssEscape(nome)+'"]');
    if(!sel || !sel.value) continue;
    const certs = tecnicos[nome];
    if(sel.value === '__ALL__'){
      for(const k of Object.keys(certs).sort()){
        await anexarPdf(pdf, b64ToBytes(certs[k]));
      }
    }else if(certs[sel.value]){
      await anexarPdf(pdf, b64ToBytes(certs[sel.value]));
    }
  }
  for(const cb of document.querySelectorAll('.tec-jotun:checked')){
    const idname = cb.dataset.idcard;
    const card = idcards[idname];
    if(card) await anexarPdf(pdf, b64ToBytes(card.pdf));
  }

  desenhaEncerramento(pdf, fontReg, fontBold, logoTeamPng, docNum, $('capaElab').value.trim());

  const bytes = await pdf.save();
  return new Blob([bytes], {type:'application/pdf'});
}

const ELABORADORES = [
  {
    chaves:  ['lais', 'laís'],
    nome:    'Lais Souza Leite',
    cargo:   'Analista de Operações',
    linha:   'Leak Repair Service Line',
    email:   'Lais.Leite@teaminc.com',
  },
  {
    chaves:  ['juliano'],
    nome:    'Juliano Narezi Sobrinho Junior',
    cargo:   'Jovem Aprendiz de Operações',
    linha:   'Leak Repair Service Line',
    email:   'Juliano.Sobrinho@teaminc.com',
  },
];

function resolverElaborador(elab) {
  const texto = (elab || '').toLowerCase();
  return ELABORADORES.find(e => e.chaves.some(c => texto.includes(c)))
    || { nome: elab || '___________________', cargo: '', email: '' };
}

function desenhaEncerramento(pdf, fontReg, fontBold, logoTeamPng, docNum, elab){
  const autor = resolverElaborador(elab);
  const page  = pdf.addPage([PAGE_W, PAGE_H]);

  // ---- HEADER ----
  const lw = 150, lh = Math.round(150 * 0.103);
  page.drawImage(logoTeamPng, {x: MARGIN, y: PAGE_H - 48, width: lw, height: lh});
  page.drawLine({start:{x: MARGIN+lw+18, y: PAGE_H-14}, end:{x: MARGIN+lw+18, y: PAGE_H-62}, thickness:1.5, color:TEAM_BLUE});
  const tx = MARGIN + lw + 30;
  page.drawText('RELATORIO FINAL DE EXECUCAO', {x:tx, y:PAGE_H-30, size:14, font:fontBold, color:TEAM_GRAY});
  page.drawText(docNum,                         {x:tx, y:PAGE_H-48, size:10, font:fontBold, color:TEAM_BLUE});
  page.drawLine({start:{x:MARGIN, y:PAGE_H-66}, end:{x:PAGE_W-MARGIN, y:PAGE_H-66}, thickness:1.8, color:TEAM_BLUE});

  // ---- SEÇÃO DE ENCERRAMENTO (próxima ao rodapé) ----
  let y = 200;
  page.drawText('Atenciosamente,', {x:MARGIN, y, size:10, font:fontReg, color:TEAM_BLUE});
  y -= 28;
  page.drawText(autor.nome,  {x:MARGIN, y, size:13, font:fontBold, color:TEAM_BLUE});
  y -= 16;
  if (autor.cargo) {
    page.drawText(autor.cargo, {x:MARGIN, y, size:10, font:fontReg, color:TEAM_BLUE});
    y -= 14;
  }
  if (autor.linha) {
    page.drawText(autor.linha, {x:MARGIN, y, size:10, font:fontReg, color:TEAM_BLUE});
    y -= 14;
  }
  y -= 14;

  // Logo TEAM
  const cLw = 180, cLh = Math.round(180 * 0.103);
  page.drawImage(logoTeamPng, {x:MARGIN, y, width:cLw, height:cLh});
  y -= 22;

  // Dados de contato do elaborador
  const linhasContato = [
    'Avenida Nossa Senhora do Bom Sucesso, 3344 | Alto do Cardoso | Pindamonhangaba-SP | Brazil',
    '+55 12 3645-9104 direct',
    ...(autor.email ? [autor.email.toLowerCase()] : []),
    'www.TeamInc.com',
  ];
  for (const l of linhasContato) {
    page.drawText(l, {x:MARGIN, y, size:8.5, font:fontReg, color:TEAM_BLUE});
    y -= 13;
  }

  // ---- RODAPÉ (fixo — não varia por elaborador) ----
  // Linha 1: endereço (sem docNum para evitar sobreposição)
  // Linha 2: telefone|email|www  +  docNum alinhado à direita
  page.drawLine({start:{x:MARGIN, y:38}, end:{x:PAGE_W-MARGIN, y:38}, thickness:0.8, color:TEAM_BLUE});
  const boldLabel = 'TEAM Industrial Services';
  page.drawText(boldLabel, {x:MARGIN, y:26, size:7, font:fontBold, color:TEAM_GRAY});
  const bLw = fontBold.widthOfTextAtSize(boldLabel, 7);
  page.drawText(' Avenida Nossa Senhora do Bom Sucesso, 3344 - Alto do Cardoso - Pindamonhangaba/SP, Brazil 12420-010', {x:MARGIN+bLw, y:26, size:7, font:fontReg, color:TEAM_GRAY});

  const foot2 = '+55 12 3645-9104|anderson.andrade@TeamInc.com|';
  const wwwLabel = 'www.TeamInc.com';
  page.drawText(foot2,    {x:MARGIN, y:13, size:7, font:fontReg,  color:TEAM_GRAY});
  page.drawText(wwwLabel, {x:MARGIN+fontReg.widthOfTextAtSize(foot2,7), y:13, size:7, font:fontBold, color:TEAM_GRAY});
  page.drawText(docNum,   {x:PAGE_W-MARGIN-fontReg.widthOfTextAtSize(docNum,7), y:13, size:7, font:fontReg, color:TEAM_GRAY});
}

async function anexarPdf(targetPdf, source){
  try{
    const src = await PDFDocument.load(source, {ignoreEncryption:true});
    const idx = src.getPageIndices();
    const pages = await targetPdf.copyPages(src, idx);
    pages.forEach(p=>targetPdf.addPage(p));
  }catch(e){ console.error('anexarPdf:', e) }
}

function desenhaCabecalhoRodape(page, fontReg, fontBold, logoPng, docNum){
  const ORANGE = rgb(0.867, 0.451, 0.125);
  const HDR_H  = 58;
  const HDR_BOT = PAGE_H - HDR_H;

  // Logo — scaled to fit header height, capped at 90pt wide
  const maxLH = HDR_H - 10, maxLW = 90;
  const sc = Math.min(maxLW / logoPng.width, maxLH / logoPng.height);
  const lw = logoPng.width * sc, lh = logoPng.height * sc;
  page.drawImage(logoPng, {x:MARGIN, y:HDR_BOT + (HDR_H - lh)/2, width:lw, height:lh});

  // Vertical orange separator after logo
  const sepX = MARGIN + lw + 8;
  page.drawLine({start:{x:sepX, y:HDR_BOT+3}, end:{x:sepX, y:PAGE_H-4}, thickness:0.5, color:ORANGE});

  // Right text section: title + doc number centered
  const txtX = sepX + 10;
  const txtW = PAGE_W - MARGIN - txtX;
  const t1 = 'RELATORIO FINAL DE EXECUCAO';
  page.drawText(t1, {
    x: txtX + (txtW - fontBold.widthOfTextAtSize(t1, 11)) / 2,
    y: PAGE_H - 22, size:11, font:fontBold, color:TEAM_GRAY
  });
  const dnW = fontBold.widthOfTextAtSize(docNum, 10);
  const dnX = txtX + (txtW - dnW) / 2;
  page.drawText(docNum, {x:dnX, y:PAGE_H - 42, size:10, font:fontBold, color:TEAM_GRAY});
  page.drawLine({start:{x:dnX-6,     y:HDR_BOT+13}, end:{x:dnX-6,     y:HDR_BOT+24}, thickness:0.7, color:TEAM_GRAY});
  page.drawLine({start:{x:dnX+dnW+6, y:HDR_BOT+13}, end:{x:dnX+dnW+6, y:HDR_BOT+24}, thickness:0.7, color:TEAM_GRAY});

  // Orange horizontal bottom line
  page.drawLine({start:{x:MARGIN, y:HDR_BOT}, end:{x:PAGE_W-MARGIN, y:HDR_BOT}, thickness:0.8, color:ORANGE});

  // ——— FOOTER ———
  const FT_Y1 = 33;
  const FT_Y2 = 21;

  // Thin gray line above footer
  page.drawLine({start:{x:MARGIN, y:FT_Y1+13}, end:{x:PAGE_W-MARGIN, y:FT_Y1+13}, thickness:0.4, color:TEAM_GRAY});

  // Line 1: "TEAM Industrial Services" bold + address
  const ftBold = 'TEAM Industrial Services';
  const ftAddr = ' Avenida Nossa Senhora do Bom Sucsso, 3344 - Alto do Cardoso - Pindamonhangaba/SP, Brazil 12420-010';
  page.drawText(ftBold, {x:MARGIN, y:FT_Y1, size:7, font:fontBold, color:BLACK});
  page.drawText(ftAddr, {x:MARGIN + fontBold.widthOfTextAtSize(ftBold, 7), y:FT_Y1, size:7, font:fontReg, color:BLACK});

  // Line 2 left: phone | email | www
  const ft2a = '+55 12 3645-9104|anderson.andrade@TeamInc.com|';
  const ft2www = 'www.TeamInc.com';
  page.drawText(ft2a,   {x:MARGIN, y:FT_Y2, size:7, font:fontReg, color:BLACK});
  page.drawText(ft2www, {x:MARGIN + fontReg.widthOfTextAtSize(ft2a, 7), y:FT_Y2, size:7, font:fontBold, color:TEAM_BLUE});

  // Line 2 right: doc number with border marks
  const dn2W = fontReg.widthOfTextAtSize(docNum, 7);
  const dn2X = PAGE_W - MARGIN - dn2W;
  page.drawText(docNum, {x:dn2X, y:FT_Y2, size:7, font:fontReg, color:TEAM_GRAY});
  page.drawLine({start:{x:dn2X-5,        y:FT_Y2-2}, end:{x:dn2X-5,        y:FT_Y2+9}, thickness:0.5, color:TEAM_GRAY});
  page.drawLine({start:{x:PAGE_W-MARGIN+2, y:FT_Y2-2}, end:{x:PAGE_W-MARGIN+2, y:FT_Y2+9}, thickness:0.5, color:TEAM_GRAY});
}

async function desenhaCapa(pdf, fontReg, fontBold, logoTeamPng, docNum, bgImg, sfImg, hdrImg, strip = []){
  const page = pdf.addPage([PAGE_W, PAGE_H]);

  // Positions (y from page bottom)
  const HDR_BOT = 668, HDR_H = 140;        // TEAM IS header logo strip
  const REL_Y   = 636;                      // "RELATORIO FINAL DE EXECUCAO"
  const DOCBOX_Y = 604, DOCBOX_H = 26;     // document number border box
  const AC_Y    = 532;                       // "A/C:" — just above client logo white box (BG_TOP-51)
  const BG_BOT  = 215, BG_TOP = 583;       // capa.jpg background strip
  const ELAB_Y  = 200;                      // elaborado/revisado/data line
  const SVC1_Y  = 183, SVC2_Y = 171;       // services text lines
  const FT_TOP  = 110;                      // footer top line

  // doc number metrics — computed first so logo can match its width
  const dnFontSize = 18;
  const dnW = fontBold.widthOfTextAtSize(docNum, dnFontSize);
  const dnX = (PAGE_W - dnW) / 2;

  // 1 — TEAM Industrial Services header logo (width = doc number block)
  if(hdrImg){
    const logoW = dnW + 12;
    const logoH = logoW * (hdrImg.height / hdrImg.width);
    const hActH = Math.min(logoH, HDR_H);
    const hActW = hActH * (hdrImg.width / hdrImg.height);
    page.drawImage(hdrImg, {x:(PAGE_W-hActW)/2, y:HDR_BOT, width:hActW, height:hActH});
  }

  // 2 — "RELATORIO FINAL DE EXECUCAO" bold centered (smaller than doc number)
  const t1 = 'RELATORIO FINAL DE EXECUCAO';
  page.drawText(t1, {x:(PAGE_W-fontBold.widthOfTextAtSize(t1,14))/2, y:REL_Y, size:14, font:fontBold, color:BLACK});

  // 3 — Document number (larger) with thin left/right border lines
  page.drawText(docNum, {x:dnX, y:DOCBOX_Y+5, size:dnFontSize, font:fontBold, color:BLACK});
  page.drawLine({start:{x:dnX-6, y:DOCBOX_Y}, end:{x:dnX-6, y:DOCBOX_Y+DOCBOX_H}, thickness:0.8, color:BLACK});
  page.drawLine({start:{x:dnX+dnW+6, y:DOCBOX_Y}, end:{x:dnX+dnW+6, y:DOCBOX_Y+DOCBOX_H}, thickness:0.8, color:BLACK});

  // 5 — capa.jpg background strip (full width)
  if(bgImg){
    page.drawImage(bgImg, {x:0, y:BG_BOT, width:PAGE_W, height:BG_TOP-BG_BOT});
  }

  // 5b — 5-photo strip at bottom of background area (square, margin-aligned)
  if(strip.length > 0){
    const photoSize = (PAGE_W - 2*MARGIN) / strip.length;
    strip.forEach((img, i) => {
      page.drawImage(img, {x:MARGIN + i*photoSize, y:BG_BOT, width:photoSize, height:photoSize});
    });
  }

  // 6 — Client logo in white box (upper-left of background)
  if(STATE.logoCliente){
    try{
      let img;
      const type = STATE.logoClienteType || 'image/png';
      if(type === 'image/jpeg' || type === 'image/jpg') img = await pdf.embedJpg(STATE.logoCliente);
      else img = await pdf.embedPng(STATE.logoCliente);
      const maxW = 220, maxH = 130;
      const sc = Math.min(maxW/img.width, maxH/img.height);
      const cw = img.width*sc, ch = img.height*sc;
      const bx = MARGIN + 5, by = BG_TOP - maxH - 65;
      page.drawRectangle({x:bx-6, y:by-6, width:maxW+12, height:maxH+12, color:rgb(1,1,1), borderColor:rgb(1,1,1), borderWidth:0});
      page.drawImage(img, {x:bx+(maxW-cw)/2, y:by+(maxH-ch)/2, width:cw, height:ch});
    }catch(e){ console.warn('logo cliente capa:', e); }
  }

  // 6b — "A/C:" drawn on top of background, just above client logo
  page.drawText('A/C:', {x:MARGIN, y:AC_Y, size:9, font:fontBold, color:BLACK});

  // 7 — Elaborado / Revisado / Data line (space-between)
  const elab = $('capaElab').value.trim() || '____________________';
  const rev  = $('capaRev').value.trim()  || '____________________';
  const dt   = fmtDate($('capaData').value) || '__________';
  const eSz  = 8.5;
  const lblE = 'ELABORADO POR: ' + elab;
  const lblR = 'REVISADO POR: '  + rev;
  const lblD = 'DATA: '          + dt;
  const wE = fontReg.widthOfTextAtSize(lblE, eSz);
  const wR = fontReg.widthOfTextAtSize(lblR, eSz);
  const wD = fontReg.widthOfTextAtSize(lblD, eSz);
  const gap = (PAGE_W - 2*MARGIN - wE - wR - wD) / 2;
  page.drawText(lblE, {x:MARGIN,           y:ELAB_Y, size:eSz, font:fontReg, color:BLACK});
  page.drawText(lblR, {x:MARGIN+wE+gap,    y:ELAB_Y, size:eSz, font:fontReg, color:BLACK});
  page.drawText(lblD, {x:PAGE_W-MARGIN-wD, y:ELAB_Y, size:eSz, font:fontReg, color:BLACK});

  // 8 — Services text (two lines wrapped, black)
  const svcFull = 'Furos em Carga e Bloqueio | Reparo de Vazamentos | Usinagem de Campo | Reparo de Valvulas | Controle de Emissoes | Torqueamento | Reparo com Compositos | Inspecao | Conexoes para Furo em Carga e Bloqueio | Abracadeiras de Reparo | Conexoes Especiais';
  const svcLines = quebrarTexto(svcFull, fontReg, 7.5, PAGE_W - 2*MARGIN);
  const svcYs = [SVC1_Y, SVC2_Y];
  svcLines.slice(0, 2).forEach((l, i) => {
    page.drawText(l, {x:(PAGE_W-fontReg.widthOfTextAtSize(l,7.5))/2, y:svcYs[i], size:7.5, font:fontReg, color:BLACK});
  });

  // 9 — 3-column footer: address | SafetyFirst | phone/email/website
  const colW3 = (PAGE_W - 2*MARGIN) / 3;
  const addrX = MARGIN, sfX = MARGIN + colW3, ctX = MARGIN + 2*colW3;

  // Left: address
  const addrLines = [
    'Team do Brasil - Servicos Industriais Ltda',
    'Avenida Nossa Senhora do Bom Sucesso,',
    'n 3344',
    'Alto do Cardoso - Pindamonhangaba/SP',
    'Brasil - CEP: 12420-010',
  ];
  let ay = FT_TOP - 4;
  for(const l of addrLines){
    page.drawText(l, {x:addrX, y:ay, size:7, font:fontReg, color:BLACK});
    ay -= 11;
  }

  // Center: SafetyFirst logo
  if(sfImg){
    const sfMaxW = colW3 - 20, sfMaxH = 52;
    const sc = Math.min(sfMaxW/sfImg.width, sfMaxH/sfImg.height);
    const sw = sfImg.width*sc, sh = sfImg.height*sc;
    page.drawImage(sfImg, {x:sfX+(colW3-sw)/2, y:FT_TOP-sh-8, width:sw, height:sh});
  }

  // Right: contact details — emails in TEAM_BLUE, others TEAM_GRAY
  const ctRows = [
    ['+55 12 3645-9104',          'Main',    false],
    ['+55 12 3648-1670',          'Office',  false],
    ['anderson.andrade@TeamInc.com', 'E-Mail', true],
    ['carlos.estites@teaminc.com',   '',       true],
    ['www.teaminc.com',            'Website', true],
  ];
  const labelColX = PAGE_W - MARGIN;
  let cy = FT_TOP - 4;
  for(const [info, lbl, isEmail] of ctRows){
    const clr = isEmail ? TEAM_BLUE : BLACK;
    if(lbl) page.drawText(lbl, {x:labelColX - fontReg.widthOfTextAtSize(lbl,7), y:cy, size:7, font:fontReg, color:BLACK});
    page.drawText(info, {x:ctX, y:cy, size:7, font:fontReg, color:clr});
    cy -= 11;
  }
}

async function desenhaContracapa(pdf, fontReg, fontBold, logoTeamPng, docNum, tag){
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  desenhaCabecalhoRodape(page, fontReg, fontBold, logoTeamPng, docNum);

  const cy = PAGE_H / 2 + 40;

  // "RELATORIO FINAL DE EXECUCAO"
  const t1 = 'RELATORIO FINAL DE EXECUCAO';
  page.drawText(t1, {x:(PAGE_W-fontBold.widthOfTextAtSize(t1,18))/2, y:cy+48, size:18, font:fontBold, color:BLACK});

  // Document number with thin left/right border lines
  const dnW = fontBold.widthOfTextAtSize(docNum, 14);
  const dnX = (PAGE_W - dnW) / 2;
  page.drawText(docNum, {x:dnX, y:cy+14, size:14, font:fontBold, color:BLACK});
  page.drawLine({start:{x:dnX-6, y:cy+10}, end:{x:dnX-6, y:cy+32}, thickness:0.8, color:BLACK});
  page.drawLine({start:{x:dnX+dnW+6, y:cy+10}, end:{x:dnX+dnW+6, y:cy+32}, thickness:0.8, color:BLACK});

  // TAG
  if(tag){
    page.drawText(tag, {x:(PAGE_W-fontBold.widthOfTextAtSize(tag,18))/2, y:cy-20, size:18, font:fontBold, color:BLACK});
  }
}

async function desenhaIndice(pdf, fontReg, fontBold, logoTeamPng, docNum){
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  desenhaCabecalhoRodape(page, fontReg, fontBold, logoTeamPng, docNum);

  const label = 'INDEX';
  page.drawText(label, {x:(PAGE_W-fontBold.widthOfTextAtSize(label,14))/2, y:PAGE_H-130, size:14, font:fontBold, color:BLACK});

  const itens = [
    ['1',  'SOLICITACAO DE SERVICO'],
    ['2',  'RELATORIO DIARIO DE OPERACOES'],
    ['3',  'RELATORIO DE EXECUCAO'],
    ['4',  'PROJETO'],
    ['5',  'PROCEDIMENTOS'],
    ['6',  'FICHA TECNICA'],
    ['7',  'PDA'],
    ['8',  'ANALISE DE RISCO DO REPARO'],
    ['9',  'CERTIFICADO DE GARANTIA'],
    ['10', 'CERTIFICADOS DE QUALIFICACAO DOS TECNICOS'],
  ];
  let y = PAGE_H - 175;
  for(const [n, lbl] of itens){
    page.drawText(n,   {x:MARGIN+30, y, size:13, font:fontBold, color:TEAM_BLUE});
    page.drawText(lbl, {x:MARGIN+65, y, size:13, font:fontBold, color:TEAM_BLUE});
    y -= 32;
  }
}

async function desenhaSeparador(pdf, fontReg, fontBold, logoTeamPng, docNum, num, titulo){
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  desenhaCabecalhoRodape(page, fontReg, fontBold, logoTeamPng, docNum);

  // Section number + title at top-left below header, TEAM_BLUE bold
  page.drawText(num+'  '+titulo, {x:MARGIN, y:PAGE_H-120, size:13, font:fontBold, color:TEAM_BLUE});

  // "PAGINA EM BRANCO" centered
  const pb = 'PAGINA EM BRANCO';
  page.drawText(pb, {x:(PAGE_W-fontBold.widthOfTextAtSize(pb,11))/2, y:PAGE_H/2, size:11, font:fontBold, color:BLACK});
}

async function desenhaCertificadoGarantia(pdf, fontReg, fontBold, logoTeamPng){

  function gerarCertif(){
    const data = $('cgData').value;
    const plaqueta = (($('cgPlaqueta')||{}).value||'').trim();
    if(!data) return plaqueta||'-';
    const [yy,mm,dd] = data.split('-');
    return dd+mm+yy+(plaqueta?'-'+plaqueta:'');
  }

  function desenhaHeaderCert(pg, pageNum){
    const HY=PAGE_H-75, HH=68, logoColW=115, rightColW=115;
    const midX=MARGIN+logoColW, rightX=PAGE_W-MARGIN-rightColW, fx=rightX+8;
    pg.drawRectangle({x:MARGIN, y:HY, width:PAGE_W-2*MARGIN, height:HH, borderColor:BLACK, borderWidth:0.8, color:rgb(1,1,1)});
    pg.drawLine({start:{x:midX,y:HY}, end:{x:midX,y:HY+HH}, thickness:0.8, color:BLACK});
    pg.drawLine({start:{x:rightX,y:HY}, end:{x:rightX,y:HY+HH}, thickness:0.8, color:BLACK});
    const lw=105, lh=Math.round(105*0.103);
    pg.drawImage(logoTeamPng, {x:MARGIN+(logoColW-lw)/2, y:HY+(HH-lh)/2, width:lw, height:lh});
    const ct='Formulario do Sistema de Qualidade Filial';
    pg.drawText(ct, {x:midX+(rightX-midX-fontBold.widthOfTextAtSize(ct,9))/2, y:HY+(HH-9)/2, size:9, font:fontBold, color:TEAM_GRAY});
    pg.drawText('FORM 8701-123', {x:fx, y:HY+53, size:8.5, font:fontBold, color:BLACK});
    pg.drawLine({start:{x:rightX,y:HY+43}, end:{x:PAGE_W-MARGIN,y:HY+43}, thickness:0.4, color:BLACK});
    pg.drawText('Rev: 0', {x:fx, y:HY+29, size:8.5, font:fontReg, color:BLACK});
    pg.drawLine({start:{x:rightX,y:HY+19}, end:{x:PAGE_W-MARGIN,y:HY+19}, thickness:0.4, color:BLACK});
    pg.drawText('Pagina '+pageNum+' de 2', {x:fx, y:HY+6, size:8.5, font:fontReg, color:BLACK});
    const titleY=HY-28;
    pg.drawRectangle({x:MARGIN, y:titleY, width:PAGE_W-2*MARGIN, height:25, borderColor:BLACK, borderWidth:0.8, color:rgb(1,1,1)});
    const t='CERTIFICADO DE CONFORMIDADE DE REPARO COMPOSITO';
    pg.drawText(t, {x:(PAGE_W-fontBold.widthOfTextAtSize(t,12))/2, y:titleY+7, size:12, font:fontBold, color:BLACK});
    return titleY;
  }

  const availW = PAGE_W - 2*MARGIN;

  function field(pg, label, value, x, fy, lineEnd){
    const lbW = fontBold.widthOfTextAtSize(label, 9);
    pg.drawText(label, {x, y:fy, size:9, font:fontBold, color:BLACK});
    const vx = x + lbW + 4;
    if(value) pg.drawText(String(value), {x:vx, y:fy, size:9, font:fontReg, color:BLACK});
    pg.drawLine({start:{x:vx, y:fy-2}, end:{x:lineEnd, y:fy-2}, thickness:0.4, color:BLACK});
  }

  // ---- PAGINA 1 ----
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const titleY1 = desenhaHeaderCert(page, '1');

  let y = titleY1 - 18;
  for(const l of [
    'Team do Brasil - Servicos Industriais Ltda',
    'Avenida Nossa Senhora do Bom Sucesso,',
    '3344 - Modulo 5 - Alto do Cardoso -',
    'Pindamonhangaba-SP - CEP: 12422-010',
  ]){
    page.drawText(l, {x:(PAGE_W-fontReg.widthOfTextAtSize(l,9))/2, y, size:9, font:fontReg, color:BLACK});
    y -= 13;
  }
  y -= 10;

  const LX = MARGIN, MX = PAGE_W/2 + 8, LEnd = PAGE_W/2 - 4, REnd = PAGE_W - MARGIN;

  field(page, 'Cliente:',    $('cgCliente').value,  LX, y, LEnd);
  field(page, 'Data:',       fmtDate($('cgData').value)||'', MX, y, REnd);
  y -= 19;
  field(page, 'Endereco:',   $('cgEndereco').value, LX, y, LEnd);
  field(page, 'Contrato #:', $('cgContrato').value, MX, y, REnd);
  y -= 19;
  page.drawLine({start:{x:LX, y:y-2}, end:{x:LEnd, y:y-2}, thickness:0.4, color:BLACK});
  field(page, 'Ref #:',      $('cgPO').value,       MX, y, REnd);
  y -= 19;
  page.drawLine({start:{x:LX, y:y-2}, end:{x:LEnd, y:y-2}, thickness:0.4, color:BLACK});
  field(page, 'Job #:',      $('cgTeam').value,     MX, y, REnd);
  y -= 21;

  const cw3 = availW / 3;
  field(page, 'Certif.No.:', gerarCertif(),          LX,          y, LX+cw3-4);
  field(page, 'Lot No.:',    $('cgSerial').value,    LX+cw3+4,    y, LX+2*cw3-4);
  field(page, 'Quant.:',     $('cgQuant').value||'', LX+2*cw3+4,  y, REnd);
  y -= 21;

  field(page, 'Descricao:', $('cgDescricao').value, LX, y, REnd);
  y -= 22;

  const certPar = 'Certificamos que o servico/material e/ou pecas fornecidos conforme o pedido de compra estao de acordo com os termos e especificacoes nele contidos.';
  for(const l of quebrarTexto(certPar, fontBold, 9, availW)){
    page.drawText(l, {x:LX, y, size:9, font:fontBold, color:BLACK}); y -= 12;
  }
  y -= 8;

  const termsLabel = 'Termos/Especificacoes: ';
  const termsBody = 'Servico projetado e calculado em atendimento as normas regulamentadoras e as condicoes de projeto dos equipamentos, especificado pelo cliente. Atestamos para devidos fins que o servico de instalacao do projeto desenvolvido pela Team Industrial Services - Ltda, entre as condicoes de temperatura e pressao de operacao e projeto informados, se apresenta eficaz e com garantia contratual dentro do periodo de 5 anos a partir da data de instalacao. Para futuras revalidacoes e recertificacoes de reparos realizados e necessario que um tecnico Team avalie o estado do reparo no local da execucao (In loco) do mesmo.';
  const lbW9 = fontBold.widthOfTextAtSize(termsLabel, 9);
  page.drawText(termsLabel, {x:LX, y, size:9, font:fontBold, color:BLACK});
  const firstMaxW = availW - lbW9;
  const bWords = termsBody.split(/\s+/);
  let firstSeg = '', bIdx = 0;
  for(; bIdx < bWords.length; bIdx++){
    const t = firstSeg ? firstSeg+' '+bWords[bIdx] : bWords[bIdx];
    if(fontReg.widthOfTextAtSize(t, 9) <= firstMaxW) firstSeg = t;
    else break;
  }
  if(firstSeg) page.drawText(firstSeg, {x:LX+lbW9, y, size:9, font:fontReg, color:BLACK});
  y -= 12;
  const remBody = bWords.slice(bIdx).join(' ');
  for(const l of quebrarTexto(remBody, fontReg, 9, availW)){
    page.drawText(l, {x:LX, y, size:9, font:fontReg, color:BLACK}); y -= 12;
  }
  y -= 16;

  const specRows = [
    ['TAG EQUIPAMENTO:',               $('cgTag').value||''],
    ['PRESSAO DE PROJETO:',            $('cgPProj').value||''],
    ['PRESSAO OPERACAO:',              $('cgPOper').value||''],
    ['TEMPERATURA DE PROJETO:',        ($('cgTProj').value ? $('cgTProj').value+' C' : '')],
    ['TEMPERATURA DE OPERACAO:',       ($('cgTOper').value ? $('cgTOper').value+' C' : '')],
    ['NORMAS APLICAVEIS:',             $('cgNormas').value||''],
    ['ENQUADRAMENTO NA CERTIFICADORA ABS:', (($('cgAbsText')||{}).value)||''],
    ['VIDA UTIL DO REPARO PROJETADO:', $('cgVida').value||''],
  ];
  const maxSpecLW = Math.max(...specRows.map(([l]) => fontBold.widthOfTextAtSize(l, 8.5)));
  const valAreaW = 175;
  const specX = (PAGE_W - maxSpecLW - valAreaW) / 2;
  const valX = specX + maxSpecLW + 6;
  for(const [lbl, val] of specRows){
    const lw = fontBold.widthOfTextAtSize(lbl, 8.5);
    page.drawText(lbl, {x: specX + maxSpecLW - lw, y, size:8.5, font:fontBold, color:BLACK});
    page.drawText(val, {x: valX,                   y, size:8.5, font:fontReg,  color:BLACK});
    y -= 13;
  }
  y -= 2;

  const pfp = (document.querySelector('input[name=cgPfp]:checked')||{}).value||'NAO';
  const simMark = pfp==='SIM' ? '( X )' : '(   )';
  const naoMark = pfp!=='SIM' ? '( X )' : '(   )';
  const esp = ($('cgPfpEsp')||{}).value||'';
  const comp = ($('cgPfpComp')||{}).value||'';
  const pfpTxt = 'FOI REALIZADO APLICACAO DE PFP:   '+simMark+' SIM   '+naoMark+' NAO        ESPESSURA: '+esp+'        COMP.: '+comp;
  page.drawText(pfpTxt, {x:(PAGE_W-fontReg.widthOfTextAtSize(pfpTxt,8.5))/2, y, size:8.5, font:fontReg, color:BLACK});

  // ---- PAGINA 2 ----
  const page2 = pdf.addPage([PAGE_W, PAGE_H]);
  const titleY2 = desenhaHeaderCert(page2, '2');

  const tblX = MARGIN, tblW = availW;
  const tblTop = titleY2 - 20;
  const lblRowH = 22;
  const tblH = Math.min(tblTop - 150, 310);
  const halfW = tblW / 2;
  const photoAreaH = tblH - lblRowH;

  page2.drawRectangle({x:tblX, y:tblTop-tblH, width:tblW, height:tblH, borderColor:BLACK, borderWidth:0.8, color:rgb(1,1,1)});
  page2.drawLine({start:{x:tblX+halfW, y:tblTop-tblH}, end:{x:tblX+halfW, y:tblTop}, thickness:0.8, color:BLACK});
  const lblY = tblTop - tblH + lblRowH;
  page2.drawLine({start:{x:tblX, y:lblY}, end:{x:tblX+tblW, y:lblY}, thickness:0.8, color:BLACK});

  const lbl1='Antes da Execucao', lbl2='Depois da Execucao';
  page2.drawText(lbl1, {x:tblX+(halfW-fontReg.widthOfTextAtSize(lbl1,10))/2, y:tblTop-tblH+7, size:10, font:fontReg, color:BLACK});
  page2.drawText(lbl2, {x:tblX+halfW+(halfW-fontReg.widthOfTextAtSize(lbl2,10))/2, y:tblTop-tblH+7, size:10, font:fontReg, color:BLACK});

  async function desenhaFoto2(buf, tipo, colX){
    if(!buf) return;
    try{
      const img = tipo&&tipo.includes('png')
        ? await pdf.embedPng(new Uint8Array(buf))
        : await pdf.embedJpg(new Uint8Array(buf));
      const d = img.scaleToFit(halfW-16, photoAreaH-16);
      page2.drawImage(img, {x:colX+(halfW-d.width)/2, y:lblY+(photoAreaH-d.height)/2, width:d.width, height:d.height});
    }catch(e){ console.error('foto:', e); }
  }
  await desenhaFoto2(STATE.fotoAntes,  STATE.fotoAntesType,  tblX);
  await desenhaFoto2(STATE.fotoDepois, STATE.fotoDepoisType, tblX+halfW);

  let sy = 115;
  page2.drawText('Assinatura: ', {x:MARGIN, y:sy, size:9, font:fontReg, color:BLACK});
  page2.drawLine({start:{x:MARGIN+68, y:sy-2}, end:{x:MARGIN+310, y:sy-2}, thickness:0.5, color:BLACK});
  sy -= 24;
  page2.drawText('Cargo: ', {x:MARGIN, y:sy, size:9, font:fontReg, color:BLACK});
  page2.drawLine({start:{x:MARGIN+44, y:sy-2}, end:{x:MARGIN+310, y:sy-2}, thickness:0.5, color:BLACK});
  if(($('cgCargo')||{}).value)
    page2.drawText($('cgCargo').value, {x:MARGIN+50, y:sy, size:9, font:fontReg, color:BLACK});
}

function quebrarTexto(txt, font, size, maxW){
  const palavras = txt.split(/\s+/);
  const linhas = [];
  let atual = '';
  for(const p of palavras){
    const test = atual ? atual + ' ' + p : p;
    if(font.widthOfTextAtSize(test, size) > maxW){
      if(atual) linhas.push(atual);
      atual = p;
    }else{
      atual = test;
    }
  }
  if(atual) linhas.push(atual);
  return linhas;
}

adicionarRevisao('Rev0', 'Emissao inicial', '');
