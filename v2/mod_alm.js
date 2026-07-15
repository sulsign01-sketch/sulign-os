/* ═══════════════════════════════════════════════════════════════
   SULSIGN OS 2.0 — MÓDULO: ALMOXARIFADO (alm)
   Estoque de insumos: itens com quantidade, mínimo (alerta),
   entrada/saída/ajuste com vínculo a job. Requer tabelas
   almoxarifado_itens e almoxarifado_mov (SQL: ss20_novas_tabelas.sql).
   ═══════════════════════════════════════════════════════════════ */
(function(){
  var st={busca:'',cat:''};
  var CATS=['Madeira','Metalon','Tecido','Ferragem','Tinta','Elétrica','Vinil/Lona','Outros'];
  var UNIDADES=['un','m','m²','chapa','vara','kg','l','rolo','cx'];

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function num(x){ return parseFloat(String(x).replace(',','.'))||0; }
  function qfmt(v){ return (Math.round(v*100)/100).toString().replace('.',','); }

  function fetchAll(force){
    if(SS20.cache.alm&&!force) return Promise.resolve(SS20.cache.alm);
    return SS20.sb('almoxarifado_itens?select=*&deletado_em=is.null&order=nome.asc')
      .then(function(rows){ SS20.cache.alm=rows; return rows; });
  }

  function render(c){
    fetchAll().then(function(d){ draw(c,d); })
    .catch(function(e){
      if(String(e.message).indexOf('404')>=0||String(e.message).indexOf('42P01')>=0){
        c.innerHTML='<div class="placeholder-view"><h2>Almoxarifado</h2>'
          +'<p>A tabela <b>almoxarifado_itens</b> ainda não existe no Supabase.</p>'
          +'<p>Rode o arquivo <b>v2/sql/ss20_novas_tabelas.sql</b> no SQL Editor do Supabase e recarregue esta página. O SQL cria as tabelas de itens e movimentações com o mesmo padrão de segurança das demais.</p></div>';
        return;
      }
      c.innerHTML='<div class="err-view">Erro: '+esc(e.message)+'</div>';
    });
  }

  function draw(c,d){
    var baixos=d.filter(function(i){return num(i.qtd_minima)>0&&num(i.qtd)<=num(i.qtd_minima);});
    var filt=d.filter(function(i){
      if(st.cat&&(i.categoria||'')!==st.cat)return false;
      if(st.busca&&(i.nome||'').toLowerCase().indexOf(st.busca.toLowerCase())<0)return false;
      return true;
    });

    var h='<div style="padding:24px 26px">';
    h+='<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:4px">';
    h+='<h2 style="font-family:var(--font-d);font-size:19px">Almoxarifado</h2>';
    h+='<span style="flex:1"></span>';
    h+='<button type="button" data-alm-novo="1" style="background:var(--accent);color:#fff;border:none;font-size:12.5px;font-weight:600;padding:8px 14px;border-radius:8px;cursor:pointer">⊕ Novo item</button>';
    h+='</div>';
    h+='<p style="color:var(--mut);font-size:12.5px;margin-bottom:16px">'+d.length+' itens'
      +(baixos.length?' · <b style="color:var(--danger)">'+baixos.length+' abaixo do mínimo</b>':' · estoque ok')+'</p>';

    /* filtros */
    h+='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center">';
    h+='<input id="alm-busca" type="text" inputmode="search" placeholder="Buscar item…" value="'+esc(st.busca)+'" style="padding:8px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;min-width:200px">';
    h+='<select id="alm-cat" style="padding:8px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;background:var(--panel)">';
    h+='<option value="">Todas categorias</option>';
    CATS.forEach(function(cat){h+='<option'+(st.cat===cat?' selected':'')+'>'+cat+'</option>';});
    h+='</select></div>';

    /* tabela */
    h+='<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);overflow:auto">';
    h+='<table style="width:100%;border-collapse:collapse;font-size:12.5px;min-width:640px"><thead><tr>';
    ['Item','Categoria','Local','Qtd','Mín.','',''].forEach(function(x,i){
      h+='<th style="text-align:'+(i===3||i===4?'right':'left')+';padding:10px 12px;font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:var(--mut);border-bottom:1px solid var(--line)">'+x+'</th>';
    });
    h+='</tr></thead><tbody>';
    if(!filt.length)h+='<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--mut)">'+(d.length?'Nada com este filtro.':'Estoque vazio — cadastre o primeiro item.')+'</td></tr>';
    filt.forEach(function(i){
      var baixo=num(i.qtd_minima)>0&&num(i.qtd)<=num(i.qtd_minima);
      h+='<tr>'
        +'<td style="padding:9px 12px;border-bottom:1px solid var(--line);font-weight:600">'+esc(i.nome)+(i.obs?'<div style="font-size:10.5px;color:var(--mut);font-weight:400">'+esc(i.obs)+'</div>':'')+'</td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid var(--line);color:var(--mut)">'+esc(i.categoria||'—')+'</td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid var(--line);color:var(--mut)">'+esc(i.local||'—')+'</td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid var(--line);text-align:right;font-weight:700;'+(baixo?'color:var(--danger)':'')+'">'+qfmt(num(i.qtd))+' '+esc(i.unidade||'un')+(baixo?' ⚠':'')+'</td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid var(--line);text-align:right;color:var(--mut)">'+(num(i.qtd_minima)?qfmt(num(i.qtd_minima)):'—')+'</td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid var(--line)"><button type="button" data-alm-mov="'+i.id+'" style="border:1px solid var(--line);background:var(--paper);font-size:11px;font-weight:600;padding:4px 10px;border-radius:8px;cursor:pointer">⇄ mov.</button></td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid var(--line)"><button type="button" data-alm-edit="'+i.id+'" style="border:none;background:none;font-size:11px;color:var(--accent);font-weight:600;cursor:pointer">editar</button></td>'
        +'</tr>';
    });
    h+='</tbody></table></div>';
    h+='<div id="alm-form"></div>';
    h+='</div>';
    c.innerHTML=h;
    bind(c,d);
  }

  function bind(c,d){
    var busca=document.getElementById('alm-busca');
    if(busca)busca.addEventListener('input',function(){
      st.busca=this.value; var pos=this.selectionStart;
      draw(c,d);
      var n=document.getElementById('alm-busca');
      if(n){n.focus();try{n.setSelectionRange(pos,pos);}catch(e){}}
    });
    var cat=document.getElementById('alm-cat');
    if(cat)cat.addEventListener('change',function(){st.cat=this.value;draw(c,d);});
    Array.prototype.forEach.call(c.querySelectorAll('[data-alm-novo]'),function(b){
      b.addEventListener('click',function(){formItem(c,d,null);});
    });
    Array.prototype.forEach.call(c.querySelectorAll('[data-alm-edit]'),function(b){
      b.addEventListener('click',function(){
        var id=this.getAttribute('data-alm-edit');
        var item=null; d.forEach(function(i){if(String(i.id)===id)item=i;});
        formItem(c,d,item);
      });
    });
    Array.prototype.forEach.call(c.querySelectorAll('[data-alm-mov]'),function(b){
      b.addEventListener('click',function(){
        var id=this.getAttribute('data-alm-mov');
        var item=null; d.forEach(function(i){if(String(i.id)===id)item=i;});
        formMov(c,d,item);
      });
    });
  }

  function inp(id,lbl,valTxt,ph){
    return '<div style="flex:1;min-width:140px"><label style="display:block;font-size:10.5px;font-weight:600;color:var(--mut);margin-bottom:3px">'+lbl+'</label>'
      +'<input id="'+id+'" type="text" inputmode="'+(id.indexOf('qtd')>=0?'decimal':'text')+'" value="'+esc(valTxt||'')+'" placeholder="'+(ph||'')+'" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit"></div>';
  }
  function selCampo(id,lbl,ops,valSel){
    var h='<div style="min-width:120px"><label style="display:block;font-size:10.5px;font-weight:600;color:var(--mut);margin-bottom:3px">'+lbl+'</label>'
      +'<select id="'+id+'" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;background:var(--panel)">';
    ops.forEach(function(o){h+='<option'+(o===valSel?' selected':'')+'>'+o+'</option>';});
    return h+'</select></div>';
  }

  function formItem(c,d,item){
    var f=document.getElementById('alm-form');
    f.innerHTML='<div style="background:var(--panel);border:2px solid var(--accent);border-radius:var(--radius);padding:18px;margin-top:14px">'
      +'<div style="font-size:12px;font-weight:700;margin-bottom:12px">'+(item?'Editar item':'Novo item')+'</div>'
      +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">'
      +inp('fi-nome','Nome *',item?item.nome:'','MDF Ultra 15mm 1,85×2,75')
      +selCampo('fi-cat','Categoria',CATS,item?item.categoria:CATS[0])
      +selCampo('fi-un','Unidade',UNIDADES,item?item.unidade:'un')
      +'</div><div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'
      +inp('fi-qtd','Qtd atual',item?qfmt(num(item.qtd)):'0')
      +inp('fi-min','Qtd mínima (alerta)',item?qfmt(num(item.qtd_minima)):'0')
      +inp('fi-local','Local',item?item.local:'','Prateleira A2')
      +inp('fi-obs','Observação',item?item.obs:'')
      +'</div>'
      +'<div style="display:flex;gap:8px"><button type="button" id="fi-salvar" style="background:var(--accent);color:#fff;border:none;font-size:12.5px;font-weight:600;padding:9px 16px;border-radius:8px;cursor:pointer">💾 Salvar</button>'
      +'<button type="button" id="fi-cancel" style="background:var(--paper);border:1px solid var(--line);font-size:12.5px;padding:9px 16px;border-radius:8px;cursor:pointer">Cancelar</button>'
      +(item?'<span style="flex:1"></span><button type="button" id="fi-del" style="background:none;border:none;color:var(--danger);font-size:11.5px;cursor:pointer">excluir item</button>':'')
      +'</div><div id="fi-msg" style="font-size:11.5px;margin-top:8px"></div></div>';
    try{f.scrollIntoView({behavior:'smooth',block:'nearest'});}catch(e){}

    document.getElementById('fi-cancel').addEventListener('click',function(){f.innerHTML='';});
    document.getElementById('fi-salvar').addEventListener('click',function(){
      var body={
        nome:document.getElementById('fi-nome').value.trim(),
        categoria:document.getElementById('fi-cat').value,
        unidade:document.getElementById('fi-un').value,
        qtd:num(document.getElementById('fi-qtd').value),
        qtd_minima:num(document.getElementById('fi-min').value),
        local:document.getElementById('fi-local').value.trim()||null,
        obs:document.getElementById('fi-obs').value.trim()||null
      };
      if(!body.nome){msg('fi-msg','Nome é obrigatório.','var(--danger)');return;}
      var p=item
        ?SS20.sbw('almoxarifado_itens?id=eq.'+item.id,'PATCH',body)
        :SS20.sbw('almoxarifado_itens','POST',body);
      p.then(function(){recarregar(c);})
       .catch(function(e){msg('fi-msg','Erro ao salvar: '+e.message,'var(--danger)');});
    });
    if(item){
      document.getElementById('fi-del').addEventListener('click',function(){
        if(this.textContent!=='confirmar exclusão?'){this.textContent='confirmar exclusão?';return;}
        SS20.sbw('almoxarifado_itens?id=eq.'+item.id,'PATCH',{deletado_em:new Date().toISOString()})
          .then(function(){recarregar(c);})
          .catch(function(e){msg('fi-msg','Erro: '+e.message,'var(--danger)');});
      });
    }
  }

  function formMov(c,d,item){
    if(!item)return;
    var f=document.getElementById('alm-form');
    f.innerHTML='<div style="background:var(--panel);border:2px solid var(--blue);border-radius:var(--radius);padding:18px;margin-top:14px">'
      +'<div style="font-size:12px;font-weight:700;margin-bottom:12px">Movimentar: '+esc(item.nome)+' <span style="color:var(--mut);font-weight:400">(atual: '+qfmt(num(item.qtd))+' '+esc(item.unidade||'un')+')</span></div>'
      +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'
      +selCampo('fm-tipo','Tipo',['saida','entrada','ajuste'],'saida')
      +inp('fm-qtd','Quantidade *','')
      +inp('fm-job','Job (se saída p/ job)','','SS-2026_07-01')
      +inp('fm-resp','Responsável','','Everson')
      +inp('fm-obs','Observação','')
      +'</div>'
      +'<div style="display:flex;gap:8px"><button type="button" id="fm-salvar" style="background:var(--blue);color:#fff;border:none;font-size:12.5px;font-weight:600;padding:9px 16px;border-radius:8px;cursor:pointer">⇄ Registrar</button>'
      +'<button type="button" id="fm-cancel" style="background:var(--paper);border:1px solid var(--line);font-size:12.5px;padding:9px 16px;border-radius:8px;cursor:pointer">Cancelar</button></div>'
      +'<div id="fm-msg" style="font-size:11.5px;margin-top:8px"></div></div>';
    try{f.scrollIntoView({behavior:'smooth',block:'nearest'});}catch(e){}

    document.getElementById('fm-cancel').addEventListener('click',function(){f.innerHTML='';});
    document.getElementById('fm-salvar').addEventListener('click',function(){
      var tipo=document.getElementById('fm-tipo').value;
      var q=num(document.getElementById('fm-qtd').value);
      if(!q){msg('fm-msg','Quantidade obrigatória.','var(--danger)');return;}
      var novaQtd = tipo==='entrada'?num(item.qtd)+q : tipo==='saida'?num(item.qtd)-q : q;
      if(novaQtd<0){msg('fm-msg','Saída maior que o estoque atual ('+qfmt(num(item.qtd))+'). Confira.','var(--danger)');return;}
      SS20.sbw('almoxarifado_mov','POST',{
        item_id:item.id, tipo:tipo, qtd:q,
        job:document.getElementById('fm-job').value.trim()||null,
        responsavel:document.getElementById('fm-resp').value.trim()||null,
        obs:document.getElementById('fm-obs').value.trim()||null
      }).then(function(){
        return SS20.sbw('almoxarifado_itens?id=eq.'+item.id,'PATCH',{qtd:novaQtd});
      }).then(function(){recarregar(c);})
      .catch(function(e){msg('fm-msg','Erro: '+e.message,'var(--danger)');});
    });
  }

  function msg(id,txt,cor){
    var e=document.getElementById(id);
    if(e){e.textContent=txt;e.style.color=cor;}
  }
  function recarregar(c){
    fetchAll(true).then(function(d){draw(c,d);});
  }

  SS20.modules.alm={render:render};
})();
