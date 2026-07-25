/* ═══════════════════════════════════════════════════════════════
   SULSIGN OS 2.0 — MÓDULO: CENTRAL (central)
   Mural interno de recados / tarefas / notas entre Carlos e equipe
   (ex.: Ohanna). Feed estilo mensageria + kanban, thread de
   comentários, prioridade, prazo (→ Google Agenda), link interno
   ao job e anexos. Requer: central_itens, central_comentarios,
   anexos (SQL: schema_mkt_central.sql).
   ═══════════════════════════════════════════════════════════════ */
(function(){
  var st={ vista:'feed', status:'', cat:'', tipo:'', aberto:null };

  var TIPOS=['Recado','Tarefa','Nota'];
  var STATS=['A Fazer','Fazendo','Feito','Arquivado'];
  var PRIOS=['Baixa','Normal','Alta','Urgente'];
  var CATS =['Mídias Sociais','Financeiro','Produção','Comercial','Pessoal','Geral'];
  var CPRIO={ 'Baixa':['var(--mut)','var(--paper)'], 'Normal':['var(--blue)','var(--blue-soft)'],
    'Alta':['var(--warn)','var(--warn-soft)'], 'Urgente':['var(--danger)','var(--danger-soft)'] };
  var ITIPO={ 'Recado':'💬','Tarefa':'✔','Nota':'📝' };

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function isTreino(x){ return (x||'').indexOf('TREINO')>=0; }
  function meEmail(){ try{ return (JSON.parse(localStorage.getItem('sulsign_session')||'{}').email)||''; }catch(e){ return ''; } }
  function ini(s){ s=String(s||'?'); return s.charAt(0).toUpperCase(); }
  function dfull(d){ if(!d)return ''; var t=String(d).split('T'); var p=(t[0]||'').split('-'); var hr=(t[1]||'').slice(0,5); return p.length===3?(p[2]+'/'+p[1]+'/'+p[0]+(hr?' '+hr:'')):d; }
  function quando(d){ if(!d)return ''; var dt=new Date(d); if(isNaN(dt))return dfull(d);
    var s=Math.floor((Date.now()-dt.getTime())/1000);
    if(s<60)return 'agora'; if(s<3600)return Math.floor(s/60)+'min'; if(s<86400)return Math.floor(s/3600)+'h';
    if(s<604800)return Math.floor(s/86400)+'d'; return dfull(d).slice(0,10); }
  function atrasado(d){ if(!d)return false; var dt=new Date(d); return !isNaN(dt)&&dt.getTime()<Date.now(); }
  function pprio(p){ var c=CPRIO[p]||CPRIO['Normal']; return '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;color:'+c[0]+';background:'+c[1]+'">'+esc(p)+'</span>'; }
  function gcal(txt,det,when){ if(!when)return ''; var d=new Date(when); if(isNaN(d))return '';
    function z(dt){ return dt.getUTCFullYear()+''+('0'+(dt.getUTCMonth()+1)).slice(-2)+('0'+dt.getUTCDate()).slice(-2)+'T'+('0'+dt.getUTCHours()).slice(-2)+('0'+dt.getUTCMinutes()).slice(-2)+'00Z'; }
    var fim=new Date(d.getTime()+30*60000);
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text='+encodeURIComponent(txt)+'&details='+encodeURIComponent(det||'')+'&dates='+z(d)+'/'+z(fim); }

  function fetchAll(force){
    if(SS20.cache.central&&!force) return Promise.resolve(SS20.cache.central);
    return Promise.all([
      SS20.sb('central_itens?select=*&deletado_em=is.null&order=criado_em.desc'),
      SS20.sb('central_comentarios?select=*&deletado_em=is.null&order=criado_em.asc'),
      SS20.sb('anexos?select=*&entidade=eq.central_item&deletado_em=is.null&order=criado_em.asc'),
      SS20.sb('orcamentos?select=numero,cliente&deletado_em=is.null&order=numero.desc').catch(function(){return [];})
    ]).then(function(r){
      var data={ itens:r[0].filter(function(i){return !isTreino(i.titulo);}), coments:r[1], anexos:r[2], orcs:r[3]||[] };
      SS20.cache.central=data; return data;
    });
  }

  function render(c){
    fetchAll().then(function(d){ draw(c,d); }).catch(function(e){
      if(String(e.message).indexOf('404')>=0 || String(e.message).indexOf('PGRST')>=0){
        c.innerHTML='<div class="placeholder-view"><h2>Central</h2>'
          +'<p>As tabelas <b>central_itens</b> / <b>central_comentarios</b> ainda não existem no Supabase.</p>'
          +'<p>Rode o arquivo <b>schema_mkt_central.sql</b> no SQL Editor e recarregue.</p></div>';
        return;
      }
      c.innerHTML='<div class="err-view">Erro: '+esc(e.message)+'</div>';
    });
  }

  function draw(c,d){
    var eu=meEmail();
    var filt=d.itens.filter(function(i){
      if(st.status&&i.status!==st.status)return false;
      if(st.cat&&i.categoria!==st.cat)return false;
      if(st.tipo&&i.tipo!==st.tipo)return false;
      if(st.vista==='kanban'&&i.status==='Arquivado')return false;
      return true;
    });
    var naoLidos=d.itens.filter(function(i){ return !i.lido && i.criado_por!==eu; }).length;
    var pend=d.itens.filter(function(i){ return i.tipo==='Tarefa' && i.status!=='Feito' && i.status!=='Arquivado'; }).length;

    var h='<div style="padding:24px 26px">';
    h+='<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:4px">';
    h+='<h2 style="font-family:var(--font-d);font-size:19px">Central</h2>';
    if(naoLidos) h+='<span style="background:var(--danger);color:#fff;font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px">'+naoLidos+' não lido'+(naoLidos>1?'s':'')+'</span>';
    h+='<span style="flex:1"></span>';
    h+='<div style="display:flex;border:1px solid var(--line);border-radius:8px;overflow:hidden">';
    h+='<button type="button" class="ce-vw" data-v="feed" style="border:none;padding:7px 12px;font-size:12px;cursor:pointer;background:'+(st.vista==='feed'?'var(--accent)':'var(--panel)')+';color:'+(st.vista==='feed'?'#fff':'var(--ink)')+'">Feed</button>';
    h+='<button type="button" class="ce-vw" data-v="kanban" style="border:none;border-left:1px solid var(--line);padding:7px 12px;font-size:12px;cursor:pointer;background:'+(st.vista==='kanban'?'var(--accent)':'var(--panel)')+';color:'+(st.vista==='kanban'?'#fff':'var(--ink)')+'">Quadro</button>';
    h+='</div>';
    h+='<button type="button" id="ce-novo" style="background:var(--accent);color:#fff;border:none;font-size:12.5px;font-weight:600;padding:8px 14px;border-radius:8px;cursor:pointer">⊕ Novo</button>';
    h+='</div>';
    h+='<p style="color:var(--mut);font-size:12.5px;margin-bottom:14px">'+d.itens.length+' itens · '+pend+' tarefa'+(pend===1?'':'s')+' em aberto</p>';

    h+='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">';
    h+=selEl('ce-ftipo','Todos os tipos',TIPOS,st.tipo);
    h+=selEl('ce-fst','Todos os status',STATS,st.status);
    h+=selEl('ce-fcat','Todas as categorias',CATS,st.cat);
    h+='</div>';

    h+='<div id="ce-form"></div>';
    h+='<div id="ce-body"></div>';
    h+='</div>';
    c.innerHTML=h;

    document.getElementById('ce-novo').addEventListener('click',function(){ form(c,d,null); });
    bindSel('ce-ftipo',function(v){st.tipo=v;draw(c,d);});
    bindSel('ce-fst',function(v){st.status=v;draw(c,d);});
    bindSel('ce-fcat',function(v){st.cat=v;draw(c,d);});
    var vws=c.querySelectorAll('.ce-vw'); for(var i=0;i<vws.length;i++){ vws[i].addEventListener('click',function(){ st.vista=this.getAttribute('data-v'); draw(c,d); }); }

    if(st.vista==='kanban') drawKanban(c,d,filt); else drawFeed(c,d,filt);
  }

  function selEl(id,todos,arr,cur){ var h='<select id="'+id+'" style="padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:12.5px;font-family:inherit;background:var(--panel)"><option value="">'+todos+'</option>';
    arr.forEach(function(v){ h+='<option'+(cur===v?' selected':'')+'>'+v+'</option>'; }); return h+'</select>'; }
  function bindSel(id,cb){ var e=document.getElementById(id); if(e)e.addEventListener('change',function(){cb(this.value);}); }

  function itemCard(c,d,i,compact){
    var eu=meEmail();
    var cms=d.coments.filter(function(x){return x.item_id===i.id;});
    var anx=d.anexos.filter(function(x){return x.entidade_id===i.id;});
    var novo=(!i.lido && i.criado_por!==eu);
    var brdL=novo?'var(--accent)':(CPRIO[i.prioridade]||['var(--line)'])[0];
    var h='<div style="background:var(--panel);border:1px solid var(--line);border-left:3px solid '+brdL+';border-radius:var(--radius);padding:13px 15px;margin-bottom:'+(compact?'8px':'10px')+'">';
    h+='<div style="display:flex;gap:9px;align-items:flex-start">';
    h+='<div style="width:28px;height:28px;border-radius:50%;background:var(--ink);color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+ini(i.criado_por)+'</div>';
    h+='<div style="flex:1;min-width:0">';
    h+='<div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;margin-bottom:3px">';
    h+='<span style="font-size:13px">'+(ITIPO[i.tipo]||'')+'</span>';
    h+='<span style="font-weight:800;font-family:var(--font-d);font-size:14px">'+esc(i.titulo)+'</span>';
    if(novo) h+='<span style="background:var(--accent);color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:10px">NOVO</span>';
    h+='<span style="flex:1"></span>'+pprio(i.prioridade);
    h+='</div>';
    h+='<div style="font-size:11px;color:var(--mut);margin-bottom:'+(i.corpo?'7px':'2px')+'">'
      +esc(i.criado_por||'—')+' · '+quando(i.criado_em)
      +(i.categoria?' · '+esc(i.categoria):'')
      +(i.atribuido_a?' · para <b>'+esc(i.atribuido_a)+'</b>':'')+'</div>';
    if(i.corpo) h+='<div style="font-size:13px;line-height:1.55;white-space:pre-wrap;margin-bottom:8px">'+esc(i.corpo)+'</div>';

    h+='<div style="display:flex;gap:12px;font-size:11px;color:var(--mut);flex-wrap:wrap;align-items:center;margin-bottom:6px">';
    if(i.prazo){ var atr=atrasado(i.prazo)&&i.status!=='Feito'; h+='<span style="'+(atr?'color:var(--danger);font-weight:700':'')+'">⏰ '+dfull(i.prazo)+(atr?' (atrasado)':'')+'</span>'; }
    if(i.tipo==='Tarefa') h+='<span style="font-weight:600">['+esc(i.status)+']</span>';
    if(i.job_numero) h+='<button type="button" data-action="nav" data-view="orc" style="background:var(--accent-soft);color:var(--accent);border:none;font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;cursor:pointer">🔗 '+esc(i.job_numero)+'</button>';
    var g=gcal(i.titulo,i.corpo||'',i.prazo); if(g) h+='<a href="'+g+'" target="_blank" style="color:var(--blue)">＋ Agenda</a>';
    anx.forEach(function(a){ h+='<a href="'+esc(a.storage_path)+'" target="_blank" style="color:var(--blue)">📎 '+esc(a.nome_arquivo)+'</a>'; });
    h+='</div>';

    // ações
    h+='<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">';
    if(novo) h+='<button type="button" class="ce-lido" data-id="'+i.id+'" style="background:var(--ok-soft);border:1px solid var(--ok);color:var(--ok);font-size:11px;padding:4px 10px;border-radius:7px;cursor:pointer">✓ Lido</button>';
    if(i.tipo==='Tarefa') h+=moveBtns(i);
    h+='<button type="button" class="ce-cmt" data-id="'+i.id+'" style="background:var(--paper);border:1px solid var(--line);font-size:11px;padding:4px 10px;border-radius:7px;cursor:pointer">💬 '+(cms.length||'')+' '+(st.aberto===i.id?'▲':'responder')+'</button>';
    h+='<button type="button" class="ce-ed" data-id="'+i.id+'" style="background:var(--paper);border:1px solid var(--line);font-size:11px;padding:4px 10px;border-radius:7px;cursor:pointer">✎</button>';
    h+='<button type="button" class="ce-del" data-id="'+i.id+'" style="background:none;border:1px solid var(--line);color:var(--danger);font-size:11px;padding:4px 10px;border-radius:7px;cursor:pointer">🗑</button>';
    h+='</div>';

    // thread
    if(st.aberto===i.id){
      h+='<div style="margin-top:10px;border-top:1px solid var(--line);padding-top:10px">';
      cms.forEach(function(m){
        h+='<div style="display:flex;gap:8px;margin-bottom:8px">'
          +'<div style="width:22px;height:22px;border-radius:50%;background:var(--ink2);color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+ini(m.autor)+'</div>'
          +'<div style="flex:1"><div style="font-size:10.5px;color:var(--mut)">'+esc(m.autor||'—')+' · '+quando(m.criado_em)+'</div>'
          +'<div style="font-size:12.5px;line-height:1.5;white-space:pre-wrap">'+esc(m.corpo)+'</div></div></div>';
      });
      h+='<div style="display:flex;gap:6px;margin-top:6px">'
        +'<input type="text" class="ce-cin" data-id="'+i.id+'" placeholder="Escrever resposta…" style="flex:1;padding:7px 10px;border:1px solid var(--line);border-radius:8px;font-size:12.5px;font-family:inherit">'
        +'<button type="button" class="ce-csend" data-id="'+i.id+'" style="background:var(--accent);color:#fff;border:none;font-size:12px;font-weight:600;padding:7px 14px;border-radius:8px;cursor:pointer">Enviar</button></div>';
      h+='</div>';
    }
    h+='</div></div>';
    return h;
  }

  function moveBtns(i){
    var idx=STATS.indexOf(i.status), h='';
    if(idx>0&&idx<3) h+='<button type="button" class="ce-mv" data-id="'+i.id+'" data-to="'+STATS[idx-1]+'" style="background:var(--paper);border:1px solid var(--line);font-size:11px;padding:4px 8px;border-radius:7px;cursor:pointer">←</button>';
    if(idx>=0&&idx<2) h+='<button type="button" class="ce-mv" data-id="'+i.id+'" data-to="'+STATS[idx+1]+'" style="background:var(--ok-soft);border:1px solid var(--ok);color:var(--ok);font-size:11px;font-weight:600;padding:4px 10px;border-radius:7px;cursor:pointer">→ '+STATS[idx+1]+'</button>';
    if(i.status==='Feito') h+='<button type="button" class="ce-mv" data-id="'+i.id+'" data-to="Arquivado" style="background:var(--paper);border:1px solid var(--line);color:var(--mut);font-size:11px;padding:4px 10px;border-radius:7px;cursor:pointer">Arquivar</button>';
    return h;
  }

  function drawFeed(c,d,filt){
    var b=document.getElementById('ce-body');
    if(!filt.length){ b.innerHTML='<div style="color:var(--mut);font-size:13px;padding:20px 0">Nada por aqui. Use “Novo” para deixar um recado, tarefa ou nota.</div>'; bindBody(c,d); return; }
    var h=''; filt.forEach(function(i){ h+=itemCard(c,d,i,false); });
    b.innerHTML=h; bindBody(c,d);
  }

  function drawKanban(c,d,filt){
    var b=document.getElementById('ce-body');
    var cols=['A Fazer','Fazendo','Feito'];
    var h='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;align-items:start">';
    cols.forEach(function(col){
      var its=filt.filter(function(i){return i.status===col;});
      h+='<div style="background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:10px;min-height:120px">'
        +'<div style="font-size:11px;font-weight:700;color:var(--mut);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">'+col+' <span style="color:var(--ink)">'+its.length+'</span></div>';
      its.forEach(function(i){ h+=itemCard(c,d,i,true); });
      if(!its.length) h+='<div style="font-size:11.5px;color:var(--mut);padding:8px 2px">—</div>';
      h+='</div>';
    });
    h+='</div>';
    h+='<p style="font-size:11px;color:var(--mut);margin-top:10px">O quadro mostra apenas itens do tipo Tarefa com status. Recados e notas ficam no Feed.</p>';
    b.innerHTML=h; bindBody(c,d);
  }

  function bindBody(c,d){
    var eu=meEmail();
    function refresh(){ fetchAll(true).then(function(d2){ draw(c,d2); }); }
    q(c,'.ce-lido',function(el){ SS20.sbw('central_itens?id=eq.'+el.getAttribute('data-id'),'PATCH',{lido:true,atualizado_em:new Date().toISOString()}).then(refresh).catch(err); });
    q(c,'.ce-mv',function(el){ SS20.sbw('central_itens?id=eq.'+el.getAttribute('data-id'),'PATCH',{status:el.getAttribute('data-to'),atualizado_em:new Date().toISOString()}).then(refresh).catch(err); });
    q(c,'.ce-del',function(el){ if(!confirm('Excluir este item?'))return; SS20.sbw('central_itens?id=eq.'+el.getAttribute('data-id'),'PATCH',{deletado_em:new Date().toISOString()}).then(refresh).catch(err); });
    q(c,'.ce-ed',function(el){ var id=el.getAttribute('data-id'); var it=null; d.itens.forEach(function(i){if(i.id===id)it=i;}); form(c,d,it); });
    q(c,'.ce-cmt',function(el){ var id=el.getAttribute('data-id'); st.aberto=(st.aberto===id?null:id);
      if(st.aberto){ var it=null; d.itens.forEach(function(i){if(i.id===id)it=i;}); if(it&&!it.lido&&it.criado_por!==eu){ SS20.sbw('central_itens?id=eq.'+id,'PATCH',{lido:true}).then(function(){}).catch(function(){}); it.lido=true; } }
      draw(c,d); });
    q(c,'.ce-csend',function(el){ var id=el.getAttribute('data-id');
      var inp=c.querySelector('.ce-cin[data-id="'+id+'"]'); if(!inp)return; var txt=inp.value.trim(); if(!txt)return;
      SS20.sbw('central_comentarios','POST',{item_id:id,autor:eu,corpo:txt}).then(refresh).catch(err); });
    // enter no input de comentário
    var ins=c.querySelectorAll('.ce-cin'); for(var i=0;i<ins.length;i++){ ins[i].addEventListener('keydown',function(e){ if(e.key==='Enter'){ var id=this.getAttribute('data-id'); var btn=c.querySelector('.ce-csend[data-id="'+id+'"]'); if(btn)btn.click(); } }); }
    function err(e){ alert('Erro: '+e.message); }
  }
  function q(c,sel,cb){ var els=c.querySelectorAll(sel); for(var i=0;i<els.length;i++){ els[i].addEventListener('click',function(){ cb(this); }); } }

  function form(c,d,it){
    it=it||{};
    var f=document.getElementById('ce-form');
    function opt(arr,cur){ var o=''; arr.forEach(function(v){o+='<option'+(cur===v?' selected':'')+'>'+v+'</option>';}); return o; }
    var opsJob='<option value="">— sem job —</option>'; var vist={};
    d.orcs.forEach(function(o){ if(o.numero&&!vist[o.numero]){ vist[o.numero]=1; opsJob+='<option value="'+esc(o.numero)+'"'+(it.job_numero===o.numero?' selected':'')+'>'+esc(o.numero)+(o.cliente?' — '+esc(o.cliente):'')+'</option>'; } });
    var lab='display:block;font-size:10.5px;font-weight:600;color:var(--mut);margin-bottom:3px';
    var inp='padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit';
    f.innerHTML='<div style="background:var(--panel);border:2px solid var(--accent);border-radius:var(--radius);padding:18px;margin-bottom:16px">'
      +'<div style="font-size:12px;font-weight:700;margin-bottom:12px">'+(it.id?'Editar item':'Novo item')+'</div>'
      +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">'
        +'<div><label style="'+lab+'">Tipo</label><select id="cf-tip" style="'+inp+';background:var(--panel)">'+opt(TIPOS,it.tipo||'Recado')+'</select></div>'
        +'<div><label style="'+lab+'">Prioridade</label><select id="cf-pri" style="'+inp+';background:var(--panel)">'+opt(PRIOS,it.prioridade||'Normal')+'</select></div>'
        +'<div><label style="'+lab+'">Categoria</label><select id="cf-cat" style="'+inp+';background:var(--panel)">'+opt(CATS,it.categoria||'Geral')+'</select></div>'
        +'<div><label style="'+lab+'">Status (tarefa)</label><select id="cf-sta" style="'+inp+';background:var(--panel)">'+opt(STATS,it.status||'A Fazer')+'</select></div>'
      +'</div>'
      +'<div style="margin-bottom:10px"><label style="'+lab+'">Título *</label><input id="cf-tit" type="text" value="'+esc(it.titulo||'')+'" style="width:100%;'+inp+'"></div>'
      +'<div style="margin-bottom:10px"><label style="'+lab+'">Mensagem / detalhes</label><textarea id="cf-corp" rows="3" style="width:100%;'+inp+'">'+esc(it.corpo||'')+'</textarea></div>'
      +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">'
        +'<div style="min-width:150px"><label style="'+lab+'">Atribuir a</label><input id="cf-atr" type="text" list="cf-people" value="'+esc(it.atribuido_a||'')+'" placeholder="Ohanna" style="width:100%;'+inp+'">'
        +'<datalist id="cf-people"><option>Ohanna</option><option>Fernando</option><option>Everson</option><option>Edson</option><option>Pondé</option></datalist></div>'
        +'<div><label style="'+lab+'">Prazo</label><input id="cf-prz" type="datetime-local" value="'+(it.prazo?String(it.prazo).slice(0,16):'')+'" style="'+inp+'"></div>'
        +'<div style="flex:1;min-width:170px"><label style="'+lab+'">Job / Orçamento (link)</label><select id="cf-job" style="width:100%;'+inp+';background:var(--panel)">'+opsJob+'</select></div>'
      +'</div>'
      +'<div style="margin-bottom:12px"><label style="'+lab+'">Anexo (link) — nome | url</label>'
        +'<input id="cf-anx" type="text" placeholder="briefing.pdf | https://drive.google.com/…" style="width:100%;'+inp+'"></div>'
      +'<div style="display:flex;gap:8px"><button type="button" id="cf-save" style="background:var(--accent);color:#fff;border:none;font-size:12.5px;font-weight:600;padding:9px 16px;border-radius:8px;cursor:pointer">💾 Salvar</button>'
      +'<button type="button" id="cf-cancel" style="background:var(--paper);border:1px solid var(--line);font-size:12.5px;padding:9px 16px;border-radius:8px;cursor:pointer">Cancelar</button></div>'
      +'<div id="cf-msg" style="font-size:11.5px;margin-top:8px"></div></div>';
    try{f.scrollIntoView({behavior:'smooth',block:'nearest'});}catch(e){}

    document.getElementById('cf-cancel').addEventListener('click',function(){ f.innerHTML=''; });
    document.getElementById('cf-save').addEventListener('click',function(){
      var tit=document.getElementById('cf-tit').value.trim();
      var msg=document.getElementById('cf-msg');
      if(!tit){ msg.textContent='Informe um título.'; msg.style.color='var(--danger)'; return; }
      var prz=document.getElementById('cf-prz').value;
      var body={
        tipo:document.getElementById('cf-tip').value, prioridade:document.getElementById('cf-pri').value,
        categoria:document.getElementById('cf-cat').value, status:document.getElementById('cf-sta').value,
        titulo:tit, corpo:document.getElementById('cf-corp').value.trim()||null,
        atribuido_a:document.getElementById('cf-atr').value.trim()||null, prazo:prz?prz:null,
        job_numero:document.getElementById('cf-job').value||null, atualizado_em:new Date().toISOString()
      };
      var anx=document.getElementById('cf-anx').value.trim();
      var p = it.id
        ? SS20.sbw('central_itens?id=eq.'+it.id,'PATCH',body)
        : SS20.sbw('central_itens','POST',(body.criado_por=meEmail(),body.lido=false,body));
      p.then(function(){
        if(!anx) return null;
        return SS20.sb('central_itens?select=id&titulo=eq.'+encodeURIComponent(tit)+'&deletado_em=is.null&order=criado_em.desc&limit=1').then(function(rows){
          var iid=it.id||(rows&&rows[0]&&rows[0].id); if(!iid)return null;
          var parts=anx.split('|'); var nome=(parts[0]||'anexo').trim(); var url=(parts[1]||parts[0]||'').trim();
          return SS20.sbw('anexos','POST',{entidade:'central_item',entidade_id:iid,nome_arquivo:nome,storage_path:url,criado_por:meEmail()});
        });
      }).then(function(){ return fetchAll(true); }).then(function(d2){ draw(c,d2); })
      .catch(function(e){ msg.textContent='Erro ao salvar: '+e.message; msg.style.color='var(--danger)'; });
    });
  }

  SS20.modules.central={render:render};
})();
