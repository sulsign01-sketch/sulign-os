/* ═══ SULSIGN OS 2.0 — MÓDULO: FLUXO DE CAIXA (fluxo)
   Regra: só conciliado=true (banco confirmado). ═══ */
(function(){
  var fmt=SulSignCore.fmt;
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
  function fetchAll(){
    if(SS20.cache.fluxo) return Promise.resolve(SS20.cache.fluxo);
    return SS20.sb('lancamentos?select=data,valor,tipo_lancamento,categoria,subcategoria,descricao,orcamento_numero&conciliado=eq.true&deletado_em=is.null&order=data.asc')
      .then(function(r){
        var d=r.filter(function(l){return !isTreino(l.orcamento_numero)&&l.data;});
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
    }
  }
  function draw(c,d,mesSel){
    var meses={};
    d.forEach(function(l){
      var m=l.data.slice(0,7);
      if(!meses[m])meses[m]={m:m,ent:0,sai:0};
      var v=parseFloat(l.valor)||0;
      if((l.tipo_lancamento||'').toLowerCase()==='entrada')meses[m].ent+=v; else meses[m].sai+=v;
    });
    var arr=Object.keys(meses).sort().map(function(k){return meses[k];});
    var acum=0;
    arr.forEach(function(x){ acum+=x.ent-x.sai; x.acum=acum; });

    var mesAtual=mesSel||new Date().toISOString().slice(0,7);
    var doMes=d.filter(function(l){return l.data.slice(0,7)===mesAtual;});
    var entM=0,saiM=0;
    doMes.forEach(function(l){
      var v=parseFloat(l.valor)||0;
      if((l.tipo_lancamento||'').toLowerCase()==='entrada')entM+=v; else saiM+=v;
    });

    var opts='';
    arr.slice().reverse().forEach(function(x){
      opts+='<option value="'+x.m+'"'+(x.m===mesAtual?' selected':'')+'>'+x.m+'</option>';
    });

    var h='<div style="padding:24px 26px">';
    h+='<h2 style="font-family:var(--font-d);font-size:19px;margin-bottom:4px">Fluxo de Caixa</h2>';
    h+='<p style="color:var(--mut);font-size:12.5px;margin-bottom:20px">Somente lançamentos conciliados (banco confirmado)</p>';
    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:22px">';
    h+=kpi('Entradas · '+mesAtual,fmt(entM),'','var(--ok)');
    h+=kpi('Saídas · '+mesAtual,fmt(saiM),'','var(--danger)');
    h+=kpi('Resultado do mês',fmt(entM-saiM),'',entM-saiM>=0?'var(--ok)':'var(--danger)');
    h+=kpi('Saldo acumulado',fmt(acum),'desde o início do registro',acum>=0?'var(--ok)':'var(--danger)');
    h+='</div>';

    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px">';
    h+=card('Por mês', tbl(arr.slice().reverse(),function(x){
      var res=x.ent-x.sai;
      return '<tr><td style="font-weight:600">'+x.m+'</td>'
        +'<td style="color:var(--ok)">'+fmt(x.ent)+'</td>'
        +'<td style="color:var(--danger)">'+fmt(x.sai)+'</td>'
        +'<td style="font-weight:600;color:'+(res>=0?'var(--ok)':'var(--danger)')+'">'+fmt(res)+'</td>'
        +'<td style="text-align:right;color:'+(x.acum>=0?'var(--ok)':'var(--danger)')+'">'+fmt(x.acum)+'</td></tr>';
    },['Mês','Entradas','Saídas','Resultado','Acumulado']));

    var extrato=tbl(doMes.slice().reverse(),function(l){
      var ent=(l.tipo_lancamento||'').toLowerCase()==='entrada';
      return '<tr><td>'+dstr(l.data)+'</td>'
        +'<td style="font-size:11px">'+esc(l.categoria||'—')+(l.subcategoria?' <span style="color:var(--mut)">› '+esc(l.subcategoria)+'</span>':'')+'</td>'
        +'<td style="font-size:11px;color:var(--mut)">'+esc((l.descricao||'').slice(0,50))+'</td>'
        +'<td style="text-align:right;font-weight:600;color:'+(ent?'var(--ok)':'var(--danger)')+'">'+(ent?'+':'−')+fmt(parseFloat(l.valor)||0)+'</td></tr>';
    },['Data','Categoria','Descrição','Valor']);
    h+=card('Extrato <select id="fx-mes" style="margin-left:8px;font-size:11px;padding:2px 6px;background:var(--panel);color:inherit;border:1px solid var(--line);border-radius:4px">'+opts+'</select>', extrato);
    h+='</div></div>';
    c.innerHTML=h;
  }
  SS20.modules.fluxo={render:render};
})();
