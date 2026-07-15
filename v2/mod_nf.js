/* ═══ SULSIGN OS 2.0 — MÓDULO: NF EMITIDAS (nf) ═══ */
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
    if(SS20.cache.nf) return Promise.resolve(SS20.cache.nf);
    return SS20.sb('orcamentos?select=numero,cliente,agencia,projeto,nf_numero,valor_nf,data_nf,nf_url,sinal_recebido,saldo_recebido,status&nf_numero=not.is.null&order=data_nf.desc.nullslast')
      .then(function(r){
        var d=r.filter(function(o){return !isTreino(o.numero);});
        SS20.cache.nf=d; return d;
      });
  }
  function render(c){
    fetchAll().then(function(d){ draw(c,d); })
    .catch(function(e){ c.innerHTML='<div class="err-view">Erro ao carregar dados: '+esc(e.message)+'</div>'; });
  }
  function draw(c,d){
    var tot=d.reduce(function(a,b){return a+(parseFloat(b.valor_nf)||0);},0);
    var mesAtual=new Date().toISOString().slice(0,7);
    var doMes=d.filter(function(o){return (o.data_nf||'').indexOf(mesAtual)===0;});
    var totMes=doMes.reduce(function(a,b){return a+(parseFloat(b.valor_nf)||0);},0);
    var recebidas=d.filter(function(o){return o.sinal_recebido&&o.saldo_recebido;});

    var h='<div style="padding:24px 26px">';
    h+='<h2 style="font-family:var(--font-d);font-size:19px;margin-bottom:4px">Notas Fiscais Emitidas</h2>';
    h+='<p style="color:var(--mut);font-size:12.5px;margin-bottom:20px">Fonte: campo NF dos orçamentos</p>';
    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:22px">';
    h+=kpi('Faturamento (NF)',fmt(tot),d.length+' notas','var(--ok)');
    h+=kpi('Mês atual',fmt(totMes),doMes.length+' notas','var(--blue)');
    h+=kpi('Quitadas',recebidas.length+' de '+d.length,'sinal + saldo recebidos','var(--mut)');
    h+='</div>';
    h+=card('Notas', tbl(d,function(o){
      var pgto=(o.sinal_recebido?'S':'·')+(o.saldo_recebido?'S':'·');
      var pgtoLbl = o.sinal_recebido&&o.saldo_recebido ? '<span style="color:var(--ok)">✓ quitada</span>'
                  : o.sinal_recebido ? '<span style="color:var(--warn)">sinal ok</span>'
                  : '<span style="color:var(--mut)">aguardando</span>';
      return '<tr><td>'+dstr(o.data_nf)+'</td>'
        +'<td style="font-weight:600">'+esc(o.nf_numero||'—')+(o.nf_url?' <a href="'+esc(o.nf_url)+'" target="_blank" style="color:var(--accent)">↗</a>':'')+'</td>'
        +'<td style="font-size:11px;color:var(--mut)">'+esc(o.numero)+'</td>'
        +'<td>'+esc(o.cliente||'—')+'</td>'
        +'<td>'+pgtoLbl+'</td>'
        +'<td style="text-align:right;font-weight:600">'+fmt(parseFloat(o.valor_nf)||0)+'</td></tr>';
    },['Data','NF','Job','Cliente','Pgto','Valor']));
    h+='</div>';
    c.innerHTML=h;
  }
  SS20.modules.nf={render:render};
})();
