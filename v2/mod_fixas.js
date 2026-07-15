/* ═══ SULSIGN OS 2.0 — MÓDULO: DESPESAS FIXAS (fixas) ═══ */
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
    if(SS20.cache.fixas) return Promise.resolve(SS20.cache.fixas);
    return SS20.sb('despesas_fixas?select=*&order=vencimento.asc.nullslast,data.desc&deletado_em=is.null')
      .then(function(r){ SS20.cache.fixas=r; return r; });
  }
  function render(c){
    fetchAll().then(function(d){ draw(c,d); })
    .catch(function(e){ c.innerHTML='<div class="err-view">Erro ao carregar dados: '+esc(e.message)+'</div>'; });
  }
  function draw(c,d){
    var hoje=new Date(); hoje.setHours(0,0,0,0);
    var mesAtual=hoje.toISOString().slice(0,7);
    var pend=d.filter(function(f){return f.status==='Pendente';});
    var totPend=pend.reduce(function(a,b){return a+(parseFloat(b.valor)||0);},0);
    var doMes=d.filter(function(f){return (f.mes_ref||'').indexOf(mesAtual)===0||(f.vencimento||'').indexOf(mesAtual)===0;});
    var totMes=doMes.reduce(function(a,b){return a+(parseFloat(b.valor)||0);},0);
    var atras=pend.filter(function(f){return f.vencimento&&new Date(f.vencimento+'T00:00:00')<hoje;});
    var totAtras=atras.reduce(function(a,b){return a+(parseFloat(b.valor)||0);},0);

    var h='<div style="padding:24px 26px">';
    h+='<h2 style="font-family:var(--font-d);font-size:19px;margin-bottom:4px">Despesas Fixas</h2>';
    h+='<p style="color:var(--mut);font-size:12.5px;margin-bottom:20px">Leitura · para lançar use <a href="../Lancamentos.html" target="_blank" style="color:var(--accent);font-weight:600">Lançamentos v1 → aba Fixas</a></p>';
    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:22px">';
    h+=kpi('Pendentes',fmt(totPend),pend.length+' contas','var(--warn)');
    h+=kpi('Atrasadas',fmt(totAtras),atras.length+' contas',totAtras>0?'var(--danger)':'var(--ok)');
    h+=kpi('Mês atual',fmt(totMes),doMes.length+' lançamentos','var(--blue)');
    h+='</div>';
    h+=card('Todas as fixas', tbl(d.slice(0,60),function(f){
      var late=f.status==='Pendente'&&f.vencimento&&new Date(f.vencimento+'T00:00:00')<hoje;
      return '<tr><td style="'+(late?'color:var(--danger);font-weight:600':'')+'">'+dstr(f.vencimento||f.data)+'</td>'
        +'<td>'+esc(f.categoria||'—')+(f.subcategoria?' <span style="color:var(--mut)">› '+esc(f.subcategoria)+'</span>':'')+'</td>'
        +'<td style="font-size:11px;color:var(--mut)">'+esc(f.descricao||'')+'</td>'
        +'<td>'+esc(f.status||'—')+'</td>'
        +'<td style="text-align:right;font-weight:600">'+fmt(parseFloat(f.valor)||0)+'</td></tr>';
    },['Venc.','Categoria','Descrição','Status','Valor']), d.length>60?'Mostrando 60 de '+d.length:'');
    h+='</div>';
    c.innerHTML=h;
  }
  SS20.modules.fixas={render:render};
})();
