/* ═══════════════════════════════════════════════════════════════
   SULSIGN OS 2.0 — MÓDULO: DEPARTAMENTO PESSOAL (dp)
   Consolidação de mão de obra a partir dos lançamentos:
   diárias, horas extras e valores por pessoa e por job.
   Mesma granularidade do Fechamento PDVEX (diarias, valor_diaria,
   horas_extras, tipo_mo, local_mo). Filtro por mês.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  var fmt=SulSignCore.fmt;
  var st={mes:null}; // 'YYYY-MM' ou null = todos

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function isTreino(x){ return (x||'').indexOf('TREINO')>=0; }
  function val(x){ return parseFloat(x)||0; }
  function ehMO(l){
    if(val(l.diarias)>0)return true;
    var cat=(l.categoria||'').toLowerCase();
    return cat.indexOf('mão de obra')>=0||cat.indexOf('mao de obra')>=0;
  }

  function fetchAll(){
    if(SS20.cache.dp) return Promise.resolve(SS20.cache.dp);
    return SS20.sb('lancamentos?select=valor,categoria,job,data,pessoa,funcao,descricao,diarias,valor_diaria,horas_extras,tipo_mo,local_mo&deletado_em=is.null')
      .then(function(rows){
        var data=rows.filter(function(l){return !isTreino(l.job)&&ehMO(l);});
        SS20.cache.dp=data;
        return data;
      });
  }

  function render(c){
    fetchAll().then(function(d){ draw(c,d); })
    .catch(function(e){
      c.innerHTML='<div class="err-view">Erro ao carregar MO: '+esc(e.message)+'</div>';
    });
  }

  function draw(c,d){
    /* meses disponíveis */
    var mesesSet={};
    d.forEach(function(l){ if(l.data)mesesSet[l.data.slice(0,7)]=1; });
    var meses=Object.keys(mesesSet).sort().reverse();
    if(st.mes===null&&meses.length)st.mes=meses[0]; // default: mês mais recente

    var filt=d.filter(function(l){
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
      if(l.job)p.jobs[l.job]=(p.jobs[l.job]||0)+v;
      if(l.tipo_mo)p.tipos[l.tipo_mo]=1;
      totDiarias+=di; totHE+=he; totValor+=v;
    });
    var pessoas=Object.keys(porPessoa).map(function(k){return porPessoa[k];})
      .sort(function(a,b){return b.valor-a.valor;});

    /* por job */
    var porJob={};
    filt.forEach(function(l){
      if(!l.job)return;
      var v=val(l.valor)||((val(l.diarias)*val(l.valor_diaria))+(val(l.horas_extras)*val(l.valor_diaria)/8));
      porJob[l.job]=(porJob[l.job]||0)+v;
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
    h+=kpi('Pessoas',pessoas.length,'','var(--ink)');
    h+=kpi('Diárias',totDiarias.toFixed(1).replace('.0',''),'','var(--blue)');
    h+=kpi('Horas extras',totHE.toFixed(1).replace('.0','')+'h','','var(--warn)');
    h+=kpi('Total MO',fmt(totValor),'','var(--accent)');
    h+='</div>';

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
      h+='<tr><td style="padding:7px 6px;border-bottom:1px solid var(--line)">'+esc(p.nome)
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
