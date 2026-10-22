// Confirmacao ao gerar o PDF final quando ha itens nao preenchidos.
//
// gerarPDF() (main.js) chama confirmarPendencias() antes de montar o book: se houver pendencias abre
// o modal #modalPendencias listando cada uma, com "Cancelar" e "Gerar PDF mesmo assim". Itens
// "bloqueia" (sem os quais o book nao pode ser montado, ex.: RDE do PPCI) tiram o botao de gerar.
//
// Para incluir/retirar um item da checagem, edite so a lista em listarPendencias().

function _vazio(id){ return !((document.getElementById(id)||{}).value||'').trim(); }

function listarPendencias(){
  const p = [];
  const add = (etapa, item, pendente, bloqueia = false) => { if(pendente) p.push({etapa, item, bloqueia}); };

  if(STATE.bookBase){
    // modo "importar book" (complemento PPCI): so o que se aplica a ele
    add('Complemento PPCI', 'RDE com a aplicação do PPCI',           !STATE.uploads.rdePpci,  true);
    add('Complemento PPCI', 'Data do RDE com PPCI',                  _vazio('cgDataPpci'),    true);
    add('Complemento PPCI', 'Espessura do PFP',                      _vazio('ppciEsp'));
    add('Complemento PPCI', 'Comprimento do PFP',                    _vazio('ppciComp'));
    add('Complemento PPCI', 'Descrição do serviço (certificado PPCI)', _vazio('ppciDesc'));
    add('1 · Capa',         'Data',                                  _vazio('capaData'));
    add('11 · Certificado', 'Cliente',                               _vazio('cgCliente'));
    add('11 · Certificado', 'Data',                                  _vazio('cgData'));
    return p;
  }

  const docIncompleto = ['doc1','doc2','doc3','doc4','doc5'].some(_vazio);
  add('1 · Capa',        'Número do documento (campos incompletos)', docIncompleto);
  add('1 · Capa',        'Elaborado por',                          _vazio('capaElab'));
  add('1 · Capa',        'Data',                                   _vazio('capaData'));
  add('2 · Contracapa',  'TAG do equipamento',                     _vazio('tagEquip'));
  add('3 · Solicitação de Serviço',   'PDF da Solicitação de Serviço',  !STATE.uploads.ss);
  add('4 · Relatório Diário',         'PDF do Relatório Diário (RDO)',  !STATE.uploads.rdo);
  add('5 · Relatório de Execução',    'PDF do Relatório de Execução (RDE)', !STATE.uploads.rel);
  add('6 · Projeto / Memorial',       'PDF do Projeto / Memorial de cálculo', !STATE.uploads.mem);
  add('7 · Procedimentos', 'Procedimento',                         !document.querySelector('input[name=proc]:checked'));
  add('8 · Fichas Técnicas', 'Nenhuma ficha técnica selecionada',  !document.querySelector('input[name=ficha]:checked'));
  add('9 · PDA',         'Nenhum certificado PDA selecionado',     !document.querySelector('input[name=pda]:checked'));
  add('10 · Avaliação de Risco', 'PDF da Avaliação de Risco',      !STATE.uploads.arpt);

  const E = '11 · Certificado';
  add(E, 'Cliente',                    _vazio('cgCliente'));
  add(E, 'Data',                       _vazio('cgData'));
  add(E, '# Contrato',                 _vazio('cgContrato'));
  add(E, 'Ref #',                      _vazio('cgPO'));
  add(E, 'Job #',                      _vazio('cgTeam'));
  add(E, '# Plaqueta',                 _vazio('cgPlaqueta'));
  add(E, 'Lot No.',                    _vazio('cgSerial'));
  add(E, 'PDA / Vencimento',           _vazio('cgPDA'));
  add(E, 'Descrição do serviço',       _vazio('cgDescricao'));
  add(E, 'TAG do equipamento',         _vazio('cgTag'));
  add(E, 'Pressão de projeto',         _vazio('cgPProj'));
  add(E, 'Pressão de operação',        _vazio('cgPOper'));
  add(E, 'Temperatura de projeto',     _vazio('cgTProj'));
  add(E, 'Temperatura de operação',    _vazio('cgTOper'));
  add(E, 'Foto antes da execução',     !STATE.fotoAntes);
  add(E, 'Foto depois da execução',    !STATE.fotoDepois);
  add(E, 'Nome do responsável',        _vazio('cgGerente'));
  add(E, 'Assinatura',                 !STATE.assinatura);
  // PFP so e' exigido quando ha PPCI (Jotachar selecionado)
  if(document.querySelector('input[name="ficha"][value="Jotun-Jotachar"]:checked')){
    add(E, 'Espessura do PFP',         _vazio('cgPfpEsp'));
    add(E, 'Comprimento do PFP',       _vazio('cgPfpComp'));
  }

  // tecnicos: marcados sem certificado escolhido sao ignorados na geracao
  const tecs = [...document.querySelectorAll('.tec-check:checked')];
  add('12 · Certificados dos Técnicos', 'Nenhum técnico selecionado', tecs.length === 0);
  for(const cb of tecs){
    const sel = document.querySelector('.tec-cert[data-nome="' + cssEscape(cb.dataset.nome) + '"]');
    add('12 · Certificados dos Técnicos', cb.dataset.nome + ': certificado não selecionado (não será incluído)', !sel || !sel.value);
  }
  return p;
}

// Resolve true se pode gerar (sem pendencias, ou usuario escolheu "Gerar PDF mesmo assim"); false se cancelou
function confirmarPendencias(){
  const pend = listarPendencias();
  if(!pend.length) return Promise.resolve(true);

  const modal     = document.getElementById('modalPendencias');
  const bloqueado = pend.some(x => x.bloqueia);
  const lista     = document.getElementById('pendLista');
  const btnOk     = document.getElementById('pendConfirmar');
  const btnCancel = document.getElementById('pendCancelar');

  document.getElementById('pendTitulo').textContent = bloqueado
    ? 'Faltam itens obrigatórios'
    : (pend.length === 1 ? '1 item ainda não foi preenchido' : pend.length + ' itens ainda não foram preenchidos');
  document.getElementById('pendIntro').textContent = bloqueado
    ? 'O book do complemento PPCI não pode ser gerado sem os itens em vermelho.'
    : 'Se gerar agora, o PDF sairá com esses campos em branco ou sem esses documentos.';

  lista.innerHTML = '';
  for(const x of pend){
    const li  = document.createElement('li');
    const tag = document.createElement('span');
    tag.className = 'pend-etapa';
    tag.textContent = x.etapa;
    li.append(tag, document.createTextNode(x.item));
    if(x.bloqueia) li.classList.add('bloqueia');
    lista.appendChild(li);
  }
  btnOk.style.display = bloqueado ? 'none' : '';
  btnCancel.textContent = bloqueado ? 'Voltar e preencher' : 'Cancelar';

  return new Promise(resolve => {
    const fechar = resultado => {
      modal.classList.remove('show');
      btnOk.onclick = btnCancel.onclick = modal.onclick = null;
      document.removeEventListener('keydown', aoTeclar);
      resolve(resultado);
    };
    const aoTeclar = e => { if(e.key === 'Escape') fechar(false); };
    btnOk.onclick     = () => fechar(true);
    btnCancel.onclick = () => fechar(false);
    modal.onclick     = e => { if(e.target === modal) fechar(false); };
    document.addEventListener('keydown', aoTeclar);
    modal.classList.add('show');
    btnCancel.focus(); // foco no "Cancelar": Enter nao gera o PDF sem querer
  });
}
