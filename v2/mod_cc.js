/* ═══ SULSIGN OS 2.0 — MÓDULO: CENTRO DE CUSTO (cc)
   Regra: todos os custos ligados a job, conciliados ou não. ═══ */
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
    if(SS20.cache.cc) return Promise.resolve(SS20.cache.cc);
    return Promise.all([
      SS20.sb('lancamentos?select=orcamento_numero,valor,categoria,subcategoria,tipo_lancamento,conciliado&tipo_lancamento=eq.saida&orcamento_numero=neq.SEM-JOB&deletado_em=is.null'),
      SS20.sb('orcamentos?select=numero,cliente,projeto,bdi,grupos,status')
    ]).then(function(r){
      var d={
        lanc:r[0].filter(function(l){return !isTreino(l.orcamento_numero);}),
        orcs:{}
      };
      r[1].forEach(function(o){ if(!isTreino(o.numero)) d.orcs[o.numero]=o; });
      SS20.cache.cc=d; return d;
    });
  }
  function render(c){
    fetchAll().then(function(d){ draw(c,d); })
    .catch(function(e){ c.innerHTML='<div class="err-view">Erro ao carregar dados: '+esc(e.message)+'</div>'; });
    if(!SS20._ccBound){
      SS20._ccBound=true;
      c.addEventListener('click',function(ev){
        if(ev.target.closest&&ev.target.closest('[id^="cc-det-"]'))return;
        var t=ev.target.closest?ev.target.closest('[data-action="cc-toggle"]'):null;
        if(t){
          var det=document.getElementById('cc-det-'+t.dataset.job.replace(/[^a-zA-Z0-9]/g,''));
          if(det)det.style.display=det.style.display==='none'?'block':'none';
        }
      });
    }
  }
  function draw(c,d){
    var jobs={};
    d.lanc.forEach(function(l){
      var j=l.orcamento_numero;
      if(!jobs[j])jobs[j]={j:j,tot:0,cats:{}};
      var v=parseFloat(l.valor)||0;
      jobs[j].tot+=v;
      var ck=(l.categoria||'—')+(l.subcategoria?' › '+l.subcategoria:'');
      jobs[j].cats[ck]=(jobs[j].cats[ck]||0)+v;
    });
    var arr=Object.keys(jobs).map(function(k){return jobs[k];}).sort(function(a,b){return b.tot-a.tot;});
    var totGeral=arr.reduce(function(a,b){return a+b.tot;},0);

    var h='<div style="padding:24px 26px">';
    h+='<h2 style="font-family:var(--font-d);font-size:19px;margin-bottom:4px">Centro de Custo</h2>';
    h+='<p style="color:var(--mut);font-size:12.5px;margin-bottom:20px">Todos os custos por job (conciliados e provisionados) · clique no job para detalhar</p>';
    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:22px">';
    h+=kpi('Custo total registrado',fmt(totGeral),arr.length+' jobs','var(--warn)');
    h+='</div>';

    arr.forEach(function(J){
      var o=d.orcs[J.j];
      var venda=o?SulSignCore.calcOrcamento(o).venda:0;
      var margem=venda>0?((venda-J.tot)/venda*100):null;
      var jid=J.j.replace(/[^a-zA-Z0-9]/g,'');
      var cats=Object.keys(J.cats).map(function(k){return {c:k,v:J.cats[k]};}).sort(function(a,b){return b.v-a.v;});
      var det='<div id="cc-det-'+jid+'" style="display:none;margin-top:8px">';
      det+=tbl(cats,function(x){
        var pct=J.tot>0?(x.v/J.tot*100).toFixed(0):0;
        return '<tr><td>'+esc(x.c)+'</td><td style="color:var(--mut)">'+pct+'%</td>'
          +'<td style="text-align:right;font-weight:600">'+fmt(x.v)+'</td></tr>';
      },['Categoria','%','Valor']);
      det+='</div>';

      h+='<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:14px 18px;margin-bottom:10px;cursor:pointer" data-action="cc-toggle" data-job="'+esc(J.j)+'">';
      h+='<div style="display:flex;justify-content:space-between;align-items:center">';
      h+='<div><span style="font-weight:700">'+esc(J.j)+'</span>'
        +(o?' <span style="color:var(--mut);font-size:11.5px">'+esc(o.cliente||'')+' · '+esc(o.projeto||'')+'</span>':'')+'</div>';
      h+='<div style="text-align:right"><span style="font-weight:800;font-family:var(--font-d)">'+fmt(J.tot)+'</span>';
      if(margem!==null){
        h+=' <span style="font-size:11px;color:'+(margem>=30?'var(--ok)':margem>=10?'var(--warn)':'var(--danger)')+'">margem '+margem.toFixed(0)+'%</span>';
      }
      h+='</div></div>'+det+'</div>';
    });
    h+='</div>';
    c.innerHTML=h;
  }
  SS20.modules.cc={render:render};
})();
