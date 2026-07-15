/* ═══ SULSIGN OS 2.0 — MÓDULO: A PAGAR / ORDENS DE PAGAMENTO (pagar) ═══ */
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
    if(SS20.cache.pagar) return Promise.resolve(SS20.cache.pagar);
    return SS20.sb('contas_pagar?select=*&order=vencimento.asc.nullslast&deletado_em=is.null')
      .then(function(r){
        var d=r.filter(function(x){return !isTreino(x.orcamento_numero);});
        SS20.cache.pagar=d; return d;
      });
  }
  function render(c){
    fetchAll().then(function(d){ draw(c,d); })
    .catch(function(e){ c.innerHTML='<div class="err-view">Erro ao carregar dados: '+esc(e.message)+'</div>'; });
    if(!SS20._pagarBound){
      SS20._pagarBound=true;
      c.addEventListener('click',function(ev){
        var t=ev.target;
        if(t.dataset&&t.dataset.action==='ver-comp'){ ev.preventDefault(); verComprovante(t.dataset.path,t.dataset.link); }
      });
    }
  }
  function verComprovante(path,link){
    if(link){ window.open(link,'_blank'); return; }
    if(!path) return;
    if(path.indexOf('data:')===0){
      var w=window.open('','_blank');
      w.document.write('<img src="'+path+'" style="max-width:100%">');
      return;
    }
    var tk=window.SULSIGN_ACCESS_TOKEN||SulSignCore.SUPA_KEY;
    fetch(SulSignCore.SUPA_URL+'/storage/v1/object/comprovantes/'+path,{
      headers:{'apikey':SulSignCore.SUPA_KEY,'Authorization':'Bearer '+tk}
    }).then(function(r){
      if(!r.ok)throw new Error('HTTP '+r.status);
      return r.blob();
    }).then(function(b){
      window.open(URL.createObjectURL(b),'_blank');
    }).catch(function(e){ alert('Não foi possível abrir o comprovante: '+e.message); });
  }
  function draw(c,d){
    var hoje=new Date(); hoje.setHours(0,0,0,0);
    var pend=d.filter(function(x){return (x.status||'Pendente')==='Pendente';});
    var totPend=pend.reduce(function(a,b){return a+(parseFloat(b.valor)||0);},0);
    var atras=pend.filter(function(x){return x.vencimento&&new Date(x.vencimento+'T00:00:00')<hoje;});
    var totAtras=atras.reduce(function(a,b){return a+(parseFloat(b.valor)||0);},0);

    /* agrupa por ordem de pagamento */
    var lotes={},soltas=[];
    d.forEach(function(x){
      if(x.token_ponde){
        if(!lotes[x.token_ponde])lotes[x.token_ponde]={tk:x.token_ponde,itens:[],env:x.enviado_ponde_em};
        lotes[x.token_ponde].itens.push(x);
      }else soltas.push(x);
    });
    var lotesArr=Object.keys(lotes).map(function(k){return lotes[k];})
      .sort(function(a,b){return (b.env||'').localeCompare(a.env||'');});

    var h='<div style="padding:24px 26px">';
    h+='<h2 style="font-family:var(--font-d);font-size:19px;margin-bottom:4px">A Pagar / Ordens de Pagamento</h2>';
    h+='<p style="color:var(--mut);font-size:12.5px;margin-bottom:20px">Gerar nova OrPag: <a href="../Lancamentos.html" target="_blank" style="color:var(--accent);font-weight:600">Lançamentos v1 → Contas a Pagar</a></p>';
    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:22px">';
    h+=kpi('Pendente',fmt(totPend),pend.length+' contas','var(--warn)');
    h+=kpi('Atrasado',fmt(totAtras),atras.length+' contas',totAtras>0?'var(--danger)':'var(--ok)');
    h+=kpi('Ordens emitidas',String(lotesArr.length),'lotes enviados ao Pondé','var(--blue)');
    h+='</div>';

    /* lotes */
    lotesArr.forEach(function(L){
      var totL=L.itens.reduce(function(a,b){return a+(parseFloat(b.valor)||0);},0);
      var pagos=L.itens.filter(function(x){return x.pago_por_ponde||x.status==='Pago';}).length;
      var link='../Pagamentos_Ponde.html?token='+encodeURIComponent(L.tk);
      var body=tbl(L.itens,function(x){
        var pago=x.pago_por_ponde||x.status==='Pago';
        var comp=(x.comprovante_ponde||x.comprovante_link)
          ? '<a href="#" data-action="ver-comp" data-path="'+esc(x.comprovante_ponde||'')+'" data-link="'+esc(x.comprovante_link||'')+'" style="color:var(--accent);font-weight:600">ver</a>'
          : '<span style="color:var(--mut)">—</span>';
        return '<tr><td style="font-size:10.5px;color:var(--mut)">'+esc(x.numero_op||'')+'</td>'
          +'<td>'+esc(x.favorecido||x.descricao||'—')+'</td>'
          +'<td style="font-size:10.5px;color:var(--mut)">'+esc(x.orcamento_numero&&x.orcamento_numero!=='SEM-JOB'?x.orcamento_numero:'')+'</td>'
          +'<td>'+(pago?'<span style="color:var(--ok)">✓ pago '+dstr(x.data_pagamento)+'</span>':'<span style="color:var(--warn)">pendente</span>')+'</td>'
          +'<td>'+comp+'</td>'
          +'<td style="text-align:right;font-weight:600">'+fmt(parseFloat(x.valor)||0)+'</td></tr>';
      },['OP','Favorecido','Job','Status','Compr.','Valor']);
      h+='<div style="margin-bottom:14px">';
      h+=card(esc(L.tk)+' · '+pagos+'/'+L.itens.length+' pagas · '+fmt(totL)
        +' · <a href="'+link+'" target="_blank" style="color:var(--accent);text-transform:none;letter-spacing:0">abrir link do Pondé ↗</a>', body);
      h+='</div>';
    });

    /* soltas pendentes */
    var soltasPend=soltas.filter(function(x){return (x.status||'Pendente')==='Pendente';});
    h+=card('Sem ordem emitida ('+soltasPend.length+')', tbl(soltasPend,function(x){
      var late=x.vencimento&&new Date(x.vencimento+'T00:00:00')<hoje;
      return '<tr><td style="'+(late?'color:var(--danger);font-weight:600':'')+'">'+dstr(x.vencimento)+'</td>'
        +'<td>'+esc(x.favorecido||x.descricao||'—')+'</td>'
        +'<td style="font-size:10.5px;color:var(--mut)">'+esc(x.categoria||'')+'</td>'
        +'<td style="font-size:10.5px;color:var(--mut)">'+esc(x.orcamento_numero&&x.orcamento_numero!=='SEM-JOB'?x.orcamento_numero:'')+'</td>'
        +'<td style="text-align:right;font-weight:600">'+fmt(parseFloat(x.valor)||0)+'</td></tr>';
    },['Venc.','Favorecido','Categoria','Job','Valor']));
    h+='</div>';
    c.innerHTML=h;
  }
  SS20.modules.pagar={render:render};
})();
