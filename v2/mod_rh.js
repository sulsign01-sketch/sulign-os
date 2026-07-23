/* ═══════════════════════════════════════════════════════════════
   SULSIGN OS 2.0 — MÓDULO: RH (rh)
   Quatro frentes:
     1. Cargos      — plano de cargos e salários (tabela cargos)
     2. Equipe      — ficha completa do colaborador (colaboradores)
     3. Documentos  — controle com validade (colaborador_documentos)
     4. Modelos     — documentos de admissão gerados a partir do cadastro
   Parâmetros de CCT/empresa ficam em localStorage (ss_rh_cfg) até
   existir tabela própria. NÃO faz folha, eSocial nem obrigação
   acessória — isso segue com a contabilidade.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  var fmt=SulSignCore.fmt;
  var CFG_KEY='ss_rh_cfg';
  var st={tab:'cargos', form:null, ftipo:null, feq:'todos', fdoc:'todos'};

  /* ── utilidades ── */
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function num(x){ var n=parseFloat(String(x==null?'':x).replace(',','.')); return isNaN(n)?null:n; }
  function money(v){ return (v==null||v==='')?'—':fmt(v); }
  function dt(d){ if(!d) return '—'; var p=String(d).slice(0,10).split('-'); return p.length===3?(p[2]+'/'+p[1]+'/'+p[0]):String(d); }
  function hojeISO(){ var d=new Date(); return d.toISOString().slice(0,10); }
  function diasAte(d){
    if(!d) return null;
    var a=new Date(String(d).slice(0,10)+'T00:00:00');
    var b=new Date(hojeISO()+'T00:00:00');
    return Math.round((a-b)/86400000);
  }
  function g(id){ var e=document.getElementById(id); return e?e.value:''; }
  function gc(id){ var e=document.getElementById(id); return e?e.checked:false; }
  function nz(v){ v=String(v==null?'':v).trim(); return v===''?null:v; }

  /* ── configuração empresa / CCT ── */
  var CFG_DEF={
    razao:'SUL SIGN GROUP',
    cnpj:'03.952.317/0001-16',
    endereco:'Benfica — Rio de Janeiro / RJ',
    rep:'',
    rep_cargo:'Sócio-administrador',
    cct:'',
    sindicato:'',
    piso:'',
    vt:'',
    vr:'',
    va:'',
    jornada:'44 horas semanais',
    nrs:'NR-06 · NR-35'
  };
  var CFG=null;         /* config em uso */
  var CFG_REMOTA=false; /* true quando a tabela rh_config respondeu */

  function cfgBase(){ var c={},k; for(k in CFG_DEF){ if(CFG_DEF.hasOwnProperty(k)) c[k]=CFG_DEF[k]; } return c; }
  function cfgLocal(){
    var c=cfgBase(),k;
    try{
      var raw=localStorage.getItem(CFG_KEY);
      if(raw){ var o=JSON.parse(raw); for(k in o){ if(o.hasOwnProperty(k)&&o[k]!=null&&o[k]!=='') c[k]=o[k]; } }
    }catch(e){}
    return c;
  }
  function cfgMerge(row){
    var c=cfgBase(),k;
    if(row){ for(k in CFG_DEF){ if(CFG_DEF.hasOwnProperty(k)&&row[k]!=null&&row[k]!=='') c[k]=row[k]; } }
    return c;
  }
  function cfg(){ return CFG||cfgLocal(); }
  function cfgSave(o,done){
    if(!CFG_REMOTA){
      try{ localStorage.setItem(CFG_KEY,JSON.stringify(o)); }catch(e){}
      CFG=cfgMerge(o); if(done) done(); return;
    }
    var body={},k;
    for(k in CFG_DEF){ if(CFG_DEF.hasOwnProperty(k)) body[k]=nz(o[k]); }
    body.atualizado_em=new Date().toISOString();
    SS20.sbw('rh_config?id=eq.1','PATCH',body)
      .then(function(){ CFG=cfgMerge(body); if(done) done(); })
      .catch(function(e){
        var b=document.getElementById('rh-btn-save');
        if(b){ b.disabled=false; b.textContent='Salvar'; }
        alert('Erro ao salvar configuração: '+e.message);
      });
  }
  function ph(v,txt){ return (v==null||String(v).trim()==='')
    ? '<span style="color:#c00;font-weight:700">['+esc(txt)+']</span>' : esc(v); }

  /* ── dados ── */
  function fetchAll(){
    if(SS20.cache.rh) return Promise.resolve(SS20.cache.rh);
    return Promise.all([
      SS20.sb('cargos?select=*&deletado_em=is.null&order=area.asc,ordem.asc,titulo.asc'),
      SS20.sb('colaboradores?select=*&deletado_em=is.null&order=nome.asc'),
      SS20.sb('colaborador_documentos?select=*&deletado_em=is.null&order=validade.asc'),
      SS20.sb('rh_config?select=*&id=eq.1')['catch'](function(){ return null; })
    ]).then(function(r){
      if(r[3]===null){ CFG_REMOTA=false; CFG=cfgLocal(); }
      else { CFG_REMOTA=true; CFG=cfgMerge(r[3][0]||null); }
      var d={cargos:r[0]||[], colabs:r[1]||[], docs:r[2]||[]};
      SS20.cache.rh=d;
      return d;
    });
  }
  function invalidate(){ SS20.cache.rh=null; }
  function cargoDe(d,id){
    var i; if(id==null) return null;
    for(i=0;i<d.cargos.length;i++){ if(String(d.cargos[i].id)===String(id)) return d.cargos[i]; }
    return null;
  }
  function areasDe(d){
    var vis={},lista=[],i,a;
    for(i=0;i<d.cargos.length;i++){
      a=d.cargos[i].area;
      if(a&&!vis[a]){ vis[a]=1; lista.push(a); }
    }
    lista.sort();
    return lista;
  }
  function colabDe(d,id){
    var i; if(id==null) return null;
    for(i=0;i<d.colabs.length;i++){ if(String(d.colabs[i].id)===String(id)) return d.colabs[i]; }
    return null;
  }

  /* ═══════════════ RENDER / EVENTOS ═══════════════ */
  function render(c){
    fetchAll().then(function(d){ draw(c,d); })
    .catch(function(e){ c.innerHTML='<div class="err-view">Erro ao carregar RH: '+esc(e.message)+'</div>'; });

    if(!SS20._rhBound){
      SS20._rhBound=true;
      c.addEventListener('click',function(ev){
        var t=ev.target;
        while(t&&t!==c&&!(t.dataset&&t.dataset.action)) t=t.parentNode;
        if(!t||t===c) return;
        var a=t.dataset.action;
        if(a.indexOf('rh-')!==0) return;
        ev.preventDefault();
        var d=SS20.cache.rh;
        if(a==='rh-tab'){ st.tab=t.dataset.tab; st.form=null; st.ftipo=null; redraw(c); return; }
        if(a==='rh-cancel'){ st.form=null; st.ftipo=null; redraw(c); return; }
        if(a==='rh-save'){ salvar(c); return; }
        if(a==='rh-cfg'){ st.ftipo='cfg'; st.form=cfg(); redraw(c); return; }
        if(a==='rh-area-ren'){ st.ftipo='area'; st.form={de:t.dataset.area,para:t.dataset.area}; redraw(c); return; }
        if(a==='rh-cargo-novo'){ st.ftipo='cargo'; st.form={ativo:true}; redraw(c); return; }
        if(a==='rh-cargo-edit'){ st.ftipo='cargo'; st.form=copia(cargoDe(d,t.dataset.id)); redraw(c); return; }
        if(a==='rh-cargo-del'){ apagar(c,'cargos',t.dataset.id,'Excluir este cargo do plano?'); return; }
        if(a==='rh-colab-novo'){ st.ftipo='colab'; st.form={ativo:true,vinculo:'fixo',regime:'CLT'}; redraw(c); return; }
        if(a==='rh-colab-edit'){ st.ftipo='colab'; st.form=copia(colabDe(d,t.dataset.id)); redraw(c); return; }
        if(a==='rh-doc-novo'){ st.ftipo='doc'; st.form={colaborador_id:t.dataset.colab||''}; redraw(c); return; }
        if(a==='rh-doc-edit'){
          var i,doc=null;
          for(i=0;i<d.docs.length;i++){ if(String(d.docs[i].id)===String(t.dataset.id)) doc=d.docs[i]; }
          st.ftipo='doc'; st.form=copia(doc); redraw(c); return;
        }
        if(a==='rh-doc-del'){ apagar(c,'colaborador_documentos',t.dataset.id,'Excluir este documento?'); return; }
        if(a==='rh-seed'){ semear(c,d); return; }
        if(a==='rh-gerar'){ gerar(d,t.dataset.modelo); return; }
      });
      c.addEventListener('change',function(ev){
        var t=ev.target; if(!t||!t.dataset) return;
        if(t.dataset.action==='rh-feq'){ st.feq=t.value; redraw(c); }
        if(t.dataset.action==='rh-fdoc'){ st.fdoc=t.value; redraw(c); }
      });
    }
  }
  function redraw(c){ if(SS20.cache.rh) draw(c,SS20.cache.rh); else render(c); }
  function copia(o){ var r={},k; if(!o) return {}; for(k in o){ if(o.hasOwnProperty(k)) r[k]=o[k]; } return r; }

  function apagar(c,tabela,id,msg){
    if(!confirm(msg)) return;
    SS20.sbw(tabela+'?id=eq.'+encodeURIComponent(id),'PATCH',{deletado_em:new Date().toISOString()})
      .then(function(){ invalidate(); st.form=null; st.ftipo=null; render(c); })
      .catch(function(e){ alert('Erro ao excluir: '+e.message); });
  }

  /* ═══════════════ SALVAR ═══════════════ */
  function salvar(c){
    if(st.ftipo==='cfg'){
      var o={},k;
      for(k in CFG_DEF){ if(CFG_DEF.hasOwnProperty(k)) o[k]=g('rhc-'+k); }
      var bc=document.getElementById('rh-btn-save');
      if(bc){ bc.disabled=true; bc.textContent='Salvando…'; }
      cfgSave(o,function(){ st.form=null; st.ftipo=null; redraw(c); });
      return;
    }
    var btn=document.getElementById('rh-btn-save');
    if(btn){ btn.disabled=true; btn.textContent='Salvando…'; }
    var tabela,body;

    if(st.ftipo==='area'){
      var nova=g('rha-nome').trim(), de=st.form.de;
      if(!nova){ alert('Informe o novo nome da área.'); if(btn){btn.disabled=false;btn.textContent='Salvar';} return; }
      if(nova===de){ st.form=null; st.ftipo=null; redraw(c); return; }
      SS20.sbw('cargos?area=eq.'+encodeURIComponent(de)+'&deletado_em=is.null','PATCH',{area:nova})
        .then(function(){ invalidate(); st.form=null; st.ftipo=null; render(c); })
        .catch(function(e){
          if(btn){ btn.disabled=false; btn.textContent='Salvar'; }
          alert('Erro ao renomear a área: '+e.message);
        });
      return;
    }
    if(st.ftipo==='cargo'){
      if(!g('rhg-titulo').trim()){ alert('Título do cargo é obrigatório.'); if(btn){btn.disabled=false;btn.textContent='Salvar';} return; }
      tabela='cargos';
      body={
        titulo:g('rhg-titulo').trim(),
        area: nz(g('rhg-areanova'))||nz(g('rhg-area')),
        nivel:nz(g('rhg-nivel')),
        ordem:num(g('rhg-ordem')),
        cbo:nz(g('rhg-cbo')),
        piso_categoria:num(g('rhg-piso')),
        faixa_min:num(g('rhg-fmin')),
        faixa_med:num(g('rhg-fmed')),
        faixa_max:num(g('rhg-fmax')),
        requisitos:nz(g('rhg-req')),
        responsabilidades:nz(g('rhg-resp')),
        progride_para: g('rhg-prog')?parseInt(g('rhg-prog'),10)||null:null,
        ativo:gc('rhg-ativo')
      };
    } else if(st.ftipo==='colab'){
      if(!g('rhp-nome').trim()){ alert('Nome é obrigatório.'); if(btn){btn.disabled=false;btn.textContent='Salvar';} return; }
      tabela='colaboradores';
      body={
        nome:g('rhp-nome').trim(),
        cpf:nz(g('rhp-cpf')), rg:nz(g('rhp-rg')), rg_orgao:nz(g('rhp-rgorgao')),
        data_nascimento:nz(g('rhp-nasc')), nome_mae:nz(g('rhp-mae')),
        estado_civil:nz(g('rhp-ecivil')), nacionalidade:nz(g('rhp-nac')),
        telefone:nz(g('rhp-tel')), email:nz(g('rhp-email')),
        endereco:nz(g('rhp-end')), numero:nz(g('rhp-numero')), complemento:nz(g('rhp-compl')),
        bairro:nz(g('rhp-bairro')), cidade:nz(g('rhp-cidade')), uf:nz(g('rhp-uf')), cep:nz(g('rhp-cep')),
        emerg_nome:nz(g('rhp-emnome')), emerg_telefone:nz(g('rhp-emtel')), emerg_parentesco:nz(g('rhp-empar')),
        vinculo:nz(g('rhp-vinculo')), regime:nz(g('rhp-regime')),
        cargo_id: g('rhp-cargo')?parseInt(g('rhp-cargo'),10)||null:null,
        funcao:nz(g('rhp-funcao')), setor:nz(g('rhp-setor')),
        data_admissao:nz(g('rhp-adm')), experiencia_fim:nz(g('rhp-expfim')),
        data_desligamento:nz(g('rhp-deslig')), motivo_desligamento:nz(g('rhp-motivo')),
        salario:num(g('rhp-salario')), valor_diaria:num(g('rhp-diaria')), jornada:nz(g('rhp-jornada')),
        pis_nis:nz(g('rhp-pis')), ctps_numero:nz(g('rhp-ctpsn')), ctps_serie:nz(g('rhp-ctpss')), ctps_uf:nz(g('rhp-ctpsuf')),
        titulo_eleitor:nz(g('rhp-titulo')), reservista:nz(g('rhp-reserv')),
        banco:nz(g('rhp-banco')), agencia:nz(g('rhp-ag')), conta:nz(g('rhp-conta')),
        tipo_conta:nz(g('rhp-tpconta')), chave_pix:nz(g('rhp-pix')),
        tam_uniforme:nz(g('rhp-uniforme')), tam_calcado:nz(g('rhp-calcado')),
        tipo_sanguineo:nz(g('rhp-sangue')), alergias:nz(g('rhp-alergias')),
        documento:nz(g('rhp-cpf')),
        obs:nz(g('rhp-obs')),
        ativo:gc('rhp-ativo'),
        atualizado_em:new Date().toISOString()
      };
    } else if(st.ftipo==='doc'){
      if(!g('rhd-colab')){ alert('Selecione o colaborador.'); if(btn){btn.disabled=false;btn.textContent='Salvar';} return; }
      if(!g('rhd-tipo').trim()){ alert('Tipo do documento é obrigatório.'); if(btn){btn.disabled=false;btn.textContent='Salvar';} return; }
      tabela='colaborador_documentos';
      body={
        colaborador_id:parseInt(g('rhd-colab'),10),
        tipo:g('rhd-tipo').trim(),
        categoria:nz(g('rhd-cat')),
        numero:nz(g('rhd-num')),
        emissao:nz(g('rhd-emissao')),
        validade:nz(g('rhd-validade')),
        arquivo_url:nz(g('rhd-url')),
        entregue_em:nz(g('rhd-entregue')),
        observacao:nz(g('rhd-obs'))
      };
    } else { return; }

    var isEdit=st.form&&st.form.id;
    var p=isEdit
      ? SS20.sbw(tabela+'?id=eq.'+encodeURIComponent(st.form.id),'PATCH',body)
      : SS20.sbw(tabela,'POST',body);
    p.then(function(){ invalidate(); st.form=null; st.ftipo=null; render(c); })
     .catch(function(e){
       if(btn){ btn.disabled=false; btn.textContent='Salvar'; }
       alert('Erro ao salvar: '+e.message);
     });
  }

  /* ═══════════════ SEMENTE DO PLANO DE CARGOS ═══════════════ */
  var SEED=[
    ['Comunicação Visual','Auxiliar de Comunicação Visual','I',1,null,null,null,'Ensino médio. Sem experiência prévia exigida.','Apoio na preparação de materiais, recorte, aplicação simples e organização do setor.'],
    ['Comunicação Visual','Operador de Impressão / Plotter','II',2,null,null,null,'6 meses de experiência em impressão digital de grande formato.','Operação da plotter, calibragem de cor, controle de mídia e perdas.'],
    ['Comunicação Visual','Aplicador / Instalador de Comunicação Visual','II',3,1900,2500,3300,'Experiência comprovada em aplicação de adesivo e instalação externa. CNH desejável.','Aplicação de vinil, instalação em campo, acabamento e conferência final.'],
    ['Comunicação Visual','Técnico em Comunicação Visual','III',4,null,null,null,'Experiência com dobradeira de letra caixa, montagem e acabamento de peças de comunicação visual.','Operação da dobradeira CNC, montagem e acabamento de letra caixa, aplicações especiais e controle de qualidade final da peça.'],
    ['Comunicação Visual','Líder de Comunicação Visual','Líder',5,null,null,null,'Experiência de liderança e domínio de todo o processo do setor.','Distribuição da fila de produção do setor, qualidade da peça, consumo de insumo e desenvolvimento da equipe.'],
    ['Marcenaria','Ajudante de Marcenaria','I',1,null,null,null,'Ensino fundamental. Sem experiência prévia exigida.','Apoio no corte, lixamento, transporte de chapas e limpeza do setor.'],
    ['Marcenaria','Marceneiro','II',2,null,null,null,'Experiência comprovada em marcenaria de cenografia ou moveleira.','Execução de tapadeiras, praticáveis e estruturas em madeira conforme projeto.'],
    ['Marcenaria','Marceneiro Montador CNC','III',3,null,null,null,'Leitura de projeto e operação de router CNC.','Nesting, otimização de chapa, montagem de conjuntos complexos.'],
    ['Marcenaria','Líder de Marcenaria','Líder',4,null,null,null,'Liderança e domínio pleno do processo.','Sequenciamento da produção, consumo de material e qualidade.'],
    ['Serralheria','Ajudante de Serralheria','I',1,null,null,null,'Ensino fundamental.','Apoio no corte de metalon, preparação de peças e organização.'],
    ['Serralheria','Serralheiro','II',2,null,null,null,'Experiência em solda MIG/eletrodo e leitura de medidas.','Fabricação de estruturas em metalon conforme projeto, solda e acabamento.'],
    ['Serralheria','Líder de Serralheria','Líder',3,null,null,null,'Liderança e domínio pleno do processo.','Planejamento de corte, consumo de metalon e qualidade estrutural.'],
    ['Costura','Auxiliar de Costura','I',1,null,null,null,'Ensino fundamental.','Corte de tecido, preparação de aviamentos e acabamento simples.'],
    ['Costura','Costureira(o)','II',2,null,null,null,'Experiência em costura industrial.','Confecção de rotundas, bandôs, saias de palco e revestimentos em napa.'],
    ['Montagem','Ajudante de Montagem','I',1,null,null,null,'Ensino fundamental. Aptidão para trabalho externo.','Carga, descarga, apoio na montagem e desmontagem.'],
    ['Montagem','Montador','II',2,null,null,null,'Experiência em montagem de cenografia ou estandes.','Montagem e desmontagem de estruturas, conferência de romaneio.'],
    ['Montagem','Montador de Estruturas em Altura','III',3,null,null,null,'NR-35 válida e experiência com treliça e içamento.','Montagem em altura, conferência de ancoragem e uso de EPI específico.'],
    ['Montagem','Encarregado de Montagem','Líder',4,null,null,null,'Liderança de equipe em campo e NR-35 válida.','Comando da equipe em campo, cumprimento do prazo de montagem, segurança do trabalho na frente de serviço e preenchimento do diário de obra.'],
    ['Fabricação Digital','Auxiliar de Fabricação Digital','I',1,null,null,null,'Ensino médio. Noção de informática. Sem experiência prévia exigida.','Troca e fixação de material nas máquinas, acompanhamento do corte, remoção de suportes e rebarbas, lixamento e organização da área.'],
    ['Fabricação Digital','Operador de Fabricação Digital','II',2,null,null,null,'Experiência na operação de router CNC ou laser. Leitura de desenho técnico.','Operação de router, laser e impressoras 3D a partir de arquivo já liberado. Zeramento, fixação de chapa, troca de ferramenta e registro de horas-máquina.'],
    ['Fabricação Digital','Programador de Fabricação Digital (CNC/CAD-CAM)','III',3,null,null,null,'Ensino técnico ou superior incompleto em áreas exatas. Domínio de CAD/CAM, nesting e parâmetros de corte. Dois anos de experiência.','Transforma o projeto em arquivo de produção: detalhamento, nesting e otimização de chapa, definição de ferramenta, avanço e estratégia de corte, fatiamento para impressão 3D. Mantém a biblioteca de arquivos e a tabela de parâmetros por material.'],
    ['Fabricação Digital','Líder de Fabricação Digital','Líder',4,null,null,null,'Domínio pleno do parque de máquinas e experiência de liderança.','Fila de produção das máquinas, custo hora-máquina, viabilidade técnica de peça, manutenção preventiva de primeiro nível e desenvolvimento da equipe.'],
    ['Projetos & Orçamentos','Arte-finalista','II',1,null,null,null,'Domínio de Illustrator/CorelDRAW e Photoshop. Noção de perfil de cor e preparação para impressão.','Recebe o arquivo do cliente e libera para produção: confere sangria, resolução, perfil de cor, fontes e escala. Fecha o arquivo de impressão e o de recorte. Responde pelo pré-flight — é a última barreira antes da máquina.'],
    ['Projetos & Orçamentos','Projetista Detalhista','III',2,null,null,null,'AutoCAD/SketchUp. Leitura de render e capacidade de transformá-lo em projeto executivo. Conhecimento de marcenaria, serralheria e cenografia.','Converte render e briefing em projeto executivo com medidas, materiais e detalhamento construtivo. Gera as vistas e o memorial que alimentam o orçamento e a produção. Valida viabilidade construtiva antes do aceite.'],
    ['Projetos & Orçamentos','Orçamentista','III',3,null,null,null,'Domínio de composição de custo, BDI e das tabelas de insumo. Experiência em comunicação visual ou cenografia.','Levanta quantitativos a partir do projeto, compõe o custo direto por grupo, aplica o BDI vigente e emite a proposta. Responde pela margem orçada de cada job e pela conferência do preço antes do envio ao cliente.'],
    ['Projetos & Orçamentos','Coordenador de Projetos e Orçamentos','Líder',4,null,null,null,'Domínio pleno de projeto e formação de preço. Experiência de liderança.','Revisa toda proposta antes do envio, mantém as tabelas de custo e o BDI atualizados, e apura orçado contra realizado por job.'],
    ['Pintura & Acabamento','Auxiliar de Pintura','I',1,null,null,null,'Ensino fundamental. Treinamento de uso de EPI para agentes químicos.','Preparação de superfície: lixamento, massa, mascaramento e limpeza. Organização da cabine e descarte correto de resíduos.'],
    ['Pintura & Acabamento','Pintor','II',2,null,null,null,'Experiência em pintura a pistola. Conhecimento de preparação de superfície e diluição.','Pintura de peças em madeira, metal e plástico. Preparo de tinta, regulagem de pistola e controle de camada e secagem.'],
    ['Pintura & Acabamento','Pintor de Acabamento Especial','III',3,null,null,null,'Domínio de pintura automotiva, alto brilho e efeitos. Leitura de referência de cor.','Acabamento premium na cabine: automotiva, alto brilho, verniz e efeitos especiais. Formulação e igualação de cor por referência ou Pantone.'],
    ['Suprimentos & Almoxarifado','Auxiliar de Almoxarifado','I',1,null,null,null,'Ensino médio. Noção de informática.','Recebimento e conferência de material, guarda, separação por job e apoio na expedição.'],
    ['Suprimentos & Almoxarifado','Almoxarife','II',2,null,null,null,'Experiência em controle de estoque. Domínio do sistema de movimentação.','Movimentação de entrada e saída no sistema, inventário, controle de mínimos e apropriação de insumo por job. Responde pela acurácia do saldo.'],
    ['Suprimentos & Almoxarifado','Comprador / Analista de Suprimentos','III',3,null,null,null,'Experiência em compras técnicas e negociação com fornecedor.','Cotação, comparativo de preço e prazo, emissão de ordem de compra e acompanhamento de entrega contra o cronograma. Mantém a base de fornecedores e as tabelas de preço.'],
    ['Logística & Transporte','Ajudante de Carga e Descarga','I',1,null,null,null,'Ensino fundamental. Aptidão para esforço físico e trabalho externo.','Carga e descarga, conferência de romaneio, amarração e proteção da carga.'],
    ['Logística & Transporte','Motorista','II',2,null,null,null,'CNH categoria compatível com a frota e curso de transporte de carga quando exigido. Sem restrição em pontuação.','Condução do veículo da empresa, roteirização da entrega, conferência de romaneio na saída e no retorno, e zelo pela manutenção preventiva. Jornada regida por regra própria de motorista.'],
    ['Logística & Transporte','Encarregado de Logística','Líder',3,null,null,null,'Experiência em roteirização e gestão de frota.','Planejamento das rotas contra o cronograma de montagem, controle de frete e de terceiros, custo por entrega e documentação da frota.'],
    ['Gestão','Coordenador de Produção (PCP)','Gestão',1,null,null,null,'Visão de todos os processos produtivos e domínio de cronograma e retroplanejamento.','Sequencia a produção entre as áreas contra o cronograma dos jobs, distribui carga, antecipa gargalo e responde pelo prazo de entrega. É a ponte entre os Líderes de área e a direção.'],
    ['Gestão','Gerente de Operações','Gestão',2,null,null,null,'Experiência de gestão em produção industrial ou cenografia.','Responde pelo resultado operacional consolidado: produtividade, custo, qualidade e segurança. Gere os coordenadores e líderes.'],
    ['Gestão','Sócio-Diretor','Gestão',3,null,null,null,'Sócio da empresa.','Direção estratégica, governança societária, decisão de investimento e representação legal. Remuneração por pró-labore, com reflexo no Fator R.'],
    ['Administrativo','Assistente Administrativo','I',1,null,null,null,'Ensino médio e pacote office.','Lançamentos, organização documental e apoio ao financeiro.'],
    ['Administrativo','Analista Administrativo-Financeiro','II',2,null,null,null,'Ensino superior em andamento e experiência em rotina financeira.','Contas a pagar e receber, conciliação e apoio ao fechamento.']
  ];
  function semear(c,d){
    if(d.cargos.length){ alert('O plano de cargos já tem registros. A semente só roda com a tabela vazia — cadastre manualmente ou apague os existentes.'); return; }
    if(!confirm('Criar a estrutura inicial com '+SEED.length+' cargos em 6 áreas?\n\nAs faixas salariais nascem em branco (exceto Aplicador/Instalador, com a faixa de mercado pesquisada). Você preenche depois com o piso da CCT.')) return;
    var rows=SEED.map(function(s){
      return {area:s[0],titulo:s[1],nivel:s[2],ordem:s[3],
              faixa_min:s[4],faixa_med:s[5],faixa_max:s[6],
              requisitos:s[7],responsabilidades:s[8],ativo:true};
    });
    SS20.sbw('cargos','POST',rows)
      .then(function(){ invalidate(); render(c); })
      .catch(function(e){ alert('Erro ao semear: '+e.message); });
  }

  /* ═══════════════ DESENHO ═══════════════ */
  function draw(c,d){
    var h='<div class="pg-head"><h2>RH</h2><p>Plano de cargos e salários, ficha do colaborador, documentos com validade e geração dos documentos de admissão. Folha, eSocial e obrigações acessórias seguem com a contabilidade.</p></div>';
    h+=alertas(d);
    h+=abas();
    if(st.ftipo==='cfg')        h+=formCfg();
    else if(st.ftipo==='area')  h+=formArea(d);
    else if(st.ftipo==='cargo') h+=formCargo(d);
    else if(st.ftipo==='colab') h+=formColab(d);
    else if(st.ftipo==='doc')   h+=formDoc(d);
    if(st.tab==='cargos')     h+=abaCargos(d);
    else if(st.tab==='equipe')h+=abaEquipe(d);
    else if(st.tab==='docs')  h+=abaDocs(d);
    else if(st.tab==='mod')   h+=abaModelos(d);
    c.innerHTML=h;
  }

  function abas(){
    var t=[['cargos','Cargos'],['equipe','Equipe'],['docs','Documentos'],['mod','Modelos']];
    var h='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;border-bottom:1px solid var(--line);padding-bottom:10px">';
    t.forEach(function(x){
      var on=st.tab===x[0];
      h+='<button data-action="rh-tab" data-tab="'+x[0]+'" style="background:'+(on?'var(--accent)':'none')+';color:'+(on?'#fff':'var(--mut)')+';border:1px solid '+(on?'var(--accent)':'var(--line)')+';border-radius:8px;padding:7px 15px;font-size:12.5px;font-weight:'+(on?'700':'500')+';cursor:pointer;font-family:inherit">'+x[1]+'</button>';
    });
    h+='<div style="flex:1"></div>';
    h+='<button data-action="rh-cfg" style="background:none;border:1px solid var(--line);border-radius:8px;padding:7px 14px;font-size:12.5px;cursor:pointer;font-family:inherit;color:var(--mut)">⚙ Empresa &amp; CCT</button>';
    h+='</div>';
    return h;
  }

  function alertas(d){
    var venc=[],vence=[],i,dd,dias;
    for(i=0;i<d.docs.length;i++){
      dd=d.docs[i]; if(!dd.validade) continue;
      dias=diasAte(dd.validade);
      if(dias<0) venc.push(dd); else if(dias<=30) vence.push(dd);
    }
    var exp=[];
    for(i=0;i<d.colabs.length;i++){
      var cb=d.colabs[i];
      if(cb.experiencia_fim&&cb.ativo!==false){
        dias=diasAte(cb.experiencia_fim);
        if(dias!==null&&dias>=0&&dias<=30) exp.push(cb.nome+' — '+dt(cb.experiencia_fim)+' ('+dias+'d)');
      }
    }
    if(!venc.length&&!vence.length&&!exp.length) return '';
    var h='<div style="background:var(--warn-soft);border:1px solid var(--warn);border-radius:var(--radius);padding:14px 16px;margin-bottom:16px">';
    h+='<div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--warn);margin-bottom:7px">Atenção</div>';
    h+='<div style="font-size:12.5px;line-height:1.7">';
    if(venc.length)  h+='<div><b>'+venc.length+'</b> documento(s) com validade vencida.</div>';
    if(vence.length) h+='<div><b>'+vence.length+'</b> documento(s) vencem nos próximos 30 dias.</div>';
    if(exp.length)   h+='<div>Contrato de experiência terminando: '+esc(exp.join(' · '))+'</div>';
    h+='</div></div>';
    return h;
  }

  /* ── ABA CARGOS ── */
  function abaCargos(d){
    var h='<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">';
    h+='<div style="font-size:12.5px;color:var(--mut)">'+d.cargos.length+' cargo(s) no plano</div><div style="display:flex;gap:8px">';
    if(!d.cargos.length) h+='<button data-action="rh-seed" style="background:none;border:1px dashed var(--accent);color:var(--accent);border-radius:8px;padding:7px 16px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit">Criar estrutura inicial</button>';
    h+='<button data-action="rh-cargo-novo" style="background:var(--accent);color:#fff;border:none;border-radius:8px;padding:7px 16px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">＋ Novo cargo</button>';
    h+='</div></div>';

    if(!d.cargos.length){
      return h+'<div style="background:var(--panel);border:1px dashed var(--line);border-radius:var(--radius);padding:34px;text-align:center;color:var(--mut);font-size:13px">O plano de cargos está vazio.<br>Use <b>Criar estrutura inicial</b> para nascer com as seis áreas da operação e ajustar depois.</div>';
    }
    var areas={},ordem=[],i;
    for(i=0;i<d.cargos.length;i++){
      var a=d.cargos[i].area||'Sem área';
      if(!areas[a]){ areas[a]=[]; ordem.push(a); }
      areas[a].push(d.cargos[i]);
    }
    ordem.forEach(function(a){
      h+='<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);margin-bottom:12px;overflow:hidden">';
      h+='<div style="padding:11px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px">'
        +'<span style="font-family:var(--font-d);font-weight:800;font-size:13.5px">'+esc(a)+'</span>'
        +'<span style="font-size:11px;color:var(--mut)">'+areas[a].length+' cargo(s)</span>'
        +'<span style="flex:1"></span>'
        +'<a href="#" data-action="rh-area-ren" data-area="'+esc(a)+'" style="color:var(--accent);font-size:11.5px;font-weight:600">renomear área</a>'
        +'</div>';
      h+='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px">';
      h+='<tr style="color:var(--mut);font-size:10.5px;text-transform:uppercase;letter-spacing:.6px">'
        +'<th style="text-align:left;padding:8px 16px">Cargo</th>'
        +'<th style="text-align:left;padding:8px 10px">Nível</th>'
        +'<th style="text-align:right;padding:8px 10px">Mín</th>'
        +'<th style="text-align:right;padding:8px 10px">Médio</th>'
        +'<th style="text-align:right;padding:8px 10px">Máx</th>'
        +'<th style="text-align:left;padding:8px 10px">CBO</th>'
        +'<th style="padding:8px 16px"></th></tr>';
      areas[a].forEach(function(cg){
        var vazio=(cg.faixa_min==null&&cg.faixa_med==null&&cg.faixa_max==null);
        h+='<tr style="border-top:1px solid var(--line)'+(cg.ativo===false?';opacity:.45':'')+'">'
          +'<td style="padding:9px 16px;font-weight:600">'+esc(cg.titulo)+(cg.ativo===false?' <span style="font-size:10px;color:var(--mut)">(inativo)</span>':'')+'</td>'
          +'<td style="padding:9px 10px;color:var(--mut)">'+esc(cg.nivel||'—')+'</td>'
          +'<td style="padding:9px 10px;text-align:right'+(vazio?';color:var(--warn)':'')+'">'+(vazio?'a definir':money(cg.faixa_min))+'</td>'
          +'<td style="padding:9px 10px;text-align:right">'+(vazio?'':money(cg.faixa_med))+'</td>'
          +'<td style="padding:9px 10px;text-align:right">'+(vazio?'':money(cg.faixa_max))+'</td>'
          +'<td style="padding:9px 10px;color:var(--mut)">'+esc(cg.cbo||'—')+'</td>'
          +'<td style="padding:9px 16px;text-align:right;white-space:nowrap">'
          +'<a href="#" data-action="rh-cargo-edit" data-id="'+esc(cg.id)+'" style="color:var(--accent);font-weight:600;font-size:11.5px">editar</a>'
          +' <a href="#" data-action="rh-cargo-del" data-id="'+esc(cg.id)+'" style="color:var(--danger);font-size:11.5px;margin-left:8px">excluir</a>'
          +'</td></tr>';
      });
      h+='</table></div></div>';
    });
    return h;
  }

  /* ── ABA EQUIPE ── */
  function abaEquipe(d){
    var h='<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">';
    h+='<select data-action="rh-feq" style="padding:7px 11px;border:1px solid var(--line);border-radius:8px;font-size:12.5px;font-family:inherit;background:var(--panel)">'
      +opt('todos','Todos os vínculos',st.feq)+opt('fixo','Fixo',st.feq)+opt('freela','Freela',st.feq)+opt('terceiro','Terceiro',st.feq)+'</select>';
    h+='<button data-action="rh-colab-novo" style="background:var(--accent);color:#fff;border:none;border-radius:8px;padding:7px 16px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">＋ Nova ficha</button>';
    h+='</div>';

    var lista=d.colabs.filter(function(cb){ return st.feq==='todos'||cb.vinculo===st.feq; });
    if(!lista.length) return h+'<div style="background:var(--panel);border:1px dashed var(--line);border-radius:var(--radius);padding:30px;text-align:center;color:var(--mut);font-size:13px">Nenhum colaborador neste filtro.</div>';

    h+='<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden"><div style="overflow-x:auto">';
    h+='<table style="width:100%;border-collapse:collapse;font-size:12.5px">';
    h+='<tr style="color:var(--mut);font-size:10.5px;text-transform:uppercase;letter-spacing:.6px">'
      +'<th style="text-align:left;padding:9px 16px">Nome</th>'
      +'<th style="text-align:left;padding:9px 10px">Cargo</th>'
      +'<th style="text-align:left;padding:9px 10px">Vínculo</th>'
      +'<th style="text-align:right;padding:9px 10px">Salário / diária</th>'
      +'<th style="text-align:left;padding:9px 10px">Admissão</th>'
      +'<th style="text-align:center;padding:9px 10px">Ficha</th>'
      +'<th style="padding:9px 16px"></th></tr>';
    lista.forEach(function(cb){
      var cg=cargoDe(d,cb.cargo_id);
      var falta=[];
      if(!cb.cpf) falta.push('CPF');
      if(cb.vinculo==='fixo'&&!cb.pis_nis) falta.push('PIS');
      if(!cb.cargo_id) falta.push('cargo');
      if(!cb.telefone) falta.push('tel');
      var vlr = cb.salario!=null ? money(cb.salario) : (cb.valor_diaria!=null? money(cb.valor_diaria)+'/dia' : '—');
      h+='<tr style="border-top:1px solid var(--line)'+(cb.ativo===false?';opacity:.45':'')+'">'
        +'<td style="padding:9px 16px;font-weight:600">'+esc(cb.nome)+'</td>'
        +'<td style="padding:9px 10px;color:var(--mut)">'+esc(cg?cg.titulo:(cb.funcao||'—'))+'</td>'
        +'<td style="padding:9px 10px"><span style="background:var(--paper);border:1px solid var(--line);border-radius:20px;padding:2px 9px;font-size:10.5px">'+esc(cb.vinculo||'—')+'</span></td>'
        +'<td style="padding:9px 10px;text-align:right">'+vlr+'</td>'
        +'<td style="padding:9px 10px;color:var(--mut)">'+dt(cb.data_admissao)+'</td>'
        +'<td style="padding:9px 10px;text-align:center">'+(falta.length
            ?'<span style="color:var(--warn);font-size:11px">falta '+esc(falta.join(', '))+'</span>'
            :'<span style="color:var(--ok);font-size:11px">completa</span>')+'</td>'
        +'<td style="padding:9px 16px;text-align:right;white-space:nowrap">'
        +'<a href="#" data-action="rh-colab-edit" data-id="'+esc(cb.id)+'" style="color:var(--accent);font-weight:600;font-size:11.5px">editar</a>'
        +' <a href="#" data-action="rh-doc-novo" data-colab="'+esc(cb.id)+'" style="color:var(--mut);font-size:11.5px;margin-left:8px">+ doc</a>'
        +'</td></tr>';
    });
    h+='</table></div></div>';
    return h;
  }

  /* ── ABA DOCUMENTOS ── */
  function abaDocs(d){
    var h='<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">';
    h+='<select data-action="rh-fdoc" style="padding:7px 11px;border:1px solid var(--line);border-radius:8px;font-size:12.5px;font-family:inherit;background:var(--panel)">'
      +opt('todos','Todos',st.fdoc)+opt('vencidos','Vencidos',st.fdoc)+opt('vencendo','Vencem em 30 dias',st.fdoc)+opt('semval','Sem validade',st.fdoc)+'</select>';
    h+='<button data-action="rh-doc-novo" style="background:var(--accent);color:#fff;border:none;border-radius:8px;padding:7px 16px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">＋ Novo documento</button>';
    h+='</div>';

    var lista=d.docs.filter(function(dd){
      var dias=diasAte(dd.validade);
      if(st.fdoc==='vencidos')  return dias!==null&&dias<0;
      if(st.fdoc==='vencendo')  return dias!==null&&dias>=0&&dias<=30;
      if(st.fdoc==='semval')    return !dd.validade;
      return true;
    });
    if(!lista.length) return h+'<div style="background:var(--panel);border:1px dashed var(--line);border-radius:var(--radius);padding:30px;text-align:center;color:var(--mut);font-size:13px">Nenhum documento neste filtro.</div>';

    h+='<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden"><div style="overflow-x:auto">';
    h+='<table style="width:100%;border-collapse:collapse;font-size:12.5px">';
    h+='<tr style="color:var(--mut);font-size:10.5px;text-transform:uppercase;letter-spacing:.6px">'
      +'<th style="text-align:left;padding:9px 16px">Colaborador</th>'
      +'<th style="text-align:left;padding:9px 10px">Documento</th>'
      +'<th style="text-align:left;padding:9px 10px">Número</th>'
      +'<th style="text-align:left;padding:9px 10px">Emissão</th>'
      +'<th style="text-align:left;padding:9px 10px">Validade</th>'
      +'<th style="text-align:left;padding:9px 10px">Situação</th>'
      +'<th style="padding:9px 16px"></th></tr>';
    lista.forEach(function(dd){
      var cb=colabDe(d,dd.colaborador_id);
      var dias=diasAte(dd.validade), sit='<span style="color:var(--mut)">—</span>';
      if(dias!==null){
        if(dias<0)        sit='<span style="color:var(--danger);font-weight:700">vencido há '+Math.abs(dias)+'d</span>';
        else if(dias<=30) sit='<span style="color:var(--warn);font-weight:700">vence em '+dias+'d</span>';
        else              sit='<span style="color:var(--ok)">válido</span>';
      }
      h+='<tr style="border-top:1px solid var(--line)">'
        +'<td style="padding:9px 16px;font-weight:600">'+esc(cb?cb.nome:('#'+dd.colaborador_id))+'</td>'
        +'<td style="padding:9px 10px">'+esc(dd.tipo)+(dd.categoria?' <span style="color:var(--mut);font-size:11px">('+esc(dd.categoria)+')</span>':'')+'</td>'
        +'<td style="padding:9px 10px;color:var(--mut)">'+esc(dd.numero||'—')+'</td>'
        +'<td style="padding:9px 10px;color:var(--mut)">'+dt(dd.emissao)+'</td>'
        +'<td style="padding:9px 10px">'+dt(dd.validade)+'</td>'
        +'<td style="padding:9px 10px">'+sit+'</td>'
        +'<td style="padding:9px 16px;text-align:right;white-space:nowrap">'
        +(dd.arquivo_url?'<a href="'+esc(dd.arquivo_url)+'" target="_blank" style="color:var(--blue);font-size:11.5px;margin-right:8px">abrir</a>':'')
        +'<a href="#" data-action="rh-doc-edit" data-id="'+esc(dd.id)+'" style="color:var(--accent);font-weight:600;font-size:11.5px">editar</a>'
        +' <a href="#" data-action="rh-doc-del" data-id="'+esc(dd.id)+'" style="color:var(--danger);font-size:11.5px;margin-left:8px">excluir</a>'
        +'</td></tr>';
    });
    h+='</table></div></div>';
    return h;
  }

  /* ── ABA MODELOS ── */
  var MODELOS=[
    ['contrato','Contrato de experiência 45 + 45','Contrato por prazo determinado com prorrogação única, nos limites do art. 445 da CLT.'],
    ['checklist','Checklist de admissão','Sequência com prazos D-, do ASO ao envio ao eSocial.'],
    ['epi','Ficha de entrega de EPI','Controle de entrega com assinatura, exigível na fiscalização.'],
    ['sigilo','Termo de confidencialidade e imagem','Sigilo de projetos de clientes e autorização de uso de imagem.'],
    ['cargo','Descrição de cargo','Gerada a partir do plano de cargos, com requisitos e progressão.']
  ];
  function abaModelos(d){
    var h='<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px;margin-bottom:14px">';
    h+='<label style="display:block;font-size:11px;color:var(--mut);margin:0 0 4px">Colaborador</label>';
    h+='<select id="rh-mod-colab" style="width:100%;max-width:420px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;background:var(--paper)">';
    h+='<option value="">— selecione —</option>';
    d.colabs.forEach(function(cb){ h+='<option value="'+esc(cb.id)+'">'+esc(cb.nome)+'</option>'; });
    h+='</select>';
    h+='<div style="font-size:11.5px;color:var(--mut);margin-top:8px">Os campos ainda não preenchidos saem <span style="color:#c00;font-weight:700">[assim]</span> no documento, para você não assinar nada por engano.</div>';
    h+='</div>';
    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px">';
    MODELOS.forEach(function(m){
      h+='<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px;display:flex;flex-direction:column;gap:9px">'
        +'<div style="font-family:var(--font-d);font-weight:800;font-size:13.5px">'+esc(m[1])+'</div>'
        +'<div style="font-size:12px;color:var(--mut);flex:1;line-height:1.55">'+esc(m[2])+'</div>'
        +'<button data-action="rh-gerar" data-modelo="'+m[0]+'" style="background:none;border:1px solid var(--accent);color:var(--accent);border-radius:8px;padding:7px 14px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;align-self:flex-start">Gerar</button>'
        +'</div>';
    });
    h+='</div>';
    return h;
  }

  /* ═══════════════ FORMULÁRIOS ═══════════════ */
  function box(titulo,inner){
    return '<div style="background:var(--panel);border:1px solid var(--accent);border-radius:var(--radius);padding:18px;margin-bottom:16px">'
      +'<div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--accent);margin-bottom:12px">'+esc(titulo)+'</div>'
      +inner
      +'<div style="display:flex;gap:10px;margin-top:16px">'
      +'<button id="rh-btn-save" data-action="rh-save" style="background:var(--accent);color:#fff;border:none;border-radius:8px;padding:9px 22px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Salvar</button>'
      +'<button data-action="rh-cancel" style="background:none;border:1px solid var(--line);border-radius:8px;padding:9px 18px;font-size:13px;cursor:pointer;font-family:inherit;color:inherit">Cancelar</button>'
      +'</div></div>';
  }
  function grid(inner){ return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px 14px">'+inner+'</div>'; }
  function sub(t){ return '<div style="grid-column:1/-1;font-size:10.5px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:var(--mut);margin:8px 0 -4px">'+esc(t)+'</div>'; }
  function inp(id,lbl,v,ph2,tipo){
    return '<div><label style="display:block;font-size:11px;color:var(--mut);margin:0 0 3px">'+esc(lbl)+'</label>'
      +'<input id="'+id+'" type="'+(tipo||'text')+'" value="'+esc(v==null?'':v)+'" placeholder="'+esc(ph2||'')+'" '
      +'style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;background:var(--paper);box-sizing:border-box"></div>';
  }
  function txt(id,lbl,v,rows){
    return '<div style="grid-column:1/-1"><label style="display:block;font-size:11px;color:var(--mut);margin:0 0 3px">'+esc(lbl)+'</label>'
      +'<textarea id="'+id+'" rows="'+(rows||2)+'" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;background:var(--paper);box-sizing:border-box;resize:vertical">'+esc(v==null?'':v)+'</textarea></div>';
  }
  function opt(v,l,sel){ return '<option value="'+esc(v)+'"'+(String(sel)===String(v)?' selected':'')+'>'+esc(l)+'</option>'; }
  function sel(id,lbl,html){
    return '<div><label style="display:block;font-size:11px;color:var(--mut);margin:0 0 3px">'+esc(lbl)+'</label>'
      +'<select id="'+id+'" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;background:var(--paper);box-sizing:border-box">'+html+'</select></div>';
  }
  function chk(id,lbl,v){
    return '<label style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer;padding-top:16px">'
      +'<input id="'+id+'" type="checkbox"'+(v?' checked':'')+'> '+esc(lbl)+'</label>';
  }

  function formCfg(){
    var f=st.form;
    var i='';
    i+=grid(
       sub('Empresa')
      +inp('rhc-razao','Razão social',f.razao)
      +inp('rhc-cnpj','CNPJ',f.cnpj)
      +inp('rhc-endereco','Endereço',f.endereco)
      +inp('rhc-rep','Representante legal',f.rep,'quem assina')
      +inp('rhc-rep_cargo','Cargo do representante',f.rep_cargo)
      +sub('Convenção coletiva — preencher após retorno da contabilidade')
      +inp('rhc-cct','CCT aplicável',f.cct,'ex.: SINDCOM/RJ 2026/2027')
      +inp('rhc-sindicato','Sindicato da categoria',f.sindicato)
      +inp('rhc-piso','Piso da categoria (R$)',f.piso)
      +inp('rhc-vt','Vale-transporte',f.vt)
      +inp('rhc-vr','Vale-refeição',f.vr)
      +inp('rhc-va','Vale-alimentação',f.va)
      +inp('rhc-jornada','Jornada padrão',f.jornada)
      +inp('rhc-nrs','NRs obrigatórias',f.nrs)
    );
    i+='<div style="font-size:11.5px;color:var(--mut);margin-top:12px;line-height:1.6">Estes parâmetros alimentam todos os documentos gerados. '
      +(CFG_REMOTA
        ? 'Salvos no <b>Supabase</b> — valem para todos os usuários do sistema.'
        : '<b style="color:var(--warn)">Salvos apenas neste navegador.</b> A tabela <code>rh_config</code> ainda não existe no banco; rode a migração para que passem a valer para todo mundo.')
      +'</div>';
    return box('Empresa & convenção coletiva',i);
  }

  function formCargo(d){
    var f=st.form;
    var oa='<option value="">— sem área —</option>';
    areasDe(d).forEach(function(a){ oa+=opt(a,a,f.area); });
    var o='<option value="">— nenhum —</option>';
    d.cargos.forEach(function(cg){ if(String(cg.id)!==String(f.id)) o+=opt(cg.id,cg.area+' · '+cg.titulo,f.progride_para); });
    var i=grid(
       inp('rhg-titulo','Título *',f.titulo,'ex.: Montador')
      +sel('rhg-area','Área',oa)
      +inp('rhg-areanova','Ou criar nova área','','deixe vazio para usar a seleção')
      +sel('rhg-nivel','Nível','<option value="">—</option>'+opt('I','I',f.nivel)+opt('II','II',f.nivel)+opt('III','III',f.nivel)+opt('Líder','Líder',f.nivel)+opt('Gestão','Gestão',f.nivel))
      +inp('rhg-ordem','Ordem na área',f.ordem,'1, 2, 3…')
      +inp('rhg-cbo','CBO',f.cbo,'confirmar com a contabilidade')
      +inp('rhg-piso','Piso da categoria (R$)',f.piso_categoria)
      +inp('rhg-fmin','Faixa mínima (R$)',f.faixa_min)
      +inp('rhg-fmed','Faixa média (R$)',f.faixa_med)
      +inp('rhg-fmax','Faixa máxima (R$)',f.faixa_max)
      +sel('rhg-prog','Progride para',o)
      +txt('rhg-req','Requisitos',f.requisitos,2)
      +txt('rhg-resp','Responsabilidades',f.responsabilidades,3)
      +chk('rhg-ativo','Ativo',f.ativo!==false)
    );
    return box(f.id?'Editar cargo':'Novo cargo',i);
  }

  function formArea(d){
    var f=st.form, n=0, i;
    for(i=0;i<d.cargos.length;i++){ if(d.cargos[i].area===f.de) n++; }
    var inner=grid(inp('rha-nome','Novo nome da área',f.para,'ex.: Costura & Aviamentos'));
    inner+='<div style="font-size:11.5px;color:var(--mut);margin-top:10px;line-height:1.6">'
      +'Renomear atualiza os <b>'+n+' cargo(s)</b> desta área de uma vez. '
      +'Se o nome novo já existir, as duas áreas se fundem — e isso não tem desfazer.</div>';
    return box('Renomear área — '+f.de,inner);
  }

  function formColab(d){
    var f=st.form;
    var oc='<option value="">— sem cargo —</option>';
    d.cargos.forEach(function(cg){ oc+=opt(cg.id,(cg.area?cg.area+' · ':'')+cg.titulo+(cg.nivel?' ('+cg.nivel+')':''),f.cargo_id); });
    var i=grid(
       sub('Identificação')
      +inp('rhp-nome','Nome completo *',f.nome)
      +inp('rhp-cpf','CPF',f.cpf)
      +inp('rhp-rg','RG',f.rg)
      +inp('rhp-rgorgao','Órgão emissor',f.rg_orgao)
      +inp('rhp-nasc','Nascimento',f.data_nascimento,'','date')
      +inp('rhp-mae','Nome da mãe',f.nome_mae)
      +inp('rhp-ecivil','Estado civil',f.estado_civil)
      +inp('rhp-nac','Nacionalidade',f.nacionalidade)
      +sub('Contato')
      +inp('rhp-tel','Telefone',f.telefone)
      +inp('rhp-email','E-mail',f.email)
      +inp('rhp-end','Endereço',f.endereco)
      +inp('rhp-numero','Número',f.numero)
      +inp('rhp-compl','Complemento',f.complemento)
      +inp('rhp-bairro','Bairro',f.bairro)
      +inp('rhp-cidade','Cidade',f.cidade)
      +inp('rhp-uf','UF',f.uf)
      +inp('rhp-cep','CEP',f.cep)
      +sub('Emergência')
      +inp('rhp-emnome','Contato',f.emerg_nome)
      +inp('rhp-emtel','Telefone',f.emerg_telefone)
      +inp('rhp-empar','Parentesco',f.emerg_parentesco)
      +sub('Contrato')
      +sel('rhp-vinculo','Vínculo',opt('fixo','Fixo',f.vinculo)+opt('freela','Freela',f.vinculo)+opt('terceiro','Terceiro',f.vinculo))
      +sel('rhp-regime','Regime','<option value="">—</option>'+opt('CLT','CLT',f.regime)+opt('Experiência','Experiência',f.regime)+opt('Autônomo','Autônomo',f.regime)+opt('PJ','PJ',f.regime)+opt('Sócio','Sócio',f.regime))
      +sel('rhp-cargo','Cargo (plano)',oc)
      +inp('rhp-funcao','Função (texto livre)',f.funcao)
      +inp('rhp-setor','Setor',f.setor)
      +inp('rhp-adm','Admissão',f.data_admissao,'','date')
      +inp('rhp-expfim','Fim da experiência',f.experiencia_fim,'','date')
      +inp('rhp-salario','Salário mensal (R$)',f.salario)
      +inp('rhp-diaria','Valor diária (R$)',f.valor_diaria)
      +inp('rhp-jornada','Jornada',f.jornada)
      +inp('rhp-deslig','Desligamento',f.data_desligamento,'','date')
      +inp('rhp-motivo','Motivo do desligamento',f.motivo_desligamento)
      +sub('Documentos legais')
      +inp('rhp-pis','PIS / NIS',f.pis_nis)
      +inp('rhp-ctpsn','CTPS nº',f.ctps_numero)
      +inp('rhp-ctpss','CTPS série',f.ctps_serie)
      +inp('rhp-ctpsuf','CTPS UF',f.ctps_uf)
      +inp('rhp-titulo','Título de eleitor',f.titulo_eleitor)
      +inp('rhp-reserv','Reservista',f.reservista)
      +sub('Pagamento')
      +inp('rhp-banco','Banco',f.banco)
      +inp('rhp-ag','Agência',f.agencia)
      +inp('rhp-conta','Conta',f.conta)
      +inp('rhp-tpconta','Tipo de conta',f.tipo_conta)
      +inp('rhp-pix','Chave PIX',f.chave_pix)
      +sub('Uniforme & saúde')
      +inp('rhp-uniforme','Tam. uniforme',f.tam_uniforme)
      +inp('rhp-calcado','Tam. calçado',f.tam_calcado)
      +inp('rhp-sangue','Tipo sanguíneo',f.tipo_sanguineo)
      +inp('rhp-alergias','Alergias / restrições',f.alergias)
      +txt('rhp-obs','Observações',f.obs,2)
      +chk('rhp-ativo','Ativo',f.ativo!==false)
    );
    return box(f.id?'Editar ficha — '+f.nome:'Nova ficha',i);
  }

  function formDoc(d){
    var f=st.form;
    var oc='<option value="">— selecione —</option>';
    d.colabs.forEach(function(cb){ oc+=opt(cb.id,cb.nome,f.colaborador_id); });
    var ot='';
    ['CPF','RG','CTPS','PIS/NIS','Título de eleitor','Reservista','Comprovante de residência','ASO admissional','ASO periódico','ASO demissional','NR-06','NR-10','NR-11','NR-12','NR-18','NR-33','NR-35','CNH','Certificado / curso','Contrato de experiência','Termo de confidencialidade','Ficha de EPI','Outro']
      .forEach(function(x){ ot+=opt(x,x,f.tipo); });
    var i=grid(
       sel('rhd-colab','Colaborador *',oc)
      +sel('rhd-tipo','Documento *','<option value="">— selecione —</option>'+ot)
      +sel('rhd-cat','Categoria','<option value="">—</option>'+opt('Pessoal','Pessoal',f.categoria)+opt('Trabalhista','Trabalhista',f.categoria)+opt('Saúde','Saúde ocupacional',f.categoria)+opt('Treinamento','Treinamento / NR',f.categoria)+opt('Interno','Interno',f.categoria))
      +inp('rhd-num','Número',f.numero)
      +inp('rhd-emissao','Emissão',f.emissao,'','date')
      +inp('rhd-validade','Validade',f.validade,'','date')
      +inp('rhd-entregue','Entregue em',f.entregue_em,'','date')
      +inp('rhd-url','Link do arquivo',f.arquivo_url,'Drive, etc.')
      +txt('rhd-obs','Observação',f.observacao,2)
    );
    return box(f.id?'Editar documento':'Novo documento',i);
  }

  /* ═══════════════ GERAÇÃO DE DOCUMENTOS ═══════════════ */
  function gerar(d,modelo){
    var selEl=document.getElementById('rh-mod-colab');
    var id=selEl?selEl.value:'';
    if(!id){ alert('Selecione o colaborador primeiro.'); return; }
    var cb=colabDe(d,id);
    if(!cb){ alert('Colaborador não encontrado.'); return; }
    var cg=cargoDe(d,cb.cargo_id), C=cfg(), corpo='';
    if(modelo==='contrato')      corpo=docContrato(cb,cg,C);
    else if(modelo==='checklist')corpo=docChecklist(cb,C);
    else if(modelo==='epi')      corpo=docEPI(cb,C);
    else if(modelo==='sigilo')   corpo=docSigilo(cb,C);
    else if(modelo==='cargo')    corpo=docCargo(cb,cg,C);
    abrirImpressao(corpo);
  }

  function abrirImpressao(html){
    var w=window.open('','_blank');
    if(!w){ alert('O navegador bloqueou a janela. Libere pop-ups para este site.'); return; }
    w.document.open();
    w.document.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">'
      +'<title>Sul Sign — documento</title><style>'
      +'@page{size:A4;margin:20mm 18mm}'
      +'body{font-family:Georgia,"Times New Roman",serif;font-size:11.5pt;line-height:1.65;color:#111;max-width:180mm;margin:0 auto;padding:16px}'
      +'h1{font-size:15pt;text-align:center;letter-spacing:.5px;margin-bottom:4px;text-transform:uppercase}'
      +'h2{font-size:11.5pt;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #999;padding-bottom:3px}'
      +'p{margin:8px 0;text-align:justify}'
      +'table{width:100%;border-collapse:collapse;margin:10px 0;font-size:10.5pt}'
      +'td,th{border:1px solid #999;padding:6px 8px;text-align:left;vertical-align:top}'
      +'th{background:#eee}'
      +'.cab{text-align:center;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:16px}'
      +'.cab b{font-size:13pt;letter-spacing:1px}'
      +'.cab span{display:block;font-size:9.5pt;color:#444}'
      +'.ass{margin-top:44px;display:flex;gap:28px}'
      +'.ass div{flex:1;border-top:1px solid #111;padding-top:5px;font-size:9.5pt;text-align:center}'
      +'ol,ul{margin:8px 0 8px 20px}li{margin:4px 0}'
      +'.nota{font-size:9pt;color:#555;border-top:1px solid #ccc;margin-top:26px;padding-top:7px}'
      +'@media print{.noprint{display:none}}'
      +'</style></head><body>'
      +'<div class="noprint" style="text-align:right;margin-bottom:10px;font-family:sans-serif">'
      +'<button onclick="window.print()" style="padding:7px 16px;font-size:13px;cursor:pointer">Imprimir / Salvar PDF</button></div>'
      +html+'</body></html>');
    w.document.close();
  }

  function cabecalho(C,titulo){
    return '<div class="cab"><b>'+ph(C.razao,'RAZÃO SOCIAL')+'</b>'
      +'<span>CNPJ '+ph(C.cnpj,'CNPJ')+' — '+ph(C.endereco,'ENDEREÇO')+'</span></div>'
      +'<h1>'+esc(titulo)+'</h1>';
  }
  function nomeCargo(cb,cg){ return cg?cg.titulo:(cb.funcao||null); }
  function rodape(){
    return '<div class="nota">Documento gerado pelo SulSign OS a partir do cadastro de RH. '
      +'Campos em vermelho estão pendentes de preenchimento. '
      +'Nenhum documento deve ser assinado sem revisão da contabilidade e de advogado trabalhista.</div>';
  }
  function assinaturas(C,cb){
    return '<div class="ass"><div>'+ph(C.razao,'EMPRESA')+'<br>'+ph(C.rep,'REPRESENTANTE LEGAL')+'</div>'
      +'<div>'+esc(cb.nome)+'<br>CPF '+ph(cb.cpf,'CPF')+'</div></div>';
  }
  function localData(){
    var m=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    var d=new Date();
    return '<p style="margin-top:26px;text-align:right">Rio de Janeiro, '+d.getDate()+' de '+m[d.getMonth()]+' de '+d.getFullYear()+'.</p>';
  }

  function docContrato(cb,cg,C){
    var h=cabecalho(C,'Contrato individual de trabalho por prazo determinado — experiência');
    h+='<p><b>EMPREGADOR:</b> '+ph(C.razao,'RAZÃO SOCIAL')+', inscrita no CNPJ sob o nº '+ph(C.cnpj,'CNPJ')
      +', com sede em '+ph(C.endereco,'ENDEREÇO')+', neste ato representada por '+ph(C.rep,'REPRESENTANTE LEGAL')+'.</p>';
    h+='<p><b>EMPREGADO:</b> '+esc(cb.nome)+', portador do CPF nº '+ph(cb.cpf,'CPF')+', RG nº '+ph(cb.rg,'RG')
      +', PIS/NIS nº '+ph(cb.pis_nis,'PIS')+', residente em '+ph([cb.endereco,cb.numero,cb.bairro,cb.cidade,cb.uf].filter(function(x){return x;}).join(', '),'ENDEREÇO')+'.</p>';
    h+='<h2>Cláusula 1 — Função</h2><p>O empregado exercerá a função de <b>'+ph(nomeCargo(cb,cg),'CARGO')+'</b>'
      +', CBO '+ph(cg&&cg.cbo,'CBO')+', comprometendo-se a executar as atribuições próprias do cargo e outras compatíveis com sua condição pessoal.</p>';
    h+='<h2>Cláusula 2 — Prazo</h2><p>O presente contrato é celebrado a título de experiência, com prazo de <b>45 (quarenta e cinco) dias</b>, iniciando-se em '
      +ph(cb.data_admissao&&dt(cb.data_admissao),'DATA DE ADMISSÃO')+'.</p>';
    h+='<p><b>Parágrafo único.</b> Nos termos do art. 445, parágrafo único, da CLT, o contrato poderá ser prorrogado uma única vez por mais 45 (quarenta e cinco) dias, '
      +'totalizando 90 (noventa) dias, mediante termo aditivo. Findo o prazo sem denúncia de qualquer das partes, o contrato passa a vigorar por prazo indeterminado.</p>';
    h+='<h2>Cláusula 3 — Remuneração</h2><p>O empregado perceberá o salário mensal de <b>'
      +ph(cb.salario!=null?fmt(cb.salario):null,'SALÁRIO')+'</b>, pago até o 5º dia útil do mês subsequente ao trabalhado.</p>';
    h+='<p>Benefícios previstos na convenção coletiva '+ph(C.cct,'CCT APLICÁVEL')+': vale-transporte '+ph(C.vt,'VT')
      +', vale-refeição '+ph(C.vr,'VR')+', vale-alimentação '+ph(C.va,'VA')+'. Piso da categoria: '+ph(C.piso,'PISO')+'.</p>';
    h+='<h2>Cláusula 4 — Jornada</h2><p>A jornada será de '+ph(cb.jornada||C.jornada,'JORNADA')
      +', respeitados os limites do art. 7º, XIII, da Constituição Federal e as disposições da convenção coletiva aplicável.</p>';
    h+='<h2>Cláusula 5 — Local de trabalho e atividades externas</h2>'
      +'<p>O empregado prestará serviços na sede da empresa e, quando necessário, em locais externos de montagem e instalação, inclusive em eventos, '
      +'comprometendo-se a observar integralmente as normas de segurança do trabalho e a utilizar os equipamentos de proteção individual fornecidos.</p>';
    h+='<h2>Cláusula 6 — Segurança do trabalho</h2><p>As atividades poderão envolver trabalho em altura e operação de máquinas. '
      +'O empregado declara ter recebido os treinamentos obrigatórios ('+ph(C.nrs,'NRs OBRIGATÓRIAS')+') e estar apto conforme ASO admissional.</p>';
    h+='<h2>Cláusula 7 — Rescisão antecipada</h2><p>A rescisão antecipada por qualquer das partes observará o disposto nos arts. 479 e 480 da CLT.</p>';
    h+=localData()+assinaturas(C,cb);
    h+='<div class="ass" style="margin-top:34px"><div>Testemunha 1 — CPF</div><div>Testemunha 2 — CPF</div></div>';
    h+=rodape();
    return h;
  }

  function docChecklist(cb,C){
    var h=cabecalho(C,'Checklist de admissão');
    h+='<p><b>Colaborador:</b> '+esc(cb.nome)+' &nbsp;·&nbsp; <b>Admissão prevista:</b> '+ph(cb.data_admissao&&dt(cb.data_admissao),'DATA')+'</p>';
    var linhas=[
      ['D-7','Definir cargo no plano, salário e jornada','RH'],
      ['D-7','Confirmar CCT, piso e benefícios com a contabilidade','Contabilidade'],
      ['D-5','Solicitar documentos pessoais (CPF, RG, CTPS digital, PIS, título, reservista, comprovante de residência, foto)','Colaborador'],
      ['D-5','Solicitar dados bancários e tamanhos de uniforme e calçado','Colaborador'],
      ['D-3','Agendar e realizar o ASO admissional','RH'],
      ['D-2','Enviar ficha completa e ASO à contabilidade','RH'],
      ['D-1','Registro no eSocial (obrigatório ANTES do início das atividades)','Contabilidade'],
      ['D-1','Emitir contrato de experiência 45+45 e termo de confidencialidade','RH'],
      ['D-0','Colher assinaturas do contrato e do termo','RH'],
      ['D-0','Entregar EPI e colher assinatura na ficha própria','Segurança'],
      ['D-0','Entregar uniforme e crachá','Almoxarifado'],
      ['D-0','Integração: normas internas, segurança, rotina e organograma','Liderança'],
      ['D+5','Lançar documentos no módulo RH com validade preenchida','RH'],
      ['D+30','Treinamentos obrigatórios ('+(C.nrs||'NRs')+') realizados e certificados anexados','Segurança'],
      ['D+45','Avaliação do 1º período de experiência — decidir prorrogação','Liderança'],
      ['D+90','Avaliação final — efetivar ou encerrar','Liderança']
    ];
    h+='<table><tr><th style="width:52px">Prazo</th><th>Ação</th><th style="width:110px">Responsável</th><th style="width:38px">OK</th></tr>';
    linhas.forEach(function(l){ h+='<tr><td><b>'+l[0]+'</b></td><td>'+esc(l[1])+'</td><td>'+esc(l[2])+'</td><td></td></tr>'; });
    h+='</table>';
    h+='<p style="font-size:10pt"><b>Atenção:</b> o registro no eSocial deve ocorrer até o dia anterior ao início das atividades. '
      +'O ASO admissional deve ser anterior à data de admissão. Iniciar o trabalho sem estes dois itens expõe a empresa a autuação.</p>';
    h+=rodape();
    return h;
  }

  function docEPI(cb,C){
    var h=cabecalho(C,'Ficha de controle de entrega de EPI');
    h+='<p><b>Colaborador:</b> '+esc(cb.nome)+' &nbsp;·&nbsp; <b>CPF:</b> '+ph(cb.cpf,'CPF')
      +' &nbsp;·&nbsp; <b>Função:</b> '+ph(cb.funcao,'FUNÇÃO')
      +' &nbsp;·&nbsp; <b>Calçado:</b> '+ph(cb.tam_calcado,'Nº')+'</p>';
    h+='<p style="font-size:10.5pt">Declaro ter recebido gratuitamente os equipamentos de proteção individual abaixo relacionados, '
      +'com orientação quanto ao uso, guarda e conservação, nos termos da NR-06, comprometendo-me a utilizá-los durante toda a jornada '
      +'e a comunicar qualquer dano ou extravio.</p>';
    h+='<table><tr><th>Data</th><th>EPI</th><th>CA</th><th>Qtd</th><th>Assinatura do recebimento</th><th>Devolução</th></tr>';
    var i; for(i=0;i<12;i++) h+='<tr><td style="height:26px"></td><td></td><td></td><td></td><td></td><td></td></tr>';
    h+='</table>';
    h+='<p style="font-size:10pt">EPIs habituais da operação: calçado de segurança, luva de proteção, óculos de segurança, protetor auricular, '
      +'máscara para pintura e solventes, capacete com jugular e cinto tipo paraquedista com talabarte duplo para trabalho em altura (NR-35).</p>';
    h+=localData()+assinaturas(C,cb)+rodape();
    return h;
  }

  function docSigilo(cb,C){
    var h=cabecalho(C,'Termo de confidencialidade e autorização de uso de imagem');
    h+='<p>Por este instrumento, <b>'+esc(cb.nome)+'</b>, portador do CPF nº '+ph(cb.cpf,'CPF')
      +', na qualidade de colaborador de '+ph(C.razao,'RAZÃO SOCIAL')+', CNPJ '+ph(C.cnpj,'CNPJ')+', declara e se compromete:</p>';
    h+='<h2>1. Confidencialidade</h2>'
      +'<p>A manter em absoluto sigilo todas as informações a que tiver acesso em razão de suas atividades, incluindo projetos, desenhos técnicos, '
      +'orçamentos, tabelas de custo, listas de clientes e fornecedores, processos produtivos, arquivos de arte e quaisquer dados de clientes da empresa, '
      +'não os divulgando, reproduzindo ou utilizando para fins alheios ao trabalho, durante a vigência do contrato e após seu término.</p>';
    h+='<h2>2. Projetos de clientes</h2>'
      +'<p>A não divulgar, publicar ou compartilhar imagens, vídeos ou informações de eventos e projetos de clientes antes da respectiva estreia pública, '
      +'reconhecendo que a violação pode gerar responsabilização da empresa perante terceiros.</p>';
    h+='<h2>3. Propriedade intelectual</h2>'
      +'<p>Que os trabalhos, projetos e criações desenvolvidos no exercício da função pertencem à empresa, nos termos da legislação aplicável.</p>';
    h+='<h2>4. Uso de imagem</h2>'
      +'<p>Autoriza o uso de sua imagem em fotografias e vídeos captados durante as atividades, para fins de portfólio, redes sociais e material institucional '
      +'da empresa, sem ônus e por prazo indeterminado. Esta autorização pode ser revogada por escrito a qualquer tempo.</p>';
    h+='<p style="font-size:10pt">O descumprimento do dever de sigilo poderá caracterizar falta grave, sem prejuízo da responsabilização civil pelos danos causados.</p>';
    h+=localData()+assinaturas(C,cb)+rodape();
    return h;
  }

  function docCargo(cb,cg,C){
    var h=cabecalho(C,'Descrição de cargo');
    if(!cg) return h+'<p style="color:#c00"><b>Este colaborador não tem cargo vinculado ao plano.</b> Abra a ficha na aba Equipe, selecione o cargo e gere novamente.</p>'+rodape();
    h+='<table>'
      +'<tr><th style="width:150px">Cargo</th><td><b>'+esc(cg.titulo)+'</b></td></tr>'
      +'<tr><th>Área</th><td>'+ph(cg.area,'ÁREA')+'</td></tr>'
      +'<tr><th>Nível</th><td>'+ph(cg.nivel,'NÍVEL')+'</td></tr>'
      +'<tr><th>CBO</th><td>'+ph(cg.cbo,'CBO')+'</td></tr>'
      +'<tr><th>Faixa salarial</th><td>'+(cg.faixa_min!=null?fmt(cg.faixa_min):'<span style="color:#c00;font-weight:700">[MÍNIMO]</span>')
        +' a '+(cg.faixa_max!=null?fmt(cg.faixa_max):'<span style="color:#c00;font-weight:700">[MÁXIMO]</span>')+'</td></tr>'
      +'<tr><th>Piso da categoria</th><td>'+ph(cg.piso_categoria!=null?fmt(cg.piso_categoria):(C.piso||null),'PISO CCT')+'</td></tr>'
      +'<tr><th>Jornada</th><td>'+ph(C.jornada,'JORNADA')+'</td></tr>'
      +'<tr><th>Ocupante</th><td>'+esc(cb.nome)+'</td></tr>'
      +'</table>';
    h+='<h2>Requisitos</h2><p>'+ph(cg.requisitos,'REQUISITOS NÃO PREENCHIDOS')+'</p>';
    h+='<h2>Responsabilidades</h2><p>'+ph(cg.responsabilidades,'RESPONSABILIDADES NÃO PREENCHIDAS')+'</p>';
    h+='<h2>Segurança do trabalho</h2><p>Treinamentos obrigatórios: '+ph(C.nrs,'NRs')
      +'. O ocupante deve manter os certificados válidos e registrados no módulo de RH.</p>';
    h+='<h2>Progressão</h2>';
    if(cg.progride_para){
      var prox=null,i,cache=SS20.cache.rh;
      if(cache){ for(i=0;i<cache.cargos.length;i++){ if(String(cache.cargos[i].id)===String(cg.progride_para)) prox=cache.cargos[i]; } }
      h+='<p>Próximo passo na carreira: <b>'+esc(prox?prox.titulo:'—')+'</b>. '
        +'A promoção depende do cumprimento dos requisitos do nível seguinte e de avaliação formal da liderança.</p>';
    } else {
      h+='<p>Progressão não definida no plano de cargos.</p>';
    }
    h+='<p style="font-size:10pt">Declaro ter recebido e compreendido a descrição das atribuições do meu cargo.</p>';
    h+=localData()+assinaturas(C,cb)+rodape();
    return h;
  }

  SS20.modules.rh={render:render};
})();
