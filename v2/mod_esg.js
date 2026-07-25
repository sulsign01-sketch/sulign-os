/* ═══════════════════════════════════════════════════════════════
   SULSIGN OS 2.0 — MÓDULO: ESG & SUSTENTABILIDADE (esg)
   Triple Bottom Line (Ambiental / Social / Governança) ancorado na
   ABNT NBR ISO 20121 (sustentabilidade de eventos) e no GHG Protocol
   (Escopos 1/2/3, linguagem do IFRS S2/ISSB).
   Abas: Painel · Diagnóstico · Indicadores · Iniciativas.
   Requer tabelas: esg_diagnostico, esg_indicadores, esg_iniciativas
   (SQL: schema_esg.sql). Não é greenwashing — mede o que a Sul Sign
   realmente move: reuso de estruturas, resíduo, GEE, segurança,
   governança de dados e fornecedores.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  var st={ vista:'painel', pilar:'', periodo:'', aberto:null };

  /* ── pilares ── */
  var PILAR={
    A:{ nome:'Ambiental',   cor:'var(--ok)',     soft:'var(--ok-soft)',     ic:'🌱' },
    S:{ nome:'Social',      cor:'var(--blue)',   soft:'var(--blue-soft)',   ic:'🤝' },
    G:{ nome:'Governança',  cor:'var(--accent)', soft:'var(--accent-soft)', ic:'⚖️' }
  };
  var NIVEIS=['Inexistente','Inicial','Em prática','Consolidado'];
  var CNIVEL=['var(--danger)','var(--warn)','var(--blue)','var(--ok)'];
  var STATS =['Planejada','Em andamento','Pausada','Concluída'];
  var CSTAT ={ 'Planejada':['var(--mut)','var(--paper)'], 'Em andamento':['var(--blue)','var(--blue-soft)'],
    'Pausada':['var(--warn)','var(--warn-soft)'], 'Concluída':['var(--ok)','var(--ok-soft)'] };

  /* ── diagnóstico de maturidade (ISO 20121 + ESG), itens reais da Sul Sign ── */
  var DIAG=[
    { k:'A1', p:'A', t:'Reaproveitamento de estruturas', d:'Treliças, praticáveis e tapadeiras retornam ao estoque e são reutilizadas entre jobs, com controle do que volta vs. o que é descartado.' },
    { k:'A2', p:'A', t:'Destinação de resíduos de produção', d:'Sobras (MDF, compensado, lona, vinil, ACM, metalon) são segregadas e destinadas a reciclagem/reuso/doação em vez de aterro.' },
    { k:'A3', p:'A', t:'Inventário de emissões (GEE)', d:'Há medição de energia das máquinas (Roland, CNC, laser, câmara), combustível de veículos e solventes/tintas — Escopos 1 e 2.' },
    { k:'A4', p:'A', t:'Materiais de menor impacto', d:'Priorização de insumos recicláveis, de base renovável ou de fornecedores com prática ambiental declarada.' },
    { k:'A5', p:'A', t:'Consumo de energia e água', d:'Consumo é acompanhado e há metas ou ações de redução na produção.' },
    { k:'S1', p:'S', t:'Segurança do trabalho', d:'EPIs, registro de quase-acidentes e acidentes, e treinamentos de segurança para equipe e montagem.' },
    { k:'S2', p:'S', t:'Condições justas de trabalho', d:'Diárias e pagamentos em dia, formalização adequada de equipe e freelancers.' },
    { k:'S3', p:'S', t:'Compras e mão de obra locais', d:'Preferência por fornecedores e trabalhadores da região, fortalecendo a economia local.' },
    { k:'S4', p:'S', t:'Diversidade e inclusão', d:'A equipe e as contratações consideram diversidade e igualdade de oportunidades.' },
    { k:'S5', p:'S', t:'Relação com a comunidade', d:'Doação de sobras/materiais ou ações com a comunidade do entorno.' },
    { k:'G1', p:'G', t:'Controles financeiros e transparência', d:'Sistema de gestão com centro de custo, conciliação e rastreabilidade de decisões.' },
    { k:'G2', p:'G', t:'Segurança e privacidade de dados', d:'Adequação à LGPD e controle de acesso aos dados do sistema (RLS, contas por usuário).' },
    { k:'G3', p:'G', t:'Homologação de fornecedores', d:'Fornecedores avaliados por critérios (qualidade, documentação regular, prática socioambiental).' },
    { k:'G4', p:'G', t:'Contratos e conformidade legal', d:'Contratos formais com clientes e fornecedores; obrigações fiscais e trabalhistas em dia.' },
    { k:'G5', p:'G', t:'Código de conduta e políticas', d:'Políticas internas e código de conduta documentados e comunicados à equipe.' }
  ];

  /* ── indicadores sugeridos (empty-state da aba Indicadores) ── */
  var SUGEST=[
    ['A','Circularidade','Taxa de reaproveitamento de estrutura','%','maior'],
    ['A','Resíduos','Resíduo desviado de aterro','%','maior'],
    ['A','Energia','Consumo de energia','kWh','menor'],
    ['A','Emissões','Emissões estimadas (Escopo 1+2)','kgCO2e','menor'],
    ['S','Segurança','Quase-acidentes registrados','un','maior'],
    ['S','Pessoas','Horas de treinamento','h','maior'],
    ['S','Local','Compras de fornecedores locais','%','maior'],
    ['G','Fornecedores','Fornecedores homologados','%','maior']
  ];

  /* ── helpers ── */
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function isTreino(x){ return (x||'').indexOf('TREINO')>=0; }
  function meEmail(){ try{ return (JSON.parse(localStorage.getItem('sulsign_session')||'{}').email)||''; }catch(e){ return ''; } }
  function num(id){ var el=document.getElementById(id); if(!el)return null; var v=el.value; return v===''?null:+v; }
  function val(id){ var el=document.getElementById(id); return el?el.value:''; }
  function dbr(d){ if(!d)return ''; var t=String(d).split('T')[0].split('-'); return t.length===3?(t[2]+'/'+t[1]+'/'+t[0]):d; }
  function periodoAtual(){ var n=new Date(); return n.getFullYear()+'-'+('0'+(n.getMonth()+1)).slice(-2); }
  function atrasado(d){ if(!d)return false; var dt=new Date(d); return !isNaN(dt)&&dt.getTime()<Date.now(); }

  /* ── carga ── */
  function fetchAll(force){
    if(SS20.cache.esg&&!force) return Promise.resolve(SS20.cache.esg);
    return Promise.all([
      SS20.sb('esg_diagnostico?select=*&deletado_em=is.null'),
      SS20.sb('esg_indicadores?select=*&deletado_em=is.null&order=periodo.desc,pilar.asc'),
      SS20.sb('esg_iniciativas?select=*&deletado_em=is.null&order=prazo.asc.nullslast,criado_em.desc'),
      SS20.sb('orcamentos?select=numero,cliente&order=numero.desc').catch(function(){return [];})
    ]).then(function(r){
      var diag={}; (r[0]||[]).forEach(function(x){ diag[x.item_key]=x; });
      var data={
        diag:diag,
        indic:(r[1]||[]).filter(function(i){return !isTreino(i.nome);}),
        inic:(r[2]||[]).filter(function(i){return !isTreino(i.titulo);}),
        orcs:r[3]||[]
      };
      SS20.cache.esg=data; return data;
    });
  }

  function render(c){
    fetchAll().then(function(d){ draw(c,d); }).catch(function(e){
      if(String(e.message).indexOf('404')>=0 || String(e.message).indexOf('PGRST')>=0 || String(e.message).indexOf('400')>=0){
        c.innerHTML='<div class="placeholder-view"><h2>ESG &amp; Sustentabilidade</h2>'
          +'<p>As tabelas <b>esg_diagnostico</b> / <b>esg_indicadores</b> / <b>esg_iniciativas</b> ainda não existem no Supabase.</p>'
          +'<p>Rode o arquivo <b>schema_esg.sql</b> no SQL Editor e recarregue (Ctrl+Shift+R).</p></div>';
        return;
      }
      c.innerHTML='<div class="err-view">Erro: '+esc(e.message)+'</div>';
    });
  }

  /* ── cálculo de maturidade ── */
  function maturidade(d){
    var acc={A:{s:0,n:0},S:{s:0,n:0},G:{s:0,n:0}};
    DIAG.forEach(function(it){
      var r=d.diag[it.k]; var nv=(r&&typeof r.nivel==='number')?r.nivel:null;
      acc[it.p].n++; if(nv!=null) acc[it.p].s+=nv;
    });
    function pct(o){ return o.n?Math.round((o.s/(o.n*3))*100):0; }
    var pa=pct(acc.A), ps=pct(acc.S), pg=pct(acc.G);
    return { A:pa, S:ps, G:pg, geral:Math.round((pa+ps+pg)/3),
             respondidos:Object.keys(d.diag).length, total:DIAG.length };
  }
  function corScore(v){ return v<34?'var(--danger)':(v<67?'var(--warn)':'var(--ok)'); }

  /* ── DRAW ── */
  function draw(c,d){
    var h='';
    h+='<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:14px">';
    h+='<div><h2 style="margin:0;font-family:var(--font-d);font-size:22px">ESG &amp; Sustentabilidade</h2>'
      +'<p style="margin:4px 0 0;font-size:12.5px;color:var(--mut)">Triple Bottom Line · ISO 20121 · Escopos 1/2/3 (GHG Protocol)</p></div>';
    h+='<div style="display:flex;border:1px solid var(--line);border-radius:8px;overflow:hidden">';
    [['painel','Painel'],['diag','Diagnóstico'],['indic','Indicadores'],['inic','Iniciativas']].forEach(function(v,i){
      var on=st.vista===v[0];
      h+='<button type="button" class="esg-vw" data-v="'+v[0]+'" style="border:none;'+(i?'border-left:1px solid var(--line);':'')
        +'padding:7px 13px;font-size:12px;cursor:pointer;background:'+(on?'var(--accent)':'var(--panel)')+';color:'+(on?'#fff':'var(--ink)')+'">'+v[1]+'</button>';
    });
    h+='</div></div>';
    h+='<div id="esg-body"></div>';
    c.innerHTML=h;

    var body=document.getElementById('esg-body');
    if(st.vista==='painel')      drawPainel(body,d);
    else if(st.vista==='diag')   drawDiag(body,d);
    else if(st.vista==='indic')  drawIndic(body,d);
    else if(st.vista==='inic')   drawInic(body,d);

    var vw=c.querySelectorAll('.esg-vw');
    for(var i=0;i<vw.length;i++){ vw[i].addEventListener('click',function(){ st.vista=this.getAttribute('data-v'); st.aberto=null; draw(c,d); }); }
  }

  /* ── PAINEL ── */
  function drawPainel(b,d){
    var m=maturidade(d);
    var R=52, C=2*Math.PI*R, off=C*(1-m.geral/100), cor=corScore(m.geral);
    var h='';

    if(m.respondidos<m.total){
      h+='<div style="background:var(--warn-soft);border:1px solid var(--warn);border-radius:var(--radius);padding:12px 15px;margin-bottom:14px;font-size:13px">'
        +'⚠ Diagnóstico incompleto ('+m.respondidos+'/'+m.total+' itens). Preencha a aba <b>Diagnóstico</b> para calibrar o score. '
        +'<button type="button" class="esg-go" data-v="diag" style="background:var(--warn);color:#fff;border:none;font-size:12px;font-weight:600;padding:4px 12px;border-radius:7px;cursor:pointer;margin-left:6px">Preencher</button></div>';
    }

    h+='<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:20px;margin-bottom:16px">';
    // anel
    h+='<svg viewBox="0 0 140 140" width="150" height="150" style="flex:none">'
      +'<circle cx="70" cy="70" r="'+R+'" fill="none" stroke="var(--line)" stroke-width="14"/>'
      +'<circle cx="70" cy="70" r="'+R+'" fill="none" stroke="'+cor+'" stroke-width="14" stroke-linecap="round" '
      +'stroke-dasharray="'+C.toFixed(1)+'" stroke-dashoffset="'+off.toFixed(1)+'" transform="rotate(-90 70 70)"/>'
      +'<text x="70" y="66" text-anchor="middle" font-size="32" font-weight="800" fill="var(--ink)" font-family="var(--font-d)">'+m.geral+'</text>'
      +'<text x="70" y="70" text-anchor="middle" font-size="0"> </text>'
      +'<text x="70" y="90" text-anchor="middle" font-size="11" fill="var(--mut)">maturidade ESG</text></svg>';
    // barras por pilar
    h+='<div style="flex:1;min-width:240px">';
    ['A','S','G'].forEach(function(p){
      var v=m[p], P=PILAR[p];
      h+='<div style="margin-bottom:12px">'
        +'<div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px">'
        +'<span style="font-weight:600">'+P.ic+' '+P.nome+'</span><span style="font-weight:700;color:'+P.cor+'">'+v+'%</span></div>'
        +'<div style="height:9px;background:var(--line);border-radius:20px;overflow:hidden">'
        +'<div style="height:100%;width:'+v+'%;background:'+P.cor+';border-radius:20px"></div></div></div>';
    });
    h+='</div></div>';

    // cartões por pilar: indicadores + iniciativas ativas
    h+='<div class="roadgrid" style="grid-template-columns:1fr 1fr 1fr">';
    ['A','S','G'].forEach(function(p){
      var P=PILAR[p];
      var ind=d.indic.filter(function(x){return x.pilar===p;});
      var inv=d.inic.filter(function(x){return x.pilar===p && x.status!=='Concluída';});
      h+='<div style="border:1px solid var(--line);border-top:3px solid '+P.cor+';border-radius:var(--radius);padding:14px;background:var(--panel)">'
        +'<div style="font-weight:700;font-size:13.5px;margin-bottom:8px">'+P.ic+' '+P.nome+'</div>';
      if(ind.length){
        var ult=ind[0];
        h+='<div style="font-size:11.5px;color:var(--mut)">Indicador recente</div>'
          +'<div style="font-size:13px;font-weight:600;margin-bottom:2px">'+esc(ult.nome)+'</div>'
          +'<div style="font-size:20px;font-weight:800;color:'+P.cor+'">'+esc(String(ult.valor==null?'—':ult.valor))+' <span style="font-size:12px;font-weight:600;color:var(--mut)">'+esc(ult.unidade||'')+'</span></div>'
          +'<div style="font-size:11px;color:var(--mut)">'+esc(ult.periodo||'')+(ult.meta!=null?' · meta '+esc(String(ult.meta)):'')+'</div>';
      } else {
        h+='<div style="font-size:12px;color:var(--mut);padding:6px 0">Sem indicadores ainda.</div>';
      }
      h+='<div style="border-top:1px solid var(--line);margin-top:10px;padding-top:8px;font-size:12px">'
        +'<b>'+inv.length+'</b> iniciativa'+(inv.length===1?'':'s')+' em aberto</div></div>';
    });
    h+='</div>';

    // nota comercial / ISO
    h+='<div class="roadcard" style="margin-top:16px"><h4>🎯 Por que isto importa comercialmente</h4>'
      +'<p>Clientes grandes (PRIO, Shell, Cinemark) pedem dados ESG de fornecedores como parte do <b>Escopo 3</b> deles. '
      +'Este painel é a base para responder questionário de fornecedor e, no futuro, emitir um mini-relatório ESG por evento — '
      +'transformando a economia circular real da Sul Sign (locação e reuso de estruturas) em argumento de venda.</p></div>';

    b.innerHTML=h;
    var g=b.querySelectorAll('.esg-go');
    for(var i=0;i<g.length;i++){ g[i].addEventListener('click',function(){ st.vista=this.getAttribute('data-v'); render(document.getElementById('ss-content')); }); }
  }

  /* ── DIAGNÓSTICO ── */
  function drawDiag(b,d){
    var h='<p style="font-size:12.5px;color:var(--mut);margin:0 0 14px">Avalie cada item de <b>0 (Inexistente)</b> a <b>3 (Consolidado)</b>. O score do Painel é recalculado a partir daqui.</p>';
    ['A','S','G'].forEach(function(p){
      var P=PILAR[p];
      h+='<div style="font-weight:700;font-size:14px;margin:16px 0 8px;color:'+P.cor+'">'+P.ic+' '+P.nome+'</div>';
      DIAG.filter(function(it){return it.p===p;}).forEach(function(it){
        var r=d.diag[it.k]; var nv=(r&&typeof r.nivel==='number')?r.nivel:null;
        h+='<div style="border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px;margin-bottom:8px;background:var(--panel)">'
          +'<div style="font-size:13.5px;font-weight:600">'+esc(it.t)+'</div>'
          +'<div style="font-size:11.5px;color:var(--mut);margin:3px 0 9px">'+esc(it.d)+'</div>'
          +'<div style="display:flex;gap:6px;flex-wrap:wrap">';
        for(var lv=0;lv<4;lv++){
          var on=nv===lv;
          h+='<button type="button" class="esg-nv" data-k="'+it.k+'" data-p="'+p+'" data-nv="'+lv+'" '
            +'style="border:1px solid '+(on?CNIVEL[lv]:'var(--line)')+';background:'+(on?CNIVEL[lv]:'var(--paper)')+';color:'+(on?'#fff':'var(--ink)')
            +';font-size:11.5px;font-weight:'+(on?'700':'500')+';padding:5px 11px;border-radius:7px;cursor:pointer">'+lv+' · '+NIVEIS[lv]+'</button>';
        }
        h+='</div></div>';
      });
    });
    b.innerHTML=h;

    var btns=b.querySelectorAll('.esg-nv');
    for(var i=0;i<btns.length;i++){
      btns[i].addEventListener('click',function(){
        var k=this.getAttribute('data-k'), p=this.getAttribute('data-p'), nv=+this.getAttribute('data-nv');
        var self=this;
        salvarDiag(k,p,nv,function(){
          fetchAll(true).then(function(d2){ st.vista='diag'; draw(document.getElementById('ss-content'),d2); });
        }, function(err){ alert('Erro ao salvar: '+err); });
      });
    }
  }

  function salvarDiag(k,p,nv,ok,fail){
    var body={ item_key:k, pilar:p, nivel:nv, atualizado_por:meEmail(), atualizado_em:new Date().toISOString() };
    SS20.sb('esg_diagnostico?select=id&item_key=eq.'+encodeURIComponent(k)+'&deletado_em=is.null&limit=1').then(function(rows){
      if(rows&&rows[0]&&rows[0].id) return SS20.sbw('esg_diagnostico?id=eq.'+rows[0].id,'PATCH',{pilar:p,nivel:nv,atualizado_por:body.atualizado_por,atualizado_em:body.atualizado_em});
      return SS20.sbw('esg_diagnostico','POST',(body.criado_em=new Date().toISOString(),body));
    }).then(function(){ ok&&ok(); }).catch(function(e){ fail&&fail(e.message); });
  }

  /* ── INDICADORES ── */
  function drawIndic(b,d){
    var h='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">'
      +'<div style="font-size:12.5px;color:var(--mut)">Métricas por período, com meta e direção (↑ maior melhor / ↓ menor melhor).</div>'
      +'<button type="button" id="esg-ind-novo" style="background:var(--accent);color:#fff;border:none;font-size:12.5px;font-weight:600;padding:8px 14px;border-radius:8px;cursor:pointer">⊕ Novo indicador</button></div>';
    h+='<div id="esg-ind-form"></div>';

    if(!d.indic.length){
      h+='<div class="roadcard"><h4>Sugestões para começar</h4><p>Clique para pré-preencher um indicador comum ao setor:</p>'
        +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">';
      SUGEST.forEach(function(s,i){
        h+='<button type="button" class="esg-sug" data-i="'+i+'" style="background:'+PILAR[s[0]].soft+';color:'+PILAR[s[0]].cor+';border:1px solid '+PILAR[s[0]].cor+';font-size:11.5px;font-weight:600;padding:5px 11px;border-radius:20px;cursor:pointer">'+PILAR[s[0]].ic+' '+esc(s[2])+'</button>';
      });
      h+='</div></div>';
    } else {
      ['A','S','G'].forEach(function(p){
        var arr=d.indic.filter(function(x){return x.pilar===p;});
        if(!arr.length) return;
        h+='<div style="font-weight:700;font-size:13px;margin:14px 0 6px;color:'+PILAR[p].cor+'">'+PILAR[p].ic+' '+PILAR[p].nome+'</div>';
        arr.forEach(function(x){
          var atinge = x.meta==null||x.valor==null ? null : (x.direcao==='menor' ? x.valor<=x.meta : x.valor>=x.meta);
          var cA = atinge==null?'var(--mut)':(atinge?'var(--ok)':'var(--danger)');
          h+='<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;border:1px solid var(--line);border-left:3px solid '+PILAR[p].cor+';border-radius:var(--radius);padding:11px 14px;margin-bottom:7px;background:var(--panel)">'
            +'<div style="min-width:0"><div style="font-size:13px;font-weight:600">'+esc(x.nome)+' <span style="font-size:11px;color:var(--mut);font-weight:500">· '+esc(x.categoria||'')+'</span></div>'
            +'<div style="font-size:11px;color:var(--mut)">'+esc(x.periodo||'')+(x.job_numero?' · 🔗 '+esc(x.job_numero):'')+(x.fonte?' · '+esc(x.fonte):'')+'</div></div>'
            +'<div style="text-align:right;flex:none"><div style="font-size:18px;font-weight:800;color:'+cA+'">'+esc(String(x.valor==null?'—':x.valor))+' <span style="font-size:11px;color:var(--mut);font-weight:600">'+esc(x.unidade||'')+'</span></div>'
            +(x.meta!=null?'<div style="font-size:10.5px;color:var(--mut)">meta '+(x.direcao==='menor'?'≤':'≥')+' '+esc(String(x.meta))+'</div>':'')+'</div>'
            +'<div style="display:flex;gap:5px;flex:none">'
            +'<button type="button" class="esg-ind-ed" data-id="'+x.id+'" style="background:var(--paper);border:1px solid var(--line);font-size:11px;padding:4px 9px;border-radius:7px;cursor:pointer">✎</button>'
            +'<button type="button" class="esg-ind-del" data-id="'+x.id+'" style="background:none;border:1px solid var(--line);color:var(--danger);font-size:11px;padding:4px 9px;border-radius:7px;cursor:pointer">🗑</button></div></div>';
        });
      });
    }
    b.innerHTML=h;

    document.getElementById('esg-ind-novo').addEventListener('click',function(){ formIndic(b,d,{}); });
    var sug=b.querySelectorAll('.esg-sug');
    for(var i=0;i<sug.length;i++){ sug[i].addEventListener('click',function(){ var s=SUGEST[+this.getAttribute('data-i')]; formIndic(b,d,{pilar:s[0],categoria:s[1],nome:s[2],unidade:s[3],direcao:s[4],periodo:periodoAtual()}); }); }
    var ed=b.querySelectorAll('.esg-ind-ed');
    for(var j=0;j<ed.length;j++){ ed[j].addEventListener('click',function(){ var id=this.getAttribute('data-id'); var it=null; d.indic.forEach(function(x){if(x.id===id)it=x;}); formIndic(b,d,it||{}); }); }
    var dl=b.querySelectorAll('.esg-ind-del');
    for(var kk=0;kk<dl.length;kk++){ dl[kk].addEventListener('click',function(){ var id=this.getAttribute('data-id');
      if(confirm('Excluir este indicador?')){ SS20.sbw('esg_indicadores?id=eq.'+id,'PATCH',{deletado_em:new Date().toISOString()})
        .then(function(){return fetchAll(true);}).then(function(d2){ draw(document.getElementById('ss-content'),d2); }).catch(function(e){alert('Erro: '+e.message);}); } }); }
  }

  function formIndic(b,d,it){
    var f=document.getElementById('esg-ind-form');
    var inp='padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;width:100%;box-sizing:border-box';
    var lab='display:block;font-size:11px;color:var(--mut);margin-bottom:3px';
    function optP(cur){ var o=''; ['A','S','G'].forEach(function(p){ o+='<option value="'+p+'"'+(cur===p?' selected':'')+'>'+PILAR[p].nome+'</option>'; }); return o; }
    function optJob(cur){ var o='<option value="">— nenhum —</option>', vis={}; d.orcs.forEach(function(x){ if(x.numero&&!vis[x.numero]){ vis[x.numero]=1; o+='<option value="'+esc(x.numero)+'"'+(cur===x.numero?' selected':'')+'>'+esc(x.numero)+(x.cliente?' — '+esc(x.cliente):'')+'</option>'; } }); return o; }
    var h='<div style="background:var(--panel);border:2px solid var(--accent);border-radius:var(--radius);padding:18px;margin-bottom:16px">'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">'
      +'<div><label style="'+lab+'">Pilar</label><select id="ei-pil" style="'+inp+'">'+optP(it.pilar||'A')+'</select></div>'
      +'<div><label style="'+lab+'">Categoria</label><input id="ei-cat" style="'+inp+'" value="'+esc(it.categoria||'')+'" placeholder="ex.: Resíduos"></div>'
      +'<div style="grid-column:1/3"><label style="'+lab+'">Nome do indicador *</label><input id="ei-nom" style="'+inp+'" value="'+esc(it.nome||'')+'"></div>'
      +'<div><label style="'+lab+'">Valor</label><input id="ei-val" type="number" step="any" style="'+inp+'" value="'+(it.valor==null?'':it.valor)+'"></div>'
      +'<div><label style="'+lab+'">Unidade</label><input id="ei-uni" style="'+inp+'" value="'+esc(it.unidade||'')+'" placeholder="%, kWh, kgCO2e…"></div>'
      +'<div><label style="'+lab+'">Meta</label><input id="ei-met" type="number" step="any" style="'+inp+'" value="'+(it.meta==null?'':it.meta)+'"></div>'
      +'<div><label style="'+lab+'">Direção</label><select id="ei-dir" style="'+inp+'"><option value="maior"'+(it.direcao!=='menor'?' selected':'')+'>↑ maior é melhor</option><option value="menor"'+(it.direcao==='menor'?' selected':'')+'>↓ menor é melhor</option></select></div>'
      +'<div><label style="'+lab+'">Período (AAAA-MM)</label><input id="ei-per" style="'+inp+'" value="'+esc(it.periodo||periodoAtual())+'" placeholder="2026-07"></div>'
      +'<div><label style="'+lab+'">Job / Orçamento</label><select id="ei-job" style="'+inp+'">'+optJob(it.job_numero)+'</select></div>'
      +'<div style="grid-column:1/3"><label style="'+lab+'">Fonte / observação</label><input id="ei-fon" style="'+inp+'" value="'+esc(it.fonte||'')+'" placeholder="de onde veio o dado"></div>'
      +'</div>'
      +'<div style="display:flex;gap:8px;align-items:center"><button type="button" id="ei-save" style="background:var(--accent);color:#fff;border:none;font-size:12.5px;font-weight:600;padding:9px 16px;border-radius:8px;cursor:pointer">💾 Salvar</button>'
      +'<button type="button" id="ei-cancel" style="background:var(--paper);border:1px solid var(--line);font-size:12.5px;padding:9px 16px;border-radius:8px;cursor:pointer">Cancelar</button>'
      +'<span id="ei-msg" style="font-size:12px"></span></div></div>';
    f.innerHTML=h;
    try{ f.scrollIntoView({behavior:'smooth',block:'nearest'}); }catch(e){}

    document.getElementById('ei-cancel').addEventListener('click',function(){ f.innerHTML=''; });
    document.getElementById('ei-save').addEventListener('click',function(){
      var nom=val('ei-nom').trim(), msg=document.getElementById('ei-msg');
      if(!nom){ msg.textContent='Informe o nome.'; msg.style.color='var(--danger)'; return; }
      var body={ pilar:val('ei-pil'), categoria:val('ei-cat').trim()||null, nome:nom, valor:num('ei-val'),
        unidade:val('ei-uni').trim()||null, meta:num('ei-met'), direcao:val('ei-dir'),
        periodo:val('ei-per').trim()||null, job_numero:val('ei-job')||null, fonte:val('ei-fon').trim()||null,
        atualizado_em:new Date().toISOString() };
      var pr = it.id ? SS20.sbw('esg_indicadores?id=eq.'+it.id,'PATCH',body)
                     : SS20.sbw('esg_indicadores','POST',(body.criado_por=meEmail(),body.criado_em=new Date().toISOString(),body));
      pr.then(function(){ return fetchAll(true); }).then(function(d2){ draw(document.getElementById('ss-content'),d2); })
        .catch(function(e){ msg.textContent='Erro: '+e.message; msg.style.color='var(--danger)'; });
    });
  }

  /* ── INICIATIVAS (plano de ação — melhoria contínua ISO 20121) ── */
  function drawInic(b,d){
    var h='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">'
      +'<div style="font-size:12.5px;color:var(--mut)">Plano de ação de melhoria contínua. Cada iniciativa move um pilar.</div>'
      +'<button type="button" id="esg-ini-novo" style="background:var(--accent);color:#fff;border:none;font-size:12.5px;font-weight:600;padding:8px 14px;border-radius:8px;cursor:pointer">⊕ Nova iniciativa</button></div>';
    h+='<div id="esg-ini-form"></div>';

    if(!d.inic.length){
      h+='<div class="roadcard"><h4>Nenhuma iniciativa ainda</h4><p>Crie ações concretas — ex.: "Mapear reuso de treliças por job", "Contratar coleta de sobras de MDF", "Implantar registro de quase-acidentes na montagem".</p></div>';
    } else {
      d.inic.forEach(function(x){
        var P=PILAR[x.pilar]||PILAR.G; var cs=CSTAT[x.status]||CSTAT['Planejada'];
        var late = x.status!=='Concluída' && atrasado(x.prazo);
        h+='<div style="border:1px solid var(--line);border-left:3px solid '+P.cor+';border-radius:var(--radius);padding:13px 15px;margin-bottom:9px;background:var(--panel)">'
          +'<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">'
          +'<div style="min-width:0"><div style="font-size:14px;font-weight:600">'+esc(x.titulo)+'</div>'
          +(x.descricao?'<div style="font-size:12px;color:var(--mut);margin-top:3px">'+esc(x.descricao)+'</div>':'')+'</div>'
          +'<span style="flex:none;font-size:10.5px;font-weight:700;padding:2px 9px;border-radius:20px;color:'+cs[0]+';background:'+cs[1]+'">'+esc(x.status)+'</span></div>'
          +'<div style="display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--mut);margin-top:9px;border-top:1px solid var(--line);padding-top:8px">'
          +'<span>'+P.ic+' '+P.nome+'</span>'
          +(x.responsavel?'<span>👤 '+esc(x.responsavel)+'</span>':'')
          +(x.prazo?'<span style="'+(late?'color:var(--danger);font-weight:600':'')+'">📅 '+dbr(x.prazo)+(late?' (atrasada)':'')+'</span>':'')
          +(x.job_numero?'<span>🔗 '+esc(x.job_numero)+'</span>':'')
          +'<span style="margin-left:auto;display:flex;gap:5px">'
          +'<button type="button" class="esg-ini-ed" data-id="'+x.id+'" style="background:var(--paper);border:1px solid var(--line);font-size:11px;padding:3px 9px;border-radius:7px;cursor:pointer">✎</button>'
          +'<button type="button" class="esg-ini-del" data-id="'+x.id+'" style="background:none;border:1px solid var(--line);color:var(--danger);font-size:11px;padding:3px 9px;border-radius:7px;cursor:pointer">🗑</button>'
          +'</span></div></div>';
      });
    }
    b.innerHTML=h;

    document.getElementById('esg-ini-novo').addEventListener('click',function(){ formInic(b,d,{}); });
    var ed=b.querySelectorAll('.esg-ini-ed');
    for(var j=0;j<ed.length;j++){ ed[j].addEventListener('click',function(){ var id=this.getAttribute('data-id'); var it=null; d.inic.forEach(function(x){if(x.id===id)it=x;}); formInic(b,d,it||{}); }); }
    var dl=b.querySelectorAll('.esg-ini-del');
    for(var kk=0;kk<dl.length;kk++){ dl[kk].addEventListener('click',function(){ var id=this.getAttribute('data-id');
      if(confirm('Excluir esta iniciativa?')){ SS20.sbw('esg_iniciativas?id=eq.'+id,'PATCH',{deletado_em:new Date().toISOString()})
        .then(function(){return fetchAll(true);}).then(function(d2){ draw(document.getElementById('ss-content'),d2); }).catch(function(e){alert('Erro: '+e.message);}); } }); }
  }

  function formInic(b,d,it){
    var f=document.getElementById('esg-ini-form');
    var inp='padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;width:100%;box-sizing:border-box';
    var lab='display:block;font-size:11px;color:var(--mut);margin-bottom:3px';
    function optP(cur){ var o=''; ['A','S','G'].forEach(function(p){ o+='<option value="'+p+'"'+(cur===p?' selected':'')+'>'+PILAR[p].nome+'</option>'; }); return o; }
    function optS(cur){ var o=''; STATS.forEach(function(s){ o+='<option'+(cur===s?' selected':'')+'>'+s+'</option>'; }); return o; }
    function optJob(cur){ var o='<option value="">— nenhum —</option>', vis={}; d.orcs.forEach(function(x){ if(x.numero&&!vis[x.numero]){ vis[x.numero]=1; o+='<option value="'+esc(x.numero)+'"'+(cur===x.numero?' selected':'')+'>'+esc(x.numero)+(x.cliente?' — '+esc(x.cliente):'')+'</option>'; } }); return o; }
    var h='<div style="background:var(--panel);border:2px solid var(--accent);border-radius:var(--radius);padding:18px;margin-bottom:16px">'
      +'<div style="margin-bottom:10px"><label style="'+lab+'">Título *</label><input id="en-tit" style="'+inp+'" value="'+esc(it.titulo||'')+'"></div>'
      +'<div style="margin-bottom:10px"><label style="'+lab+'">Descrição</label><textarea id="en-des" rows="2" style="'+inp+';resize:vertical">'+esc(it.descricao||'')+'</textarea></div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">'
      +'<div><label style="'+lab+'">Pilar</label><select id="en-pil" style="'+inp+'">'+optP(it.pilar||'A')+'</select></div>'
      +'<div><label style="'+lab+'">Status</label><select id="en-sta" style="'+inp+'">'+optS(it.status||'Planejada')+'</select></div>'
      +'<div><label style="'+lab+'">Responsável</label><input id="en-res" style="'+inp+'" value="'+esc(it.responsavel||'')+'"></div>'
      +'<div><label style="'+lab+'">Prazo</label><input id="en-prz" type="date" style="'+inp+'" value="'+esc((it.prazo||'').slice(0,10))+'"></div>'
      +'<div style="grid-column:1/3"><label style="'+lab+'">Job / Orçamento</label><select id="en-job" style="'+inp+'">'+optJob(it.job_numero)+'</select></div>'
      +'</div>'
      +'<div style="display:flex;gap:8px;align-items:center"><button type="button" id="en-save" style="background:var(--accent);color:#fff;border:none;font-size:12.5px;font-weight:600;padding:9px 16px;border-radius:8px;cursor:pointer">💾 Salvar</button>'
      +'<button type="button" id="en-cancel" style="background:var(--paper);border:1px solid var(--line);font-size:12.5px;padding:9px 16px;border-radius:8px;cursor:pointer">Cancelar</button>'
      +'<span id="en-msg" style="font-size:12px"></span></div></div>';
    f.innerHTML=h;
    try{ f.scrollIntoView({behavior:'smooth',block:'nearest'}); }catch(e){}

    document.getElementById('en-cancel').addEventListener('click',function(){ f.innerHTML=''; });
    document.getElementById('en-save').addEventListener('click',function(){
      var tit=val('en-tit').trim(), msg=document.getElementById('en-msg');
      if(!tit){ msg.textContent='Informe o título.'; msg.style.color='var(--danger)'; return; }
      var body={ titulo:tit, descricao:val('en-des').trim()||null, pilar:val('en-pil'), status:val('en-sta'),
        responsavel:val('en-res').trim()||null, prazo:val('en-prz')||null, job_numero:val('en-job')||null,
        atualizado_em:new Date().toISOString() };
      var pr = it.id ? SS20.sbw('esg_iniciativas?id=eq.'+it.id,'PATCH',body)
                     : SS20.sbw('esg_iniciativas','POST',(body.criado_por=meEmail(),body.criado_em=new Date().toISOString(),body));
      pr.then(function(){ return fetchAll(true); }).then(function(d2){ draw(document.getElementById('ss-content'),d2); })
        .catch(function(e){ msg.textContent='Erro: '+e.message; msg.style.color='var(--danger)'; });
    });
  }

  SS20.modules.esg={render:render};
})();
