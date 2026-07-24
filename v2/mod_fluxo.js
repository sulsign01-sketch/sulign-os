/* ═══ SULSIGN OS 2.0 — MÓDULO: FLUXO DE CAIXA (fluxo)
   Fonte ÚNICA do saldo: lancamentos conciliado=true — inclusive o movimento
   de capital (Aporte, Dívida Anterior, Aquisição de Ativo...), que sai do
   banco de verdade e por isso pertence ao caixa, mesmo nao sendo resultado.
   A tabela aportes NAO soma mais no saldo (Jul/2026): virou registro
   societario e serve para (a) aporte pendente e (b) acusar aporte registrado
   sem lancamento correspondente.
   Inclui painel de diagnóstico e conferência contra o extrato bancário. ═══ */
(function(){
  var fmt=SulSignCore.fmt;
  var LS_BANCO='ss_saldo_banco';
  var AP_SAIDA=['retirada de socio','devolucao de emprestimo'];
  var AP_TIPOS=['aporte de socio','emprestimo recebido','credito externo','retirada de socio',
                'devolucao de emprestimo','outros','alimentacao','verba producao'];

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function norm(s){
    return String(s==null?'':s).toLowerCase()
      .replace(/[àáâãä]/g,'a').replace(/[éèêë]/g,'e').replace(/[íìîï]/g,'i')
      .replace(/[óòôõö]/g,'o').replace(/[úùûü]/g,'u').replace(/ç/g,'c').trim();
  }
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
  function aviso(txt,cor){
    var c=cor||'var(--danger)';
    return '<div style="background:var(--panel);border:1px solid '+c+';border-left:3px solid '+c+';border-radius:var(--radius);padding:12px 14px;margin-bottom:12px;font-size:12px;color:'+c+'">'+txt+'</div>';
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
    var pL=SS20.sb('lancamentos?select=data,valor,tipo_lancamento,categoria,subcategoria,descricao,conciliado,orcamento_numero&deletado_em=is.null&order=data.asc');
    var pA=SS20.sb('aportes?select=data,valor,tipo,origem,descricao,status&deletado_em=is.null&order=data.asc')
      .catch(function(){ return null; });
    return Promise.all([pL,pA]).then(function(res){
      var todos=(res[0]||[]);
      var apOk=res[1]!==null;
      var aps=(res[1]||[]);
      var movs=[], pend=0;
      var dg={ naoConcQtd:0, naoConcVal:0, concQtd:0, semData:0, valorZero:0,
               tipoEstranho:{}, apTipoEstranho:{}, nAp:aps.length, apOk:apOk,
               apReal:0, orfaoQtd:0, orfaoVal:0, orfaos:[], capQtd:0, capVal:0 };

      todos.forEach(function(l){
        if(isTreino(l.orcamento_numero)) return;
        var v=parseFloat(l.valor)||0;
        var t=norm(l.tipo_lancamento);
        if(t!=='entrada'&&t!=='saida') dg.tipoEstranho[l.tipo_lancamento||'(vazio)']=(dg.tipoEstranho[l.tipo_lancamento||'(vazio)']||0)+1;
        if(!l.data) dg.semData++;
        if(v<=0) dg.valorZero++;
        /* movimento de capital: continua no caixa (saiu/entrou do banco de
           verdade), mas fica marcado para os KPIs de resultado saberem ignorar */
        if(l.conciliado && window.SulSignCore && SulSignCore.ehCapital && SulSignCore.ehCapital(l.categoria)){
          dg.capQtd++; dg.capVal+=v;
        }
        if(!l.conciliado){ dg.naoConcQtd++; dg.naoConcVal+=v; return; }
        dg.concQtd++;
        if(!l.data) return;
        movs.push({ data:l.data, valor:v, ent:(t==='entrada'), origem:'lanc',
                    categoria:l.categoria||'—', sub:l.subcategoria||'', desc:l.descricao||'' });
      });

      /* ── APORTES: registro societário, NÃO fonte de caixa (Jul/2026) ──
         Antes esta tabela era somada junto com os lancamentos, e o mesmo
         dinheiro entrava duas vezes assim que a linha do extrato fosse
         categorizada como Aporte. Agora a regra e unica e sem ambiguidade:

           lancamentos = o caixa. Espelha o extrato, tem que bater com o banco.
           aportes     = o contrato. Quem aportou, se e capital ou mutuo, se
                         volta, status. Nao soma no saldo.

         O que a tabela ainda alimenta:
           - aporte PENDENTE, que e previsao e nao passou no banco;
           - o cruzamento abaixo, que acusa aporte registrado sem lancamento
             correspondente. Sem esse cruzamento, sair de fininho da soma
             esconderia dinheiro real em vez de duplica-lo — troca de um erro
             por outro. */
      var lancCapital=[];
      todos.forEach(function(l){
        if(!l.conciliado||!l.data) return;
        var cap=(window.SulSignCore&&SulSignCore.ehCapital)
                 ? SulSignCore.ehCapital(l.categoria)
                 : (norm(l.categoria).indexOf('aporte')>=0);
        if(cap) lancCapital.push({ data:l.data, valor:Math.round((parseFloat(l.valor)||0)*100) });
      });
      function temLancamento(a){
        var alvo=Math.round((parseFloat(a.valor)||0)*100);
        var da=Date.parse(String(a.data).slice(0,10));
        for(var i=0;i<lancCapital.length;i++){
          if(lancCapital[i].valor!==alvo) continue;
          var dl=Date.parse(String(lancCapital[i].data).slice(0,10));
          /* tolerancia de 5 dias: a data do aporte e a do combinado, a do
             extrato e a da compensacao — quase nunca sao o mesmo dia */
          if(isNaN(da)||isNaN(dl)||Math.abs(da-dl)<=5*864e5) return true;
        }
        return false;
      }

      aps.forEach(function(a){
        var v=parseFloat(a.valor)||0;
        var t=norm(a.tipo);
        if(AP_TIPOS.indexOf(t)<0) dg.apTipoEstranho[a.tipo||'(vazio)']=(dg.apTipoEstranho[a.tipo||'(vazio)']||0)+1;
        if(norm(a.status)==='pendente'){ pend+=v; return; }
        if(!a.data) return;
        dg.apReal++;
        if(!temLancamento(a)){
          dg.orfaoQtd++; dg.orfaoVal+=v;
          dg.orfaos.push({ data:a.data, valor:v, ent:(AP_SAIDA.indexOf(t)<0),
                           tipo:a.tipo||'Aporte', origem:a.origem||'', desc:a.descricao||'' });
        }
      });

      var d={ movs:movs, pend:pend, dg:dg };
      SS20.cache.fluxo=d; return d;
    });
  }

  function render(c){
    fetchAll().then(function(d){ draw(c,d); })
    .catch(function(e){ c.innerHTML='<div class="err-view">Erro ao carregar dados: '+esc(e.message)+'</div>'; });
    if(!SS20._fluxoBound){
      SS20._fluxoBound=true;
      c.addEventListener('change',function(ev){
        var t=ev.target; if(!t)return;
        if(t.id==='fx-mes'){ fetchAll().then(function(d){ draw(c,d,t.value); }); }
      });
      c.addEventListener('click',function(ev){
        var t=ev.target; if(!t||!t.getAttribute)return;
        var a=t.getAttribute('data-action');
        if(a==='fluxo-refresh'){
          SS20.cache.fluxo=null;
          var sel=document.getElementById('fx-mes');
          var m=sel?sel.value:null;
          t.textContent='Atualizando...';
          fetchAll().then(function(d){ draw(c,d,m); })
          .catch(function(e){ c.innerHTML='<div class="err-view">Erro: '+esc(e.message)+'</div>'; });
        }
        if(a==='fluxo-diag'){
          var p=document.getElementById('fx-diag');
          if(p){ var vis=p.style.display!=='none'; p.style.display=vis?'none':'block'; t.textContent=vis?'▸ Diagnóstico':'▾ Diagnóstico'; }
        }
        if(a==='fluxo-banco'){
          var inp=document.getElementById('fx-banco');
          if(inp){
            var v=parseFloat(String(inp.value).replace(/\./g,'').replace(',','.'))||0;
            try{ localStorage.setItem(LS_BANCO,JSON.stringify({v:v,em:new Date().toISOString().slice(0,10)})); }catch(e){}
            var sel2=document.getElementById('fx-mes');
            fetchAll().then(function(d){ draw(c,d,sel2?sel2.value:null); });
          }
        }
      });
    }
  }

  function draw(c,d,mesSel){
    var movs=d.movs, dg=d.dg;
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

    var banco=null;
    try{ banco=JSON.parse(localStorage.getItem(LS_BANCO)||'null'); }catch(e){}

    var h='<div style="padding:24px 26px">';
    h+='<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:4px;flex-wrap:wrap">';
    h+='<h2 style="font-family:var(--font-d);font-size:19px">Fluxo de Caixa</h2>';
    h+='<div style="display:flex;gap:8px">'
      +'<button data-action="fluxo-diag" style="font-size:11px;padding:5px 12px;background:var(--panel);color:inherit;border:1px solid var(--line);border-radius:6px;cursor:pointer">▸ Diagnóstico</button>'
      +'<button data-action="fluxo-refresh" style="font-size:11px;padding:5px 12px;background:var(--panel);color:inherit;border:1px solid var(--line);border-radius:6px;cursor:pointer">&#8635; Atualizar</button>'
      +'</div></div>';
    h+='<p style="color:var(--mut);font-size:12.5px;margin-bottom:18px">Lançamentos conciliados (confirmados no banco) — inclui movimento de capital, que passa no extrato mas não é resultado</p>';

    /* ── avisos críticos ── */
    if(!dg.apOk) h+=aviso('Não consegui ler a tabela <b>aportes</b>. Os números estão <b>sem aportes, retiradas e empréstimos</b>.');
    if(dg.orfaoQtd) h+=aviso('<b>Aporte sem lançamento:</b> '+dg.orfaoQtd+' registro(s) da tabela aportes ('+fmt(dg.orfaoVal)+') sem linha correspondente no extrato. Esse dinheiro <b>não está</b> no saldo — lance em Lançamentos com categoria do bloco Capital e Sócios. Detalhe no Diagnóstico.','#f9a825');
    var estranhos=Object.keys(dg.tipoEstranho).concat(Object.keys(dg.apTipoEstranho));
    if(estranhos.length) h+=aviso('<b>Classificação incerta:</b> valores de tipo fora do padrão ('+esc(estranhos.join(', '))+'). Foram tratados como saída — confira no Diagnóstico.','#f9a825');

    /* ── painel de diagnóstico ── */
    h+='<div id="fx-diag" style="display:none;margin-bottom:18px">';
    var dl='<table style="width:100%;border-collapse:collapse;font-size:12.5px"><tbody>';
    function lin(k,v,cor){ return '<tr><td style="padding:5px 6px;border-bottom:1px solid var(--line);color:var(--mut)">'+k+'</td><td style="padding:5px 6px;border-bottom:1px solid var(--line);text-align:right;font-weight:600'+(cor?';color:'+cor:'')+'">'+v+'</td></tr>'; }
    dl+=lin('Lançamentos conciliados',dg.concQtd+' registros');
    dl+=lin('Lançamentos <b>não conciliados</b> (fora do fluxo)',dg.naoConcQtd+' · '+fmt(dg.naoConcVal),dg.naoConcQtd?'var(--danger)':'var(--ok)');
    dl+=lin('Movimento de capital nos lançamentos',dg.capQtd+' · '+fmt(dg.capVal));
    dl+=lin('Registros na tabela aportes (só registro societário)',dg.nAp+' registros');
    dl+=lin('Aportes realizados <b>sem lançamento no extrato</b>',dg.orfaoQtd+' · '+fmt(dg.orfaoVal),dg.orfaoQtd?'#f9a825':'var(--ok)');
    dl+=lin('Aportes pendentes (fora do saldo)',fmt(d.pend),d.pend?'#f9a825':'var(--mut)');
    dg.orfaos.forEach(function(o){
      dl+=lin('&nbsp;&nbsp;↳ '+dstr(o.data)+' · '+esc(o.tipo)+(o.origem?' · '+esc(o.origem):''),fmt(o.valor),'#f9a825');
    });
    dl+=lin('Lançamentos sem data',dg.semData,dg.semData?'#f9a825':'var(--mut)');
    dl+=lin('Lançamentos com valor zero ou negativo',dg.valorZero,dg.valorZero?'#f9a825':'var(--mut)');
    Object.keys(dg.tipoEstranho).forEach(function(k){ dl+=lin('tipo_lancamento fora do padrão: <b>'+esc(k)+'</b>',dg.tipoEstranho[k]+' registros','var(--danger)'); });
    Object.keys(dg.apTipoEstranho).forEach(function(k){ dl+=lin('tipo de aporte fora do padrão: <b>'+esc(k)+'</b>',dg.apTipoEstranho[k]+' registros','var(--danger)'); });
    dl+='</tbody></table>';
    h+=card('Diagnóstico dos dados',dl,'Não conciliado não entra no fluxo: é dinheiro que saiu ou entrou e o sistema ainda não sabe. Concilie em Lançamentos.');
    h+='</div>';

    /* ── KPIs ── */
    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:18px">';
    h+=kpi('Entradas · '+mesAtual,fmt(entM),'','var(--ok)');
    h+=kpi('Saídas · '+mesAtual,fmt(saiM),'','var(--danger)');
    h+=kpi('Resultado do mês',fmt(entM-saiM),'',entM-saiM>=0?'var(--ok)':'var(--danger)');
    h+=kpi('Saldo acumulado',fmt(acum),'segundo o sistema',acum>=0?'var(--ok)':'var(--danger)');
    h+='</div>';

    /* ── conferência com o banco ── */
    var bh='<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">'
      +'<span style="font-size:12px;color:var(--mut)">Saldo real da conta hoje: R$</span>'
      +'<input id="fx-banco" type="text" inputmode="decimal" value="'+(banco?String(banco.v).replace('.',','):'')+'" placeholder="0,00" style="width:130px;font-size:13px;padding:5px 8px;background:var(--panel);color:inherit;border:1px solid var(--line);border-radius:6px">'
      +'<button data-action="fluxo-banco" style="font-size:11px;padding:5px 12px;background:var(--panel);color:inherit;border:1px solid var(--line);border-radius:6px;cursor:pointer">Conferir</button>';
    if(banco&&banco.v){
      var dif=banco.v-acum;
      var okDif=Math.abs(dif)<0.01;
      bh+='<span style="font-size:13px;margin-left:6px;color:'+(okDif?'var(--ok)':'var(--danger)')+'">'
        +(okDif?'✓ Sistema bate com o banco':'Divergência de <b>'+fmt(Math.abs(dif))+'</b> — o banco tem '+(dif>0?'MAIS':'MENOS')+' que o sistema')
        +'</span>';
    }
    bh+='</div>';
    h+='<div style="margin-bottom:18px">'+card('Conferência com o extrato',bh,
      banco&&banco.em?'Última conferência informada em '+dstr(banco.em)+'. Enquanto houver divergência, o fluxo não é confiável para decisão.':'Informe o saldo do extrato para o sistema calcular a divergência.')+'</div>';

    /* ── tabelas ── */
    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px">';
    h+=card('Por mês', tbl(arr.slice().reverse(),function(x){
      var res=x.ent-x.sai;
      return '<tr><td style="font-weight:600">'+x.m+'</td>'
        +'<td style="color:var(--ok)">'+fmt(x.ent)+'</td>'
        +'<td style="color:var(--danger)">'+fmt(x.sai)+'</td>'
        +'<td style="font-weight:600;color:'+(res>=0?'var(--ok)':'var(--danger)')+'">'+fmt(res)+'</td>'
        +'<td style="text-align:right;color:'+(x.acum>=0?'var(--ok)':'var(--danger)')+'">'+fmt(x.acum)+'</td></tr>';
    },['Mês','Entradas','Saídas','Resultado','Acumulado']));

    /* ── por categoria › subcategoria (mês selecionado) ── */
    var pc={};
    doMes.forEach(function(x){
      var cat=x.categoria||'—';
      var sub=String(x.sub||'').trim()||'— sem subcategoria';
      if(!pc[cat]) pc[cat]={ent:0,sai:0,subs:{}};
      if(!pc[cat].subs[sub]) pc[cat].subs[sub]={ent:0,sai:0};
      var v=parseFloat(x.valor)||0;
      if(x.ent){ pc[cat].ent+=v; pc[cat].subs[sub].ent+=v; }
      else { pc[cat].sai+=v; pc[cat].subs[sub].sai+=v; }
    });
    function pcTot(o){ return (o.ent||0)+(o.sai||0); }
    var pcRows='';
    Object.keys(pc).sort(function(a,b){ return pcTot(pc[b])-pcTot(pc[a]); }).forEach(function(k){
      var D=pc[k];
      pcRows+='<tr style="border-bottom:1px solid var(--line)">'
        +'<td style="padding:6px;font-weight:600">'+esc(k)+'</td>'
        +'<td style="padding:6px;text-align:right;color:var(--ok)">'+(D.ent?fmt(D.ent):'—')+'</td>'
        +'<td style="padding:6px;text-align:right;color:var(--danger)">'+(D.sai?fmt(D.sai):'—')+'</td></tr>';
      var sk=Object.keys(D.subs).sort(function(a,b){ return pcTot(D.subs[b])-pcTot(D.subs[a]); });
      if(sk.length===1&&sk[0]==='— sem subcategoria') return;
      sk.forEach(function(s){
        var SD=D.subs[s];
        pcRows+='<tr style="border-bottom:1px solid var(--line)">'
          +'<td style="padding:4px 6px 4px 22px;color:var(--mut);font-size:11.5px">&rsaquo; '+esc(s)+'</td>'
          +'<td style="padding:4px 6px;text-align:right;font-size:11.5px;color:var(--mut)">'+(SD.ent?fmt(SD.ent):'—')+'</td>'
          +'<td style="padding:4px 6px;text-align:right;font-size:11.5px;color:var(--mut)">'+(SD.sai?fmt(SD.sai):'—')+'</td></tr>';
      });
    });
    var pcTh='<th style="padding:8px 6px;text-align:left;font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;color:var(--mut)">';
    var pcTab='<table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr>'
      +pcTh+'Categoria</th>'
      +pcTh.replace('text-align:left','text-align:right')+'Entradas</th>'
      +pcTh.replace('text-align:left','text-align:right')+'Saídas</th>'
      +'</tr></thead><tbody>'+pcRows+'</tbody></table>';
    h+=card('Por categoria · '+mesAtual,
      pcRows?pcTab:'<div style="padding:14px;color:var(--mut);font-size:12px">Sem movimento no mês.</div>',
      'Subcategoria aparece só onde há classificação. Categoria sem nenhum registro classificado fica só com a linha do total.');

    var ordenado=doMes.slice().sort(function(a,b){ return a.data<b.data?1:(a.data>b.data?-1:0); });
    var extrato=tbl(ordenado,function(x){
      var tag=x.origem==='aporte'
        ? '<span style="font-size:9.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--mut);border:1px solid var(--line);border-radius:3px;padding:1px 4px;margin-right:5px">apt</span>' : '';
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
