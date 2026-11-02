/* ═══════════════════════════════════════════════════════════════
   SULSIGN OS 2.0 — MÓDULO: LETRA CAIXA (lcx)
   Orçamento + levantamento de materiais + memorial descritivo para
   letra caixa e logos recortados, a partir do desenho real (DXF, SVG,
   .crv3d do Aspire, EPS, PDF) ou de texto + altura.
   Construções: chapada (+vinil/pintura), caixa com face (+LED), impressão 3D.
   Motor em lcx_core.js; leitores e encaixe de chapa em rtr_core.js.
   Saídas: Sintético (uma linha por peça), memorial de custo editável,
   levantamento, descritivo e proposta em HTML; grava em `orcamentos`.
   iOS Safari: var, sem template literals, sem arrow, sem let/const.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  var fmt=SulSignCore.fmt;
  var LS_JOB='ss20_lcx_job', LS_PAR='ss20_lcx_params', LS_RTR='ss20_rtr_cfg';
  var PDFJS='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/';
  var st={itens:[], sel:0, comb:null, printImg:null, job:null, params:{}, doc:null, buf:null, nomeArq:'', escala:1, larguraReal:0, camadas:{}, geoSalvo:null,
          aba:'sint', r:null, msg:null, erro:null, ocupado:false, root:null};

  /* ── utilidades ── */
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function num(x){ var v=parseFloat(String(x==null?'':x).replace(',','.')); return isFinite(v)?v:0; }
  function copia(o){ return JSON.parse(JSON.stringify(o)); }
  function nf(v,d){ d=d==null?2:d; var s=(Math.round((+v||0)*Math.pow(10,d))/Math.pow(10,d)).toFixed(d); var p=s.split('.'); p[0]=p[0].replace(/\B(?=(\d{3})+(?!\d))/g,'.'); return p.join(','); }
  function R(v){ return 'R$ '+nf(v,2); }                 /* sempre visível (exportações) */
  function inVal(v){ return String(Math.round((+v||0)*1000)/1000).replace('.',','); }
  function getPath(o,p){ var a=p.split('.'); for(var i=0;i<a.length;i++){ if(o==null) return undefined; o=o[a[i]]; } return o; }
  function setPath(o,p,v){ var a=p.split('.'); for(var i=0;i<a.length-1;i++){ if(o[a[i]]==null||typeof o[a[i]]!=='object') o[a[i]]={}; o=o[a[i]]; } o[a[a.length-1]]=v; }
  function delPath(o,p){ var a=p.split('.'); for(var i=0;i<a.length-1;i++){ if(o[a[i]]==null) return; o=o[a[i]]; } delete o[a[a.length-1]]; }
  function script(src){
    return new Promise(function(res,rej){ var s=document.createElement('script'); s.src=src; s.onload=function(){ res(); }; s.onerror=function(){ if(s.parentNode) s.parentNode.removeChild(s); rej(new Error('Não carregou '+src)); }; document.body.appendChild(s); });
  }
  function motor(){
    var p=window.RTR?Promise.resolve():script('rtr_core.js?v='+Date.now());
    return p.then(function(){ return window.LCX?null:script('lcx_core.js?v='+Date.now()); });
  }
  function pdfjs(){
    if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return script(PDFJS+'pdf.min.js').then(function(){ window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS+'pdf.worker.min.js'; return window.pdfjsLib; })
      .catch(function(){ throw new Error('Leitor de PDF não carregou (sem internet?). Exporte em DXF ou EPS.'); });
  }

  /* ── estado e persistência ── */
  function jobPadrao(){
    return {nome:'', cliente:'', projeto:'', perfil:'sulsign', nf:false, qtd:1, complexidade:'normal',
      entrada:'arquivo', texto:'', alturaCm:20, qtdLetras:0, constr:'chapada',
      chapada:{mat:'pvc15', acab:'vinil', vinil:'lam', cores:1},
      caixa:{face:'acr3', lateral:'pvc10', fundo:'pvc5', prof:5, ilum:'nenhuma', led:'fita', pintura:false, cores:1},
      i3d:{peso_g:0, tempo_h:0, semPerda:false, fil:'petg_tr', paredeMm:0, kg:0},
      gabarito:{on:true, modo:'mdf3'}, instalacao:'cliente', alturaInst:1, extras:[], ovr:{}, descEdit:null,
      tipo:'desenho', perfilOv:{},
      painel:{mat:'mdf15', precoChapa:'', L:3, A:2.5, aprov:74, pintura:true, pinturaFator:1.2, recorteMlM2:0, modL:2.5, modA:1.5, mlExtra:0, reqM2:0, metalonM:0, sapatas:0, ferragens:0, dias:{marc:0, serr:0, mont:0, desm:0}},
      avulso:{desc:'', linhas:[{desc:'', qtd:1, un:'un', pu:0, grupo:'mp'}]}};
  }
  function novoItem(tipo, base){
    var j=jobPadrao(); j.tipo=tipo||'desenho';
    if(base){ j.cliente=base.cliente; j.projeto=base.projeto; j.perfil=base.perfil; j.perfilOv=copia(base.perfilOv||{}); j.nf=base.nf; }
    return {job:j, doc:null, buf:null, nomeArq:'', escala:1, larguraReal:0, camadas:{}, geoSalvo:null, printImg:null, r:null};
  }
  function guardar(){
    var it=st.itens[st.sel]; if(!it) return;
    it.job=st.job; it.doc=st.doc; it.buf=st.buf; it.nomeArq=st.nomeArq; it.escala=st.escala; it.larguraReal=st.larguraReal; it.camadas=st.camadas; it.printImg=st.printImg;
    if(st.r&&st.r.geo&&st.r.geo.fonte==='arquivo') it.geoSalvo=st.r.geo; else if(st.geoSalvo) it.geoSalvo=st.geoSalvo;
  }
  function abrirItem(i){
    if(i<0||i>=st.itens.length) return;
    guardar(); st.sel=i; var it=st.itens[i];
    st.job=it.job; st.doc=it.doc; st.buf=it.buf; st.nomeArq=it.nomeArq; st.escala=it.escala; st.larguraReal=it.larguraReal; st.camadas=it.camadas; st.geoSalvo=it.geoSalvo; st.printImg=it.printImg; st.r=it.r;
  }
  /* cliente, projeto, perfil/BDI e NF valem para o orçamento todo */
  function sincGlobal(){ st.itens.forEach(function(it){ if(it.job===st.job) return; var j=it.job; j.cliente=st.job.cliente; j.projeto=st.job.projeto; if(j.perfil!==st.job.perfil) j.ovr=j.ovr; j.perfil=st.job.perfil; j.perfilOv=copia(st.job.perfilOv||{}); j.nf=st.job.nf; }); }
  function carregar(){
    try{
      var j=JSON.parse(localStorage.getItem(LS_JOB)||'null');
      if(j&&j.itens&&j.itens.length){
        st.itens=j.itens.map(function(x){ var it=novoItem(); it.job=mixJob(jobPadrao(),x.job||{}); it.geoSalvo=x.geo||null; it.nomeArq=x.nomeArq||''; it.escala=x.escala||1; it.larguraReal=x.larguraReal||0; it.camadas=x.camadas||{}; return it; });
        st.sel=Math.min(j.sel||0,st.itens.length-1);
      } else if(j&&j.job){
        var it0=novoItem(); it0.job=mixJob(jobPadrao(),j.job); it0.geoSalvo=j.geo||null; it0.nomeArq=j.nomeArq||''; it0.escala=j.escala||1; it0.larguraReal=j.larguraReal||0; it0.camadas=j.camadas||{}; st.itens=[it0]; st.sel=0;
      }
    }catch(e){}
    if(!st.itens.length){ st.itens=[novoItem()]; st.sel=0; }
    var it=st.itens[st.sel];
    st.job=it.job; st.geoSalvo=it.geoSalvo; st.nomeArq=it.nomeArq; st.escala=it.escala; st.larguraReal=it.larguraReal; st.camadas=it.camadas; st.doc=it.doc; st.buf=it.buf; st.printImg=it.printImg;
    try{ st.params=JSON.parse(localStorage.getItem(LS_PAR)||'{}')||{}; }catch(e){ st.params={}; }
  }
  function mixJob(a,b){ Object.keys(b||{}).forEach(function(k){ var v=b[k]; if(v!=null&&typeof v==='object'&&!Array.isArray(v)&&a[k]&&typeof a[k]==='object') a[k]=mixJob(a[k],v); else if(v!=null) a[k]=v; }); return a; }
  function gravarLocal(){
    try{
      guardar();
      localStorage.setItem(LS_JOB, JSON.stringify({sel:st.sel, itens:st.itens.map(function(it){ return {job:it.job, geo:(it.r&&it.r.geo&&it.r.geo.fonte==='arquivo')?it.r.geo:it.geoSalvo, nomeArq:it.nomeArq, escala:it.escala, larguraReal:it.larguraReal, camadas:it.camadas}; })}));
      localStorage.setItem(LS_PAR, JSON.stringify(st.params));
    }catch(e){}
  }
  /* preços e chapas que o Carlos ajustou no Tempo de Router valem aqui também */
  function aplicarCatalogoRtr(){
    var ov={};
    try{ var c=JSON.parse(localStorage.getItem(LS_RTR)||'null'); if(c&&c.presets){ Object.keys(c.presets).forEach(function(id){ var p=c.presets[id]; if(p&&p.op==='corte') ov[id]={preco:p.preco, chapa:p.chapa}; }); } }catch(e){}
    LCX.setCatalogoOv(ov);
  }

  /* ── desenho ── */
  function camadasAtivas(){
    if(!st.doc) return null;
    var a=[]; st.doc.camadas.forEach(function(c){ if(st.camadas[c.nome]!=='ignorar') a.push(c.nome); });
    return a;
  }
  function geoAtual(){
    var j=st.job;
    if(j.entrada==='arquivo'){
      if(st.doc) return LCX.geoDeDoc(st.doc, camadasAtivas());
      if(st.geoSalvo&&st.geoSalvo.fonte==='arquivo'){ var g=copia(st.geoSalvo); g.avisos=(g.avisos||[]).concat(['Arquivo "'+st.nomeArq+'" não está carregado nesta sessão: usando as medidas salvas. Suba de novo para refazer o encaixe de chapas.']); return g; }
      return null;
    }
    return LCX.geoDeTexto(j.texto||j.nome, j.alturaCm, j.qtdLetras);
  }
  function lerArquivo(nome, buf){
    st.ocupado=true; st.erro=null; draw();
    return motor().then(function(){
      var tp=RTR.tipoDe(nome, new Uint8Array(buf));
      var p=(tp==='pdf')?pdfjs():Promise.resolve(null);
      return p.then(function(pj){ return RTR.ler(nome, buf, pj); });
    }).then(function(doc){
      st.buf=buf; st.nomeArq=nome;
      var k=st.escala>0?st.escala:1;
      if(st.larguraReal>0){ var w=doc.bb[2]-doc.bb[0]; if(w>0) k=st.larguraReal/w; }
      st.doc=(k!==1)?RTR.escalar(doc,k):doc;
      /* camadas: anotação, gabarito, vinco e gravação não entram no contorno da peça */
      st.camadas={};
      st.doc.camadas.forEach(function(c){
        var pal=RTR.palpite(nome, c.nome), ign=(pal==='ign'||pal==='acmv'||pal==='reb'||pal==='grav'||/gabarito/i.test(c.nome));
        st.camadas[c.nome]=ign?'ignorar':'peca';
      });
      if(!st.job.nome){ st.job.nome=nome.replace(/\.[a-z0-9]{1,6}$/i,'').replace(/[_\-]+/g,' ').trim(); }
      if(st.doc.qtdSugerida&&st.job.qtd===1) st.msg='O arquivo sugere '+st.doc.qtdSugerida.n+' unidade(s) ('+st.doc.qtdSugerida.fonte+'). Confira a quantidade.';
      st.ocupado=false; recalc(); draw();
    }).catch(function(e){ st.ocupado=false; st.erro=e.message||String(e); draw(); });
  }
  function reLer(){ if(st.buf&&st.nomeArq) return lerArquivo(st.nomeArq, st.buf); return Promise.resolve(); }

  /* ── cálculo ── */
  function geoItem(it){
    var j=it.job;
    if(j.entrada==='arquivo'){
      if(it.doc){ var a=[]; it.doc.camadas.forEach(function(c){ if(it.camadas[c.nome]!=='ignorar') a.push(c.nome); }); return LCX.geoDeDoc(it.doc,a); }
      if(it.geoSalvo&&it.geoSalvo.fonte==='arquivo'){ var g=copia(it.geoSalvo); g.avisos=(g.avisos||[]).concat(['Arquivo "'+it.nomeArq+'" não está carregado nesta sessão: usando as medidas salvas. Suba de novo para refazer o encaixe de chapas.']); return g; }
      return null;
    }
    return LCX.geoDeTexto(j.texto||j.nome, j.alturaCm, j.qtdLetras);
  }
  function calcItem(it){
    var j=it.job, jc=copia(j); jc.params=copia(st.params);
    if(j.tipo==='painel'){ if(!jc.nome) jc.nome='Painel'; return LCX.calcularPainel(jc); }
    if(j.tipo==='avulso'){ if(!jc.nome) jc.nome='Item'; return LCX.calcularAvulso(jc); }
    var geo=geoItem(it); if(!geo||!(geo.pecas>0)) return null;
    jc.geo=geo; if(!jc.nome) jc.nome=geo.nome;
    return LCX.calcular(jc);
  }
  function recalc(){
    st.r=null; st.erro=st.erro&&st.ocupado?st.erro:null;
    if(!window.LCX||!window.RTR) return;
    aplicarCatalogoRtr();
    guardar();
    st.itens.forEach(function(it,i){ try{ it.r=calcItem(it); }catch(e){ it.r=null; if(i===st.sel) st.erro='Erro no cálculo: '+e.message; } });
    st.r=st.itens[st.sel].r;
    st.comb=LCX.combinar(st.itens.map(function(it){ return it.r; }));
    gravarLocal();
  }

  /* ── desenho SVG do contorno ── */
  function previewSvg(doc, ativas){
    var cts=doc.contornos.filter(function(c){ return !c.off&&ativas.indexOf(c.L)>=0; });
    if(!cts.length) return '';
    if(cts.length>3000) cts=cts.slice(0,3000);
    var bb=[Infinity,Infinity,-Infinity,-Infinity];
    cts.forEach(function(c){ if(c.bb[0]<bb[0])bb[0]=c.bb[0]; if(c.bb[1]<bb[1])bb[1]=c.bb[1]; if(c.bb[2]>bb[2])bb[2]=c.bb[2]; if(c.bb[3]>bb[3])bb[3]=c.bb[3]; });
    var w=bb[2]-bb[0], hh=bb[3]-bb[1], pad=Math.max(w,hh)*0.03+1;
    var d='';
    cts.forEach(function(c){
      var p=c.p, s='M';
      for(var i=0;i<p.length;i+=2){ s+=(i?'L':'')+(p[i]-bb[0]+pad).toFixed(2)+' '+(bb[3]-p[i+1]+pad).toFixed(2); }
      d+=s+(c.c?'Z':'');
    });
    return '<svg viewBox="0 0 '+(w+2*pad).toFixed(1)+' '+(hh+2*pad).toFixed(1)+'" style="width:100%;max-height:230px;background:#FAF8F2;border:1px solid var(--line);border-radius:8px">'
      +'<path d="'+d+'" fill="#FF5A1F" fill-opacity=".28" fill-rule="evenodd" stroke="#C2410C" stroke-width="'+(Math.max(w,hh)/700).toFixed(3)+'"/></svg>';
  }

  /* ── campos ── */
  function fld(lb, ctl, w){ return '<label class="lcx-f" style="flex:'+(w||'1 1 150px')+'"><span>'+lb+'</span>'+ctl+'</label>'; }
  function inp(path,val,tipo,extra){ return '<input data-k="'+path+'" data-t="'+(tipo||'t')+'" type="'+(tipo==='n'?'text':'text')+'" inputmode="'+(tipo==='n'?'decimal':'text')+'" value="'+esc(tipo==='n'?inVal(val):val)+'" '+(extra||'')+'>'; }
  function sel(path,val,opts){ var h='<select data-k="'+path+'" data-t="s">'; opts.forEach(function(o){ h+='<option value="'+esc(o[0])+'"'+(String(o[0])===String(val)?' selected':'')+'>'+esc(o[1])+'</option>'; }); return h+'</select>'; }
  function chk(path,val,lb){ return '<label class="lcx-c"><input data-k="'+path+'" data-t="c" type="checkbox"'+(val?' checked':'')+'> '+lb+'</label>'; }
  function optMat(fams,extra){
    var o=[]; (extra||[]).forEach(function(e){ o.push(e); });
    LCX.listaMateriais(fams).forEach(function(m){ o.push([m.id, m.nome+(m.preco>0?' — '+fmt(m.preco)+'/chapa':' — sem preço')]); });
    return o;
  }

  /* ═════════ TELA ═════════ */
  function estilo(){
    if(document.getElementById('lcx-css')) return;
    var s=document.createElement('style'); s.id='lcx-css';
    s.textContent='.lcx{padding:24px 26px;max-width:1180px}.lcx h2{font-family:var(--font-d);font-size:21px;font-weight:800;letter-spacing:-.3px}'
    +'.lcx .sub{color:var(--mut);font-size:12.5px;margin:3px 0 16px;max-width:760px}.lcx-row{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px}'
    +'.lcx input,.lcx select,.lcx textarea{box-sizing:border-box}.lcx-f{display:flex;flex-direction:column;gap:4px;min-width:0}.lcx-f>span{font-size:10.5px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--mut)}'
    +'.lcx input[type=text],.lcx select,.lcx textarea{border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:inherit;font-size:13px;background:#fff;width:100%;color:var(--ink)}'
    +'.lcx textarea{min-height:320px;line-height:1.5}.lcx-c{display:inline-flex;align-items:center;gap:6px;font-size:13px;padding-bottom:8px}'
    +'.lcx-tabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:12px;border-bottom:1px solid var(--line)}.lcx-tab{background:none;border:none;border-bottom:3px solid transparent;padding:8px 14px;font:inherit;font-size:13px;font-weight:600;color:var(--mut);cursor:pointer}'
    +'.lcx-tab.on{color:var(--ink);border-bottom-color:var(--accent)}.lcx table{width:100%;border-collapse:collapse;font-size:12.5px}'
    +'.lcx td{padding:7px 9px;border-bottom:1px solid var(--line);vertical-align:middle}.lcx td.n,.lcx th.n{text-align:right;white-space:nowrap}'
    +'.lcx tr.g td{background:#F5F4F0;font-weight:700;font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:var(--mut)}.lcx tr.s td{font-weight:600}.lcx tr.t td{font-weight:800;font-size:14px;border-top:2px solid var(--ink)}'
    +'.lcx td input.v{width:92px;text-align:right;padding:4px 6px}.lcx td input.v.m{background:var(--warn-soft);border-color:var(--warn)}'
    +'.lcx-aviso{background:var(--warn-soft);color:#8A4B04;border:1px solid #EBC889;border-radius:8px;padding:8px 12px;font-size:12.5px;margin-bottom:8px}'
    +'.lcx-erro{background:var(--danger-soft);color:var(--danger);border:1px solid #F0B8B2;border-radius:8px;padding:8px 12px;font-size:12.5px;margin-bottom:8px}'
    +'.lcx-ok{background:var(--ok-soft);color:#0E6B3A;border:1px solid #A9DDC1;border-radius:8px;padding:8px 12px;font-size:12.5px;margin-bottom:8px}'
    +'.lcx-mut{color:var(--mut);font-size:12px}.lcx-seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}.lcx-seg button{background:#fff;border:none;border-right:1px solid var(--line);padding:7px 14px;font:inherit;font-size:13px;cursor:pointer}'
    +'.lcx-seg button:last-child{border-right:none}.lcx-seg button.on{background:var(--ink);color:#fff;font-weight:600}.lcx-geo{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin:10px 0}'
    +'.lcx-geo div{background:#F5F4F0;border-radius:8px;padding:8px 10px}.lcx-geo b{display:block;font-size:15px}.lcx-geo span{font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--mut)}'
    +'.lcx-chips{display:flex;gap:6px;flex-wrap:wrap}.lcx-chip{background:#fff;border:1px solid var(--line);border-radius:4px;padding:6px 10px;font:inherit;font-size:12px;cursor:pointer;text-align:left}.lcx-chip.on{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}.lcx-chip b{color:var(--accent)}.lcx td input[type=text]{width:100%}.lcx-bar{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.lcx .two{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:820px){.lcx .two{grid-template-columns:1fr}.lcx{padding:16px}}';
    document.head.appendChild(s);
  }

  /* ── itens do orçamento ── */
  var TIPOS={desenho:'Desenho', painel:'Painel', avulso:'Avulso'};
  function barraItens(){
    var h='<div class="card"><h3>Itens do orçamento <span class="lcx-mut" style="font-weight:400;text-transform:none;letter-spacing:0">· quantos precisar</span></h3><div class="lcx-chips">';
    st.itens.forEach(function(it,i){
      var r=it.r, nome=it.job.nome||(r&&r.geo&&r.geo.nome)||('Item '+(i+1));
      h+='<button type="button" class="lcx-chip'+(i===st.sel?' on':'')+'" data-a="item-sel" data-v="'+i+'"><b>'+(i+1)+'</b> '+esc(nome)+' <span class="lcx-mut">'+TIPOS[it.job.tipo||'desenho']+(r?' · '+fmt(r.vendaNF):'')+'</span></button>';
    });
    h+='</div><div class="lcx-bar" style="margin-top:8px"><button type="button" class="btn acc sm" data-a="item-add" data-v="desenho">+ Desenho (letra, logo)</button><button type="button" class="btn acc sm" data-a="item-add" data-v="painel">+ Painel recortado</button><button type="button" class="btn acc sm" data-a="item-add" data-v="avulso">+ Item avulso</button>'
      +'<span style="flex:1"></span><button type="button" class="btn ghost sm" data-a="item-dup">Duplicar item</button><button type="button" class="btn ghost sm" data-a="item-up">◀</button><button type="button" class="btn ghost sm" data-a="item-down">▶</button><button type="button" class="btn ghost sm" data-a="item-del">Remover item</button></div>';
    if(st.comb) h+='<div class="lcx-mut" style="margin-top:8px">'+st.itens.length+' item(ns) · custo '+fmt(st.comb.custo)+' · <b>total '+fmt(st.comb.vendaNF)+'</b>'+(st.comb.nfPct>0?' (com NF)':' (sem NF)')+'</div>';
    return h+'</div>';
  }
  function secPainel(){
    var j=st.job, p=j.painel, h='<div class="card"><h3>2 · Painel recortado</h3>';
    var mats=optMat(null);
    h+='<div class="lcx-row">'+fld('Material', sel('job.painel.mat',p.mat,mats),'2 1 240px')+fld('Nome do material (opcional)', inp('job.painel.matNome',p.matNome||'','t'),'1 1 170px')+fld('R$ por chapa (vazio = catálogo)', inp('job.painel.precoChapa',p.precoChapa,'n'),'1 1 130px')+fld('Largura (m)', inp('job.painel.L',p.L,'n'),'0 1 90px')+fld('Altura (m)', inp('job.painel.A',p.A,'n'),'0 1 90px')+fld('Qtd de painéis', inp('job.qtd',j.qtd,'n'),'0 1 90px')+fld('Aproveitamento (%)', inp('job.painel.aprov',p.aprov,'n'),'0 1 110px')+'</div>';
    h+='<div class="lcx-row">'+fld('Recorte (m.l. por m²)', inp('job.painel.recorteMlM2',p.recorteMlM2,'n'),'1 1 130px')+fld('Módulo da chapa L (m)', inp('job.painel.modL',p.modL,'n'),'0 1 110px')+fld('Módulo A (m)', inp('job.painel.modA',p.modA,'n'),'0 1 110px')+fld('Corte extra (m.l.)', inp('job.painel.mlExtra',p.mlExtra,'n'),'0 1 110px')+fld('Requadro (m² líq.)', inp('job.painel.reqM2',p.reqM2,'n'),'0 1 110px')+'</div>';
    h+='<div class="lcx-row"><div>'+chk('job.painel.pintura',p.pintura!==false,'Pintura PU')+'</div>'+fld('Pintura (m² por m²)', inp('job.painel.pinturaFator',p.pinturaFator,'n'),'0 1 120px')+fld('Metalon (m por painel)', inp('job.painel.metalonM',p.metalonM,'n'),'0 1 130px')+fld('Sapatas (por painel)', inp('job.painel.sapatas',p.sapatas,'n'),'0 1 120px')+fld('Ferragens (pç)', inp('job.painel.ferragens',p.ferragens,'n'),'0 1 110px')+'</div>';
    h+='<div class="lcx-row">'+fld('Diárias marceneiro', inp('job.painel.dias.marc',p.dias.marc,'n'),'0 1 120px')+fld('Diárias serralheiro', inp('job.painel.dias.serr',p.dias.serr,'n'),'0 1 120px')+fld('Diárias montador', inp('job.painel.dias.mont',p.dias.mont,'n'),'0 1 120px')+fld('Diárias desmontagem', inp('job.painel.dias.desm',p.dias.desm,'n'),'0 1 130px')+'</div>';
    h+='<div class="lcx-mut">Material = área ÷ aproveitamento × preço da chapa por m². Router: recorte × área + contorno dos módulos, a R$ '+nf((LCX.PERFIS[j.perfil]||{}).routerML||0,2)+'/m.l. na venda. Consumíveis 5% sobre tudo menos MO e router (router a R$ 4). Diária R$ 250.</div></div>';
    return h;
  }
  function secAvulso(){
    var j=st.job, av=j.avulso, h='<div class="card"><h3>2 · Item avulso <span class="lcx-mut" style="font-weight:400;text-transform:none;letter-spacing:0">· linhas livres (arcos, estruturas, o que não é letra nem painel)</span></h3>';
    h+='<div class="lcx-row">'+fld('Descrição do item para a proposta', inp('job.avulso.desc',av.desc,'t'),'1 1 100%')+fld('Quantidade do item', inp('job.qtd',j.qtd,'n'),'0 1 120px')+'</div>';
    h+='<table><thead><tr><th>Descrição da linha</th><th class="n">Qtd</th><th>Un</th><th class="n">Valor unit. (R$)</th><th>Grupo</th><th></th></tr></thead><tbody>';
    var G=[['mp','Materiais'],['eqp','Equipamentos / corte'],['mo','Mão de obra'],['cons','Consumíveis'],['proj','Projeto'],['log','Logística'],['inst','Instalação'],['out','Outros']];
    av.linhas.forEach(function(x,i){
      var b='job.avulso.linhas.'+i+'.';
      h+='<tr><td>'+inp(b+'desc',x.desc,'t')+'</td><td class="n"><input class="v" type="text" inputmode="decimal" data-k="'+b+'qtd" data-t="n" value="'+inVal(x.qtd)+'"></td><td>'+sel(b+'un',x.un,[['un','un'],['m²','m²'],['m','m'],['m.l.','m.l.'],['ml router','ml router (valor na venda)'],['h','h'],['dia','dia'],['chapa','chapa'],['pç','pç'],['vb','vb']])+'</td><td class="n"><input class="v" type="text" inputmode="decimal" data-k="'+b+'pu" data-t="n" value="'+inVal(x.pu)+'"></td><td>'+sel(b+'grupo',x.grupo||'mp',G)+'</td><td><button type="button" class="btn ghost sm" data-a="avulso-del" data-k="'+i+'">×</button></td></tr>';
    });
    h+='</tbody></table><div class="lcx-bar"><button type="button" class="btn ghost sm" data-a="avulso-add">+ Linha</button></div>';
    h+='<div class="lcx-mut" style="margin-top:6px">Valores a custo. Na unidade "ml router" digite o valor de venda por m.l. (ex.: 8): o custo é calculado dividindo pelo fator do BDI.</div></div>';
    return h;
  }
  function secResumo(){
    var c=st.comb; if(!c||st.itens.length<2&&!c) return '';
    var h='<div class="card"><h3>Resumo do orçamento · '+st.itens.length+' item(ns)</h3><table><thead><tr><th>#</th><th>Item</th><th>Tipo</th><th class="n">Qtd</th><th class="n">Custo</th><th class="n">Venda</th></tr></thead><tbody>';
    st.itens.forEach(function(it,i){ var r=it.r; h+='<tr><td>'+(i+1)+'</td><td>'+esc(it.job.nome||(r&&r.geo&&r.geo.nome)||'—')+'</td><td>'+TIPOS[it.job.tipo||'desenho']+'</td><td class="n">'+(r?r.qtd:'—')+'</td><td class="n">'+(r?fmt(r.custo):'—')+'</td><td class="n">'+(r?fmt(r.vendaNF):'<span class="lcx-mut">sem cálculo</span>')+'</td></tr>'; });
    h+='<tr class="t"><td colspan="4">TOTAL'+(c.nfPct>0?' (com NF)':' (sem NF)')+'</td><td class="n">'+fmt(c.custo)+'</td><td class="n">'+fmt(c.vendaNF)+'</td></tr></tbody></table>';
    h+='<div class="lcx-bar">'+(window.LCX_EXPORT_ORC?'<button type="button" class="btn acc" data-a="orcfile" style="padding:12px 22px;font-size:14px">⬇ Exportar no formato ORC (todos os itens)</button>':'')+'<button type="button" class="btn ghost" data-a="csvlevall">Levantamento de materiais (CSV, todos)</button><select id="lcx-mppor" title="Quem compra a matéria-prima"><option value="pdvex">Chapas: PDVEX fornece (informativo)</option><option value="sulsign">Chapas: Sul Sign compra (cobrada)</option></select><button type="button" class="btn ghost" data-a="osjson">Gerar OS PDVEX (planilha)</button><button type="button" class="btn ghost" data-a="propostaall">Baixar proposta (todos)</button></div></div>';
    return h;
  }
  function secPeca(){
    var j=st.job, perfis=Object.keys(LCX.PERFIS).map(function(k){ return [k, LCX.PERFIS[k].nome]; });
    var h='<div class="card"><h3>1 · Peça e cliente</h3>';
    h+='<div class="lcx-row">'+fld('Nome da peça', inp('job.nome',j.nome,'t'),'2 1 220px')+fld('Cliente', inp('job.cliente',j.cliente,'t'),'2 1 200px')+fld('Projeto / evento', inp('job.projeto',j.projeto,'t'),'2 1 200px')+'</div>';
    h+='<div class="lcx-row">'+fld('Print / imagem do projeto (vai para o ORC)','<input type="file" id="lcx-print" accept="image/*">'+(st.printImg?'<img src="'+st.printImg+'" style="max-height:70px;margin-top:6px;border:1px solid var(--line);border-radius:3px;align-self:flex-start"> <button type="button" class="btn ghost sm" data-a="print-del" style="align-self:flex-start">remover</button>':''),'1 1 300px')+'</div>';
    h+='<div class="lcx-row">'+fld('Perfil de preço (BDI e router)', sel('job.perfil',j.perfil,perfis),'3 1 280px')
      +(j.tipo==='desenho'||!j.tipo?fld('Quantidade', inp('job.qtd',j.qtd,'n'),'0 1 90px')+fld('Complexidade', sel('job.complexidade',j.complexidade,LCX.COMPLEX.map(function(c){ return [c.id,c.nome]; })),'1 1 150px')+fld('Instalação', sel('job.instalacao',j.instalacao,[['cliente','Por conta do cliente'],['sulsign','Sul Sign instala'],['pdvex','Por conta da PDVEX']]),'1 1 190px'):'');
    if(j.tipo==='desenho'&&j.instalacao==='sulsign') h+=fld('Fator de altura', inp('job.alturaInst',j.alturaInst,'n'),'0 1 100px');
    h+='<div>'+chk('job.nf',j.nf,'Com nota fiscal')+'</div></div></div>';
    return h;
  }
  function secBdi(){
    var j=st.job, r=st.r, base=LCX.PERFIS[j.perfil]||LCX.PERFIS.sulsign, ov=j.perfilOv||{};
    function v(k){ return ov[k]!=null?ov[k]:base[k]; }
    function f(lb,k,w){ return fld(lb, inp('job.perfilOv.'+k, v(k), 'n'), w||'1 1 96px'); }
    var h='<div class="card"><h3>BDI e preço <span class="lcx-mut" style="font-weight:400;text-transform:none;letter-spacing:0">· editável, recalcula na hora</span></h3><div class="lcx-row">'
      +f('AC s/ venda %','acVenda')+f('AC s/ custo %','acCusto')+f('Desp. financ. %','df')+f('Risco/imprev. %','ri')+f('Lucro %','lucro')+f('Impostos s/ venda %','imp')+f('Taxa NF %','nfPct')+f('Router R$/m.l. (venda)','routerML','1 1 130px')
      +'<div style="padding-bottom:6px"><button type="button" class="btn ghost sm" data-a="bdi-reset">Padrão do perfil</button></div></div>'
      +'<div class="lcx-mut">Fator BDI <b>'+(r?nf(r.fator,4):'—')+'×</b> = (1 + AC custo + DF + RI) ÷ (1 − Lucro − Impostos − AC venda). A NF entra por fora quando "Com nota fiscal" está marcada.</div></div>';
    return h;
  }
  function secDesenho(){
    var j=st.job, h='<div class="card"><h3>2 · Desenho</h3>';
    h+='<div class="lcx-row"><div class="lcx-seg"><button type="button" data-a="entrada" data-v="arquivo" class="'+(j.entrada==='arquivo'?'on':'')+'">Arquivo (DXF, SVG, Aspire…)</button><button type="button" data-a="entrada" data-v="texto" class="'+(j.entrada==='texto'?'on':'')+'">Texto + altura</button></div></div>';
    if(j.entrada==='arquivo'){
      h+='<div class="lcx-row"><label class="lcx-f" style="flex:2 1 280px"><span>Arquivo do desenho</span><input type="file" id="lcx-file" accept=".dxf,.svg,.crv3d,.crv,.eps,.ps,.ai,.pdf"></label>'
        +fld('Escala do arquivo', sel('escala',st.escala,[[1,'mm (padrão)'],[10,'cm → mm'],[25.4,'polegadas → mm'],[1000,'m → mm']]),'1 1 150px')
        +fld('Largura real do conjunto (mm)', '<input data-k="larguraReal" data-t="n" type="text" inputmode="decimal" placeholder="opcional" value="'+(st.larguraReal>0?inVal(st.larguraReal):'')+'">','1 1 170px')+'</div>';
      if(st.ocupado) h+='<div class="lcx-mut">Lendo o arquivo…</div>';
      if(st.doc){
        var ativas=camadasAtivas(), geo=st.r?st.r.geo:LCX.geoDeDoc(st.doc,ativas);
        h+='<div class="two"><div>'+previewSvg(st.doc,ativas)+'</div><div>';
        h+='<div class="lcx-mut" style="margin-bottom:6px">'+esc(st.nomeArq)+' · '+esc(st.doc.formato)+'</div>';
        h+='<table><thead><tr><th>Camada</th><th class="n">Contornos</th><th class="n">m.l.</th><th>Uso</th></tr></thead><tbody>';
        st.doc.camadas.forEach(function(c){
          var uso=st.camadas[c.nome]||'peca';
          h+='<tr><td>'+esc(c.nome)+'</td><td class="n">'+c.n+'</td><td class="n">'+nf(c.len/1000,2)+'</td><td><select data-camada="'+esc(c.nome)+'"><option value="peca"'+(uso==='peca'?' selected':'')+'>Contorno da peça</option><option value="ignorar"'+(uso==='ignorar'?' selected':'')+'>Ignorar</option></select></td></tr>';
        });
        h+='</tbody></table></div></div>';
      } else if(st.geoSalvo&&st.geoSalvo.fonte==='arquivo'){
        h+='<div class="lcx-aviso">Última medição salva: '+esc(st.nomeArq)+'. Suba o arquivo de novo para refazer o encaixe.</div>';
      }
      var g=st.r?st.r.geo:(st.geoSalvo&&st.geoSalvo.fonte==='arquivo'?st.geoSalvo:null);
      if(g) h+=geoKpis(g);
    } else {
      h+='<div class="lcx-row">'+fld('Texto das letras', inp('job.texto',j.texto,'t'),'2 1 220px')+fld('Altura da letra (cm)', inp('job.alturaCm',j.alturaCm,'n'),'0 1 130px')+fld('Nº de letras (vazio = conta o texto)', inp('job.qtdLetras',j.qtdLetras||'','n'),'0 1 160px')+'</div>';
      h+='<div class="lcx-aviso">Sem arquivo a geometria é estimada pela altura (preenchimento de 45%). Para fechar o orçamento, suba o DXF ou SVG.</div>';
      if(st.r) h+=geoKpis(st.r.geo);
    }
    return h+'</div>';
  }
  function geoKpis(g){
    return '<div class="lcx-geo"><div><b>'+g.pecas+'</b><span>peças</span></div><div><b>'+g.vazados+'</b><span>vazados</span></div><div><b>'+nf(g.bboxMm[0],0)+' × '+nf(g.bboxMm[1],0)+'</b><span>mm (conjunto)</span></div><div><b>'+nf(g.areaM2*1e4,0)+' cm²</b><span>área líquida</span></div><div><b>'+nf(g.perimM,2)+' m</b><span>contorno de corte</span></div></div>';
  }
  function secConstr(){
    var j=st.job, c=j.constr, h='<div class="card"><h3>3 · Construção</h3>';
    h+='<div class="lcx-row"><div class="lcx-seg"><button type="button" data-a="constr" data-v="chapada" class="'+(c==='chapada'?'on':'')+'">Chapada + vinil</button><button type="button" data-a="constr" data-v="caixa" class="'+(c==='caixa'?'on':'')+'">Caixa com face</button><button type="button" data-a="constr" data-v="impressao3d" class="'+(c==='impressao3d'?'on':'')+'">Impressão 3D</button></div></div>';
    if(c==='chapada'){
      h+='<div class="lcx-row">'+fld('Material da peça', sel('job.chapada.mat',j.chapada.mat,optMat(['PVC','MDF','ACM','Acrílico','Compensado','PS'])),'3 1 300px')
        +fld('Acabamento da frente', sel('job.chapada.acab',j.chapada.acab,[['vinil','Adesivo vinil impresso'],['pintura','Pintura PU'],['nenhum','Sem acabamento']]),'1 1 200px');
      if(j.chapada.acab==='vinil') h+=fld('Vinil', sel('job.chapada.vinil',j.chapada.vinil,[['fosco','Fosco'],['uv','Fosco + UV'],['lam','Fosco + laminação'],['recorte','Recorte (cores)']]),'1 1 180px');
      if(j.chapada.acab==='pintura') h+=fld('Nº de cores', inp('job.chapada.cores',j.chapada.cores,'n'),'0 1 100px');
      h+='</div>';
    } else if(c==='caixa'){
      var cj=j.caixa;
      h+='<div class="lcx-row">'+fld('Face', sel('job.caixa.face',cj.face,optMat(['Acrílico','PVC','ACM','PS'])),'2 1 260px')+fld('Lateral', sel('job.caixa.lateral',cj.lateral,optMat(['PVC','ACM','MDF','Compensado','Acrílico'])),'2 1 260px')
        +fld('Fundo', sel('job.caixa.fundo',cj.fundo,optMat(['PVC','ACM','MDF'],[['sem','Sem fundo']])),'2 1 260px')+fld('Profundidade (cm)', inp('job.caixa.prof',cj.prof,'n'),'0 1 110px')+'</div>';
      h+='<div class="lcx-row">'+fld('Iluminação', sel('job.caixa.ilum',cj.ilum,[['nenhuma','Sem luz'],['halo','Bafo de luz (halo)'],['frontlit','Frontal'],['backlight','Backlight'],['dupla','Frontal + bafo']]),'1 1 190px');
      if(cj.ilum!=='nenhuma') h+=fld('Tipo de LED', sel('job.caixa.led',cj.led,Object.keys(LCX.PARAMS.led).map(function(k){ return [k,LCX.PARAMS.led[k].nome]; })),'1 1 170px');
      h+='<div>'+chk('job.caixa.pintura',cj.pintura,'Pintura PU (face e lateral)')+'</div>';
      if(cj.pintura) h+=fld('Nº de cores', inp('job.caixa.cores',cj.cores,'n'),'0 1 100px');
      h+='</div>';
    } else {
      var i3=j.i3d;
      var fl=LCX.PARAMS.p3d.fils, fk=(i3.fil==='petg'||!i3.fil)?'petg_tr':i3.fil, kgp=LCX.PARAMS.p3d.kg[fk];
      var tpa=(i3.paredeMm>0?i3.paredeMm:null), geoM=(st.r&&st.r.geo&&st.r.geo.bboxMm)||[0,0], tauto=LCX.paredeAuto(Math.max(geoM[0]||0,geoM[1]||0,(j.caixa.prof||5)*10));
      h+='<div class="lcx-row">'+fld('Peso do fatiador (g, 1 un)', inp('job.i3d.peso_g',i3.peso_g||'','n'),'1 1 150px')+fld('Tempo do fatiador (h, 1 un)', inp('job.i3d.tempo_h',i3.tempo_h||'','n'),'1 1 150px')
        +'<div style="padding-bottom:6px"><label class="btn ghost sm" style="cursor:pointer">Ler G-code do PrusaSlicer…<input type="file" id="lcx-gcode" accept=".gcode,.gco,.g,.txt" multiple style="display:none"></label></div>'
        +'<div>'+chk('job.i3d.semPerda',i3.semPerda,'Já inclui perda/falhas')+'</div></div>';
      h+='<div class="lcx-row">'+fld('Filamento (acabamento)', sel('job.i3d.fil',fk,Object.keys(fl).map(function(k){ return [k,fl[k].nome+' — R$ '+LCX.PARAMS.p3d.kg[k]+'/kg']; })),'2 1 230px')
        +fld('R$/kg (vazio = padrão)', inp('job.i3d.kg',i3.kg||'','n'),'0 1 130px')
        +fld('Parede (mm) — vazio = automática ('+nf(tauto,1)+' mm)', inp('job.i3d.paredeMm',tpa||'','n'),'1 1 200px')+'</div>';
      if(st.gcMsg) h+='<div class="lcx-mut" style="margin:-4px 0 8px">'+esc(st.gcMsg)+'</div>';
      h+='<div class="lcx-row">'+fld('Profundidade (cm)', inp('job.caixa.prof',j.caixa.prof,'n'),'0 1 110px')+fld('Iluminação', sel('job.caixa.ilum',j.caixa.ilum,[['nenhuma','Sem luz'],['halo','Bafo de luz'],['frontlit','Frontal'],['backlight','Backlight']]),'1 1 170px');
      if(j.caixa.ilum!=='nenhuma') h+=fld('Tipo de LED', sel('job.caixa.led',j.caixa.led,Object.keys(LCX.PARAMS.led).map(function(k){ return [k,LCX.PARAMS.led[k].nome]; })),'1 1 170px');
      h+='</div>';
    }
    h+='<div class="lcx-row" style="margin-top:6px"><div>'+chk('job.gabarito.on',j.gabarito.on,'Gabarito de instalação')+'</div>';
    if(j.gabarito.on) h+=fld('Tipo de gabarito', sel('job.gabarito.modo',j.gabarito.modo,[['mdf3','MDF 3 mm cortado (margem 6 cm, janelas no contorno)'],['papel','Impresso 1:1 com marcas de furo']]),'2 1 340px');
    h+='</div></div>';
    return h;
  }

  /* ── resultado ── */
  function secResultado(){
    var r=st.r;
    if(!r){
      return '<div class="card"><h3>4 · Resultado</h3><div class="lcx-mut">'+(st.job.entrada==='arquivo'?'Suba o arquivo do desenho para calcular.':'Informe o texto e a altura.')+'</div></div>';
    }
    var h='<div class="kpis" style="margin:4px 0 14px">';
    h+='<div class="kpi"><div class="lb">Custo</div><div class="vl">'+fmt(r.custo)+'</div><div class="dt">'+r.linhas.length+' linhas · '+fmt(r.custo/r.qtd)+' por un</div></div>';
    h+='<div class="kpi"><div class="lb">Venda · '+esc(r.perfil.id)+'</div><div class="vl">'+fmt(r.venda)+'</div><div class="dt">fator '+nf(r.fator,4)+'×</div></div>';
    if(r.nfPct>0) h+='<div class="kpi"><div class="lb">Venda com NF (+'+r.nfPct+'%)</div><div class="vl">'+fmt(r.vendaNF)+'</div><div class="dt">imposto da nota por fora</div></div>';
    h+='<div class="kpi"><div class="lb">Valor por unidade</div><div class="vl">'+fmt(r.unitario)+'</div><div class="dt">'+r.qtd+' un · '+(r.nfPct>0?'com NF':'sem NF')+'</div></div></div>';
    if(window.LCX_EXPORT_ORC) h+='<div style="margin:0 0 14px"><button type="button" class="btn acc" data-a="orcfile" style="padding:12px 22px;font-size:14px">⬇ Exportar no formato ORC (todos os itens)</button> <span class="lcx-mut">memorial, BDIs editáveis, Proposta, Sintético e artes</span></div>';
    (r.avisos||[]).forEach(function(a){ h+='<div class="lcx-aviso">'+esc(a)+'</div>'; });
    if(st.msg) h+='<div class="lcx-ok">'+esc(st.msg)+'</div>';
    h+='<div class="card"><div class="lcx-tabs">';
    [['sint','Sintético'],['custo','Memorial de custo'],['lev','Levantamento de materiais'],['desc','Memorial descritivo'],['base','Base de preços']].forEach(function(t){ h+='<button type="button" class="lcx-tab'+(st.aba===t[0]?' on':'')+'" data-a="aba" data-v="'+t[0]+'">'+t[1]+'</button>'; });
    h+='</div>';
    if(st.aba==='sint') h+=abaSint(r); else if(st.aba==='custo') h+=abaCusto(r); else if(st.aba==='lev') h+=abaLev(r); else if(st.aba==='desc') h+=abaDesc(r); else h+=abaBase(r);
    h+='</div>';
    return h;
  }
  function abaSint(r){
    var h='<table><thead><tr><th>Descrição</th><th class="n">Qtd</th><th>Un</th><th class="n">Valor unit.</th><th class="n">Total</th></tr></thead><tbody>';
    r.sintetico.linhas.forEach(function(l){ h+='<tr><td>'+esc(l.desc)+'</td><td class="n">'+nf(l.qtd,l.qtd%1?2:0)+'</td><td>'+esc(l.un)+'</td><td class="n">'+fmt(l.valorUn)+'</td><td class="n">'+fmt(l.total)+'</td></tr>'; });
    h+='<tr class="t"><td colspan="4">TOTAL'+(r.nfPct>0?' (com NF)':' (sem NF)')+'</td><td class="n">'+fmt(r.sintetico.total)+'</td></tr></tbody></table>';
    h+='<div class="lcx-mut" style="margin-top:8px">Uma linha por peça do orçamento, no formato do Sintético do ORC. Perfil: '+esc(r.perfil.nome)+'.</div>';
    h+='<div class="lcx-bar">'+(window.SS20&&SS20.standalone?'':'<button type="button" class="btn acc" data-a="orc">Gravar em Orçamentos</button>')+'<button type="button" class="btn" data-a="proposta">Baixar proposta (HTML)</button><button type="button" class="btn ghost" data-a="csvos">Linhas para a OS (CSV)</button><button type="button" class="btn ghost" data-a="copiarsint">Copiar Sintético</button><button type="button" class="btn ghost" data-a="json">Baixar JSON do cálculo</button><button type="button" class="btn ghost" data-a="novo">Novo orçamento</button></div>';
    return h;
  }
  function abaCusto(r){
    var h='<table><thead><tr><th>Descrição</th><th class="n">Qtd</th><th>Un</th><th class="n">Unitário</th><th class="n">Custo</th><th>Base</th></tr></thead><tbody>';
    r.grupos.forEach(function(g){
      h+='<tr class="g"><td colspan="6">'+esc(g.nome)+'</td></tr>';
      g.linhas.forEach(function(l){
        h+='<tr><td>'+esc(l.desc)+(l.manual?' <button type="button" class="btn ghost sm" data-a="ovr-reset" data-k="'+esc(l.chave)+'" title="voltar ao cálculo">↺</button>':'')+'</td><td class="n">'+nf(l.qtd,l.qtd%1?2:0)+'</td><td>'+esc(l.un)+'</td><td class="n">'+nf(l.pu,2)+'</td>'
          +'<td class="n"><input class="v'+(l.manual?' m':'')+'" type="text" inputmode="decimal" data-ovr="'+esc(l.chave)+'" value="'+inVal(l.custo)+'"></td><td class="lcx-mut">'+esc(l.nota)+(l.chave.indexOf('extra')===0?' <button type="button" class="btn ghost sm" data-a="extra-del" data-k="'+esc(l.chave)+'">✕</button>':'')+'</td></tr>';
      });
      h+='<tr class="s"><td colspan="4">Subtotal</td><td class="n">'+fmt(g.custo)+'</td><td></td></tr>';
    });
    h+='<tr class="t"><td colspan="4">CUSTO TOTAL</td><td class="n">'+fmt(r.custo)+'</td><td></td></tr>';
    h+='<tr class="s"><td colspan="4">× fator '+nf(r.fator,4)+' ('+esc(r.perfil.id)+')</td><td class="n">'+fmt(r.venda)+'</td><td></td></tr></tbody></table>';
    h+='<div class="lcx-bar"><button type="button" class="btn ghost sm" data-a="extra-add">+ Linha avulsa</button></div>';
    h+='<div class="lcx-mut" style="margin-top:6px">Valores em amarelo foram ajustados à mão. O router entra a custo de venda ÷ fator, para render R$ '+nf(r.perfil.routerML,2)+'/m.l. na venda do perfil.</div>';
    return h;
  }
  function tempoRouter(r){
    try{
      if(!st.doc||!window.RTR) return null;
      var c=r.job.constr, matId=(c==='chapada'?(r.job.chapada||{}).mat:(r.job.caixa||{}).face)||'pvc15', pr=null, i;
      for(i=0;i<RTR.PRESETS.length;i++){ if(RTR.PRESETS[i].id===matId) pr=RTR.PRESETS[i]; }
      if(!pr) return null;
      var ops={}; camadasAtivas().forEach(function(n){ ops[n]=matId; });
      var cfg={presets:{}, maq:RTR.MAQ, cob:RTR.COB}; cfg.presets[matId]=pr;
      var C=RTR.calcular([{id:'a', doc:st.doc, qtd:r.qtd, ops:ops}], cfg, {modo:'usada'});
      return {min:C.tot.total, maquina:C.tot.maquina, chapas:C.tot.chapas};
    }catch(e){ return null; }
  }
  function abaLev(r){
    var L=LCX.levantamento(r), h='<h4 style="margin:0 0 6px;font-size:13px">Materiais</h4>';
    h+='<table><thead><tr><th>Material</th><th>Uso</th><th class="n">Quantidade</th><th>Medida</th><th class="n">Aproveitamento</th><th class="n">Custo</th><th>Base</th></tr></thead><tbody>';
    L.materiais.forEach(function(m){ h+='<tr><td>'+esc(m.material)+'</td><td>'+esc(m.uso)+'</td><td class="n">'+esc(m.qtd)+'</td><td>'+esc(m.un||m.medida)+'</td><td class="n">'+(m.aproveitamento!=null?m.aproveitamento+'%':'—')+'</td><td class="n">'+fmt(m.custo)+'</td><td class="lcx-mut">'+esc(m.nota)+'</td></tr>'; });
    h+='</tbody></table>';
    if(L.componentes.length){ h+='<h4 style="margin:14px 0 6px;font-size:13px">Componentes e corte</h4><table><tbody>'; L.componentes.forEach(function(c){ h+='<tr><td>'+esc(c.item)+'</td><td class="n">'+nf(c.qtd,c.qtd%1?2:0)+' '+esc(c.un)+'</td></tr>'; }); h+='</tbody></table>'; }
    if(L.horas.length){ h+='<h4 style="margin:14px 0 6px;font-size:13px">Mão de obra</h4><table><tbody>'; L.horas.forEach(function(c){ h+='<tr><td>'+esc(c.item)+'</td><td class="n">'+nf(c.horas,2)+' h</td><td class="n">'+fmt(c.valorHora)+'/h</td></tr>'; }); h+='</tbody></table>'; }
    var tr=tempoRouter(r);
    if(tr) h+='<div class="lcx-mut" style="margin-top:10px">Tempo de máquina estimado (Tempo de Router, só a peça): <b>'+RTR.hm(tr.maquina)+'</b> de corte · '+RTR.hm(tr.min)+' com preparo e programação.</div>';
    h+='<div class="lcx-bar"><button type="button" class="btn ghost" data-a="csv">Baixar levantamento (CSV)</button></div>';
    return h;
  }
  function abaDesc(r){
    var txt=st.job.descEdit!=null?st.job.descEdit:LCX.descritivo(r);
    return '<textarea id="lcx-desc" data-k="job.descEdit" data-t="t">'+esc(txt)+'</textarea><div class="lcx-bar"><button type="button" class="btn" data-a="copiardesc">Copiar descritivo</button><button type="button" class="btn ghost" data-a="descauto">Restaurar texto automático</button></div>'
      +'<div class="lcx-mut" style="margin-top:6px">Texto gerado dos dados do orçamento; edite à vontade. Ele vai para a proposta e para o campo de escopo do orçamento.</div>';
  }
  var PAR=[['Chapa e acabamento',[['perda','Perda de chapa (%)'],['minPvc','Mínimo PVC (R$)'],['minAcr','Mínimo acrílico (R$)'],['pintura','Pintura PU (R$/m²)'],['vinil.fosco','Vinil fosco (R$/m²)'],['vinil.uv','Vinil + UV (R$/m²)'],['vinil.lam','Vinil + laminação (R$/m²)'],['vinil.recorte','Vinil recorte (R$/m²)'],['vinilSangria','Sangria do vinil (mm)'],['vinilMinM2','Consumo mínimo de vinil (m²)'],['mdf3.preco','MDF 3 mm gabarito (R$/chapa)'],['gabMargem','Margem do gabarito (mm)']]],
           ['Mão de obra',[['horaOperador','Operador de router (R$/h)'],['horaMontador','Montador (R$/h)'],['horaAplicador','Aplicador de vinil (R$/h)'],['horaEletricista','Eletricista (R$/h)'],['opMinHoras','Operador: mínimo por job (h)'],['opSetupMin','Operador: preparo (min)'],['montBaseMin','Montagem: base (min)'],['montPecaMin','Montagem chapada: min/peça'],['montMinPorM','Montagem caixa: min/m de contorno']]],
           ['Regras Lumiforms',[['arteMin','Arte-final mínima (R$)'],['embalMin','Embalagem mínima (R$)'],['embalM2','Embalagem (R$/m²)'],['eletMin','Eletricista mínimo (R$)'],['fixConj','Fixador (R$/conjunto)'],['fixPorPecaChapada','Fixadores por peça (chapada)'],['fixPorPecaCaixa','Fixadores por peça (caixa)']]],
           ['Iluminação e 3D',[['led.fita.preco','Fita LED (R$/m)'],['led.cob.preco','Neon COB (R$/m)'],['led.neon.preco','Neon flex (R$/m)'],['led.v220.preco','LED 220 V (R$/m)'],['fonteRW','Fonte (R$/W)'],['minFonte','Fonte mínima (R$)'],['p3d.horaMaq','Hora de máquina 3D (R$/h)'],['p3d.kg.petg','PETG (R$/kg)'],['p3d.perda','Perda 3D (%)']]],
           ['Instalação Sul Sign',[['instBase','Base (R$)'],['instPeca','Por peça (R$)'],['instLuz','Fator com luz (×)']]]];
  function abaBase(r){
    var h='<div class="lcx-mut" style="margin-bottom:10px">Preços das chapas vêm do catálogo do Tempo de Router (menu Operação). Os valores abaixo são as regras de cobrança; mudou aqui, vale para os próximos cálculos neste aparelho.</div>';
    h+='<h4 style="margin:0 0 6px;font-size:13px">Perfis de preço</h4><table><thead><tr><th>Perfil</th><th class="n">Fator</th><th class="n">Router (R$/m.l.)</th><th class="n">NF</th></tr></thead><tbody>';
    Object.keys(LCX.PERFIS).forEach(function(k){ var p=LCX.PERFIS[k]; h+='<tr><td>'+esc(p.nome)+'</td><td class="n">'+nf(LCX.fator(p),4)+'×</td><td class="n">'+nf(p.routerML,2)+'</td><td class="n">'+(p.nfPct?'+'+p.nfPct+'%':'sem NF')+'</td></tr>'; });
    h+='</tbody></table><div class="lcx-mut" style="margin:6px 0 14px">Sul Sign: (1+DF+RI) ÷ (1−lucro−imposto−AC), com AC = custos fixos ÷ faturamento (15,8% da venda, out/2026). PDVEX: (1+AC) ÷ (1−lucro).</div>';
    PAR.forEach(function(g){
      h+='<h4 style="margin:10px 0 6px;font-size:13px">'+g[0]+'</h4><div class="lcx-row">';
      g[1].forEach(function(p){
        var pad=getPath(LCX.PARAMS,p[0]), atual=getPath(st.params,p[0]), usa=atual!=null?atual:pad;
        h+='<label class="lcx-f" style="flex:1 1 170px"><span>'+p[1]+(atual!=null?' •':'')+'</span><input type="text" inputmode="decimal" data-par="'+p[0]+'" value="'+inVal(usa)+'" title="padrão: '+inVal(pad)+'"></label>';
      });
      h+='</div>';
    });
    h+='<div class="lcx-bar"><button type="button" class="btn ghost sm" data-a="par-reset">Restaurar padrões</button></div>';
    return h;
  }

  function draw(){
    var c=st.root; if(!c||!window.LCX) return;
    var h='<div class="lcx"><h2>Letra Caixa</h2><p class="sub">Orçamento, levantamento de materiais e memorial descritivo a partir do desenho real. Mede o arquivo, cobra chapa por consumo, aplica as regras do Lumiforms e o BDI do perfil do cliente.</p>';
    if(st.erro) h+='<div class="lcx-erro">'+esc(st.erro)+'</div>';
    var tp=st.job.tipo||'desenho';
    h+=barraItens()+secPeca()+secBdi()+(tp==='painel'?secPainel():(tp==='avulso'?secAvulso():secDesenho()+secConstr()))+secResultado()+secResumo()+'</div>';
    var y=window.pageYOffset;
    c.innerHTML=h;
    window.scrollTo(0,y);
    st.msg=null;
  }

  /* ── ações ── */
  function baixar(nome, tipo, conteudo){
    var b=new Blob([conteudo],{type:tipo}), a=document.createElement('a');
    a.href=URL.createObjectURL(b); a.download=nome; document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); if(a.parentNode) a.parentNode.removeChild(a); },500);
  }
  function copiar(txt, ok){
    function fim(){ st.msg=ok; draw(); }
    if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(fim,function(){ fallback(); }); } else fallback();
    function fallback(){ var t=document.createElement('textarea'); t.value=txt; document.body.appendChild(t); t.select(); try{ document.execCommand('copy'); }catch(e){} document.body.removeChild(t); fim(); }
  }
  function slug(s){ var t=String(s||'orcamento'); if(t.normalize) t=t.normalize('NFD').replace(/[̀-ͯ]/g,''); t=t.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,''); return t||'orcamento'; }
  function textoDesc(r){ return st.job.descEdit!=null?st.job.descEdit:LCX.descritivo(r); }

  function propostaHtml(r, numero){
    var j=st.job, hoje=new Date(), d=('0'+hoje.getDate()).slice(-2)+'/'+('0'+(hoje.getMonth()+1)).slice(-2)+'/'+hoje.getFullYear();
    var desc=esc(textoDesc(r)).replace(/\n/g,'<br>');
    var h='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc((numero||'Proposta')+' · '+(j.nome||r.geo.nome))+'</title>'
      +'<style>body{font-family:Inter,Arial,sans-serif;color:#1A1C22;margin:0;background:#fff}.w{max-width:820px;margin:0 auto;padding:0 28px 40px}.hd{background:#111;color:#fff;padding:20px 28px}.hd b{font-size:20px;letter-spacing:1px}.hd span{color:#FF5A1F}.hd p{margin:4px 0 0;font-size:12px;color:#bbb}'
      +'h3{font-size:12px;letter-spacing:1px;text-transform:uppercase;border-bottom:2px solid #FF5A1F;padding-bottom:5px;margin:22px 0 10px}table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;font-size:11px;text-transform:uppercase;color:#666;border-bottom:1px solid #ccc;padding:7px 8px}'
      +'td{padding:8px;border-bottom:1px solid #eee}td.n,th.n{text-align:right;white-space:nowrap}tr.t td{font-weight:800;border-top:2px solid #111;font-size:15px}.m{color:#666;font-size:12px}@media print{.np{display:none}}</style></head><body>'
      +'<div class="hd"><b>SUL <span>SIGN</span></b><p>Proposta comercial'+(numero?' · '+esc(numero):'')+'</p></div><div class="w">'
      +'<p class="m" style="margin-top:16px"><b>Cliente:</b> '+esc(j.cliente||'—')+' &nbsp;·&nbsp; <b>Projeto:</b> '+esc(j.projeto||j.nome||'—')+' &nbsp;·&nbsp; <b>Data:</b> '+d+'</p>'
      +'<h3>Escopo</h3><div style="font-size:13px;line-height:1.6">'+desc+'</div><h3>Investimento</h3>'
      +'<table><thead><tr><th>Descrição</th><th class="n">Qtd</th><th class="n">Valor unit.</th><th class="n">Total</th></tr></thead><tbody>';
    r.sintetico.linhas.forEach(function(l){ h+='<tr><td>'+esc(l.desc)+'</td><td class="n">'+nf(l.qtd,l.qtd%1?2:0)+' '+esc(l.un)+'</td><td class="n">'+R(l.valorUn)+'</td><td class="n">'+R(l.total)+'</td></tr>'; });
    h+='<tr class="t"><td colspan="3">TOTAL</td><td class="n">'+R(r.sintetico.total)+'</td></tr></tbody></table>'
      +'<p class="m" style="margin-top:14px">'+(r.nfPct>0?'Valores com nota fiscal.':'Valores sem nota fiscal.')+' Validade da proposta: 15 dias. Condições de pagamento a combinar.</p>'
      +'<p class="np"><button onclick="window.print()" style="padding:9px 18px;font-size:13px;cursor:pointer">Imprimir / salvar em PDF</button></p></div></body></html>';
    return h;
  }
  function csvLev(r){
    var L=LCX.levantamento(r), rows=[['Material','Uso','Quantidade','Unidade/medida','Aproveitamento %','Custo (R$)','Base']];
    L.materiais.forEach(function(m){ rows.push([m.material,m.uso,m.qtd,m.un||m.medida,m.aproveitamento!=null?m.aproveitamento:'',nf(m.custo,2),m.nota]); });
    rows.push([]); rows.push(['Componente','Quantidade','Unidade']);
    L.componentes.forEach(function(c){ rows.push([c.item,nf(c.qtd,2),c.un]); });
    rows.push([]); rows.push(['Mão de obra','Horas','R$/h']);
    L.horas.forEach(function(c){ rows.push([c.item,nf(c.horas,2),nf(c.valorHora,2)]); });
    return '﻿'+rows.map(function(rw){ return rw.map(function(x){ return '"'+String(x==null?'':x).replace(/"/g,'""')+'"'; }).join(';'); }).join('\r\n');
  }

  /* grava no ORC: um grupo por peça do Sintético (peça, gabarito, instalação), linhas a custo; o BDI do perfil reproduz o fator */
  /* linhas para a OS (tabela que vai à PDVEX): matéria-prima, router em m.l. e horas de máquina; sem custos nem margem. Layout provisório até conferir com OS_Router_PDVEX_final. */

  /* lê peso (g) e tempo (h) dos G-codes do PrusaSlicer (rodapé do arquivo); soma os arquivos = 1 unidade */
  function lerGcodes(files){
    if(!files.length) return; var tot={g:0,h:0,n:0,camada:'',bico:''}, falhas=[], pend=files.length;
    files.forEach(function(f){
      var rd=new FileReader(), ini=Math.max(0,f.size-400000);
      rd.onload=function(){
        var t=String(rd.result), g=null, h=null, m;
        m=t.match(/;\s*total filament used \[g\]\s*=\s*([\d.]+)/i); if(m) g=parseFloat(m[1]);
        if(g==null){ m=t.match(/;\s*filament used \[g\]\s*=\s*([\d.,\s]+)/i); if(m) g=m[1].split(',').reduce(function(a,x){ return a+(parseFloat(x)||0); },0); }
        m=t.match(/;\s*estimated printing time \(normal mode\)\s*=\s*([^\r\n]+)/i);
        if(m){ var d=/(\d+)d/.exec(m[1]), hh=/(\d+)h/.exec(m[1]), mm=/(\d+)m/.exec(m[1]), ss=/(\d+)s/.exec(m[1]); h=(d?+d[1]*24:0)+(hh?+hh[1]:0)+(mm?+mm[1]/60:0)+(ss?+ss[1]/3600:0); }
        var lc=t.match(/;\s*layer_height\s*=\s*([\d.]+)/i), nz=t.match(/;\s*nozzle_diameter\s*=\s*([\d.]+)/i); if(lc) tot.camada=lc[1]; if(nz) tot.bico=nz[1];
        if(g>0&&h>0){ tot.g+=g; tot.h+=h; tot.n++; } else falhas.push(f.name);
        if(--pend===0){
          if(tot.n){ st.job.i3d.peso_g=Math.round(tot.g*10)/10; st.job.i3d.tempo_h=Math.round(tot.h*100)/100; st.job.i3d.semPerda=false;
            st.gcMsg=tot.n+' G-code(s) somados: '+nf(tot.g,0)+' g · '+nf(tot.h,2)+' h'+(tot.camada?' · camada '+tot.camada+' mm':'')+(tot.bico?' · bico '+tot.bico+' mm':'')+'. A perda/falhas ('+LCX.PARAMS.p3d.perda+'%) é somada por cima; marque "Já inclui perda" se não quiser.'+(falhas.length?' Não li: '+falhas.join(', ')+' (.bgcode binário? desligue "Supports binary G-code" no PrusaSlicer).':''); recalc(); }
          else st.gcMsg='Não achei peso/tempo em: '+falhas.join(', ')+'. Se for .bgcode (binário), desligue "Supports binary G-code" na impressora do PrusaSlicer e fatie de novo.';
          draw();
        }
      };
      rd.onerror=function(){ falhas.push(f.name); if(--pend===0){ st.gcMsg='Não consegui ler os arquivos.'; draw(); } };
      rd.readAsText(f.slice(ini));
    });
  }
  function csvOS(items){
    var j=st.job, hoje=new Date(), dt=('0'+hoje.getDate()).slice(-2)+'/'+('0'+(hoje.getMonth()+1)).slice(-2)+'/'+hoje.getFullYear();
    var rows=[['Nº OS','Data','Cliente / evento','Setor','Matéria-prima / serviço','Descrição','Medidas','Qtd','Un','Valor do orçamento enviado (R$)']], tem=false;
    items.forEach(function(it){
      var r=it.r; if(!r) return;
      var setor=(it.job.constr==='impressao3d'&&(it.job.tipo||'desenho')==='desenho')?'Impressão 3D':'Router CNC', med=(r.geo.bboxMm[0]>0)?Math.round(r.geo.bboxMm[0])+' × '+Math.round(r.geo.bboxMm[1])+' mm':'';
      var primeira=true;
      r.linhas.forEach(function(l){
        var mp=((l.grupo==='mp'&&l.chave!=='fixadores'&&l.chave!=='ferragens'&&l.chave!=='sapatas'&&l.chave!=='metalon_fundo')||l.chave==='gab_mat'), rt=(l.chave==='router'||l.chave==='router_gab'||l.un==='m.l.'), maq=(l.grupo==='eqp'&&l.un==='h');
        if(!(mp||rt||maq)) return;
        rows.push(['',dt,(j.cliente||'')+(j.projeto?' — '+j.projeto:''),setor,l.desc,(it.job.nome||r.geo.nome||''),med,nf(l.qtd,l.qtd%1?2:0),l.un,primeira?nf(r.vendaNF,2):'']);
        primeira=false; tem=true;
      });
    });
    return '\ufeff'+rows.map(function(rw){ return rw.map(function(x){ return '"'+String(x==null?'':x).replace(/"/g,'""')+'"'; }).join(';'); }).join('\r\n');
  }

  /* ── OS PDVEX (aba da planilha OS_Router_PDVEX): 4 seções da MODELO; sem margem, só o que a OS mostra ── */
  var OS_ROUTER_VENDA=8, OS_FECH_H=0.5, OS_FECH_VENDA=60;
  function nomeBase(n){ return String(n||'').replace('PVC expandido','PVC').replace(/\s+\(gabarito\)/,'').trim(); }
  function montarOS(items, mpPor){
    var j=st.job, S={mpP:[],mpS:[],maq:[],mo:[]}, av=[], baseAdd={}, hora3d=null;
    items.forEach(function(it){
      var r=it.r; if(!r) return; var nome=it.job.nome||r.geo.nome||'Item', med=(r.geo.bboxMm&&r.geo.bboxMm[0]>0)?Math.round(r.geo.bboxMm[0])+' × '+Math.round(r.geo.bboxMm[1])+' mm':'—', primeiroMat='';
      if(it.job.constr==='impressao3d'&&(it.job.tipo||'desenho')==='desenho'){
        /* racional Lumiforms 3D: filamento (g, com perda) + hora de máquina (R$/h); vai como matéria-prima + serviço de máquina */
        var fil=null, mq=null; r.linhas.forEach(function(l){ if(l.chave==='filamento') fil=l; if(l.chave==='maq3d') mq=l; });
        if(fil&&mq){
          var fn=fil.desc.replace(/^Filamento\s+/i,''), fnome='Filamento '+fn, kgPreco=Math.round(fil.pu*1000*100)/100;
          baseAdd[fnome]={un:'kg',custo:kgPreco}; hora3d=mq.pu;
          var lf={desc:fnome+' — '+nome+' ('+Math.round(fil.qtd)+' g, já com perda)', tipo:'Matéria-prima', mp:fnome, med:Math.round(fil.qtd)+' g', qtd:Math.round(fil.qtd/10)/100, un:'kg', cobUn:(mpPor==='sulsign'?kgPreco:null)};
          (mpPor==='sulsign'?S.mpS:S.mpP).push(lf);
          S.maq.push({desc:nome+' — impressão 3D '+fn, tipo:'Impressão 3D', mp:fnome, med:r.geo.bboxMm&&r.geo.bboxMm[0]>0?Math.round(r.geo.bboxMm[0])+' × '+Math.round(r.geo.bboxMm[1])+' mm':'—', qtd:Math.round(mq.qtd*100)/100, un:'h', cobUn:mq.pu});
          S.mo.push({desc:'Fechamento de arquivo — '+nome, tipo:'Fechamento de arquivo', mp:'—', med:'—', qtd:OS_FECH_H, un:'h', cobUn:OS_FECH_VENDA});
        } else av.push('"'+nome+'": 3D sem filamento/hora calculados.');
        return;
      }
      (r.materiais||[]).forEach(function(m){
        if(m.chapa==null||m.fam==='Vinil'||!(m.m2Cobrado>0)) return;
        var bn=nomeBase(m.material), gab=(m.chave==='gab_mat');
        if(!gab&&!primeiroMat) primeiroMat=bn;
        var ln={desc:(gab?'Gabarito ':'Chapa ')+bn+' — '+nome, tipo:'Matéria-prima', mp:bn, med:m.medida||'—', qtd:Math.round(m.m2Cobrado*100)/100, un:'m²', cobUn:null};
        (mpPor==='sulsign'?S.mpS:S.mpP).push(ln);
      });
      if(it.job.tipo==='avulso') r.linhas.forEach(function(l){ if(l.grupo==='mp'&&l.un!=='m.l.'){ var ln2={desc:l.desc+' — '+nome, tipo:'Matéria-prima', mp:nomeBase(l.desc), med:'—', qtd:Math.round(l.qtd*100)/100, un:l.un, cobUn:null}; (mpPor==='sulsign'?S.mpS:S.mpP).push(ln2); if(!primeiroMat) primeiroMat=nomeBase(l.desc); } });
      var ml=0, temGab=false; r.linhas.forEach(function(l){ if(l.un==='m.l.'&&(l.chave==='router'||l.chave==='router_gab'||it.job.tipo==='avulso')){ ml+=l.qtd; if(l.chave==='router_gab') temGab=true; } });
      if(ml>0) S.maq.push({desc:nome+' — corte '+(primeiroMat||'')+(temGab?' + gabarito':''), tipo:'Corte router CNC', mp:primeiroMat||'—', med:med, qtd:Math.round(ml*10)/10, un:'m.l.', cobUn:OS_ROUTER_VENDA});
      S.mo.push({desc:'Fechamento de arquivo — '+nome, tipo:'Fechamento de arquivo', mp:'—', med:'—', qtd:OS_FECH_H, un:'h', cobUn:OS_FECH_VENDA});
    });
    var c=st.comb;
    return {versao:1, evento:(j.cliente?j.cliente+' — ':'')+(j.projeto||j.nome||''), cliente:j.cliente||'', job:'A definir (sem SS)', tipoServico:'Corte CNC (router)', setor:'Router CNC', solicitante:'PDVEX', periodo:'A confirmar',
      orcNumero:'', orcValor:c?c.vendaNF:null, mpPor:mpPor, baseAdd:baseAdd, hora3d:hora3d, perfil:(j.perfil==='pdvex'?'PDVEX':'Orçamento'), secoes:S, avisos:av, gerado:new Date().toISOString()};
  }
  function csvOSplanilha(os){
    var rows=[['Seção','Nº','Descrição','Tipo','Matéria-prima','Medidas','Qtd','Un','Cobrado unit. (R$)']], n=0;
    [['1','mpP'],['2','mpS'],['3','maq'],['4','mo']].forEach(function(s){ os.secoes[s[1]].forEach(function(l){ n++; rows.push([s[0],n,l.desc,l.tipo,l.mp,l.med,String(l.qtd).replace('.',','),l.un,l.cobUn==null?'':String(l.cobUn).replace('.',',')]); }); });
    rows.push([]); rows.push(['','','Orçamento enviado nº','','','','','',os.orcNumero]); rows.push(['','','VALOR DO ORÇAMENTO ENVIADO','','','','','',os.orcValor==null?'':String(os.orcValor).replace('.',',')]);
    return '﻿'+rows.map(function(rw){ return rw.map(function(x){ return '"'+String(x==null?'':x).replace(/"/g,'""')+'"'; }).join(';'); }).join('\r\n');
  }
  function payloadOrc(c, numero){
    var j=st.job, grupos=[];
    function ln(l){
      var exato=Math.abs(l.qtd*l.pu-l.custo)<0.006;
      return {desc:l.desc, qtd:String(exato?Math.round(l.qtd*100)/100:1), unit:String(exato?Math.round(l.pu*10000)/10000:l.custo), un:exato?l.un:'vb', m2:false, lv:'', av:'', modified:false};
    }
    st.itens.forEach(function(it){
      var r=it.r; if(!r) return;
      var gPeca=[], gGab=[], gInst=[], gOut=[], nome=it.job.nome||r.geo.nome||'Item';
      r.linhas.forEach(function(l){
        if(l.grupo==='gab'||l.chave==='router_gab') gGab.push(ln(l)); else if(l.grupo==='inst') gInst.push(ln(l)); else if(l.grupo==='out') gOut.push(ln(l)); else gPeca.push(ln(l));
      });
      var S=r.sintetico.linhas, dim=(r.geo.bboxMm[0]>0)?Math.round(r.geo.bboxMm[0])+' × '+Math.round(r.geo.bboxMm[1])+' mm':'';
      function grp(n,linhas,sint,q){ if(linhas.length) grupos.push({nome:n, dim:dim, pecaId:null, sint:sint, sintQ:String(q), setores:[], setor:'', opcional:false, trelicaCfg:null, linhas:linhas}); }
      grp(nome, gPeca, S[0]?S[0].desc:nome, S[0]?S[0].qtd:r.qtd);
      grp('Gabarito de instalação — '+nome, gGab, 'Gabarito de instalação (MDF 3 mm, janelas no contorno) — '+nome, r.qtd);
      grp('Instalação — '+nome, gInst, 'Instalação — '+nome, 1);
      grp('Outros — '+nome, gOut, 'Outros — '+nome, 1);
    });
    return {numero:numero, cliente:j.cliente||'', agencia:'', atendimento:'', projeto:j.projeto||j.nome||'', ref:'Calculadora Letra Caixa (OS 2.0)', validade:'15 dias', bdi:c.bdiOrc, grupos:grupos,
      inclusos:[], nao_inclusos:[], condicoes:{}, estr:{descricoes:[],imagens:[]}, cronograma:[], status:'Em Orçamento', escopo:c.descTexto, rev:0, rev_historico:[], updated_at:new Date().toISOString()};
  }
  function gravarOrc(){
    var r=st.comb; if(!r) return;
    var d=new Date(), pre='SS-'+d.getFullYear()+'_'+('0'+(d.getMonth()+1)).slice(-2)+'-';
    SS20.sb('orcamentos?select=numero&numero=like.'+encodeURIComponent(pre+'*')).then(function(rows){
      var numero=LCX.proximoNumero((rows||[]).map(function(x){ return x.numero; }), d);
      var ok=confirm('Gravar este orçamento como '+numero+' em Orçamentos?\n\nItens: '+st.itens.length+'\nVenda: '+R(r.sintetico.total)+(r.nfPct>0?' (com NF)':' (sem NF)')+'\n\nDepois você abre e refina no ORC Manager.');
      if(!ok) return null;
      return SS20.sbw('orcamentos','POST',payloadOrc(r,numero)).then(function(){ SS20.cache.orc=null; st.msg='Gravado como '+numero+'. Abra em Orçamentos para ajustar e enviar.'; draw(); });
    }).catch(function(e){ st.erro='Não consegui gravar: '+e.message; draw(); });
  }

  function novo(){ if(!confirm('Começar um orçamento novo? Todos os itens atuais serão descartados.')) return; st.itens=[novoItem()]; st.sel=0; var it=st.itens[0]; st.job=it.job; st.doc=null; st.buf=null; st.nomeArq=''; st.geoSalvo=null; st.camadas={}; st.printImg=null; st.r=null; st.comb=null; st.erro=null; gravarLocal(); draw(); }

  /* ── eventos (delegados no container, uma vez) ── */
  function ligar(c){
    if(c._lcx) return; c._lcx=true;
    c.addEventListener('change', function(e){
      var el=e.target; if(!el||!c.querySelector('.lcx')) return;
      if(el.id==='lcx-file'){ var f=el.files&&el.files[0]; if(!f) return; var rd=new FileReader(); rd.onload=function(){ lerArquivo(f.name, rd.result); }; rd.readAsArrayBuffer(f); return; }
      if(el.id==='lcx-gcode'){ lerGcodes(Array.prototype.slice.call(el.files||[])); el.value=''; return; }
      if(el.id==='lcx-print'){ var pf=el.files&&el.files[0]; if(!pf) return; var pr=new FileReader(); pr.onload=function(){ var im=new Image(); im.onload=function(){ var m=Math.min(1,1000/Math.max(im.width,im.height)), cv=document.createElement('canvas'); cv.width=Math.round(im.width*m); cv.height=Math.round(im.height*m); var cx=cv.getContext('2d'); cx.fillStyle='#fff'; cx.fillRect(0,0,cv.width,cv.height); cx.drawImage(im,0,0,cv.width,cv.height); st.printImg=cv.toDataURL('image/jpeg',0.85); draw(); }; im.src=pr.result; }; pr.readAsDataURL(pf); return; }
      if(el.hasAttribute('data-camada')){ st.camadas[el.getAttribute('data-camada')]=el.value; recalc(); draw(); return; }
      if(el.hasAttribute('data-ovr')){ var k=el.getAttribute('data-ovr'); st.job.ovr[k]=num(el.value); recalc(); draw(); return; }
      if(el.hasAttribute('data-par')){ var p=el.getAttribute('data-par'), v=num(el.value); if(el.value.trim()==='') delPath(st.params,p); else setPath(st.params,p,v); recalc(); draw(); return; }
      var path=el.getAttribute('data-k'); if(!path) return;
      var t=el.getAttribute('data-t'), val;
      if(t==='c') val=el.checked; else if(t==='n') val=num(el.value); else val=el.value;
      if(path==='escala'){ st.escala=num(el.value)||1; st.larguraReal=0; reLer(); return; }
      if(path==='larguraReal'){ st.larguraReal=num(el.value); reLer(); return; }
      if(path==='job.perfil') st.job.perfilOv={};
      if(path==='job.qtd') val=Math.max(1,Math.round(val)||1);
      if(path==='job.qtdLetras'&&!val) val=0;
      setPath(st,path,val);
      if(path==='job.cliente'||path==='job.projeto'||path==='job.perfil'||path==='job.nf'||path.indexOf('job.perfilOv')===0) sincGlobal();
      recalc(); draw();
    });
    c.addEventListener('click', function(e){
      var el=e.target; while(el&&el!==c&&!el.getAttribute('data-a')) el=el.parentNode;
      if(!el||el===c) return;
      var a=el.getAttribute('data-a'), v=el.getAttribute('data-v'), k=el.getAttribute('data-k');
      if(a==='entrada'){ st.job.entrada=v; recalc(); draw(); }
      else if(a==='constr'){ st.job.constr=v; recalc(); draw(); }
      else if(a==='aba'){ st.aba=v; draw(); }
      else if(a==='ovr-reset'){ delete st.job.ovr[k]; recalc(); draw(); }
      else if(a==='extra-add'){ var d=prompt('Descrição da linha (ex.: Frete, Andaime, Transporte):'); if(d){ var vv=num(prompt('Custo (R$):')||'0'); st.job.extras.push({desc:d,valor:vv}); recalc(); draw(); } }
      else if(a==='extra-del'){ var ix=parseInt(k.replace('extra',''),10); st.job.extras.splice(ix,1); delete st.job.ovr[k]; recalc(); draw(); }
      else if(a==='par-reset'){ if(confirm('Restaurar todos os padrões de preço e regras?')){ st.params={}; recalc(); draw(); } }
      else if(a==='descauto'){ st.job.descEdit=null; draw(); }
      else if(a==='copiardesc'){ var ta=document.getElementById('lcx-desc'); if(ta) st.job.descEdit=ta.value; copiar(ta?ta.value:textoDesc(st.r),'Descritivo copiado.'); }
      else if(a==='copiarsint'){ var rows=st.r.sintetico.linhas.map(function(l){ return [l.desc,l.qtd,l.un,nf(l.valorUn,2),nf(l.total,2)].join('\t'); }); copiar(rows.join('\n'),'Sintético copiado (colunas separadas por tabulação).'); }
      else if(a==='csvos'){ baixar('OS_linhas_'+slug(st.job.nome||st.r.geo.nome)+'.csv','text/csv;charset=utf-8',csvOS([st.itens[st.sel]])); }
      else if(a==='csv'){ baixar('levantamento_'+slug(st.job.nome||st.r.geo.nome)+'.csv','text/csv;charset=utf-8',csvLev(st.r)); }
      else if(a==='proposta'){ baixar('proposta_'+slug(st.job.nome||st.r.geo.nome)+'.html','text/html;charset=utf-8',propostaHtml(st.r,'')); }
      else if(a==='json'){ var o=copia(st.r); delete o.job.geo; baixar('calculo_'+slug(st.job.nome||st.r.geo.nome)+'.json','application/json',JSON.stringify(o,null,1)); }
      else if(a==='print-del'){ st.printImg=null; draw(); }
      else if(a==='item-sel'){ abrirItem(parseInt(v,10)); recalc(); draw(); }
      else if(a==='item-add'){ guardar(); var ni=novoItem(v,st.job); st.itens.push(ni); st.sel=st.itens.length-2; abrirItem(st.itens.length-1); recalc(); draw(); window.scrollTo(0,0); }
      else if(a==='item-dup'){ guardar(); var di=novoItem(st.job.tipo,st.job); di.job=copia(st.job); di.job.nome=(st.job.nome||'Item')+' (cópia)'; di.job.ovr={}; di.doc=st.doc; di.buf=st.buf; di.nomeArq=st.nomeArq; di.escala=st.escala; di.larguraReal=st.larguraReal; di.camadas=copia(st.camadas); di.geoSalvo=st.geoSalvo; di.printImg=st.printImg; st.itens.splice(st.sel+1,0,di); abrirItem(st.sel+1); recalc(); draw(); }
      else if(a==='item-del'){ if(st.itens.length<2){ st.msg='O orçamento precisa ter ao menos um item.'; draw(); } else if(confirm('Remover o item "'+(st.job.nome||'sem nome')+'"?')){ var k0=st.sel; st.itens.splice(k0,1); st.sel=Math.min(k0,st.itens.length-1); var it2=st.itens[st.sel]; st.job=it2.job; st.doc=it2.doc; st.buf=it2.buf; st.nomeArq=it2.nomeArq; st.escala=it2.escala; st.larguraReal=it2.larguraReal; st.camadas=it2.camadas; st.geoSalvo=it2.geoSalvo; st.printImg=it2.printImg; recalc(); draw(); } }
      else if(a==='item-up'||a==='item-down'){ guardar(); var d0=a==='item-up'?-1:1, t0=st.sel+d0; if(t0>=0&&t0<st.itens.length){ var tmp=st.itens[st.sel]; st.itens[st.sel]=st.itens[t0]; st.itens[t0]=tmp; st.sel=t0; recalc(); draw(); } }
      else if(a==='avulso-add'){ st.job.avulso.linhas.push({desc:'',qtd:1,un:'un',pu:0,grupo:'mp'}); recalc(); draw(); }
      else if(a==='avulso-del'){ st.job.avulso.linhas.splice(parseInt(k,10),1); if(!st.job.avulso.linhas.length) st.job.avulso.linhas.push({desc:'',qtd:1,un:'un',pu:0,grupo:'mp'}); recalc(); draw(); }
      else if(a==='csvlevall'){ if(st.comb) baixar('levantamento_'+slug(st.job.projeto||st.job.cliente||'orcamento')+'.csv','text/csv;charset=utf-8',csvLev(st.comb)); }
      else if(a==='osjson'){ var mp=(document.getElementById('lcx-mppor')||{}).value||'pdvex'; var os=montarOS(st.itens,mp), bn=slug(st.job.projeto||st.job.cliente||'orcamento'); baixar('OS_'+bn+'.json','application/json',JSON.stringify(os,null,1)); baixar('OS_'+bn+'_linhas.csv','text/csv;charset=utf-8',csvOSplanilha(os)); st.msg='OS gerada. '+(os.avisos.join(' ')||'')+' Mande o .json que eu gravo a aba na planilha.'; draw(); }
      else if(a==='csvosall'){ if(st.comb) baixar('OS_linhas_'+slug(st.job.projeto||st.job.cliente||'orcamento')+'.csv','text/csv;charset=utf-8',csvOS(st.itens)); }
      else if(a==='propostaall'){ if(st.comb) baixar('proposta_'+slug(st.job.projeto||st.job.cliente||'orcamento')+'.html','text/html;charset=utf-8',propostaHtml(st.comb,'')); }
      else if(a==='bdi-reset'){ st.job.perfilOv={}; sincGlobal(); recalc(); draw(); }
      else if(a==='orcfile'){ if(window.LCX_EXPORT_ORC) window.LCX_EXPORT_ORC(st.r, st); }
      else if(a==='orc'){ gravarOrc(); }
      else if(a==='novo'){ novo(); }
    });
    c.addEventListener('input', function(e){
      var el=e.target; if(el&&el.id==='lcx-desc'){ st.job.descEdit=el.value; gravarLocal(); }
    });
  }

  function render(c){
    st.root=c; estilo(); ligar(c);
    c.innerHTML='<div class="loading-view">Carregando motor…</div>';
    if(!st.job) carregar();
    motor().then(function(){ recalc(); draw(); }).catch(function(e){ c.innerHTML='<div class="err-view">'+esc(e.message)+'</div>'; });
  }

  SS20.modules.lcx={render:render};
})();
