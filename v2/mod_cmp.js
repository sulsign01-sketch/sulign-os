/* ═══════════════════════════════════════════════════════════════
   SULSIGN OS 2.0 — MÓDULO: COMPRAS (cmp)
   Visão consolidada do que precisa ser pago/comprado:
   contas de produção, solicitações de caixa pendentes e
   contas a pagar por fornecedor. Criação/edição no Lançamentos v1.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  var fmt=SulSignCore.fmt;

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function isTreino(x){ return (x||'').indexOf('TREINO')>=0; }
  function dstr(d){
    if(!d)return '—';
    var p=(String(d).split('T')[0]||'').split('-');
    return p.length===3?(p[2]+'/'+p[1]+'/'+p[0]):d;
  }
  function val(x){ return parseFloat(x)||0; }

  function fetchAll(){
    if(SS20.cache.cmp) return Promise.resolve(SS20.cache.cmp);
    return Promise.all([
      SS20.sb('contas_producao?select=*&order=criado_em.desc'),
      SS20.sb('caixa_solicitacoes?status=eq.pendente&select=*'),
      SS20.sb('contas_pagar?select=*&status=eq.Pendente&order=vencimento.asc&deletado_em=is.null')
    ]).then(function(r){
      var data={
        producao:r[0].filter(function(x){return !isTreino(x.job);}),
        solicitacoes:r[1].filter(function(x){return !isTreino(x.job);}),
        pagar:r[2].filter(function(x){return !isTreino(x.job);})
      };
      SS20.cache.cmp=data;
      return data;
    });
  }

  function render(c){
    fetchAll().then(function(d){ draw(c,d); })
    .catch(function(e){
      c.innerHTML='<div class="err-view">Erro ao carregar compras: '+esc(e.message)+'</div>';
    });
  }

  function draw(c,d){
    var prodPend=d.producao.filter(function(x){return (x.status||'').toLowerCase()!=='pago' && !x.deletado_em;});
    var totProd=prodPend.reduce(function(a,b){return a+val(b.valor);},0);
    var totSol=d.solicitacoes.reduce(function(a,b){return a+val(b.valor);},0);
    var totPagar=d.pagar.reduce(function(a,b){return a+val(b.valor);},0);

    /* a pagar agrupado por fornecedor */
    var porForn={};
    d.pagar.forEach(function(x){
      var f=x.fornecedor||x.descricao||'(sem fornecedor)';
      if(!porForn[f])porForn[f]={n:0,v:0};
      porForn[f].n++; porForn[f].v+=val(x.valor);
    });
    var fornecedores=Object.keys(porForn).map(function(k){return {f:k,n:porForn[k].n,v:porForn[k].v};})
      .sort(function(a,b){return b.v-a.v;}).slice(0,10);

    var h='<div style="padding:24px 26px">';
    h+='<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:4px">';
    h+='<h2 style="font-family:var(--font-d);font-size:19px">Compras & Pagamentos</h2>';
    h+='<span style="flex:1"></span>';
    h+='<a href="../Lancamentos.html" target="_blank" style="background:var(--accent);color:#fff;text-decoration:none;font-size:12.5px;font-weight:600;padding:8px 14px;border-radius:8px">✎ Lançar / gerar pedido (PED)</a>';
    h+='</div>';
    h+='<p style="color:var(--mut);font-size:12.5px;margin-bottom:18px">Consolidação de pendências de compra e pagamento · ordens de pagamento (PED-AAAAMMDD-HHMM) geradas no Lançamentos</p>';

    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:20px">';
    h+=kpi('Contas de produção',fmt(totProd),prodPend.length+' pendentes','var(--warn)');
    h+=kpi('Solicitações de caixa',fmt(totSol),d.solicitacoes.length+' pendentes','var(--blue)');
    h+=kpi('Contas a pagar',fmt(totPagar),d.pagar.length+' títulos','var(--danger)');
    h+=kpi('Total comprometido',fmt(totProd+totSol+totPagar),'','var(--ink)');
    h+='</div>';

    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px">';

    h+=card('Solicitações de caixa pendentes', lista(d.solicitacoes,function(x){
      return linha(dstr(x.data||x.criado_em),esc(x.descricao||x.motivo||x.solicitante||'—'),esc(x.job||''),fmt(val(x.valor)),'var(--blue)');
    }));

    h+=card('Contas de produção pendentes', lista(prodPend.slice(0,15),function(x){
      return linha(dstr(x.vencimento||x.data||x.criado_em),esc(x.fornecedor||x.descricao||'—'),esc(x.job||''),fmt(val(x.valor)),'var(--warn)');
    },prodPend.length>15?('+ '+(prodPend.length-15)+' no Lançamentos'):''));

    h+=card('A pagar por fornecedor (top 10)', fornecedores.length?fornecedores.map(function(r){
      return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--line);font-size:12.5px">'
        +'<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(r.f)+'</span>'
        +'<span style="font-size:10.5px;color:var(--mut)">'+r.n+' tít.</span>'
        +'<span style="font-weight:700">'+fmt(r.v)+'</span></div>';
    }).join(''):'<div style="color:var(--mut);font-size:12px">Nada pendente. ✓</div>');

    h+='</div></div>';
    c.innerHTML=h;
  }

  function kpi(lbl,valTxt,sub,cor){
    return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px">'
      +'<div style="font-size:10.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut)">'+lbl+'</div>'
      +'<div style="font-family:var(--font-d);font-size:21px;font-weight:800;margin:6px 0 3px;color:'+cor+'">'+valTxt+'</div>'
      +'<div style="font-size:11.5px;color:var(--mut)">'+(sub||'&nbsp;')+'</div></div>';
  }

  function card(tit,body,foot){
    return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:18px">'
      +'<div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut);margin-bottom:12px">'+tit+'</div>'
      +body+(foot?'<div style="margin-top:10px;font-size:11.5px;color:var(--mut)">'+foot+'</div>':'')+'</div>';
  }

  function lista(rows,fn,foot){
    if(!rows.length)return '<div style="color:var(--mut);font-size:12px">Nada pendente. ✓</div>'+(foot||'');
    return rows.map(fn).join('')+(foot?'<div style="margin-top:10px;font-size:11.5px;color:var(--mut)">'+foot+'</div>':'');
  }

  function linha(data,desc,job,valorTxt,cor){
    return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--line);font-size:12.5px;flex-wrap:wrap">'
      +'<span style="min-width:72px;color:var(--mut);font-size:11.5px">'+data+'</span>'
      +'<span style="flex:1;min-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+desc+'</span>'
      +(job?'<span style="font-size:10px;color:var(--mut)">'+job+'</span>':'')
      +'<span style="font-weight:700;color:'+cor+'">'+valorTxt+'</span></div>';
  }

  SS20.modules.cmp={render:render};
})();
