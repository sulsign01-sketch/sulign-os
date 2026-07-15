/* ═══ SULSIGN OS 2.0 — MÓDULO: APORTES (aporte) ═══ */
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
    if(SS20.cache.aporte) return Promise.resolve(SS20.cache.aporte);
    return SS20.sb('lancamentos?select=data,valor,descricao,subcategoria,pessoa,conciliado,orcamento_numero&categoria=eq.Aporte&deletado_em=is.null&order=data.desc')
      .then(function(r){
        var d=r.filter(function(l){return !isTreino(l.orcamento_numero);});
        SS20.cache.aporte=d; return d;
      });
  }
  function render(c){
    fetchAll().then(function(d){ draw(c,d); })
    .catch(function(e){ c.innerHTML='<div class="err-view">Erro ao carregar dados: '+esc(e.message)+'</div>'; });
  }
  function draw(c,d){
    var tot=d.reduce(function(a,b){return a+(parseFloat(b.valor)||0);},0);
    var porSocio={};
    d.forEach(function(l){
      var s=l.subcategoria||l.pessoa||'(não identificado)';
      porSocio[s]=(porSocio[s]||0)+(parseFloat(l.valor)||0);
    });
    var socios=Object.keys(porSocio).map(function(k){return {s:k,v:porSocio[k]};}).sort(function(a,b){return b.v-a.v;});

    var h='<div style="padding:24px 26px">';
    h+='<h2 style="font-family:var(--font-d);font-size:19px;margin-bottom:4px">Aportes de Sócios</h2>';
    h+='<p style="color:var(--mut);font-size:12.5px;margin-bottom:20px">Entradas com categoria Aporte · subcategoria identifica o sócio</p>';
    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:22px">';
    h+=kpi('Total aportado',fmt(tot),d.length+' aportes','var(--ok)');
    socios.slice(0,3).forEach(function(x){ h+=kpi(esc(x.s),fmt(x.v),'','var(--blue)'); });
    h+='</div>';
    h+=card('Histórico', tbl(d,function(l){
      return '<tr><td>'+dstr(l.data)+'</td>'
        +'<td>'+esc(l.subcategoria||l.pessoa||'—')+'</td>'
        +'<td style="font-size:11px;color:var(--mut)">'+esc(l.descricao||'')+'</td>'
        +'<td>'+(l.conciliado===true?'<span style="color:var(--ok)">✓ conciliado</span>':'<span style="color:var(--mut)">provisionado</span>')+'</td>'
        +'<td style="text-align:right;font-weight:600">'+fmt(parseFloat(l.valor)||0)+'</td></tr>';
    },['Data','Sócio','Descrição','Situação','Valor']));
    h+='</div>';
    c.innerHTML=h;
  }
  SS20.modules.aporte={render:render};
})();
