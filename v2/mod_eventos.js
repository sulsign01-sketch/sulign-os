/* ═══════════════════════════════════════════════════════════════
   SULSIGN OS 2.0 — MÓDULO: EVENTOS (eventos)
   Quadro kanban do cronograma de eventos (M = montagem, E = evento,
   D = desmontagem). Fase calculada automaticamente pela data de
   hoje, com opção de forçar manualmente por card. Anexos por
   upload direto (base64, até 9MB) ou link (Drive etc). Vínculo
   opcional a um orçamento para puxar custo real do Centro de Custo.
   Requer colunas novas em eventos e anexos — ver eventos_schema.sql.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  var st={ aberto:null };

  var FASES=[
    ['prospeccao','Prospecção','🔍'],
    ['confirmado','Confirmado','✅'],
    ['montagem','Em Montagem','🔨'],
    ['evento','Em Evento','🎪'],
    ['desmontagem','Em Desmontagem','📦'],
    ['concluido','Concluído','🏁']
  ];
  var MAX_BYTES=9*1024*1024; /* ~9MB por arquivo (base64 no banco, mesmo limite da ficha de OS) */

  /* board de tarefas por job — listas padrão sugeridas na 1ª abertura (editável depois) */
  var LISTAS_PADRAO=['Documentos','Detalhamentos','Comunicação Visual'];
  var CORES_LABEL=[['','—'],['red','Vermelho'],['yellow','Amarelo'],['purple','Roxo'],['green','Verde'],['blue','Azul']];
  var COR_HEX={red:'#eb5a46',yellow:'#f2d600',purple:'#c377e0',green:'#61bd4f',blue:'#0079bf'};

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function isTreino(x){ return (x||'').indexOf('TREINO')>=0; }
  function meEmail(){ try{ return (JSON.parse(localStorage.getItem('sulsign_session')||'{}').email)||''; }catch(e){ return ''; } }
  function hojeStr(){ return new Date().toISOString().slice(0,10); }
  function kb(n){ return (n/1024/1024).toFixed(1)+'MB'; }
  function dataUrl(a){ var dd=a.dados||''; return dd.indexOf('data:')===0?dd:('data:'+(a.mime||'application/octet-stream')+';base64,'+dd); }

  function dstr(d){ if(!d)return ''; var p=String(d).split('T')[0].split('-'); return p.length===3?(p[2]+'/'+p[1]):d; }
  function dstrFull(d){ if(!d)return ''; var p=String(d).split('T')[0].split('-'); return p.length===3?(p[2]+'/'+p[1]+'/'+p[0]):d; }
  function periodo(ini,fim){
    if(!ini && !fim) return '—';
    if(!fim || ini===fim) return dstrFull(ini||fim);
    return dstr(ini)+' – '+dstrFull(fim);
  }

  /* ── FASE: automática pelas datas, ou forçada por fase_manual ── */
  function fase(ev,hoje){
    if(ev.fase_manual) return ev.fase_manual;
    if(!ev.confirmado) return 'prospeccao';
    var dm1=ev.data_montagem;
    var de1=ev.data_evento_ini, de2=ev.data_evento_fim||ev.data_evento_ini;
    var dd1=ev.data_desmontagem, dd2=ev.data_desmontagem_fim||ev.data_desmontagem;
    if(dd2 && hoje>dd2) return 'concluido';
    if(dd1 && hoje>=dd1) return 'desmontagem';
    if(de1 && hoje>=de1) return 'evento';
    if(dm1 && hoje>=dm1) return 'montagem';
    return 'confirmado';
  }

  function fetchAll(force){
    if(SS20.cache.eventos && !force) return Promise.resolve(SS20.cache.eventos);
    return Promise.all([
      SS20.sb('eventos?select=*&deletado_em=is.null'),
      SS20.sb('orcamentos?select=numero,cliente,projeto,bdi,grupos&order=numero.desc'),
      SS20.sb('lancamentos?select=orcamento_numero,valor,tipo_lancamento&tipo_lancamento=eq.saida&deletado_em=is.null'),
      SS20.sb('anexos?select=*&entidade=in.(evento,evento_tarefa)&deletado_em=is.null&order=criado_em.asc'),
      SS20.sb('evento_listas?select=*&deletado_em=is.null&order=ordem.asc'),
      SS20.sb('evento_tarefas?select=*&deletado_em=is.null&order=ordem.asc'),
      SS20.sb('evento_tarefa_itens?select=*&deletado_em=is.null&order=ordem.asc')
    ]).then(function(r){
      var data={
        evs:r[0].filter(function(e){ return !isTreino(e.nome_evento)&&!isTreino(e.job_numero); }),
        orcs:r[1], lanc:r[2], anx:r[3], listas:r[4], tarefas:r[5], itens:r[6]
      };
      SS20.cache.eventos=data; return data;
    });
  }

  function progressoEvento(d,eventoId){
    var ts=d.tarefas.filter(function(t){ return t.evento_id===eventoId; });
    if(!ts.length) return null;
    var feitas=ts.filter(function(t){ return t.concluido; }).length;
    return {feitas:feitas, total:ts.length};
  }

  function custoDoJob(d,numero){
    var tot=0; d.lanc.forEach(function(l){ if(l.orcamento_numero===numero) tot+=parseFloat(l.valor)||0; });
    return tot;
  }

  function render(c){
    fetchAll().then(function(d){ draw(c,d); }).catch(function(e){
      if(String(e.message).indexOf('404')>=0 || String(e.message).indexOf('PGRST')>=0 || String(e.message).indexOf('column')>=0){
        c.innerHTML='<div class="placeholder-view"><h2>Eventos</h2>'
          +'<p>Faltam colunas/tabelas novas (<b>eventos</b>, <b>anexos</b>, <b>evento_listas</b>, <b>evento_tarefas</b>, <b>evento_tarefa_itens</b>).</p>'
          +'<p>Rode o <b>eventos_schema.sql</b> no SQL Editor do Supabase e recarregue.</p></div>';
        return;
      }
      c.innerHTML='<div class="err-view">Erro: '+esc(e.message)+'</div>';
    });
  }

  function draw(c,d){
    var hoje=hojeStr();
    var cols={}; FASES.forEach(function(f){ cols[f[0]]=[]; });
    d.evs.forEach(function(ev){ var fk=fase(ev,hoje); (cols[fk]||cols.prospeccao).push(ev); });
    var chave=function(ev){ return ev.data_montagem||ev.data_evento_ini||'9999-99-99'; };
    FASES.forEach(function(f){ cols[f[0]].sort(function(a,b){ var ca=chave(a),cb=chave(b); return ca<cb?-1:(ca>cb?1:0); }); });

    var nConf=d.evs.filter(function(e){return e.confirmado;}).length;
    var emCampo=cols.montagem.length+cols.evento.length+cols.desmontagem.length;

    var h='<div style="padding:24px 26px">';
    h+='<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:4px">';
    h+='<h2 style="font-family:var(--font-d);font-size:19px">Eventos</h2>';
    h+='<span style="flex:1"></span>';
    h+='<button type="button" id="ev-novo" style="background:var(--accent);color:#fff;border:none;font-size:12.5px;font-weight:600;padding:8px 14px;border-radius:8px;cursor:pointer">⊕ Novo evento</button>';
    h+='</div>';
    h+='<p style="color:var(--mut);font-size:12.5px;margin-bottom:14px">'+d.evs.length+' evento'+(d.evs.length===1?'':'s')+' · '+nConf+' confirmado'+(nConf===1?'':'s')+' · '+emCampo+' em campo agora</p>';
    h+='<div id="ev-form"></div>';
    h+='<div id="ev-board" style="display:flex;gap:10px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:10px">';
    FASES.forEach(function(f){
      var its=cols[f[0]];
      h+='<div style="flex:0 0 272px;background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:10px;min-height:120px">';
      h+='<div style="font-size:11px;font-weight:700;color:var(--mut);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;white-space:nowrap">'+f[2]+' '+f[1]+' <span style="color:var(--ink)">'+its.length+'</span></div>';
      its.forEach(function(ev){ h+=cardEvento(d,ev,hoje); });
      if(!its.length) h+='<div style="font-size:11.5px;color:var(--mut);padding:8px 2px">—</div>';
      h+='</div>';
    });
    h+='</div></div>';
    c.innerHTML=h;

    document.getElementById('ev-novo').addEventListener('click',function(){ form(c,d,null); });
    bind(c,d);
  }

  function linhaFase(icon,label,ini,fim,hora,cor,ativo){
    var per=periodo(ini,fim);
    if(per==='—') return '';
    return '<div style="font-size:11.5px;'+(ativo?('font-weight:700;color:'+cor):'color:var(--mut)')+'">'+icon+' '+label+' '+per+(hora?' · '+esc(hora):'')+'</div>';
  }

  function cardEvento(d,ev,hoje){
    var fk=fase(ev,hoje);
    var anx=d.anx.filter(function(a){ return a.entidade==='evento' && a.entidade_id===ev.id; });
    var orc=null; if(ev.job_numero){ d.orcs.forEach(function(o){ if(o.numero===ev.job_numero) orc=o; }); }
    var titulo=ev.nome_evento || (orc?(orc.cliente||orc.projeto||ev.job_numero):'(sem nome)');

    var h='<div style="background:var(--panel);border:1px solid var(--line);border-left:3px solid '+(ev.fase_manual?'var(--warn)':'var(--accent)')+';border-radius:var(--radius);padding:12px 13px;margin-bottom:9px">';
    h+='<div style="font-weight:800;font-family:var(--font-d);font-size:13.5px;margin-bottom:3px">'+esc(titulo)+'</div>';
    if(ev.local_nome) h+='<div style="font-size:11px;color:var(--mut);margin-bottom:6px">📍 '+esc(ev.local_nome)+'</div>';

    h+=linhaFase('🔨','M',ev.data_montagem,ev.data_montagem_fim,ev.hora_montagem,'var(--warn)',fk==='montagem');
    h+=linhaFase('🎪','E',ev.data_evento_ini,ev.data_evento_fim,ev.hora_evento,'var(--accent)',fk==='evento');
    h+=linhaFase('📦','D',ev.data_desmontagem,ev.data_desmontagem_fim,ev.hora_desmontagem,'var(--warn)',fk==='desmontagem');

    if(ev.job_numero){
      var custo=custoDoJob(d,ev.job_numero);
      var venda=orc?SulSignCore.calcOrcamento(orc).venda:0;
      var marg=venda>0?((venda-custo)/venda*100):null;
      h+='<div style="margin-top:6px"><button type="button" data-action="nav" data-view="orc" style="background:var(--accent-soft);color:var(--accent);border:none;font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:10px;cursor:pointer">🔗 '+esc(ev.job_numero)+'</button>'
        +' <span style="font-size:10.5px;color:var(--mut)">custo '+SulSignCore.fmt(custo)+(marg!==null?(' · margem '+marg.toFixed(0)+'%'):'')+'</span></div>';
    }

    if(ev.obs) h+='<div style="font-size:11px;color:var(--mut);margin-top:6px;white-space:pre-wrap">'+esc(ev.obs)+'</div>';

    var prog=progressoEvento(d,ev.id);

    h+='<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:9px">';
    if(!ev.confirmado) h+='<button type="button" class="ev-conf" data-id="'+ev.id+'" style="background:var(--ok-soft);border:1px solid var(--ok);color:var(--ok);font-size:10.5px;padding:3px 9px;border-radius:7px;cursor:pointer">✓ Confirmar</button>';
    h+='<button type="button" class="ev-tarefas" data-id="'+ev.id+'" style="background:var(--accent-soft);border:1px solid var(--accent);color:var(--accent);font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:7px;cursor:pointer">📋 '+(prog?(prog.feitas+'/'+prog.total):'tarefas')+'</button>';
    h+='<button type="button" class="ev-anx-tg" data-id="'+ev.id+'" style="background:var(--paper);border:1px solid var(--line);font-size:10.5px;padding:3px 9px;border-radius:7px;cursor:pointer">📎 '+(anx.length||'')+' '+(st.aberto===ev.id?'▲':'anexos')+'</button>';
    h+='<button type="button" class="ev-ed" data-id="'+ev.id+'" style="background:var(--paper);border:1px solid var(--line);font-size:10.5px;padding:3px 9px;border-radius:7px;cursor:pointer">✎</button>';
    h+='<button type="button" class="ev-del" data-id="'+ev.id+'" style="background:none;border:1px solid var(--line);color:var(--danger);font-size:10.5px;padding:3px 9px;border-radius:7px;cursor:pointer">🗑</button>';
    h+='</div>';

    h+='<div style="margin-top:7px">';
    h+='<select class="ev-force" data-id="'+ev.id+'" style="width:100%;font-size:10.5px;padding:4px 6px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--mut)">';
    h+='<option value=""'+(!ev.fase_manual?' selected':'')+'>fase automática</option>';
    FASES.forEach(function(f){ h+='<option value="'+f[0]+'"'+(ev.fase_manual===f[0]?' selected':'')+'>forçar: '+f[1]+'</option>'; });
    h+='</select></div>';

    if(st.aberto===ev.id){
      h+='<div style="margin-top:9px;border-top:1px solid var(--line);padding-top:9px">';
      anx.forEach(function(a){
        var href=a.formato==='upload'?dataUrl(a):a.dados;
        h+='<div style="display:flex;align-items:center;gap:6px;font-size:11px;margin-bottom:5px">'
          +'<a href="'+esc(href)+'" target="_blank" download="'+esc(a.nome_arquivo||'')+'" style="color:var(--blue);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(a.formato==='upload'?'📎':'🔗')+' '+esc(a.nome_arquivo)+'</a>'
          +'<button type="button" class="ev-anx-del" data-id="'+a.id+'" style="background:none;border:none;color:var(--danger);font-size:11px;cursor:pointer">✕</button></div>';
      });
      h+='<label style="display:inline-block;font-size:10.5px;font-weight:600;color:var(--accent);cursor:pointer;padding:3px 0">+ arquivo (até 9MB)'
        +'<input type="file" class="ev-upfile" data-id="'+ev.id+'" style="display:none"></label>';
      h+='<div style="display:flex;gap:6px;margin-top:5px">'
        +'<input type="text" class="ev-linkin" data-id="'+ev.id+'" placeholder="nome | link do Drive" style="flex:1;padding:6px 8px;border:1px solid var(--line);border-radius:6px;font-size:11px;font-family:inherit">'
        +'<button type="button" class="ev-linkadd" data-id="'+ev.id+'" style="background:var(--paper);border:1px solid var(--line);font-size:11px;padding:5px 10px;border-radius:6px;cursor:pointer">+ link</button></div>';
      h+='</div>';
    }

    h+='</div>';
    return h;
  }

  function q(c,sel,cb){ var els=c.querySelectorAll(sel); for(var i=0;i<els.length;i++){ els[i].addEventListener('click',function(){ cb(this); }); } }

  function bind(c,d){
    function refresh(){ fetchAll(true).then(function(d2){ draw(c,d2); }); }
    function err(e){ alert('Erro: '+e.message); }

    q(c,'.ev-conf',function(el){ SS20.sbw('eventos?id=eq.'+el.getAttribute('data-id'),'PATCH',{confirmado:true,atualizado_em:new Date().toISOString()}).then(refresh).catch(err); });
    q(c,'.ev-tarefas',function(el){ abrirTarefas(c,el.getAttribute('data-id')); });
    q(c,'.ev-ed',function(el){ var id=el.getAttribute('data-id'); var ev=null; d.evs.forEach(function(x){if(x.id===id)ev=x;}); form(c,d,ev); });
    q(c,'.ev-del',function(el){ if(!confirm('Excluir este evento?'))return; SS20.sbw('eventos?id=eq.'+el.getAttribute('data-id'),'PATCH',{deletado_em:new Date().toISOString()}).then(refresh).catch(err); });
    q(c,'.ev-anx-tg',function(el){ var id=el.getAttribute('data-id'); st.aberto=(st.aberto===id?null:id); draw(c,d); });
    q(c,'.ev-anx-del',function(el){ if(!confirm('Remover este anexo?'))return; SS20.sbw('anexos?id=eq.'+el.getAttribute('data-id'),'PATCH',{deletado_em:new Date().toISOString()}).then(refresh).catch(err); });
    q(c,'.ev-linkadd',function(el){
      var id=el.getAttribute('data-id');
      var inp=c.querySelector('.ev-linkin[data-id="'+id+'"]'); if(!inp)return;
      var txt=inp.value.trim(); if(!txt)return;
      var parts=txt.split('|'); var nome=(parts[0]||'link').trim(); var url=(parts[1]||parts[0]||'').trim();
      SS20.sbw('anexos','POST',{entidade:'evento',entidade_id:id,nome_arquivo:nome,formato:'link',dados:url,criado_por:meEmail()}).then(refresh).catch(err);
    });

    var forcas=c.querySelectorAll('.ev-force');
    for(var i=0;i<forcas.length;i++){
      forcas[i].addEventListener('change',function(){
        var id=this.getAttribute('data-id'); var v=this.value||null;
        SS20.sbw('eventos?id=eq.'+id,'PATCH',{fase_manual:v,atualizado_em:new Date().toISOString()}).then(refresh).catch(err);
      });
    }

    var ups=c.querySelectorAll('.ev-upfile');
    for(var j=0;j<ups.length;j++){
      ups[j].addEventListener('change',function(){
        var id=this.getAttribute('data-id'); var file=this.files&&this.files[0]; if(!file)return;
        if(file.size>MAX_BYTES){ alert('Arquivo muito grande ('+kb(file.size)+'). Limite 9MB.'); return; }
        var rd=new FileReader();
        rd.onload=function(){
          var body={entidade:'evento',entidade_id:id,nome_arquivo:file.name,formato:'upload',mime:file.type||'application/octet-stream',tamanho:file.size,dados:String(rd.result),criado_por:meEmail()};
          SS20.sbw('anexos','POST',body).then(refresh).catch(err);
        };
        rd.onerror=function(){ alert('Não consegui ler o arquivo.'); };
        rd.readAsDataURL(file);
      });
    }
  }

  function form(c,d,it){
    it=it||{};
    var f=document.getElementById('ev-form');
    var lab='display:block;font-size:10.5px;font-weight:600;color:var(--mut);margin-bottom:3px';
    var inp='padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit';
    var opsJob='<option value="">— sem orçamento vinculado —</option>'; var vist={};
    d.orcs.forEach(function(o){ if(o.numero&&!vist[o.numero]){ vist[o.numero]=1; opsJob+='<option value="'+esc(o.numero)+'"'+(it.job_numero===o.numero?' selected':'')+'>'+esc(o.numero)+(o.cliente?' — '+esc(o.cliente):'')+'</option>'; } });

    function dfld(id,label,val){ return '<div><label style="'+lab+'">'+label+'</label><input id="'+id+'" type="date" value="'+(val?String(val).slice(0,10):'')+'" style="'+inp+'"></div>'; }
    function tfld(id,label,val,ph,w){ return '<div style="'+(w||'')+'"><label style="'+lab+'">'+label+'</label><input id="'+id+'" type="text" value="'+esc(val||'')+'" placeholder="'+esc(ph||'')+'" style="width:100%;'+inp+'"></div>'; }

    f.innerHTML='<div style="background:var(--panel);border:2px solid var(--accent);border-radius:var(--radius);padding:18px;margin-bottom:16px">'
      +'<div style="font-size:12px;font-weight:700;margin-bottom:12px">'+(it.id?'Editar evento':'Novo evento')+'</div>'
      +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;align-items:flex-end">'
        +tfld('ef-nome','Nome do evento *',it.nome_evento,'SP2B - Ibirapuera','flex:1;min-width:200px')
        +'<label style="display:flex;align-items:center;gap:6px;font-size:12px;padding-bottom:9px"><input id="ef-conf" type="checkbox" '+(it.confirmado?'checked':'')+'> Confirmado</label>'
      +'</div>'
      +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'
        +tfld('ef-local','Local',it.local_nome,'Arena Jockey Club','flex:1;min-width:160px')
        +tfld('ef-end','Endereço',it.local_endereco,'','flex:1;min-width:160px')
        +tfld('ef-prod','Produtor local',it.produtor_local,'','flex:1;min-width:160px')
      +'</div>'
      +'<div style="font-size:10.5px;font-weight:700;color:var(--mut);text-transform:uppercase;margin-bottom:6px">🔨 Montagem</div>'
      +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'+dfld('ef-m1','Início',it.data_montagem)+dfld('ef-m2','Fim',it.data_montagem_fim)+tfld('ef-hm','Horário',it.hora_montagem,'08:00-18:00','min-width:140px')+'</div>'
      +'<div style="font-size:10.5px;font-weight:700;color:var(--mut);text-transform:uppercase;margin-bottom:6px">🎪 Evento</div>'
      +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'+dfld('ef-e1','Início',it.data_evento_ini)+dfld('ef-e2','Fim',it.data_evento_fim)+tfld('ef-he','Horário',it.hora_evento,'','min-width:140px')+'</div>'
      +'<div style="font-size:10.5px;font-weight:700;color:var(--mut);text-transform:uppercase;margin-bottom:6px">📦 Desmontagem</div>'
      +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'+dfld('ef-d1','Início',it.data_desmontagem)+dfld('ef-d2','Fim',it.data_desmontagem_fim)+tfld('ef-hd','Horário',it.hora_desmontagem,'','min-width:140px')+'</div>'
      +'<div style="margin-bottom:10px"><label style="'+lab+'">Orçamento / job vinculado</label><select id="ef-job" style="width:100%;'+inp+';background:var(--panel)">'+opsJob+'</select></div>'
      +'<div style="margin-bottom:12px"><label style="'+lab+'">Observações</label><textarea id="ef-obs" rows="2" style="width:100%;'+inp+'">'+esc(it.obs||'')+'</textarea></div>'
      +'<div style="display:flex;gap:8px"><button type="button" id="ef-save" style="background:var(--accent);color:#fff;border:none;font-size:12.5px;font-weight:600;padding:9px 16px;border-radius:8px;cursor:pointer">💾 Salvar</button>'
      +'<button type="button" id="ef-cancel" style="background:var(--paper);border:1px solid var(--line);font-size:12.5px;padding:9px 16px;border-radius:8px;cursor:pointer">Cancelar</button></div>'
      +'<div id="ef-msg" style="font-size:11.5px;margin-top:8px"></div></div>';
    try{ f.scrollIntoView({behavior:'smooth',block:'nearest'}); }catch(e){}

    document.getElementById('ef-cancel').addEventListener('click',function(){ f.innerHTML=''; });
    document.getElementById('ef-save').addEventListener('click',function(){
      var nome=document.getElementById('ef-nome').value.trim();
      var msg=document.getElementById('ef-msg');
      if(!nome){ msg.textContent='Informe o nome do evento.'; msg.style.color='var(--danger)'; return; }
      var body={
        nome_evento:nome,
        confirmado:document.getElementById('ef-conf').checked,
        local_nome:document.getElementById('ef-local').value.trim()||null,
        local_endereco:document.getElementById('ef-end').value.trim()||null,
        produtor_local:document.getElementById('ef-prod').value.trim()||null,
        data_montagem:document.getElementById('ef-m1').value||null,
        data_montagem_fim:document.getElementById('ef-m2').value||null,
        hora_montagem:document.getElementById('ef-hm').value.trim()||null,
        data_evento_ini:document.getElementById('ef-e1').value||null,
        data_evento_fim:document.getElementById('ef-e2').value||null,
        hora_evento:document.getElementById('ef-he').value.trim()||null,
        data_desmontagem:document.getElementById('ef-d1').value||null,
        data_desmontagem_fim:document.getElementById('ef-d2').value||null,
        hora_desmontagem:document.getElementById('ef-hd').value.trim()||null,
        job_numero:document.getElementById('ef-job').value||null,
        obs:document.getElementById('ef-obs').value.trim()||null,
        atualizado_em:new Date().toISOString()
      };
      var p = it.id
        ? SS20.sbw('eventos?id=eq.'+it.id,'PATCH',body)
        : SS20.sbw('eventos','POST',body);
      p.then(function(){ f.innerHTML=''; return fetchAll(true); }).then(function(d2){ draw(c,d2); })
      .catch(function(e){ msg.textContent='Erro ao salvar: '+e.message; msg.style.color='var(--danger)'; });
    });
  }

  /* ═══════════════ BOARD DE TAREFAS POR JOB (modal, tipo Trello) ═══════════════ */

  function abrirTarefas(c,eventoId){
    fetchAll(true).then(function(d){
      var ev=null; d.evs.forEach(function(x){ if(x.id===eventoId) ev=x; });
      if(!ev){ alert('Evento não encontrado (pode ter sido excluído).'); return; }
      var listas=d.listas.filter(function(l){ return l.evento_id===eventoId; });
      if(!listas.length){
        var proms=LISTAS_PADRAO.map(function(nome,i){ return SS20.sbw('evento_listas','POST',{evento_id:eventoId,nome:nome,ordem:i}); });
        Promise.all(proms).then(function(){ abrirTarefas(c,eventoId); }).catch(function(e){ alert('Erro ao criar listas padrão: '+e.message); });
        return;
      }
      listas.sort(function(a,b){ return (a.ordem||0)-(b.ordem||0); });
      desenharModalTarefas(c,d,ev,listas);
    }).catch(function(e){ alert('Erro ao abrir tarefas: '+e.message); });
  }

  function refreshModal(c,eventoId){
    fetchAll(true).then(function(d2){
      draw(c,d2);
      var ev2=null; d2.evs.forEach(function(x){ if(x.id===eventoId) ev2=x; });
      if(!ev2) return;
      var listas2=d2.listas.filter(function(l){ return l.evento_id===eventoId; }).sort(function(a,b){ return (a.ordem||0)-(b.ordem||0); });
      if(listas2.length) desenharModalTarefas(c,d2,ev2,listas2);
    });
  }

  function cardTarefa(d,t){
    var itens=d.itens.filter(function(i){ return i.tarefa_id===t.id; }).sort(function(a,b){ return (a.ordem||0)-(b.ordem||0); });
    var feitos=itens.filter(function(i){ return i.feito; }).length;
    var anxT=d.anx.filter(function(a){ return a.entidade==='evento_tarefa' && a.entidade_id===t.id; });
    var cor=COR_HEX[t.cor]||'';
    var atrasada = t.prazo && !t.concluido && t.prazo<hojeStr();
    var h='<div style="background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:9px 10px;margin-bottom:7px;'+(t.concluido?'opacity:.55':'')+'">';
    if(cor) h+='<div style="height:5px;border-radius:3px;background:'+cor+';margin-bottom:6px"></div>';
    h+='<div style="font-size:12.5px;font-weight:600;'+(t.concluido?'text-decoration:line-through':'')+'">'+esc(t.titulo)+'</div>';
    h+='<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:5px;font-size:10.5px;color:var(--mut)">';
    if(t.prazo) h+='<span style="'+(atrasada?'color:var(--danger);font-weight:700':'')+'">🕐 '+dstrFull(t.prazo)+'</span>';
    if(itens.length) h+='<span>☑ '+feitos+'/'+itens.length+'</span>';
    if(anxT.length) h+='<span>📎 '+anxT.length+'</span>';
    h+='</div>';
    h+='<div style="display:flex;gap:5px;margin-top:7px">';
    h+='<button type="button" class="tf-tg" data-id="'+t.id+'" style="background:'+(t.concluido?'var(--ok-soft)':'var(--paper)')+';border:1px solid var(--line);font-size:10px;padding:2px 7px;border-radius:6px;cursor:pointer">'+(t.concluido?'✓':'○')+'</button>';
    h+='<button type="button" class="tf-ed" data-id="'+t.id+'" style="background:var(--paper);border:1px solid var(--line);font-size:10px;padding:2px 7px;border-radius:6px;cursor:pointer">'+(st.tarefaAberta===t.id?'▲':'abrir')+'</button>';
    h+='<button type="button" class="tf-del" data-id="'+t.id+'" style="background:none;border:1px solid var(--line);color:var(--danger);font-size:10px;padding:2px 7px;border-radius:6px;cursor:pointer">🗑</button>';
    h+='</div>';
    if(st.tarefaAberta===t.id){
      h+='<div style="margin-top:8px;border-top:1px solid var(--line);padding-top:8px">';
      h+='<textarea class="tf-desc" data-id="'+t.id+'" rows="2" placeholder="Descrição" style="width:100%;font-size:11px;padding:5px 7px;border:1px solid var(--line);border-radius:6px;font-family:inherit;margin-bottom:6px;box-sizing:border-box">'+esc(t.descricao||'')+'</textarea>';
      h+='<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">';
      h+='<input type="date" class="tf-prazo" data-id="'+t.id+'" value="'+(t.prazo||'')+'" style="font-size:11px;padding:5px 6px;border:1px solid var(--line);border-radius:6px">';
      h+='<select class="tf-cor" data-id="'+t.id+'" style="font-size:11px;padding:5px 6px;border:1px solid var(--line);border-radius:6px;background:var(--panel)">';
      CORES_LABEL.forEach(function(cl){ h+='<option value="'+cl[0]+'"'+(t.cor===cl[0]?' selected':'')+'>'+cl[1]+'</option>'; });
      h+='</select>';
      h+='<button type="button" class="tf-save" data-id="'+t.id+'" style="background:var(--accent);color:#fff;border:none;font-size:11px;padding:5px 10px;border-radius:6px;cursor:pointer">salvar</button>';
      h+='</div>';
      h+='<div style="font-size:10px;font-weight:700;color:var(--mut);text-transform:uppercase;margin-bottom:4px">Checklist</div>';
      itens.forEach(function(i){
        h+='<div style="display:flex;align-items:center;gap:6px;font-size:11.5px;margin-bottom:4px">'
          +'<input type="checkbox" class="ck-tg" data-id="'+i.id+'" '+(i.feito?'checked':'')+'>'
          +'<span style="flex:1;'+(i.feito?'text-decoration:line-through;color:var(--mut)':'')+'">'+esc(i.texto)+'</span>'
          +'<button type="button" class="ck-del" data-id="'+i.id+'" style="background:none;border:none;color:var(--danger);font-size:11px;cursor:pointer">✕</button></div>';
      });
      h+='<div style="display:flex;gap:5px;margin-top:5px;margin-bottom:10px">'
        +'<input type="text" class="ck-in" data-id="'+t.id+'" placeholder="item do checklist" style="flex:1;font-size:11px;padding:5px 7px;border:1px solid var(--line);border-radius:6px;font-family:inherit">'
        +'<button type="button" class="ck-add" data-id="'+t.id+'" style="background:var(--paper);border:1px solid var(--line);font-size:11px;padding:5px 9px;border-radius:6px;cursor:pointer">+ item</button></div>';
      h+='<div style="font-size:10px;font-weight:700;color:var(--mut);text-transform:uppercase;margin-bottom:4px;border-top:1px solid var(--line);padding-top:8px">Anexos</div>';
      anxT.forEach(function(a){
        var href=a.formato==='upload'?dataUrl(a):a.dados;
        h+='<div style="display:flex;align-items:center;gap:6px;font-size:11px;margin-bottom:5px">'
          +'<a href="'+esc(href)+'" target="_blank" download="'+esc(a.nome_arquivo||'')+'" style="color:var(--blue);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(a.formato==='upload'?'📎':'🔗')+' '+esc(a.nome_arquivo)+'</a>'
          +'<button type="button" class="tk-anx-del" data-id="'+a.id+'" style="background:none;border:none;color:var(--danger);font-size:11px;cursor:pointer">✕</button></div>';
      });
      h+='<label style="display:inline-block;font-size:10.5px;font-weight:600;color:var(--accent);cursor:pointer;padding:3px 0">+ arquivo (até 9MB)'
        +'<input type="file" class="tk-upfile" data-id="'+t.id+'" style="display:none"></label>';
      h+='<div style="display:flex;gap:5px;margin-top:5px">'
        +'<input type="text" class="tk-linkin" data-id="'+t.id+'" placeholder="nome | link do Drive" style="flex:1;font-size:11px;padding:5px 7px;border:1px solid var(--line);border-radius:6px;font-family:inherit">'
        +'<button type="button" class="tk-linkadd" data-id="'+t.id+'" style="background:var(--paper);border:1px solid var(--line);font-size:11px;padding:5px 9px;border-radius:6px;cursor:pointer">+ link</button></div>';
      h+='</div>';
    }
    h+='</div>';
    return h;
  }

  function colunaLista(d,evento,lista){
    var tarefas=d.tarefas.filter(function(t){ return t.lista_id===lista.id; }).sort(function(a,b){ return (a.ordem||0)-(b.ordem||0); });
    var h='<div style="flex:0 0 252px;background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:10px">';
    h+='<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">';
    h+='<div style="font-size:11px;font-weight:700;color:var(--mut);text-transform:uppercase;letter-spacing:.4px;flex:1">'+esc(lista.nome)+' <span style="color:var(--ink)">'+tarefas.length+'</span></div>';
    h+='<button type="button" class="ls-del" data-id="'+lista.id+'" style="background:none;border:none;color:var(--mut);font-size:11px;cursor:pointer">🗑</button>';
    h+='</div>';
    tarefas.forEach(function(t){ h+=cardTarefa(d,t); });
    h+='<div style="display:flex;gap:5px;margin-top:4px">'
      +'<input type="text" class="tf-in" data-lista="'+lista.id+'" placeholder="+ tarefa" style="flex:1;font-size:11.5px;padding:6px 8px;border:1px solid var(--line);border-radius:6px;font-family:inherit">'
      +'<button type="button" class="tf-add" data-lista="'+lista.id+'" data-evento="'+evento.id+'" style="background:var(--accent);color:#fff;border:none;font-size:11px;padding:6px 10px;border-radius:6px;cursor:pointer">+</button></div>';
    h+='</div>';
    return h;
  }

  function desenharModalTarefas(c,d,evento,listas){
    var old=document.getElementById('ev-tarefas-modal'); if(old && old.parentNode) old.parentNode.removeChild(old);
    var ov=document.createElement('div');
    ov.id='ev-tarefas-modal';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto';

    var titulo=evento.nome_evento||'Evento';
    var h='<div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;max-width:1200px;width:100%;margin:auto;padding:18px;box-shadow:0 20px 60px -20px rgba(0,0,0,.6)">';
    h+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">';
    h+='<h3 style="font-family:var(--font-d);font-size:17px;flex:1">📋 '+esc(titulo)+'</h3>';
    h+='<button type="button" id="tf-fechar" style="background:none;border:none;font-size:22px;color:var(--mut);cursor:pointer;line-height:1">×</button>';
    h+='</div>';
    h+='<div id="tf-board" style="display:flex;gap:10px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:8px">';
    listas.forEach(function(l){ h+=colunaLista(d,evento,l); });
    h+='<div style="flex:0 0 220px">';
    h+='<input type="text" id="ls-novanome" placeholder="nome da lista" style="width:100%;font-size:12px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-family:inherit;margin-bottom:6px;box-sizing:border-box">';
    h+='<button type="button" id="ls-add" style="width:100%;background:var(--paper);border:1px solid var(--line);font-size:12px;padding:8px;border-radius:8px;cursor:pointer">+ lista</button>';
    h+='</div>';
    h+='</div></div>';
    ov.innerHTML=h;
    document.body.appendChild(ov);

    bindModalTarefas(c,d,evento,ov);
  }

  function bindModalTarefas(c,d,evento,ov){
    function fechar(){ if(ov.parentNode) ov.parentNode.removeChild(ov); st.tarefaAberta=null; }
    function err(e){ alert('Erro: '+e.message); }
    document.getElementById('tf-fechar').addEventListener('click',fechar);
    ov.addEventListener('click',function(e){ if(e.target===ov) fechar(); });

    document.getElementById('ls-add').addEventListener('click',function(){
      var inp=document.getElementById('ls-novanome'); var nome=inp.value.trim(); if(!nome)return;
      var maxOrd=-1; d.listas.forEach(function(l){ if(l.evento_id===evento.id && l.ordem>maxOrd) maxOrd=l.ordem; });
      SS20.sbw('evento_listas','POST',{evento_id:evento.id,nome:nome,ordem:maxOrd+1}).then(function(){ refreshModal(c,evento.id); }).catch(err);
    });

    q(ov,'.ls-del',function(el){
      if(!confirm('Excluir esta lista e todas as tarefas dela?'))return;
      var listaId=el.getAttribute('data-id');
      var tarefasDaLista=d.tarefas.filter(function(t){ return t.lista_id===listaId; });
      var proms=tarefasDaLista.map(function(t){ return SS20.sbw('evento_tarefas?id=eq.'+t.id,'PATCH',{deletado_em:new Date().toISOString()}); });
      proms.push(SS20.sbw('evento_listas?id=eq.'+listaId,'PATCH',{deletado_em:new Date().toISOString()}));
      Promise.all(proms).then(function(){ refreshModal(c,evento.id); }).catch(err);
    });

    q(ov,'.tf-add',function(el){
      var listaId=el.getAttribute('data-lista'); var evId=el.getAttribute('data-evento');
      var inp=ov.querySelector('.tf-in[data-lista="'+listaId+'"]'); var tit=inp.value.trim(); if(!tit)return;
      var maxOrd=-1; d.tarefas.forEach(function(t){ if(t.lista_id===listaId && t.ordem>maxOrd) maxOrd=t.ordem; });
      SS20.sbw('evento_tarefas','POST',{lista_id:listaId,evento_id:evId,titulo:tit,ordem:maxOrd+1,concluido:false}).then(function(){ refreshModal(c,evento.id); }).catch(err);
    });

    q(ov,'.tf-tg',function(el){
      var id=el.getAttribute('data-id'); var t=null; d.tarefas.forEach(function(x){ if(x.id===id) t=x; }); if(!t)return;
      SS20.sbw('evento_tarefas?id=eq.'+id,'PATCH',{concluido:!t.concluido,atualizado_em:new Date().toISOString()}).then(function(){ refreshModal(c,evento.id); }).catch(err);
    });
    q(ov,'.tf-ed',function(el){
      var id=el.getAttribute('data-id'); st.tarefaAberta=(st.tarefaAberta===id?null:id);
      var listasAgora=d.listas.filter(function(l){ return l.evento_id===evento.id; }).sort(function(a,b){ return (a.ordem||0)-(b.ordem||0); });
      desenharModalTarefas(c,d,evento,listasAgora);
    });
    q(ov,'.tf-del',function(el){
      if(!confirm('Excluir esta tarefa?'))return;
      SS20.sbw('evento_tarefas?id=eq.'+el.getAttribute('data-id'),'PATCH',{deletado_em:new Date().toISOString()}).then(function(){ refreshModal(c,evento.id); }).catch(err);
    });
    q(ov,'.tf-save',function(el){
      var id=el.getAttribute('data-id');
      var desc=ov.querySelector('.tf-desc[data-id="'+id+'"]').value.trim();
      var prazo=ov.querySelector('.tf-prazo[data-id="'+id+'"]').value||null;
      var cor=ov.querySelector('.tf-cor[data-id="'+id+'"]').value||null;
      SS20.sbw('evento_tarefas?id=eq.'+id,'PATCH',{descricao:desc||null,prazo:prazo,cor:cor,atualizado_em:new Date().toISOString()}).then(function(){ refreshModal(c,evento.id); }).catch(err);
    });
    q(ov,'.ck-add',function(el){
      var tid=el.getAttribute('data-id');
      var inp=ov.querySelector('.ck-in[data-id="'+tid+'"]'); var txt=inp.value.trim(); if(!txt)return;
      var maxOrd=-1; d.itens.forEach(function(i){ if(i.tarefa_id===tid && i.ordem>maxOrd) maxOrd=i.ordem; });
      SS20.sbw('evento_tarefa_itens','POST',{tarefa_id:tid,texto:txt,ordem:maxOrd+1,feito:false}).then(function(){ refreshModal(c,evento.id); }).catch(err);
    });
    q(ov,'.ck-del',function(el){
      SS20.sbw('evento_tarefa_itens?id=eq.'+el.getAttribute('data-id'),'PATCH',{deletado_em:new Date().toISOString()}).then(function(){ refreshModal(c,evento.id); }).catch(err);
    });

    q(ov,'.tk-anx-del',function(el){
      SS20.sbw('anexos?id=eq.'+el.getAttribute('data-id'),'PATCH',{deletado_em:new Date().toISOString()}).then(function(){ refreshModal(c,evento.id); }).catch(err);
    });
    q(ov,'.tk-linkadd',function(el){
      var tid=el.getAttribute('data-id');
      var inp=ov.querySelector('.tk-linkin[data-id="'+tid+'"]'); var txt=inp.value.trim(); if(!txt)return;
      var parts=txt.split('|'); var nome=(parts[0]||'link').trim(); var url=(parts[1]||parts[0]||'').trim();
      SS20.sbw('anexos','POST',{entidade:'evento_tarefa',entidade_id:tid,nome_arquivo:nome,formato:'link',dados:url,criado_por:meEmail()}).then(function(){ refreshModal(c,evento.id); }).catch(err);
    });

    var upsT=ov.querySelectorAll('.tk-upfile');
    for(var k=0;k<upsT.length;k++){
      upsT[k].addEventListener('change',function(){
        var tid=this.getAttribute('data-id'); var file=this.files&&this.files[0]; if(!file)return;
        if(file.size>MAX_BYTES){ alert('Arquivo muito grande ('+kb(file.size)+'). Limite 9MB.'); return; }
        var rd=new FileReader();
        rd.onload=function(){
          var body={entidade:'evento_tarefa',entidade_id:tid,nome_arquivo:file.name,formato:'upload',mime:file.type||'application/octet-stream',tamanho:file.size,dados:String(rd.result),criado_por:meEmail()};
          SS20.sbw('anexos','POST',body).then(function(){ refreshModal(c,evento.id); }).catch(err);
        };
        rd.onerror=function(){ alert('Não consegui ler o arquivo.'); };
        rd.readAsDataURL(file);
      });
    }

    var cks=ov.querySelectorAll('.ck-tg');
    for(var j=0;j<cks.length;j++){
      cks[j].addEventListener('change',function(){
        var id=this.getAttribute('data-id'); var checked=this.checked;
        SS20.sbw('evento_tarefa_itens?id=eq.'+id,'PATCH',{feito:checked}).then(function(){ refreshModal(c,evento.id); }).catch(err);
      });
    }
  }

  SS20.modules.eventos={render:render};
})();
