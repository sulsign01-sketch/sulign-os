/* ═══ SULSIGN OS 2.0 — MÓDULO: LANÇAMENTOS (lanc)
   Lista, filtros, conciliação individual e em lote, novo, edição e
   exclusão lógica. Substitui a aba Lançamentos do v1. ═══ */
(function(){
  var fmt=SulSignCore.fmt;
  var CATS=SulSignCore.CATEGORIAS||[];
  var _d=null;              /* cache local da lista        */
  var _sel={};              /* ids marcados para lote      */
  var _f={mes:'',tipo:'',conc:'',q:''};
  var _edit=null;           /* registro em edição          */

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function norm(s){
    return String(s==null?'':s).toLowerCase()
      .replace(/[àáâãä]/g,'a').replace(/[éèêë]/g,'e').replace(/[íìîï]/g,'i')
      .replace(/[óòôõö]/g,'o').replace(/[úùûü]/g,'u').replace(/ç/g,'c').trim();
  }
  function isTreino(x){ return (x||'').indexOf('TREINO')>=0; }
  function ent(l){ return norm(l.tipo_lancamento)==='entrada'; }
  function dstr(d){ if(!d)return '—'; var p=String(d).split('T')[0].split('-'); return p.length===3?(p[2]+'/'+p[1]+'/'+p[0]):d; }
  function hoje(){ return new Date().toISOString().slice(0,10); }
  function num(v){ return parseFloat(String(v==null?'':v).replace(/\./g,'').replace(',','.'))||0; }

  function kpi(lbl,val,sub,cor){
    return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:14px 16px">'
      +'<div style="font-size:10.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut)">'+lbl+'</div>'
      +'<div style="font-family:var(--font-d);font-size:19px;font-weight:800;margin:5px 0 2px;color:'+cor+'">'+val+'</div>'
      +'<div style="font-size:11.5px;color:var(--mut)">'+sub+'</div></div>';
  }
  function btn(act,txt,extra){
    return '<button data-action="'+act+'"'+(extra||'')+' style="font-size:11px;padding:5px 12px;background:var(--panel);color:inherit;border:1px solid var(--line);border-radius:6px;cursor:pointer">'+txt+'</button>';
  }
  function inp(id,tipo,val,ph,w){
    return '<input id="'+id+'" type="'+tipo+'" value="'+esc(val==null?'':val)+'" placeholder="'+(ph||'')+'" '
      +'style="width:'+(w||'100%')+';font-size:13px;padding:7px 9px;background:var(--bg,#111);color:inherit;border:1px solid var(--line);border-radius:6px;box-sizing:border-box">';
  }
  function sel(id,ops,val){
    var h='<select id="'+id+'" style="width:100%;font-size:13px;padding:7px 9px;background:var(--bg,#111);color:inherit;border:1px solid var(--line);border-radius:6px;box-sizing:border-box">';
    ops.forEach(function(o){
      var v=(typeof o==='object')?o.v:o, t=(typeof o==='object')?o.t:o;
      h+='<option value="'+esc(v)+'"'+(String(v)===String(val)?' selected':'')+'>'+esc(t)+'</option>';
    });
    return h+'</select>';
  }
  function fld(lbl,ctrl){
    return '<div style="margin-bottom:11px"><div style="font-size:10.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--mut);margin-bottom:4px">'+lbl+'</div>'+ctrl+'</div>';
  }

  function fetchAll(force){
    if(_d&&!force) return Promise.resolve(_d);
    return SS20.sb('lancamentos?select=id,data,valor,tipo_lancamento,categoria,subcategoria,descricao,fornecedor,pessoa,conciliado,data_conciliacao,orcamento_numero,tem_nota&deletado_em=is.null&order=data.desc')
      .then(function(r){
        _d=(r||[]).filter(function(l){ return !isTreino(l.orcamento_numero); });
        return _d;
      });
  }

  function filtrar(){
    var q=norm(_f.q);
    return _d.filter(function(l){
      if(_f.mes && String(l.data||'').slice(0,7)!==_f.mes) return false;
      if(_f.tipo==='entrada' && !ent(l)) return false;
      if(_f.tipo==='saida' && ent(l)) return false;
      if(_f.conc==='sim' && !l.conciliado) return false;
      if(_f.conc==='nao' && l.conciliado) return false;
      if(q){
        var alvo=norm((l.descricao||'')+' '+(l.categoria||'')+' '+(l.fornecedor||'')+' '+(l.orcamento_numero||''));
        if(alvo.indexOf(q)<0) return false;
      }
      return true;
    });
  }

  /* ══ AÇÕES ══ */
  function conciliar(ids,valor,c){
    var body={conciliado:valor,data_conciliacao:valor?hoje():null};
    var ps=ids.map(function(id){ return SS20.sbw('lancamentos?id=eq.'+id,'PATCH',body); });
    return Promise.all(ps).then(function(){
      _d.forEach(function(l){
        if(ids.indexOf(String(l.id))>=0||ids.indexOf(l.id)>=0){ l.conciliado=valor; l.data_conciliacao=body.data_conciliacao; }
      });
      SS20.cache.fluxo=null; SS20.cache.fin=null; SS20.cache.cc=null;
      _sel={}; draw(c);
    });
  }
  function excluir(id,c){
    return SS20.sbw('lancamentos?id=eq.'+id,'PATCH',{deletado_em:new Date().toISOString()})
      .then(function(){
        _d=_d.filter(function(l){ return String(l.id)!==String(id); });
        SS20.cache.fluxo=null; SS20.cache.fin=null; SS20.cache.cc=null;
        draw(c);
      });
  }
  function salvar(c){
    var st=document.getElementById('lc-st');
    var p={
      data:document.getElementById('lc-data').value,
      descricao:document.getElementById('lc-desc').value.trim(),
      valor:num(document.getElementById('lc-valor').value),
      tipo_lancamento:document.getElementById('lc-tipo').value,
      categoria:document.getElementById('lc-cat').value,
      subcategoria:document.getElementById('lc-sub').value.trim(),
      fornecedor:document.getElementById('lc-forn').value.trim(),
      orcamento_numero:document.getElementById('lc-job').value.trim()||'SEM-JOB',
      conciliado:document.getElementById('lc-conc').checked
    };
    if(!p.data||!p.descricao||!p.valor){ st.textContent='✗ Preencha data, descrição e valor.'; st.style.color='var(--danger)'; return; }
    p.data_conciliacao=p.conciliado?hoje():null;
    st.textContent='Salvando...'; st.style.color='var(--mut)';
    var pr;
    if(_edit&&_edit.id){ pr=SS20.sbw('lancamentos?id=eq.'+_edit.id,'PATCH',p); }
    else { p.pessoa='Eduardo Ponde'; p.tem_nota=false; p.periodicidade='unica'; pr=SS20.sbw('lancamentos','POST',p); }
    pr.then(function(){
      SS20.cache.fluxo=null; SS20.cache.fin=null; SS20.cache.cc=null;
      _edit=null;
      return fetchAll(true);
    }).then(function(){ draw(c); })
    .catch(function(e){ st.textContent='✗ '+esc(e.message); st.style.color='var(--danger)'; });
  }

  /* ══ RENDER ══ */
  function render(c){
    fetchAll().then(function(){ draw(c); })
    .catch(function(e){ c.innerHTML='<div class="err-view">Erro ao carregar: '+esc(e.message)+'</div>'; });
    if(SS20._lancBound) return;
    SS20._lancBound=true;

    c.addEventListener('change',function(ev){
      var t=ev.target; if(!t||!t.id)return;
      if(t.id==='lf-mes'){ _f.mes=t.value; _sel={}; draw(c); }
      if(t.id==='lf-tipo'){ _f.tipo=t.value; _sel={}; draw(c); }
      if(t.id==='lf-conc'){ _f.conc=t.value; _sel={}; draw(c); }
      if(t.id==='lf-todos'){
        var mk=t.checked; filtrar().forEach(function(l){ if(mk)_sel[l.id]=true; else delete _sel[l.id]; }); draw(c);
      }
    });
    var _tq=null;
    c.addEventListener('input',function(ev){
      var t=ev.target;
      if(t&&t.id==='lf-q'){
        _f.q=t.value;
        if(_tq) clearTimeout(_tq);
        _tq=setTimeout(function(){
          var pos=t.selectionStart; draw(c);
          var n=document.getElementById('lf-q');
          if(n){ n.focus(); try{ n.setSelectionRange(pos,pos); }catch(e){} }
        },350);
      }
    });
    c.addEventListener('click',function(ev){
      var t=ev.target; if(!t||!t.getAttribute)return;
      var a=t.getAttribute('data-action'), id=t.getAttribute('data-id');
      if(a==='lc-refresh'){ t.textContent='...'; _sel={}; fetchAll(true).then(function(){ draw(c); }); }
      if(a==='lc-pick'){ if(_sel[id])delete _sel[id]; else _sel[id]=true; draw(c); }
      if(a==='lc-toggle'){
        var l=null; _d.forEach(function(x){ if(String(x.id)===String(id)) l=x; });
        if(l){ t.textContent='...'; conciliar([id],!l.conciliado,c).catch(function(e){ alert('Erro: '+e.message); draw(c); }); }
      }
      if(a==='lc-lote'){
        var ids=Object.keys(_sel); if(!ids.length)return;
        var todosConc=ids.every(function(i){ var f=false; _d.forEach(function(x){ if(String(x.id)===String(i)&&x.conciliado)f=true; }); return f; });
        t.textContent='Aplicando...';
        conciliar(ids,!todosConc,c).catch(function(e){ alert('Erro: '+e.message); draw(c); });
      }
      if(a==='lc-novo'){ _edit={}; draw(c); }
      if(a==='lc-edit'){ _d.forEach(function(x){ if(String(x.id)===String(id)) _edit=x; }); draw(c); }
      if(a==='lc-fechar'){ _edit=null; draw(c); }
      if(a==='lc-salvar'){ salvar(c); }
      if(a==='lc-del'){
        if(confirm('Excluir este lançamento? Ele sai do fluxo de caixa e dos relatórios.')){
          t.textContent='...'; excluir(id,c).catch(function(e){ alert('Erro: '+e.message); draw(c); });
        }
      }
    });
  }

  function draw(c){
    var lista=filtrar();
    var eT=0,sT=0,ncQ=0,ncV=0;
    lista.forEach(function(l){
      var v=parseFloat(l.valor)||0;
      if(ent(l))eT+=v; else sT+=v;
      if(!l.conciliado){ ncQ++; ncV+=v; }
    });
    var meses={}; _d.forEach(function(l){ if(l.data)meses[String(l.data).slice(0,7)]=1; });
    var mArr=Object.keys(meses).sort().reverse();
    var nSel=Object.keys(_sel).length;

    var h='<div style="padding:24px 26px">';
    h+='<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:4px;flex-wrap:wrap">';
    h+='<h2 style="font-family:var(--font-d);font-size:19px">Lançamentos</h2>';
    h+='<div style="display:flex;gap:8px">'+btn('lc-novo','+ Novo lançamento')+btn('lc-refresh','&#8635;')+'</div></div>';
    h+='<p style="color:var(--mut);font-size:12.5px;margin-bottom:16px">Conciliar = confirmar que o dinheiro passou no banco. Só o conciliado entra no Fluxo de Caixa.</p>';

    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">';
    h+=kpi('Entradas (filtro)',fmt(eT),lista.length+' registros','var(--ok)');
    h+=kpi('Saídas (filtro)',fmt(sT),'','var(--danger)');
    h+=kpi('Resultado',fmt(eT-sT),'',eT-sT>=0?'var(--ok)':'var(--danger)');
    h+=kpi('Não conciliado',fmt(ncV),ncQ+' fora do fluxo',ncQ?'#f9a825':'var(--ok)');
    h+='</div>';

    /* filtros */
    var mOps=[{v:'',t:'Todos os meses'}]; mArr.forEach(function(m){ mOps.push({v:m,t:m}); });
    h+='<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px">';
    h+='<div style="width:150px">'+sel('lf-mes',mOps,_f.mes)+'</div>';
    h+='<div style="width:130px">'+sel('lf-tipo',[{v:'',t:'Entrada e saída'},{v:'entrada',t:'Só entradas'},{v:'saida',t:'Só saídas'}],_f.tipo)+'</div>';
    h+='<div style="width:160px">'+sel('lf-conc',[{v:'',t:'Conciliado ou não'},{v:'nao',t:'Só NÃO conciliados'},{v:'sim',t:'Só conciliados'}],_f.conc)+'</div>';
    h+='<div style="flex:1;min-width:170px">'+inp('lf-q','text',_f.q,'Buscar descrição, job, fornecedor')+'</div>';
    h+='</div>';

    if(nSel){
      h+='<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:10px 14px;margin-bottom:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">'
        +'<span style="font-size:12.5px">'+nSel+' selecionado(s)</span>'+btn('lc-lote','Conciliar / desconciliar em lote')+'</div>';
    }

    /* lista */
    if(!lista.length){
      h+='<div style="color:var(--mut);font-size:13px;padding:20px 0">Nenhum lançamento com esse filtro.</div>';
    }else{
      h+='<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);overflow-x:auto">';
      h+='<table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr>';
      h+='<th style="padding:8px 6px;text-align:left"><input type="checkbox" id="lf-todos"></th>';
      ['Data','Descrição','Categoria','Job','Valor','Conc.',''].forEach(function(x,i){
        h+='<th style="text-align:'+(i===4?'right':'left')+';padding:8px 6px;font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:var(--mut);border-bottom:1px solid var(--line)">'+x+'</th>';
      });
      h+='</tr></thead><tbody>';
      lista.forEach(function(l){
        var e=ent(l), v=parseFloat(l.valor)||0;
        h+='<tr'+(l.conciliado?'':' style="background:rgba(249,168,37,.05)"')+'>'
          +'<td style="padding:6px"><input type="checkbox" data-action="lc-pick" data-id="'+l.id+'"'+(_sel[l.id]?' checked':'')+'></td>'
          +'<td style="padding:6px;white-space:nowrap">'+dstr(l.data)+'</td>'
          +'<td style="padding:6px">'+esc((l.descricao||'—').slice(0,44))+(l.fornecedor?'<div style="font-size:10.5px;color:var(--mut)">'+esc(l.fornecedor)+'</div>':'')+'</td>'
          +'<td style="padding:6px;font-size:11px;color:var(--mut)">'+esc(l.categoria||'—')+'</td>'
          +'<td style="padding:6px;font-size:11px;color:var(--mut)">'+esc(l.orcamento_numero||'—')+'</td>'
          +'<td style="padding:6px;text-align:right;font-weight:600;white-space:nowrap;color:'+(e?'var(--ok)':'var(--danger)')+'">'+(e?'+':'&minus;')+fmt(v)+'</td>'
          +'<td style="padding:6px"><span data-action="lc-toggle" data-id="'+l.id+'" title="'+(l.conciliado?'Conciliado em '+dstr(l.data_conciliacao):'Clique para conciliar')+'" style="cursor:pointer;font-size:15px;color:'+(l.conciliado?'var(--ok)':'#f9a825')+'">'+(l.conciliado?'✓':'○')+'</span></td>'
          +'<td style="padding:6px;white-space:nowrap">'
            +'<span data-action="lc-edit" data-id="'+l.id+'" style="cursor:pointer;font-size:11px;color:var(--mut);margin-right:8px">editar</span>'
            +'<span data-action="lc-del" data-id="'+l.id+'" style="cursor:pointer;font-size:11px;color:var(--danger)">excluir</span></td>'
          +'</tr>';
      });
      h+='</tbody></table></div>';
      h+='<div style="margin-top:8px;font-size:11.5px;color:var(--mut)">Linhas em destaque estão <b>não conciliadas</b> — não entram no Fluxo de Caixa. Clique no ○ para conciliar.</div>';
    }

    /* modal */
    if(_edit){
      var E=_edit, novo=!E.id;
      var catOps=CATS.slice(); if(E.categoria&&catOps.indexOf(E.categoria)<0) catOps.unshift(E.categoria);
      h+='<div style="position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:900;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto">'
        +'<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:22px;width:100%;max-width:460px">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
        +'<div style="font-family:var(--font-d);font-size:16px;font-weight:700">'+(novo?'Novo lançamento':'Editar lançamento')+'</div>'
        +'<span data-action="lc-fechar" style="cursor:pointer;color:var(--mut);font-size:18px">×</span></div>'
        +fld('Tipo',sel('lc-tipo',[{v:'saida',t:'Saída'},{v:'entrada',t:'Entrada'}],E.tipo_lancamento||'saida'))
        +fld('Data',inp('lc-data','date',(E.data||hoje()).slice(0,10)))
        +fld('Descrição',inp('lc-desc','text',E.descricao||'','O que foi'))
        +fld('Valor (R$)',inp('lc-valor','text',E.valor==null?'':E.valor,'0,00'))
        +fld('Categoria',sel('lc-cat',catOps,E.categoria||'Outros'))
        +fld('Subcategoria',inp('lc-sub','text',E.subcategoria||'','opcional'))
        +fld('Fornecedor',inp('lc-forn','text',E.fornecedor||'','opcional'))
        +fld('Job',inp('lc-job','text',E.orcamento_numero||'','SS-AAAA_MM-## ou vazio'))
        +'<label style="display:flex;gap:8px;align-items:center;font-size:12.5px;margin:14px 0 16px;cursor:pointer">'
        +'<input type="checkbox" id="lc-conc"'+(E.conciliado?' checked':'')+'> Já passou no banco (conciliado)</label>'
        +'<div style="display:flex;gap:8px;align-items:center">'+btn('lc-salvar','Salvar')+btn('lc-fechar','Cancelar')
        +'<span id="lc-st" style="font-size:11.5px;color:var(--mut)"></span></div>'
        +'</div></div>';
    }
    h+='</div>';
    c.innerHTML=h;
  }
  SS20.modules.lanc={render:render};
})();
