// Importacao de book + complemento PPCI.
//
// Fluxo: todo PDF gerado leva em anexo (embutirDadosNoPdf) os dados do formulario, sem os PDFs
// enviados. "Importar Book" le esse anexo, restaura o formulario e entra no modo PPCI, onde o book
// novo = book importado com (1) capa regenerada com a nova data, (2) o RDE do PPCI no fim da secao 3
// e (3) um segundo certificado de conformidade (PPCI) no fim da secao 9. As secoes sao localizadas
// pela marca SECAO_MARK gravada em cada separador (desenhaSeparador, main.js).

const DADOS_ANEXO = 'databook-dados.json';

async function embutirDadosNoPdf(bytes){
  try{
    const estado = coletarRascunho({semUploads:true});
    const json   = new TextEncoder().encode(JSON.stringify(estado));
    const doc    = await PDFDocument.load(_toU8(bytes), {ignoreEncryption:true});
    await doc.attach(json, DADOS_ANEXO, {
      mimeType: 'application/json',
      description: 'Dados do formulario do DataBook (usados para importar este book)',
      creationDate: new Date(), modificationDate: new Date(),
    });
    return await doc.save();
  }catch(e){
    console.warn('embutirDadosNoPdf: book gerado sem os dados para importacao:', e);
    return _toU8(bytes);
  }
}

async function lerDadosDoPdf(bytes){
  const doc     = await pdfjsLib.getDocument({data: _toU8(bytes)}).promise;
  const anexos  = await doc.getAttachments();
  const anexo   = anexos && anexos[DADOS_ANEXO];
  if(!anexo) return null;
  return JSON.parse(new TextDecoder().decode(anexo.content));
}

// Insere a frase do Jotachar na descricao do composito, no mesmo formato da descricao automatica
// (antes do "- PDA ..."); se ja menciona Jotachar, mantem como esta.
function _descricaoPpci(desc){
  const frase = ' E APLICAÇÃO DE JOTUN JOTACHAR JF750 XT COMP A+B.';
  if(!desc || /JOTACHAR/i.test(desc)) return desc;
  const i = desc.indexOf('- PDA');
  return i >= 0 ? desc.slice(0, i) + frase + desc.slice(i) : desc + frase;
}

function ovCertificadoComposito(){
  const snap = STATE.ppci || {};
  return { cgData: snap.cgData || '', cgDescricao: snap.cgDescricao || '', pfp: 'NAO', cgPfpEsp: '', cgPfpComp: '' };
}

function ovCertificadoPpci(){
  return {
    cgData:      ($('cgDataPpci')||{}).value || '',
    cgDescricao: ($('ppciDesc')||{}).value || '',
    cgNormas:    '',
    cgPfpEsp:    ($('ppciEsp')||{}).value || '',
    cgPfpComp:   ($('ppciComp')||{}).value || '',
    pfp:         'SIM',
  };
}

function importarBookPdf(){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/pdf,.pdf';
  input.onchange = async () => {
    const file = input.files[0];
    if(!file) return;
    try{
      if(!window.pdfjsLib) throw new Error('PDF.js nao carregado.');
      const buf    = await fileToBuffer(file);
      const estado = await lerDadosDoPdf(buf);
      if(!estado){
        alert('Este PDF nao tem os dados do formulario embutidos, entao nao da para importa-lo.\n\nSo books gerados a partir desta versao do app podem ser importados.');
        return;
      }
      await restaurarRascunho(estado, {silencioso:true});
      STATE.bookBase     = buf;
      STATE.bookBaseNome = file.name;
      _ativarModoPpci();
    }catch(e){
      console.error(e);
      alert('Erro ao importar o book: ' + e.message);
    }
  };
  input.click();
}

function _ativarModoPpci(){
  // snapshot do certificado do composito: a data da capa sincroniza com a data do certificado
  // (cgData), entao guardamos os valores originais para o certificado do composito nao mudar
  STATE.ppci = { cgData: $('cgData').value, cgDescricao: $('cgDescricao').value };

  delete STATE.uploads.rdePpci;
  $('rdePpciName').textContent = '';
  $('rdePpciZone').classList.remove('has-file');
  $('cgDataPpci').value = '';
  $('ppciEsp').value  = '';
  $('ppciComp').value = '';
  $('ppciDesc').value = _descricaoPpci(STATE.ppci.cgDescricao);

  $('capaData').valueAsDate = new Date(); // sem disparar 'change' (nao mexe na data do certificado)
  $('ppciBase').textContent = STATE.bookBaseNome;
  $('ppciPanel').style.display = '';
  document.body.classList.add('modo-ppci');
  _invalidarPreviewSalvo();
  updateStatus();
  $('ppciPanel').scrollIntoView({behavior:'smooth', block:'start'});
}

function cancelarImportacao(){
  STATE.bookBase = null;
  STATE.bookBaseNome = null;
  STATE.ppci = null;
  delete STATE.uploads.rdePpci;
  $('ppciPanel').style.display = 'none';
  document.body.classList.remove('modo-ppci');
  _invalidarPreviewSalvo();
  updateStatus();
}

// Book novo = book importado com capa nova + RDE do PPCI (fim da secao 3) + certificado PPCI (fim da secao 9)
async function montarBookPpci(){
  const rde      = STATE.uploads.rdePpci;
  const dataPpci = ($('cgDataPpci')||{}).value;
  const faltam   = [];
  if(!rde)      faltam.push('o RDE do PPCI');
  if(!dataPpci) faltam.push('a data do RDE com PPCI');
  if(faltam.length) throw new Error('Complemento PPCI: falta informar ' + faltam.join(' e ') + '.');

  const pdf      = await PDFDocument.create();
  const fontReg  = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { logoTeamPng, bgImg, sfImg, hdrImg, strip } = await _recursosCapa(pdf);

  await desenhaCapa(pdf, fontReg, fontBold, logoTeamPng, getDocNumero(), bgImg, sfImg, hdrImg, strip);

  const base  = await PDFDocument.load(_toU8(STATE.bookBase), {ignoreEncryption:true});
  const total = base.getPageCount();
  const secaoDe = i => {
    const v = base.getPage(i).node.lookup(PDFName.of(SECAO_MARK));
    return v ? v.asNumber() : null;
  };
  // primeiro indice (apos a capa) que pertence a uma secao maior que k = onde a secao k termina
  const fimDaSecao = k => {
    for(let i = 1; i < total; i++){ const s = secaoDe(i); if(s !== null && s > k) return i; }
    return total;
  };
  const fim3 = fimDaSecao(3);
  const fim9 = Math.max(fimDaSecao(9), fim3);

  const copiar = async (de, ate) => {
    if(ate <= de) return;
    const idx   = Array.from({length: ate - de}, (_, k) => de + k);
    const pages = await pdf.copyPages(base, idx);
    pages.forEach(p => pdf.addPage(p));
  };

  await copiar(1, fim3);                                   // contracapa ... fim da secao 3
  await anexarPdf(pdf, rde);                               // RDE do PPCI
  await copiar(fim3, fim9);                                // secoes 4 ... 9
  await desenhaCertificadoGarantia(pdf, fontReg, fontBold, logoTeamPng, ovCertificadoPpci());
  await copiar(fim9, total);                               // secao 10 em diante

  const bytes = await pdf.save();
  return new Blob([bytes], {type:'application/pdf'});
}
