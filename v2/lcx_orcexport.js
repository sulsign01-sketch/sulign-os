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
    if(!st.doc||!st.doc.contornos) return Promise.resolve(st.printImg?{peca:st.printImg}:{});
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
    return Promise.all([svgPng(s1,Math.round(W1*2),Math.round(H1*2)),svgPng(s2,Math.round(W2*1.6),Math.round(H2*1.6))]).then(function(a){
      var out={peca:a[0],gab:a[1],gw:GW,gh:GH};
      if(!st.printImg) return out;
      return new Promise(function(res){ var A=new Image(), B=new Image(), n=0; function go(){ if(++n<2) return; var W=1400, hA=Math.round(A.height*W/A.width), hB=Math.round(B.height*W/B.width), c=document.createElement('canvas'); c.width=W; c.height=hA+hB+12; var x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height); x.drawImage(A,0,0,W,hA); x.drawImage(B,0,hA+12,W,hB); out.peca=c.toDataURL('image/png'); res(out); } A.onload=go; B.onload=go; A.onerror=function(){ res(out); }; B.onerror=function(){ res(out); }; A.src=st.printImg; B.src=a[0]; });
    });
  }
  function ln(l){ var ex=Math.abs(l.qtd*l.pu-l.custo)<0.006; return [l.desc, ex?Math.round(l.qtd*100)/100:1, ex?Math.round(l.pu*10000)/10000:l.custo, ex?l.un:'vb']; }
  function js(o){ return JSON.stringify(o).replace(/<\//g,'<\\/'); }

  window.LCX_EXPORT_ORC=function(r0,st){
    var c=st.comb||r0; if(!c){ alert('Calcule primeiro.'); return; }
    var itens=(st.itens&&st.itens.length)?st.itens.filter(function(it){ return it.r; }):[{job:st.job,r:r0,doc:st.doc,camadas:st.camadas,printImg:st.printImg,nomeArq:st.nomeArq}];
    var j=st.job, bts=document.querySelectorAll('[data-a="orcfile"]'); var lbl0=bts[0]?bts[0].textContent:''; for(var q=0;q<bts.length;q++){ bts[q].disabled=true; bts[q].textContent='Gerando…'; }
    Promise.all([gunzipB64(window.LCX_ORC_HEAD_GZ), Promise.all(itens.map(function(it){ return artes({doc:it.doc,camadas:it.camadas||{},printImg:it.printImg},it.r); }))]).then(function(res){
      var head=res[0], imgs=res[1], G=[], IMGS=[], INC=[], NINC=[], temInstCli=false, nfp=c.perfil&&c.perfil.nfPct||0, nomes=[];
      itens.forEach(function(it,k){
        var r=it.r, ij=it.job, S=r.sintetico.linhas, img=imgs[k]||{}, nome=ij.nome||r.geo.nome||('Item '+(k+1)); nomes.push(nome);
        var gPeca=[], gGab=[], gInst=[];
        r.linhas.forEach(function(l){ if(l.grupo==='gab'||l.chave==='router_gab') gGab.push(ln(l)); else if(l.grupo==='inst') gInst.push(ln(l)); else gPeca.push(ln(l)); });
        var dim=(r.geo.bboxMm[0]>0)?Math.round(r.geo.bboxMm[0])+' × '+Math.round(r.geo.bboxMm[1])+' mm':'';
        var sPeca=S[0]?S[0].desc:nome, sq=S[0]?S[0].qtd:(r.qtd||1);
        if(gPeca.length){ G.push({n:nome,dim:dim,st:sPeca,sq:sq,op:!!ij.opcional,s:[ij.tipo==='painel'?'MARC':'CV'],rows:gPeca,img:(img.peca?IMGS.length:-1)}); IMGS.push(img.peca||''); }
        if(gGab.length){ G.push({n:'Gabarito de instalação — '+nome,dim:img.gw?Math.round(img.gw)+' × '+Math.round(img.gh)+' mm':'',st:'Gabarito de instalação — '+nome,sq:r.qtd||1,s:['CV'],rows:gGab,img:(img.gab?IMGS.length:-1)}); IMGS.push(img.gab||''); }
        if(gInst.length){ G.push({n:'Instalação — '+nome,dim:'',st:'Instalação — '+nome,sq:1,s:['APLIC'],rows:gInst,img:-1}); }
        INC.push(sPeca); if(gGab.length) INC.push('Gabarito de instalação — '+nome);
        if((ij.instalacao||'cliente')!=='sulsign'&&(ij.tipo||'desenho')==='desenho') temInstCli=true;
      });
      INC.push('Fixadores, arte-final e embalagem conforme cada item');
      if(temInstCli) NINC.push('Instalação no local dos itens de desenho (por conta do cliente)');
      NINC.push('Instalação elétrica adicional','Andaimes ou equipamento de acesso em altura','Alterações de escopo, medidas ou materiais após a aprovação');
      var COND={'Prazo de execução':'A combinar','Validade da proposta':'15 dias corridos','Forma de pagamento':'A combinar','Nota Fiscal':nfp>0?'Valor com nota fiscal ('+nfp+'% incluídos). Sem NF: R$ '+nf(c.venda,2):'Sem nota fiscal','Logística':'A combinar'};
      var d=new Date(), ymd=d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
      var desc=String(c.descTexto||'').replace(/\n\n/g,'\n'); if(nfp>0) desc=desc.replace('Valores com nota fiscal (+'+nfp+'%).','Valores com nota fiscal ('+nfp+'% incluídos); sem nota fiscal, R$ '+nf(c.venda,2)+'.');
      var b=c.bdiOrc, titulo=(itens.length>1?(j.projeto||j.cliente||'Orçamento'):(itens[0].job.nome||'Orçamento'));
      var seed='<script>\n(function(){\n  var G='+js(G)+';\n  var INC='+js(INC)+', NINC='+js(NINC)+', COND='+js(COND)+';\n  var IMGS='+js(IMGS)+';\n'
      +'  function setv(id,v){var e=document.getElementById(id);if(e)e.value=v;}\n'
      +'  setv("ac",'+js(b.ac)+');setv("df",'+js(b.df)+');setv("ri",'+js(b.ri)+');setv("lc",'+js(b.lc)+');setv("im",'+js(b.im)+');setv("bv",0);setv("ir",'+nfp+');setv("desc-pct",0);setv("op-pct",0);\n'
      +'  var hv=document.querySelectorAll(".hd-info-val[contenteditable]");\n'
      +'  hv[0].textContent='+js(j.cliente||'')+';hv[3].textContent='+js(j.projeto||titulo)+';hv[4].textContent='+js(itens.length>1?itens.length+' itens':(itens[0].nomeArq||''))+';\n'
      +'  var num=document.querySelector(".doc-num-el");if(num)num.textContent='+js('SS-'+d.getFullYear()+'_'+('0'+(d.getMonth()+1)).slice(-2)+'-__ · '+String(titulo).toUpperCase()+' (nº provisório)')+';\n'
      +'  var dt=document.getElementById("dt-input");if(dt){dt.value='+js(ymd)+';try{sincronizarData();}catch(x){}}\n'
      +'  var e=document.getElementById("escopo-text");if(e)e.textContent='+js(desc)+';\n'
      +'  var tb=[];G.forEach(function(g){var t=makeTable(g.n,g.rows,g.dim,null,null,g.st,g.sq);tb.push(t);(g.s||[]).forEach(function(s){var c=t.setorChks&&t.setorChks[s];if(c){c.checked=true;var lb=c.closest(".setor-chk-lbl");if(lb)lb.classList.add("checked");}});if(g.img>=0&&IMGS[g.img]){try{estrImagens[t.id]=IMGS[g.img];}catch(x){}}try{estrDescricoes[t.id]=g.st;}catch(x){}if(g.op){var w=t.nameEl&&t.nameEl.closest(".tbl-wrap");var oc=w&&w.querySelector(".opt-chk");if(oc){oc.checked=true;if(oc.onchange)oc.onchange.call(oc);}}});\n'
      +'  function lista(id,itens){var ul=document.getElementById(id);if(!ul)return;ul.innerHTML="";itens.forEach(function(tx){var li=document.createElement("li");var sp=document.createElement("span");sp.contentEditable="true";sp.textContent=tx;var del=document.createElement("span");del.textContent=" ×";del.style.cssText="cursor:pointer;color:var(--g400);margin-left:auto;font-size:13px;";del.onclick=function(){ul.removeChild(li);};li.appendChild(sp);li.appendChild(del);ul.appendChild(li);});}\n'
      +'  lista("inc-sim",INC);lista("inc-nao",NINC);\n'
      +'  document.querySelectorAll(".cond-grid .ci").forEach(function(ci){var l=ci.querySelector(".cl"),v=ci.querySelector(".cv");if(l&&v&&COND[l.textContent.trim()])v.textContent=COND[l.textContent.trim()];});\n'
      +'  try{sincronizarEscopo();}catch(x){}calcAll();try{showEditor();}catch(x){}\n'
      +'  var btn=document.querySelector(\'.mbtn[onclick*="sintetico"]\');try{setModo("sintetico",{target:btn});}catch(x){}\n})();\n<\/script>\n</body></html>\n';
      var html=head.replace(/<title>[^<]*<\/title>/,'<title>ORC '+String(titulo).replace(/[<>&]/g,'')+' — Sul Sign</title>')+seed;
      var bl=new Blob([html],{type:'text/html;charset=utf-8'}), a=document.createElement('a'); a.href=URL.createObjectURL(bl); a.download='ORC_'+slug(titulo)+'.html'; document.body.appendChild(a); a.click();
    }).catch(function(e){ alert('Não consegui gerar o ORC: '+e.message); }).then(function(){ for(var q=0;q<bts.length;q++){ bts[q].disabled=false; bts[q].textContent=lbl0; } });
  };
})();
