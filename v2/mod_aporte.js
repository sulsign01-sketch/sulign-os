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
  var AP_SAIDA=['retirada de socio','devolucao de emprestimo'];
  function norm(s){
    return String(s==null?'':s).toLowerCase()
      .replace(/[\u00e0\u00e1\u00e2\u00e3\u00e4]/g,'a').replace(/[\u00e9\u00e8\u00ea\u00eb]/g,'e').replace(/[\u00ed\u00ec\u00ee\u00ef]/g,'i')
      .replace(/[\u00f3\u00f2\u00f4\u00f5\u00f6]/g,'o').replace(/[\u00fa\u00f9\u00fb\u00fc]/g,'u').replace(/\u00e7/g,'c').trim();
  }
  function eSaida(a){ return AP_SAIDA.indexOf(norm(a.tipo))>=0; }
  function fetchAll(){
    if(SS20.cache.aporte) return Promise.resolve(SS20.cache.aporte);
    return SS20.sb('aportes?select=id,data,valor,tipo,origem,descricao,status,forma_pgto,mes_ref,observacao&deletado_em=is.null&order=data.desc')
      .then(function(d){ d=d||[]; SS20.cache.aporte=d; return d; });
  }
  function render(c){
    fetchAll().then(function(d){ draw(c,d); })
    .catch(function(e){ c.innerHTML='<div class="err-view">Erro ao carregar dados: '+esc(e.message)+'</div>'; });
  }
  function draw(c,d){
    var entradas=0,saidas=0,pend=0;
    var porOrigem={};
    d.forEach(function(a){
      var v=parseFloat(a.valor)||0;
      if(norm(a.status)==='pendente'){ pend+=v; return; }
      if(eSaida(a)) saidas+=v; else entradas+=v;
      var k=a.origem||'(nao identificado)';
      porOrigem[k]=(porOrigem[k]||0)+(eSaida(a)?-v:v);
    });
    var origens=Object.keys(porOrigem).map(function(k){return {s:k,v:porOrigem[k]};}).sort(function(a,b){return b.v-a.v;});
    var saldo=entradas-saidas;

    var h='<div style="padding:24px 26px">';
    h+='<h2 style="font-family:var(--font-d);font-size:19px;margin-bottom:4px">Aportes e Capital</h2>';
    h+='<p style="color:var(--mut);font-size:12.5px;margin-bottom:20px">Tabela <b>aportes</b> \u2014 fonte \u00fanica de movimento de capital: aportes, empr\u00e9stimos, retiradas e devolu\u00e7\u00f5es</p>';
    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:22px">';
    h+=kpi('Capital entrado',fmt(entradas),'','var(--ok)');
    h+=kpi('Retiradas e devolu\u00e7\u00f5es',fmt(saidas),'','var(--danger)');
    h+=kpi('Saldo de capital',fmt(saldo),d.length+' registros',saldo>=0?'var(--ok)':'var(--danger)');
    if(pend) h+=kpi('Pendente',fmt(pend),'fora do fluxo de caixa','#f9a825');
    h+='</div>';
    if(origens.length){
      h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:22px">';
      origens.slice(0,4).forEach(function(x){ h+=kpi(esc(x.s),fmt(x.v),'l\u00edquido','var(--blue)'); });
      h+='</div>';
    }
    h+=card('Hist\u00f3rico', tbl(d,function(a){
      var v=parseFloat(a.valor)||0, sai=eSaida(a), pd=norm(a.status)==='pendente';
      return '<tr><td>'+dstr(a.data)+'</td>'
        +'<td style="font-size:11.5px">'+esc(a.tipo||'\u2014')+(a.origem?'<div style="font-size:10.5px;color:var(--mut)">'+esc(a.origem)+'</div>':'')+'</td>'
        +'<td style="font-size:11px;color:var(--mut)">'+esc(a.descricao||'')+'</td>'
        +'<td style="font-size:11px;color:'+(pd?'#f9a825':'var(--mut)')+'">'+esc(a.status||'\u2014')+'</td>'
        +'<td style="text-align:right;font-weight:600;color:'+(pd?'var(--mut)':(sai?'var(--danger)':'var(--ok)'))+'">'+(sai?'\u2212':'+')+fmt(v)+'</td></tr>';
    },['Data','Tipo / Origem','Descri\u00e7\u00e3o','Status','Valor']),
      'Aportes com status <b>Pendente</b> ficam fora do saldo e do Fluxo de Caixa at\u00e9 serem confirmados. Cadastro e edi\u00e7\u00e3o ainda no sistema antigo.');
    h+='</div>';
    c.innerHTML=h;
  }
  SS20.modules.aporte={render:render};
})();
