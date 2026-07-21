/* ═══ SULSIGN OS 2.0 — MÓDULO: FECHAMENTO PDVEX (fpdv)
   Port fiel do Fechamento_PDVEX.html (v1).
   Gera o xlsx de apuração no formato PDVEX a partir dos lançamentos
   do job. Não altera nenhum dado. ═══ */
(function(){
  var fmt=SulSignCore.fmt;
  var TREINO='SS-TREINO-2026_06-99';
  var XLSX_CDN='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  var jobsCache=[], jobAtual=null, dadosFechamento=null;
  var ORDEM=['MO FREE','MO FREE CAMPO','MO FIXO','MO FIXO CAMPO','MO 3º','MATERIAIS','COM. VISUAL','LOGÍSTICA','ALIMENTAÇÃO'];

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  /* ── helpers de data / semana (idênticos ao v1) ── */
  function parseData(s){
    if(!s) return null;
    var p=String(s).slice(0,10).split('-');
    if(p.length!==3) return null;
    return new Date(parseInt(p[0],10), parseInt(p[1],10)-1, parseInt(p[2],10));
  }
  function pad2(n){ return (n<10?'0':'')+n; }
  function semanaLabel(d){
    if(!d) return 'SEM DATA';
    var dow=d.getDay();
    var offset=(dow===0)?6:(dow-1);
    var ini=new Date(d.getFullYear(), d.getMonth(), d.getDate()-offset);
    var fim=new Date(ini.getFullYear(), ini.getMonth(), ini.getDate()+6);
    return pad2(ini.getDate())+'/'+pad2(ini.getMonth()+1)+' a '+pad2(fim.getDate())+'/'+pad2(fim.getMonth()+1)+'/'+fim.getFullYear();
  }
  function dataBR(s){
    var d=parseData(s);
    if(!d) return '';
    return pad2(d.getDate())+'/'+pad2(d.getMonth()+1)+'/'+d.getFullYear();
  }

  /* ── classificação (idêntica ao v1) ── */
  function classifica(ln){
    var cat=(ln.categoria||'').trim();
    var tipo=(ln.tipo_mo||'').toLowerCase();
    var loc=(ln.local_mo||'galpao').toLowerCase();
    var ehCampo=(loc==='campo'||loc==='evento');
    if(cat==='Mão de Obra'){
      if(tipo==='free') return ehCampo?'MO FREE CAMPO':'MO FREE';
      if(tipo==='fixo') return ehCampo?'MO FIXO CAMPO':'MO FIXO';
      return 'MO 3º';
    }
    if(cat==='Serviços') return 'MO 3º';
    if(cat==='Material'||cat==='Materiais'||cat==='Insumo'||cat==='Locação'||cat==='Verba Produção'||cat==='Ferramenta'||cat==='Imprevisto') return 'MATERIAIS';
    if(cat==='Comunicação Visual') return 'COM. VISUAL';
    if(cat==='Logística'||cat==='Transporte') return 'LOGÍSTICA';
    if(cat==='Alimentação') return 'ALIMENTAÇÃO';
    return null;
  }
  function somaValores(lista){
    var s=0,i;
    for(i=0;i<lista.length;i++){ s+=parseFloat(lista[i].valor)||0; }
    return s;
  }
  function montaDescritivo(ln){
    var partes=[];
    if(ln.fornecedor) partes.push(ln.fornecedor);
    if(ln.descricao) partes.push(ln.descricao);
    if(partes.length===0 && ln.pessoa) partes.push(ln.pessoa);
    return partes.join(' — ');
  }
  function montaObs(ln){
    var partes=[];
    if(ln.bloco) partes.push('Bloco: '+ln.bloco);
    if(ln.categoria==='Locação') partes.push('locação PDVEX');
    if(ln.categoria==='Serviços') partes.push('Serviços');
    if(ln.categoria==='Verba Produção') partes.push('Verba Produção');
    if(ln.tem_nota===false) partes.push('sem nota');
    return partes.join(' | ');
  }

  /* ── SheetJS lazy-load ── */
  function ensureXLSX(cb, cbErr){
    if(window.XLSX){ cb(); return; }
    var s=document.createElement('script');
    s.src=XLSX_CDN;
    s.onload=function(){ if(window.XLSX) cb(); else cbErr('SheetJS carregou mas XLSX não está disponível.'); };
    s.onerror=function(){ cbErr('Não foi possível carregar a biblioteca de planilhas. Verifique a conexão e tente de novo.'); };
    document.body.appendChild(s);
  }

  function mostraErro(msg){
    var el=document.getElementById('fpdv-erro');
    if(el){ el.textContent=msg; el.style.display='block'; }
  }
  function limpaErro(){
    var el=document.getElementById('fpdv-erro');
    if(el) el.style.display='none';
  }

  /* ── render ── */
  function render(c){
    jobAtual=null; dadosFechamento=null;
    c.innerHTML=''
      +'<div style="max-width:760px">'
      +'<div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut);margin-bottom:4px">Fechamento PDVEX</div>'
      +'<div style="font-size:12.5px;color:var(--mut);margin-bottom:16px">Gera o xlsx de apuração no formato PDVEX a partir dos lançamentos do job. Não altera nenhum dado.</div>'
      +'<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:18px;margin-bottom:14px">'
      +'  <label style="font-size:10.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--mut)">Job</label>'
      +'  <select id="fpdv-sel-job" style="display:block;width:100%;margin:8px 0 12px;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:inherit;font-size:14px"><option value="">Carregando jobs…</option></select>'
      +'  <button data-action="fpdv-carregar" id="fpdv-btn-carregar" disabled style="width:100%;padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:inherit;font-size:14px;font-weight:700;cursor:pointer">Carregar lançamentos</button>'
      +'  <div id="fpdv-erro" style="display:none;margin-top:10px;font-size:12.5px;color:#e5484d"></div>'
      +'</div>'
      +'<div id="fpdv-preview" style="display:none">'
      +'  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:18px;margin-bottom:14px">'
      +'    <div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut);margin-bottom:10px">Resumo por aba</div>'
      +'    <table id="fpdv-tbl-resumo" style="width:100%;border-collapse:collapse;font-size:12.5px"></table>'
      +'    <div id="fpdv-warn-nm" style="display:none;margin-top:10px;font-size:12px;color:#f5a524"></div>'
      +'    <div id="fpdv-warn-sd" style="display:none;margin-top:6px;font-size:12px;color:#f5a524"></div>'
      +'  </div>'
      +'  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:18px;margin-bottom:14px">'
      +'    <div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut);margin-bottom:10px">Resultado (metodologia PDVEX)</div>'
      +'    <div id="fpdv-res"></div>'
      +'  </div>'
      +'  <button data-action="fpdv-exportar" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:inherit;font-size:14px;font-weight:700;cursor:pointer">⬇ Gerar xlsx no formato PDVEX</button>'
      +'  <div id="fpdv-ok" style="display:none;margin-top:10px;font-size:12.5px;color:#30a46c"></div>'
      +'</div>'
      +'<style>#fpdv-tbl-resumo th{text-align:left;padding:4px 6px;font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:var(--mut);border-bottom:1px solid var(--line)}#fpdv-tbl-resumo td{padding:6px;border-bottom:1px solid var(--line)}#fpdv-tbl-resumo td.num{text-align:right;font-variant-numeric:tabular-nums}#fpdv-tbl-resumo tr.tot td{font-weight:800;border-bottom:none}#fpdv-res .res-line{display:flex;justify-content:space-between;padding:5px 0;font-size:13px;border-bottom:1px solid var(--line)}#fpdv-res .res-line:last-child{border-bottom:none}#fpdv-res .res-lucro b{color:#30a46c}#fpdv-res .res-lucro.res-neg b{color:#e5484d}</style>'
      +'</div>';
    carregarJobs();
    ensureXLSX(function(){}, function(){}); /* pré-carrega em background; erro tratado no export */
  }

  function carregarJobs(){
    SS20.sb('orcamentos?select=numero,cliente,projeto,status,valor_nf,nf_numero&order=numero.desc')
    .then(function(rows){
      jobsCache=rows||[];
      var sel=document.getElementById('fpdv-sel-job');
      if(!sel) return;
      var html='<option value="">Selecione o job...</option>';
      var i;
      for(i=0;i<jobsCache.length;i++){
        var j=jobsCache[i];
        if(j.numero===TREINO) continue;
        html+='<option value="'+esc(j.numero)+'">'+esc(j.numero)+' — '+esc(j.cliente||'')+' — '+esc(j.projeto||'')+'</option>';
      }
      sel.innerHTML=html;
      var btn=document.getElementById('fpdv-btn-carregar');
      if(btn) btn.disabled=false;
    }).catch(function(e){ mostraErro('Erro ao carregar jobs: '+e.message); });
  }

  function carregarLancamentos(){
    var sel=document.getElementById('fpdv-sel-job');
    var num=sel?sel.value:'';
    if(!num){ mostraErro('Selecione um job.'); return; }
    limpaErro();
    var btn=document.getElementById('fpdv-btn-carregar');
    btn.disabled=true; btn.textContent='Carregando...';
    jobAtual=null;
    var i;
    for(i=0;i<jobsCache.length;i++){ if(jobsCache[i].numero===num){ jobAtual=jobsCache[i]; break; } }
    SS20.sb('lancamentos?select=*&orcamento_numero=eq.'+encodeURIComponent(num)+'&deletado_em=is.null&order=data.asc')
    .then(function(rows){
      montarFechamento(rows||[]);
      btn.disabled=false; btn.textContent='Carregar lançamentos';
    }).catch(function(e){
      mostraErro('Erro: '+e.message);
      btn.disabled=false; btn.textContent='Carregar lançamentos';
    });
  }

  function montarFechamento(rows){
    var abas={
      'MO FREE':[], 'MO FREE CAMPO':[], 'MO FIXO':[], 'MO FIXO CAMPO':[],
      'MO 3º':[], 'MATERIAIS':[], 'COM. VISUAL':[], 'LOGÍSTICA':[], 'ALIMENTAÇÃO':[]
    };
    var foraFechamento=[];
    var moSemDetalhe=0;
    var i;
    for(i=0;i<rows.length;i++){
      var ln=rows[i];
      var v=parseFloat(ln.valor)||0;
      var aba=classifica(ln);
      if(!aba){ foraFechamento.push(ln); continue; }
      if(aba.indexOf('MO F')===0 && !(parseFloat(ln.diarias)>0)) moSemDetalhe++;
      abas[aba].push(ln);
    }
    dadosFechamento={ abas:abas, fora:foraFechamento };

    var html='<tr><th>Aba</th><th style="text-align:right">Lanç.</th><th style="text-align:right">Total</th></tr>';
    var totalGastos=0;
    for(i=0;i<ORDEM.length;i++){
      var lista=abas[ORDEM[i]];
      var t=somaValores(lista);
      totalGastos+=t;
      html+='<tr><td>'+ORDEM[i]+'</td><td class="num">'+lista.length+'</td><td class="num">'+fmt(t)+'</td></tr>';
    }
    html+='<tr class="tot"><td>TOTAL DE GASTOS</td><td></td><td class="num">'+fmt(totalGastos)+'</td></tr>';
    document.getElementById('fpdv-tbl-resumo').innerHTML=html;

    var wNM=document.getElementById('fpdv-warn-nm');
    if(foraFechamento.length>0){
      var soma=somaValores(foraFechamento);
      wNM.innerHTML='⚠ '+foraFechamento.length+' lançamento(s) fora do fechamento PDVEX ('+fmt(soma)+') — categorias Imposto, Comissão, Receita, Estorno ou Outros. Eles não entram no xlsx.';
      wNM.style.display='block';
    } else wNM.style.display='none';

    var wSD=document.getElementById('fpdv-warn-sd');
    if(moSemDetalhe>0){
      wSD.innerHTML='⚠ '+moSemDetalhe+' lançamento(s) de MO free/fixo sem diárias/valor de diária preenchidos. Vão para o xlsx apenas com o valor total — preencha os campos no Lançamentos para o detalhamento completo.';
      wSD.style.display='block';
    } else wSD.style.display='none';

    var valorNF=parseFloat(jobAtual && jobAtual.valor_nf)||0;
    var imposto=valorNF*0.18;
    var bruto=valorNF-imposto;
    var infra=bruto*0.3;
    var lucro=bruto-totalGastos-infra;
    var cls=(lucro>=0)?'res-lucro':'res-lucro res-neg';
    document.getElementById('fpdv-res').innerHTML=
      '<div class="res-line"><span>Valor NF'+(jobAtual&&jobAtual.nf_numero?(' (NF '+esc(jobAtual.nf_numero)+')'):'')+'</span><b>'+fmt(valorNF)+'</b></div>'
      +'<div class="res-line"><span>Impostos (18%)</span><b>'+fmt(imposto)+'</b></div>'
      +'<div class="res-line"><span>Valor Bruto</span><b>'+fmt(bruto)+'</b></div>'
      +'<div class="res-line"><span>Infra 30%</span><b>'+fmt(infra)+'</b></div>'
      +'<div class="res-line"><span>Total de Gastos</span><b>'+fmt(totalGastos)+'</b></div>'
      +'<div class="res-line '+cls+'"><span>Lucro Líquido (PDVEX)</span><b>'+fmt(lucro)+'</b></div>';

    document.getElementById('fpdv-preview').style.display='block';
    var ok=document.getElementById('fpdv-ok');
    if(ok) ok.style.display='none';
  }

  /* ═══ EXPORT XLSX (idêntico ao v1) ═══ */
  function exportarXlsx(){
    if(!dadosFechamento || !jobAtual) return;
    ensureXLSX(function(){
      var wb=XLSX.utils.book_new();
      var abas=dadosFechamento.abas;
      var refs={};
      refs['MO FREE']       = abaMoFree(wb,'MO FREE','GALPÕES',abas['MO FREE']);
      refs['MO FREE CAMPO'] = abaMoFree(wb,'MO FREE CAMPO','CAMPO',abas['MO FREE CAMPO']);
      refs['MO FIXO']       = abaMoFixo(wb,'MO FIXO','GALPÕES',abas['MO FIXO']);
      refs['MO FIXO CAMPO'] = abaMoFixo(wb,'MO FIXO CAMPO','CAMPO',abas['MO FIXO CAMPO']);
      refs['MO 3º']         = abaSimples(wb,'MO 3º',abas['MO 3º'],false);
      refs['MATERIAIS']     = abaSimples(wb,'MATERIAIS',abas['MATERIAIS'],true);
      refs['COM. VISUAL']   = abaSimples(wb,'COM. VISUAL',abas['COM. VISUAL'],false);
      refs['LOGÍSTICA']     = abaSimples(wb,'LOGÍSTICA',abas['LOGÍSTICA'],false);
      refs['ALIMENTAÇÃO']   = abaSimples(wb,'ALIMENTAÇÃO',abas['ALIMENTAÇÃO'],false);
      abaResultados(wb, refs);
      var nomeArq='Fechamento_PDVEX_'+jobAtual.numero.replace(/[^A-Za-z0-9_-]/g,'_')+'.xlsx';
      XLSX.writeFile(wb, nomeArq);
      var ok=document.getElementById('fpdv-ok');
      ok.textContent='✓ '+nomeArq+' gerado.';
      ok.style.display='block';
    }, function(msg){ mostraErro(msg); });
  }

  /* aba MO FREE: SEMANA | FUNÇÃO | DIARIAS | VLR DIÁRIA | VLR TOTAL | OBS */
  function abaMoFree(wb, nome, titulo, lista){
    var aoa=[];
    aoa.push([titulo]);
    aoa.push(['SEMANA','FUNÇÃO','DIARIAS','VLR DIÁRIA','VLR TOTAL','OBS']);
    var grupos={}, ordemSem=[], i;
    for(i=0;i<lista.length;i++){
      var ln=lista[i];
      var sem=semanaLabel(parseData(ln.data));
      if(!grupos[sem]){ grupos[sem]=[]; ordemSem.push(sem); }
      grupos[sem].push(ln);
    }
    var linhaExcel=3;
    var primeiraDado=linhaExcel, temDado=false;
    var ws_formulas=[];
    var s;
    for(s=0;s<ordemSem.length;s++){
      var sem2=ordemSem[s];
      var lns=grupos[sem2];
      for(i=0;i<lns.length;i++){
        var ln2=lns[i];
        var d=parseFloat(ln2.diarias)||0;
        var vd=parseFloat(ln2.valor_diaria)||0;
        var funcaoDesc=(ln2.funcao||ln2.pessoa||ln2.descricao||'').toUpperCase();
        var obs=montaObs(ln2);
        if(d>0 && vd>0){
          aoa.push([(i===0)?sem2:'', funcaoDesc, d, vd, null, obs]);
          ws_formulas.push({r:linhaExcel, f:'D'+linhaExcel+'*C'+linhaExcel});
        }else{
          aoa.push([(i===0)?sem2:'', funcaoDesc, '', '', parseFloat(ln2.valor)||0, obs||'valor consolidado']);
        }
        temDado=true;
        linhaExcel++;
      }
    }
    if(!temDado){ aoa.push(['','','','','','']); linhaExcel++; }
    var linhaTotal=linhaExcel;
    aoa.push(['TOTAL','','','',null,'']);
    var ws=XLSX.utils.aoa_to_sheet(aoa);
    for(i=0;i<ws_formulas.length;i++){
      ws['E'+ws_formulas[i].r]={t:'n', f:ws_formulas[i].f};
    }
    ws['E'+linhaTotal]={t:'n', f:'SUM(E'+primeiraDado+':E'+(linhaTotal-1)+')'};
    ws['!cols']=[{wch:20},{wch:28},{wch:9},{wch:11},{wch:12},{wch:26}];
    XLSX.utils.book_append_sheet(wb, ws, nome);
    return {aba:nome, cel:'E'+linhaTotal};
  }

  /* aba MO FIXO: DATA | DESCRITIVO | DIARIAS | HORA EXTRA (h) | VLR DIÁRIA | VLR TOTAL | TOTAL H.E. | OBS */
  function abaMoFixo(wb, nome, titulo, lista){
    var aoa=[];
    aoa.push([titulo]);
    aoa.push(['DATA','DESCRITIVO','DIARIAS','HORA EXTRA (h)','VLR DIÁRIA','VLR TOTAL','TOTAL H.E.','OBS']);
    var linhaExcel=3, primeiraDado=3, temDado=false, i;
    var formulas=[];
    for(i=0;i<lista.length;i++){
      var ln=lista[i];
      var d=parseFloat(ln.diarias)||0;
      var he=parseFloat(ln.horas_extras)||0;
      var vd=parseFloat(ln.valor_diaria)||0;
      var nomePessoa=(ln.pessoa||ln.funcao||ln.descricao||'').toUpperCase();
      if(d>0 && vd>0){
        aoa.push([dataBR(ln.data), nomePessoa, d, he, vd, null, null, montaObs(ln)]);
        formulas.push({r:linhaExcel, he:'D'+linhaExcel+'*E'+linhaExcel+'/8', tot:'E'+linhaExcel+'*C'+linhaExcel+'+G'+linhaExcel});
      }else{
        aoa.push([dataBR(ln.data), nomePessoa, '', '', '', parseFloat(ln.valor)||0, 0, montaObs(ln)||'valor consolidado']);
      }
      temDado=true; linhaExcel++;
    }
    if(!temDado){ aoa.push(['','','','','','','','']); linhaExcel++; }
    var linhaTotal=linhaExcel;
    aoa.push(['TOTAL','','','','',null,null,'']);
    var ws=XLSX.utils.aoa_to_sheet(aoa);
    for(i=0;i<formulas.length;i++){
      ws['G'+formulas[i].r]={t:'n', f:formulas[i].he};
      ws['F'+formulas[i].r]={t:'n', f:formulas[i].tot};
    }
    ws['F'+linhaTotal]={t:'n', f:'SUM(F'+primeiraDado+':F'+(linhaTotal-1)+')'};
    ws['G'+linhaTotal]={t:'n', f:'SUM(G'+primeiraDado+':G'+(linhaTotal-1)+')'};
    ws['!cols']=[{wch:12},{wch:28},{wch:9},{wch:13},{wch:11},{wch:12},{wch:11},{wch:26}];
    XLSX.utils.book_append_sheet(wb, ws, nome);
    return {aba:nome, cel:'F'+linhaTotal};
  }

  /* abas simples: DATA | DESCRITIVO | VALOR | (O.C.) | OBS */
  function abaSimples(wb, nome, lista, temOC){
    var aoa=[];
    var header=temOC?['DATA','DESCRITIVO','VALOR','O.C.','OBS']:['DATA','DESCRITIVO','VALOR','OBS'];
    aoa.push(header);
    var linhaExcel=2, primeiraDado=2, temDado=false, i;
    for(i=0;i<lista.length;i++){
      var ln=lista[i];
      var desc=montaDescritivo(ln);
      var v=parseFloat(ln.valor)||0;
      if(temOC) aoa.push([dataBR(ln.data), desc, v, ln.ordem_compra||ln.oc_numero||'', montaObs(ln)]);
      else      aoa.push([dataBR(ln.data), desc, v, montaObs(ln)]);
      temDado=true; linhaExcel++;
    }
    if(!temDado){ aoa.push(temOC?['','','','','']:['','','','']); linhaExcel++; }
    var linhaTotal=linhaExcel;
    aoa.push(temOC?['TOTAL','',null,'','']:['TOTAL','',null,'']);
    var ws=XLSX.utils.aoa_to_sheet(aoa);
    ws['C'+linhaTotal]={t:'n', f:'SUM(C'+primeiraDado+':C'+(linhaTotal-1)+')'};
    ws['!cols']=temOC?[{wch:12},{wch:36},{wch:12},{wch:10},{wch:26}]:[{wch:12},{wch:36},{wch:12},{wch:26}];
    XLSX.utils.book_append_sheet(wb, ws, nome);
    return {aba:nome, cel:'C'+linhaTotal};
  }

  /* aba RESULTADOS — replica exatamente a lógica da planilha PDVEX */
  function abaResultados(wb, refs){
    var aoa=[];
    aoa.push(['Valor NF', null]);
    aoa.push(['Impostos', null]);
    aoa.push(['Valor Bruto', null]);
    aoa.push(['Infra 30%', null]);
    aoa.push(['Total de Gastos', null]);
    aoa.push(['Lucro Líquido', null]);
    aoa.push([]);
    aoa.push(['NFS EMITIDAS']);
    aoa.push([]);
    var nfLabel='NF '+((jobAtual&&jobAtual.nf_numero)||'—')+' — '+((jobAtual&&jobAtual.numero)||'');
    aoa.push([nfLabel, parseFloat(jobAtual&&jobAtual.valor_nf)||0]);
    aoa.push([]);
    aoa.push(['RESUMO DOS GASTOS']);
    var i;
    for(i=0;i<ORDEM.length;i++){ aoa.push([ORDEM[i], null]); }
    var ws=XLSX.utils.aoa_to_sheet(aoa);
    ws['B1']={t:'n', f:'B10'};
    ws['B2']={t:'n', f:'B1*0.18'};
    ws['B3']={t:'n', f:'B1-B2'};
    ws['B4']={t:'n', f:'B3*0.3'};
    ws['B5']={t:'n', f:'SUM(B13:B21)'};
    ws['B6']={t:'n', f:'B3-B5-B4'};
    for(i=0;i<ORDEM.length;i++){
      var ref=refs[ORDEM[i]];
      ws['B'+(13+i)]={t:'n', f:"'"+ref.aba+"'!"+ref.cel};
    }
    ws['!cols']=[{wch:24},{wch:16}];
    XLSX.utils.book_append_sheet(wb, ws, 'RESULTADOS');
  }

  /* ── delegação (namespaced, registrada uma vez) ── */
  if(!window.__fpdvDeleg){
    window.__fpdvDeleg=true;
    document.addEventListener('click', function(e){
      var el=e.target;
      while(el && el!==document && !(el.getAttribute && el.getAttribute('data-action'))) el=el.parentNode;
      if(!el || el===document) return;
      var act=el.getAttribute('data-action');
      if(act==='fpdv-carregar') carregarLancamentos();
      else if(act==='fpdv-exportar') exportarXlsx();
    });
  }

  SS20.modules.fpdv={render:render};
})();
