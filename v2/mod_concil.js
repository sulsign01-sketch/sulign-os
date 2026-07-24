/* ═══ SULSIGN OS 2.0 — MÓDULO: CONCILIAÇÃO BANCÁRIA (concil)
   Sobe o CSV do extrato C6 e cruza contra os lancamentos conciliado=true.
   Devolve 3 listas: casados, só-no-banco (falta lançar) e só-no-sistema
   (conciliado sem lastro no extrato). Permite lançar os faltantes já como
   conciliados, num clique.

   Regra de casamento: mesmo valor + mesmo sentido, |data| <= 7 dias.
   A janela de 7 dias absorve de propósito a diferença Data Lançamento x
   Data Contábil (Pix de fim de semana que o banco só contabiliza na segunda)
   e os estornos enviado/devolvido — sem isso a conciliação "não fecha" à toa.

   Leitura via SS20.sb, escrita via SS20.sbw. Registra em SS20.modules.concil.
   ES5 puro (var, sem arrow/template/const), compatível com iOS Safari. ═══ */
(function(){
  var fmt=SulSignCore.fmt;
  var JANELA=7;

  var CATS=(window.SulSignCore&&SulSignCore.CATEGORIAS&&SulSignCore.CATEGORIAS.length)
    ? SulSignCore.CATEGORIAS
    : ['Material','Mão de Obra','Logística','Mobilidade','Alimentação','Serviços',
       'Comunicação Visual','Imposto','Dívida Anterior','Aporte','Receita de Job',
       'Receita Particular (Pondé)','Retirada Particular (Pondé)','Outros'];

  /* estado do módulo (persiste entre redraws da mesma sessão de tela) */
  var ST={ lancs:null, exRows:null, res:null, fileName:'' };

  /* ── helpers ── */
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function norm(s){ return String(s==null?'':s).toLowerCase()
      .replace(/[àáâãä]/g,'a').replace(/[éèêë]/g,'e').replace(/[íìîï]/g,'i')
      .replace(/[óòôõö]/g,'o').replace(/[úùûü]/g,'u').replace(/ç/g,'c').trim(); }
  function isTreino(x){ return (x||'').indexOf('TREINO')>=0; }
  function num(x){ var n=parseFloat(String(x==null?'':x).trim()); return isNaN(n)?0:n; }
  function r2(n){ return Math.round(n*100)/100; }
  function brToISO(d){ var p=String(d).split('/'); return p.length===3?(p[2]+'-'+p[1]+'-'+p[0]):d; }
  function isoDstr(d){ if(!d)return '—'; var p=String(d).split('T')[0].split('-'); return p.length===3?(p[2]+'/'+p[1]+'/'+p[0]):d; }
  function toTS(iso){ var p=String(iso).split('T')[0].split('-'); return Date.UTC(+p[0],+p[1]-1,+p[2]); }
  function dayDiff(a,b){ return Math.abs(toTS(a)-toTS(b))/86400000; }
  function sgn(v){ return v>0?'+':(v<0?'\u2212':''); }

  function kpi(lbl,val,sub,cor){
    return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px">'
      +'<div style="font-size:10.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut)">'+lbl+'</div>'
      +'<div style="font-family:var(--font-d);font-size:21px;font-weight:800;margin:6px 0 3px;color:'+cor+'">'+val+'</div>'
      +'<div style="font-size:11.5px;color:var(--mut)">'+sub+'</div></div>';
  }
  function card(tit,body,foot){
    return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:18px;margin-bottom:14px">'
      +'<div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut);margin-bottom:12px">'+tit+'</div>'
      +body+(foot?'<div style="margin-top:10px;font-size:11.5px;color:var(--mut)">'+foot+'</div>':'')+'</div>';
  }

  /* ── parse do extrato C6 (UTF-8 c/ BOM, vírgula, ponto decimal, DD/MM/AAAA) ── */
  function parseC6(text){
    text=String(text).replace(/^\uFEFF/,'');
    var lines=text.split(/\r\n|\n|\r/);
    var start=-1, i, j;
    for(i=0;i<lines.length;i++){ if(lines[i].indexOf('Data Lançamento')===0){ start=i+1; break; } }
    if(start<0) return { ok:false, msg:'Cabeçalho do extrato C6 não encontrado (linha que começa com "Data Lançamento"). Esse é mesmo o CSV do C6?', rows:[] };
    var rows=[];
    for(j=start;j<lines.length;j++){
      var ln=lines[j]; if(!ln||!ln.replace(/\s/g,'')) continue;
      var f=ln.split(',');
      if(f.length<7) continue;
      var dataLanc=f[0].replace(/\s/g,'');
      if(!/^\d{2}\/\d{2}\/\d{4}$/.test(dataLanc)) continue;
      /* colunas fixas nas pontas: [0]Data Lanç [1]Data Contábil ... [-3]Entrada [-2]Saída [-1]Saldo.
         Título/Descrição ficam no meio; se algum tiver vírgula, o meio é rejuntado. */
      var titulo=f.slice(2, f.length-3).join(',').replace(/^\s+|\s+$/g,'');
      var entrada=num(f[f.length-3]);
      var saida=num(f[f.length-2]);
      rows.push({ data:brToISO(dataLanc), titulo:titulo, entrada:entrada, saida:saida, signed:r2(entrada-saida) });
    }
    return { ok:true, rows:rows };
  }

  /* ── cruzamento ── */
  function reconcile(exRows, lancs){
    var lc=[], ex=[], i, k;
    for(i=0;i<lancs.length;i++){
      var l=lancs[i];
      if(!l.conciliado) continue;
      if(isTreino(l.orcamento_numero)) continue;
      var t=norm(l.tipo_lancamento), v=num(l.valor);
      lc.push({ id:l.id, data:String(l.data).split('T')[0], signed:r2(t==='entrada'?v:-v),
                categoria:l.categoria, descricao:l.descricao, m:false });
    }
    for(k=0;k<exRows.length;k++) ex.push({ data:exRows[k].data, signed:exRows[k].signed, titulo:exRows[k].titulo, m:false });
    var totE=0, totS=0;
    for(k=0;k<ex.length;k++) totE+=ex[k].signed;
    for(i=0;i<lc.length;i++) totS+=lc[i].signed;
    /* casamento guloso: p/ cada linha do extrato, o lançamento não-casado de
       mesmo valor+sentido mais próximo na data (dentro da janela) */
    for(k=0;k<ex.length;k++){
      var best=-1, bd=1e9;
      for(i=0;i<lc.length;i++){
        if(lc[i].m) continue;
        if(Math.abs(lc[i].signed-ex[k].signed)<0.005){
          var dd=dayDiff(lc[i].data, ex[k].data);
          if(dd<=JANELA && dd<bd){ best=i; bd=dd; }
        }
      }
      if(best>=0){ ex[k].m=true; lc[best].m=true; }
    }
    var soBanco=[], soSist=[], nMatch=0;
    for(k=0;k<ex.length;k++){ if(ex[k].m) nMatch++; else soBanco.push(ex[k]); }
    for(i=0;i<lc.length;i++){ if(!lc[i].m) soSist.push(lc[i]); }
    return { soBanco:soBanco, soSist:soSist, nMatch:nMatch,
             totExtrato:r2(totE), totSistema:r2(totS), gap:r2(totS-totE) };
  }

  /* ── palpite de categoria p/ os itens só-no-banco ── */
  function guessCat(titulo){
    var s=norm(titulo);
    if(s.indexOf('uber')>=0||s.indexOf('99app')>=0||s.indexOf(' 99 ')>=0) return 'Mobilidade';
    if(s.indexOf('estapar')>=0||s.indexOf('estacion')>=0) return 'Logística';
    if(s.indexOf('ifood')>=0) return 'Alimentação';
    if(s.indexOf('darf')>=0||s.indexOf('tributos')>=0||s.indexOf('simples')>=0) return 'Imposto';
    if(s.indexOf('pm rio')>=0||s.indexOf('receita federal')>=0||s.indexOf('prefeitura')>=0) return 'Dívida Anterior';
    if(s.indexOf('darcy')>=0) return 'Serviços';
    if(s.indexOf('pix recebido')>=0||s.indexOf('recebimento de ted')>=0) return 'Receita de Job';
    return 'Outros';
  }
  function catSelect(idx, def){
    var h='<select data-i="'+idx+'" class="cc-cat" style="font-size:11px;padding:2px 5px;background:var(--panel);color:inherit;border:1px solid var(--line);border-radius:4px;max-width:150px">';
    for(var i=0;i<CATS.length;i++){ h+='<option value="'+esc(CATS[i])+'"'+(CATS[i]===def?' selected':'')+'>'+esc(CATS[i])+'</option>'; }
    return h+'</select>';
  }

  /* ── leitura dos lançamentos ── */
  function fetchLancs(){
    if(ST.lancs) return Promise.resolve(ST.lancs);
    return SS20.sb('lancamentos?select=id,data,valor,tipo_lancamento,categoria,subcategoria,descricao,fornecedor,conciliado,orcamento_numero&deletado_em=is.null&order=data.asc')
      .then(function(rows){ ST.lancs=rows||[]; return ST.lancs; });
  }

  /* ── desenho ── */
  function draw(c){
    var h='<div class="ss-view"><div class="ss-head">'
      +'<h1>Conciliação bancária</h1>'
      +'<div style="font-size:12px;color:var(--mut)">Extrato C6 &times; lançamentos conciliados</div></div>';

    /* zona de upload */
    h+=card('1 · Extrato do C6 (CSV)',
      '<label style="display:inline-block;cursor:pointer;background:var(--panel);border:1px dashed var(--line);border-radius:var(--radius);padding:14px 18px;font-size:12.5px">'
      +'<input type="file" id="cc-file" accept=".csv,text/csv" style="display:none">'
      +'📄 '+(ST.fileName?('<b>'+esc(ST.fileName)+'</b> — trocar arquivo'):'Escolher o CSV do extrato C6')+'</label>'
      +(ST.lancs?'':'<span style="margin-left:10px;font-size:11.5px;color:var(--mut)">carregando lançamentos…</span>'),
      'O CSV é o que você baixa direto do app/internet banking do C6. Nada sai do seu navegador.');

    if(ST.res){
      var R=ST.res;
      var gcor=Math.abs(R.gap)<0.005?'var(--ok)':'var(--danger)';
      h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:14px">'
        +kpi('Extrato (net)', fmt(R.totExtrato), (ST.exRows.length)+' linhas', 'inherit')
        +kpi('Sistema conciliado', fmt(R.totSistema), R.nMatch+' casados', 'inherit')
        +kpi('Diferença', (R.gap>=0?'+':'')+fmt(R.gap), Math.abs(R.gap)<0.005?'fecha no zero ✓':'falta acertar', gcor)
        +'</div>';

      /* SÓ NO BANCO — falta lançar */
      var sb=R.soBanco, sbBody;
      if(!sb.length){ sbBody='<div style="color:var(--ok);font-size:12.5px">Tudo que está no extrato já tem lançamento. ✓</div>'; }
      else{
        var rowsH='';
        for(var a=0;a<sb.length;a++){
          var x=sb[a], ent=x.signed>0;
          rowsH+='<tr>'
            +'<td><input type="checkbox" class="cc-chk" data-i="'+a+'" checked></td>'
            +'<td>'+isoDstr(x.data)+'</td>'
            +'<td style="font-size:11px;color:var(--mut)">'+esc((x.titulo||'').slice(0,46))+'</td>'
            +'<td>'+catSelect(a, guessCat(x.titulo))+'</td>'
            +'<td style="text-align:right;font-weight:600;color:'+(ent?'var(--ok)':'var(--danger)')+'">'+sgn(x.signed)+fmt(Math.abs(x.signed))+'</td>'
            +'</tr>';
        }
        sbBody='<table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr>'
          +'<th style="width:26px"></th>'
          +'<th style="text-align:left;padding:4px 6px;font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:var(--mut);border-bottom:1px solid var(--line)">Data</th>'
          +'<th style="text-align:left;padding:4px 6px;font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:var(--mut);border-bottom:1px solid var(--line)">Descrição (extrato)</th>'
          +'<th style="text-align:left;padding:4px 6px;font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:var(--mut);border-bottom:1px solid var(--line)">Categoria</th>'
          +'<th style="text-align:right;padding:4px 6px;font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:var(--mut);border-bottom:1px solid var(--line)">Valor</th>'
          +'</tr></thead><tbody>'+rowsH+'</tbody></table>'
          +'<div style="margin-top:12px"><button data-action="concil-lancar" style="background:var(--danger);color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:12.5px;font-weight:600;cursor:pointer">Lançar selecionados como conciliados</button>'
          +'<span id="cc-msg" style="margin-left:12px;font-size:11.5px;color:var(--mut)"></span></div>';
      }
      h+=card('2 · Só no banco — falta lançar ('+sb.length+')', sbBody,
        'Entram como lançamentos já conciliados, vínculo <b>SEM-JOB</b>. Reveja categoria antes de lançar; itens de material/insumo, reatribua ao job depois no Lançamentos.');

      /* SÓ NO SISTEMA — conciliado sem lastro */
      var ss=R.soSist, ssBody;
      if(!ss.length){ ssBody='<div style="color:var(--ok);font-size:12.5px">Nenhum lançamento conciliado sem correspondência no extrato. ✓</div>'; }
      else{
        var rH='';
        for(var b=0;b<ss.length;b++){
          var y=ss[b];
          rH+='<tr><td style="font-size:11px;color:var(--mut)">id'+esc(y.id)+'</td><td>'+isoDstr(y.data)+'</td>'
            +'<td style="font-size:11px">'+esc(y.categoria||'—')+'</td>'
            +'<td style="font-size:11px;color:var(--mut)">'+esc((y.descricao||'').slice(0,40))+'</td>'
            +'<td style="text-align:right;font-weight:600;color:'+(y.signed>0?'var(--ok)':'var(--danger)')+'">'+sgn(y.signed)+fmt(Math.abs(y.signed))+'</td></tr>';
        }
        ssBody='<table style="width:100%;border-collapse:collapse;font-size:12.5px"><tbody>'+rH+'</tbody></table>';
      }
      h+=card('3 · Só no sistema — conciliado sem lastro ('+ss.length+')', ssBody,
        'Marcados conciliado=true mas sem linha no extrato. Costuma ser lançamento particular, duplicado ou pago por fora — revise um a um no Lançamentos.');
    }

    h+='</div>';
    c.innerHTML=h;
  }

  /* ── ação: lançar os selecionados ── */
  function lancar(c){
    if(!ST.res) return;
    var chks=c.querySelectorAll('.cc-chk'), sels=c.querySelectorAll('.cc-cat');
    var catBy={}, i;
    for(i=0;i<sels.length;i++) catBy[sels[i].getAttribute('data-i')]=sels[i].value;
    var body=[];
    for(i=0;i<chks.length;i++){
      if(!chks[i].checked) continue;
      var idx=chks[i].getAttribute('data-i'), x=ST.res.soBanco[+idx];
      if(!x) continue;
      body.push({
        orcamento_numero:'SEM-JOB', data:x.data,
        categoria:catBy[idx]||'Outros',
        descricao:x.titulo, fornecedor:x.titulo,
        valor:Math.abs(x.signed),
        tipo_lancamento:(x.signed>0?'entrada':'saida'),
        conciliado:true, data_conciliacao:x.data, tem_nota:false
      });
    }
    var msg=document.getElementById('cc-msg');
    if(!body.length){ if(msg)msg.textContent='Nada selecionado.'; return; }
    if(!window.confirm('Lançar '+body.length+' lançamento(s) já conciliado(s)? Isso escreve no banco de dados.')) return;
    if(msg){ msg.textContent='Lançando '+body.length+'…'; }
    SS20.sbw('lancamentos','POST',body).then(function(){
      ST.lancs=null;            /* força releitura */
      return fetchLancs();
    }).then(function(lancs){
      ST.res=reconcile(ST.exRows, lancs);   /* recruza contra o mesmo extrato */
      draw(c);
    }).catch(function(e){
      if(msg) msg.textContent='Erro ao lançar: '+e.message; else alert('Erro: '+e.message);
    });
  }

  /* ── entrada do módulo ── */
  function render(c){
    fetchLancs().then(function(){ draw(c); })
      .catch(function(e){ c.innerHTML='<div class="err-view">Erro ao carregar lançamentos: '+esc(e.message)+'</div>'; });

    if(!SS20._concilBound){
      SS20._concilBound=true;
      c.addEventListener('change',function(ev){
        var t=ev.target; if(!t)return;
        if(t.id==='cc-file'){
          var f=t.files&&t.files[0]; if(!f)return;
          ST.fileName=f.name;
          var rd=new FileReader();
          rd.onload=function(){
            var pr=parseC6(rd.result);
            if(!pr.ok){ alert(pr.msg); return; }
            fetchLancs().then(function(lancs){
              ST.exRows=pr.rows;
              ST.res=reconcile(pr.rows, lancs);
              draw(c);
            });
          };
          rd.readAsText(f,'UTF-8');
        }
      });
      c.addEventListener('click',function(ev){
        var t=ev.target; if(!t||!t.getAttribute)return;
        var a=t.getAttribute('data-action');
        if(a==='concil-lancar') lancar(c);
      });
    }
  }

  SS20.modules.concil={ render:render, _test:{ parseC6:parseC6, reconcile:reconcile, guessCat:guessCat } };
})();
