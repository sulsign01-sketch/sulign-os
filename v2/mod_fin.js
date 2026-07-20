/* ═══════════════════════════════════════════════════════════════
   SULSIGN OS 2.0 — MÓDULO: FINANCEIRO (fin)
   Painel (leitura) + Contas a Pagar (CRUD — Fase A).
   Escrita via SS20.sbw. Soft-delete por deletado_em.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  var fmt=SulSignCore.fmt;
  var CONT=null;
  var fst={tab:'painel', filtro:'aberto', editId:null, formOpen:false, busy:false, msg:''};

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function isTreino(x){ return (x||'').indexOf('TREINO')>=0; }
  function dstr(d){
    if(!d)return '—';
    var p=String(d).split('T')[0].split('-');
    return p.length===3?(p[2]+'/'+p[1]+'/'+p[0]):d;
  }
  function val(x){ return parseFloat(x)||0; }
  function parseMoney(s){
    s=String(s==null?'':s).trim();
    if(s.indexOf(',')>=0) s=s.replace(/\./g,'').replace(',','.');
    var n=parseFloat(s); return isNaN(n)?0:n;
  }
  function hojeISO(){
    var d=new Date(); d.setHours(0,0,0,0);
    return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
  }

  function fetchAll(){
    if(SS20.cache.fin) return Promise.resolve(SS20.cache.fin);
    return Promise.all([
      SS20.sb('contas_pagar?select=*&order=vencimento.asc&deletado_em=is.null'),
      SS20.sb('contas_receber?select=*&order=vencimento.asc&deletado_em=is.null'),
      SS20.sb('despesas_fixas?select=*&order=data.desc&deletado_em=is.null'),
      SS20.sb('orcamentos?select=numero,cliente,projeto,bdi,grupos,status,valor_nf,data_nf,nf_numero,sinal_recebido,saldo_recebido&order=numero.desc')
    ]).then(function(r){
      var data={
        pagar:r[0].filter(function(x){return !isTreino(x.orcamento_numero);}),
        receber:r[1].filter(function(x){return !isTreino(x.orcamento_numero);}),
        fixas:r[2],
        orcs:r[3].filter(function(x){return !isTreino(x.numero);})
      };
      SS20.cache.fin=data;
      return data;
    });
  }

  function render(c){
    CONT=c;
    c.innerHTML='<div style="padding:24px 26px;color:var(--mut);font-size:13px">Carregando…</div>';
    fetchAll().then(function(d){ draw(c,d); })
    .catch(function(e){ c.innerHTML='<div class="err-view">Erro ao carregar financeiro: '+esc(e.message)+'</div>'; });
  }

  function refresh(){
    SS20.cache.fin=null;
    fetchAll().then(function(d){ draw(CONT,d); })
    .catch(function(e){ fst.busy=false; fst.msg='Erro: '+e.message; if(CONT&&SS20.cache.fin===null){} draw(CONT, SS20.cache.fin||{pagar:[],receber:[],fixas:[],orcs:[]}); });
  }

  function draw(c,d){
    var h='<div style="padding:24px 26px">';
    h+='<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:16px">';
    h+='<h2 style="font-family:var(--font-d);font-size:19px">Financeiro</h2>';
    h+='<span style="flex:1"></span>';
    h+='<div style="display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;font-size:12.5px">';
    h+=tabBtn('painel','Painel');
    h+=tabBtn('cp','Contas a Pagar');
    h+='</div></div>';
    if(fst.tab==='cp') h+=drawCP(d);
    else h+=drawPainel(d);
    h+='</div>';
    c.innerHTML=h;
    if(fst.tab==='painel'){
      /* nada de listeners extras; delegação global cuida do resto */
    }
  }

  function tabBtn(id,lbl){
    var on=fst.tab===id;
    return '<button data-action="fin-tab" data-tab="'+id+'" style="padding:7px 16px;border:none;cursor:pointer;font-family:inherit;font-size:12.5px;'
      +(on?'background:var(--accent);color:#fff;font-weight:700':'background:var(--panel);color:var(--mut)')+'">'+lbl+'</button>';
  }

  /* ═══════════ PAINEL (leitura) ═══════════ */
  function drawPainel(d){
    var hoje=new Date(); hoje.setHours(0,0,0,0);
    var em30=new Date(hoje); em30.setDate(em30.getDate()+30);

    var entradas=[];
    d.orcs.forEach(function(o){
      if(['Aprovado','Em Produção'].indexOf(o.status||'')<0)return;
      var v=(o.valor_nf&&val(o.valor_nf)>0)?val(o.valor_nf):SulSignCore.calcOrcamento(o).venda;
      entradas.push({lbl:o.numero+' — '+(o.cliente||''),v:v});
    });
    var totEnt=entradas.reduce(function(a,b){return a+b.v;},0);

    var saidasFixas=d.fixas.filter(function(f){
      if(f.tipo==='Receita')return false;
      if(f.status!=='Pendente')return false;
      if(!f.data)return true;
      var dt=new Date(f.data+'T00:00:00');
      return dt>=hoje&&dt<=em30;
    });
    var totFix=saidasFixas.reduce(function(a,b){return a+val(b.valor);},0);

    var pagarPend=d.pagar.filter(function(x){return (x.status||'Pendente')!=='Pago';});
    var totPagar=pagarPend.reduce(function(a,b){return a+val(b.valor);},0);
    var receberPend=d.receber.filter(function(x){return (x.status||'Pendente')!=='Pago';});
    var totReceber=receberPend.reduce(function(a,b){return a+val(b.valor);},0);
    var saldoPrev=totEnt+totReceber-totFix-totPagar;

    var nfs=d.orcs.filter(function(o){return o.data_nf;});
    var totNF=nfs.reduce(function(a,b){return a+val(b.valor_nf);},0);

    var h='';
    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:22px">';
    h+=kpi('Entradas previstas',fmt(totEnt),entradas.length+' jobs aprovados/produção','var(--ok)');
    h+=kpi('A receber',fmt(totReceber),receberPend.length+' títulos pendentes','var(--blue)');
    h+=kpi('A pagar + fixas 30d',fmt(totPagar+totFix),pagarPend.length+' contas · '+saidasFixas.length+' fixas','var(--warn)');
    h+=kpi('Saldo projetado 30d',fmt(saldoPrev),'entradas + receber − saídas',saldoPrev>=0?'var(--ok)':'var(--danger)');
    h+='</div>';

    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px">';
    h+=card('Contas a pagar (pendentes)', tbl(pagarPend.slice(0,12),function(x){
      var venc=x.vencimento?new Date(x.vencimento+'T00:00:00'):null;
      var late=venc&&venc<hoje;
      return '<tr><td style="'+(late?'color:var(--danger);font-weight:600':'')+'">'+dstr(x.vencimento)+'</td>'
        +'<td>'+esc(x.favorecido||x.descricao||'—')+'</td>'
        +'<td style="font-size:10.5px;color:var(--mut)">'+esc(x.orcamento_numero&&x.orcamento_numero!=='SEM-JOB'?x.orcamento_numero:'')+'</td>'
        +'<td style="text-align:right;font-weight:600">'+fmt(val(x.valor))+'</td></tr>';
    },['Venc.','Fornecedor','Job','Valor']), pagarPend.length>12?('<a href="#" data-action="fin-tab" data-tab="cp" style="color:var(--accent);font-weight:600">ver todas ('+pagarPend.length+') e gerenciar →</a>'):'<a href="#" data-action="fin-tab" data-tab="cp" style="color:var(--accent);font-weight:600">gerenciar →</a>');

    h+=card('Contas a receber (pendentes)', tbl(receberPend.slice(0,12),function(x){
      return '<tr><td>'+dstr(x.vencimento)+'</td>'
        +'<td>'+esc(x.cliente||x.descricao||'—')+'</td>'
        +'<td style="font-size:10.5px;color:var(--mut)">'+esc(x.orcamento_numero&&x.orcamento_numero!=='SEM-JOB'?x.orcamento_numero:'')+'</td>'
        +'<td style="text-align:right;font-weight:600;color:var(--ok)">'+fmt(val(x.valor))+'</td></tr>';
    },['Venc.','Cliente','Job','Valor']), receberPend.length>12?('+ '+(receberPend.length-12)+' na lista completa'):'');

    h+=card('Despesas fixas pendentes (30d)', tbl(saidasFixas.slice(0,12),function(x){
      return '<tr><td>'+dstr(x.data)+'</td><td>'+esc(x.descricao||x.nome||'—')+'</td>'
        +'<td style="text-align:right;font-weight:600">'+fmt(val(x.valor))+'</td></tr>';
    },['Data','Descrição','Valor']), 'Total: '+fmt(totFix));

    h+=card('Faturamento (NFs emitidas)', tbl(nfs.slice(-12).reverse(),function(o){
      return '<tr><td>'+dstr(o.data_nf)+'</td><td style="font-size:10.5px">'+esc(o.numero)+'</td>'
        +'<td>'+esc(o.cliente||'—')+'</td><td style="text-align:right;font-weight:600">'+fmt(val(o.valor_nf))+'</td></tr>';
    },['Data NF','Job','Cliente','Valor']), 'Total faturado: '+fmt(totNF));
    h+='</div>';
    return h;
  }

  /* ═══════════ CONTAS A PAGAR (CRUD) ═══════════ */
  function drawCP(d){
    var hoje=hojeISO();
    var todas=d.pagar;
    function ehPago(x){ return (x.status||'Pendente')==='Pago'; }
    function ehVencida(x){ return !ehPago(x) && x.vencimento && x.vencimento<hoje; }

    var filt=todas.filter(function(x){
      if(fst.filtro==='aberto') return !ehPago(x);
      if(fst.filtro==='vencidas') return ehVencida(x);
      if(fst.filtro==='pagas') return ehPago(x);
      return true; /* todas */
    });

    var totAberto=todas.filter(function(x){return !ehPago(x);}).reduce(function(a,b){return a+val(b.valor);},0);
    var totVenc=todas.filter(ehVencida).reduce(function(a,b){return a+val(b.valor);},0);
    var totFiltro=filt.reduce(function(a,b){return a+val(b.valor);},0);

    var h='';
    /* KPIs */
    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:18px">';
    h+=kpi('Em aberto',fmt(totAberto),todas.filter(function(x){return !ehPago(x);}).length+' contas','var(--warn)');
    h+=kpi('Vencidas',fmt(totVenc),todas.filter(ehVencida).length+' contas','var(--danger)');
    h+=kpi('No filtro atual',fmt(totFiltro),filt.length+' contas','var(--ink)');
    h+='</div>';

    /* barra de ações: filtros + nova */
    h+='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px">';
    ['aberto','vencidas','pagas','todas'].forEach(function(f){
      var on=fst.filtro===f;
      var lbl={aberto:'Em aberto',vencidas:'Vencidas',pagas:'Pagas',todas:'Todas'}[f];
      h+='<button data-action="fin-filtro" data-filtro="'+f+'" style="padding:6px 14px;border:1px solid '+(on?'var(--accent)':'var(--line)')+';border-radius:20px;cursor:pointer;font-family:inherit;font-size:12px;'
        +(on?'background:var(--accent);color:#fff;font-weight:700':'background:var(--panel);color:var(--mut)')+'">'+lbl+'</button>';
    });
    h+='<span style="flex:1"></span>';
    h+='<button data-action="fin-novo" style="padding:8px 16px;border:1px solid var(--accent);border-radius:8px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;background:var(--accent);color:#fff">＋ Nova conta</button>';
    h+='</div>';

    if(fst.msg) h+='<div style="margin-bottom:12px;font-size:12.5px;color:'+(fst.msg.indexOf('Erro')===0?'var(--danger)':'var(--ok)')+'">'+esc(fst.msg)+'</div>';

    /* formulário (criar/editar) */
    if(fst.formOpen) h+=formHTML(d);

    /* lista agrupada por fornecedor */
    if(!filt.length){
      h+='<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:24px;text-align:center;color:var(--mut);font-size:13px">Nenhuma conta neste filtro.</div>';
      return h;
    }
    var grupos={}, ordem=[];
    filt.forEach(function(x){
      var forn=x.favorecido||'(sem fornecedor)';
      if(!grupos[forn]){ grupos[forn]=[]; ordem.push(forn); }
      grupos[forn].push(x);
    });
    ordem.sort(function(a,b){
      var sa=grupos[a].reduce(function(p,q){return p+val(q.valor);},0);
      var sb=grupos[b].reduce(function(p,q){return p+val(q.valor);},0);
      return sb-sa;
    });

    h+='<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden">';
    ordem.forEach(function(forn){
      var lista=grupos[forn].slice().sort(function(a,b){return (a.vencimento||'').localeCompare(b.vencimento||'');});
      var sub=lista.reduce(function(p,q){return p+val(q.valor);},0);
      h+='<div style="padding:10px 16px;background:var(--paper);border-bottom:1px solid var(--line);display:flex;justify-content:space-between;font-size:12px;font-weight:700">'
        +'<span>'+esc(forn)+' <span style="color:var(--mut);font-weight:400">· '+lista.length+'</span></span>'
        +'<span>'+fmt(sub)+'</span></div>';
      lista.forEach(function(x){
        var pago=(x.status||'Pendente')==='Pago';
        var venc=x.vencimento||'';
        var late=!pago && venc && venc<hoje;
        h+='<div style="padding:11px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:12.5px'+(pago?';opacity:.6':'')+'">';
        h+='<span style="min-width:78px;'+(late?'color:var(--danger);font-weight:700':'color:var(--mut)')+'">'+dstr(venc)+(late?' ⚠':'')+'</span>';
        h+='<span style="flex:1;min-width:140px">'+esc(x.descricao||'—')
          +(x.orcamento_numero&&x.orcamento_numero!=='SEM-JOB'?' <span style="font-size:10.5px;color:var(--mut)">· '+esc(x.orcamento_numero)+'</span>':'')
          +(pago?' <span style="font-size:10px;color:var(--ok);font-weight:700">✓ PAGO</span>':'')+'</span>';
        h+='<span style="font-weight:700;min-width:96px;text-align:right">'+fmt(val(x.valor))+'</span>';
        h+='<span style="display:inline-flex;gap:6px">';
        if(!pago) h+='<button data-action="fin-baixa" data-id="'+x.id+'" title="Dar baixa" style="padding:4px 10px;border:1px solid var(--ok);border-radius:6px;background:none;color:var(--ok);cursor:pointer;font-size:11.5px;font-weight:700">Baixar</button>';
        else h+='<button data-action="fin-reabrir" data-id="'+x.id+'" title="Reabrir" style="padding:4px 10px;border:1px solid var(--line);border-radius:6px;background:none;color:var(--mut);cursor:pointer;font-size:11.5px">Reabrir</button>';
        h+='<button data-action="fin-editar" data-id="'+x.id+'" title="Editar" style="padding:4px 9px;border:1px solid var(--line);border-radius:6px;background:none;color:inherit;cursor:pointer;font-size:11.5px">✎</button>';
        h+='<button data-action="fin-excluir" data-id="'+x.id+'" title="Excluir" style="padding:4px 9px;border:1px solid var(--line);border-radius:6px;background:none;color:var(--danger);cursor:pointer;font-size:11.5px">🗑</button>';
        h+='</span></div>';
      });
    });
    h+='</div>';
    return h;
  }

  function formHTML(d){
    var ed=null,i;
    if(fst.editId!=null){ for(i=0;i<d.pagar.length;i++){ if(String(d.pagar[i].id)===String(fst.editId)){ ed=d.pagar[i]; break; } } }
    var jobs=d.orcs.map(function(o){ return '<option value="'+esc(o.numero)+'">'+esc(o.numero)+' — '+esc(o.cliente||'')+'</option>'; }).join('');
    function ip(id,ph,v,type,extra){
      return '<input id="'+id+'" type="'+(type||'text')+'" placeholder="'+ph+'" value="'+esc(v==null?'':v)+'" '+(extra||'')
        +' style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:inherit;font-size:13px;font-family:inherit;box-sizing:border-box">';
    }
    var h='<div style="background:var(--panel);border:1px solid var(--accent);border-radius:var(--radius);padding:18px;margin-bottom:16px">';
    h+='<div style="font-size:12px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--mut);margin-bottom:14px">'+(ed?'Editar conta':'Nova conta a pagar')+'</div>';
    h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';
    h+='<div style="grid-column:1/-1"><label style="font-size:11px;color:var(--mut);display:block;margin-bottom:4px">Fornecedor / favorecido</label>'+ip('cp-forn','Ex: Forte Ferro',ed?ed.favorecido:'')+'</div>';
    h+='<div style="grid-column:1/-1"><label style="font-size:11px;color:var(--mut);display:block;margin-bottom:4px">Descrição</label>'+ip('cp-desc','Ex: Metalon 20x20 — pedido 0342',ed?ed.descricao:'')+'</div>';
    h+='<div><label style="font-size:11px;color:var(--mut);display:block;margin-bottom:4px">Vencimento</label>'+ip('cp-venc','',ed?(ed.vencimento||'').slice(0,10):hojeISO(),'date')+'</div>';
    h+='<div><label style="font-size:11px;color:var(--mut);display:block;margin-bottom:4px">Valor (R$)</label>'+ip('cp-valor','0,00',ed?String(val(ed.valor)).replace('.',','):'','text','inputmode="decimal"')+'</div>';
    h+='<div style="grid-column:1/-1"><label style="font-size:11px;color:var(--mut);display:block;margin-bottom:4px">Job (opcional)</label>'
      +'<input id="cp-job" list="cp-joblist" placeholder="SEM-JOB ou nº do orçamento" value="'+esc(ed&&ed.orcamento_numero&&ed.orcamento_numero!=='SEM-JOB'?ed.orcamento_numero:'')+'" style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:inherit;font-size:13px;font-family:inherit;box-sizing:border-box">'
      +'<datalist id="cp-joblist">'+jobs+'</datalist></div>';
    h+='</div>';
    h+='<div style="display:flex;gap:8px;margin-top:16px">';
    h+='<button data-action="fin-salvar" style="padding:9px 20px;border:1px solid var(--accent);border-radius:8px;background:var(--accent);color:#fff;font-weight:700;cursor:pointer;font-family:inherit;font-size:13px"'+(fst.busy?' disabled':'')+'>'+(fst.busy?'Salvando…':(ed?'Salvar alterações':'Criar conta'))+'</button>';
    h+='<button data-action="fin-cancelar" style="padding:9px 20px;border:1px solid var(--line);border-radius:8px;background:none;color:var(--mut);cursor:pointer;font-family:inherit;font-size:13px">Cancelar</button>';
    h+='</div></div>';
    return h;
  }

  /* ── escrita ── */
  function coletaForm(){
    function g(id){ var e=document.getElementById(id); return e?e.value:''; }
    var forn=g('cp-forn').trim();
    var valor=parseMoney(g('cp-valor'));
    if(!forn){ fst.msg='Erro: informe o fornecedor.'; draw(CONT,SS20.cache.fin); return null; }
    if(valor<=0){ fst.msg='Erro: valor deve ser maior que zero.'; draw(CONT,SS20.cache.fin); return null; }
    var job=g('cp-job').trim();
    return {
      favorecido:forn,
      descricao:g('cp-desc').trim()||null,
      vencimento:g('cp-venc')||null,
      valor:valor,
      orcamento_numero:job||'SEM-JOB',
      status:'Pendente'
    };
  }

  function salvar(){
    if(fst.busy)return;
    var body=coletaForm();
    if(!body)return;
    fst.busy=true; fst.msg=''; draw(CONT,SS20.cache.fin);
    var p;
    if(fst.editId!=null){
      /* editar não mexe em status/pagamento */
      var patch={favorecido:body.favorecido,descricao:body.descricao,vencimento:body.vencimento,valor:body.valor,orcamento_numero:body.orcamento_numero};
      p=SS20.sbw('contas_pagar?id=eq.'+encodeURIComponent(fst.editId),'PATCH',patch);
    }else{
      p=SS20.sbw('contas_pagar','POST',body);
    }
    p.then(function(){
      fst.busy=false; fst.formOpen=false; var ed=fst.editId!=null; fst.editId=null;
      fst.msg=ed?'✓ Conta atualizada.':'✓ Conta criada.';
      refresh();
    }).catch(function(e){ fst.busy=false; fst.msg='Erro ao salvar: '+e.message; draw(CONT,SS20.cache.fin); });
  }

  function mudaStatus(id,pago){
    fst.msg=''; 
    SS20.sbw('contas_pagar?id=eq.'+encodeURIComponent(id),'PATCH',{status:pago?'Pago':'Pendente'})
    .then(function(){ fst.msg=pago?'✓ Baixa registrada.':'✓ Conta reaberta.'; refresh(); })
    .catch(function(e){ fst.msg='Erro: '+e.message; draw(CONT,SS20.cache.fin); });
  }

  function excluir(id){
    if(!window.confirm('Excluir esta conta a pagar? (soft-delete — sai da lista, mas fica no histórico)'))return;
    fst.msg='';
    SS20.sbw('contas_pagar?id=eq.'+encodeURIComponent(id),'PATCH',{deletado_em:new Date().toISOString()})
    .then(function(){ fst.msg='✓ Conta excluída.'; refresh(); })
    .catch(function(e){ fst.msg='Erro ao excluir: '+e.message; draw(CONT,SS20.cache.fin); });
  }

  /* ── delegação (registrada uma vez) ── */
  if(!window.__finDeleg){
    window.__finDeleg=true;
    document.addEventListener('click', function(e){
      if(fst.tab===undefined) return;
      var el=e.target;
      while(el && el!==document && !(el.getAttribute && el.getAttribute('data-action'))) el=el.parentNode;
      if(!el || el===document) return;
      var act=el.getAttribute('data-action');
      if(act && act.indexOf('fin-')!==0) return;
      if(!CONT) return;
      var id=el.getAttribute('data-id');
      if(act==='fin-tab'){ e.preventDefault(); fst.tab=el.getAttribute('data-tab'); fst.msg=''; fst.formOpen=false; draw(CONT,SS20.cache.fin); }
      else if(act==='fin-filtro'){ fst.filtro=el.getAttribute('data-filtro'); draw(CONT,SS20.cache.fin); }
      else if(act==='fin-novo'){ fst.formOpen=true; fst.editId=null; fst.msg=''; draw(CONT,SS20.cache.fin); }
      else if(act==='fin-editar'){ fst.formOpen=true; fst.editId=id; fst.msg=''; draw(CONT,SS20.cache.fin); }
      else if(act==='fin-cancelar'){ fst.formOpen=false; fst.editId=null; draw(CONT,SS20.cache.fin); }
      else if(act==='fin-salvar'){ salvar(); }
      else if(act==='fin-baixa'){ mudaStatus(id,true); }
      else if(act==='fin-reabrir'){ mudaStatus(id,false); }
      else if(act==='fin-excluir'){ excluir(id); }
    });
  }

  /* ── helpers de UI ── */
  function kpi(lbl,v,sub,cor){
    return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px">'
      +'<div style="font-size:10.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut)">'+lbl+'</div>'
      +'<div style="font-family:var(--font-d);font-size:21px;font-weight:800;margin:6px 0 3px;color:'+cor+'">'+v+'</div>'
      +'<div style="font-size:11.5px;color:var(--mut)">'+sub+'</div></div>';
  }
  function card(tit,body,foot){
    return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:18px">'
      +'<div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut);margin-bottom:12px">'+tit+'</div>'
      +body+(foot?'<div style="margin-top:10px;font-size:11.5px;color:var(--mut)">'+foot+'</div>':'')+'</div>';
  }
  function tbl(rows,rowFn,heads){
    if(!rows.length)return '<div style="color:var(--mut);font-size:12px">Nada pendente. ✓</div>';
    var h='<table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr>';
    heads.forEach(function(x,i){
      h+='<th style="text-align:'+(i===heads.length-1?'right':'left')+';padding:4px 6px;font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:var(--mut);border-bottom:1px solid var(--line)">'+x+'</th>';
    });
    h+='</tr></thead><tbody>';
    rows.forEach(function(r){ h+=rowFn(r); });
    h+='</tbody></table><style>tbody td{padding:6px;border-bottom:1px solid var(--line)}</style>';
    return h;
  }

  SS20.modules.fin={render:render};
})();
