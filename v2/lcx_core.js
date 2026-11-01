/* ═══════════════════════════════════════════════════════════════
   SULSIGN OS 2.0 — MOTOR: LETRA CAIXA / LOGOS RECORTADOS (lcx_core.js)
   Síntese das regras que funcionam nas ferramentas da Sul Sign:
   · geometria real do desenho (leitores do Tempo de Router, rtr_core.js)
   · regras do Lumiforms (mínimos, arte-final, consumíveis, operador de
     router, eletricista, embalagem) e convenções dos orçamentos RG/PDVEX
   · BDI divisivo com AC automática (out/2026) e perfis de cliente
   Três construções: chapada (+vinil/pintura), caixa com face (+LED) e
   impressão 3D. Saídas: memorial de custo, levantamento de materiais,
   Sintético e memorial descritivo.
   Roda no navegador e no Node (testes). Sem dependências além do RTR
   (opcional, só para ler arquivos e encaixar chapas).
   iOS Safari: var, sem template literals, sem arrow, sem let/const.
   ═══════════════════════════════════════════════════════════════ */
(function(root){
  'use strict';
  var LCX={versao:'1.0'};

  function getRTR(){ var g=(typeof window!=='undefined')?window:(typeof globalThis!=='undefined'?globalThis:root); return g.RTR||root.RTR||null; }
  function num(x){ var v=parseFloat(String(x==null?'':x).replace(',','.')); return isFinite(v)?v:0; }
  function r2(v){ return Math.round((+v||0)*100)/100; }
  function copia(o){ return JSON.parse(JSON.stringify(o)); }
  function mix(a,b){ var o=copia(a); Object.keys(b||{}).forEach(function(k){ var v=b[k]; if(v!=null){ if(typeof v==='object'&&!Array.isArray(v)&&typeof o[k]==='object'&&o[k]) o[k]=mix(o[k],v); else o[k]=v; } }); return o; }

  /* ───────────── complexidade ───────────── */
  /* fator (montagem, eletricista, embalagem) e percentuais (consumíveis, arte-final): Lumiforms 03–05/10/2026 */
  LCX.COMPLEX=[
    {id:'simples', nome:'Simples',        f:1.0,  pct:2.0},
    {id:'normal',  nome:'Normal',         f:1.25, pct:2.75},
    {id:'complexa',nome:'Complexa',       f:1.5,  pct:3.5},
    {id:'muito',   nome:'Muito complexa', f:2.0,  pct:5.0}
  ];
  function cxDe(id){ for(var i=0;i<LCX.COMPLEX.length;i++){ if(LCX.COMPLEX[i].id===id) return LCX.COMPLEX[i]; } return LCX.COMPLEX[1]; }

  /* ───────────── BDI: perfis de cliente ─────────────
     Sul Sign (out/2026): fator = (1+DF+RI)/(1−Lucro−Imp−AC), AC = custos fixos ÷ faturamento (15,8% da venda).
       (1+0,02+0,03)/(1−0,18−0,10−0,158) = 1,8683×; NF 12% por fora quando houver nota.
     PDVEX: (1+AC)/(1−Lucro) com AC 8 e lucro 22 = 1,3846×, sem imposto, sem NF.
     Router: preço de venda por m.l. de cada perfil (R$ 4–4,50 parceiro · R$ 10 não parceiro · R$ 8 PDVEX). */
  LCX.PERFIS={
    sulsign: {id:'sulsign', nome:'Sul Sign · cliente direto (AC automática)', df:2, ri:3, lucro:18, imp:10, acVenda:15.8, acCusto:0, nfPct:12, routerML:10},
    parceiro:{id:'parceiro',nome:'Sul Sign · parceiro (router R$ 4,50)',     df:2, ri:3, lucro:18, imp:10, acVenda:15.8, acCusto:0, nfPct:12, routerML:4.5},
    legado:  {id:'legado',  nome:'Sul Sign · BDI antigo (AC 8% sobre custo)',df:2, ri:3, lucro:18, imp:10, acVenda:0,    acCusto:8, nfPct:12, routerML:10},
    pdvex:   {id:'pdvex',   nome:'PDVEX · OS interna (sem NF)',              df:0, ri:0, lucro:22, imp:0,  acVenda:0,    acCusto:8, nfPct:0,  routerML:8}
  };
  LCX.fator=function(p){
    var d=1-(num(p.lucro)+num(p.imp)+num(p.acVenda))/100;
    if(d<=0.05) d=0.05;
    return (1+(num(p.acCusto)+num(p.df)+num(p.ri))/100)/d;
  };

  /* ───────────── parâmetros editáveis (preços-base e regras) ───────────── */
  LCX.PARAMS={
    /* materiais: preço e chapa vêm do catálogo do Tempo de Router (RTR.PRESETS); aqui só regras de cobrança */
    perda:25,                       /* % de perda de chapa (cobrança por consumo) */
    modoMat:'auto',                 /* auto: ≤ 1 chapa cobra o consumo; senão chapas inteiras | consumo | inteira */
    minPvc:30, minAcr:40,           /* valor mínimo por material na peça (Lumiforms 05/10) */
    pintura:85,                     /* R$/m² PU (Carlos 23/10) */
    vinil:{fosco:35, uv:45, lam:55, recorte:100},  /* R$/m² de material (base Mubisys) */
    vinilSangria:21, vinilMinM2:0.5,/* sangria em mm; consumo mínimo de vinil (Eletro Z) */
    mdf3:{preco:80, chapa:[2750,1850]},            /* gabarito: MDF 3 mm, R$ 80 a chapa (Shell 23/10) */
    gabMargem:60,                   /* mm de margem do gabarito ao redor do desenho (Shell) */
    /* mão de obra (R$/h) */
    horaOperador:35, horaMontador:30, horaAplicador:60, horaEletricista:50,
    opSetupMin:15, opMinPorM:1.2, opMinHoras:1,    /* operador de router: 15 min + 1,2 min/m, mínimo 1 h por job (hábito do Carlos) */
    montBaseMin:15, montPecaMin:5, montMinPorM:20, /* chapada: base + min/peça · caixa: min por m de contorno ⚠ sem histórico */
    aplicBaseH:0.25, aplicHPorM2:0.5,              /* aplicação de vinil: 0,25 h + 0,5 h/m² (Welt Pet 0,75 h por 1,5 m²) */
    /* arte-final, embalagem, consumíveis (Lumiforms) */
    arteMin:40, embalMin:10, embalM2:12,
    /* eletricista: 20 min + 5 min/peça + 2 min/m de LED, mínimo R$ 50 × complexidade */
    eletSetupMin:20, eletPecaMin:5, eletMinPorM:2, eletMin:50,
    /* iluminação */
    led:{
      fita:  {nome:'Fita LED',        preco:12, w:9.6, fonte:true},
      cob:   {nome:'Neon COB',        preco:35, w:10,  fonte:true},
      neon:  {nome:'Neon flex',       preco:35, w:12,  fonte:true},
      v220:  {nome:'LED 220 V',       preco:30, w:0,   fonte:false}
    },
    ledEspac:80,                    /* mm entre fileiras (frontlit) */
    fonteRW:0.8, fonteFolga:1.25, minFonte:40,
    fiacaoPeca:6,
    fixConj:2.5, fixPorPecaChapada:2, fixPorPecaCaixa:4,
    latBordas:2,                    /* caixa: bordas cortadas por tira de lateral */
    /* instalação Sul Sign (⚠ do CALC antigo, sem histórico novo) */
    instBase:150, instPeca:20, instLuz:1.3,
    /* impressão 3D (Lumiforms/Shell) */
    p3d:{ghora:286, fator:1.07, perda:20, horaMaq:12, kg:{petg:95, pla:75, asa:140}, parede:1.2, densidade:1.25}
  };

  /* ───────────── catálogo de materiais ─────────────
     Usa RTR.PRESETS quando existir (preço da chapa, medida, espessura); senão um mínimo embutido. */
  var CAT_MIN={
    pvc5:{nome:'PVC expandido 5 mm',fam:'PVC',chapa:[2440,1220],preco:135},
    pvc10:{nome:'PVC expandido 10 mm',fam:'PVC',chapa:[2440,1220],preco:216},
    pvc15:{nome:'PVC expandido 15 mm',fam:'PVC',chapa:[2440,1220],preco:330},
    pvc20:{nome:'PVC expandido 20 mm',fam:'PVC',chapa:[2440,1220],preco:444},
    mdf15:{nome:'MDF cru 15 mm',fam:'MDF',chapa:[2750,1850],preco:259},
    mdf3:{nome:'MDF cru 3 mm',fam:'MDF',chapa:[2750,1850],preco:73},
    acm3:{nome:'ACM 3 mm',fam:'ACM',chapa:[5000,1220],preco:300},
    acr3:{nome:'Acrílico branco 3 mm',fam:'Acrílico',chapa:[2000,1000],preco:376.25},
    acrc3:{nome:'Acrílico cristal 3 mm',fam:'Acrílico',chapa:[2000,1000],preco:300}
  };
  /* preços/chapas ajustados pelo Carlos no Tempo de Router (router_config) sobrepõem os de fábrica */
  var OVCAT={};
  LCX.setCatalogoOv=function(m){ OVCAT=m||{}; };
  function aplicaOv(c){ var o=c&&OVCAT[c.id]; if(o){ if(o.preco!=null&&isFinite(+o.preco)) c.preco=+o.preco; if(o.chapa&&o.chapa.length>=2) c.chapa=[+o.chapa[0],+o.chapa[1]]; } return c; }
  LCX.catalogo=function(id){
    var R=getRTR();
    if(R&&R.PRESETS){ for(var i=0;i<R.PRESETS.length;i++){ var p=R.PRESETS[i]; if(p.id===id&&p.op==='corte') return aplicaOv({id:p.id,nome:p.nome,fam:p.fam,chapa:(p.chapa||[2750,1850]).slice(0,2),preco:num(p.preco),esp:num(p.prof),d:num(p.d)}); } }
    var c=CAT_MIN[id]; return c?aplicaOv({id:id,nome:c.nome,fam:c.fam,chapa:c.chapa.slice(),preco:c.preco,esp:0,d:6}):null;
  };
  LCX.listaMateriais=function(fam){
    var out=[], R=root.RTR, i;
    if(R&&R.PRESETS){ for(i=0;i<R.PRESETS.length;i++){ var p=R.PRESETS[i]; if(p.op==='corte'&&(!fam||fam.indexOf(p.fam)>=0)){ var cc=LCX.catalogo(p.id); out.push({id:p.id,nome:p.nome,fam:p.fam,preco:cc?cc.preco:num(p.preco)}); } } }
    else { Object.keys(CAT_MIN).forEach(function(k){ var c=CAT_MIN[k]; if(!fam||fam.indexOf(c.fam)>=0){ var cc=LCX.catalogo(k); out.push({id:k,nome:c.nome,fam:c.fam,preco:cc.preco}); } }); }
    return out;
  };
  function areaChapaM2(c){ return c.chapa[0]*c.chapa[1]/1e6; }

  /* ───────────── geometria ─────────────
     geo = {fonte, nome, pecas, vazados, areaM2 (líquida, vazados descontados), perimM (todos os contornos),
            bboxMm:[w,h], pecasLista:[{w,h,areaMm2}], avisos[]} */
  LCX.geoDeDoc=function(doc, camadasAtivas){
    var R=getRTR(); if(!R||!R._pecasDe) throw new Error('Leitor de arquivos (rtr_core.js) não carregado.');
    var cts=[], per=0, bb=[Infinity,Infinity,-Infinity,-Infinity];
    doc.contornos.forEach(function(ct){
      if(ct.off) return;
      if(camadasAtivas&&camadasAtivas.indexOf(ct.L)<0) return;
      cts.push(ct); per+=ct.len;
      if(ct.bb[0]<bb[0])bb[0]=ct.bb[0]; if(ct.bb[1]<bb[1])bb[1]=ct.bb[1]; if(ct.bb[2]>bb[2])bb[2]=ct.bb[2]; if(ct.bb[3]>bb[3])bb[3]=ct.bb[3];
    });
    if(!cts.length) return {fonte:'arquivo', nome:doc.nome, pecas:0, vazados:0, areaM2:0, perimM:0, bboxMm:[0,0], pecasLista:[], avisos:['Nenhum contorno nas camadas escolhidas.']};
    var pcs=R._pecasDe(cts), area=0, vaz=0, lista=[];
    pcs.forEach(function(pc){
      area+=pc.area; var fe=0; pc.membros.forEach(function(m){ if(m.c) fe++; }); vaz+=Math.max(0,fe-1);
      lista.push({w:pc.mr.w, h:pc.mr.h, areaMm2:pc.area});
    });
    var geo={fonte:'arquivo', nome:doc.nome, pecas:pcs.length, vazados:vaz, areaM2:area/1e6, perimM:per/1000, bboxMm:[bb[2]-bb[0], bb[3]-bb[1]], pecasLista:lista, avisos:(doc.avisos||[]).slice()};
    var lays={}; cts.forEach(function(c){ lays[c.L]=1; });
    Object.defineProperty(geo,'_doc',{value:doc,enumerable:false,writable:true});
    Object.defineProperty(geo,'_camadas',{value:Object.keys(lays),enumerable:false,writable:true});
    return geo;
  };
  /* sem arquivo: estimativa por texto e altura (letras de fonte cheia: largura 0,72·H, preenchimento 45%, contorno 4·H) */
  LCX.geoDeTexto=function(texto, alturaCm, qtdLetras){
    var H=num(alturaCm)/100, t=String(texto||'').replace(/\s/g,''), n=Math.max(1,Math.round(num(qtdLetras))||t.length||1);
    var larg=H*0.72;
    return {fonte:'texto', nome:texto||'letras', pecas:n, vazados:0, areaM2:H*larg*0.45*n, perimM:H*4*n, bboxMm:[larg*n*1000, H*1000],
            pecasLista:[], avisos:['Geometria ESTIMADA pela altura (preenchimento 45%). Suba o DXF/SVG para medir de verdade.']};
  };

  /* ───────────── cobrança de material por chapa ─────────────
     Entrada: lista de peças [{w,h,areaMm2}] (mm), material, qtd. Usa o encaixe do RTR quando houver. */
  function consumoChapas(mat, pecas, qtd, P, geo){
    var A=areaChapaM2(mat), env=0, liq=0, i;
    if(pecas&&pecas.length){ pecas.forEach(function(p){ env+=p.w*p.h; liq+=p.areaMm2; }); env=env/1e6*qtd; liq=liq/1e6*qtd; }
    else { env=(geo.bboxMm[0]*geo.bboxMm[1])/1e6*qtd; liq=geo.areaM2*qtd; }
    var chapasAuto=null, usadas=null;
    var R=getRTR();
    if(R&&R.consumo&&geo&&geo._doc){
      try {
        var cfg={presets:{}, maq:R.MAQ, cob:R.COB};
        var pr=null; for(i=0;i<R.PRESETS.length;i++){ if(R.PRESETS[i].id===mat.id) pr=R.PRESETS[i]; }
        if(pr){ pr=JSON.parse(JSON.stringify(pr)); pr.chapa=mat.chapa.slice(); pr.preco=mat.preco; cfg.presets[mat.id]=pr;
          var ops={}; (geo._camadas||[]).forEach(function(c){ ops[c]=mat.id; });
          var C=R.consumo([{id:'a', doc:geo._doc, qtd:qtd, ops:ops}], cfg, {modo:'usada'});
          if(C.materiais&&C.materiais[0]){ chapasAuto=C.materiais[0].chapasAuto; usadas=C.materiais[0].chapasUsadas; }
        }
      } catch(e){}
    }
    return {areaChapaM2:A, envM2:env, liqM2:liq, chapas:chapasAuto, usadas:usadas};
  }
  /* custo do material: modo consumo (área do retângulo envolvente + perda, com mínimo) ou chapas inteiras */
  function custoMaterial(mat, cons, P, minimo, modo){
    var A=cons.areaChapaM2, perda=1+num(P.perda)/100, m2=cons.envM2*perda;
    var consumo=Math.max(minimo||0, m2/A*mat.preco);
    var inteira=(cons.chapas!=null?cons.chapas:Math.max(1,Math.ceil(m2/A)))*mat.preco;
    var usadas=cons.usadas!=null?cons.usadas:m2/A;
    var modoEf=modo==='auto'?((usadas<=1.0001)?'consumo':'inteira'):modo;
    var v=modoEf==='consumo'?consumo:inteira;
    var minAplicado=modoEf==='consumo'&&consumo>m2/A*mat.preco+1e-9;
    return {valor:v, m2:m2, modo:modoEf, consumo:consumo, inteira:inteira, chapas:cons.chapas, usadas:usadas, minimo:minAplicado};
  }

  /* ───────────── cálculo principal ─────────────
     job = {
       nome, cliente, perfil, nf(bool), qtd, complexidade,
       geo (geoDeDoc/geoDeTexto), constr: 'chapada'|'caixa'|'impressao3d',
       chapada:{mat, acab:'vinil'|'pintura'|'nenhum', vinil:'fosco'|'uv'|'lam'|'recorte', cores},
       caixa:{face, lateral, fundo ('sem' ou id), prof (cm), ilum:'nenhuma'|'halo'|'frontlit'|'backlight'|'dupla', led, pintura(bool), cores},
       i3d:{peso_g, tempo_h, semPerda, fil:'petg'|'pla'|'asa'},
       gabarito:{on, modo:'mdf3'|'papel'}, instalacao:'cliente'|'sulsign'|'pdvex', alturaInst,
       extras:[{desc,valor,grupo}], params (override), ovr:{chave:{q,p}|valor}
     } */
  LCX.calcular=function(job){
    var P=mix(LCX.PARAMS, job.params||{});
    var perfil=mix(LCX.PERFIS[job.perfil||'sulsign']||LCX.PERFIS.sulsign, job.perfilOv||{});
    var fator=LCX.fator(perfil);
    var cx=cxDe(job.complexidade), qtd=Math.max(1,Math.round(num(job.qtd))||1);
    var geo=job.geo, linhas=[], avisos=[];
    var constr=job.constr||'chapada';
    function L(grupo,chave,desc,q,un,pu,v,nota){
      var l={grupo:grupo, chave:chave, desc:desc, qtd:q, un:un, pu:pu, custo:(v==null?r2(q*pu):v), nota:nota||''};
      var o=job.ovr&&job.ovr[chave];
      if(o!=null){
        if(typeof o==='object'){
          if(o.q!=null) l.qtd=num(o.q); if(o.p!=null) l.pu=num(o.p);
          l.custo=r2(l.qtd*l.pu); l.manual=true;
        } else { l.custo=r2(num(o)); l.manual=true; }
      }
      linhas.push(l); return l;
    }
    var pecas=Math.max(1,geo.pecas||1);
    var bboxM2=(geo.bboxMm[0]*geo.bboxMm[1])/1e6;
    var perim=geo.perimM, area=geo.areaM2;
    var materiais=[];                       /* levantamento de materiais */
    var mpTotal=0;                          /* base dos consumíveis: matéria-prima da peça */
    var corteML=0, corteGab=0, temRouter=false;
    var luz=false, ledM=0, watts=0;
    var temAcr=false;

    function matLinha(grupo, chave, rotulo, matId, pecasLst, minimo, medida){
      var mat=LCX.catalogo(matId); if(!mat){ avisos.push('Material "'+matId+'" fora do catálogo.'); return null; }
      var cons=consumoChapas(mat, pecasLst, qtd, P, geo);
      var cm=custoMaterial(mat, cons, P, minimo, P.modoMat);
      var desc=rotulo+' ('+mat.nome+')';
      var un=cm.modo==='consumo'?'m²':'chapa';
      var q=cm.modo==='consumo'?r2(cm.m2):(cm.chapas!=null?cm.chapas:Math.max(1,Math.ceil(cm.m2/areaChapaM2(mat))));
      var pu=cm.modo==='consumo'?(mat.preco/areaChapaM2(mat)):mat.preco;
      var nota=cm.modo==='consumo'?(cm.minimo?'valor mínimo R$ '+r2(minimo):'consumo + '+P.perda+'% de perda'):'chapas inteiras';
      var l=L(grupo, chave, desc, q, un, pu, cm.modo==='consumo'?r2(cm.valor):r2(cm.inteira), nota);
      materiais.push({chave:chave, material:mat.nome, fam:mat.fam, uso:rotulo, chapa:mat.chapa, precoChapa:mat.preco, envM2:cons.envM2, liqM2:cons.liqM2, m2Cobrado:cm.m2,
                      chapas:cm.chapas, usadas:cm.usadas, modo:cm.modo, custo:l.custo, nota:nota, medida:medida||''});
      return {l:l, mat:mat, cm:cm};
    }
    function minDe(mat){ return mat&&mat.fam==='PVC'?P.minPvc:(mat&&mat.fam==='Acrílico'?P.minAcr:0); }

    var pecasPrincipais=geo.pecasLista||[];
    var espMat=null;

    /* ── 1. CONSTRUÇÃO ── */
    if(constr==='chapada'){
      var cf=job.chapada||{};
      var rm=matLinha('mp','mat_face','Letra chapada', cf.mat||'pvc15', pecasPrincipais, minDe(LCX.catalogo(cf.mat||'pvc15')), Math.round(geo.bboxMm[0])+' × '+Math.round(geo.bboxMm[1])+' mm');
      if(rm){ mpTotal+=rm.l.custo; espMat=rm.mat; }
      corteML=perim*qtd; temRouter=true;
      var ac=cf.acab||'vinil';
      if(ac==='vinil'){
        var sg=P.vinilSangria/1000, tipo=cf.vinil||'lam';
        var m2v=Math.max(P.vinilMinM2*qtd, (geo.bboxMm[0]/1000+2*sg)*(geo.bboxMm[1]/1000+2*sg)*qtd);
        var pv=P.vinil[tipo]!=null?P.vinil[tipo]:P.vinil.lam;
        var lv=L('mp','vinil','Adesivo vinil impresso na frente ('+vinilNome(tipo)+')', r2(m2v), 'm²', pv, null, 'sangria '+P.vinilSangria+' mm · mínimo '+P.vinilMinM2+' m²');
        mpTotal+=lv.custo;
        materiais.push({chave:'vinil', material:'Vinil '+vinilNome(tipo), fam:'Vinil', uso:'Frente', chapa:null, precoChapa:pv, envM2:m2v, liqM2:area*qtd, m2Cobrado:m2v, custo:lv.custo, nota:lv.nota, medida:''});
      } else if(ac==='pintura'){
        var nc=Math.max(1,Math.round(num(cf.cores))||1), mp2=area*qtd*nc;
        var lp=L('mp','pintura','Pintura PU'+(nc>1?' ('+nc+' cores)':''), r2(mp2), 'm²', P.pintura, null, '');
        mpTotal+=lp.custo;
        materiais.push({chave:'pintura', material:'Pintura PU', fam:'Acabamento', uso:'Face', chapa:null, precoChapa:P.pintura, envM2:mp2, liqM2:mp2, m2Cobrado:mp2, custo:lp.custo, nota:'', medida:''});
      }
    } else if(constr==='caixa'){
      var cj=job.caixa||{}, prof=Math.max(0.5,num(cj.prof)||5)/100;
      var faceId=cj.face||'acr3', latId=cj.lateral||'pvc10', fundoId=cj.fundo==null?'pvc5':cj.fundo;
      var rf=matLinha('mp','mat_face','Face', faceId, pecasPrincipais, minDe(LCX.catalogo(faceId)), '');
      if(rf){ mpTotal+=rf.l.custo; if(rf.mat.fam==='Acrílico') temAcr=true; }
      /* lateral: faixa de perímetro × profundidade, cobrada por área (retângulo do desenvolvimento + perda) */
      var latMat=LCX.catalogo(latId);
      if(latMat){
        var areaLat=perim*prof*qtd, perda=1+num(P.perda)/100, mm2=areaLat*perda;
        var vLat=Math.max(minDe(latMat), mm2/areaChapaM2(latMat)*latMat.preco);
        var lLat=L('mp','mat_lat','Lateral ('+latMat.nome+')', r2(mm2), 'm²', latMat.preco/areaChapaM2(latMat), r2(vLat), 'perímetro × profundidade '+Math.round(prof*100)+' cm + '+P.perda+'% de perda');
        mpTotal+=lLat.custo; if(latMat.fam==='Acrílico') temAcr=true;
        materiais.push({chave:'mat_lat', material:latMat.nome, fam:latMat.fam, uso:'Lateral', chapa:latMat.chapa, precoChapa:latMat.preco, envM2:areaLat, liqM2:areaLat, m2Cobrado:mm2, chapas:null, usadas:null, modo:'consumo', custo:lLat.custo, nota:lLat.nota, medida:'faixa de '+Math.round(prof*100)+' cm'});
      }
      if(fundoId!=='sem'){
        var rfu=matLinha('mp','mat_fundo','Fundo', fundoId, pecasPrincipais, minDe(LCX.catalogo(fundoId)), '');
        if(rfu) mpTotal+=rfu.l.custo;
      }
      var nFaces=(fundoId!=='sem'?2:1);
      corteML=perim*qtd*(nFaces+num(P.latBordas)); temRouter=true;
      var acC=cj.pintura;
      if(acC){
        var ncc=Math.max(1,Math.round(num(cj.cores))||1), mpC=(area+perim*prof)*qtd*ncc;
        var lpc=L('mp','pintura','Pintura PU (face e lateral)'+(ncc>1?' ('+ncc+' cores)':''), r2(mpC), 'm²', P.pintura, null, '');
        mpTotal+=lpc.custo;
        materiais.push({chave:'pintura', material:'Pintura PU', fam:'Acabamento', uso:'Face e lateral', chapa:null, precoChapa:P.pintura, envM2:mpC, liqM2:mpC, m2Cobrado:mpC, custo:lpc.custo, nota:'', medida:''});
      }
      /* iluminação */
      var il=cj.ilum||'nenhuma';
      if(il!=='nenhuma'){
        luz=true;
        var tp=P.led[cj.led||'fita']||P.led.fita;
        var frente=il==='frontlit'||il==='dupla', halo=il==='halo'||il==='dupla'?true:false;
        var m=0;
        if(il==='halo') m=perim;
        else if(il==='frontlit') m=Math.max(perim, area/(P.ledEspac/1000), 0.25*pecas);
        else if(il==='backlight') m=area/Math.max(0.05,1.2*prof);
        else if(il==='dupla') m=Math.max(perim, area/(P.ledEspac/1000), 0.25*pecas)+perim;
        ledM=m*qtd;
        var lLed=L('mp','led',tp.nome+' ('+il+')', r2(ledM), 'm', tp.preco, null, 'contorno/área conforme o tipo de iluminação');
        mpTotal+=lLed.custo;
        materiais.push({chave:'led', material:tp.nome, fam:'Elétrica', uso:il, chapa:null, precoChapa:tp.preco, envM2:0, liqM2:0, m2Cobrado:0, custo:lLed.custo, nota:'', medida:r2(ledM)+' m'});
        if(tp.fonte){
          watts=ledM*tp.w*P.fonteFolga;
          var lFo=L('mp','fonte','Fonte chaveada', Math.ceil(watts), 'W', P.fonteRW, r2(Math.max(P.minFonte, watts*P.fonteRW)), 'folga '+P.fonteFolga+'× · mínimo R$ '+P.minFonte);
          mpTotal+=lFo.custo;
        }
        var lFi=L('mp','fiacao','Fiação e conectores', pecas*qtd, 'peça', P.fiacaoPeca, null, '');
        mpTotal+=lFi.custo;
      }
    } else { /* impressão 3D */
      var i3=job.i3d||{}, p3=P.p3d;
      var prof3=Math.max(0.5,num(job.caixa&&job.caixa.prof)||5)/100;
      var peso;
      if(num(i3.peso_g)>0){ peso=num(i3.peso_g)*qtd*(i3.semPerda?1:(1+p3.perda/100)); }
      else { var desenv=(area*1.6+perim*prof3)*10000; peso=desenv*(p3.parede/10)*p3.densidade*1.15*qtd*(1+p3.perda/100); avisos.push('Peso do filamento ESTIMADO pela geometria: informe o peso do fatiador.'); }
      var horas=num(i3.tempo_h)>0?num(i3.tempo_h)*qtd*(i3.semPerda?1:(1+p3.perda/100)):peso/(p3.ghora*p3.fator);
      var kg=p3.kg[i3.fil||'petg']||p3.kg.petg;
      var lFil=L('mp','filamento','Filamento '+String(i3.fil||'petg').toUpperCase(), r2(peso), 'g', kg/1000, null, num(i3.peso_g)>0?'peso informado'+(i3.semPerda?'':' + '+p3.perda+'% de perda'):'estimado');
      mpTotal+=lFil.custo;
      var lMq=L('eqp','maq3d','Hora de máquina 3D', r2(horas), 'h', p3.horaMaq, null, num(i3.tempo_h)>0?'tempo informado':'peso ÷ ('+p3.ghora+' g/h × '+p3.fator+')');
      mpTotal+=lMq.custo;
      materiais.push({chave:'filamento', material:'Filamento '+String(i3.fil||'petg').toUpperCase(), fam:'3D', uso:'Impressão', chapa:null, precoChapa:kg, envM2:0, liqM2:0, m2Cobrado:0, custo:lFil.custo, nota:lFil.nota, medida:r2(peso)+' g · '+r2(horas)+' h'});
      var ilu3=(job.caixa&&job.caixa.ilum)||'nenhuma';
      if(ilu3!=='nenhuma'){ luz=true; var tp3=P.led[(job.caixa&&job.caixa.led)||'fita']||P.led.fita; ledM=perim*qtd;
        var l3=L('mp','led',tp3.nome+' ('+ilu3+')', r2(ledM), 'm', tp3.preco, null, 'contorno'); mpTotal+=l3.custo;
        if(tp3.fonte){ watts=ledM*tp3.w*P.fonteFolga; var f3=L('mp','fonte','Fonte chaveada', Math.ceil(watts), 'W', P.fonteRW, r2(Math.max(P.minFonte, watts*P.fonteRW)), ''); mpTotal+=f3.custo; } }
    }

    /* ── 2. GABARITO DE INSTALAÇÃO ── */
    var gb=job.gabarito||{};
    if(gb.on){
      if((gb.modo||'mdf3')==='mdf3'){
        var mg=P.gabMargem/1000, gw=geo.bboxMm[0]/1000+2*mg, gh=geo.bboxMm[1]/1000+2*mg;
        var gArea=gw*gh*qtd*(1+num(P.perda)/100);
        var gPreco=P.mdf3.preco/(P.mdf3.chapa[0]*P.mdf3.chapa[1]/1e6);
        var lg=L('gab','gab_mat','Gabarito de instalação — MDF 3 mm (margem '+P.gabMargem/10+' cm, janelas no contorno)', r2(gArea), 'm²', gPreco, null, 'janelas = contorno de cada peça');
        corteGab=(perim+2*(gw+gh))*qtd; temRouter=true;
        materiais.push({chave:'gab_mat', material:'MDF cru 3 mm (gabarito)', fam:'MDF', uso:'Gabarito', chapa:P.mdf3.chapa, precoChapa:P.mdf3.preco, envM2:gw*gh*qtd, liqM2:gw*gh*qtd, m2Cobrado:gArea, custo:lg.custo, nota:lg.nota, medida:Math.round(gw*1000)+' × '+Math.round(gh*1000)+' mm'});
      } else {
        var gA2=(geo.bboxMm[0]/1000+0.1)*(geo.bboxMm[1]/1000+0.1)*qtd;
        var lg2=L('gab','gab_mat','Gabarito de instalação — impresso 1:1 com marcas de furo', r2(gA2), 'm²', P.vinil.fosco, null, 'vinil fosco');
        materiais.push({chave:'gab_mat', material:'Vinil fosco (gabarito)', fam:'Vinil', uso:'Gabarito', chapa:null, precoChapa:P.vinil.fosco, envM2:gA2, liqM2:gA2, m2Cobrado:gA2, custo:lg2.custo, nota:'', medida:''});
      }
    }

    /* ── 3. ROUTER (corte por m.l. do perfil + operador) ── */
    if(temRouter){
      var mlTotal=corteML+corteGab;
      var vendaML=num(perfil.routerML);
      var puCusto=vendaML/fator;
      L('eqp','router','Router — corte da peça', r2(corteML), 'm.l.', puCusto, null, 'R$ '+r2(vendaML)+'/m.l. na venda do perfil');
      if(corteGab>0) L('eqp','router_gab','Router — corte do gabarito', r2(corteGab), 'm.l.', puCusto, null, 'janelas + perímetro externo');
      var jobsRouter=1+(corteGab>0?1:0);
      var minOp=(P.opSetupMin*jobsRouter+P.opMinPorM*mlTotal);
      var horasOp=Math.max(P.opMinHoras, minOp/60);
      L('mo','mo_router','M.O. operador de router', r2(horasOp), 'h', P.horaOperador, null, Math.round(minOp)+' min calculados · mínimo '+P.opMinHoras+' h');
    }

    /* ── 4. FIXAÇÃO ── */
    if(constr!=='impressao3d'){
      var nFix=pecas*qtd*(constr==='chapada'?P.fixPorPecaChapada:P.fixPorPecaCaixa);
      L('mp','fixadores','Fixadores (pinos, espaçadores, fita VHB)', nFix, 'conj', P.fixConj, null, 'por peça');
      mpTotal+=nFix*P.fixConj;
    }

    /* ── 5. CONSUMÍVEIS (% da matéria-prima pela complexidade) ── */
    var cons=mpTotal*cx.pct/100;
    L('cons','consum','Consumíveis ('+cx.pct+'% da matéria-prima)', 1, 'vb', r2(cons), null, 'cola, lixa, silicone, EPI');

    /* ── 6. MÃO DE OBRA ── */
    var tMont=0;
    if(constr==='chapada') tMont=(P.montBaseMin+P.montPecaMin*pecas)*cx.f*qtd/60;
    else if(constr==='caixa') tMont=(P.montBaseMin+P.montMinPorM*perim)*cx.f*qtd/60;
    else tMont=(P.montBaseMin+P.montPecaMin*pecas)*cx.f*qtd/60;
    L('mo','mo_mont','M.O. montagem e acabamento', r2(tMont), 'h', P.horaMontador, null, constr==='caixa'?'min/m de contorno × complexidade':'base + min/peça × complexidade');
    if(constr==='chapada'&&(job.chapada||{}).acab==='vinil'){
      var m2a=bboxM2*qtd, hA=P.aplicBaseH+P.aplicHPorM2*m2a;
      L('mo','mo_aplic','M.O. aplicação do vinil', r2(hA), 'h', P.horaAplicador, null, P.aplicBaseH+' h + '+P.aplicHPorM2+' h/m²');
    }
    if(luz){
      var minE=P.eletSetupMin+P.eletPecaMin*pecas*qtd+P.eletMinPorM*ledM;
      var vE=Math.max(P.eletMin*cx.f, minE/60*P.horaEletricista);
      L('mo','mo_eletr','M.O. eletricista', r2(minE/60), 'h', P.horaEletricista, r2(vE), 'mínimo R$ '+r2(P.eletMin*cx.f)+' (50 × complexidade)');
    }

    /* ── 7. ARTE-FINAL, EMBALAGEM ── */
    var custoParcial=0; linhas.forEach(function(l){ custoParcial+=l.custo; });
    var arte=Math.max(P.arteMin, custoParcial/qtd*cx.pct/100);
    L('proj','arte','Arte-final e preparo de arquivo', 1, 'vb', r2(arte), null, 'maior entre R$ '+P.arteMin+' e '+cx.pct+'% do custo de 1 un');
    var emb=Math.max(P.embalMin*cx.f, P.embalM2*Math.max(bboxM2,0)*qtd*cx.f);
    L('log','embal','Embalagem', 1, 'vb', r2(emb), null, 'maior entre R$ '+r2(P.embalMin*cx.f)+' e R$ '+P.embalM2+'/m² × complexidade');

    /* ── 8. INSTALAÇÃO ── */
    var inst=job.instalacao||'cliente';
    if(inst==='sulsign'){
      var fAlt=num(job.alturaInst)||1;
      var vi=(P.instBase+P.instPeca*pecas*qtd)*fAlt*(luz?P.instLuz:1);
      L('inst','inst','Instalação Sul Sign (fator de altura '+fAlt+')', 1, 'vb', r2(vi), null, 'base + por peça × altura × iluminação');
    }

    /* ── 9. EXTRAS DO USUÁRIO ── */
    (job.extras||[]).forEach(function(x,i){ L(x.grupo||'out','extra'+i,x.desc||'Extra', 1, 'vb', num(x.valor), null, 'linha avulsa'); });

    /* ── totais ── */
    var custo=0; linhas.forEach(function(l){ custo+=l.custo; });
    custo=r2(custo);
    var venda=r2(custo*fator);
    var nfPct=job.nf?num(perfil.nfPct):0;
    var vendaNF=r2(venda*(1+nfPct/100));
    var out={job:job, perfil:perfil, fator:fator, cx:cx, qtd:qtd, geo:geo, linhas:linhas, custo:custo, venda:venda, nfPct:nfPct, vendaNF:vendaNF,
             unitario:r2(vendaNF/qtd), materiais:materiais, avisos:avisos.concat(geo.avisos||[]), params:P};
    out.grupos=agrupar(linhas);
    out.sintetico=sintetico(out);
    out.bdiOrc=bdiParaOrc(perfil, fator);
    return out;
  };
  function vinilNome(t){ return {fosco:'fosco',uv:'fosco + UV',lam:'fosco + laminação',recorte:'recorte'}[t]||t; }

  var GRUPOS=[['proj','Projeto / criação'],['mp','Materiais'],['gab','Gabarito de instalação'],['eqp','Equipamentos / corte'],['cons','Consumíveis'],['mo','Mão de obra'],['log','Logística'],['inst','Instalação'],['out','Outros']];
  LCX.GRUPOS=GRUPOS;
  function agrupar(linhas){
    return GRUPOS.map(function(g){
      var ls=linhas.filter(function(l){ return l.grupo===g[0]; }), s=0; ls.forEach(function(l){ s+=l.custo; });
      return {id:g[0], nome:g[1], linhas:ls, custo:r2(s)};
    }).filter(function(g){ return g.linhas.length; });
  }

  /* ───────────── Sintético: uma linha por peça do orçamento, com qtd e valor unitário ─────────────
     A venda de cada linha = custo do bloco × fator (+NF). Projeto, logística, consumíveis e MO entram na peça. */
  function sintetico(r){
    var fatorV=r.fator*(1+r.nfPct/100), q=r.qtd, j=r.job;
    var peca=0, gab=0, inst=0, extras=0, gabRouter=0, gabMo=0;
    r.linhas.forEach(function(l){
      if(l.grupo==='gab') gab+=l.custo;
      else if(l.chave==='router_gab') gabRouter+=l.custo;
      else if(l.grupo==='inst') inst+=l.custo;
      else if(l.grupo==='out') extras+=l.custo;
      else peca+=l.custo;
    });
    gab+=gabRouter;
    var nome=(j.nome||r.geo.nome||'Letreiro');
    var dim=Math.round(r.geo.bboxMm[0])+' × '+Math.round(r.geo.bboxMm[1])+' mm';
    var linhasS=[];
    linhasS.push({desc:nome+' — '+descCurta(r)+' ('+dim+')', qtd:q, un:'un', valorUn:r2(peca*fatorV/q), total:r2(peca*fatorV)});
    if(gab>0) linhasS.push({desc:'Gabarito de instalação (MDF 3 mm, janelas no contorno)', qtd:q, un:'un', valorUn:r2(gab*fatorV/q), total:r2(gab*fatorV)});
    if(inst>0) linhasS.push({desc:'Instalação', qtd:1, un:'vb', valorUn:r2(inst*fatorV), total:r2(inst*fatorV)});
    if(extras>0) linhasS.push({desc:'Outros', qtd:1, un:'vb', valorUn:r2(extras*fatorV), total:r2(extras*fatorV)});
    var tot=0; linhasS.forEach(function(l){ tot+=l.total; });
    return {linhas:linhasS, total:r2(tot)};
  }
  function descCurta(r){
    var j=r.job, c=j.constr||'chapada', mat;
    if(c==='chapada'){ var m=LCX.catalogo((j.chapada||{}).mat||'pvc15'); var ac=(j.chapada||{}).acab||'vinil';
      return (m?m.nome:'chapa')+(ac==='vinil'?', vinil adesivo na frente':(ac==='pintura'?', pintura PU':'')); }
    if(c==='caixa'){ var cj=j.caixa||{}, f=LCX.catalogo(cj.face||'acr3'), l=LCX.catalogo(cj.lateral||'pvc10');
      return 'letra caixa, face '+(f?f.nome:'')+', lateral '+(l?l.nome:'')+(cj.ilum&&cj.ilum!=='nenhuma'?', com LED ('+cj.ilum+')':''); }
    return 'letra caixa impressa em 3D'+(j.caixa&&j.caixa.ilum&&j.caixa.ilum!=='nenhuma'?', com LED':'');
  }

  /* BDI no formato do ORC Manager / calcOrcamento: (1+ac+df+ri)/(1−lc−im) reproduz o fator do perfil.
     Para AC sobre a venda, o campo AC recebe o equivalente sobre o custo (como a Matriz grava). */
  function bdiParaOrc(p, fator){
    var lc=num(p.lucro), im=num(p.imp), df=num(p.df), ri=num(p.ri);
    var acEq=(fator*(1-(lc+im)/100)-1-df/100-ri/100)*100;
    return {ac:String(Math.round(acEq*100)/100), df:String(df), ri:String(ri), lc:String(lc), im:String(im), ir:'0', 'desc-pct':'0', 'op-pct':'0'};
  }

  /* ───────────── Levantamento de materiais (lista de compras e corte) ───────────── */
  LCX.levantamento=function(r){
    var lst=r.materiais.map(function(m){
      var qtdTxt='', un='';
      if(m.chapa){ if(m.modo==='inteira'||m.chapas!=null&&m.modo!=='consumo'){ qtdTxt=String(m.chapas!=null?m.chapas:Math.ceil(m.m2Cobrado/(m.chapa[0]*m.chapa[1]/1e6))); un='chapa '+m.chapa[0]+'×'+m.chapa[1]; }
        else { qtdTxt=String(r2(m.m2Cobrado)); un='m² (de chapa '+m.chapa[0]+'×'+m.chapa[1]+')'; } }
      else if(m.fam==='Elétrica'){ qtdTxt=m.medida; un=''; }
      else if(m.fam==='3D'){ qtdTxt=m.medida; un=''; }
      else { qtdTxt=String(r2(m.m2Cobrado)); un='m²'; }
      return {material:m.material, uso:m.uso, qtd:qtdTxt, un:un, medida:m.medida, aproveitamento:(m.chapa&&m.m2Cobrado>0)?Math.round(m.liqM2/Math.max(m.m2Cobrado,1e-9)*100):null, custo:m.custo, nota:m.nota};
    });
    var itens=[];
    r.linhas.forEach(function(l){
      if(l.chave==='router'||l.chave==='router_gab') itens.push({item:l.desc, qtd:l.qtd, un:l.un});
      if(l.chave==='fonte'||l.chave==='fiacao'||l.chave==='fixadores') itens.push({item:l.desc, qtd:l.qtd, un:l.un});
    });
    var horas=[];
    r.linhas.forEach(function(l){ if(l.grupo==='mo') horas.push({item:l.desc.replace('M.O. ',''), horas:l.qtd, valorHora:l.pu}); });
    return {materiais:lst, componentes:itens, horas:horas};
  };

  /* ───────────── Memorial descritivo (texto editável) ───────────── */
  LCX.descritivo=function(r){
    var j=r.job, g=r.geo, c=j.constr||'chapada', P=r.params, t=[];
    var nome=j.nome||g.nome||'peça';
    var dim=Math.round(g.bboxMm[0])+' × '+Math.round(g.bboxMm[1])+' mm';
    var cj=j.caixa||{};
    t.push('OBJETO');
    if(c==='chapada'){
      var m=LCX.catalogo((j.chapada||{}).mat||'pvc15');
      t.push('Fornecimento de '+r.qtd+' ('+r.qtd+') '+nome+' — logotipo em corte vazado '+(g.pecas>1?'composto por '+g.pecas+' peças independentes':'em peça única')+(g.vazados?', com '+g.vazados+' vazado(s) interno(s)':'')+', medindo '+dim+' no conjunto, cortado em router CNC em '+(m?m.nome.toLowerCase():'chapa')+'.');
      var ac=(j.chapada||{}).acab||'vinil';
      if(ac==='vinil') t.push('Acabamento: adesivo de vinil impresso ('+vinilNome((j.chapada||{}).vinil||'lam')+') aplicado na face frontal antes do corte, com sangria de '+P.vinilSangria+' mm, refilado rente ao contorno.');
      if(ac==='pintura') t.push('Acabamento: pintura PU na face e nos cantos, nas cores do projeto.');
    } else if(c==='caixa'){
      var f=LCX.catalogo(cj.face||'acr3'), l=LCX.catalogo(cj.lateral||'pvc10'), fu=cj.fundo==null?'pvc5':cj.fundo, fm=fu!=='sem'?LCX.catalogo(fu):null;
      t.push('Fornecimento de '+r.qtd+' ('+r.qtd+') '+nome+' em letra caixa, '+g.pecas+' peça(s), medindo '+dim+', profundidade de '+(num(cj.prof)||5)+' cm. Face em '+(f?f.nome.toLowerCase():'')+', lateral em '+(l?l.nome.toLowerCase():'')+(fm?', fundo em '+fm.nome.toLowerCase():'')+', cortadas em router CNC e montadas em oficina.');
      if(cj.pintura) t.push('Acabamento: pintura PU na face e na lateral, nas cores do projeto.');
      if(cj.ilum&&cj.ilum!=='nenhuma'){ var tp=P.led[cj.led||'fita']||P.led.fita; t.push('Iluminação: '+tp.nome+' ('+({halo:'bafo de luz (halo)',frontlit:'frontal',backlight:'backlight',dupla:'frontal e bafo de luz'}[cj.ilum])+'), com fonte chaveada dimensionada com folga de '+Math.round((P.fonteFolga-1)*100)+'%, fiação e conectores. Tensão e ponto de força por conta do local.'); }
    } else {
      t.push('Fornecimento de '+r.qtd+' ('+r.qtd+') '+nome+' em letra caixa impressa em 3D ('+String((j.i3d||{}).fil||'petg').toUpperCase()+'), '+g.pecas+' peça(s), medindo '+dim+'.');
      if(cj.ilum&&cj.ilum!=='nenhuma') t.push('Iluminação em LED com fonte chaveada, fiação e conectores.');
    }
    if((j.gabarito||{}).on) t.push('Acompanha gabarito de instalação '+((j.gabarito.modo||'mdf3')==='mdf3'?'em MDF 3 mm, com janelas no contorno de cada peça e margem de '+P.gabMargem/10+' cm,':'impresso em escala 1:1 com marcas de furo,')+' que posiciona todas as peças com o espaçamento do projeto e dispensa medição na parede.');
    t.push('');
    t.push('FIXAÇÃO E INSTALAÇÃO');
    if((j.instalacao||'cliente')==='sulsign') t.push('Instalação pela Sul Sign no local, com o gabarito, na altura de referência de '+(num(j.alturaInst)||1)+' (fator de altura).');
    else if(j.instalacao==='pdvex') t.push('Instalação por conta da PDVEX, com apoio do gabarito.');
    else t.push('Instalação por conta do cliente; as peças seguem com fixadores e orientação de montagem pelo gabarito.');
    t.push('');
    t.push('CONDIÇÕES');
    t.push(r.nfPct>0?'Valores com nota fiscal (+'+r.nfPct+'%).':'Valores sem nota fiscal.');
    t.push('Arquivos de arte conforme enviados pelo cliente; alterações de escopo, medidas ou materiais após a aprovação podem alterar valor e prazo.');
    return t.join('\n');
  };

  /* ───────────── texto de resumo e utilitários de apresentação ───────────── */
  LCX.nomeVinil=vinilNome;

  /* número do orçamento: SS-AAAA_MM-## (próximo livre dado o conjunto de números existentes) */
  LCX.proximoNumero=function(existentes, data){
    var d=data||new Date(), pre='SS-'+d.getFullYear()+'_'+('0'+(d.getMonth()+1)).slice(-2)+'-', max=0;
    (existentes||[]).forEach(function(n){ var s=String(n||''); if(s.indexOf(pre)===0){ var k=parseInt(s.slice(pre.length),10); if(k>max) max=k; } });
    return pre+('0'+(max+1)).slice(-2);
  };

  root.LCX=LCX;
  if(typeof module!=='undefined'&&module.exports) module.exports=LCX;
})(typeof window!=='undefined'?window:this);
