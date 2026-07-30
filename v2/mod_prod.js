/* ═══════════════════════════════════════════════════════════════
   SULSIGN OS 2.0 — MÓDULO: ORDENS DE SERVIÇO / PRODUÇÃO (prod)
   v3 (Jul/2026): a OS vira uma FICHA DE PRODUÇÃO de verdade.
   Cada frente ganha: nº de série (job/NN), selo SulSign|PDVEX,
   evento (da tabela eventos), imagem de referência + arquivos
   (Projeto, Detalhamento, Vetores de corte), modelos/presets, e
   lançamento de CUSTO REAL direto em lancamentos (fonte única —
   nada de planilha paralela; a ficha só LÊ o acumulado do job).
   Peças puxadas AO VIVO do orçamento. iOS Safari: var, sem template
   literals, sem arrow, sem let/const, listeners pós-render.
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
  var EMPRESAS=['SulSign','PDVEX'];
  var ECOR={'SulSign':'#111418','PDVEX':'#7C3AED'};

  /* modelos/presets — prefillam a frente na hora de liberar */
  var MODELOS=[
    {nome:'— sem modelo —'},
    {nome:'Letra caixa',       frente:'Marcenaria', empresa:'SulSign', resp:'Fernando', escopo:'Letra caixa (PVC/ACM), pintura e instalação conforme projeto.'},
    {nome:'Testeira em lona',  frente:'Impressão',  empresa:'SulSign', resp:'Fernando', escopo:'Impressão de lona, acabamento (ilhós/bastão) e tensionamento.'},
    {nome:'Praticável PDVEX',  frente:'Estrutura',  empresa:'PDVEX',   resp:'Everson',  escopo:'Montagem de praticável PDVEX conforme mapa; chapeamento e acabamento.'},
    {nome:'Piso em vinil',     frente:'Acabamento', empresa:'SulSign', resp:'Fernando', escopo:'Aplicação de vinil de piso com laminação; recorte conforme vetor.'},
    {nome:'Cenografia geral',  frente:'Montagem',   empresa:'SulSign', resp:'Fernando', escopo:''}
  ];

  /* tipos de arquivo da ficha */
  var TIPOS_ARQ=[
    {k:'referencia',   lbl:'Imagem de referência', accept:'image/*'},
    {k:'projeto',      lbl:'Projeto',              accept:'application/pdf,image/*,.pdf'},
    {k:'detalhamento', lbl:'Detalhamento',         accept:'application/pdf,image/*,.pdf'},
    {k:'vetor',        lbl:'Vetores de corte',     accept:'.dxf,.ai,.svg,.cdr,.pdf,.eps'},
    {k:'outro',        lbl:'Outros',               accept:'*/*'}
  ];
  var TLBL={}; TIPOS_ARQ.forEach(function(t){ TLBL[t.k]=t.lbl; });
  var MAX_BYTES=9*1024*1024; /* ~9MB por arquivo (base64 no banco) */

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function isTreino(x){ return (x||'').indexOf('TREINO')>=0; }
  function dstr(d){ if(!d)return '—'; var p=(String(d).split('T')[0]||'').split('-'); return p.length===3?(p[2]+'/'+p[1]+'/'+p[0]):d; }
  function hojeISO(){ var d=new Date(); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  function kb(n){ n=+n||0; return n<1024?n+' B':(n<1048576?(n/1024).toFixed(0)+' KB':(n/1048576).toFixed(1)+' MB'); }
  function evLabel(e){ return e? (e.nome||e.titulo||e.evento||e.descricao||('#'+e.id)) : ''; }

  /* ── DADOS ── (sem cache: produção muda o tempo todo) */
  function fetchData(){
    return Promise.all([
      SS20.sb('ordens_servico?select=*&deletado_em=is.null&order=created_at.desc'),
      SS20.sb('orcamentos?select=numero,cliente,agencia,projeto,grupos,status&order=numero.desc'),
      SS20.sb('eventos?select=*&order=id.desc').catch(function(){ return []; })
    ]).then(function(r){
      var frentes=r[0].filter(function(o){ return !isTreino(o.num)&&!isTreino(o.orcamento_numero)&&!isTreino(o.job); });
      var orcs={}, orcList=[];
      r[1].forEach(function(o){ if(isTreino(o.numero))return; orcs[o.numero]=o; orcList.push(o); });
      var eventos=(r[2]||[]).filter(function(e){ return !isTreino(evLabel(e)); });
      return {frentes:frentes, orcs:orcs, orcList:orcList, eventos:eventos};
    });
  }

  function render(c){
    c.innerHTML='<div class="loading-view">Carregando ordens de serviço…</div>';
    fetchData().then(function(d){ draw(c,d); })
    .catch(function(e){ c.innerHTML='<div class="err-view">Erro ao carregar OS: '+esc(e.message)+'</div>'; });
  }
  function refresh(c){ render(c); }

  /* ── DESENHO (lista) ── */
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

    var frentesPorOrc={};
    d.frentes.forEach(function(f){ if(f.orcamento_numero){ (frentesPorOrc[f.orcamento_numero]=frentesPorOrc[f.orcamento_numero]||[]).push(f); } });
    var prontos=d.orcList.filter(function(o){ return ['Aprovado','Em Produção'].indexOf(o.status)>=0; });

    var h='<div style="padding:22px 24px 40px">';
    h+='<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:2px">';
    h+='<h2 style="font-family:var(--font-d);font-size:19px">Ordens de Serviço</h2>';
    h+='<span style="flex:1"></span>';
    h+='<button type="button" data-os="nova" style="background:var(--accent);color:#fff;border:none;font-size:12.5px;font-weight:600;padding:8px 14px;border-radius:8px;cursor:pointer">+ Nova OS (PDVEX / avulsa)</button>';
    h+='</div>';
    h+='<p style="color:var(--mut);font-size:12.5px;margin-bottom:18px">O que você soltou pro Fernando — por frente. Toque numa frente pra abrir a ficha de produção.</p>';

    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:22px">';
    h+=kpi('Frentes abertas',abertas,atrasadas?('⚠ '+atrasadas+' atrasada'+(atrasadas>1?'s':'')):'nenhuma atrasada',atrasadas?'var(--danger)':'var(--ok)');
    h+=kpi('Em produção',porStatus['Em produção']||0,'','var(--warn)');
    h+=kpi('Aguardando',porStatus['Aguardando início']||0,'ainda não iniciadas','var(--ink)');
    h+=kpi('Prontos p/ soltar',prontos.length,'orçamentos aprovados','var(--blue)');
    h+='</div>';

    /* SEÇÃO 1: PRONTOS PRA SOLTAR */
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

    /* SEÇÃO 2: FRENTES SOLTAS (agrupadas por job) */
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
    var emp=f.empresa||'SulSign';
    var ecor=ECOR[emp]||'#111418';
    var h='<div data-os="ficha" data-id="'+f.id+'" style="background:var(--panel);border:1px solid '+(late?'var(--danger)':'var(--line)')+';border-radius:var(--radius);padding:12px 13px;cursor:pointer">';
    h+='<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">'
      +'<span style="font-size:9px;font-weight:800;letter-spacing:.5px;padding:2px 6px;border-radius:9px;background:'+ecor+';color:#fff">'+esc(emp)+'</span>'
      +'<span style="font-weight:700;font-size:13px">'+esc(f.frente||'Frente')+'</span>';
    if(f.prioridade&&f.prioridade!=='normal') h+='<span style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;padding:2px 6px;border-radius:9px;background:'+pcor+'1a;color:'+pcor+'">'+esc(f.prioridade)+'</span>';
    h+='<span style="flex:1"></span>'
      +'<button type="button" data-os="editar" data-id="'+f.id+'" title="Editar" style="background:none;border:none;color:var(--mut);cursor:pointer;font-size:13px;padding:2px 4px">✎</button>'
      +'<button type="button" data-os="excluir" data-id="'+f.id+'" title="Excluir" style="background:none;border:none;color:var(--mut);cursor:pointer;font-size:14px;padding:2px 4px">×</button>'
      +'</div>';
    h+='<div style="font-size:11px;color:var(--mut);margin-bottom:2px">'+esc(f.responsavel||'Fernando')+(f.serial_os?' · <b style="color:var(--ink);font-weight:700">'+esc(f.serial_os)+'</b>':'')+(f.num?' · '+esc(f.num):'')+'</div>';
    if(f.escopo) h+='<div style="font-size:12px;margin:4px 0;line-height:1.35">'+esc(f.escopo)+'</div>';
    if(f.instrucoes) h+='<div style="font-size:11.5px;color:var(--ink2);border-left:2px solid var(--accent);padding:5px 8px;margin:6px 0;border-radius:0 6px 6px 0;line-height:1.35;background:rgba(127,127,127,.06)">📌 '+esc(f.instrucoes)+'</div>';
    var prz='';
    if(f.data_entrega) prz+='entrega '+dstr(f.data_entrega);
    if(f.data_montagem) prz+=(prz?' · ':'')+'montagem '+dstr(f.data_montagem);
    h+='<div style="font-size:11px;'+(late?'color:var(--danger);font-weight:700':'color:var(--mut)')+';margin:6px 0 9px">'+(prz||'sem prazo')+(late?' ⚠ atrasada':'')+'</div>';
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
    Array.prototype.forEach.call(c.querySelectorAll('[data-os]'),function(b){
      b.addEventListener('click',function(ev){
        var act=this.getAttribute('data-os');
        if(act!=='ficha') ev.stopPropagation();
        if(act==='nova')    return abrirModal(c,d,{origem:'pdvex'});
        if(act==='soltar')  return abrirModal(c,d,{origem:'orcamento',orcamento_numero:this.getAttribute('data-orc')});
        if(act==='editar')  return abrirModal(c,d,acharFrente(d,this.getAttribute('data-id')));
        if(act==='excluir') return excluir(c,this.getAttribute('data-id'));
        if(act==='status')  return mudarStatus(c,d,this.getAttribute('data-id'),this.getAttribute('data-st'));
        if(act==='ficha')   return abrirFicha(c,d,acharFrente(d,this.getAttribute('data-id')));
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

  /* ═══════════════ MODAL LIBERAR / EDITAR FRENTE ═══════════════ */
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

    if(!editando){
      var selM='<select id="mo-modelo" style="'+SS+'">'; MODELOS.forEach(function(m,i){ selM+='<option value="'+i+'">'+esc(m.nome)+'</option>'; }); selM+='</select>';
      h+='<div style="margin-bottom:12px">'+fld('Modelo (opcional — prefill)',selM)+'</div>';
    }

    if(origem==='orcamento'){
      h+='<div style="font-size:12.5px;color:var(--mut);margin-bottom:12px">Job <b style="color:var(--ink)">'+esc(ctx.orcamento_numero||orc.numero||'')+'</b> · '+esc(orc.cliente||'')+(orc.projeto?' — '+esc(orc.projeto):'')+'</div>';
    } else {
      h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">';
      h+=fld('Origem','<select id="mo-origem" style="'+SS+'"><option value="pdvex"'+(origem==='pdvex'?' selected':'')+'>PDVEX</option><option value="avulso"'+(origem==='avulso'?' selected':'')+'>Avulso</option></select>');
      h+=fld('Job / rótulo','<input id="mo-job" type="text" value="'+esc(ctx.job||'')+'" placeholder="ex: PDVEX Rock in Rio" style="'+SS+'">');
      h+=fld('Cliente','<input id="mo-cliente" type="text" value="'+esc(ctx.cliente||'')+'" style="'+SS+'">');
      h+='</div>';
    }

    /* empresa + evento */
    h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">';
    var empDefault=ctx.empresa||(origem==='pdvex'?'PDVEX':'SulSign');
    var selE='<select id="mo-empresa" style="'+SS+'">'; EMPRESAS.forEach(function(x){ selE+='<option'+(empDefault===x?' selected':'')+'>'+x+'</option>'; }); selE+='</select>';
    h+=fld('Empresa',selE);
    var selEv='<select id="mo-evento" style="'+SS+'"><option value="">— sem evento —</option>';
    (d.eventos||[]).forEach(function(e){ var lb=evLabel(e); selEv+='<option'+((ctx.evento||'')===lb?' selected':'')+'>'+esc(lb)+'</option>'; });
    selEv+='<option value="__outro">+ outro (digitar)</option></select>';
    h+=fld('Evento',selEv);
    h+='</div>';
    h+='<div id="mo-evento-wrap" style="display:none;margin-bottom:12px">'+fld('Nome do evento','<input id="mo-evento-txt" type="text" value="" placeholder="digite o evento" style="'+SS+'">')+'</div>';

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

    /* peças do orçamento (ao vivo) */
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

    var evSel=ov.querySelector('#mo-evento'), evWrap=ov.querySelector('#mo-evento-wrap');
    if(evSel){ evSel.addEventListener('change',function(){ evWrap.style.display=(this.value==='__outro')?'block':'none'; }); }

    var mSel=ov.querySelector('#mo-modelo');
    if(mSel){ mSel.addEventListener('change',function(){
      var m=MODELOS[+this.value]; if(!m||!m.nome||m.nome.indexOf('sem modelo')>=0) return;
      if(m.frente){ setSel(ov,'#mo-frente',m.frente); }
      if(m.empresa){ setSel(ov,'#mo-empresa',m.empresa); }
      if(m.resp){ setSel(ov,'#mo-resp',m.resp); }
      var et=ov.querySelector('#mo-escopo'); if(et && !et.value) et.value=m.escopo||'';
    }); }

    Array.prototype.forEach.call(ov.querySelectorAll('[data-mo]'),function(b){
      b.addEventListener('click',function(){
        var a=this.getAttribute('data-mo');
        if(a==='fechar') return fechar();
        if(a==='salvar') return salvar(c,d,ctx,ov,fechar);
      });
    });
  }

  function setSel(ov,sel,val){ var e=ov.querySelector(sel); if(!e)return; for(var i=0;i<e.options.length;i++){ if(e.options[i].value===val||e.options[i].text===val){ e.selectedIndex=i; return; } } }

  var SS='width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;font-family:inherit;box-sizing:border-box;background:var(--panel);color:var(--ink);';
  function fld(lbl,inner){
    return '<div><div style="font-size:10.5px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--mut);margin-bottom:3px">'+lbl+'</div>'+inner+'</div>';
  }

  /* ── SALVAR (liberar/editar) ── */
  function salvar(c,d,ctx,ov,fechar){
    var errEl=ov.querySelector('#mo-err');
    function gv(id){ var e=ov.querySelector('#'+id); return e?e.value:''; }
    var editando=!!ctx.id;
    var origem = ctx.origem || (gv('mo-origem')||'orcamento');
    var frente = gv('mo-frente')||'Outros';
    var escopo = (gv('mo-escopo')||'').trim();

    var pecas=[];
    Array.prototype.forEach.call(ov.querySelectorAll('.mo-peca:checked'),function(cb){ pecas.push(cb.getAttribute('data-nome')); });
    if(!escopo && pecas.length) escopo=pecas.join(' · ');

    var evento=gv('mo-evento');
    if(evento==='__outro') evento=(gv('mo-evento-txt')||'').trim();

    var body={
      origem:origem,
      empresa:gv('mo-empresa')||'SulSign',
      frente:frente,
      escopo:escopo||null,
      pecas_ref:pecas,
      responsavel:gv('mo-resp')||'Fernando',
      prioridade:gv('mo-prio')||'normal',
      data_entrega:gv('mo-entrega')||null,
      data_montagem:gv('mo-montagem')||null,
      instrucoes:(gv('mo-instr')||'').trim()||null,
      evento:evento||null
    };

    var orcNum, cliente, projeto, job;
    if(origem==='orcamento'){
      orcNum=ctx.orcamento_numero;
      var orc=d.orcs[orcNum]||{};
      job=orcNum; cliente=orc.cliente||null; projeto=orc.projeto||null;
    } else {
      job=(gv('mo-job')||'').trim();
      cliente=(gv('mo-cliente')||'').trim()||null;
      if(!job){ errEl.textContent='Informe o job / rótulo da OS.'; return; }
      orcNum=null; projeto=null;
    }
    body.job=job; body.orcamento_numero=orcNum; body.cliente=cliente; body.projeto=projeto;

    var btn=ov.querySelector('[data-mo="salvar"]'); if(btn){ btn.disabled=true; btn.textContent='Salvando…'; }
    errEl.textContent='';

    if(editando){
      SS20.sbw('ordens_servico?id=eq.'+ctx.id,'PATCH',body)
        .then(function(){ fechar(); refresh(c); })
        .catch(function(e){ if(btn){ btn.disabled=false; btn.textContent='Salvar'; } errEl.textContent='Erro: '+e.message; });
      return;
    }

    body.status='Aguardando início';
    body.liberado_em=new Date().toISOString();
    body.liberado_por=(function(){ try{ return localStorage.getItem('ss20_user_email')||'Carlos'; }catch(e){ return 'Carlos'; } })();
    body.num=novoNum(d,job);
    var miEl=ov.querySelector('#mo-modelo');
    if(miEl){ var mm=MODELOS[+miEl.value]; if(mm && mm.nome && mm.nome.indexOf('sem modelo')<0) body.modelo=mm.nome; }

    createOS(body).then(function(row){
      var p=Promise.resolve();
      if(origem==='orcamento' && orcNum){
        var oc=d.orcs[orcNum]||{};
        if(oc.status==='Aprovado') p=SS20.sbw('orcamentos?numero=eq.'+encodeURIComponent(orcNum),'PATCH',{status:'Em Produção'});
      }
      return p.then(function(){
        fechar();
        fetchData().then(function(nd){ draw(c,nd); if(row&&row.id){ abrirFicha(c,nd,acharFrente(nd,row.id)); } });
      });
    }).catch(function(e){ if(btn){ btn.disabled=false; btn.textContent='Liberar pro Fernando ↦'; } errEl.textContent='Erro: '+e.message; });
  }

  /* POST com retorno da linha (pra abrir a ficha em seguida) */
  function createOS(body){
    var tk=window.SULSIGN_ACCESS_TOKEN||SulSignCore.SUPA_KEY;
    return fetch(SulSignCore.SUPA_URL+'/rest/v1/ordens_servico',{
      method:'POST',
      headers:{'apikey':SulSignCore.SUPA_KEY,'Authorization':'Bearer '+tk,'Content-Type':'application/json','Prefer':'return=representation'},
      body:JSON.stringify(body)
    }).then(function(r){
      if(!r.ok) return r.text().then(function(t){ throw new Error(r.status+': '+t.slice(0,140)); });
      return r.json();
    }).then(function(rows){ return (rows&&rows[0])||null; });
  }

  function novoNum(d,job){
    var n=0;
    d.frentes.forEach(function(f){ if((f.job||f.orcamento_numero)===job) n++; });
    return (job||'OS')+'/'+('0'+(n+1)).slice(-2);
  }

  /* ═══════════════ FICHA DE PRODUÇÃO (detalhe) ═══════════════ */
  function abrirFicha(c,d,f){
    if(!f||!f.id) return;
    var ov=document.createElement('div');
    ov.id='os-ficha';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto';
    ov.innerHTML='<div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;max-width:680px;width:100%;margin:auto;padding:20px"><div class="loading-view" style="padding:30px">Carregando ficha…</div></div>';
    document.body.appendChild(ov);
    function fechar(){ if(ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.addEventListener('click',function(e){ if(e.target===ov) fechar(); });

    var jobKey=jobKeyOf(f);
    Promise.all([
      SS20.sb('os_arquivos?select=*&os_id=eq.'+f.id+'&deletado_em=is.null&order=created_at.asc').catch(function(){ return []; }),
      SS20.sb('lancamentos?select=valor,tipo_lancamento,categoria,descricao,data,conciliado&orcamento_numero=eq.'+encodeURIComponent(jobKey)+'&deletado_em=is.null&order=data.desc').catch(function(){ return []; })
    ]).then(function(r){
      desenharFicha(c,d,f,ov,fechar,r[0]||[],r[1]||[]);
    }).catch(function(e){
      ov.firstChild.innerHTML='<div class="err-view">Erro ao abrir ficha: '+esc(e.message)+'</div>';
    });
  }

  function desenharFicha(c,d,f,ov,fechar,arquivos,lancs){
    var emp=f.empresa||'SulSign', ecor=ECOR[emp]||'#111418';
    var s=f.status||'Aguardando início', scor=SCOR[s]||'#6B6E76';
    var pcor=PCOR[f.prioridade]||'#6B6E76';
    var ref=null; arquivos.forEach(function(a){ if(a.tipo==='referencia'&&!ref) ref=a; });

    var custoTotal=0, custoConc=0;
    lancs.forEach(function(l){ if((l.tipo_lancamento||'')==='saida'){ var v=parseFloat(l.valor)||0; custoTotal+=v; if(l.conciliado) custoConc+=v; } });

    var meta=d.orcs[f.orcamento_numero]||{};
    var venda=meta.numero?SulSignCore.calcOrcamento(meta).venda:null;

    var h='<div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;max-width:680px;width:100%;margin:auto;box-shadow:0 20px 60px -20px rgba(0,0,0,.6)">';

    h+='<div style="padding:18px 20px 14px;border-bottom:1px solid var(--line)">';
    h+='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">';
    h+='<span style="font-size:10px;font-weight:800;letter-spacing:.5px;padding:3px 8px;border-radius:9px;background:'+ecor+';color:#fff">'+esc(emp)+'</span>';
    h+='<span style="font-family:var(--font-d);font-size:18px;font-weight:800">'+esc(f.serial_os||f.num||'OS')+'</span>';
    if(f.serial_os && f.num) h+='<span style="font-size:11px;color:var(--mut)">'+esc(f.num)+'</span>';
    h+='<span style="font-size:11px;color:var(--mut)">'+esc(f.frente||'')+'</span>';
    if(f.prioridade&&f.prioridade!=='normal') h+='<span style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;padding:2px 6px;border-radius:9px;background:'+pcor+'1a;color:'+pcor+'">'+esc(f.prioridade)+'</span>';
    h+='<span style="flex:1"></span>';
    h+='<button type="button" data-fi="print" title="Imprimir ficha" style="background:none;border:1px solid var(--line);color:var(--ink);font-size:12px;font-weight:600;padding:6px 11px;border-radius:7px;cursor:pointer">🖨 Imprimir</button>';
    h+='<button type="button" data-fi="editar" title="Editar" style="background:none;border:1px solid var(--line);color:var(--ink);font-size:12px;font-weight:600;padding:6px 11px;border-radius:7px;cursor:pointer">✎ Editar</button>';
    h+='<button type="button" data-fi="fechar" style="background:none;border:none;font-size:20px;color:var(--mut);cursor:pointer;line-height:1">×</button>';
    h+='</div>';
    h+='<div style="font-weight:700;font-size:14px">'+esc(f.job||f.orcamento_numero||'')+(f.cliente?' <span style="color:var(--mut);font-weight:500">· '+esc(f.cliente)+'</span>':'')+'</div>';
    if(f.projeto) h+='<div style="color:var(--mut);font-size:12px;margin-top:2px">'+esc(f.projeto)+'</div>';
    if(f.evento) h+='<div style="font-size:11.5px;margin-top:4px"><span style="color:var(--mut)">Evento:</span> '+esc(f.evento)+'</div>';
    h+='</div>';

    h+='<div style="padding:16px 20px 20px">';

    /* hero: imagem de referência */
    h+='<div style="margin-bottom:16px">';
    if(ref){
      h+='<div style="position:relative">';
      h+='<img src="'+esc(dataUrl(ref))+'" style="width:100%;max-height:260px;object-fit:contain;border:1px solid var(--line);border-radius:10px;background:#0000000a">';
      h+='<button type="button" data-fi="delarq" data-aid="'+ref.id+'" title="Remover referência" style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,.55);color:#fff;border:none;border-radius:7px;font-size:12px;padding:4px 8px;cursor:pointer">× ref</button>';
      h+='</div>';
    } else {
      h+='<label style="display:flex;align-items:center;justify-content:center;gap:8px;height:96px;border:1.5px dashed var(--line);border-radius:10px;color:var(--mut);font-size:12.5px;cursor:pointer">'
        +'<span>📷 Adicionar imagem de referência</span>'
        +'<input type="file" accept="image/*" class="fi-up" data-tipo="referencia" style="display:none">'
        +'</label>';
    }
    h+='</div>';

    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px">';
    h+=miniBox('Responsável',esc(f.responsavel||'Fernando'));
    h+=miniBox('Entrega',dstr(f.data_entrega));
    h+=miniBox('Montagem',dstr(f.data_montagem));
    if(venda!=null) h+=miniBox('Venda (orçamento)',fmt(venda));
    h+='</div>';

    h+='<div style="font-size:10.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--mut);margin:0 0 6px">Status</div>';
    h+='<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:16px">';
    STATUS.forEach(function(st){
      var on=(st===s);
      h+='<button type="button" data-fi="status" data-st="'+esc(st)+'" style="flex:1;min-width:0;font-size:10px;font-weight:700;padding:7px 4px;border-radius:7px;cursor:pointer;border:1px solid '+(on?scor:'var(--line)')+';background:'+(on?scor:'transparent')+';color:'+(on?'#fff':'var(--mut)')+'">'+esc(st)+'</button>';
    });
    h+='</div>';

    if(f.escopo){ h+='<div style="font-size:10.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--mut);margin:0 0 4px">Escopo</div><div style="font-size:12.5px;line-height:1.4;margin-bottom:14px">'+esc(f.escopo)+'</div>'; }
    if(f.instrucoes){ h+='<div style="font-size:11.5px;color:var(--ink2);border-left:2px solid var(--accent);padding:7px 10px;margin:0 0 16px;border-radius:0 6px 6px 0;line-height:1.4;background:rgba(127,127,127,.06)">📌 '+esc(f.instrucoes)+'</div>'; }

    /* ARQUIVOS */
    h+='<div style="font-size:10.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--mut);margin:0 0 8px">Arquivos de produção</div>';
    ['projeto','detalhamento','vetor','outro'].forEach(function(tp){
      var lista=arquivos.filter(function(a){ return a.tipo===tp; });
      h+='<div style="border:1px solid var(--line);border-radius:9px;padding:9px 11px;margin-bottom:8px">';
      h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:'+(lista.length?'7px':'0')+'">'
        +'<span style="font-weight:700;font-size:12px">'+esc(TLBL[tp]||tp)+'</span>'
        +'<span style="flex:1"></span>'
        +'<label style="font-size:11px;font-weight:600;color:var(--accent);cursor:pointer;padding:2px 4px">+ anexar<input type="file" class="fi-up" data-tipo="'+tp+'" accept="'+esc(acceptFor(tp))+'" style="display:none"></label>'
        +'</div>';
      lista.forEach(function(a){
        h+='<div style="display:flex;align-items:center;gap:8px;font-size:11.5px;padding:3px 0">'
          +'<span style="min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📎 <a href="'+esc(dataUrl(a))+'" download="'+esc(a.nome||'arquivo')+'" target="_blank" rel="noopener" style="color:var(--ink);text-decoration:underline">'+esc(a.nome||'arquivo')+'</a> <span style="color:var(--mut)">'+kb(a.tamanho)+'</span></span>'
          +'<button type="button" data-fi="delarq" data-aid="'+a.id+'" title="Remover" style="background:none;border:none;color:var(--mut);cursor:pointer;font-size:13px">×</button>'
          +'</div>';
      });
      h+='</div>';
    });

    /* CUSTO REAL */
    h+='<div style="font-size:10.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--mut);margin:14px 0 6px">Custo real do job <span style="font-weight:500;text-transform:none;letter-spacing:0">· Centro de Custo · '+esc(jobKeyOf(f))+'</span></div>';
    h+='<div style="border:1px solid var(--line);border-radius:9px;padding:11px 12px;margin-bottom:8px">';
    h+='<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:8px">';
    h+='<div><div style="font-size:10px;color:var(--mut)">custo lançado</div><div style="font-family:var(--font-d);font-size:18px;font-weight:800">'+fmt(custoTotal)+'</div></div>';
    h+='<div><div style="font-size:10px;color:var(--mut)">conciliado</div><div style="font-size:13px;font-weight:700;color:var(--ok)">'+fmt(custoConc)+'</div></div>';
    if(venda!=null){ var mg=venda>0?((venda-custoTotal)/venda*100):0; h+='<div><div style="font-size:10px;color:var(--mut)">margem s/ venda</div><div style="font-size:13px;font-weight:700;color:'+(mg<15?'var(--danger)':'var(--ok)')+'">'+mg.toFixed(0)+'%</div></div>'; }
    h+='<span style="flex:1"></span>';
    h+='<button type="button" data-fi="custo" style="background:var(--ink);color:#fff;border:none;font-size:12px;font-weight:600;padding:7px 12px;border-radius:8px;cursor:pointer">+ lançar custo</button>';
    h+='</div>';
    if(lancs.length){
      h+='<div style="max-height:130px;overflow:auto;border-top:1px solid var(--line);padding-top:6px">';
      lancs.slice(0,12).forEach(function(l){
        if((l.tipo_lancamento||'')!=='saida') return;
        h+='<div style="display:flex;gap:8px;font-size:11px;padding:2px 0;color:var(--mut)"><span style="width:64px">'+dstr(l.data)+'</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(l.categoria||'')+' · '+esc(l.descricao||'')+'</span><span style="font-weight:700;color:var(--ink)">'+fmt(parseFloat(l.valor)||0)+'</span></div>';
      });
      h+='</div>';
    } else {
      h+='<div style="font-size:11.5px;color:var(--mut)">Nenhum custo lançado neste job ainda.</div>';
    }
    h+='</div>';
    h+='<div style="font-size:10.5px;color:var(--mut);line-height:1.4">Custo grava direto em <b>lancamentos</b> (fonte única) como saída vinculada ao job, <b>não conciliada</b> — aparece já no Centro de Custo e concilia depois contra o extrato.</div>';

    h+='</div></div>';

    ov.innerHTML=h;

    ov.addEventListener('click',function(e){ if(e.target===ov) fechar(); });
    Array.prototype.forEach.call(ov.querySelectorAll('[data-fi]'),function(b){
      b.addEventListener('click',function(){
        var a=this.getAttribute('data-fi');
        if(a==='fechar')  return fechar();
        if(a==='print')   return imprimirFicha(f,arquivos,lancs,custoTotal,venda);
        if(a==='editar')  { fechar(); return abrirModal(c,d,f); }
        if(a==='status')  { var st=this.getAttribute('data-st'); return mudarStatus2(c,d,f,st,ov,fechar); }
        if(a==='delarq')  return removerArquivo(c,d,f,this.getAttribute('data-aid'),ov,fechar);
        if(a==='custo')   return abrirCusto(c,d,f,ov,fechar);
      });
    });
    Array.prototype.forEach.call(ov.querySelectorAll('.fi-up'),function(inp){
      inp.addEventListener('change',function(){ uploadArquivo(c,d,f,this.getAttribute('data-tipo'),this.files&&this.files[0],ov,fechar); });
    });
  }

  function miniBox(lbl,val){
    return '<div style="border:1px solid var(--line);border-radius:9px;padding:9px 11px"><div style="font-size:10px;color:var(--mut);text-transform:uppercase;letter-spacing:.4px;font-weight:700">'+lbl+'</div><div style="font-size:13px;font-weight:700;margin-top:2px">'+val+'</div></div>';
  }
  function acceptFor(tp){ var r=''; TIPOS_ARQ.forEach(function(t){ if(t.k===tp) r=t.accept; }); return r||'*/*'; }
  function dataUrl(a){ var dd=a.dados||''; return dd.indexOf('data:')===0?dd:('data:'+(a.mime||'application/octet-stream')+';base64,'+dd); }
  function jobKeyOf(f){ return f.orcamento_numero||f.job||'SEM-JOB'; }

  function mudarStatus2(c,d,f,novo,ov,fechar){
    if(f.status===novo) return;
    var body={status:novo}; body.concluido_em=TERMINAIS[novo]?new Date().toISOString():null;
    SS20.sbw('ordens_servico?id=eq.'+f.id,'PATCH',body).then(function(){
      f.status=novo;
      fechar(); fetchData().then(function(nd){ draw(c,nd); abrirFicha(c,nd,acharFrente(nd,f.id)); });
    }).catch(function(e){ alert('Erro ao mudar status: '+e.message); });
  }

  /* ── UPLOAD (base64 -> os_arquivos) ── */
  function uploadArquivo(c,d,f,tipo,file,ov,fechar){
    if(!file) return;
    if(file.size>MAX_BYTES){ alert('Arquivo muito grande ('+kb(file.size)+'). Limite '+kb(MAX_BYTES)+'.'); return; }
    var rd=new FileReader();
    rd.onload=function(){
      var body={ os_id:f.id, tipo:tipo, nome:file.name, mime:file.type||'application/octet-stream', tamanho:file.size, dados:String(rd.result) };
      SS20.sbw('os_arquivos','POST',body).then(function(){
        fechar(); fetchData().then(function(nd){ draw(c,nd); abrirFicha(c,nd,acharFrente(nd,f.id)); });
      }).catch(function(e){ alert('Erro ao anexar: '+e.message); });
    };
    rd.onerror=function(){ alert('Não consegui ler o arquivo.'); };
    rd.readAsDataURL(file);
  }
  function removerArquivo(c,d,f,aid,ov,fechar){
    if(!window.confirm('Remover este arquivo?')) return;
    SS20.sbw('os_arquivos?id=eq.'+aid,'PATCH',{deletado_em:new Date().toISOString()}).then(function(){
      fechar(); fetchData().then(function(nd){ draw(c,nd); abrirFicha(c,nd,acharFrente(nd,f.id)); });
    }).catch(function(e){ alert('Erro ao remover: '+e.message); });
  }

  /* ── CUSTO REAL (-> lancamentos) ── */
  function abrirCusto(c,d,f,ovFicha,fecharFicha){
    var cats=(SulSignCore.CATEGORIAS||['Material','Mão de Obra','Locação','Outros']);
    var ov=document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow:auto';
    var selC='<select id="cu-cat" style="'+SS+'">'; cats.forEach(function(x){ selC+='<option'+(x==='Material'?' selected':'')+'>'+esc(x)+'</option>'; }); selC+='</select>';
    var h='<div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;max-width:440px;width:100%;margin:auto;padding:20px">';
    h+='<div style="display:flex;align-items:center;margin-bottom:12px"><h3 style="font-family:var(--font-d);font-size:16px">Lançar custo real</h3><span style="flex:1"></span><button type="button" data-cu="fechar" style="background:none;border:none;font-size:20px;color:var(--mut);cursor:pointer">×</button></div>';
    h+='<div style="font-size:12px;color:var(--mut);margin-bottom:12px">Job <b style="color:var(--ink)">'+esc(jobKeyOf(f))+'</b> — grava em lancamentos (saída, não conciliada).</div>';
    h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">';
    h+=fld('Valor (R$)','<input id="cu-valor" type="text" inputmode="decimal" placeholder="0,00" style="'+SS+'">');
    h+=fld('Data','<input id="cu-data" type="date" value="'+hojeISO()+'" style="'+SS+'">');
    h+='</div>';
    h+='<div style="margin-bottom:10px">'+fld('Categoria',selC)+'</div>';
    h+='<div style="margin-bottom:10px">'+fld('Fornecedor','<input id="cu-forn" type="text" placeholder="opcional" style="'+SS+'">')+'</div>';
    h+='<div style="margin-bottom:12px">'+fld('Descrição','<input id="cu-desc" type="text" value="'+esc((f.frente||'')+' — '+(f.num||''))+'" style="'+SS+'">')+'</div>';
    h+='<div id="cu-err" style="color:var(--danger);font-size:12px;min-height:16px;margin-bottom:6px"></div>';
    h+='<div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" data-cu="fechar" style="background:none;border:1px solid var(--line);color:var(--ink);font-size:13px;font-weight:600;padding:9px 16px;border-radius:8px;cursor:pointer">Cancelar</button><button type="button" data-cu="salvar" style="background:var(--accent);color:#fff;border:none;font-size:13px;font-weight:700;padding:9px 18px;border-radius:8px;cursor:pointer">Lançar custo</button></div>';
    h+='</div>';
    ov.innerHTML=h;
    document.body.appendChild(ov);
    function fecharCu(){ if(ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.addEventListener('click',function(e){ if(e.target===ov) fecharCu(); });
    Array.prototype.forEach.call(ov.querySelectorAll('[data-cu]'),function(b){
      b.addEventListener('click',function(){
        var a=this.getAttribute('data-cu');
        if(a==='fechar') return fecharCu();
        if(a==='salvar'){
          var errEl=ov.querySelector('#cu-err');
          function gv(id){ var e=ov.querySelector('#'+id); return e?e.value:''; }
          var vraw=(gv('cu-valor')||'').replace(/\./g,'').replace(',','.');
          var valor=parseFloat(vraw);
          if(!(valor>0)){ errEl.textContent='Informe um valor válido.'; return; }
          var body={
            orcamento_numero:jobKeyOf(f),
            data:gv('cu-data')||hojeISO(),
            categoria:gv('cu-cat')||'Outros',
            descricao:(gv('cu-desc')||'').trim()||(f.frente||'Custo OS'),
            fornecedor:(gv('cu-forn')||'').trim()||null,
            valor:valor,
            tipo_lancamento:'saida',
            conciliado:false,
            tem_nota:false
          };
          var btn=ov.querySelector('[data-cu="salvar"]'); if(btn){ btn.disabled=true; btn.textContent='Lançando…'; }
          SS20.sbw('lancamentos','POST',body).then(function(){
            fecharCu();
            fecharFicha(); fetchData().then(function(nd){ draw(c,nd); abrirFicha(c,nd,acharFrente(nd,f.id)); });
          }).catch(function(e){ if(btn){ btn.disabled=false; btn.textContent='Lançar custo'; } errEl.textContent='Erro: '+e.message; });
        }
      });
    });
  }

  /* ── IMPRESSÃO DA FICHA (bancada) ── */
  function imprimirFicha(f,arquivos,lancs,custoTotal,venda){
    var w=window.open('','_blank');
    if(!w){ alert('Libere pop-ups para imprimir.'); return; }
    var ref=null; arquivos.forEach(function(a){ if(a.tipo==='referencia'&&!ref) ref=a; });
    var listaArq=arquivos.filter(function(a){ return a.tipo!=='referencia'; });
    var css='body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:26px;font-size:12px}'
      +'h1{font-size:20px;margin:0 0 2px}.mut{color:#666}.badge{display:inline-block;background:#111;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:8px;margin-right:6px}'
      +'.row{display:flex;gap:20px;margin:10px 0}.box{border:1px solid #ccc;border-radius:8px;padding:8px 10px;flex:1}.lbl{font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#666;font-weight:700}'
      +'.sec{margin-top:16px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#666;font-weight:700;border-bottom:1px solid #ddd;padding-bottom:3px}'
      +'img.ref{max-width:100%;max-height:320px;object-fit:contain;border:1px solid #ccc;border-radius:8px;margin-top:8px}'
      +'table{width:100%;border-collapse:collapse;margin-top:6px}td{padding:3px 4px;border-bottom:1px solid #eee}';
    var html='<html><head><meta charset="utf-8"><title>'+esc(f.num||'OS')+'</title><style>'+css+'</style></head><body>';
    html+='<div><span class="badge">'+esc(f.empresa||'SulSign')+'</span><span class="badge" style="background:#7C3AED">'+esc(f.frente||'')+'</span></div>';
    html+='<h1>'+esc(f.serial_os||f.num||'OS')+'</h1>';
    html+='<div class="mut">'+(f.num?esc(f.num)+' · ':'')+esc(f.job||f.orcamento_numero||'')+(f.cliente?' — '+esc(f.cliente):'')+(f.projeto?(' · '+esc(f.projeto)):'')+'</div>';
    if(f.evento) html+='<div class="mut">Evento: '+esc(f.evento)+'</div>';
    html+='<div class="row">';
    html+='<div class="box"><div class="lbl">Responsável</div>'+esc(f.responsavel||'Fernando')+'</div>';
    html+='<div class="box"><div class="lbl">Entrega</div>'+dstr(f.data_entrega)+'</div>';
    html+='<div class="box"><div class="lbl">Montagem</div>'+dstr(f.data_montagem)+'</div>';
    html+='<div class="box"><div class="lbl">Status</div>'+esc(f.status||'')+'</div>';
    html+='</div>';
    if(f.escopo){ html+='<div class="sec">Escopo</div><div>'+esc(f.escopo)+'</div>'; }
    if(f.instrucoes){ html+='<div class="sec">Instruções</div><div>'+esc(f.instrucoes)+'</div>'; }
    if(ref){ html+='<div class="sec">Referência</div><img class="ref" src="'+esc(dataUrl(ref))+'">'; }
    if(listaArq.length){ html+='<div class="sec">Arquivos</div><table>'; listaArq.forEach(function(a){ html+='<tr><td>'+esc(TLBL[a.tipo]||a.tipo)+'</td><td>'+esc(a.nome||'')+'</td><td>'+kb(a.tamanho)+'</td></tr>'; }); html+='</table>'; }
    html+='<div class="sec">Custo real do job</div><div>Lançado: <b>'+fmt(custoTotal)+'</b>'+(venda!=null?(' · Venda: '+fmt(venda)):'')+'</div>';
    html+='<div class="mut" style="margin-top:24px;font-size:10px">Sul Sign Group · gerado em '+dstr(hojeISO())+'</div>';
    html+='<scr'+'ipt>window.onload=function(){setTimeout(function(){window.print();},250);}</scr'+'ipt>';
    html+='</body></html>';
    w.document.open(); w.document.write(html); w.document.close();
  }

  SS20.modules.prod={render:render};
})();
