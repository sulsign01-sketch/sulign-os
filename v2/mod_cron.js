/* ═══════════════════════════════════════════════════════════════
   SULSIGN OS 2.0 — MÓDULO: CRONOGRAMA (cron)
   Linha do tempo real de entregas: OS agrupadas por semana,
   atrasadas destacadas, concluídas ao final.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function isTreino(x){ return (x||'').indexOf('TREINO')>=0; }
  function dstr(d){
    if(!d)return '—';
    var p=(d.split('T')[0]||'').split('-');
    return p.length===3?(p[2]+'/'+p[1]+'/'+p[0]):d;
  }
  function fechada(s){ return /entreg|conclu|finaliz|fechad/i.test(s||''); }

  function fetchAll(){
    if(SS20.cache.cron) return Promise.resolve(SS20.cache.cron);
    return Promise.all([
      SS20.sb('ordens_servico?select=num,orcamento_numero,status,disciplina,prazo,data_entrega_prometida,data_entrada&deletado_em=is.null'),
      SS20.sb('orcamentos?select=numero,cliente,projeto&order=numero.desc')
    ]).then(function(r){
      var orcs={};
      r[1].forEach(function(o){orcs[o.numero]=o;});
      var data={oss:r[0].filter(function(o){return !isTreino(o.num)&&!isTreino(o.orcamento_numero);}),orcs:orcs};
      SS20.cache.cron=data;
      return data;
    });
  }

  function render(c){
    fetchAll().then(function(d){ draw(c,d); })
    .catch(function(e){
      c.innerHTML='<div class="err-view">Erro ao carregar cronograma: '+esc(e.message)+'</div>';
    });
  }

  function draw(c,d){
    var hoje=new Date(); hoje.setHours(0,0,0,0);

    var atrasadas=[],semanas={},semData=[],concluidas=[];
    d.oss.forEach(function(os){
      var prazo=os.data_entrega_prometida||os.prazo||null;
      var item={os:os,orc:d.orcs[os.orcamento_numero]||{},prazo:prazo};
      if(fechada(os.status)){concluidas.push(item);return;}
      if(!prazo){semData.push(item);return;}
      var dt=new Date((prazo.split('T')[0])+'T00:00:00');
      item.dt=dt;
      if(dt<hoje){atrasadas.push(item);return;}
      /* chave da semana: segunda-feira */
      var seg=new Date(dt); seg.setDate(seg.getDate()-((seg.getDay()+6)%7));
      var k=seg.toISOString().slice(0,10);
      if(!semanas[k])semanas[k]=[];
      semanas[k].push(item);
    });
    atrasadas.sort(function(a,b){return a.dt-b.dt;});
    var chavesSemanas=Object.keys(semanas).sort();

    var h='<div style="padding:24px 26px">';
    h+='<h2 style="font-family:var(--font-d);font-size:19px;margin-bottom:4px">Cronograma de entregas</h2>';
    h+='<p style="color:var(--mut);font-size:12.5px;margin-bottom:20px">'
      +(atrasadas.length?('<b style="color:var(--danger)">'+atrasadas.length+' atrasada(s)</b> · '):'')
      +chavesSemanas.reduce(function(a,k){return a+semanas[k].length;},0)+' programadas · '
      +semData.length+' sem data · '+concluidas.length+' concluídas</p>';

    if(atrasadas.length){
      h+=grupo('⚠ Atrasadas','var(--danger)',atrasadas,hoje);
    }
    chavesSemanas.forEach(function(k){
      var seg=new Date(k+'T00:00:00');
      var dom=new Date(seg); dom.setDate(dom.getDate()+6);
      var lbl='Semana '+dstr(k)+' – '+dstr(dom.toISOString().slice(0,10));
      var estaSemana = hoje>=seg && hoje<=dom;
      h+=grupo(lbl+(estaSemana?' · esta semana':''),estaSemana?'var(--accent)':'var(--blue)',semanas[k].sort(function(a,b){return a.dt-b.dt;}),hoje);
    });
    if(semData.length){
      h+=grupo('Sem data de entrega definida','var(--mut)',semData,hoje);
    }
    if(concluidas.length){
      h+='<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12.5px;color:var(--mut);padding:8px 0">Concluídas ('+concluidas.length+')</summary>';
      h+=grupo('','var(--ok)',concluidas,hoje);
      h+='</details>';
    }
    if(!d.oss.length)h+='<div style="color:var(--mut);font-size:13px">Nenhuma OS no sistema.</div>';
    h+='</div>';
    c.innerHTML=h;
  }

  function grupo(tit,cor,itens,hoje){
    var h='<div style="margin-bottom:20px">';
    if(tit)h+='<div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:'+cor+';margin-bottom:8px;padding-left:2px">'+tit+'</div>';
    h+='<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden">';
    itens.forEach(function(x,i){
      var dias=null;
      if(x.dt){dias=Math.round((x.dt-hoje)/86400000);}
      h+='<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;'+(i?'border-top:1px solid var(--line);':'')+'font-size:12.5px;flex-wrap:wrap">'
        +'<span style="min-width:78px;font-weight:700;color:'+cor+'">'+dstr(x.prazo)+'</span>'
        +'<span style="font-weight:600">'+esc(x.os.num)+'</span>'
        +'<span>'+esc(x.os.orcamento_numero||'')+(x.orc.cliente?' <span style="color:var(--mut)">· '+esc(x.orc.cliente)+'</span>':'')+'</span>'
        +'<span style="color:var(--mut);font-size:11px">'+esc(x.os.disciplina||'')+'</span>'
        +'<span style="flex:1"></span>'
        +(dias!==null?'<span style="font-size:11px;font-weight:700;color:'+(dias<0?'var(--danger)':(dias<=3?'var(--warn)':'var(--mut)'))+'">'
          +(dias<0?(Math.abs(dias)+'d atrás'):(dias===0?'hoje':('em '+dias+'d')))+'</span>':'')
        +'<span style="font-size:10.5px;padding:2px 8px;border-radius:10px;background:var(--paper);color:var(--ink2)">'+esc(x.os.status||'—')+'</span>'
        +'</div>';
    });
    h+='</div></div>';
    return h;
  }

  SS20.modules.cron={render:render};
})();
