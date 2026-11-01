/* Exporta o cálculo da Letra Caixa como orçamento ORC completo (HTML) — usa o template embutido em window.LCX_ORC_HEAD_GZ */
(function(){
  function nf(v,d){ var s=(Math.round((+v||0)*Math.pow(10,d))/Math.pow(10,d)).toFixed(d); return s.replace('.',','); }
  function slug(s){ var t=String(s||'orcamento'); if(t.normalize) t=t.normalize('NFD').replace(/[̀-ͯ]/g,''); t=t.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,''); return t||'orcamento'; }
  function gunzipB64(b64){
    var bin=atob(b64), u=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
    var ds=new DecompressionStream('gzip'); var w=ds.writable.getWriter(); w.write(u); w.close();
    return new Response(ds.readable).text();
  }
  function svgPng(svg,w,h){
    return new Promise(function(res){
      var img=new Image(); img.onload=function(){ var c=document.createElement('canvas'); c.width=w; c.height=h; var x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,w,h); x.drawImage(img,0,0,w,h); res(c.toDataURL('image/png')); };
      img.onerror=function(){ res(''); }; img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
    });
  }
  function artes(st,r){
    if(!st.doc||!st.doc.contornos) return Promise.resolve({});
    var camadas=st.camadas||{}, cts=st.doc.contornos.filter(function(c){ return !c.off&&(camadas[c.L]==null||camadas[c.L]==='peca'||camadas[c.L]==='contorno'||camadas[c.L]===undefined); });
    if(!cts.length) cts=st.doc.contornos.filter(function(c){ return !c.off; });
    if(!cts.length||cts.length>3000) return Promise.resolve({});
    var bb=[1e9,1e9,-1e9,-1e9]; cts.forEach(function(c){ bb[0]=Math.min(bb[0],c.bb[0]); bb[1]=Math.min(bb[1],c.bb[1]); bb[2]=Math.max(bb[2],c.bb[2]); bb[3]=Math.max(bb[3],c.bb[3]); });
    var w=bb[2]-bb[0], h=bb[3]-bb[1];
    function path(ox,oy){ var d=''; cts.forEach(function(c){ var p=c.p, s='M'; for(var i=0;i<p.length;i+=2){ s+=(i?'L':'')+(p[i]-bb[0]+ox).toFixed(2)+' '+(bb[3]-p[i+1]+oy).toFixed(2); } d+=s+(c.c?'Z':''); }); return d; }
    var F='font-family="Arial,sans-serif"', pad=45;
    function cotas(x0,y0,W,H){ return '<g stroke="#555" stroke-width=".8" fill="none"><path d="M'+x0+' '+(y0+H+16)+'H'+(x0+W)+'M'+x0+' '+(y0+H+11)+'V'+(y0+H+21)+'M'+(x0+W)+' '+(y0+H+11)+'V'+(y0+H+21)+'"/><path d="M'+(x0-16)+' '+y0+'V'+(y0+H)+'M'+(x0-21)+' '+y0+'H'+(x0-11)+'M'+(x0-21)+' '+(y0+H)+'H'+(x0-11)+'"/></g>'
      +'<text x="'+(x0+W/2)+'" y="'+(y0+H+34)+'" text-anchor="middle" font-size="13" fill="#333" '+F+'>'+Math.round(W)+' mm</text><text transform="translate('+(x0-24)+' '+(y0+H/2)+') rotate(-90)" text-anchor="middle" font-size="13" fill="#333" '+F+'>'+Math.round(H)+' mm</text>'; }
    var W1=w+2*pad, H1=h+2*pad+20;
    var s1='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W1+' '+H1+'" width="'+Math.round(W1*2)+'" height="'+Math.round(H1*2)+'"><rect width="100%" height="100%" fill="#fff"/><path d="'+path(pad,pad)+'" fill="#ffd9c7" fill-rule="evenodd" stroke="#c2410c" stroke-width="1.2"/>'+cotas(pad,pad,w,h)+'</svg>';
    var m=60, GW=w+2*m, GH=h+2*m, W2=GW+2*pad, H2=GH+2*pad+20;
    var s2='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W2+' '+H2+'" width="'+Math.round(W2*1.6)+'" height="'+Math.round(H2*1.6)+'"><rect width="100%" height="100%" fill="#fff"/><path fill-rule="evenodd" fill="#d9b88a" stroke="#7a5a2b" stroke-width="1.2" d="M'+pad+' '+pad+'h'+GW+'v'+GH+'h'+(-GW)+'Z '+path(pad+m,pad+m)+'"/>'+cotas(pad,pad,GW,GH)+'</svg>';
    return Promise.all([svgPng(s1,Math.round(W1*2),Math.round(H1*2)),svgPng(s2,Math.round(W2*1.6),Math.round(H2*1.6))]).then(function(a){ return {peca:a[0],gab:a[1],gw:GW,gh:GH}; });
  }
  function ln(l){ var ex=Math.abs(l.qtd*l.pu-l.custo)<0.006; return [l.desc, ex?Math.round(l.qtd*100)/100:1, ex?Math.round(l.pu*10000)/10000:l.custo, ex?l.un:'vb']; }
  function js(o){ return JSON.stringify(o).replace(/<\//g,'<\\/'); }

  window.LCX_EXPORT_ORC=function(r,st){
    if(!r){ alert('Calcule primeiro.'); return; }
    var j=st.job, bts=document.querySelectorAll('[data-a="orcfile"]'); var lbl0=bts[0]?bts[0].textContent:''; for(var q=0;q<bts.length;q++){ bts[q].disabled=true; bts[q].textContent='Gerando…'; }
    Promise.all([gunzipB64(window.LCX_ORC_HEAD_GZ), artes(st,r)]).then(function(res){
      var head=res[0], img=res[1], S=r.sintetico.linhas;
      var gPeca=[], gGab=[], gInst=[];
      r.linhas.forEach(function(l){ if(l.grupo==='gab'||l.chave==='router_gab') gGab.push(ln(l)); else if(l.grupo==='inst') gInst.push(ln(l)); else gPeca.push(ln(l)); });
      var dim=Math.round(r.geo.bboxMm[0])+' × '+Math.round(r.geo.bboxMm[1])+' mm', G=[];
      if(gPeca.length) G.push({n:(j.nome||r.geo.nome||'Peça'),dim:dim,st:S[0]?S[0].desc:'',sq:r.qtd||1,s:['CV'],rows:gPeca,img:'peca'});
      if(gGab.length) G.push({n:'Gabarito de instalação',dim:img.gw?Math.round(img.gw)+' × '+Math.round(img.gh)+' mm':'',st:'Gabarito de instalação',sq:r.qtd||1,s:['CV'],rows:gGab,img:'gab'});
      if(gInst.length) G.push({n:'Instalação',dim:'',st:'Instalação',sq:1,s:['APLIC'],rows:gInst});
      var INC=['Fornecimento conforme escopo: '+(S[0]?S[0].desc:'peça')];
      if(gGab.length) INC.push('Gabarito de instalação com janelas no contorno de cada peça');
      INC.push('Fixadores e orientação de montagem','Arte-final e preparo dos arquivos','Embalagem para transporte');
      if(j.instalacao==='sulsign') INC.push('Instalação pela Sul Sign');
      var NINC=[]; if(j.instalacao!=='sulsign') NINC.push('Instalação no local (por conta do '+(j.instalacao==='pdvex'?'PDVEX':'cliente')+')');
      NINC.push('Instalação elétrica adicional','Andaimes ou equipamento de acesso em altura','Alterações de escopo, medidas ou materiais após a aprovação');
      var nfp=r.perfil&&r.perfil.nfPct||0;
      var COND={'Prazo de execução':'A combinar','Validade da proposta':'15 dias corridos','Forma de pagamento':'A combinar','Nota Fiscal':nfp>0?'Valor com nota fiscal ('+nfp+'% incluídos). Sem NF: R$ '+nf(r.venda,2):'Sem nota fiscal','Logística':j.instalacao==='sulsign'?'Instalação inclusa':'Retirada ou entrega a combinar; instalação por conta do '+(j.instalacao==='pdvex'?'PDVEX':'cliente')};
      var d=new Date(), ymd=d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
      var desc=(j.descEdit!=null?j.descEdit:LCX.descritivo(r)).replace(/\n\n/g,'\n'); if(nfp>0) desc=desc.replace('Valores sem nota fiscal.','Valores com nota fiscal ('+nfp+'% incluídos); sem nota fiscal, R$ '+nf(r.venda,2)+'.');
      var b=r.bdiOrc;
      var seed='<script>\n(function(){\n  var G='+js(G)+';\n  var INC='+js(INC)+', NINC='+js(NINC)+', COND='+js(COND)+';\n  var IMG={peca:'+js(img.peca||'')+',gab:'+js(img.gab||'')+'};\n'
      +'  function setv(id,v){var e=document.getElementById(id);if(e)e.value=v;}\n'
      +'  setv("ac",'+js(b.ac)+');setv("df",'+js(b.df)+');setv("ri",'+js(b.ri)+');setv("lc",'+js(b.lc)+');setv("im",'+js(b.im)+');setv("bv",0);setv("ir",'+nfp+');setv("desc-pct",0);setv("op-pct",0);\n'
      +'  var hv=document.querySelectorAll(".hd-info-val[contenteditable]");\n'
      +'  hv[0].textContent='+js(j.cliente||'')+';hv[3].textContent='+js(j.projeto||j.nome||'')+';hv[4].textContent='+js(st.nomeArq||'')+';\n'
      +'  var num=document.querySelector(".doc-num-el");if(num)num.textContent='+js('SS-'+d.getFullYear()+'_'+('0'+(d.getMonth()+1)).slice(-2)+'-__ · '+String(j.nome||r.geo.nome||'').toUpperCase()+' (nº provisório)')+';\n'
      +'  var dt=document.getElementById("dt-input");if(dt){dt.value='+js(ymd)+';try{sincronizarData();}catch(x){}}\n'
      +'  var e=document.getElementById("escopo-text");if(e)e.textContent='+js(desc)+';\n'
      +'  var tb=[];G.forEach(function(g){var t=makeTable(g.n,g.rows,g.dim,null,null,g.st,g.sq);tb.push(t);(g.s||[]).forEach(function(s){var c=t.setorChks&&t.setorChks[s];if(c){c.checked=true;var lb=c.closest(".setor-chk-lbl");if(lb)lb.classList.add("checked");}});if(g.img&&IMG[g.img]){try{estrImagens[t.id]=IMG[g.img];}catch(x){}}try{estrDescricoes[t.id]=g.st;}catch(x){}});\n'
      +'  function lista(id,itens){var ul=document.getElementById(id);if(!ul)return;ul.innerHTML="";itens.forEach(function(tx){var li=document.createElement("li");var sp=document.createElement("span");sp.contentEditable="true";sp.textContent=tx;var del=document.createElement("span");del.textContent=" ×";del.style.cssText="cursor:pointer;color:var(--g400);margin-left:auto;font-size:13px;";del.onclick=function(){ul.removeChild(li);};li.appendChild(sp);li.appendChild(del);ul.appendChild(li);});}\n'
      +'  lista("inc-sim",INC);lista("inc-nao",NINC);\n'
      +'  document.querySelectorAll(".cond-grid .ci").forEach(function(ci){var l=ci.querySelector(".cl"),v=ci.querySelector(".cv");if(l&&v&&COND[l.textContent.trim()])v.textContent=COND[l.textContent.trim()];});\n'
      +'  try{sincronizarEscopo();}catch(x){}calcAll();try{showEditor();}catch(x){}\n'
      +'  var btn=document.querySelector(\'.mbtn[onclick*="sintetico"]\');try{setModo("sintetico",{target:btn});}catch(x){}\n})();\n<\/script>\n</body></html>\n';
      var html=head.replace(/<title>[^<]*<\/title>/,'<title>ORC '+String(j.nome||r.geo.nome||'').replace(/[<>&]/g,'')+' — Sul Sign</title>')+seed;
      var bl=new Blob([html],{type:'text/html;charset=utf-8'}), a=document.createElement('a'); a.href=URL.createObjectURL(bl); a.download='ORC_'+slug(j.nome||r.geo.nome)+'.html'; document.body.appendChild(a); a.click();
    }).catch(function(e){ alert('Não consegui gerar o ORC: '+e.message); }).then(function(){ for(var q=0;q<bts.length;q++){ bts[q].disabled=false; bts[q].textContent=lbl0; } });
  };
})();
