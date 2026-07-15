/* ═══════════════════════════════════════════════════════════════
   SULSIGN OS 2.0 — MÓDULO: ORÇAMENTOS (orc)
   Pipeline real: lista de propostas com valores (calcOrcamento oficial),
   filtro por status, busca, totais por estágio.
   Edição profunda continua no ORC_Manager v1 (link direto).
   ═══════════════════════════════════════════════════════════════ */
(function(){
  var fmt=SulSignCore.fmt;
  var st={filtro:'',busca:''};

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function isTreino(x){ return (x||'').indexOf('TREINO')>=0; }

  var CORES={
    'Em Orçamento':'#2563EB','Cotação':'#2563EB',
    'Proposta Enviada':'#D97706',
    'Aprovado':'#1E9E5A','Em Produção':'#0E7A43',
    'Entregue':'#0E7A43','Faturado':'#0B5E34','Pago':'#084526',
    'Orçamento Recusado':'#D23B2F','Orçamento Vencido':'#8A2B23','Cancelado':'#6B6E76'
  };

  function fetchAll(){
    if(SS20.cache.orc) return Promise.resolve(SS20.cache.orc);
    return SS20.sb('orcamentos?select=numero,cliente,agencia,projeto,bdi,grupos,status,valor_nf,updated_at&order=numero.desc')
      .then(function(rows){
        var data=rows.filter(function(o){return !isTreino(o.numero);})
          .map(function(o){
            o._calc=SulSignCore.calcOrcamento(o);
            return o;
          });
        SS20.cache.orc=data;
        return data;
      });
  }

  function render(c){
    fetchAll().then(function(d){ draw(c,d); })
    .catch(function(e){
      c.innerHTML='<div class="err-view">Erro ao carregar orçamentos: '+esc(e.message)+'</div>';
    });
  }

  function draw(c,d){
    /* totais por estágio */
    var porStatus={};
    var totalVivo=0;
    d.forEach(function(o){
      var s=o.status||'Em Orçamento';
      if(!porStatus[s])porStatus[s]={n:0,v:0};
      porStatus[s].n++; porStatus[s].v+=o._calc.venda;
      if(['Aprovado','Em Produção','Entregue','Faturado'].indexOf(s)>=0)totalVivo+=o._calc.venda;
    });

    var filtrados=d.filter(function(o){
      if(st.filtro && (o.status||'Em Orçamento')!==st.filtro)return false;
      if(st.busca){
        var q=st.busca.toLowerCase();
        var alvo=((o.numero||'')+' '+(o.cliente||'')+' '+(o.agencia||'')+' '+(o.projeto||'')).toLowerCase();
        if(alvo.indexOf(q)<0)return false;
      }
      return true;
    });

    var h='<div style="padding:24px 26px">';
    h+='<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:4px">';
    h+='<h2 style="font-family:var(--font-d);font-size:19px">Orçamentos</h2>';
    h+='<span class="sp" style="flex:1"></span>';
    h+='<a href="../ORC_Manager.html" target="_blank" style="background:var(--accent);color:#fff;text-decoration:none;font-size:12.5px;font-weight:600;padding:8px 14px;border-radius:8px">⊕ Novo / Editar no ORC Manager</a>';
    h+='</div>';
    h+='<p style="color:var(--mut);font-size:12.5px;margin-bottom:16px">'+d.length+' propostas · em carteira viva: <b>'+fmt(totalVivo)+'</b> · valores pelo cálculo oficial (BDI por proposta)</p>';

    /* pills de status */
    h+='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">';
    h+=pill('',null,'Todos',d.length,!st.filtro);
    SulSignCore.STATUS_PIPELINE.forEach(function(s){
      if(!porStatus[s])return;
      h+=pill(s,CORES[s],s,porStatus[s].n,st.filtro===s);
    });
    h+='</div>';

    /* busca */
    h+='<input id="orc-busca" type="text" inputmode="search" placeholder="Buscar por número, cliente, agência, projeto…" value="'+esc(st.busca)+'" '
      +'style="width:100%;max-width:420px;padding:9px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;margin-bottom:16px">';

    /* tabela */
    h+='<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);overflow:auto">';
    h+='<table style="width:100%;border-collapse:collapse;font-size:12.5px;min-width:680px"><thead><tr>';
    ['Número','Cliente / Agência','Projeto','Status','Custo','Venda',''].forEach(function(x,i){
      h+='<th style="text-align:'+(i>=4&&i<=5?'right':'left')+';padding:10px 12px;font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:var(--mut);border-bottom:1px solid var(--line);white-space:nowrap">'+x+'</th>';
    });
    h+='</tr></thead><tbody>';
    if(!filtrados.length)h+='<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--mut)">Nenhuma proposta com este filtro.</td></tr>';
    filtrados.forEach(function(o){
      var s=o.status||'Em Orçamento';
      var cor=CORES[s]||'#6B6E76';
      h+='<tr>'
        +'<td style="padding:9px 12px;border-bottom:1px solid var(--line);font-weight:600;white-space:nowrap">'+esc(o.numero)+'</td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid var(--line)">'+esc(o.cliente||'—')+(o.agencia?' <span style="color:var(--mut);font-size:11px">· '+esc(o.agencia)+'</span>':'')+'</td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid var(--line);max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(o.projeto||'')+'">'+esc(o.projeto||'—')+'</td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid var(--line);white-space:nowrap"><span style="font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:12px;background:'+cor+'18;color:'+cor+'">'+esc(s)+'</span></td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid var(--line);text-align:right;color:var(--mut)">'+fmt(o._calc.custo)+'</td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid var(--line);text-align:right;font-weight:700">'+fmt(o._calc.venda)+'</td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid var(--line)"><a href="../ORC_Manager.html" target="_blank" title="Abrir no ORC Manager e carregar '+esc(o.numero)+'" style="color:var(--accent);text-decoration:none;font-size:11.5px;font-weight:600">abrir ↗</a></td>'
        +'</tr>';
    });
    h+='</tbody></table></div></div>';
    c.innerHTML=h;

    /* eventos locais */
    var inp=document.getElementById('orc-busca');
    if(inp)inp.addEventListener('input',function(){
      st.busca=this.value;
      var pos=this.selectionStart;
      draw(c,d);
      var novo=document.getElementById('orc-busca');
      if(novo){novo.focus();try{novo.setSelectionRange(pos,pos);}catch(e){}}
    });
    var pills=c.querySelectorAll('[data-orc-filtro]');
    Array.prototype.forEach.call(pills,function(p){
      p.addEventListener('click',function(){
        st.filtro=this.getAttribute('data-orc-filtro');
        draw(c,d);
      });
    });
  }

  function pill(val,cor,lbl,n,on){
    var bg=on?(cor||'var(--ink)'):'var(--panel)';
    var fg=on?'#fff':(cor||'var(--ink2)');
    return '<button type="button" data-orc-filtro="'+esc(val)+'" style="border:1px solid '+(cor||'var(--line)')+';background:'+bg+';color:'+fg+';font-size:11.5px;font-weight:600;padding:5px 11px;border-radius:16px;cursor:pointer">'+esc(lbl)+' <span style="opacity:.75">'+n+'</span></button>';
  }

  SS20.modules.orc={render:render};
})();
