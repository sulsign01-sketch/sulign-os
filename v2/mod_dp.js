/* ═══════════════════════════════════════════════════════════════
   SULSIGN OS 2.0 — MÓDULO: DEPARTAMENTO PESSOAL (dp)
   Consolidação de mão de obra a partir dos lançamentos:
   diárias, horas extras e valores por pessoa e por job.
   Mesma granularidade do Fechamento PDVEX (diarias, valor_diaria,
   horas_extras, tipo_mo, local_mo). Filtro por mês.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  var fmt=SulSignCore.fmt;
  var st={mes:null, form:null}; // mes: 'YYYY-MM' ou null=todos · form: ficha em edição ou null

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function isTreino(x){ return (x||'').indexOf('TREINO')>=0; }
  function val(x){ return parseFloat(x)||0; }
  function ehMO(l){
    if(val(l.diarias)>0)return true;
    var cat=(l.categoria||'').toLowerCase();
    return cat.indexOf('mão de obra')>=0||cat.indexOf('mao de obra')>=0;
  }

  function norm(s){
    s=String(s||'').toUpperCase();
    try{ s=s.normalize('NFD').replace(/[\u0300-\u036f]/g,''); }catch(err){}
    return s.replace(/\s+/g,' ').trim();
  }
  /* casa nome do lançamento com o cadastro: igualdade exata ou prefixo único */
  function matchColab(nome,colabs){
    var n=norm(nome),i,hit=null,hits=0;
    if(!n)return null;
    for(i=0;i<colabs.length;i++){
      var cn=norm(colabs[i].nome);
      if(cn===n) return colabs[i];
      if(cn.indexOf(n+' ')===0 || n.indexOf(cn+' ')===0){ hit=colabs[i]; hits++; }
    }
    return (hits===1)?hit:null;
  }

  function fetchAll(){
    if(SS20.cache.dp) return Promise.resolve(SS20.cache.dp);
    return Promise.all([
      SS20.sb('lancamentos?select=valor,categoria,orcamento_numero,data,pessoa,funcao,descricao,diarias,valor_diaria,horas_extras,tipo_mo,local_mo&deletado_em=is.null'),
      SS20.sb('colaboradores?select=id,nome,funcao,documento,setor,valor_diaria,vinculo,ativo,obs&order=setor.asc,nome.asc')
    ]).then(function(r){
      var data={
        mo:r[0].filter(function(l){return !isTreino(l.orcamento_numero)&&ehMO(l);}),
        colabs:r[1]||[]
      };
      SS20.cache.dp=data;
      return data;
    });
  }

  function render(c){
    fetchAll().then(function(d){ draw(c,d); })
    .catch(function(e){
      c.innerHTML='<div class="err-view">Erro ao carregar MO: '+esc(e.message)+'</div>';
    });
    if(!SS20._dpBound){
      SS20._dpBound=true;
      c.addEventListener('click',function(ev){
        var t=ev.target;
        while(t&&t!==c&&!(t.dataset&&t.dataset.action)) t=t.parentNode;
        if(!t||t===c) return;
        var a=t.dataset.action;
        if(a==='dp-novo'||a==='dp-edit'||a==='dp-cancel'||a==='dp-save'){
          ev.preventDefault();
          if(a==='dp-novo') abrirForm(c,null);
          else if(a==='dp-edit') abrirForm(c,t.dataset.id);
          else if(a==='dp-cancel'){ st.form=null; redraw(c); }
          else if(a==='dp-save') salvar(c);
        }
      });
    }
  }

  /* re-desenha usando o cache atual, sem refazer o fetch */
  function redraw(c){ if(SS20.cache.dp) draw(c,SS20.cache.dp); else render(c); }

  /* abre o formulário em branco (id=null) ou com a ficha carregada */
  function abrirForm(c,id){
    var col=null;
    if(id&&SS20.cache.dp){
      SS20.cache.dp.colabs.some(function(cb){ if(String(cb.id)===String(id)){ col=cb; return true; } return false; });
    }
    st.form = col ? {
      id:col.id, nome:col.nome||'', funcao:col.funcao||'', documento:col.documento||'',
      setor:col.setor||'', valor_diaria:(col.valor_diaria==null?'':col.valor_diaria),
      vinculo:col.vinculo||'fixo', ativo:col.ativo!==false, obs:col.obs||''
    } : {
      id:null, nome:'', funcao:'', documento:'', setor:'', valor_diaria:'',
      vinculo:'fixo', ativo:true, obs:''
    };
    redraw(c);
  }

  function salvar(c){
    var g=function(idd){ var el=document.getElementById(idd); return el?el.value:''; };
    var nome=g('dpf-nome').trim();
    if(!nome){ alert('Nome é obrigatório.'); return; }
    var vd=g('dpf-diaria').trim().replace(',','.');
    var body={
      nome:nome,
      funcao:g('dpf-funcao').trim()||null,
      documento:g('dpf-doc').trim()||null,
      setor:g('dpf-setor').trim()||null,
      valor_diaria: vd!==''?(parseFloat(vd)||null):null,
      vinculo:g('dpf-vinculo')||null,
      obs:g('dpf-obs').trim()||null,
      ativo: document.getElementById('dpf-ativo')?document.getElementById('dpf-ativo').checked:true,
      atualizado_em:new Date().toISOString()
    };
    var btn=document.getElementById('dpf-save'); if(btn){ btn.disabled=true; btn.textContent='Salvando…'; }
    var isEdit=st.form&&st.form.id;
    var p=isEdit
      ? SS20.sbw('colaboradores?id=eq.'+encodeURIComponent(st.form.id),'PATCH',body)
      : SS20.sbw('colaboradores','POST',body);
    p.then(function(){
      SS20.cache.dp=null; st.form=null; render(c);
    }).catch(function(e){
      if(btn){ btn.disabled=false; btn.textContent='Salvar'; }
      alert('Erro ao salvar: '+e.message);
    });
  }

  function formHTML(){
    var f=st.form, isEdit=!!f.id;
    var inp=function(id,lbl,valv,ph){
      return '<div><label style="display:block;font-size:11px;color:var(--mut);margin:0 0 3px">'+lbl+'</label>'
        +'<input id="'+id+'" type="text" value="'+esc(valv)+'" placeholder="'+esc(ph||'')+'" '
        +'style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;background:var(--paper);box-sizing:border-box"></div>';
    };
    var h='<div style="background:var(--panel);border:1px solid var(--accent);border-radius:var(--radius);padding:18px;margin-bottom:14px">';
    h+='<div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--accent);margin-bottom:12px">'+(isEdit?'Editar ficha':'Novo colaborador')+'</div>';
    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px 14px">';
    h+=inp('dpf-nome','Nome *',f.nome,'Nome completo');
    h+=inp('dpf-funcao','Função',f.funcao,'ex.: Forrador');
    h+=inp('dpf-doc','Documento (CPF/RG)',f.documento,'com ou sem máscara');
    h+=inp('dpf-setor','Setor',f.setor,'ex.: Forração');
    h+=inp('dpf-diaria','Valor diária (R$)',f.valor_diaria,'ex.: 250');
    h+='<div><label style="display:block;font-size:11px;color:var(--mut);margin:0 0 3px">Vínculo</label>'
      +'<select id="dpf-vinculo" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;background:var(--paper);box-sizing:border-box">'
      +'<option value="fixo"'+(f.vinculo==='fixo'?' selected':'')+'>Fixo</option>'
      +'<option value="freela"'+(f.vinculo==='freela'?' selected':'')+'>Freela</option>'
      +'<option value="terceiro"'+(f.vinculo==='terceiro'?' selected':'')+'>Terceiro</option>'
      +'</select></div>';
    h+='</div>';
    h+='<div style="margin-top:12px"><label style="display:block;font-size:11px;color:var(--mut);margin:0 0 3px">Observação</label>'
      +'<input id="dpf-obs" type="text" value="'+esc(f.obs)+'" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;background:var(--paper);box-sizing:border-box"></div>';
    h+='<label style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;margin-top:12px;cursor:pointer">'
      +'<input id="dpf-ativo" type="checkbox"'+(f.ativo?' checked':'')+'> Ativo</label>';
    h+='<div style="display:flex;gap:10px;margin-top:14px">';
    h+='<button id="dpf-save" data-action="dp-save" style="background:var(--accent);color:#fff;border:none;border-radius:8px;padding:9px 22px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Salvar</button>';
    h+='<button data-action="dp-cancel" style="background:none;border:1px solid var(--line);border-radius:8px;padding:9px 18px;font-size:13px;cursor:pointer;font-family:inherit;color:inherit">Cancelar</button>';
    h+='</div></div>';
    return h;
  }

  function draw(c,d){
    var colabs=d.colabs;
    /* meses disponíveis */
    var mesesSet={};
    d.mo.forEach(function(l){ if(l.data)mesesSet[l.data.slice(0,7)]=1; });
    var meses=Object.keys(mesesSet).sort().reverse();
    if(st.mes===null&&meses.length)st.mes=meses[0]; // default: mês mais recente

    var filt=d.mo.filter(function(l){
      if(!st.mes)return true;
      return (l.data||'').slice(0,7)===st.mes;
    });

    /* consolidar por pessoa */
    var porPessoa={};
    var totDiarias=0,totHE=0,totValor=0;
    filt.forEach(function(l){
      var nome=(l.pessoa||l.funcao||l.descricao||'(sem identificação)').toUpperCase();
      if(!porPessoa[nome])porPessoa[nome]={nome:nome,diarias:0,he:0,valor:0,jobs:{},tipos:{}};
      var p=porPessoa[nome];
      var di=val(l.diarias),he=val(l.horas_extras),vd=val(l.valor_diaria);
      var v=val(l.valor)||((di*vd)+(he*vd/8));
      p.diarias+=di; p.he+=he; p.valor+=v;
      if(l.orcamento_numero)p.jobs[l.orcamento_numero]=(p.jobs[l.orcamento_numero]||0)+v;
      if(l.tipo_mo)p.tipos[l.tipo_mo]=1;
      totDiarias+=di; totHE+=he; totValor+=v;
    });
    var pessoas=Object.keys(porPessoa).map(function(k){return porPessoa[k];})
      .sort(function(a,b){return b.valor-a.valor;});
    pessoas.forEach(function(p){ p.cad=(p.nome==='(SEM IDENTIFICAÇÃO)')?null:matchColab(p.nome,colabs); });
    var foraCadastro=pessoas.filter(function(p){return !p.cad&&p.nome!=='(SEM IDENTIFICAÇÃO)';}).length;

    /* por job */
    var porJob={};
    filt.forEach(function(l){
      if(!l.orcamento_numero)return;
      var v=val(l.valor)||((val(l.diarias)*val(l.valor_diaria))+(val(l.horas_extras)*val(l.valor_diaria)/8));
      porJob[l.orcamento_numero]=(porJob[l.orcamento_numero]||0)+v;
    });
    var jobs=Object.keys(porJob).map(function(k){return {j:k,v:porJob[k]};})
      .sort(function(a,b){return b.v-a.v;});

    var h='<div style="padding:24px 26px">';
    h+='<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:4px">';
    h+='<h2 style="font-family:var(--font-d);font-size:19px">Departamento Pessoal · Mão de Obra</h2>';
    h+='<span style="flex:1"></span>';
    h+='<select id="dp-mes" style="padding:8px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;background:var(--panel)">';
    h+='<option value=""'+(st.mes===''?' selected':'')+'>Todos os meses</option>';
    meses.forEach(function(m){
      var p=m.split('-');
      h+='<option value="'+m+'"'+(st.mes===m?' selected':'')+'>'+p[1]+'/'+p[0]+'</option>';
    });
    h+='</select></div>';
    h+='<p style="color:var(--mut);font-size:12.5px;margin-bottom:18px">Fonte: lançamentos com diárias ou categoria Mão de Obra · HE convertida a 1/8 da diária (regra do Fechamento PDVEX)</p>';

    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:20px">';
    h+=kpi('Pessoas',pessoas.length,colabs.length+' no cadastro'+(foraCadastro?' · '+foraCadastro+' fora':''),'var(--ink)');
    h+=kpi('Diárias',totDiarias.toFixed(1).replace('.0',''),'','var(--blue)');
    h+=kpi('Horas extras',totHE.toFixed(1).replace('.0','')+'h','','var(--warn)');
    h+=kpi('Total MO',fmt(totValor),'','var(--accent)');
    h+='</div>';

    if(st.form) h+=formHTML();

    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px">';

    /* por pessoa */
    h+='<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:18px">';
    h+='<div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut);margin-bottom:12px">Por pessoa / função</div>';
    if(!pessoas.length)h+='<div style="color:var(--mut);font-size:12px">Sem lançamentos de MO no período.</div>';
    h+='<table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr>'
      +'<th style="text-align:left;padding:4px 6px;font-size:10px;text-transform:uppercase;color:var(--mut);border-bottom:1px solid var(--line)">Pessoa</th>'
      +'<th style="text-align:right;padding:4px 6px;font-size:10px;text-transform:uppercase;color:var(--mut);border-bottom:1px solid var(--line)">Diárias</th>'
      +'<th style="text-align:right;padding:4px 6px;font-size:10px;text-transform:uppercase;color:var(--mut);border-bottom:1px solid var(--line)">HE</th>'
      +'<th style="text-align:right;padding:4px 6px;font-size:10px;text-transform:uppercase;color:var(--mut);border-bottom:1px solid var(--line)">Total</th></tr></thead><tbody>';
    pessoas.forEach(function(p){
      var nJobs=Object.keys(p.jobs).length;
      var tag='';
      if(p.cad&&p.cad.setor) tag=' <span style="font-size:10px;color:var(--mut)">· '+esc(p.cad.setor)+'</span>';
      else if(!p.cad&&p.nome!=='(SEM IDENTIFICAÇÃO)') tag=' <span style="font-size:10px;color:var(--warn)">· fora do cadastro</span>';
      h+='<tr><td style="padding:7px 6px;border-bottom:1px solid var(--line)">'+esc(p.nome)+tag
        +(nJobs?' <span style="font-size:10px;color:var(--mut)">· '+nJobs+' job'+(nJobs>1?'s':'')+'</span>':'')+'</td>'
        +'<td style="padding:7px 6px;border-bottom:1px solid var(--line);text-align:right">'+(p.diarias?p.diarias.toFixed(1).replace('.0',''):'—')+'</td>'
        +'<td style="padding:7px 6px;border-bottom:1px solid var(--line);text-align:right">'+(p.he?p.he.toFixed(1).replace('.0','')+'h':'—')+'</td>'
        +'<td style="padding:7px 6px;border-bottom:1px solid var(--line);text-align:right;font-weight:700">'+fmt(p.valor)+'</td></tr>';
    });
    h+='</tbody></table></div>';

    /* por job */
    h+='<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:18px">';
    h+='<div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut);margin-bottom:12px">MO por job</div>';
    if(!jobs.length)h+='<div style="color:var(--mut);font-size:12px">Sem MO vinculada a jobs no período.</div>';
    jobs.forEach(function(x){
      var pctJ=totValor?Math.round(x.v/totValor*100):0;
      h+='<div style="margin-bottom:10px;font-size:12.5px">'
        +'<div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="font-weight:600">'+esc(x.j)+'</span>'
        +'<span style="font-weight:700">'+fmt(x.v)+' <span style="color:var(--mut);font-weight:400;font-size:11px">'+pctJ+'%</span></span></div>'
        +'<div style="height:6px;background:var(--paper);border-radius:4px;overflow:hidden"><div style="width:'+pctJ+'%;height:100%;background:var(--accent)"></div></div></div>';
    });
    h+='</div>';

    /* cadastro de colaboradores (fonte: tabela colaboradores) */
    var porSetor={}, ordemSetor=[];
    colabs.forEach(function(cb){
      var s2=cb.setor||'Sem setor';
      if(!porSetor[s2]){ porSetor[s2]=[]; ordemSetor.push(s2); }
      porSetor[s2].push(cb);
    });
    var pendDoc=0;
    h+='<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:18px;grid-column:1/-1">';
    h+='<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">';
    h+='<div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut)">Cadastro de colaboradores <span style="font-weight:400;text-transform:none;letter-spacing:0">· fonte única · alimenta o Credenciamento</span></div>';
    h+='<button data-action="dp-novo" style="background:var(--accent);color:#fff;border:none;border-radius:8px;padding:7px 16px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap">＋ Novo</button>';
    h+='</div>';
    if(!colabs.length)h+='<div style="color:var(--mut);font-size:12px">Tabela colaboradores vazia.</div>';
    ordemSetor.forEach(function(s2){
      h+='<div style="font-size:10.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--mut);margin:12px 0 6px">'+esc(s2)+'</div>';
      porSetor[s2].forEach(function(cb){
        var badges='';
        if(!cb.documento){ badges+=' <span style="font-size:10px;color:var(--warn)">⚠ sem documento</span>'; pendDoc++; }
        if(!cb.funcao) badges+=' <span style="font-size:10px;color:var(--warn)">⚠ sem função</span>';
        if(cb.ativo===false) badges+=' <span style="font-size:10px;color:var(--mut)">inativo</span>';
        if(cb.vinculo) badges+=' <span style="font-size:10px;color:var(--blue)">· '+esc(cb.vinculo)+'</span>';
        h+='<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--line);font-size:12.5px;flex-wrap:wrap">'
          +'<span><b>'+esc(cb.nome)+'</b>'+(cb.funcao?' <span style="color:var(--mut)">· '+esc(cb.funcao)+'</span>':'')+badges+'</span>'
          +'<span style="display:flex;align-items:center;gap:12px;color:var(--mut)">'
          +(val(cb.valor_diaria)?('<span>diária '+fmt(cb.valor_diaria)+'</span>'):'')
          +'<a href="#" data-action="dp-edit" data-id="'+esc(cb.id)+'" style="color:var(--accent);font-weight:600;font-size:11.5px">editar</a>'
          +'</span>'
          +'</div>';
      });
    });
    if(pendDoc)h+='<div style="margin-top:10px;font-size:11.5px;color:var(--warn)">'+pendDoc+' colaborador(es) sem documento — não podem entrar em credenciamento até completar.</div>';
    h+='</div>';

    h+='</div></div>';
    c.innerHTML=h;

    var sel=document.getElementById('dp-mes');
    if(sel)sel.addEventListener('change',function(){
      st.mes=this.value;
      draw(c,d);
    });
  }

  function kpi(lbl,valTxt,sub,cor){
    return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px">'
      +'<div style="font-size:10.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut)">'+lbl+'</div>'
      +'<div style="font-family:var(--font-d);font-size:21px;font-weight:800;margin:6px 0 3px;color:'+cor+'">'+valTxt+'</div>'
      +'<div style="font-size:11.5px;color:var(--mut)">'+(sub||'&nbsp;')+'</div></div>';
  }

  SS20.modules.dp={render:render};
})();
