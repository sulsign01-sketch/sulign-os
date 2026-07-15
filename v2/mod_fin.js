/* ═══════════════════════════════════════════════════════════════
   SULSIGN OS 2.0 — MÓDULO: FINANCEIRO (fin)
   Contas a pagar/receber, despesas fixas, previsão de caixa 30d,
   faturamento (NFs emitidas). Lógica portada do Painel_Financeiro v1.
   Para operações de escrita usar por enquanto o Lançamentos v1.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  var fmt=SulSignCore.fmt;

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function isTreino(x){ return (x||'').indexOf('TREINO')>=0; }
  function dstr(d){
    if(!d)return '—';
    var p=d.split('-');
    return p.length===3?(p[2]+'/'+p[1]+'/'+p[0]):d;
  }

  function fetchAll(){
    if(SS20.cache.fin) return Promise.resolve(SS20.cache.fin);
    return Promise.all([
      SS20.sb('contas_pagar?select=*&order=vencimento.asc&deletado_em=is.null'),
      SS20.sb('contas_receber?select=*&order=vencimento.asc&deletado_em=is.null'),
      SS20.sb('despesas_fixas?select=*&order=data.desc&deletado_em=is.null'),
      SS20.sb('orcamentos?select=numero,cliente,projeto,bdi,grupos,status,valor_nf,data_nf,nf_numero,sinal_recebido,saldo_recebido&order=numero.desc')
    ]).then(function(r){
      var data={
        pagar:r[0].filter(function(x){return !isTreino(x.job);}),
        receber:r[1].filter(function(x){return !isTreino(x.job);}),
        fixas:r[2],
        orcs:r[3].filter(function(x){return !isTreino(x.numero);})
      };
      SS20.cache.fin=data;
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
    var em30=new Date(hoje); em30.setDate(em30.getDate()+30);

    /* previsão de caixa 30d — mesma regra do Painel v1 */
    var entradas=[];
    d.orcs.forEach(function(o){
      if(['Aprovado','Em Produção'].indexOf(o.status||'')<0)return;
      var v = (o.valor_nf&&parseFloat(o.valor_nf)>0)?parseFloat(o.valor_nf):SulSignCore.calcOrcamento(o).venda;
      entradas.push({lbl:o.numero+' — '+(o.cliente||''),v:v});
    });
    var totEnt=entradas.reduce(function(a,b){return a+b.v;},0);

    var saidasFixas=d.fixas.filter(function(f){
      if(f.tipo==='Receita')return false;
      if(f.status!=='Pendente')return false;
      if(!f.data)return true;
      var dt=new Date(f.data+'T00:00:00');
      return dt>=hoje&&dt<=em30;
    });
    var totFix=saidasFixas.reduce(function(a,b){return a+(parseFloat(b.valor)||0);},0);

    var pagarPend=d.pagar.filter(function(x){return (x.status||'Pendente')==='Pendente';});
    var totPagar=pagarPend.reduce(function(a,b){return a+(parseFloat(b.valor)||0);},0);
    var receberPend=d.receber.filter(function(x){return (x.status||'Pendente')==='Pendente';});
    var totReceber=receberPend.reduce(function(a,b){return a+(parseFloat(b.valor)||0);},0);

    var saldoPrev=totEnt+totReceber-totFix-totPagar;

    /* NFs emitidas */
    var nfs=d.orcs.filter(function(o){return o.data_nf;});
    var totNF=nfs.reduce(function(a,b){return a+(parseFloat(b.valor_nf)||0);},0);

    var h='<div style="padding:24px 26px">';
    h+='<h2 style="font-family:var(--font-d);font-size:19px;margin-bottom:4px">Financeiro</h2>';
    h+='<p style="color:var(--mut);font-size:12.5px;margin-bottom:20px">Leitura em tempo real · para lançar/editar use '
      +'<a href="../Lancamentos.html" target="_blank" style="color:var(--accent);font-weight:600">Lançamentos v1</a> · '
      +'análise completa no <a href="../Painel_Financeiro.html" target="_blank" style="color:var(--accent);font-weight:600">Painel v1</a></p>';

    /* KPIs */
    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:22px">';
    h+=kpi('Entradas previstas',fmt(totEnt),entradas.length+' jobs aprovados/produção','var(--ok)');
    h+=kpi('A receber',fmt(totReceber),receberPend.length+' títulos pendentes','var(--blue)');
    h+=kpi('A pagar + fixas 30d',fmt(totPagar+totFix),pagarPend.length+' contas · '+saidasFixas.length+' fixas','var(--warn)');
    h+=kpi('Saldo projetado 30d',fmt(saldoPrev),'entradas + receber − saídas',saldoPrev>=0?'var(--ok)':'var(--danger)');
    h+='</div>';

    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px">';

    /* contas a pagar */
    h+=card('Contas a pagar (pendentes)', tbl(pagarPend.slice(0,12),function(x){
      var venc=x.vencimento?new Date(x.vencimento+'T00:00:00'):null;
      var late=venc&&venc<hoje;
      return '<tr><td style="'+(late?'color:var(--danger);font-weight:600':'')+'">'+dstr(x.vencimento)+'</td>'
        +'<td>'+esc(x.fornecedor||x.descricao||'—')+'</td>'
        +'<td style="font-size:10.5px;color:var(--mut)">'+esc(x.job||'')+'</td>'
        +'<td style="text-align:right;font-weight:600">'+fmt(parseFloat(x.valor)||0)+'</td></tr>';
    },['Venc.','Fornecedor','Job','Valor']), pagarPend.length>12?('+ '+(pagarPend.length-12)+' na lista completa'):'');

    /* contas a receber */
    h+=card('Contas a receber (pendentes)', tbl(receberPend.slice(0,12),function(x){
      return '<tr><td>'+dstr(x.vencimento)+'</td>'
        +'<td>'+esc(x.cliente||x.descricao||'—')+'</td>'
        +'<td style="font-size:10.5px;color:var(--mut)">'+esc(x.job||'')+'</td>'
        +'<td style="text-align:right;font-weight:600;color:var(--ok)">'+fmt(parseFloat(x.valor)||0)+'</td></tr>';
    },['Venc.','Cliente','Job','Valor']), receberPend.length>12?('+ '+(receberPend.length-12)+' na lista completa'):'');

    /* fixas pendentes 30d */
    h+=card('Despesas fixas pendentes (30d)', tbl(saidasFixas.slice(0,12),function(x){
      return '<tr><td>'+dstr(x.data)+'</td>'
        +'<td>'+esc(x.descricao||x.nome||'—')+'</td>'
        +'<td style="text-align:right;font-weight:600">'+fmt(parseFloat(x.valor)||0)+'</td></tr>';
    },['Data','Descrição','Valor']), 'Total: '+fmt(totFix));

    /* NFs */
    h+=card('Faturamento (NFs emitidas)', tbl(nfs.slice(-12).reverse(),function(o){
      return '<tr><td>'+dstr(o.data_nf)+'</td>'
        +'<td style="font-size:10.5px">'+esc(o.numero)+'</td>'
        +'<td>'+esc(o.cliente||'—')+'</td>'
        +'<td style="text-align:right;font-weight:600">'+fmt(parseFloat(o.valor_nf)||0)+'</td></tr>';
    },['Data NF','Job','Cliente','Valor']), 'Total faturado: '+fmt(totNF));

    h+='</div></div>';
    c.innerHTML=h;
  }

  function kpi(lbl,val,sub,cor){
    return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px">'
      +'<div style="font-size:10.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut)">'+lbl+'</div>'
      +'<div style="font-family:var(--font-d);font-size:21px;font-weight:800;margin:6px 0 3px;color:'+cor+'">'+val+'</div>'
      +'<div style="font-size:11.5px;color:var(--mut)">'+sub+'</div></div>';
  }

  function card(tit,body,foot){
    return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:18px">'
      +'<div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut);margin-bottom:12px">'+tit+'</div>'
      +body
      +(foot?'<div style="margin-top:10px;font-size:11.5px;color:var(--mut)">'+foot+'</div>':'')
      +'</div>';
  }

  function tbl(rows,rowFn,heads){
    if(!rows.length)return '<div style="color:var(--mut);font-size:12px">Nada pendente. ✓</div>';
    var h='<table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr>';
    heads.forEach(function(x,i){
      h+='<th style="text-align:'+(i===heads.length-1?'right':'left')+';padding:4px 6px;font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:var(--mut);border-bottom:1px solid var(--line)">'+x+'</th>';
    });
    h+='</tr></thead><tbody>';
    rows.forEach(function(r){ h+=rowFn(r); });
    h+='</tbody></table><style>tbody td{padding:6px;border-bottom:1px solid var(--line)}</style>';
    return h;
  }

  SS20.modules.fin={render:render};
})();
