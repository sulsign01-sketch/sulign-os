/* ═══════════════════════════════════════════════════════════════
   SULSIGN OS 2.0 — MÓDULO: TEMPO DE ROUTER (rtr)
   Mede o perímetro dos vetores (m.l.), estima o tempo de corte e o
   consumo de chapas por material (encaixe, aproveitamento, custo).
   Lê .crv3d do Aspire, EPS (Corel/VCarve), DXF, SVG, PDF e G-code.
   Motor em rtr_core.js (carregado aqui). Grava em router_medicoes,
   vinculado à OS (ordens_servico.id). Parâmetros em router_config.
   Abre direto da ficha da OS (botão ⏱ nos vetores de corte).
   iOS Safari: var, sem template literals, sem arrow, sem let/const.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  var fmt=SulSignCore.fmt;
  var PDFJS='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/';
  var LS_CFG='ss20_rtr_cfg', LS_MEM='ss20_rtr_mem';
  var CORES={corte:'#FF5A1F',vinco:'#2563EB',rebaixo:'#1E9E5A',grav:'#7C3AED',ignorar:'#B8BAC2'};
  var OPS=[['corte','Corte passante'],['vinco','Vinco (V)'],['rebaixo','Rebaixo/pocket'],['grav','Gravação'],['ignorar','Não cortar']];
  var GENERICAS=/^(0|layer \d+|camada \d+|eps|pdf|svg|cor #[0-9a-f]+|defpoints)$/i;
  var st={itens:[], os:null, job:'', aba:'medir', cfg:null, cfgFonte:'padrão', hist:null, histErro:null, osList:null,
          anotar:true, msg:null, ocupado:0, seq:0, root:null, c:null, calc:null, abertoParam:{},
          ovr:{}, reuso:{}, encAberto:{}, famAberta:{}};
  var MODOS=[['inteira','chapa inteira'],['usada','só o que usar (sobra fica)'],['envolvente','retângulo das peças']];

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function num(x){ var v=parseFloat(String(x==null?'':x).replace(/\./g,function(m,i,s){ return s.indexOf(',')>=0?'':'.'; }).replace(',','.')); return isFinite(v)?v:0; }
  function nf(v,d){ d=d==null?1:d; var s=(Math.round((+v||0)*Math.pow(10,d))/Math.pow(10,d)).toFixed(d); var p=s.split('.'); p[0]=p[0].replace(/\B(?=(\d{3})+(?!\d))/g,'.'); return p.join(','); }
  function nfIn(v){ v=+v||0; return String(Math.round(v*1000)/1000).replace('.',','); }
  function copia(o){ return JSON.parse(JSON.stringify(o)); }
  function hojeBR(){ var d=new Date(); return ('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2); }
  function dstr(d){ if(!d) return '—'; var x=new Date(d); return ('0'+x.getDate()).slice(-2)+'/'+('0'+(x.getMonth()+1)).slice(-2)+'/'+String(x.getFullYear()).slice(-2)+' '+('0'+x.getHours()).slice(-2)+':'+('0'+x.getMinutes()).slice(-2); }
  function semTabela(e){ var m=String(e&&e.message||e); return m.indexOf('404')>=0||m.indexOf('42P01')>=0||m.indexOf('PGRST205')>=0; }

  /* ── carregamento ── */
  function script(src){
    return new Promise(function(res,rej){ var s=document.createElement('script'); s.src=src; s.onload=function(){ res(); }; s.onerror=function(){ if(s.parentNode) s.parentNode.removeChild(s); rej(new Error('Não carregou '+src.split('/').pop().split('?')[0])); }; document.head.appendChild(s); });
  }
  function motor(){ return window.RTR?Promise.resolve():script('rtr_core.js?v='+Date.now()); }
  function pdfjs(){
    if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return script(PDFJS+'pdf.min.js').then(function(){ window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS+'pdf.worker.min.js'; return window.pdfjsLib; })
      .catch(function(){ throw new Error('Leitor de PDF não carregou (sem internet?). Exporte em DXF ou EPS.'); });
  }

  /* ── parâmetros (presets, máquina, cobrança) ── */
  function padrao(){
    var p={}, ordem=[];
    RTR.PRESETS.forEach(function(x){ p[x.id]=copia(x); ordem.push(x.id); });
    return {presets:p, ordem:ordem, maq:copia(RTR.MAQ), cob:copia(RTR.COB)};
  }
  /* v1 (antes do consumo de chapas) só guarda parâmetros de corte: nome/chapa/preço vêm do catálogo novo */
  var CORTE_K={d:1,prof:1,passo:1,avanco:1,mergulho:1,fator:1,step:1};
  function mesclar(sv){
    var c=padrao(); if(!sv||typeof sv!=='object') return c;
    var v2=(sv.v||1)>=2;
    if(sv.presets){ Object.keys(sv.presets).forEach(function(id){
      var q=sv.presets[id]; if(!q) return;
      if(c.presets[id]){
        if(v2) c.presets[id]=mix(c.presets[id],q);
        else { var o={}; Object.keys(q).forEach(function(k){ if(CORTE_K[k]) o[k]=q[k]; }); c.presets[id]=mix(c.presets[id],o); }
      } else if(String(id).charAt(0)==='u'){ q=copia(q); if(!q.fam) q.fam='Outros'; if(q.op==='corte'&&!q.chapa) q.chapa=[2750,1850]; c.presets[id]=q; inserir(c.ordem,id); }
    }); }
    if(sv.maq) c.maq=mix(c.maq,sv.maq); if(sv.cob) c.cob=mix(c.cob,sv.cob);
    return c;
  }
  function inserir(ordem,id){ var i=ordem.indexOf('acmv'); if(i<0) ordem.push(id); else ordem.splice(i,0,id); }
  function mix(a,b){ var o=copia(a); Object.keys(b).forEach(function(k){ if(b[k]!=null) o[k]=b[k]; }); return o; }
  function carregarCfg(){
    var loc=null; try{ loc=JSON.parse(localStorage.getItem(LS_CFG)||'null'); }catch(e){}
    st.cfg=mesclar(loc); st.cfgFonte=loc?'este aparelho':'padrão';
    return SS20.sb('router_config?chave=eq.parametros&select=valor,updated_at').then(function(r){
      if(r&&r[0]&&r[0].valor){ st.cfg=mesclar(r[0].valor); st.cfgFonte='sistema'; try{ localStorage.setItem(LS_CFG,JSON.stringify(r[0].valor)); }catch(e){} }
    }).catch(function(){ /* tabela ainda não criada: fica com o local/padrão */ });
  }
  function salvarCfg(){
    var v={presets:st.cfg.presets, maq:st.cfg.maq, cob:st.cfg.cob, v:2};
    try{ localStorage.setItem(LS_CFG,JSON.stringify(v)); }catch(e){}
    return upsert('router_config',{chave:'parametros',valor:v,updated_at:new Date().toISOString()})
      .then(function(){ st.cfgFonte='sistema'; aviso('Parâmetros salvos no sistema.'); })
      .catch(function(e){ aviso('Parâmetros salvos só neste aparelho ('+e.message+').',true); });
  }
  function upsert(tab,body){
    var tk=window.SULSIGN_ACCESS_TOKEN||SulSignCore.SUPA_KEY;
    return fetch(SulSignCore.SUPA_URL+'/rest/v1/'+tab,{method:'POST',headers:{'apikey':SulSignCore.SUPA_KEY,'Authorization':'Bearer '+tk,
      'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(body)})
      .then(function(r){ if(r.status===401){ window.ss20Logout(); throw new Error('Sessão expirada'); } if(!r.ok) return r.text().then(function(t){ throw new Error(r.status+': '+t.slice(0,140)); }); return true; });
  }
  function memoria(camada){
    if(!camada||GENERICAS.test(camada)) return null;
    try{ var m=JSON.parse(localStorage.getItem(LS_MEM)||'{}'); var id=m[String(camada).toUpperCase()]; return id&&st.cfg.presets[id]?id:null; }catch(e){ return null; }
  }
  function lembrar(camada,id){
    if(!camada||GENERICAS.test(camada)) return;
    try{ var m=JSON.parse(localStorage.getItem(LS_MEM)||'{}'); m[String(camada).toUpperCase()]=id; localStorage.setItem(LS_MEM,JSON.stringify(m)); }catch(e){}
  }

  /* ── arquivos ── */
  function lerArquivo(file){
    return new Promise(function(res,rej){ var r=new FileReader(); r.onload=function(){ res(r.result); }; r.onerror=function(){ rej(new Error('Não consegui ler '+file.name)); }; r.readAsArrayBuffer(file); });
  }
  function dataUrlU8(du){
    var b=String(du||''), i=b.indexOf('base64,'); b=i>=0?b.slice(i+7):b;
    var bin=atob(b), u=new Uint8Array(bin.length); for(var k=0;k<bin.length;k++) u[k]=bin.charCodeAt(k); return u;
  }
  function adicionar(nome,buf){
    st.ocupado++; draw();
    var u8=new Uint8Array(buf), tipo=RTR.tipoDe(nome,u8);
    return (tipo==='pdf'?pdfjs():Promise.resolve(null)).then(function(lib){ return RTR.ler(nome,u8,lib); })
      .then(function(doc){ novoItem(doc); })
      .catch(function(e){ aviso(nome+': '+(e&&e.message||e),true); })
      .then(function(){ st.ocupado--; recalc(); draw(); });
  }
  function novoItem(doc){
    preparar(doc);
    var base=RTR.palpite(doc.nome,'')||'mdf15';
    var pg=RTR.palpite(doc.nome,''), pgp=st.cfg.presets[pg];
    var it={id:'f'+(++st.seq), doc:doc, qtd:doc.qtdSugerida?doc.qtdSugerida.n:1, qtdFonte:doc.qtdSugerida?doc.qtdSugerida.fonte:null,
            ops:{}, escala:1, palpiteBase:!pg, mat:(doc.formato==='gcode'&&pgp&&pgp.op==='corte')?pg:''};
    (doc.camadas||[]).forEach(function(cm){ it.ops[cm.nome]=memoria(cm.nome)||RTR.palpite(doc.nome,cm.nome)||base; });
    st.itens.push(it);
  }
  /* caminhos simplificados para a prévia (calculados uma vez) */
  function preparar(doc){
    var bb=doc.bb||[0,0,0,0], mx=Math.max(bb[2]-bb[0],bb[3]-bb[1],1), tol=mx/1600, dec=mx>2000?0:(mx>200?1:2);
    function f(v){ return v.toFixed(dec); }
    (doc.contornos||[]).forEach(function(ct){
      var p=ct.p, s='M'+f(p[0])+' '+f(-p[1]), lx=p[0], ly=p[1];
      for(var i=2;i<p.length;i+=2){
        var last=i>=p.length-2, dx=p[i]-lx, dy=p[i+1]-ly;
        if(!last&&dx*dx+dy*dy<tol*tol) continue;
        s+='L'+f(p[i])+' '+f(-p[i+1]); lx=p[i]; ly=p[i+1];
      }
      if(ct.c) s+='Z';
      ct.d=s;
    });
    if(doc.segs){
      var g='', sg=doc.segs, n=sg.length/4, stp=Math.max(1,Math.floor(n/30000));
      for(var j=0;j<n;j+=stp){ g+='M'+f(sg[4*j])+' '+f(-sg[4*j+1])+'L'+f(sg[4*j+2])+' '+f(-sg[4*j+3]); }
      doc.gpath=g;
    }
  }

  /* ── cálculo ── */
  function recalc(){
    if(!window.RTR||!st.itens.length){ st.calc=null; return; }
    st.calc=RTR.calcular(st.itens.map(function(it){ return {id:it.id, doc:it.doc, qtd:it.qtd, ops:it.ops, mat:it.mat}; }),
      {presets:st.cfg.presets, maq:st.cfg.maq, cob:st.cfg.cob},
      {ovr:st.ovr, reuso:st.reuso, modo:st.cfg.cob.modoMat||'inteira'});
  }
  function linhaDe(itId,camada){ var r=null; if(st.calc) st.calc.camadas.forEach(function(l){ if(l.arquivo===itId&&l.camada===camada) r=l; }); return r; }
  function matDe(id){ var r=null; if(st.calc) st.calc.materiais.forEach(function(m){ if(m.id===id) r=m; }); return r; }
  function arqDe(itId){ var r=null; if(st.calc) st.calc.arquivos.forEach(function(a){ if(a.id===itId) r=a; }); return r; }

  function aviso(t,erro){ st.msg={t:t,erro:!!erro}; draw(); setTimeout(function(){ if(st.msg&&st.msg.t===t){ st.msg=null; draw(); } },erro?9000:4500); }

  /* ═════════ RENDER ═════════ */
  function render(c){
    st.c=c;
    c.innerHTML='<div class="loading-view">Carregando Tempo de Router…</div>';
    motor().then(function(){ if(!st.cfg) return carregarCfg(); }).then(function(){
      if(SS20.rtrAba){ st.aba=SS20.rtrAba; SS20.rtrAba=null; st.hist=null; }
      var pend=SS20.rtrPendente; SS20.rtrPendente=null;
      if(pend){
        st.aba='medir';
        if(pend.os){ st.os=pend.os; }
        if(pend.arquivos&&pend.arquivos.length){
          var seq=Promise.resolve();
          pend.arquivos.forEach(function(a){ seq=seq.then(function(){ return adicionar(a.nome, dataUrlU8(a.dados).buffer); }); });
        }
      }
      recalc(); draw();
    }).catch(function(e){ c.innerHTML='<div class="err-view">Erro ao abrir o Tempo de Router: '+esc(e.message)+'</div>'; });
  }

  function draw(){
    var c=st.c; if(!c||SS20.view!=='rtr') return;
    var h=css()+'<div class="rtr-root" style="padding:22px 24px 60px;max-width:1100px">';
    h+='<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h2 style="font-family:var(--font-d);font-size:20px;font-weight:800">⌖ Tempo de Router</h2><span style="flex:1"></span>';
    h+='<span class="mini">parâmetros: '+esc(st.cfgFonte)+'</span></div>';
    h+='<p class="mini" style="margin-top:2px">Mede o perímetro dos vetores (m.l.) e estima o tempo de corte. Lê <b>.crv3d</b> do Aspire, EPS, DXF, SVG, PDF e G-code (.tap/.nc).</p>';
    h+='<div class="rtr-tabs">';
    [['medir','Medir'],['hist','Histórico'],['param','Parâmetros']].forEach(function(t){ h+='<button type="button" class="rtr-tab'+(st.aba===t[0]?' on':'')+'" data-rtr="aba" data-v="'+t[0]+'">'+t[1]+'</button>'; });
    h+='</div>';
    if(st.msg) h+='<div class="rtr-msg'+(st.msg.erro?' err':'')+'">'+esc(st.msg.t)+'</div>';
    if(st.aba==='medir') h+=telaMedir();
    else if(st.aba==='hist') h+=telaHist();
    else h+=telaParam();
    h+='</div>';
    c.innerHTML=h;
    st.root=c.querySelector('.rtr-root');
    ligar(st.root);
  }

  function css(){
    return '<style>'
      +'.rtr-tabs{display:flex;gap:6px;margin:12px 0 16px;flex-wrap:wrap}'
      +'.rtr-tab{border:1px solid var(--line);background:var(--panel);border-radius:20px;padding:6px 15px;font-size:12.5px;font-weight:600;color:var(--mut)}'
      +'.rtr-tab.on{background:var(--ink);color:#fff;border-color:var(--ink)}'
      +'.rtr-msg{background:var(--ok-soft);color:var(--ok);border-radius:9px;padding:9px 12px;font-size:12.5px;margin-bottom:12px;font-weight:600}'
      +'.rtr-msg.err{background:var(--danger-soft);color:var(--danger)}'
      +'.rtr-os{display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:var(--blue-soft);border:1px solid #c9d7f8;border-radius:10px;padding:9px 12px;margin-bottom:14px;font-size:12.5px}'
      +'.rtr-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:1.5px dashed var(--line);border-radius:12px;padding:20px 14px;text-align:center;cursor:pointer;background:var(--panel);margin-bottom:14px}'
      +'.rtr-drop.over{border-color:var(--accent);background:var(--accent-soft)}'
      +'.rtr-drop b{font-size:14px}'
      +'.rtr-file{border:1px solid var(--line);border-radius:12px;background:var(--panel);margin-bottom:14px;overflow:hidden}'
      +'.rtr-fh{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;flex-wrap:wrap}'
      +'.rtr-badge{font-size:9.5px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;padding:2px 7px;border-radius:8px;background:var(--ink);color:#fff;white-space:nowrap}'
      +'.rtr-thumb{width:64px;height:64px;object-fit:contain;border:1px solid var(--line);border-radius:8px;background:#fff;flex-shrink:0}'
      +'.rtr-prev{background:#FBFAF8;border-top:1px solid var(--line);border-bottom:1px solid var(--line);position:relative}'
      +'.rtr-prev svg{display:block;width:100%;height:auto;max-height:360px}'
      +'.rtr-prev path{fill:none;vector-effect:non-scaling-stroke;stroke-width:1.4;cursor:pointer}'
      +'.rtr-prev path.off{stroke:#C9CBD1!important;stroke-dasharray:3 3;stroke-width:1}'
      +'.rtr-prev .ch{fill:none;stroke:#9aa;stroke-dasharray:6 4;vector-effect:non-scaling-stroke;stroke-width:1}'
      +'.rtr-prevbar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:7px 12px;font-size:11.5px;color:var(--mut)}'
      +'.rtr-cam{width:100%;border-collapse:collapse}'
      +'.rtr-cam th{font-size:9.5px;padding:7px 8px}.rtr-cam td{padding:7px 8px;font-size:12.5px;vertical-align:middle}'
      +'.rtr-sw{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}'
      +'.rtr-av{font-size:11.5px;color:#8a5a00;background:var(--warn-soft);border-radius:8px;padding:7px 10px;margin:0 14px 8px;line-height:1.4}'
      +'.rtr-in{padding:7px 9px;border:1px solid var(--line);border-radius:7px;font-family:inherit;font-size:13px;background:var(--panel);color:var(--ink);min-width:0}'
      +'.rtr-sel{padding:6px 7px;border:1px solid var(--line);border-radius:7px;font-family:inherit;font-size:12px;background:var(--panel);max-width:100%}'
      +'.rtr-lbl{display:block;font-size:10px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--mut);margin-bottom:3px}'
      +'.rtr-bk{list-style:none;margin-top:6px}.rtr-bk li{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid #EFEEE9;font-size:12.5px}'
      +'.rtr-bk li b{font-variant-numeric:tabular-nums}'
      +'.rtr-act{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}'
      +'.rtr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}'
      +'.rtr-pt td{padding:4px 4px}.rtr-pt input,.rtr-pt select{width:100%}'
      +'.rtr-hist{border:1px solid var(--line);border-radius:10px;padding:11px 13px;margin-bottom:9px;background:var(--panel)}'
      +'.rtr-so{display:none}.rtr-bk li b{white-space:nowrap}'
      +'.rtr-mat{border:1px solid var(--line);border-radius:10px;padding:11px 12px;margin-bottom:10px;background:#FCFBF9}'
      +'.rtr-mt{display:flex;align-items:center;gap:4px;font-size:13.5px;margin-bottom:3px}'
      +'.rtr-mn{font-family:var(--font-d);font-weight:800;font-size:17px;white-space:nowrap}'
      +'.rtr-mc{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-top:9px}'
      +'.rtr-chk{display:flex;align-items:center;gap:6px;font-size:12.5px;padding-bottom:8px}'
      +'.rtr-mv{font-family:var(--font-d);font-size:16px;font-weight:800;white-space:nowrap}'
      +'.rtr-mtot{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;border-top:1px solid var(--line);padding-top:10px;margin-top:4px;font-size:13.5px}'
      +'.rtr-folhas{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;margin-top:10px}'
      +'.rtr-folhas.um{grid-template-columns:minmax(0,520px)}'
      +'.rtr-folha svg{display:block;width:100%;height:auto;background:#fff;border-radius:6px}'
      +'.rtr-folha .mini{margin-top:3px}'
      +'.rtr-fam{border:1px solid var(--line);border-radius:10px;margin-bottom:8px;background:var(--panel)}'
      +'.rtr-fam summary{cursor:pointer;padding:10px 12px;font-weight:700;font-size:13px;list-style-position:inside}'
      +'.rtr-fam .rtr-famc{padding:0 10px 10px}'
      +'.rtr-pt th{font-size:9.5px;padding:6px 4px;white-space:nowrap}'
      +'@media(max-width:620px){.rtr-hm{display:none}.rtr-root{padding:14px 12px 60px!important}'
      +'.rtr-root .kpis{grid-template-columns:1fr 1fr;gap:8px}.rtr-root .kpi{padding:10px 11px}.rtr-root .kpi .vl{font-size:19px}'
      +'.rtr-folhas{grid-template-columns:1fr 1fr;gap:8px}.rtr-folhas.um{grid-template-columns:1fr}'
      +'.rtr-cam thead{display:none}.rtr-cam tr{display:grid;grid-template-columns:1fr auto;gap:5px 10px;padding:9px 12px;border-bottom:1px solid #EFEEE9}'
      +'.rtr-cam td{display:block;padding:0!important;border:none}.rtr-cam td.c-n{grid-column:1;grid-row:1;font-weight:600}'
      +'.rtr-cam td.c-ml{grid-column:2;grid-row:1;text-align:right}.rtr-cam td.c-op{grid-column:1/-1;grid-row:2}.rtr-cam td.c-op select{width:100%;font-size:13px;padding:7px}'
      +'.rtr-cam td.c-t{grid-column:1/-1;grid-row:3;text-align:left;font-size:11px;color:var(--mut)}.rtr-so{display:inline}.rtr-cam td.rtr-hm,.rtr-cam .rtr-hm{display:none}}'
      +'</style>';
  }

  /* ── aba MEDIR ── */
  function telaMedir(){
    var h='';
    if(st.os){
      h+='<div class="rtr-os">🔗 <span>OS <b>'+esc(st.os.label||'')+'</b>'+(st.os.job?' · '+esc(st.os.job):'')+'</span><span style="flex:1"></span>'
        +'<button type="button" class="btn ghost sm" data-rtr="desvincular">desvincular</button></div>';
    }
    h+='<label class="rtr-drop" data-rtr="drop">'
      +'<b>＋ Adicionar arquivos de corte</b>'
      +'<span class="mini">.crv3d · .eps · .dxf · .svg · .pdf · .ai · .tap/.nc — pode juntar vários (um por material)</span>'
      +'<input type="file" multiple id="rtr-file" style="display:none">'
      +'</label>';
    if(st.ocupado) h+='<div class="loading-view" style="padding:14px">Lendo arquivo…</div>';
    st.itens.forEach(function(it){ h+=cartaoArquivo(it); });
    if(st.itens.length) h+=cartaoResultado()+cartaoChapas()+cartaoSalvar();
    else if(!st.ocupado) h+='<div class="mini" style="text-align:center;padding:6px 0 0">Dica: na ficha da OS, o botão ⏱ ao lado do vetor de corte abre ele aqui já vinculado.</div>';
    return h;
  }

  function corOp(op){ return CORES[op]||'#888'; }
  function opDe(it,camada){ var p=st.cfg.presets[it.ops[camada]]; return p?p.op:'corte'; }

  function cartaoArquivo(it){
    var d=it.doc, A=arqDe(it.id), h='<div class="rtr-file">';
    h+='<div class="rtr-fh">';
    if(d.preview) h+='<img class="rtr-thumb" src="'+d.preview+'" alt="prévia do Aspire">';
    h+='<div style="flex:1;min-width:180px">';
    h+='<div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap"><span class="rtr-badge">'+esc(d.formato==='crv3d'?'Aspire':d.formato)+'</span>'
      +'<b style="font-size:13.5px;word-break:break-word">'+esc(d.nome)+'</b></div>';
    var info=[];
    if(d.info) info.push(esc(d.info));
    if(d.formato!=='gcode'&&d.bb) info.push(nf(d.bb[2]-d.bb[0],0)+' × '+nf(d.bb[3]-d.bb[1],0)+' mm');
    if(d.chapa) info.push('chapa do job '+nf(d.chapa.w,0)+'×'+nf(d.chapa.h,0)+(d.chapa.esp&&d.chapa.esp>1?' · esp. '+nf(d.chapa.esp,1):''));
    if(d.contornos) info.push(d.contornos.length+' vetores');
    h+='<div class="mini" style="margin-top:3px">'+info.join(' · ')+'</div>';
    h+='</div>';
    h+='<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">';
    h+='<div style="width:74px"><span class="rtr-lbl">Qtd</span><input class="rtr-in" style="width:100%" type="text" inputmode="numeric" data-rtr="qtd" data-it="'+it.id+'" value="'+esc(it.qtd)+'"></div>';
    if(d.formato==='gcode'){
      h+='<div style="min-width:170px;flex:1"><span class="rtr-lbl">Material da chapa</span><select class="rtr-sel" style="width:100%" data-rtr="gmat" data-it="'+it.id+'"><option value="">— não conta chapa —</option>'+opcoesPreset(it.mat,true)+'</select></div>';
    }
    if(d.formato!=='gcode'){
      h+='<div><span class="rtr-lbl">Escala</span><select class="rtr-sel" data-rtr="escala" data-it="'+it.id+'">';
      [[1,'1:1 (como veio)'],[10,'×10 (arq. em cm)'],[25.4,'×25,4 (polegadas)'],[1000,'×1000 (metros)'],[0.1,'÷10'],[-1,'largura real…']].forEach(function(o){ h+='<option value="'+o[0]+'"'+(Math.abs(it.escala-o[0])<1e-9?' selected':'')+'>'+o[1]+'</option>'; });
      if([1,10,25.4,1000,0.1].indexOf(it.escala)<0) h+='<option value="'+it.escala+'" selected>×'+nf(it.escala,4)+'</option>';
      h+='</select></div>';
    }
    h+='<button type="button" class="btn ghost sm" data-rtr="remover" data-it="'+it.id+'" title="Tirar arquivo">✕</button>';
    h+='</div></div>';
    if(it.qtdFonte) h+='<div class="mini" style="padding:0 14px 8px">Qtd '+it.qtd+' tirada do '+esc(it.qtdFonte)+' — confira.</div>';
    (d.avisos||[]).forEach(function(a){ h+='<div class="rtr-av">⚠ '+esc(a)+'</div>'; });
    if(it.palpiteBase&&d.formato!=='gcode') h+='<div class="rtr-av">⚠ Material não identificado no nome do arquivo: usei MDF cru 15 mm. Troque nas camadas abaixo.</div>';
    if(d.formato==='gcode'&&!it.mat) h+='<div class="rtr-av">⚠ Escolha o material da chapa deste G-code para ele entrar no consumo de chapas.</div>';
    h+=previa(it);
    if(d.formato==='gcode') h+=blocoGcode(it,A);
    else h+=tabelaCamadas(it,A);
    h+='</div>';
    return h;
  }

  function previa(it){
    var d=it.doc, bb=d.bb; if(!bb) return '';
    var w=bb[2]-bb[0], hh=bb[3]-bb[1];
    if(d.formato!=='gcode'&&!(d.contornos&&d.contornos.length)) return '';
    var x0=bb[0], y1=bb[3];
    if(d.chapa&&d.formato==='crv3d'){ x0=Math.min(x0,0); y1=Math.max(y1,d.chapa.h); w=Math.max(bb[2],d.chapa.w)-x0; hh=y1-Math.min(bb[1],0); }
    var pad=Math.max(w,hh)*0.03+1, vb=(x0-pad)+' '+(-y1-pad)+' '+(w+2*pad)+' '+(Math.max(hh,1)+2*pad);
    var s='<div class="rtr-prev"><svg viewBox="'+vb+'" preserveAspectRatio="xMidYMid meet" data-rtr-svg="'+it.id+'">';
    if(d.chapa&&d.formato==='crv3d') s+='<rect class="ch" x="0" y="'+(-d.chapa.h)+'" width="'+d.chapa.w+'" height="'+d.chapa.h+'"/>';
    if(d.formato==='gcode') s+='<path d="'+(d.gpath||'')+'" style="stroke:#FF5A1F;cursor:default"/>';
    else d.contornos.forEach(function(ct,i){ var op=opDe(it,ct.L); s+='<path data-ci="'+i+'" class="'+(ct.off?'off':'')+'" d="'+ct.d+'" style="stroke:'+corOp(op)+(op==='ignorar'?';stroke-dasharray:4 3':'')+'"/>'; });
    s+='</svg></div>';
    if(d.formato!=='gcode'){
      var nOff=0; d.contornos.forEach(function(ct){ if(ct.off) nOff++; });
      s+='<div class="rtr-prevbar"><span>Toque num vetor para tirar/voltar da medida'+(nOff?' · <b>'+nOff+' fora</b>':'')+'.</span><span style="flex:1"></span>';
      if(d.chapa&&d.formato==='crv3d'){
        var ins=dentroChapa(d);
        if(ins.dentro&&ins.fora) s+='<button type="button" class="btn ghost sm" data-rtr="soChapa" data-it="'+it.id+'">Só o que está na chapa ('+ins.dentro+')</button>';
      }
      if(nOff) s+='<button type="button" class="btn ghost sm" data-rtr="todos" data-it="'+it.id+'">Contar tudo</button>';
      s+='</div>';
    }
    return s;
  }
  function dentroChapa(d){
    var W=d.chapa.w, H=d.chapa.h, r={dentro:0,fora:0};
    d.contornos.forEach(function(ct){ var b=ct.bb; if(b[0]>=-1&&b[1]>=-1&&b[2]<=W+1&&b[3]<=H+1) r.dentro++; else r.fora++; });
    return r;
  }

  function famDe(p){ return p.fam||(p.op==='corte'?'Outros':(p.op==='ignorar'?'Ignorar':'Vinco e usinagem')); }
  function rotuloFam(f){ return f==='Vinco e usinagem'?'Vinco, rebaixo e gravação':(f==='Ignorar'?'Não cortar':'Corte · '+f); }
  function opcoesPreset(sel,soCorte){
    var h='', grupos={};
    st.cfg.ordem.forEach(function(id){ var p=st.cfg.presets[id]; if(!p) return; if(soCorte&&p.op!=='corte') return; (grupos[famDe(p)]=grupos[famDe(p)]||[]).push(p); });
    RTR.FAMILIAS.forEach(function(f){ var g=grupos[f]; if(!g) return; h+='<optgroup label="'+esc(rotuloFam(f))+'">'; g.forEach(function(p){ h+='<option value="'+esc(p.id)+'"'+(p.id===sel?' selected':'')+'>'+esc(p.nome)+'</option>'; }); h+='</optgroup>'; });
    return h;
  }
  function tabelaCamadas(it,A){
    var d=it.doc, q=num(it.qtd)||1, h='<div style="overflow-x:auto"><table class="rtr-cam"><thead><tr><th>Camada</th><th>Operação / material</th><th class="num">m.l.</th><th class="num rtr-hm">vetores</th><th class="num rtr-hm">passadas</th><th class="num">tempo</th></tr></thead><tbody>';
    (d.camadas||[]).forEach(function(cm){
      var pid=it.ops[cm.nome], p=st.cfg.presets[pid]||{}, L=linhaDe(it.id,cm.nome);
      var nAt=0, len=0; d.contornos.forEach(function(ct){ if(ct.L===cm.nome&&!ct.off){ nAt++; len+=ct.len; } });
      h+='<tr><td class="c-n"><span class="rtr-sw" style="background:'+corOp(p.op)+'"></span>'+esc(cm.nome)+'</td>'
        +'<td class="c-op"><select class="rtr-sel" data-rtr="preset" data-it="'+it.id+'" data-cam="'+esc(cm.nome)+'">'+opcoesPreset(pid)+'</select></td>'
        +'<td class="num c-ml">'+(p.op==='ignorar'?'<span style="color:var(--mut)">'+nf(len*q/1000,2)+'</span>':'<b>'+nf(len*q/1000,2)+'</b>')+'<span class="rtr-so"> m.l.</span></td>'
        +'<td class="num rtr-hm">'+nAt+(cm.n!==nAt?'<span class="mini">/'+cm.n+'</span>':'')+'</td>'
        +'<td class="num rtr-hm">'+(L&&L.passadas?L.passadas:'—')+'</td>'
        +'<td class="num c-t">'+(p.op==='ignorar'?'<span class="rtr-so">não corta · '+nAt+' vetores</span><span class="rtr-hm">—</span>':'<span class="rtr-so">'+nAt+' vetores · '+(L&&L.passadas?L.passadas:'—')+' passada(s) · </span>'+(L&&L.tempo?RTR.hm(L.tempo):'—'))+'</td></tr>';
    });
    h+='</tbody></table></div>';
    if(A){
      h+='<div class="mini" style="padding:8px 14px 12px">Arquivo: <b>'+nf(A.mlCobrado,2)+' m.l.</b>'+(q>1?' (já ×'+q+')':'')+' · máquina '+RTR.hm(A.maquina)
        +(A.chapas?' · em '+A.chapas+' chapa(s)':'')
        +(A.areaPecas?' · peças '+nf(A.areaPecas,2)+' m²':'')
        +(A.bbox&&A.bbox[0]?' · envolvente '+nf(A.bbox[0]/1000,2)+'×'+nf(A.bbox[1]/1000,2)+' m':'')+'</div>';
    }
    return h;
  }
  function blocoGcode(it,A){
    var g=it.doc.gcode, h='<div style="padding:10px 14px 12px"><ul class="rtr-bk">';
    h+='<li><span>Trilha de corte (avanço)</span><b>'+nf(g.corte/1000,2)+' m</b></li>';
    h+='<li><span>Tempo em avanço (F do arquivo)</span><b>'+RTR.hm(g.tempo)+'</b></li>';
    h+='<li><span>Deslocamento rápido XY / Z</span><b>'+nf(g.rapXY/1000,1)+' m / '+nf(g.rapZ/1000,1)+' m</b></li>';
    h+='<li><span>Trocas de fresa</span><b>'+g.trocas+'</b></li>';
    var fs=Object.keys(g.feeds||{}).sort(function(a,b){ return g.feeds[b]-g.feeds[a]; }).slice(0,4).map(function(f){ return 'F'+f; });
    if(fs.length) h+='<li><span>Avanços usados</span><b>'+fs.join(' · ')+'</b></li>';
    if(A) h+='<li><span>Tempo de máquina estimado'+(num(it.qtd)>1?' (×'+num(it.qtd)+')':'')+'</span><b>'+RTR.hm(A.maquina)+'</b></li>';
    if(A&&A.chapas) h+='<li><span>Chapas (pelo tamanho do percurso)</span><b>'+A.chapas+'</b></li>';
    h+='</ul><div class="mini" style="margin-top:6px">G-code mede o tempo real do percurso da fresa. Não entra no m.l. cobrado (o m.l. vem do vetor).</div></div>';
    return h;
  }

  function cartaoResultado(){
    var R=st.calc; if(!R) return '';
    var T=R.tot, cob=st.cfg.cob, h='<div class="card" style="margin-top:4px">';
    h+='<h3>Resultado'+(st.itens.length>1?' · '+st.itens.length+' arquivos':'')+'</h3>';
    h+='<div class="kpis" style="margin-bottom:10px">';
    h+=kpi('Corte (m.l.)',nf(T.mlCobrado,2),T.contornos+' vetores'+(T.areaPecas?' · '+nf(T.areaPecas,2)+' m² de peça':''));
    h+=kpi('Máquina',RTR.hm(T.maquina),'corte, mergulho, vazio e troca');
    h+=kpi('Total na OS',RTR.hm(T.total),'+ setup e programação');
    h+=kpi('Router (m.l.)',fmt(T.valorRouter),'R$ '+nf(cob.valorML,2)+'/m.l.');
    h+=kpi('Chapas',String(T.chapas),R.materiais.length?R.materiais.length+' material(is)':'sem corte passante');
    h+=kpi('Material',fmt(T.custoMaterial),rotuloModo(R.modoMat));
    h+='</div>';
    h+='<ul class="rtr-bk">';
    h+='<li><span>Corte (passadas × trilha ÷ avanço)</span><b>'+RTR.hm(T.corte)+'</b></li>';
    h+='<li><span>Mergulhos / rampas</span><b>'+RTR.hm(T.mergulho)+'</b></li>';
    h+='<li><span>Deslocamento em vazio + Z seguro</span><b>'+RTR.hm(T.rapido)+'</b></li>';
    if(T.gcode) h+='<li><span>Arquivos G-code (percurso real)</span><b>'+RTR.hm(T.gcode)+'</b></li>';
    h+='<li><span>Trocas de fresa</span><b>'+RTR.hm(T.troca)+'</b></li>';
    h+='<li><span>Setup de chapa ('+T.cargas+' × '+nfIn(st.cfg.maq.setupMin)+' min)</span><b>'+RTR.hm(T.setup)+'</b></li>';
    h+='<li><span>Programação / fechamento de arquivo</span><b>'+RTR.hm(T.prog)+'</b></li>';
    h+='<li style="border-bottom:none"><span>Custo de MO estimado (operador + programação)</span><b>'+fmt(T.custoMO)+'</b></li>';
    h+='</ul>';
    if(cob.maqML) h+='<div class="mini" style="margin-top:4px">Dos '+fmt(T.valorRouter)+', '+fmt(T.parteMaqPDVEX)+' é máquina PDVEX (R$ '+nf(cob.maqML,2)+'/m.l.).</div>';
    h+='<div class="mini" style="margin-top:12px;line-height:1.5">Estimativa pelo vetor: trilha = perímetro ± π·Ø da fresa (peça por fora, furo por dentro), passadas pela profundidade, deslocamento pelo vizinho mais próximo e fator de aceleração do preset. Calibre no Histórico com o tempo real da máquina.</div>';
    h+='</div>';
    return h;
  }
  function rotuloModo(m){ var r='chapa inteira'; MODOS.forEach(function(x){ if(x[0]===m) r=x[1]; }); return 'custo por '+r; }

  /* ── CHAPAS POR MATERIAL ── */
  function cartaoChapas(){
    var R=st.calc; if(!R) return '';
    var L=R.materiais, h='<div class="card rtr-chapas">';
    h+='<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px"><h3 style="margin:0">Chapas por material</h3><span style="flex:1"></span>'
      +'<label class="mini" style="display:flex;align-items:center;gap:6px">custo por <select class="rtr-sel" data-rtr="modo">'
      +MODOS.map(function(m){ return '<option value="'+m[0]+'"'+(m[0]===(st.cfg.cob.modoMat||'inteira')?' selected':'')+'>'+m[1]+'</option>'; }).join('')+'</select></label></div>';
    if(!L.length){
      h+='<div class="mini" style="padding:6px 0">Nenhuma camada de corte passante: só vinco, rebaixo ou gravação não consomem chapa. Escolha um material de corte nas camadas'+(st.itens.some(function(it){ return it.doc.formato==='gcode'; })?' ou o material do G-code':'')+'.</div></div>';
      return h;
    }
    L.forEach(function(m,mi){ h+=blocoMaterial(m,mi); });
    var T=R.tot, semPreco=L.filter(function(m){ return !(m.preco>0)&&!m.reuso; });
    h+='<div class="rtr-mtot"><span><b>'+T.chapas+' chapa(s)</b> no total</span><span style="flex:1"></span><span>material <b>'+fmt(T.custoMaterial)+'</b></span></div>';
    if(semPreco.length) h+='<div class="rtr-av" style="margin:8px 0 0">⚠ Sem preço: '+semPreco.map(function(m){ return esc(m.nome); }).join(', ')+'. Preencha o R$ da chapa em Parâmetros.</div>';
    h+='<div class="mini" style="margin-top:10px;line-height:1.5">Encaixe estimado por retângulos: cada peça (com os furos e o miolo aproveitado) vira o menor retângulo que a contém, girado se precisar, com '+nfIn(st.cfg.maq.folga)+' mm + Ø da fresa entre peças e '+nfIn(st.cfg.maq.margem)+' mm de margem. É conservador — o Aspire costuma encaixar um pouco melhor peças curvas. Arquivo do Aspire já encaixado na chapa conta 1 chapa por unidade.</div>';
    h+='</div>';
    return h;
  }
  function blocoMaterial(m,mi){
    var cor=RTR.CORFAM[m.fam]||'#888', h='<div class="rtr-mat">';
    h+='<div class="rtr-mt"><span class="rtr-sw" style="background:'+cor+'"></span><b>'+esc(m.nome)+'</b><span style="flex:1"></span><span class="rtr-mn">'+m.n+' chapa'+(m.n===1?'':'s')+'</span></div>';
    var l1=[nf(m.W/1000,2)+' × '+nf(m.H/1000,2)+' m'];
    l1.push(m.preco>0?fmt(m.preco)+' a chapa':'sem preço');
    l1.push(m.pecas+' peça'+(m.pecas===1?'':'s'));
    l1.push(nf(m.areaLiq,2)+' m² de peça');
    l1.push('aprov. '+nf(m.aprov*100,0)+'%');
    h+='<div class="mini">'+l1.join(' · ')+'</div>';
    if(m.ultimaFrac!=null&&m.ultimaFrac<0.98) h+='<div class="mini">última chapa usa '+nf(m.ultimaFrac*100,0)+'%'+(m.sobra?' — sobra '+nf(m.sobra.w/1000,2)+' × '+nf(m.sobra.h/1000,2)+' m':'')+'</div>';
    if(m.fixas) h+='<div class="mini">encaixe do Aspire: '+m.fixas+' chapa'+(m.fixas===1?'':'s')+' contada'+(m.fixas===1?'':'s')+' como no arquivo</div>';
    if(m.grandes) h+='<div class="rtr-av" style="margin:6px 0 0">⚠ '+m.grandes+' peça'+(m.grandes===1?'':'s')+' maior'+(m.grandes===1?'':'es')+' que a chapa: contei as chapas da emenda.</div>';
    if(m.aprox) h+='<div class="mini">G-code: área pelo tamanho do percurso da fresa (aproximada)</div>';
    if(!(m.preco>0)&&!m.reuso) h+='<div class="rtr-av" style="margin:6px 0 0">⚠ Sem preço para '+esc(m.nome)+' — preencha em Parâmetros.</div>';
    h+='<div class="rtr-mc">';
    h+='<div style="width:86px"><span class="rtr-lbl">Chapas</span><input class="rtr-in" style="width:100%" type="text" inputmode="numeric" data-rtr="ovr" data-mat="'+esc(m.id)+'" value="'+(m.ovr?m.ovr:'')+'" placeholder="'+m.chapasAuto+'"></div>';
    h+='<label class="rtr-chk"><input type="checkbox" data-rtr="reuso" data-mat="'+esc(m.id)+'"'+(m.reuso?' checked':'')+'> reuso / sobra (sem custo)</label>';
    h+='<span style="flex:1"></span>';
    h+='<div style="text-align:right"><span class="rtr-lbl">Custo</span><b class="rtr-mv">'+(m.reuso?'reuso':fmt(m.custo))+'</b></div>';
    h+='</div>';
    if(m.ovr) h+='<div class="mini">ajuste manual · o encaixe calculou '+m.chapasAuto+'</div>';
    var ab=!!st.encAberto[m.id];
    h+='<button type="button" class="btn ghost sm" style="margin-top:8px" data-rtr="enc" data-mat="'+esc(m.id)+'">'+(ab?'▾ esconder encaixe':'▸ ver encaixe ('+m.chapasAuto+' chapa'+(m.chapasAuto===1?'':'s')+')')+'</button>';
    if(ab) h+=desenhoFolhas(m,mi,24);
    h+='</div>';
    return h;
  }
  /* desenho das chapas: peças como <use> de um <path> por peça (leve no iPhone) */
  function dPeca(pc){
    if(pc._d) return pc._d;
    var mr=pc.mr, co=Math.cos(mr.ang), si=Math.sin(mr.ang), tol=Math.max(mr.w,mr.h)/400, s='';
    if(pc.gcode){ pc._d='M0 0H'+mr.w.toFixed(1)+'V'+mr.h.toFixed(1)+'H0Z'; return pc._d; }
    pc.membros.forEach(function(ct){
      var p=ct.p, lx=null, ly=null;
      for(var i=0;i<p.length;i+=2){
        var x=p[i]*co+p[i+1]*si-mr.minx, y=mr.h-(-p[i]*si+p[i+1]*co-mr.miny), last=i>=p.length-2;
        if(lx!==null&&!last&&(x-lx)*(x-lx)+(y-ly)*(y-ly)<tol*tol) continue;
        s+=(lx===null?'M':'L')+x.toFixed(1)+' '+y.toFixed(1); lx=x; ly=y;
      }
      if(ct.c) s+='Z';
    });
    pc._d=s; return s;
  }
  function desenhoFolhas(m,mi,lim){
    var cor=RTR.CORFAM[m.fam]||'#888', defs='', usados={}, h='', n=m.folhas.length, mostra=Math.min(n,lim||n);
    for(var i=0;i<mostra;i++){
      var f=m.folhas[i], W=m.W, H=m.H, corpo='', rot='', aprov=0;
      if(f.fixo){
        W=f.jw; H=f.jh;
        var dd='';
        f.pcs.forEach(function(pc){ pc.membros.forEach(function(ct){ dd+=ct.d||''; }); });
        corpo='<g transform="translate(0,'+H+')"><path d="'+dd+'" fill="'+cor+'" fill-opacity=".18" fill-rule="evenodd" stroke="'+cor+'" stroke-width="1" vector-effect="non-scaling-stroke"/></g>';
        rot='Aspire';
      } else if(f.grande){
        var pg=m.defs[f.k], kx=(W-2*m.margem)/Math.max(1,pg.mr.w), ky=(H-2*m.margem)/Math.max(1,pg.mr.h), k=Math.min(kx,ky);
        usados[f.k]=1;
        corpo='<use href="#rtr-p-'+mi+'-'+f.k+'" xlink:href="#rtr-p-'+mi+'-'+f.k+'" transform="translate('+m.margem+','+m.margem+') scale('+k.toFixed(4)+')"/>';
        rot='emenda '+f.parte+'/'+f.de;
      } else {
        f.pl.forEach(function(pl){
          var pc=m.defs[pl.k], X=m.margem+pl.x, Y=m.margem+pl.y; usados[pl.k]=1;
          var tf=pl.rot?('translate('+(X+pc.mr.h).toFixed(1)+','+Y.toFixed(1)+') rotate(90)'):('translate('+X.toFixed(1)+','+Y.toFixed(1)+')');
          corpo+='<use href="#rtr-p-'+mi+'-'+pl.k+'" xlink:href="#rtr-p-'+mi+'-'+pl.k+'" transform="'+tf+'"/>';
        });
      }
      aprov=f.liq/Math.max(1,W*H);
      h+='<div class="rtr-folha"><svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet"><rect x="0" y="0" width="'+W+'" height="'+H+'" fill="#fff" stroke="#9aa" stroke-width="1" vector-effect="non-scaling-stroke"/>'+corpo+'</svg>'
        +'<div class="mini">chapa '+(i+1)+(rot?' · '+rot:'')+(f.grande?'':' · '+nf(aprov*100,0)+'%')+'</div></div>';
    }
    Object.keys(usados).forEach(function(k){
      defs+='<path id="rtr-p-'+mi+'-'+k+'" d="'+dPeca(m.defs[k])+'" fill="'+cor+'" fill-opacity=".18" fill-rule="evenodd" stroke="'+cor+'" stroke-width="1" vector-effect="non-scaling-stroke"'+(m.defs[k].gcode?' stroke-dasharray="6 4"':'')+'/>';
    });
    var out='<svg class="rtr-defs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>'+defs+'</defs></svg>';
    out+='<div class="rtr-folhas'+(mostra===1?' um':'')+'">'+h+'</div>';
    if(n>mostra) out+='<div class="mini">+ '+(n-mostra)+' chapa(s) não desenhada(s)</div>';
    return out;
  }

  function cartaoSalvar(){
    if(!st.calc) return '';
    var h='<div class="card">';
    h+='<div class="rtr-grid" style="align-items:end">';
    h+='<div style="grid-column:1/-1"><span class="rtr-lbl">Vincular à OS</span><select class="rtr-sel" style="width:100%;font-size:13px;padding:8px" data-rtr="os">'+opcoesOS()+'</select></div>';
    if(!st.os) h+='<div style="grid-column:1/-1"><span class="rtr-lbl">ou Job / orçamento</span><input class="rtr-in" style="width:100%" type="text" data-rtr="job" placeholder="SS-2026_10-## ou nome do evento" value="'+esc(st.job)+'"></div>';
    h+='</div>';
    if(st.os) h+='<label style="display:flex;gap:7px;align-items:center;font-size:12.5px;margin-top:9px"><input type="checkbox" data-rtr="anotar"'+(st.anotar?' checked':'')+'> anotar o resumo nas instruções da OS</label>';
    h+='<div class="rtr-act">'
      +'<button type="button" class="btn acc" data-rtr="salvar">💾 Salvar medição</button>'
      +'<button type="button" class="btn ghost" data-rtr="copiar">📋 Copiar resumo</button>'
      +'<button type="button" class="btn ghost" data-rtr="imprimir">🖨 Imprimir</button>'
      +'<button type="button" class="btn ghost" data-rtr="limpar">Limpar</button></div>';
    h+='</div>';
    return h;
  }
  function kpi(lb,vl,dt){ return '<div class="kpi"><div class="lb">'+lb+'</div><div class="vl">'+vl+'</div><div class="dt">'+dt+'</div></div>'; }
  function opcoesOS(){
    var h='<option value="">— sem OS —</option>', lista=st.osList||[], achou=false;
    lista.forEach(function(o){ var lab=osLabel(o); var sel=st.os&&String(st.os.id)===String(o.id); if(sel) achou=true;
      h+='<option value="'+esc(o.id)+'"'+(sel?' selected':'')+'>'+esc(lab)+'</option>'; });
    if(st.os&&!achou) h+='<option value="'+esc(st.os.id)+'" selected>'+esc(st.os.label||'OS')+'</option>';
    if(!st.osList) h+='<option value="" disabled>carregando OS…</option>';
    return h;
  }
  function osLabel(o){ return (o.serial_os||o.num||'OS')+(o.frente?' · '+o.frente:'')+((o.job||o.orcamento_numero)?' · '+(o.job||o.orcamento_numero):'')+(o.cliente?' · '+o.cliente:''); }
  function carregarOS(){
    if(st.osList||st.osLoading) return;
    st.osLoading=true;
    SS20.sb('ordens_servico?select=id,num,serial_os,frente,job,orcamento_numero,cliente,status,instrucoes&deletado_em=is.null&order=created_at.desc&limit=200')
      .then(function(r){ st.osLoading=false; st.osList=(r||[]).filter(function(o){ return String(o.num||'').indexOf('TREINO')<0&&String(o.job||'').indexOf('TREINO')<0; }); draw(); })
      .catch(function(){ st.osLoading=false; st.osList=[]; });
  }

  /* resumo em texto (copiar / instruções da OS) */
  function resumo(curto){
    var T=st.calc.tot, cob=st.cfg.cob, linhas=[];
    var chs=st.calc.materiais.map(function(m){ return m.nome+' ×'+m.n; }).join(', ');
    var cab='⏱ Router ('+hojeBR()+'): '+nf(T.mlCobrado,1)+' m.l. · máquina '+RTR.hm(T.maquina)+' · total OS '+RTR.hm(T.total)+(chs?' · chapas: '+chs:'');
    if(curto) return cab+' — '+st.itens.map(function(it){ return it.doc.nome+(num(it.qtd)>1?' ×'+num(it.qtd):''); }).join(', ');
    linhas.push(cab);
    linhas.push('Valor router: R$ '+nf(T.valorRouter,2)+' (R$ '+nf(cob.valorML,2)+'/m.l.)');
    if(st.calc.materiais.length){
      linhas.push('Material ('+rotuloModo(st.calc.modoMat)+'): R$ '+nf(T.custoMaterial,2));
      st.calc.materiais.forEach(function(m){ linhas.push('• '+m.nome+': '+m.n+' chapa(s) '+nf(m.W/1000,2)+'×'+nf(m.H/1000,2)+' m · aprov. '+nf(m.aprov*100,0)+'% · '+(m.reuso?'reuso':'R$ '+nf(m.custo,2))); });
    }
    st.itens.forEach(function(it){
      var A=arqDe(it.id); if(!A) return;
      linhas.push('• '+it.doc.nome+(num(it.qtd)>1?' ×'+num(it.qtd):'')+': '+(it.doc.formato==='gcode'?'G-code ':nf(A.mlCobrado,2)+' m.l. · ')+RTR.hm(A.maquina)+' de máquina');
      st.calc.camadas.forEach(function(l){ if(l.arquivo===it.id&&l.op!=='ignorar'&&l.n) linhas.push('   - '+l.camada+': '+(st.cfg.presets[l.preset]||{}).nome+' · '+nf(l.ml,2)+' m.l. · '+l.passadas+' passada(s)'); });
    });
    return linhas.join('\n');
  }
  function copiar(txt){
    function fb(){ var ta=document.createElement('textarea'); ta.value=txt; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.focus(); ta.select(); try{ document.execCommand('copy'); }catch(e){} document.body.removeChild(ta); }
    if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function(){ aviso('Resumo copiado.'); },function(){ fb(); aviso('Resumo copiado.'); });
    else { fb(); aviso('Resumo copiado.'); }
  }

  function salvar(){
    if(!st.calc) return;
    var T=st.calc.tot, cob=st.cfg.cob, usados={};
    var arqs=st.itens.map(function(it){
      var A=arqDe(it.id)||{}, cams=[];
      st.calc.camadas.forEach(function(l){ if(l.arquivo!==it.id) return; usados[l.preset]=st.cfg.presets[l.preset];
        cams.push({camada:l.camada, preset:l.preset, op:l.op, n:l.n, ml:+l.ml.toFixed(3), passadas:l.passadas, tempo_min:+(l.tempo||0).toFixed(2)}); });
      var nOff=0; (it.doc.contornos||[]).forEach(function(ct){ if(ct.off) nOff++; });
      return {nome:it.doc.nome, formato:it.doc.formato, info:it.doc.info||'', qtd:num(it.qtd)||1, chapas:A.chapas||0, escala:it.escala,
        ml:+(A.mlCobrado||0).toFixed(3), maquina_min:+(A.maquina||0).toFixed(2), area_pecas_m2:+(A.areaPecas||0).toFixed(4), excluidos:nOff, camadas:cams,
        gcode:it.doc.gcode?{corte_m:+(it.doc.gcode.corte/1000).toFixed(3), tempo_min:+it.doc.gcode.tempo.toFixed(2), trocas:it.doc.gcode.trocas}:null};
    });
    var body={
      os_id:st.os?st.os.id:null,
      job:st.os?(st.os.job||null):(String(st.job||'').trim()||null),
      titulo:st.itens.map(function(it){ return it.doc.nome; }).join(' + ').slice(0,300),
      arquivos:arqs,
      ml:+T.mlCobrado.toFixed(3),
      tempo_maquina_min:+T.maquina.toFixed(2),
      tempo_total_min:+T.total.toFixed(2),
      chapas:T.chapas,
      area_pecas_m2:+T.areaPecas.toFixed(4),
      materiais:st.calc.materiais.map(function(m){ return {id:m.id, nome:m.nome, chapa:[m.W,m.H], chapas:m.n, chapas_auto:m.chapasAuto, manual:!!m.ovr,
        aprov:+m.aprov.toFixed(4), pecas:m.pecas, area_liq_m2:+m.areaLiq.toFixed(4), area_env_m2:+m.areaEnv.toFixed(4), preco:m.preco, custo:+m.custo.toFixed(2), reuso:m.reuso}; }),
      custo_material:+T.custoMaterial.toFixed(2),
      valor_ml:cob.valorML,
      valor_router:+T.valorRouter.toFixed(2),
      params:{maq:st.cfg.maq, cob:cob, presets:usados},
      criado_por:(document.getElementById('foot-user')||{}).textContent||null
    };
    var btn=st.root&&st.root.querySelector('[data-rtr="salvar"]'); if(btn){ btn.disabled=true; btn.textContent='Salvando…'; }
    SS20.sbw('router_medicoes','POST',body).then(function(){
      if(st.os&&st.anotar){
        var o=null; (st.osList||[]).forEach(function(x){ if(String(x.id)===String(st.os.id)) o=x; });
        var antes=o?String(o.instrucoes||''):'', novo=(antes?antes.replace(/\s+$/,'')+'\n':'')+resumo(true);
        return SS20.sbw('ordens_servico?id=eq.'+st.os.id,'PATCH',{instrucoes:novo}).then(function(){ if(o) o.instrucoes=novo; });
      }
    }).then(function(){
      st.hist=null; aviso('Medição salva'+(st.os?' na OS '+(st.os.label||''):'')+'.');
    }).catch(function(e){
      if(semTabela(e)) aviso('A tabela router_medicoes ainda não existe no Supabase. Rode v2/sql/router_medicoes.sql.',true);
      else aviso('Erro ao salvar: '+e.message,true);
    });
  }

  function imprimir(){
    if(!st.calc) return;
    var w=window.open('','_blank'); if(!w){ aviso('Libere pop-ups para imprimir.',true); return; }
    var T=st.calc.tot, cob=st.cfg.cob;
    var css='body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;font-size:12px}h1{font-size:18px;margin:0}.mut{color:#666}'
      +'table{width:100%;border-collapse:collapse;margin:8px 0 14px}td,th{padding:4px 6px;border-bottom:1px solid #ddd;text-align:left}th{font-size:10px;text-transform:uppercase;color:#666}'
      +'.n{text-align:right}.k{display:inline-block;border:1px solid #ccc;border-radius:8px;padding:6px 10px;margin:0 6px 6px 0}.k b{display:block;font-size:16px}'
      +'.prev svg{width:100%;max-height:300px;border:1px solid #ddd;border-radius:8px;margin:6px 0}.prev path{fill:none;stroke-width:1.2;vector-effect:non-scaling-stroke}'
      +'.prev .ch{fill:none;stroke:#999;stroke-dasharray:6 4;stroke-width:1;vector-effect:non-scaling-stroke}.prev path.off{stroke:#ccc!important;stroke-dasharray:3 3}'
      +'.rtr-folhas{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 12px}.rtr-folha{width:31%}.rtr-folha svg{width:100%;height:auto;border:1px solid #ccc}.mini{font-size:10px;color:#666}';
    var h='<html><head><meta charset="utf-8"><title>Tempo de Router</title><style>'+css+'</style></head><body>';
    h+='<h1>Sul Sign · Tempo de Router</h1><div class="mut">'+dstr(new Date())+(st.os?' · OS '+esc(st.os.label):'')+(st.job&&!st.os?' · '+esc(st.job):'')+'</div><p>';
    h+='<span class="k">Corte<b>'+nf(T.mlCobrado,2)+' m.l.</b></span><span class="k">Máquina<b>'+RTR.hm(T.maquina)+'</b></span><span class="k">Total OS<b>'+RTR.hm(T.total)+'</b></span><span class="k">Chapas<b>'+T.chapas+'</b></span>';
    if(!SS20.mask) h+='<span class="k">Router<b>R$ '+nf(T.valorRouter,2)+'</b></span>'+(st.calc.materiais.length?'<span class="k">Material<b>R$ '+nf(T.custoMaterial,2)+'</b></span>':'');
    h+='</p>';
    st.itens.forEach(function(it){
      var A=arqDe(it.id)||{}, d=it.doc;
      h+='<h3 style="margin:14px 0 2px">'+esc(d.nome)+(num(it.qtd)>1?' · ×'+num(it.qtd):'')+'</h3><div class="mut">'+esc(d.info||d.formato)+' · '+(A.chapas||0)+' chapa(s) · máquina '+RTR.hm(A.maquina||0)+'</div>';
      var pv=previa(it); var m=/<svg[\s\S]*<\/svg>/.exec(pv); if(m) h+='<div class="prev">'+m[0]+'</div>';
      if(d.formato!=='gcode'){
        h+='<table><tr><th>Camada</th><th>Operação</th><th class="n">m.l.</th><th class="n">vetores</th><th class="n">passadas</th><th class="n">tempo</th></tr>';
        st.calc.camadas.forEach(function(l){ if(l.arquivo!==it.id) return; h+='<tr><td>'+esc(l.camada)+'</td><td>'+esc((st.cfg.presets[l.preset]||{}).nome||'')+'</td><td class="n">'+nf(l.ml,2)+'</td><td class="n">'+l.n+'</td><td class="n">'+(l.passadas||'—')+'</td><td class="n">'+(l.tempo?RTR.hm(l.tempo):'—')+'</td></tr>'; });
        h+='</table>';
      }
    });
    if(st.calc.materiais.length){
      h+='<h3 style="margin:16px 0 2px">Chapas por material</h3><div class="mut">'+esc(rotuloModo(st.calc.modoMat))+'</div>';
      h+='<table><tr><th>Material</th><th>Chapa</th><th class="n">Chapas</th><th class="n">Aprov.</th><th class="n">Peças</th><th class="n">m² peça</th>'+(SS20.mask?'':'<th class="n">Custo</th>')+'</tr>';
      st.calc.materiais.forEach(function(mt){ h+='<tr><td>'+esc(mt.nome)+'</td><td>'+nf(mt.W/1000,2)+'×'+nf(mt.H/1000,2)+' m</td><td class="n">'+mt.n+(mt.ovr?' (manual)':'')+'</td><td class="n">'+nf(mt.aprov*100,0)+'%</td><td class="n">'+mt.pecas+'</td><td class="n">'+nf(mt.areaLiq,2)+'</td>'+(SS20.mask?'':'<td class="n">'+(mt.reuso?'reuso':'R$ '+nf(mt.custo,2))+'</td>')+'</tr>'; });
      h+='</table>';
      st.calc.materiais.forEach(function(mt,mi){ h+='<div class="mut"><b>'+esc(mt.nome)+'</b> — encaixe estimado</div>'+desenhoFolhas(mt,mi,9); });
    }
    h+='<div class="mut">Setup '+RTR.hm(T.setup)+' · programação '+RTR.hm(T.prog)+' · trocas '+RTR.hm(T.troca)+'. Estimativa pelo vetor; confira com o operador.</div>';
    h+='<script>setTimeout(function(){window.print();},350)<\/script></body></html>';
    w.document.open(); w.document.write(h); w.document.close();
  }

  /* ── aba HISTÓRICO ── */
  function telaHist(){
    if(st.hist===null){ carregarHist(); return '<div class="loading-view">Carregando medições…</div>'; }
    if(st.histErro) return '<div class="placeholder-view"><h2>Histórico</h2><p>'+esc(st.histErro)+'</p></div>';
    if(!st.hist.length) return '<div class="mini" style="padding:10px 0">Nenhuma medição salva ainda.</div>';
    var h='';
    st.hist.forEach(function(m){
      var calib=m.tempo_real_min?(' · real <b>'+RTR.hm(m.tempo_real_min)+'</b> ('+(m.tempo_maquina_min?nf(m.tempo_real_min/m.tempo_maquina_min,2):'—')+'× o estimado)'):'';
      h+='<div class="rtr-hist"><div style="display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap">'
        +'<div style="flex:1;min-width:200px"><b style="font-size:13px">'+esc(m.titulo||'medição')+'</b>'
        +'<div class="mini">'+dstr(m.created_at)+(m.job?' · '+esc(m.job):'')+(m.os_id?' · OS '+esc(osNome(m.os_id)):'')+'</div>'
        +'<div style="font-size:12.5px;margin-top:4px"><b>'+nf(m.ml,2)+' m.l.</b> · máquina '+RTR.hm(m.tempo_maquina_min)+' · total '+RTR.hm(m.tempo_total_min)+' · '+(m.chapas||0)+' chapa(s) · '+fmt(+m.valor_router||0)+calib+'</div>'
        +((m.materiais&&m.materiais.length)?'<div class="mini" style="margin-top:2px">'+m.materiais.map(function(x){ return esc(x.nome)+' ×'+x.chapas; }).join(' · ')+(m.custo_material!=null?' · material '+fmt(+m.custo_material||0):'')+'</div>':'')+'</div>'
        +'<div style="display:flex;gap:6px"><button type="button" class="btn ghost sm" data-rtr="real" data-id="'+m.id+'">⏱ tempo real</button>'
        +'<button type="button" class="btn ghost sm" data-rtr="excluirMed" data-id="'+m.id+'">✕</button></div></div></div>';
    });
    return h;
  }
  function osNome(id){ var r='vinculada'; (st.osList||[]).forEach(function(o){ if(String(o.id)===String(id)) r=(o.serial_os||o.num||'')+(o.frente?' · '+o.frente:''); }); return r; }
  function carregarHist(){
    var base='router_medicoes?select=id,os_id,job,titulo,arquivos,ml,tempo_maquina_min,tempo_total_min,chapas,valor_router,tempo_real_min,params,created_at';
    var fim='&deletado_em=is.null&order=created_at.desc&limit=60';
    SS20.sb(base+',materiais,custo_material'+fim)
      .catch(function(e){ if(semTabela(e)) throw e; return SS20.sb(base+fim); })  /* tabela da versão anterior, sem colunas de chapa */
      .then(function(r){ st.hist=r||[]; st.histErro=null; draw(); })
      .catch(function(e){ st.hist=[]; st.histErro=semTabela(e)?'A tabela router_medicoes ainda não existe. Rode o arquivo v2/sql/router_medicoes.sql no SQL Editor do Supabase.':('Erro: '+e.message); draw(); });
  }
  function tempoReal(id){
    var m=null; (st.hist||[]).forEach(function(x){ if(String(x.id)===String(id)) m=x; }); if(!m) return;
    var v=window.prompt('Quanto tempo a router levou de verdade, só máquina (sem setup e programação)?\nEm minutos — estimado: '+Math.round(m.tempo_maquina_min)+' min',m.tempo_real_min?Math.round(m.tempo_real_min):'');
    if(v==null) return; var real=num(v); if(!(real>0)) return;
    SS20.sbw('router_medicoes?id=eq.'+id,'PATCH',{tempo_real_min:real}).then(function(){
      m.tempo_real_min=real;
      var ratio=m.tempo_maquina_min>0?real/m.tempo_maquina_min:1, ids={};
      (m.arquivos||[]).forEach(function(a){ (a.camadas||[]).forEach(function(l){ if(l.op!=='ignorar'&&st.cfg.presets[l.preset]) ids[l.preset]=1; }); });
      var lista=Object.keys(ids);
      if(lista.length&&Math.abs(ratio-1)>0.03){
        var nomes=lista.map(function(i){ return st.cfg.presets[i].nome; }).join(', ');
        if(window.confirm('O real foi '+nf(ratio,2)+'× o estimado.\nAjustar o fator de aceleração destes presets?\n'+nomes)){
          lista.forEach(function(i){ var p=st.cfg.presets[i]; p.fator=Math.round(clampN((num(p.fator)||1)*ratio,0.5,5)*100)/100; });
          recalc(); return salvarCfg();
        }
      }
    }).then(function(){ draw(); }).catch(function(e){ aviso('Erro: '+e.message,true); });
  }
  function clampN(v,a,b){ return v<a?a:(v>b?b:v); }
  function excluirMed(id){
    if(!window.confirm('Excluir esta medição?')) return;
    SS20.sbw('router_medicoes?id=eq.'+id,'PATCH',{deletado_em:new Date().toISOString()}).then(function(){ st.hist=null; draw(); }).catch(function(e){ aviso('Erro: '+e.message,true); });
  }

  /* ── aba PARÂMETROS ── */
  function telaParam(){
    var M=st.cfg.maq, B=st.cfg.cob, h='<div class="card"><h3>Máquina</h3><div class="rtr-grid">';
    h+=campo('maq','rapidoXY','Rápido XY (mm/min)',M.rapidoXY)+campo('maq','rapidoZ','Rápido Z (mm/min)',M.rapidoZ)+campo('maq','zSeguro','Z seguro (mm)',M.zSeguro)
      +campo('maq','trocaMin','Troca de fresa (min)',M.trocaMin)+campo('maq','setupMin','Setup por chapa (min)',M.setupMin)+campo('maq','progMin','Programação por arquivo (min)',M.progMin)
      +campo('maq','fatorGcode','Fator G-code (×)',M.fatorGcode);
    h+='</div></div>';
    h+='<div class="card"><h3>Encaixe nas chapas</h3><div class="rtr-grid">';
    h+=campo('maq','margem','Margem da borda (mm)',M.margem)+campo('maq','folga','Folga entre peças (mm, + Ø da fresa)',M.folga);
    h+='<div><span class="rtr-lbl">Custo do material por</span><select class="rtr-sel" style="width:100%;padding:8px" data-rtr="modo">'
      +MODOS.map(function(m){ return '<option value="'+m[0]+'"'+(m[0]===(B.modoMat||'inteira')?' selected':'')+'>'+m[1]+'</option>'; }).join('')+'</select></div>';
    h+='</div></div>';
    h+='<div class="card"><h3>Cobrança</h3><div class="rtr-grid">';
    h+=campo('cob','valorML','Router R$/m.l.',B.valorML)+campo('cob','maqML','Parte máquina PDVEX R$/m.l.',B.maqML)+campo('cob','horaOp','Operador R$/h',B.horaOp)+campo('cob','horaProg','Programação R$/h',B.horaProg);
    h+='</div></div>';
    h+='<div class="card"><h3>Materiais, chapas e fresas</h3><div class="mini" style="margin-bottom:10px">Cada material de corte tem a sua chapa (mm) e o preço da chapa (R$). Avanço e mergulho em mm/min; passadas = profundidade ÷ passo; fator = aceleração real (ajusta sozinho pelo tempo real no Histórico).</div>';
    var grupos={};
    st.cfg.ordem.forEach(function(id){ var p=st.cfg.presets[id]; if(!p||p.op==='ignorar') return; (grupos[famDe(p)]=grupos[famDe(p)]||[]).push(id); });
    RTR.FAMILIAS.forEach(function(f){
      var ids=grupos[f]; if(!ids) return;
      var maquina=f==='Vinco e usinagem', livre=f==='Outros';
      h+='<details class="rtr-fam" data-fam="'+esc(f)+'"'+(st.famAberta[f]?' open':'')+'><summary>'+esc(maquina?'Vinco, rebaixo e gravação':f)+' <span class="mini" style="font-weight:500">· '+ids.length+'</span></summary><div class="rtr-famc"><div style="overflow-x:auto">';
      h+='<table class="rtr-pt" style="min-width:'+(maquina||livre?860:820)+'px"><thead><tr><th>Nome</th>'+(maquina||livre?'<th>Operação</th>':'')
        +(maquina?'':'<th class="num">R$ chapa</th><th class="num">Chapa L (mm)</th><th class="num">Chapa A (mm)</th>')
        +'<th class="num">Ø fresa</th><th class="num">Prof.</th><th class="num">Passo</th><th class="num">Avanço</th><th class="num">Mergulho</th><th class="num">Fator</th><th></th></tr></thead><tbody>';
      var fontes={};
      ids.forEach(function(id){
        var p=st.cfg.presets[id], ch=p.chapa||[0,0], corte=p.op==='corte';
        if(p.fonte) fontes[p.fonte]=1;
        h+='<tr><td><input class="rtr-in" style="min-width:150px" type="text" data-rtr="pp" data-id="'+esc(id)+'" data-k="nome" value="'+esc(p.nome)+'"></td>';
        if(maquina||livre) h+='<td><select class="rtr-sel" data-rtr="pp" data-id="'+esc(id)+'" data-k="op">'+OPS.filter(function(o){ return o[0]!=='ignorar'; }).map(function(o){ return '<option value="'+o[0]+'"'+(o[0]===p.op?' selected':'')+'>'+o[1]+'</option>'; }).join('')+'</select></td>';
        if(!maquina){
          h+='<td><input class="rtr-in" style="text-align:right;width:100%'+(corte&&!(num(p.preco)>0)?';border-color:var(--warn)':'')+'" type="text" inputmode="decimal" data-rtr="pp" data-id="'+esc(id)+'" data-k="preco" value="'+(corte&&num(p.preco)>0?esc(nfIn(p.preco)):'')+'" placeholder="'+(corte?'sem preço':'')+'"'+(corte?'':' disabled')+'></td>';
          h+='<td><input class="rtr-in" style="text-align:right;width:100%" type="text" inputmode="decimal" data-rtr="pp" data-id="'+esc(id)+'" data-k="cw" value="'+(corte?esc(nfIn(ch[0])):'')+'"'+(corte?'':' disabled')+'></td>';
          h+='<td><input class="rtr-in" style="text-align:right;width:100%" type="text" inputmode="decimal" data-rtr="pp" data-id="'+esc(id)+'" data-k="ch" value="'+(corte?esc(nfIn(ch[1])):'')+'"'+(corte?'':' disabled')+'></td>';
        }
        ['d','prof','passo','avanco','mergulho','fator'].forEach(function(k){ h+='<td><input class="rtr-in" style="text-align:right;width:100%" type="text" inputmode="decimal" data-rtr="pp" data-id="'+esc(id)+'" data-k="'+k+'" value="'+esc(nfIn(p[k]||0))+'"></td>'; });
        h+='<td>'+(RTR.PRESETS.some(function(x){ return x.id===id; })?'':'<button type="button" class="btn ghost sm" data-rtr="delPreset" data-id="'+esc(id)+'">✕</button>')+'</td></tr>';
      });
      h+='</tbody></table></div>';
      var fl=Object.keys(fontes); if(fl.length) h+='<div class="mini" style="margin-top:6px">Preços: '+fl.map(esc).join(' · ')+'</div>';
      h+='</div></details>';
    });
    h+='<div class="rtr-act"><button type="button" class="btn ghost" data-rtr="novoPreset">＋ Novo material</button></div></div>';
    h+='<div class="rtr-act"><button type="button" class="btn acc" data-rtr="salvarCfg">💾 Salvar parâmetros</button><button type="button" class="btn ghost" data-rtr="restaurar">Restaurar padrão</button></div>';
    h+='<div class="mini" style="margin-top:12px;line-height:1.5">Corte: MDF 15 com fresa 6 mm, F3000, rampa 1000 e Z seguro 10 mm vêm dos .tap reais da Sul Sign; os outros materiais são ponto de partida — ajuste com o Max/Edson e use o tempo real do Histórico para calibrar. Chapas e preços: planilha da Flaviense (MDF e compensado), sua tabela de PVC e acrílico, planilha de policarbonato e lista de chapas do ORC (PS); ACM 4 mm está sem preço.</div>';
    return h;
  }
  function campo(grp,k,lbl,v){ return '<div><span class="rtr-lbl">'+lbl+'</span><input class="rtr-in" style="width:100%" type="text" inputmode="decimal" data-rtr="cfg" data-g="'+grp+'" data-k="'+k+'" value="'+esc(nfIn(v))+'"></div>'; }

  /* ═════════ EVENTOS ═════════ */
  function itemPor(id){ var r=null; st.itens.forEach(function(it){ if(it.id===id) r=it; }); return r; }
  function ligar(root){
    if(!root) return;
    if(st.aba==='medir'||st.aba==='hist') carregarOS();
    var inp=root.querySelector('#rtr-file');
    if(inp) inp.addEventListener('change',function(){ var fs=Array.prototype.slice.call(this.files||[]); this.value=''; arquivos(fs); });
    var dz=root.querySelector('[data-rtr="drop"]');
    if(dz){
      dz.addEventListener('dragover',function(e){ e.preventDefault(); dz.className='rtr-drop over'; });
      dz.addEventListener('dragleave',function(){ dz.className='rtr-drop'; });
      dz.addEventListener('drop',function(e){ e.preventDefault(); dz.className='rtr-drop'; arquivos(Array.prototype.slice.call((e.dataTransfer&&e.dataTransfer.files)||[])); });
    }
    root.addEventListener('click',function(e){
      var t=e.target;
      if(t&&t.getAttribute&&t.getAttribute('data-ci')!=null){
        var sv=t.ownerSVGElement||t.parentNode, it=itemPor(sv.getAttribute('data-rtr-svg'));
        if(it){ var ct=it.doc.contornos[+t.getAttribute('data-ci')]; if(ct){ ct.off=!ct.off; recalc(); draw(); } }
        return;
      }
      while(t&&t!==root&&!(t.getAttribute&&t.getAttribute('data-rtr'))) t=t.parentNode;
      if(!t||t===root) return;
      var a=t.getAttribute('data-rtr'), it2=itemPor(t.getAttribute('data-it'));
      if(a==='aba'){ st.aba=t.getAttribute('data-v'); if(st.aba==='hist') st.hist=null; draw(); }
      else if(a==='remover'&&it2){ st.itens=st.itens.filter(function(x){ return x!==it2; }); recalc(); draw(); }
      else if(a==='soChapa'&&it2){ var W=it2.doc.chapa.w,H=it2.doc.chapa.h; it2.doc.contornos.forEach(function(ct){ var b=ct.bb; ct.off=!(b[0]>=-1&&b[1]>=-1&&b[2]<=W+1&&b[3]<=H+1); }); recalc(); draw(); }
      else if(a==='todos'&&it2){ it2.doc.contornos.forEach(function(ct){ ct.off=false; }); recalc(); draw(); }
      else if(a==='desvincular'){ st.os=null; draw(); }
      else if(a==='salvar') salvar();
      else if(a==='copiar') copiar(resumo(false));
      else if(a==='imprimir') imprimir();
      else if(a==='limpar'){ if(window.confirm('Tirar todos os arquivos?')){ st.itens=[]; st.calc=null; draw(); } }
      else if(a==='real') tempoReal(t.getAttribute('data-id'));
      else if(a==='excluirMed') excluirMed(t.getAttribute('data-id'));
      else if(a==='salvarCfg') salvarCfg().then(function(){ recalc(); draw(); });
      else if(a==='restaurar'){ if(window.confirm('Voltar todos os parâmetros ao padrão?')){ st.cfg=padrao(); recalc(); draw(); } }
      else if(a==='novoPreset'){ var id='u'+Date.now().toString(36), b=copia(st.cfg.presets.mdf15); b.id=id; b.nome='Novo material'; b.fam='Outros'; b.preco=0; b.fonte=''; st.cfg.presets[id]=b; inserir(st.cfg.ordem,id); st.famAberta.Outros=true; draw(); }
      else if(a==='enc'){ var mid=t.getAttribute('data-mat'); st.encAberto[mid]=!st.encAberto[mid]; draw(); }
      else if(a==='delPreset'){ var did=t.getAttribute('data-id'); delete st.cfg.presets[did]; st.cfg.ordem=st.cfg.ordem.filter(function(x){ return x!==did; }); st.itens.forEach(function(x){ Object.keys(x.ops).forEach(function(k){ if(x.ops[k]===did) x.ops[k]='mdf15'; }); }); recalc(); draw(); }
    });
    root.addEventListener('toggle',function(e){ var t=e.target; if(t&&t.getAttribute&&t.getAttribute('data-fam')) st.famAberta[t.getAttribute('data-fam')]=!!t.open; },true);
    root.addEventListener('change',function(e){
      var t=e.target, a=t.getAttribute&&t.getAttribute('data-rtr'); if(!a) return;
      var it=itemPor(t.getAttribute('data-it'));
      if(a==='preset'&&it){ var cam=t.getAttribute('data-cam'); it.ops[cam]=t.value; lembrar(cam,t.value); recalc(); draw(); }
      else if(a==='qtd'&&it){ it.qtd=Math.max(1,Math.round(num(t.value))||1); it.qtdFonte=null; recalc(); draw(); }
      else if(a==='gmat'&&it){ it.mat=t.value; recalc(); draw(); }
      else if(a==='ovr'){ var mo=t.getAttribute('data-mat'), nv=Math.round(num(t.value)); if(String(t.value).trim()===''||!(nv>0)) delete st.ovr[mo]; else st.ovr[mo]=nv; recalc(); draw(); }
      else if(a==='reuso'){ var mr2=t.getAttribute('data-mat'); if(t.checked) st.reuso[mr2]=true; else delete st.reuso[mr2]; recalc(); draw(); }
      else if(a==='modo'){ st.cfg.cob.modoMat=t.value; recalc(); draw(); }
      else if(a==='escala'&&it){
        var k=num(t.value);
        if(k<0){ var bb=it.doc.bb, wAtual=(bb[2]-bb[0]); var v=window.prompt('Largura real do desenho em mm (hoje lida: '+nf(wAtual,1)+' mm)'); if(!v||!(num(v)>0)||!(wAtual>0)){ draw(); return; } k=num(v)/wAtual*it.escala; }
        RTR.escalar(it.doc,k/it.escala); it.escala=k; preparar(it.doc); recalc(); draw();
      }
      else if(a==='os'){ var id=t.value; if(!id){ st.os=null; } else { var o=null; (st.osList||[]).forEach(function(x){ if(String(x.id)===id) o=x; }); st.os=o?{id:o.id,label:(o.serial_os||o.num||'OS')+(o.frente?' · '+o.frente:''),job:o.job||o.orcamento_numero||null}:st.os; } draw(); }
      else if(a==='job'){ st.job=t.value; }
      else if(a==='anotar'){ st.anotar=!!t.checked; }
      else if(a==='cfg'){ st.cfg[t.getAttribute('data-g')][t.getAttribute('data-k')]=num(t.value); recalc(); }
      else if(a==='pp'){
        var p=st.cfg.presets[t.getAttribute('data-id')], k2=t.getAttribute('data-k'); if(!p) return;
        if(k2==='cw'||k2==='ch'){ p.chapa=(p.chapa||[2750,1850]).slice(0,2); p.chapa[k2==='cw'?0:1]=num(t.value); }
        else if(k2==='op'){ p.op=t.value; if(p.op==='corte'&&!p.chapa) p.chapa=[2750,1850]; }
        else p[k2]=(k2==='nome')?t.value:num(t.value);
        recalc(); if(k2==='op') draw();
      }
    });
  }
  function arquivos(fs){
    if(!fs.length) return;
    var seq=Promise.resolve();
    fs.forEach(function(f){ seq=seq.then(function(){ if(f.size>60*1024*1024){ aviso(f.name+': arquivo grande demais (>60 MB).',true); return; } return lerArquivo(f).then(function(buf){ return adicionar(f.name,buf); }); }); });
    seq.catch(function(e){ aviso(e.message,true); });
  }

  SS20.modules.rtr={render:render, _st:st};
})();
