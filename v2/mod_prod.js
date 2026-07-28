/* ═══════════════════════════════════════════════════════════════
   SULSIGN OS 2.0 — MÓDULO: ORDENS DE SERVIÇO / PRODUÇÃO (prod)
   Reescrito (Jul/2026): a OS deixa de copiar o orçamento e vira a
   camada de PRODUÇÃO. Cada linha = 1 FRENTE (estrutura, impressão,
   montagem…). "Soltar pro Fernando" é uma ação deliberada do Carlos:
   liberar uma frente cria a OS, carimba liberado_em e joga o job pra
   produção. Origem pode ser orçamento, PDVEX ou avulso (sem proposta).
   Peças puxadas AO VIVO do orçamento (grupos[].linhas[]), nunca copiadas.
   iOS Safari: var, sem template literals, sem arrow, listeners pós-render.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  var fmt=SulSignCore.fmt;

  var FRENTES=['Estrutura','Impressão','Montagem','Acabamento','Marcenaria','Outros'];
  var ABBR={'Estrutura':'EST','Impressão':'IMP','Montagem':'MON','Acabamento':'ACB','Marcenaria':'MAR','Outros':'OUT'};
  var STATUS=['Aguardando início','Em produção','Concluído','Entregue'];
  var TERMINAIS={'Concluído':1,'Entregue':1};
  var SCOR={'Aguardando início':'#6B6E76','Em produção':'#D97706','Concluído':'#1E9E5A','Entregue':'#0E7A43'};
  var PRIOS=['normal','alta','urgente'];
  var PCOR={'normal':'#6B6E76','alta':'#D97706','urgente':'#D23B2F'};
  var RESP=['Fernando','Everson','Edson'];

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function isTreino(x){ return (x||'').indexOf('TREINO')>=0; }
  function dstr(d){ if(!d)return '—'; var p=(String(d).split('T')[0]||'').split('-'); return p.length===3?(p[2]+'/'+p[1]+'/'+p[0]):d; }
  function hojeISO(){ var d=new Date(); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }

  /* ── DADOS ── (sem cache: produção muda o tempo todo, sempre fresco) */
  function fetchData(){
    return Promise.all([
      SS20.sb('ordens_servico?select=*&deletado_em=is.null&order=created_at.desc'),
      SS20.sb('orcamentos?select=numero,cliente,agencia,projeto,grupos,status&order=numero.desc')
    ]).then(function(r){
      var frentes=r[0].filter(function(o){ return !isTreino(o.num)&&!isTreino(o.orcamento_numero)&&!isTreino(o.job); });
      var orcs={}, orcList=[];
      r[1].forEach(function(o){ if(isTreino(o.numero))return; orcs[o.numero]=o; orcList.push(o); });
      return {frentes:frentes, orcs:orcs, orcList:orcList};
    });
  }

  function render(c){
    c.innerHTML='<div class="loading-view">Carregando ordens de serviço…</div>';
    fetchData().then(function(d){ draw(c,d); })
    .catch(function(e){ c.innerHTML='<div class="err-view">Erro ao carregar OS: '+esc(e.message)+'</div>'; });
  }

  function refresh(c){ render(c); }

  /* ── DESENHO ── */
  function draw(c,d){
    var hoje=hojeISO();
    var abertas=0, atrasadas=0, porStatus={};
    STATUS.forEach(function(s){ porStatus[s]=0; });
    d.frentes.forEach(function(f){
      var s=f.status||'Aguardando início';
      porStatus[s]=(porStatus[s]||0)+1;
      if(!TERMINAIS[s]){
        abertas++;
        var prazo=f.data_montagem||f.data_entrega;
        if(prazo && String(prazo).split('T')[0]<hoje) atrasadas++;
      }
    });

    /* orçamentos prontos pra soltar: Aprovado ou já Em Produção */
    var frentesPorOrc={};
    d.frentes.forEach(function(f){ if(f.orcamento_numero){ (frentesPorOrc[f.orcamento_numero]=frentesPorOrc[f.orcamento_numero]||[]).push(f); } });
    var prontos=d.orcList.filter(function(o){ return ['Aprovado','Em Produção'].indexOf(o.status)>=0; });

    var h='<div style="padding:22px 24px 40px">';
    h+='<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:2px">';
    h+='<h2 style="font-family:var(--font-d);font-size:19px">Ordens de Serviço</h2>';
    h+='<span style="flex:1"></span>';
    h+='<button type="button" data-os="nova" style="background:var(--accent);color:#fff;border:none;font-size:12.5px;font-weight:600;padding:8px 14px;border-radius:8px;cursor:pointer">+ Nova OS (PDVEX / avulsa)</button>';
    h+='</div>';
    h+='<p style="color:var(--mut);font-size:12.5px;margin-bottom:18px">O que você soltou pro Fernando — por frente. Liberar uma frente é o ato de mandar produzir.</p>';

    /* KPIs */
    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:22px">';
    h+=kpi('Frentes abertas',abertas,atrasadas?('⚠ '+atrasadas+' atrasada'+(atrasadas>1?'s':'')):'nenhuma atrasada',atrasadas?'var(--danger)':'var(--ok)');
    h+=kpi('Em produção',porStatus['Em produção']||0,'','var(--warn)');
    h+=kpi('Aguardando',porStatus['Aguardando início']||0,'ainda não iniciadas','var(--ink)');
    h+=kpi('Prontos p/ soltar',prontos.length,'orçamentos aprovados','var(--blue)');
    h+='</div>';

    /* ── SEÇÃO 1: PRONTOS PRA SOLTAR ── */
    h+='<div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut);margin:0 0 10px">Prontos para soltar</div>';
    if(!prontos.length){
      h+='<div style="background:var(--panel);border:1px dashed var(--line);border-radius:var(--radius);padding:18px;color:var(--mut);font-size:12.5px;margin-bottom:26px">Nenhum orçamento aprovado aguardando liberação. Aprove no Orçamentos ou crie uma OS PDVEX/avulsa acima.</div>';
    } else {
      h+='<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:26px">';
      prontos.forEach(function(o){
        var calc=SulSignCore.calcOrcamento(o);
        var fs=frentesPorOrc[o.numero]||[];
        var chips=fs.map(function(f){ return '<span style="font-size:9.5px;font-weight:700;padding:2px 7px;border-radius:10px;background:'+(SCOR[f.status]||'#6B6E76')+'1a;color:'+(SCOR[f.status]||'#6B6E76')+'">'+esc(ABBR[f.frente]||f.frente||'OS')+'</span>'; }).join(' ');
        h+='<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">'
          +'<div style="min-width:0;flex:1">'
            +'<div style="font-weight:700;font-size:13px">'+esc(o.numero)+' <span style="color:var(--mut);font-weight:500">· '+esc(o.cliente||'—')+'</span></div>'
            +'<div style="color:var(--mut);font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:340px">'+esc(o.projeto||'')+'</div>'
            +(fs.length?'<div style="margin-top:5px;display:flex;gap:4px;flex-wrap:wrap">'+chips+'</div>':'')
          +'</div>'
          +'<div style="text-align:right"><div style="font-size:11px;color:var(--mut)">venda</div><div style="font-weight:700;font-size:13px">'+fmt(calc.venda)+'</div></div>'
          +'<button type="button" data-os="soltar" data-orc="'+esc(o.numero)+'" style="background:var(--ink);color:#fff;border:none;font-size:12px;font-weight:600;padding:8px 13px;border-radius:8px;cursor:pointer;white-space:nowrap">Liberar frente ↦</button>'
          +'</div>';
      });
      h+='</div>';
    }

    /* ── SEÇÃO 2: FRENTES SOLTAS (agrupadas por job) ── */
    h+='<div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut);margin:0 0 10px">Frentes soltas</div>';
    if(!d.frentes.length){
      h+='<div style="background:var(--panel);border:1px dashed var(--line);border-radius:var(--radius);padding:18px;color:var(--mut);font-size:12.5px">Nada solto ainda. Libere uma frente acima.</div>';
    } else {
      var jobs={}, ordem=[];
      d.frentes.forEach(function(f){ var j=f.job||f.orcamento_numero||'(sem job)'; if(!jobs[j]){jobs[j]=[];ordem.push(j);} jobs[j].push(f); });
      ordem.forEach(function(j){
        var lista=jobs[j];
        var meta=d.orcs[j]||{};
        var cli=meta.cliente||lista[0].cliente||'';
        h+='<div style="margin-bottom:14px">';
        h+='<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px">'
          +'<span style="font-weight:700;font-size:13px">'+esc(j)+'</span>'
          +(cli?'<span style="color:var(--mut);font-size:11.5px">'+esc(cli)+'</span>':'')
          +'<span style="color:var(--mut);font-size:11px">· '+lista.length+' frente'+(lista.length>1?'s':'')+'</span>'
          +'</div>';
        h+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px">';
        lista.forEach(function(f){ h+=cardFrente(f,hoje); });
        h+='</div></div>';
      });
    }

    h+='</div>';
    c.innerHTML=h;
    bind(c,d);
  }

  function cardFrente(f,hoje){
    var s=f.status||'Aguardando início';
    var prazo=f.data_montagem||f.data_entrega;
    var late=(!TERMINAIS[s] && prazo && String(prazo).split('T')[0]<hoje);
    var scor=SCOR[s]||'#6B6E76';
    var pcor=PCOR[f.prioridade]||'#6B6E76';
    var h='<div style="background:var(--panel);border:1px solid '+(late?'var(--danger)':'var(--line)')+';border-radius:var(--radius);padding:12px 13px">';
    /* topo: frente + prioridade + ações */
    h+='<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">'
      +'<span style="font-weight:700;font-size:13px">'+esc(f.frente||'Frente')+'</span>';
    if(f.prioridade&&f.prioridade!=='normal') h+='<span style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;padding:2px 6px;border-radius:9px;background:'+pcor+'1a;color:'+pcor+'">'+esc(f.prioridade)+'</span>';
    h+='<span style="flex:1"></span>'
      +'<button type="button" data-os="editar" data-id="'+f.id+'" title="Editar" style="background:none;border:none;color:var(--mut);cursor:pointer;font-size:13px;padding:2px 4px">✎</button>'
      +'<button type="button" data-os="excluir" data-id="'+f.id+'" title="Excluir" style="background:none;border:none;color:var(--mut);cursor:pointer;font-size:14px;padding:2px 4px">×</button>'
      +'</div>';
    h+='<div style="font-size:11px;color:var(--mut);margin-bottom:2px">'+esc(f.responsavel||'Fernando')+(f.num?' · '+esc(f.num):'')+'</div>';
    if(f.escopo) h+='<div style="font-size:12px;margin:4px 0;line-height:1.35">'+esc(f.escopo)+'</div>';
    if(f.instrucoes) h+='<div style="font-size:11.5px;color:var(--ink2);border-left:2px solid var(--accent);padding:5px 8px;margin:6px 0;border-radius:0 6px 6px 0;line-height:1.35;background:rgba(127,127,127,.06)">📌 '+esc(f.instrucoes)+'</div>';
    /* prazos */
    var prz='';
    if(f.data_entrega) prz+='entrega '+dstr(f.data_entrega);
    if(f.data_montagem) prz+=(prz?' · ':'')+'montagem '+dstr(f.data_montagem);
    h+='<div style="font-size:11px;'+(late?'color:var(--danger);font-weight:700':'color:var(--mut)')+';margin:6px 0 9px">'+(prz||'sem prazo')+(late?' ⚠ atrasada':'')+'</div>';
    /* status pipeline (clicável) */
    h+='<div style="display:flex;gap:4px;flex-wrap:wrap">';
    STATUS.forEach(function(st){
      var on=(st===s);
      h+='<button type="button" data-os="status" data-id="'+f.id+'" data-st="'+esc(st)+'" style="flex:1;min-width:0;font-size:9.5px;font-weight:700;padding:5px 2px;border-radius:6px;cursor:pointer;border:1px solid '+(on?scor:'var(--line)')+';background:'+(on?scor:'transparent')+';color:'+(on?'#fff':'var(--mut)')+'">'+esc(st.replace('Aguardando início','Aguard.'))+'</button>';
    });
    h+='</div></div>';
    return h;
  }

  function kpi(lbl,val,sub,cor){
    return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:14px 16px">'
      +'<div style="font-size:10px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:var(--mut)">'+lbl+'</div>'
      +'<div style="font-family:var(--font-d);font-size:21px;font-weight:800;margin:5px 0 2px;color:'+cor+'">'+val+'</div>'
      +'<div style="font-size:11px;color:var(--mut)">'+(sub||'&nbsp;')+'</div></div>';
  }

  /* ── LISTENERS ── */
  function bind(c,d){
    var btns=c.querySelectorAll('[data-os]');
    Array.prototype.forEach.call(btns,function(b){
      b.addEventListener('click',function(){
        var act=this.getAttribute('data-os');
        if(act==='nova')    return abrirModal(c,d,{origem:'pdvex'});
        if(act==='soltar')  return abrirModal(c,d,{origem:'orcamento',orcamento_numero:this.getAttribute('data-orc')});
        if(act==='editar')  return abrirModal(c,d,acharFrente(d,this.getAttribute('data-id')));
        if(act==='excluir') return excluir(c,this.getAttribute('data-id'));
        if(act==='status')  return mudarStatus(c,d,this.getAttribute('data-id'),this.getAttribute('data-st'));
      });
    });
  }

  function acharFrente(d,id){ var r=null; d.frentes.forEach(function(f){ if(String(f.id)===String(id))r=f; }); return r||{}; }

  /* ── STATUS ── */
  function mudarStatus(c,d,id,novo){
    var f=acharFrente(d,id);
    if(f&&f.status===novo) return;
    var body={status:novo};
    body.concluido_em = TERMINAIS[novo] ? new Date().toISOString() : null;
    SS20.sbw('ordens_servico?id=eq.'+id,'PATCH',body).then(function(){
      /* sync comercial: se todas as frentes do orçamento fecharam, joga orçamento -> Entregue */
      if(TERMINAIS[novo] && f && f.origem==='orcamento' && f.orcamento_numero){
        var irmas=d.frentes.filter(function(x){ return x.orcamento_numero===f.orcamento_numero; });
        var todasFech=irmas.every(function(x){ return String(x.id)===String(id) ? true : !!TERMINAIS[x.status]; });
        if(todasFech){
          var oc=d.orcs[f.orcamento_numero];
          if(oc && ['Aprovado','Em Produção'].indexOf(oc.status)>=0){
            return SS20.sbw('orcamentos?numero=eq.'+encodeURIComponent(f.orcamento_numero),'PATCH',{status:'Entregue'}).then(function(){ refresh(c); });
          }
        }
      }
      refresh(c);
    }).catch(function(e){ alert('Erro ao mudar status: '+e.message); });
  }

  /* ── EXCLUIR (soft delete) ── */
  function excluir(c,id){
    if(!window.confirm('Remover esta frente? (soft delete, pode ser recuperada no banco)')) return;
    SS20.sbw('ordens_servico?id=eq.'+id,'PATCH',{deletado_em:new Date().toISOString()})
      .then(function(){ refresh(c); })
      .catch(function(e){ alert('Erro ao excluir: '+e.message); });
  }

  /* ── MODAL LIBERAR / EDITAR FRENTE ── */
  function abrirModal(c,d,ctx){
    ctx=ctx||{};
    var editando=!!ctx.id;
    var origem=ctx.origem||'orcamento';
    var orc = (origem==='orcamento') ? (d.orcs[ctx.orcamento_numero]||{}) : {};

    var ov=document.createElement('div');
    ov.id='os-modal';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow:auto';

    var pecasRef = (ctx.pecas_ref&&ctx.pecas_ref.length)? ctx.pecas_ref.slice() : [];

    var h='<div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;max-width:560px;width:100%;margin:auto;padding:22px 22px 18px;box-shadow:0 20px 60px -20px rgba(0,0,0,.6)">';
    h+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">';
    h+='<h3 style="font-family:var(--font-d);font-size:17px">'+(editando?'Editar frente':'Liberar frente')+'</h3><span style="flex:1"></span>';
    h+='<button type="button" data-mo="fechar" style="background:none;border:none;font-size:20px;color:var(--mut);cursor:pointer;line-height:1">×</button></div>';

    /* identificação do job */
    if(origem==='orcamento'){
      h+='<div style="font-size:12.5px;color:var(--mut);margin-bottom:14px">Job <b style="color:var(--ink)">'+esc(ctx.orcamento_numero||orc.numero||'')+'</b> · '+esc(orc.cliente||'')+(orc.projeto?' — '+esc(orc.projeto):'')+'</div>';
    } else {
      h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">';
      h+=fld('Origem','<select id="mo-origem" style="'+SS+'"><option value="pdvex"'+(origem==='pdvex'?' selected':'')+'>PDVEX</option><option value="avulso"'+(origem==='avulso'?' selected':'')+'>Avulso</option></select>');
      h+=fld('Job / rótulo','<input id="mo-job" type="text" value="'+esc(ctx.job||'')+'" placeholder="ex: PDVEX Rock in Rio" style="'+SS+'">');
      h+=fld('Cliente','<input id="mo-cliente" type="text" value="'+esc(ctx.cliente||'')+'" style="'+SS+'">');
      h+=fld('Evento','<input id="mo-evento" type="text" value="'+esc(ctx.evento||'')+'" placeholder="opcional" style="'+SS+'">');
      h+='</div>';
    }

    /* frente + responsável */
    h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">';
    var selF='<select id="mo-frente" style="'+SS+'">'; FRENTES.forEach(function(x){ selF+='<option'+(ctx.frente===x?' selected':'')+'>'+x+'</option>'; }); selF+='</select>';
    h+=fld('Frente',selF);
    var selR='<select id="mo-resp" style="'+SS+'">'; RESP.forEach(function(x){ selR+='<option'+((ctx.responsavel||'Fernando')===x?' selected':'')+'>'+x+'</option>'; }); selR+='</select>';
    h+=fld('Responsável',selR);
    h+='</div>';

    /* prioridade + prazos */
    h+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">';
    var selP='<select id="mo-prio" style="'+SS+'">'; PRIOS.forEach(function(x){ selP+='<option'+((ctx.prioridade||'normal')===x?' selected':'')+'>'+x+'</option>'; }); selP+='</select>';
    h+=fld('Prioridade',selP);
    h+=fld('Entrega','<input id="mo-entrega" type="date" value="'+esc((ctx.data_entrega||'').split('T')[0])+'" style="'+SS+'">');
    h+=fld('Montagem','<input id="mo-montagem" type="date" value="'+esc((ctx.data_montagem||'').split('T')[0])+'" style="'+SS+'">');
    h+='</div>';

    /* peças do orçamento (ao vivo) — seletor de escopo */
    if(origem==='orcamento'){
      var grupos=(orc.grupos||[]).filter(function(g){ return !g.opcional; });
      if(grupos.length){
        h+='<div style="font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--mut);margin:4px 0 6px">Peças do orçamento — marque o que entra nesta frente</div>';
        h+='<div style="max-height:170px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:6px 8px;margin-bottom:12px">';
        grupos.forEach(function(g,gi){
          var nome=g.nome||('Grupo '+(gi+1));
          var checked = (pecasRef.indexOf(nome)>=0)?' checked':'';
          h+='<label style="display:flex;gap:8px;align-items:flex-start;padding:5px 2px;cursor:pointer">'
            +'<input type="checkbox" class="mo-peca" data-nome="'+esc(nome)+'"'+checked+' style="margin-top:3px">'
            +'<span style="min-width:0"><span style="font-weight:600;font-size:12.5px">'+esc(nome)+'</span>';
          var lns=(g.linhas||[]).filter(function(l){ return (l.desc||'').trim(); });
          if(lns.length){
            h+='<span style="display:block;color:var(--mut);font-size:11px;line-height:1.4">'
              +lns.map(function(l){
                var dim=(l.m2&&(l.lv||l.av))?(' '+(l.lv||'?')+'×'+(l.av||'?')):'';
                var q=(l.qtd&&parseFloat(l.qtd)!==1)?(l.qtd+(l.un?l.un:'x')+' '):'';
                return esc(q+l.desc+dim);
              }).join(' · ')+'</span>';
          }
          h+='</span></label>';
        });
        h+='</div>';
      }
    }

    /* escopo + instruções */
    h+=fld('Escopo desta frente','<textarea id="mo-escopo" rows="2" placeholder="o que produzir nesta frente" style="'+SS+'resize:vertical">'+esc(ctx.escopo||'')+'</textarea>');
    h+='<div style="height:10px"></div>';
    h+=fld('Instruções pro Fernando','<textarea id="mo-instr" rows="2" placeholder="o que só você sabe do job (prazos, cuidados, contato no local…)" style="'+SS+'resize:vertical">'+esc(ctx.instrucoes||'')+'</textarea>');

    h+='<div id="mo-err" style="color:var(--danger);font-size:12px;margin-top:10px;min-height:16px"></div>';
    h+='<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px">';
    h+='<button type="button" data-mo="fechar" style="background:none;border:1px solid var(--line);color:var(--ink);font-size:13px;font-weight:600;padding:9px 16px;border-radius:8px;cursor:pointer">Cancelar</button>';
    h+='<button type="button" data-mo="salvar" style="background:var(--accent);color:#fff;border:none;font-size:13px;font-weight:700;padding:9px 18px;border-radius:8px;cursor:pointer">'+(editando?'Salvar':'Liberar pro Fernando ↦')+'</button>';
    h+='</div></div>';

    ov.innerHTML=h;
    document.body.appendChild(ov);

    function fechar(){ if(ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.addEventListener('click',function(e){ if(e.target===ov) fechar(); });
    Array.prototype.forEach.call(ov.querySelectorAll('[data-mo]'),function(b){
      b.addEventListener('click',function(){
        var a=this.getAttribute('data-mo');
        if(a==='fechar') return fechar();
        if(a==='salvar') return salvar(c,d,ctx,ov,fechar);
      });
    });
  }

  var SS='width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;font-family:inherit;box-sizing:border-box;background:var(--panel);color:var(--ink);';
  function fld(lbl,inner){
    return '<div><div style="font-size:10.5px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--mut);margin-bottom:3px">'+lbl+'</div>'+inner+'</div>';
  }

  /* ── SALVAR ── */
  function salvar(c,d,ctx,ov,fechar){
    var errEl=ov.querySelector('#mo-err');
    function gv(id){ var e=ov.querySelector('#'+id); return e?e.value:''; }
    var editando=!!ctx.id;
    var origem = ctx.origem || (gv('mo-origem')||'orcamento');
    var frente = gv('mo-frente')||'Outros';
    var escopo = (gv('mo-escopo')||'').trim();

    /* peças marcadas */
    var pecas=[];
    Array.prototype.forEach.call(ov.querySelectorAll('.mo-peca:checked'),function(cb){ pecas.push(cb.getAttribute('data-nome')); });
    if(!escopo && pecas.length) escopo=pecas.join(' · ');

    var body={
      origem:origem,
      frente:frente,
      escopo:escopo||null,
      pecas_ref:pecas,
      responsavel:gv('mo-resp')||'Fernando',
      prioridade:gv('mo-prio')||'normal',
      data_entrega:gv('mo-entrega')||null,
      data_montagem:gv('mo-montagem')||null,
      instrucoes:(gv('mo-instr')||'').trim()||null
    };

    var orcNum, cliente, projeto, evento, job;
    if(origem==='orcamento'){
      orcNum=ctx.orcamento_numero;
      var orc=d.orcs[orcNum]||{};
      job=orcNum; cliente=orc.cliente||null; projeto=orc.projeto||null; evento=null;
    } else {
      job=(gv('mo-job')||'').trim();
      cliente=(gv('mo-cliente')||'').trim()||null;
      evento=(gv('mo-evento')||'').trim()||null;
      if(!job){ errEl.textContent='Informe o job / rótulo da OS.'; return; }
      orcNum=null; projeto=null;
    }
    body.job=job; body.orcamento_numero=orcNum; body.cliente=cliente; body.projeto=projeto; body.evento=evento;

    var btn=ov.querySelector('[data-mo="salvar"]'); if(btn){ btn.disabled=true; btn.textContent='Salvando…'; }
    errEl.textContent='';

    var p;
    if(editando){
      p=SS20.sbw('ordens_servico?id=eq.'+ctx.id,'PATCH',body);
    } else {
      body.status='Aguardando início';
      body.liberado_em=new Date().toISOString();
      body.liberado_por=(function(){ try{ return localStorage.getItem('ss20_user_email')||'Carlos'; }catch(e){ return 'Carlos'; } })();
      body.num=novoNum(d,job,frente);
      p=SS20.sbw('ordens_servico','POST',body).then(function(){
        /* sync comercial: liberou 1ª frente de um orçamento Aprovado -> Em Produção */
        if(origem==='orcamento' && orcNum){
          var oc=d.orcs[orcNum]||{};
          if(oc.status==='Aprovado'){
            return SS20.sbw('orcamentos?numero=eq.'+encodeURIComponent(orcNum),'PATCH',{status:'Em Produção'});
          }
        }
      });
    }
    p.then(function(){ fechar(); refresh(c); })
     .catch(function(e){ if(btn){ btn.disabled=false; btn.textContent=editando?'Salvar':'Liberar pro Fernando ↦'; } errEl.textContent='Erro: '+e.message; });
  }

  function novoNum(d,job,frente){
    var ab=ABBR[frente]||'OUT';
    var base=(job||'OS')+' · '+ab;
    var n=0;
    d.frentes.forEach(function(f){ if((f.num||'').indexOf(base)===0) n++; });
    return n? base+'-'+(n+1) : base;
  }

  SS20.modules.prod={render:render};
})();
