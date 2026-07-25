/* ═══════════════════════════════════════════════════════════════
   SULSIGN OS 2.0 — MÓDULO: MARKETING / MÍDIAS SOCIAIS (mkt)
   Calendário editorial de posts por canal, ciclo de produção,
   link interno para o job/orçamento, anexos e métricas.
   Requer tabelas: mkt_posts, anexos (SQL: schema_mkt_central.sql).
   ═══════════════════════════════════════════════════════════════ */
(function(){
  var st={ status:'', canal:'', vista:'lista', mes:(function(){var d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2);})() };

  var CANAIS=['Instagram','Facebook','LinkedIn','TikTok','YouTube','WhatsApp','Site/Blog','Outro'];
  var TIPOS =['Reels','Feed','Carrossel','Story','Vídeo','Artigo','Anúncio','Outro'];
  var PIPE  =['Ideia','Em Produção','Aprovação','Agendado','Publicado','Cancelado'];
  var CORES ={ 'Ideia':['var(--mut)','var(--paper)'], 'Em Produção':['var(--warn)','var(--warn-soft)'],
    'Aprovação':['var(--blue)','var(--blue-soft)'], 'Agendado':['var(--accent)','var(--accent-soft)'],
    'Publicado':['var(--ok)','var(--ok-soft)'], 'Cancelado':['var(--danger)','var(--danger-soft)'] };
  var ICANAL={ 'Instagram':'📷','Facebook':'👍','LinkedIn':'in','TikTok':'♪','YouTube':'▶','WhatsApp':'✆','Site/Blog':'🌐','Outro':'◎' };

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function isTreino(x){ return (x||'').indexOf('TREINO')>=0; }
  function meEmail(){ try{ return (JSON.parse(localStorage.getItem('sulsign_session')||'{}').email)||''; }catch(e){ return ''; } }
  function dstr(d){ if(!d)return '—'; var p=(String(d).split('T')[0]||'').split('-'); return p.length===3?(p[2]+'/'+p[1]):d; }
  function dfull(d){ if(!d)return '—'; var t=String(d).split('T'); var p=(t[0]||'').split('-'); var hr=(t[1]||'').slice(0,5);
    return p.length===3?(p[2]+'/'+p[1]+'/'+p[0]+(hr?' '+hr:'')):d; }
  function pill(status){ var c=CORES[status]||['var(--mut)','var(--paper)']; return '<span style="font-size:10.5px;font-weight:700;padding:2px 9px;border-radius:20px;color:'+c[0]+';background:'+c[1]+'">'+esc(status)+'</span>'; }
  function gcal(txt,det,when){ // when: ISO de data_agendada -> evento de 30min
    if(!when) return '';
    var d=new Date(when); if(isNaN(d)) return '';
    function z(dt){ return dt.getUTCFullYear()+''+('0'+(dt.getUTCMonth()+1)).slice(-2)+('0'+dt.getUTCDate()).slice(-2)+'T'+('0'+dt.getUTCHours()).slice(-2)+('0'+dt.getUTCMinutes()).slice(-2)+'00Z'; }
    var fim=new Date(d.getTime()+30*60000);
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text='+encodeURIComponent(txt)+'&details='+encodeURIComponent(det||'')+'&dates='+z(d)+'/'+z(fim);
  }

  function fetchAll(force){
    if(SS20.cache.mkt&&!force) return Promise.resolve(SS20.cache.mkt);
    return Promise.all([
      SS20.sb('mkt_posts?select=*&deletado_em=is.null&order=data_agendada.desc.nullslast,criado_em.desc'),
      SS20.sb('orcamentos?select=numero,cliente&deletado_em=is.null&order=numero.desc'),
      SS20.sb('anexos?select=*&entidade=eq.mkt_post&deletado_em=is.null&order=criado_em.asc')
    ]).then(function(r){
      var data={
        posts:r[0].filter(function(p){return !isTreino(p.job_numero)&&!isTreino(p.titulo);}),
        orcs:r[1].filter(function(o){return !isTreino(o.numero);}),
        anexos:r[2]
      };
      SS20.cache.mkt=data; return data;
    });
  }

  function render(c){
    fetchAll().then(function(d){ draw(c,d); }).catch(function(e){
      if(String(e.message).indexOf('404')>=0 || String(e.message).indexOf('PGRST')>=0){
        c.innerHTML='<div class="placeholder-view"><h2>Marketing</h2>'
          +'<p>As tabelas <b>mkt_posts</b> / <b>anexos</b> ainda não existem no Supabase.</p>'
          +'<p>Rode o arquivo <b>schema_mkt_central.sql</b> no SQL Editor e recarregue.</p></div>';
        return;
      }
      c.innerHTML='<div class="err-view">Erro: '+esc(e.message)+'</div>';
    });
  }

  function draw(c,d){
    var filt=d.posts.filter(function(p){
      if(st.status&&p.status!==st.status)return false;
      if(st.canal&&p.canal!==st.canal)return false;
      return true;
    });
    var cont={}; PIPE.forEach(function(s){cont[s]=0;}); d.posts.forEach(function(p){ if(cont[p.status]!=null)cont[p.status]++; });

    var h='<div style="padding:24px 26px">';
    h+='<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:4px">';
    h+='<h2 style="font-family:var(--font-d);font-size:19px">Marketing</h2>';
    h+='<span style="flex:1"></span>';
    h+='<div style="display:flex;border:1px solid var(--line);border-radius:8px;overflow:hidden">';
    h+='<button type="button" class="mkt-vw" data-v="lista" style="border:none;padding:7px 12px;font-size:12px;cursor:pointer;background:'+(st.vista==='lista'?'var(--accent)':'var(--panel)')+';color:'+(st.vista==='lista'?'#fff':'var(--ink)')+'">Lista</button>';
    h+='<button type="button" class="mkt-vw" data-v="cal" style="border:none;border-left:1px solid var(--line);padding:7px 12px;font-size:12px;cursor:pointer;background:'+(st.vista==='cal'?'var(--accent)':'var(--panel)')+';color:'+(st.vista==='cal'?'#fff':'var(--ink)')+'">Calendário</button>';
    h+='</div>';
    h+='<button type="button" id="mkt-novo" style="background:var(--accent);color:#fff;border:none;font-size:12.5px;font-weight:600;padding:8px 14px;border-radius:8px;cursor:pointer">⊕ Novo post</button>';
    h+='</div>';
    h+='<p style="color:var(--mut);font-size:12.5px;margin-bottom:14px">'+d.posts.length+' posts · '
      +(cont['Agendado']||0)+' agendados · '+(cont['Publicado']||0)+' publicados'
      +((cont['Em Produção']||0)?' · <b style="color:var(--warn)">'+cont['Em Produção']+' em produção</b>':'')+'</p>';

    // filtros
    h+='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">';
    h+='<select id="mkt-fst" style="padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:12.5px;font-family:inherit;background:var(--panel)"><option value="">Todos os status</option>';
    PIPE.forEach(function(s){ h+='<option'+(st.status===s?' selected':'')+'>'+s+'</option>'; }); h+='</select>';
    h+='<select id="mkt-fca" style="padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:12.5px;font-family:inherit;background:var(--panel)"><option value="">Todos os canais</option>';
    CANAIS.forEach(function(s){ h+='<option'+(st.canal===s?' selected':'')+'>'+s+'</option>'; }); h+='</select>';
    h+='</div>';

    h+='<div id="mkt-form"></div>';
    h+='<div id="mkt-body"></div>';
    h+='</div>';
    c.innerHTML=h;

    document.getElementById('mkt-novo').addEventListener('click',function(){ form(c,d,null); });
    document.getElementById('mkt-fst').addEventListener('change',function(){ st.status=this.value; draw(c,d); });
    document.getElementById('mkt-fca').addEventListener('change',function(){ st.canal=this.value; draw(c,d); });
    var vws=c.querySelectorAll('.mkt-vw'); for(var i=0;i<vws.length;i++){ vws[i].addEventListener('click',function(){ st.vista=this.getAttribute('data-v'); draw(c,d); }); }

    if(st.vista==='cal') drawCal(c,d,filt); else drawLista(c,d,filt);
  }

  function drawLista(c,d,filt){
    var b=document.getElementById('mkt-body');
    if(!filt.length){ b.innerHTML='<div style="color:var(--mut);font-size:13px;padding:20px 0">Nenhum post neste filtro. Comece pelo botão “Novo post”.</div>'; return; }
    var h='';
    filt.forEach(function(p){
      var anx=d.anexos.filter(function(a){return a.entidade_id===p.id;});
      var m=p.metricas||{};
      h+='<div style="background:var(--panel);border:1px solid var(--line);border-left:3px solid '+((CORES[p.status]||['var(--mut)'])[0])+';border-radius:var(--radius);padding:14px 16px;margin-bottom:10px">'
        +'<div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin-bottom:6px">'
        +'<span style="font-weight:800;font-family:var(--font-d);font-size:14.5px">'+esc(p.titulo)+'</span>'
        +(p.canal?'<span style="font-size:11px;color:var(--mut)">'+(ICANAL[p.canal]||'◎')+' '+esc(p.canal)+(p.tipo?' · '+esc(p.tipo):'')+'</span>':'')
        +'<span style="flex:1"></span>'+pill(p.status)+'</div>';
      if(p.legenda) h+='<div style="font-size:12.5px;line-height:1.5;color:var(--ink2);margin-bottom:8px;white-space:pre-wrap">'+esc(p.legenda.length>240?p.legenda.slice(0,240)+'…':p.legenda)+'</div>';
      h+='<div style="display:flex;gap:12px;font-size:11px;color:var(--mut);flex-wrap:wrap;align-items:center">';
      if(p.data_agendada) h+='<span>📅 '+dfull(p.data_agendada)+'</span>';
      if(p.data_publicada) h+='<span style="color:var(--ok)">✔ pub '+dfull(p.data_publicada)+'</span>';
      if(p.job_numero) h+='<button type="button" data-action="nav" data-view="orc" title="Abrir Orçamentos" style="background:var(--accent-soft);color:var(--accent);border:none;font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;cursor:pointer">🔗 '+esc(p.job_numero)+'</button>';
      if(p.cliente) h+='<span>'+esc(p.cliente)+'</span>';
      if(p.responsavel) h+='<span>@'+esc(p.responsavel)+'</span>';
      var g=gcal(p.titulo+' — '+(p.canal||''), p.legenda||'', p.data_agendada);
      if(g) h+='<a href="'+g+'" target="_blank" style="color:var(--blue)">＋ Agenda</a>';
      anx.forEach(function(a){ h+='<a href="'+esc(a.storage_path)+'" target="_blank" style="color:var(--blue)">📎 '+esc(a.nome_arquivo)+'</a>'; });
      h+='</div>';
      if(p.status==='Publicado' && (m.alcance||m.curtidas||m.comentarios||m.salvos)){
        h+='<div style="display:flex;gap:14px;font-size:11px;color:var(--mut);margin-top:8px;border-top:1px solid var(--line);padding-top:8px">'
          +(m.alcance?'<span>👁 '+esc(m.alcance)+' alcance</span>':'')
          +(m.curtidas?'<span>❤ '+esc(m.curtidas)+'</span>':'')
          +(m.comentarios?'<span>💬 '+esc(m.comentarios)+'</span>':'')
          +(m.salvos?'<span>🔖 '+esc(m.salvos)+'</span>':'')
          +(m.compart?'<span>↗ '+esc(m.compart)+'</span>':'')+'</div>';
      }
      h+='<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">'
        +'<button type="button" class="mkt-ed" data-id="'+p.id+'" style="background:var(--paper);border:1px solid var(--line);font-size:11px;padding:5px 12px;border-radius:7px;cursor:pointer">✎ Editar</button>'
        +avancarBtn(p)
        +'<button type="button" class="mkt-del" data-id="'+p.id+'" style="background:none;border:1px solid var(--line);color:var(--danger);font-size:11px;padding:5px 12px;border-radius:7px;cursor:pointer">🗑</button>'
        +'</div></div>';
    });
    b.innerHTML=h;
    bindCards(c,d);
  }

  function avancarBtn(p){
    var i=PIPE.indexOf(p.status);
    if(i<0||i>=PIPE.indexOf('Publicado')) return '';
    var prox=PIPE[i+1];
    return '<button type="button" class="mkt-adv" data-id="'+p.id+'" data-prox="'+prox+'" style="background:var(--ok-soft);border:1px solid var(--ok);color:var(--ok);font-size:11px;font-weight:600;padding:5px 12px;border-radius:7px;cursor:pointer">→ '+prox+'</button>';
  }

  function bindCards(c,d){
    var eds=c.querySelectorAll('.mkt-ed'); for(var i=0;i<eds.length;i++){ eds[i].addEventListener('click',function(){ var id=this.getAttribute('data-id'); var it=null; d.posts.forEach(function(p){if(p.id===id)it=p;}); form(c,d,it); }); }
    var dels=c.querySelectorAll('.mkt-del'); for(var j=0;j<dels.length;j++){ dels[j].addEventListener('click',function(){ var id=this.getAttribute('data-id'); if(!confirm('Excluir este post?'))return;
      SS20.sbw('mkt_posts?id=eq.'+id,'PATCH',{deletado_em:new Date().toISOString()}).then(function(){return fetchAll(true);}).then(function(d2){draw(c,d2);}).catch(function(e){alert('Erro: '+e.message);}); }); }
    var advs=c.querySelectorAll('.mkt-adv'); for(var k=0;k<advs.length;k++){ advs[k].addEventListener('click',function(){ var id=this.getAttribute('data-id'),prox=this.getAttribute('data-prox');
      var body={status:prox,atualizado_em:new Date().toISOString()}; if(prox==='Publicado')body.data_publicada=new Date().toISOString();
      SS20.sbw('mkt_posts?id=eq.'+id,'PATCH',body).then(function(){return fetchAll(true);}).then(function(d2){draw(c,d2);}).catch(function(e){alert('Erro: '+e.message);}); }); }
  }

  function drawCal(c,d,filt){
    var b=document.getElementById('mkt-body');
    var parts=st.mes.split('-'), ano=+parts[0], mes=+parts[1]-1;
    var primeiro=new Date(ano,mes,1), ini=primeiro.getDay(), dias=new Date(ano,mes+1,0).getDate();
    var nomes=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    var porDia={}; filt.forEach(function(p){ if(p.data_agendada){ var dd=String(p.data_agendada).split('T')[0]; if(dd.indexOf(st.mes)===0){ var dia=+dd.split('-')[2]; (porDia[dia]=porDia[dia]||[]).push(p); } } });
    var h='<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">'
      +'<button type="button" id="mkt-prev" style="background:var(--panel);border:1px solid var(--line);border-radius:7px;padding:5px 11px;cursor:pointer">‹</button>'
      +'<b style="font-family:var(--font-d);font-size:15px">'+nomes[mes]+' '+ano+'</b>'
      +'<button type="button" id="mkt-next" style="background:var(--panel);border:1px solid var(--line);border-radius:7px;padding:5px 11px;cursor:pointer">›</button></div>';
    h+='<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px">';
    ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].forEach(function(w){ h+='<div style="font-size:10.5px;font-weight:700;color:var(--mut);text-align:center;padding:4px 0">'+w+'</div>'; });
    for(var x=0;x<ini;x++) h+='<div></div>';
    for(var dia=1;dia<=dias;dia++){
      var ps=porDia[dia]||[];
      h+='<div style="min-height:76px;border:1px solid var(--line);border-radius:8px;padding:5px 6px;background:var(--panel)">'
        +'<div style="font-size:11px;font-weight:600;color:var(--mut);margin-bottom:3px">'+dia+'</div>';
      ps.forEach(function(p){ var cor=(CORES[p.status]||['var(--mut)','var(--paper)']);
        h+='<div class="mkt-cd" data-id="'+p.id+'" title="'+esc(p.titulo)+'" style="font-size:10px;background:'+cor[1]+';color:'+cor[0]+';border-radius:5px;padding:2px 5px;margin-bottom:3px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(ICANAL[p.canal]||'◎')+' '+esc(p.titulo)+'</div>'; });
      h+='</div>';
    }
    h+='</div>';
    h+='<p style="font-size:11px;color:var(--mut);margin-top:10px">Somente posts com data agendada aparecem no calendário. Clique num post para editar.</p>';
    b.innerHTML=h;
    document.getElementById('mkt-prev').addEventListener('click',function(){ var m=mes-1,a=ano; if(m<0){m=11;a--;} st.mes=a+'-'+('0'+(m+1)).slice(-2); draw(c,d); });
    document.getElementById('mkt-next').addEventListener('click',function(){ var m=mes+1,a=ano; if(m>11){m=0;a++;} st.mes=a+'-'+('0'+(m+1)).slice(-2); draw(c,d); });
    var cds=c.querySelectorAll('.mkt-cd'); for(var i=0;i<cds.length;i++){ cds[i].addEventListener('click',function(){ var id=this.getAttribute('data-id'); var it=null; d.posts.forEach(function(p){if(p.id===id)it=p;}); form(c,d,it); }); }
  }

  function form(c,d,it){
    it=it||{};
    var m=it.metricas||{};
    var f=document.getElementById('mkt-form');
    function opt(arr,cur){ var o=''; arr.forEach(function(v){o+='<option'+(cur===v?' selected':'')+'>'+v+'</option>';}); return o; }
    var opsJob='<option value="">— sem job —</option>'; var vist={};
    d.orcs.forEach(function(o){ if(o.numero&&!vist[o.numero]){ vist[o.numero]=1; opsJob+='<option value="'+esc(o.numero)+'"'+(it.job_numero===o.numero?' selected':'')+'>'+esc(o.numero)+(o.cliente?' — '+esc(o.cliente):'')+'</option>'; } });
    var lab='display:block;font-size:10.5px;font-weight:600;color:var(--mut);margin-bottom:3px';
    var inp='padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit';
    f.innerHTML='<div style="background:var(--panel);border:2px solid var(--accent);border-radius:var(--radius);padding:18px;margin-bottom:16px">'
      +'<div style="font-size:12px;font-weight:700;margin-bottom:12px">'+(it.id?'Editar post':'Novo post')+'</div>'
      +'<div style="margin-bottom:10px"><label style="'+lab+'">Título *</label><input id="mf-tit" type="text" value="'+esc(it.titulo||'')+'" style="width:100%;'+inp+'"></div>'
      +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">'
        +'<div><label style="'+lab+'">Canal</label><select id="mf-can" style="'+inp+';background:var(--panel)">'+opt(CANAIS,it.canal)+'</select></div>'
        +'<div><label style="'+lab+'">Tipo</label><select id="mf-tip" style="'+inp+';background:var(--panel)">'+opt(TIPOS,it.tipo)+'</select></div>'
        +'<div><label style="'+lab+'">Status</label><select id="mf-sta" style="'+inp+';background:var(--panel)">'+opt(PIPE,it.status||'Ideia')+'</select></div>'
        +'<div><label style="'+lab+'">Data/hora agendada</label><input id="mf-dt" type="datetime-local" value="'+(it.data_agendada?String(it.data_agendada).slice(0,16):'')+'" style="'+inp+'"></div>'
      +'</div>'
      +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">'
        +'<div style="flex:1;min-width:180px"><label style="'+lab+'">Job / Orçamento (link interno)</label><select id="mf-job" style="width:100%;'+inp+';background:var(--panel)">'+opsJob+'</select></div>'
        +'<div style="flex:1;min-width:150px"><label style="'+lab+'">Cliente</label><input id="mf-cli" type="text" value="'+esc(it.cliente||'')+'" style="width:100%;'+inp+'"></div>'
        +'<div style="min-width:130px"><label style="'+lab+'">Responsável</label><input id="mf-resp" type="text" value="'+esc(it.responsavel||'')+'" placeholder="Ohanna" style="width:100%;'+inp+'"></div>'
      +'</div>'
      +'<div style="margin-bottom:10px"><label style="'+lab+'">Briefing / ideia</label><textarea id="mf-brf" rows="2" style="width:100%;'+inp+'">'+esc(it.briefing||'')+'</textarea></div>'
      +'<div style="margin-bottom:10px"><label style="'+lab+'">Legenda (caption)</label><textarea id="mf-leg" rows="3" style="width:100%;'+inp+'">'+esc(it.legenda||'')+'</textarea></div>'
      +'<div style="margin-bottom:10px"><label style="'+lab+'">Anexo (link Drive / arte) — nome | url</label>'
        +'<input id="mf-anx" type="text" placeholder="arte_final.png | https://drive.google.com/…" style="width:100%;'+inp+'"></div>'
      +'<details style="margin-bottom:12px"><summary style="font-size:11.5px;color:var(--mut);cursor:pointer">Métricas (preencher após publicar)</summary>'
        +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">'
        +'<div><label style="'+lab+'">Alcance</label><input id="mf-alc" type="number" value="'+esc(m.alcance||'')+'" style="width:100px;'+inp+'"></div>'
        +'<div><label style="'+lab+'">Curtidas</label><input id="mf-cur" type="number" value="'+esc(m.curtidas||'')+'" style="width:100px;'+inp+'"></div>'
        +'<div><label style="'+lab+'">Comentários</label><input id="mf-com" type="number" value="'+esc(m.comentarios||'')+'" style="width:100px;'+inp+'"></div>'
        +'<div><label style="'+lab+'">Salvos</label><input id="mf-sal" type="number" value="'+esc(m.salvos||'')+'" style="width:100px;'+inp+'"></div>'
        +'<div><label style="'+lab+'">Compart.</label><input id="mf-cp" type="number" value="'+esc(m.compart||'')+'" style="width:100px;'+inp+'"></div>'
        +'</div></details>'
      +'<div style="display:flex;gap:8px"><button type="button" id="mf-save" style="background:var(--accent);color:#fff;border:none;font-size:12.5px;font-weight:600;padding:9px 16px;border-radius:8px;cursor:pointer">💾 Salvar</button>'
      +'<button type="button" id="mf-cancel" style="background:var(--paper);border:1px solid var(--line);font-size:12.5px;padding:9px 16px;border-radius:8px;cursor:pointer">Cancelar</button></div>'
      +'<div id="mf-msg" style="font-size:11.5px;margin-top:8px"></div></div>';
    try{f.scrollIntoView({behavior:'smooth',block:'nearest'});}catch(e){}

    document.getElementById('mf-cancel').addEventListener('click',function(){ f.innerHTML=''; });
    document.getElementById('mf-save').addEventListener('click',function(){
      var tit=document.getElementById('mf-tit').value.trim();
      var msg=document.getElementById('mf-msg');
      if(!tit){ msg.textContent='Informe um título.'; msg.style.color='var(--danger)'; return; }
      var dt=document.getElementById('mf-dt').value;
      var met={ alcance:num('mf-alc'), curtidas:num('mf-cur'), comentarios:num('mf-com'), salvos:num('mf-sal'), compart:num('mf-cp') };
      var body={
        titulo:tit, canal:document.getElementById('mf-can').value, tipo:document.getElementById('mf-tip').value,
        status:document.getElementById('mf-sta').value, data_agendada:dt?dt:null,
        job_numero:document.getElementById('mf-job').value||null, cliente:document.getElementById('mf-cli').value.trim()||null,
        responsavel:document.getElementById('mf-resp').value.trim()||null, briefing:document.getElementById('mf-brf').value.trim()||null,
        legenda:document.getElementById('mf-leg').value.trim()||null, metricas:met, atualizado_em:new Date().toISOString()
      };
      var anx=document.getElementById('mf-anx').value.trim();
      var p = it.id
        ? SS20.sbw('mkt_posts?id=eq.'+it.id,'PATCH',body)
        : SS20.sbw('mkt_posts','POST',(body.criado_por=meEmail(),body));
      p.then(function(){
        if(!anx) return null;
        // precisa do id do post; refaz fetch p/ obter (novo) ou usa it.id
        return SS20.sb('mkt_posts?select=id&titulo=eq.'+encodeURIComponent(tit)+'&deletado_em=is.null&order=criado_em.desc&limit=1').then(function(rows){
          var pid=it.id||(rows&&rows[0]&&rows[0].id); if(!pid)return null;
          var parts=anx.split('|'); var nome=(parts[0]||'anexo').trim(); var url=(parts[1]||parts[0]||'').trim();
          return SS20.sbw('anexos','POST',{entidade:'mkt_post',entidade_id:pid,nome_arquivo:nome,storage_path:url,criado_por:meEmail()});
        });
      }).then(function(){ return fetchAll(true); }).then(function(d2){ draw(c,d2); })
      .catch(function(e){ msg.textContent='Erro ao salvar: '+e.message; msg.style.color='var(--danger)'; });
    });
    function num(id){ var v=document.getElementById(id).value; return v?+v:null; }
  }

  SS20.modules.mkt={render:render};
})();
