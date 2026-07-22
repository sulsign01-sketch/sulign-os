/* ═══ SULSIGN OS 2.0 — MÓDULO: FLUXO DE CAIXA (fluxo)
   Regra: lancamentos conciliado=true + tabela aportes (exceto status Pendente).
   Saídas de aporte: Retirada de Sócio / Devolução de Empréstimo. ═══ */
(function(){
  var fmt=SulSignCore.fmt;
  var SAIDAS_AP=['Retirada de Sócio','Devolução de Empréstimo'];
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function isTreino(x){ return (x||'').indexOf('TREINO')>=0; }
  function dstr(d){ if(!d)return '—'; var p=String(d).split('T')[0].split('-'); return p.length===3?(p[2]+'/'+p[1]+'/'+p[0]):d; }
  function kpi(lbl,val,sub,cor){
    return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px">'
      +'<div style="font-size:10.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut)">'+lbl+'</div>'
      +'<div style="font-family:var(--font-d);font-size:21px;font-weight:800;margin:6px 0 3px;color:'+cor+'">'+val+'</div>'
      +'<div style="font-size:11.5px;color:var(--mut)">'+sub+'</div></div>';
  }
  function card(tit,body,foot){
    return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:18px">'
      +'<div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut);margin-bottom:12px">'+tit+'</div>'
      +body+(foot?'<div style="margin-top:10px;font-size:11.5px;color:var(--mut)">'+foot+'</div>':'')+'</div>';
  }
  function aviso(txt){
    return '<div style="background:var(--panel);border:1px solid var(--danger);border-left:3px solid var(--danger);border-radius:var(--radius);padding:12px 14px;margin-bottom:16px;font-size:12px;color:var(--danger)">'+txt+'</div>';
  }
  function tbl(rows,rowFn,heads){
    if(!rows.length)return '<div style="color:var(--mut);font-size:12px">Nada por aqui. ✓</div>';
    var h='<table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr>';
    heads.forEach(function(x,i){
      h+='<th style="text-align:'+(i===heads.length-1?'right':'left')+';padding:4px 6px;font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:var(--mut);border-bottom:1px solid var(--line)">'+x+'</th>';
    });
    h+='</tr></thead><tbody>';
    rows.forEach(function(r){ h+=rowFn(r); });
    h+='</tbody></table><style>tbody td{padding:6px;border-bottom:1px solid var(--line)}</style>';
    return h;
  }

  /* ── Normalizadores: aporte e lançamento viram o mesmo formato de movimento ── */
  function apToMov(a){
    var saida=SAIDAS_AP.indexOf(a.tipo)>=0;
    return { data:a.data, valor:parseFloat(a.valor)||0, ent:!saida, origem:'aporte',
             categoria:a.tipo||'Aporte', sub:a.origem||'', desc:a.descricao||'' };
  }
  function lcToMov(l){
    return { data:l.data, valor:parseFloat(l.valor)||0,
             ent:(l.tipo_lancamento||'').toLowerCase()==='entrada', origem:'lanc',
             categoria:l.categoria||'—', sub:l.subcategoria||'', desc:l.descricao||'' };
  }

  function fetchAll(){
    if(SS20.cache.fluxo) return Promise.resolve(SS20.cache.fluxo);
    var pL=SS20.sb('lancamentos?select=data,valor,tipo_lancamento,categoria,subcategoria,descricao,orcamento_numero&conciliado=eq.true&deletado_em=is.null&order=data.asc');
    var pA=SS20.sb('aportes?select=data,valor,tipo,origem,descricao,status&deletado_em=is.null&order=data.asc')
      .catch(function(){ return null; }); /* tabela ausente/bloqueada nao derruba a tela */
    return Promise.all([pL,pA]).then(function(res){
      var lancs=(res[0]||[]).filter(function(l){ return !isTreino(l.orcamento_numero)&&l.data; });
      var apOk=res[1]!==null;
      var aps=(res[1]||[]).filter(function(a){ return a.data; });
      var pend=0, movs=[];
      lancs.forEach(function(l){ movs.push(lcToMov(l)); });
      aps.forEach(function(a){
        if((a.status||'')==='Pendente'){ pend+=parseFloat(a.valor)||0; return; }
        movs.push(apToMov(a));
      });
      /* guarda de duplicidade: mesmo aporte gravado nas duas fontes */
      var dup=lancs.filter(function(l){ return (l.categoria||'').indexOf('Aporte')>=0; }).length;
      var d={ movs:movs, pend:pend, apOk:apOk, nAp:aps.length, dup:dup };
      SS20.cache.fluxo=d; return d;
    });
  }

  function render(c){
    fetchAll().then(function(d){ draw(c,d); })
    .catch(function(e){ c.innerHTML='<div class="err-view">Erro ao carregar dados: '+esc(e.message)+'</div>'; });
    if(!SS20._fluxoBound){
      SS20._fluxoBound=true;
      c.addEventListener('change',function(ev){
        if(ev.target&&ev.target.id==='fx-mes'){
          fetchAll().then(function(d){ draw(c,d,ev.target.value); });
        }
      });
      c.addEventListener('click',function(ev){
        var t=ev.target;
        if(t&&t.getAttribute&&t.getAttribute('data-action')==='fluxo-refresh'){
          SS20.cache.fluxo=null;
          var sel=document.getElementById('fx-mes');
          var m=sel?sel.value:null;
          t.textContent='Atualizando...';
          fetchAll().then(function(d){ draw(c,d,m); })
          .catch(function(e){ c.innerHTML='<div class="err-view">Erro ao carregar dados: '+esc(e.message)+'</div>'; });
        }
      });
    }
  }

  function draw(c,d,mesSel){
    var movs=d.movs;
    var meses={};
    movs.forEach(function(x){
      var m=x.data.slice(0,7);
      if(!meses[m])meses[m]={m:m,ent:0,sai:0};
      if(x.ent)meses[m].ent+=x.valor; else meses[m].sai+=x.valor;
    });
    var arr=Object.keys(meses).sort().map(function(k){return meses[k];});
    var acum=0;
    arr.forEach(function(x){ acum+=x.ent-x.sai; x.acum=acum; });

    var mesAtual=mesSel||new Date().toISOString().slice(0,7);
    var doMes=movs.filter(function(x){return x.data.slice(0,7)===mesAtual;});
    var entM=0,saiM=0;
    doMes.forEach(function(x){ if(x.ent)entM+=x.valor; else saiM+=x.valor; });

    var opts='';
    arr.slice().reverse().forEach(function(x){
      opts+='<option value="'+x.m+'"'+(x.m===mesAtual?' selected':'')+'>'+x.m+'</option>';
    });

    var h='<div style="padding:24px 26px">';
    h+='<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:4px">';
    h+='<h2 style="font-family:var(--font-d);font-size:19px">Fluxo de Caixa</h2>';
    h+='<button data-action="fluxo-refresh" style="font-size:11px;padding:5px 12px;background:var(--panel);color:inherit;border:1px solid var(--line);border-radius:6px;cursor:pointer">&#8635; Atualizar</button>';
    h+='</div>';
    h+='<p style="color:var(--mut);font-size:12.5px;margin-bottom:20px">Lançamentos conciliados (banco confirmado) + aportes, retiradas e empréstimos</p>';

    if(!d.apOk){
      h+=aviso('Não consegui ler a tabela <b>aportes</b> (inexistente ou bloqueada por RLS). Os números abaixo estão <b>sem aportes, retiradas e empréstimos</b> — vão divergir do v1.');
    }
    if(d.dup){
      h+=aviso('Atenção: '+d.dup+' lançamento(s) conciliado(s) com categoria "Aporte" na tabela <b>lancamentos</b>, além de '+d.nAp+' registro(s) na tabela <b>aportes</b>. Se for o mesmo dinheiro, está sendo <b>contado em dobro</b> — aqui e também no v1.');
    }

    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:22px">';
    h+=kpi('Entradas · '+mesAtual,fmt(entM),'','var(--ok)');
    h+=kpi('Saídas · '+mesAtual,fmt(saiM),'','var(--danger)');
    h+=kpi('Resultado do mês',fmt(entM-saiM),'',entM-saiM>=0?'var(--ok)':'var(--danger)');
    h+=kpi('Saldo acumulado',fmt(acum),'desde o início do registro',acum>=0?'var(--ok)':'var(--danger)');
    h+='</div>';

    if(d.pend>0){
      h+='<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px;margin-bottom:16px;font-size:12px;color:var(--mut)">'
        +'<b>'+fmt(d.pend)+'</b> em aportes com status <b>Pendente</b> — fora do saldo acima por não estarem confirmados no banco. '
        +'<span style="opacity:.75">O v1 soma esse valor no fluxo; é essa a diferença esperada entre as duas telas.</span></div>';
    }

    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px">';
    h+=card('Por mês', tbl(arr.slice().reverse(),function(x){
      var res=x.ent-x.sai;
      return '<tr><td style="font-weight:600">'+x.m+'</td>'
        +'<td style="color:var(--ok)">'+fmt(x.ent)+'</td>'
        +'<td style="color:var(--danger)">'+fmt(x.sai)+'</td>'
        +'<td style="font-weight:600;color:'+(res>=0?'var(--ok)':'var(--danger)')+'">'+fmt(res)+'</td>'
        +'<td style="text-align:right;color:'+(x.acum>=0?'var(--ok)':'var(--danger)')+'">'+fmt(x.acum)+'</td></tr>';
    },['Mês','Entradas','Saídas','Resultado','Acumulado']));

    var ordenado=doMes.slice().sort(function(a,b){ return a.data<b.data?1:(a.data>b.data?-1:0); });
    var extrato=tbl(ordenado,function(x){
      var tag=x.origem==='aporte'
        ? '<span style="font-size:9.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--mut);border:1px solid var(--line);border-radius:3px;padding:1px 4px;margin-right:5px">apt</span>'
        : '';
      return '<tr><td>'+dstr(x.data)+'</td>'
        +'<td style="font-size:11px">'+tag+esc(x.categoria)+(x.sub?' <span style="color:var(--mut)">&rsaquo; '+esc(x.sub)+'</span>':'')+'</td>'
        +'<td style="font-size:11px;color:var(--mut)">'+esc((x.desc||'').slice(0,50))+'</td>'
        +'<td style="text-align:right;font-weight:600;color:'+(x.ent?'var(--ok)':'var(--danger)')+'">'+(x.ent?'+':'&minus;')+fmt(x.valor)+'</td></tr>';
    },['Data','Categoria','Descrição','Valor']);
    h+=card('Extrato <select id="fx-mes" style="margin-left:8px;font-size:11px;padding:2px 6px;background:var(--panel);color:inherit;border:1px solid var(--line);border-radius:4px">'+opts+'</select>', extrato,
      'Linhas marcadas <b>apt</b> vêm da tabela aportes; as demais, de lançamentos conciliados.');
    h+='</div></div>';
    c.innerHTML=h;
  }
  SS20.modules.fluxo={render:render};
})();
