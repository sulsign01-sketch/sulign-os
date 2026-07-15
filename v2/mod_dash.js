/* ═══════════════════════════════════════════════════════════════
   SULSIGN OS 2.0 — MÓDULO: VISÃO GERAL (dash)
   KPIs reais: pipeline de propostas, contas a pagar/receber,
   fluxo do mês (conciliado), top clientes.
   Regra: job de treino SS-TREINO-2026_06-99 excluído de tudo.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  var TREINO='SS-TREINO-2026_06-99';
  var fmt=SulSignCore.fmt;

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function isTreino(numOrJob){
    return (numOrJob||'').indexOf('TREINO')>=0;
  }

  function fetchAll(){
    if(SS20.cache.dash) return Promise.resolve(SS20.cache.dash);
    return Promise.all([
      SS20.sb('orcamentos?select=numero,cliente,agencia,projeto,bdi,grupos,status,valor_nf,updated_at&order=numero.desc'),
      SS20.sb('contas_pagar?select=*&status=eq.Pendente&order=vencimento.asc&deletado_em=is.null'),
      SS20.sb('contas_receber?select=*&order=vencimento.asc&deletado_em=is.null'),
      SS20.sb('lancamentos?select=valor,tipo_lancamento,categoria,orcamento_numero,data,conciliado&deletado_em=is.null')
    ]).then(function(r){
      var data={ orcs:r[0].filter(function(o){return !isTreino(o.numero);}),
                 pagar:r[1].filter(function(c){return !isTreino(c.orcamento_numero);}),
                 receber:r[2].filter(function(c){return !isTreino(c.orcamento_numero);}),
                 lanc:r[3].filter(function(l){return !isTreino(l.orcamento_numero);}) };
      SS20.cache.dash=data;
      return data;
    });
  }

  function render(c){
    fetchAll().then(function(d){ draw(c,d); })
    .catch(function(e){
      c.innerHTML='<div class="err-view">Erro ao carregar dados: '+esc(e.message)+'</div>';
    });
  }

  function draw(c,d){
    var hoje=new Date(); hoje.setHours(0,0,0,0);
    var mesIni=new Date(hoje.getFullYear(),hoje.getMonth(),1);
    var em30=new Date(hoje); em30.setDate(em30.getDate()+30);

    /* ── pipeline ── */
    var funil={cot:0,env:0,apr:0,fec:0,rec:0};
    var vivos=[];
    d.orcs.forEach(function(o){
      var s=o.status||'Em Orçamento';
      if(s==='Cotação'||s==='Em Orçamento')funil.cot++;
      else if(s==='Proposta Enviada')funil.env++;
      else if(s==='Aprovado'||s==='Em Produção'){funil.apr++;vivos.push(o);}
      else if(s==='Entregue'||s==='Faturado'||s==='Pago')funil.fec++;
      else funil.rec++;
    });
    var total=d.orcs.length;
    var txConv=total?Math.round((funil.apr+funil.fec)/total*100):0;

    /* ── valores em produção (aprovado/em produção) ── */
    var vlrProducao=0;
    vivos.forEach(function(o){ vlrProducao+=SulSignCore.calcOrcamento(o).venda; });

    /* ── contas ── */
    var pagar30=0,pagarVencidas=0;
    d.pagar.forEach(function(cp){
      var v=parseFloat(cp.valor)||0;
      var dt=cp.vencimento?new Date(cp.vencimento+'T00:00:00'):null;
      if(dt&&dt<hoje)pagarVencidas+=v;
      else if(!dt||dt<=em30)pagar30+=v;
    });
    var receberPend=0;
    d.receber.forEach(function(cr){
      if((cr.status||'Pendente')==='Pendente') receberPend+=parseFloat(cr.valor)||0;
    });

    /* ── fluxo do mês (somente conciliado=true) ── */
    var entMes=0,saiMes=0;
    d.lanc.forEach(function(l){
      if(l.conciliado!==true)return;
      if(!l.data)return;
      var dt=new Date(l.data+'T00:00:00');
      if(dt<mesIni||dt>hoje)return;
      var v=parseFloat(l.valor)||0;
      if((l.tipo_lancamento||'')==='Receita'||(l.categoria||'')==='Receita de Job')entMes+=v;
      else saiMes+=v;
    });

    /* ── top clientes ── */
    var rank={};
    d.orcs.forEach(function(o){
      var k=o.agencia||o.cliente||'—';
      var v=SulSignCore.calcOrcamento(o).venda;
      if(!rank[k])rank[k]={n:k,t:0,c:0};
      rank[k].t+=v; rank[k].c++;
    });
    var top=Object.keys(rank).map(function(k){return rank[k];})
      .sort(function(a,b){return b.t-a.t;}).slice(0,6);

    /* ── render ── */
    var h='<div style="padding:24px 26px">';
    h+='<h2 style="font-family:var(--font-d);font-size:19px;margin-bottom:4px">Visão geral</h2>';
    h+='<p style="color:var(--mut);font-size:12.5px;margin-bottom:20px">Dados reais · Supabase · treino excluído · fluxo = somente conciliado</p>';

    /* cards KPI */
    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:22px">';
    h+=kpi('Em produção (venda)',fmt(vlrProducao),funil.apr+' jobs aprovados/produção','var(--ok)');
    h+=kpi('A pagar 30 dias',fmt(pagar30),pagarVencidas>0?('⚠ '+fmt(pagarVencidas)+' vencidas'):'sem vencidas','var(--warn)');
    h+=kpi('A receber pendente',fmt(receberPend),d.receber.length+' títulos','var(--blue)');
    h+=kpi('Fluxo do mês',fmt(entMes-saiMes),'↑ '+fmt(entMes)+' · ↓ '+fmt(saiMes),(entMes-saiMes)>=0?'var(--ok)':'var(--danger)');
    h+='</div>';

    /* funil + top clientes */
    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px">';

    h+='<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:18px">';
    h+='<div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut);margin-bottom:12px">Funil de propostas · '+total+' no total · conversão '+txConv+'%</div>';
    h+=barRow('Cotações/Rascunhos',funil.cot,total,'#2563EB');
    h+=barRow('Propostas Enviadas',funil.env,total,'#D97706');
    h+=barRow('Aprovadas/Produção',funil.apr,total,'#1E9E5A');
    h+=barRow('Entregues/Faturadas/Pagas',funil.fec,total,'#0E7A43');
    h+=barRow('Recusadas/Vencidas',funil.rec,total,'#D23B2F');
    h+='</div>';

    h+='<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:18px">';
    h+='<div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut);margin-bottom:12px">Top clientes / agências</div>';
    if(!top.length)h+='<div style="color:var(--mut);font-size:12px">Sem dados.</div>';
    top.forEach(function(r,i){
      h+='<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--line);font-size:13px">'
        +'<span style="width:18px;color:var(--mut);font-weight:700">'+(i+1)+'</span>'
        +'<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(r.n)+'</span>'
        +'<span style="font-size:10.5px;color:var(--mut)">'+r.c+'j</span>'
        +'<span style="font-weight:600">'+fmt(r.t)+'</span></div>';
    });
    h+='</div>';

    h+='</div>';

    /* atalho para financeiro */
    h+='<div style="margin-top:20px;font-size:12.5px;color:var(--mut)">Detalhes de contas, fixas e previsão de caixa: '
      +'<a href="#" data-action="go-view" data-view="fin" style="color:var(--accent);font-weight:600">abrir Financeiro →</a></div>';

    h+='</div>';
    c.innerHTML=h;
  }

  function kpi(lbl,val,sub,cor){
    return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px">'
      +'<div style="font-size:10.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut)">'+lbl+'</div>'
      +'<div style="font-family:var(--font-d);font-size:21px;font-weight:800;margin:6px 0 3px;color:'+cor+'">'+val+'</div>'
      +'<div style="font-size:11.5px;color:var(--mut)">'+sub+'</div></div>';
  }

  function barRow(lbl,n,total,cor){
    var pct=total?Math.round(n/total*100):0;
    return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:12px">'
      +'<span style="width:180px;color:var(--ink2)">'+lbl+'</span>'
      +'<div style="flex:1;height:8px;background:var(--paper);border-radius:6px;overflow:hidden">'
      +'<div style="width:'+pct+'%;height:100%;background:'+cor+'"></div></div>'
      +'<span style="width:28px;text-align:right;font-weight:700">'+n+'</span></div>';
  }

  SS20.modules.dash={render:render};
})();
