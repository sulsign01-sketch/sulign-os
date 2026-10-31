/* ═══════════════════════════════════════════════════════════════
   SULSIGN OS 2.0 — TEMPO DE ROUTER · MOTOR (rtr_core.js)
   Lê vetores de corte e estima m.l. e tempo de router.
   Formatos: .crv3d/.crv (Aspire/VCarve 9.x), .eps/.ps/.ai (PostScript),
   .dxf, .svg, .pdf/.ai (PDF, via pdf.js carregado pelo módulo) e
   G-code (.tap/.nc/.gcode/.cnc/.ngc).
   Tudo em milímetros. Sem DOM, exceto parseSVG (DOMParser).
   iOS Safari: ES5 — var, sem arrow, sem template literal, sem let/const.

   crv3d (Aspire 9.514): arquivo OLE/CFB. O stream VectorData/2dDataV2
   é serialização MFC. Cada contorno = [n spans:u32] + n spans:
     [X:u8][2:u32][T:u32][P0 xyz][P1 xyz][1:u32] + extra
     T=1 linha (X=0) · T=0 arco, extra = bulge f64 (X=1, + = anti-horário)
     T=6 Bézier, extra = C1 xy + C2 xy (X=2)
   Vetor de verdade = contorno seguido do GUID do próprio objeto; os
   contornos de texto (letras do txtBlock) não são — ficam de fora.
   Validado em 9 arquivos reais do Aspire 9.514 (out/2026).
   ═══════════════════════════════════════════════════════════════ */
(function(root){
  var RTR={versao:'1.0'};
  var TOL=0.01;               /* desvio máximo da corda ao achatar curvas (mm) */
  var MM_PT=25.4/72;
  var PREVIEW_GUID='43726685021385' ; /* camada "Previsão de percursos"/"Toolpath Previews" (prefixo do GUID) */

  /* ───────────── utilidades ───────────── */
  function toU8(x){
    if(x instanceof Uint8Array) return x;
    if(x instanceof ArrayBuffer) return new Uint8Array(x);
    if(x && x.buffer instanceof ArrayBuffer) return new Uint8Array(x.buffer, x.byteOffset||0, x.byteLength||x.length);
    return new Uint8Array(x||[]);
  }
  function latin1(u8){
    var s='', CH=0x8000;
    for(var i=0;i<u8.length;i+=CH){ s+=String.fromCharCode.apply(null, u8.subarray(i, Math.min(i+CH,u8.length))); }
    return s;
  }
  function decode(u8, enc){
    try{ if(typeof TextDecoder!=='undefined') return new TextDecoder(enc||'utf-8').decode(u8); }catch(e){}
    return latin1(u8);
  }
  function u16str(d, o, n){
    var s=''; for(var i=0;i<n;i++){ s+=String.fromCharCode(d[o+2*i]|(d[o+2*i+1]<<8)); } return s;
  }
  function hexAt(d,o,n){ var s=''; for(var i=0;i<n;i++){ var h=d[o+i].toString(16); s+=(h.length<2?'0':'')+h; } return s; }
  function num(x){ var v=parseFloat(String(x==null?'':x).replace(',','.')); return isFinite(v)?v:0; }
  function clamp(v,a,b){ return v<a?a:(v>b?b:v); }

  /* afim [a,b,c,d,e,f]: x'=a x + c y + e ; y'=b x + d y + f */
  var I6=[1,0,0,1,0,0];
  function mul(A,B){ /* A∘B (aplica B primeiro) */
    return [A[0]*B[0]+A[2]*B[1], A[1]*B[0]+A[3]*B[1], A[0]*B[2]+A[2]*B[3], A[1]*B[2]+A[3]*B[3],
            A[0]*B[4]+A[2]*B[5]+A[4], A[1]*B[4]+A[3]*B[5]+A[5]];
  }
  function xfPts(p, M){
    if(M[0]===1&&M[1]===0&&M[2]===0&&M[3]===1&&M[4]===0&&M[5]===0) return p;
    for(var i=0;i<p.length;i+=2){ var x=p[i], y=p[i+1]; p[i]=M[0]*x+M[2]*y+M[4]; p[i+1]=M[1]*x+M[3]*y+M[5]; }
    return p;
  }

  /* ───────────── achatamento de curvas (pontos empurrados em out, sem o inicial) ───────────── */
  function nArc(r, da){
    var st=2*Math.acos(clamp(1-TOL/Math.max(r,TOL),-1,1));
    if(!(st>0)) st=0.2;
    return clamp(Math.ceil(Math.abs(da)/st),1,1440);
  }
  function arcPts(cx,cy,r,a0,da,out){
    var n=nArc(r,da);
    for(var i=1;i<=n;i++){ var a=a0+da*i/n; out.push(cx+r*Math.cos(a), cy+r*Math.sin(a)); }
  }
  function bulgePts(x0,y0,x1,y1,b,out){
    var dx=x1-x0, dy=y1-y0, c=Math.sqrt(dx*dx+dy*dy);
    if(Math.abs(b)<1e-9||c<1e-12){ out.push(x1,y1); return; }
    var th=4*Math.atan(b), at=Math.abs(th);
    var r=c/(2*Math.sin(at/2));
    var s=th>0?1:-1, h=r*Math.cos(at/2);
    var cx=(x0+x1)/2+s*(-dy/c)*h, cy=(y0+y1)/2+s*(dx/c)*h;
    arcPts(cx,cy,r,Math.atan2(y0-cy,x0-cx),th,out);
  }
  function bezPts(x0,y0,x1,y1,x2,y2,x3,y3,out){
    var ax=x0-2*x1+x2, ay=y0-2*y1+y2, bx=x1-2*x2+x3, by=y1-2*y2+y3;
    var M=Math.sqrt(Math.max(ax*ax+ay*ay,bx*bx+by*by));
    var n=clamp(Math.ceil(Math.sqrt(0.75*M/TOL)),1,256);
    for(var i=1;i<=n;i++){
      var t=i/n,u=1-t,a=u*u*u,b=3*u*u*t,c2=3*u*t*t,d=t*t*t;
      out.push(a*x0+b*x1+c2*x2+d*x3, a*y0+b*y1+c2*y2+d*y3);
    }
  }
  function quadPts(x0,y0,x1,y1,x2,y2,out){
    bezPts(x0,y0, x0+2/3*(x1-x0),y0+2/3*(y1-y0), x2+2/3*(x1-x2),y2+2/3*(y1-y2), x2,y2,out);
  }
  /* elipse: centro, semi-eixos rx/ry, rotação phi, ângulo inicial e varredura (rad) */
  function ellPts(cx,cy,rx,ry,phi,t0,dt,out){
    var n=nArc(Math.max(rx,ry),dt), cp=Math.cos(phi), sp=Math.sin(phi);
    for(var i=1;i<=n;i++){ var t=t0+dt*i/n, ex=rx*Math.cos(t), ey=ry*Math.sin(t); out.push(cx+ex*cp-ey*sp, cy+ex*sp+ey*cp); }
  }

  /* ───────────── contornos ───────────── */
  function C(layer){ return {L:layer||'0', p:[], c:false}; }
  function finishC(ct){
    var p=ct.p, n=p.length, len=0, a=0, x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    /* remove pontos repetidos consecutivos */
    var q=[]; for(var i=0;i<n;i+=2){ var x=p[i],y=p[i+1]; if(!isFinite(x)||!isFinite(y)) continue;
      var m=q.length; if(m&&Math.abs(q[m-2]-x)<1e-9&&Math.abs(q[m-1]-y)<1e-9) continue; q.push(x,y); }
    p=ct.p=q; n=p.length;
    if(n<4){ ct.len=0; ct.a=0; ct.bb=n?[p[0],p[1],p[0],p[1]]:[0,0,0,0]; return ct; }
    var fx=p[0], fy=p[1], lx=p[n-2], ly=p[n-1];
    if(!ct.c && Math.abs(fx-lx)<1e-6 && Math.abs(fy-ly)<1e-6) ct.c=true;
    if(ct.c && (Math.abs(fx-lx)>1e-9||Math.abs(fy-ly)>1e-9)){ p.push(fx,fy); n+=2; }
    for(var j=0;j<n;j+=2){
      var X=p[j],Y=p[j+1];
      if(X<x0)x0=X; if(X>x1)x1=X; if(Y<y0)y0=Y; if(Y>y1)y1=Y;
      if(j+3<n){ var dx=p[j+2]-X, dy=p[j+3]-Y; len+=Math.sqrt(dx*dx+dy*dy); a+=X*p[j+3]-p[j+2]*Y; }
    }
    ct.len=len; ct.a=ct.c?a/2:0; ct.bb=[x0,y0,x1,y1];
    return ct;
  }
  function pushC(out, ct){ if(ct && ct.p.length>=4){ finishC(ct); if(ct.len>1e-6) out.push(ct); } }

  /* une segmentos abertos que se tocam (DXF de SketchUp/AutoCAD vem em pedaços) */
  function joinOpen(list, tol){
    tol=tol||0.02;
    var open=[], rest=[];
    list.forEach(function(ct){ (ct.c?rest:open).push(ct); });
    if(open.length<2) return list;
    function key(x,y){ return Math.round(x/tol)+':'+Math.round(y/tol)+'|'; }
    var map={};
    function add(k,i){ (map[k]||(map[k]=[])).push(i); }
    open.forEach(function(ct,i){ var p=ct.p; add(ct.L+key(p[0],p[1]),i); add(ct.L+key(p[p.length-2],p[p.length-1]),i); });
    var used=new Array(open.length);
    function take(k){ var a=map[k]; if(!a) return -1; for(var i=0;i<a.length;i++){ if(!used[a[i]]){ return a[i]; } } return -1; }
    var out=[];
    for(var i=0;i<open.length;i++){
      if(used[i]) continue; used[i]=true;
      var L=open[i].L, pts=open[i].p.slice(), guard=0;
      /* estende pelo fim */
      while(guard++<200000){
        var k=L+key(pts[pts.length-2],pts[pts.length-1]), j=take(k); if(j<0) break; used[j]=true;
        var q=open[j].p;
        if(key(q[0],q[1])===key(pts[pts.length-2],pts[pts.length-1])){ for(var a=2;a<q.length;a++) pts.push(q[a]); }
        else { for(var b=q.length-4;b>=0;b-=2) pts.push(q[b],q[b+1]); }
      }
      /* estende pelo começo */
      guard=0;
      while(guard++<200000){
        var k2=L+key(pts[0],pts[1]), j2=take(k2); if(j2<0) break; used[j2]=true;
        var q2=open[j2].p, pre=[];
        if(key(q2[q2.length-2],q2[q2.length-1])===key(pts[0],pts[1])){ for(var c=0;c<q2.length-2;c++) pre.push(q2[c]); }
        else { for(var e=q2.length-2;e>=2;e-=2) pre.push(q2[e],q2[e+1]); }
        pts=pre.concat(pts);
      }
      var nc={L:L,p:pts,c:key(pts[0],pts[1])===key(pts[pts.length-2],pts[pts.length-1])&&pts.length>4};
      if(nc.c){ pts[pts.length-2]=pts[0]; pts[pts.length-1]=pts[1]; }
      finishC(nc); out.push(nc);
    }
    return rest.concat(out);
  }

  function novoDoc(nome, formato){
    return {nome:nome||'arquivo', formato:formato, contornos:[], avisos:[], textos:[], ignorados:{}, chapa:null, preview:null, info:'', unidade:'mm'};
  }
  function fecharDoc(doc){
    var bb=[Infinity,Infinity,-Infinity,-Infinity], cam={}, ordem=[];
    doc.contornos.forEach(function(ct){
      if(ct.bb[0]<bb[0])bb[0]=ct.bb[0]; if(ct.bb[1]<bb[1])bb[1]=ct.bb[1];
      if(ct.bb[2]>bb[2])bb[2]=ct.bb[2]; if(ct.bb[3]>bb[3])bb[3]=ct.bb[3];
      if(!cam[ct.L]){ cam[ct.L]={nome:ct.L,n:0,len:0,cor:null}; ordem.push(ct.L); }
      cam[ct.L].n++; cam[ct.L].len+=ct.len;
    });
    if(!doc.contornos.length) bb=[0,0,0,0];
    doc.bb=bb;
    doc.camadas=ordem.map(function(k){ var c=cam[k]; if(doc.cores&&doc.cores[k]) c.cor=doc.cores[k]; return c; });
    var w=bb[2]-bb[0], h=bb[3]-bb[1], mx=Math.max(w,h);
    if(doc.contornos.length && (mx>60000||mx<1)) doc.avisos.push('Medidas fora do comum ('+Math.round(w)+' × '+Math.round(h)+' mm). Confira a unidade/escala do arquivo.');
    var sug=sugerirQtd(doc.nome, doc.textos);
    if(sug) doc.qtdSugerida=sug;
    return doc;
  }

  /* aplica fator de escala (arquivo em cm/pol/m ou correção de largura) */
  RTR.escalar=function(doc,k){
    if(!(k>0)||k===1) return doc;
    doc.contornos.forEach(function(ct){ for(var i=0;i<ct.p.length;i++) ct.p[i]*=k; delete ct._mr; finishC(ct); });
    if(doc.segs){ for(var j=0;j<doc.segs.length;j++) doc.segs[j]*=k; }
    var av=doc.avisos.filter(function(a){ return a.indexOf('Medidas fora do comum')<0; }); doc.avisos=av;
    return fecharDoc(doc);
  };
  /* quantidade escrita no nome do arquivo ou nas anotações ("30X", "3 unidades", "01 UNIDADE") */
  function sugerirQtd(nome, textos){
    var fontes=[{t:String(nome||'').replace(/\.[a-z0-9]{1,6}$/i,''),f:'nome do arquivo'}];
    (textos||[]).forEach(function(t){ fontes.push({t:t,f:'anotação "'+t+'"'}); });
    for(var i=0;i<fontes.length;i++){
      var s=fontes[i].t, m;
      m=/(\d{1,4})\s*(?:unidades?|unids?\b|und\b|un\b|p[çc]s\b|pe[çc]as?)/i.exec(s);
      if(!m) m=/(?:^|[^\d.,])(\d{1,4})\s*[xX](?![\d.,])/.exec(s);
      if(m){ var n=parseInt(m[1],10); if(n>=1&&n<=5000) return {n:n,fonte:fontes[i].f}; }
    }
    return null;
  }
  RTR.sugerirQtd=sugerirQtd;

  /* ═════════════ CFB / OLE (container do .crv3d) ═════════════ */
  function cfbParse(u8){
    var dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
    if(u8.length<512||dv.getUint32(0,true)!==0xE011CFD0||dv.getUint32(4,true)!==0xE11AB1A1) throw new Error('Arquivo não é um projeto Vectric válido (container OLE não encontrado).');
    var SS=1<<dv.getUint16(30,true), MS=1<<dv.getUint16(32,true);
    var nFat=dv.getUint32(44,true), dirStart=dv.getInt32(48,true), cutoff=dv.getUint32(56,true);
    var mfStart=dv.getInt32(60,true), difat=dv.getInt32(68,true);
    function off(s){ return (s+1)*SS; }
    var fatSecs=[], i, g;
    for(i=0;i<109&&fatSecs.length<nFat;i++){ var v=dv.getInt32(76+i*4,true); if(v>=0) fatSecs.push(v); }
    g=0;
    while(difat>=0&&fatSecs.length<nFat&&g++<100000){
      var base=off(difat), per=SS/4-1;
      for(var j=0;j<per&&fatSecs.length<nFat;j++){ var v2=dv.getInt32(base+j*4,true); if(v2>=0) fatSecs.push(v2); }
      difat=dv.getInt32(base+per*4,true);
    }
    var fat=new Int32Array(fatSecs.length*SS/4), k=0;
    fatSecs.forEach(function(fs){ var b=off(fs); for(var q=0;q<SS/4;q++){ fat[k++]=(b+q*4+4<=u8.length)?dv.getInt32(b+q*4,true):-2; } });
    function chain(s){ var out=[], seen={}, gg=0; while(s>=0&&s<fat.length&&!seen[s]&&gg++<10000000){ seen[s]=1; out.push(s); s=fat[s]; } return out; }
    function readChain(s,size){
      var secs=chain(s), out=new Uint8Array(secs.length*SS);
      secs.forEach(function(sec,ix){ var o=off(sec); if(o<u8.length) out.set(u8.subarray(o,Math.min(o+SS,u8.length)),ix*SS); });
      return size!=null?out.subarray(0,Math.min(size,out.length)):out;
    }
    var dir=readChain(dirStart,null), ents=[];
    for(var e=0;(e+1)*128<=dir.length;e++){
      var b0=e*128, nl=dir[b0+64]|(dir[b0+65]<<8), ddv=new DataView(dir.buffer,dir.byteOffset+b0,128);
      ents.push({name:u16str(dir,b0,Math.max(0,nl/2-1)), type:dir[b0+66], left:ddv.getInt32(68,true), right:ddv.getInt32(72,true),
        child:ddv.getInt32(76,true), start:ddv.getInt32(116,true), size:ddv.getUint32(120,true)});
    }
    var rootE=ents[0]; if(!rootE) throw new Error('Diretório OLE vazio.');
    var mini=rootE.start>=0?readChain(rootE.start,rootE.size):new Uint8Array(0);
    var mfat=[];
    if(mfStart>=0){ var mf=readChain(mfStart,null), mdv=new DataView(mf.buffer,mf.byteOffset,mf.byteLength); for(var z=0;z+4<=mf.length;z+=4) mfat.push(mdv.getInt32(z,true)); }
    function readMini(s,size){
      var out=new Uint8Array(size), o=0, gg=0;
      while(s>=0&&o<size&&gg++<10000000){ var n=Math.min(MS,size-o); out.set(mini.subarray(s*MS,s*MS+n),o); o+=n; s=mfat[s]; }
      return out;
    }
    var files={}, vis={};
    function walk(ix,prefix){
      if(ix<0||ix>=ents.length||vis[ix]) return; vis[ix]=1;
      var en=ents[ix];
      walk(en.left,prefix); walk(en.right,prefix);
      var path=prefix?prefix+'/'+en.name:en.name;
      if(en.type===2) files[path]=en.size<cutoff?readMini(en.start,en.size):readChain(en.start,en.size);
      else if(en.type===1) walk(en.child,path);
    }
    walk(rootE.child,'');
    return files;
  }
  RTR.cfbParse=cfbParse;

  /* ═════════════ .crv3d / .crv (Vectric) ═════════════ */
  function parseCRV(buf, nome){
    var u8=toU8(buf), files=cfbParse(u8), doc=novoDoc(nome,'crv3d');
    var d=files['VectorData/2dDataV2']||files['VectorData/2dData'];
    if(!d) throw new Error('Projeto Vectric sem dados de vetor (VectorData). Versão não suportada.');
    var dv=new DataView(d.buffer,d.byteOffset,d.byteLength), N=d.length, i;
    /* versão */
    var ver=files['VersionData/Version'];
    if(ver){ var vs=cstrings(ver); if(vs.length) doc.info=(vs[0]+' '+(vs[1]||'')).replace(/\s+/g,' ').trim(); }
    /* chapa do job (MaterialSize) */
    var ms=files['VectorData/MaterialSize'];
    if(ms&&ms.length>=46){
      var mdv=new DataView(ms.buffer,ms.byteOffset,ms.byteLength);
      var esp=Math.abs(mdv.getFloat64(22,true)), cw=mdv.getFloat64(30,true), ch=mdv.getFloat64(38,true);
      if(cw>0&&ch>0&&cw<100000&&ch<100000) doc.chapa={w:cw,h:ch,esp:(esp>0&&esp<500)?esp:null};
    }
    /* prévia GIF gravada pelo próprio Aspire */
    var gif=files['PreviewData/Preview2D_GIF'];
    if(gif&&gif.length>10&&gif[0]===0x47&&gif[1]===0x49) doc.preview='data:image/gif;base64,'+b64(gif);
    /* camadas: [4:u32][GUID 16][CString nome] */
    var layers=[];
    for(i=0;i+24<N;i++){
      if(d[i]===4&&d[i+1]===0&&d[i+2]===0&&d[i+3]===0&&d[i+20]===0xFF&&d[i+21]===0xFE&&d[i+22]===0xFF){
        var nl=d[i+23]; if(nl===0xFF||i+24+2*nl>N) continue;
        layers.push({g:hexAt(d,i+4,16),gb:d.subarray(i+4,i+20),nome:u16str(d,i+24,nl)});
        i+=23+2*nl;
      }
    }
    /* posições de todos os GUIDs de camada (cabeçalho de cada objeto aponta a sua camada) */
    var occ=[];
    layers.forEach(function(L){ var p=0; while((p=findBytes(d,L.gb,p))>=0){ occ.push({o:p,L:L}); p+=16; } });
    occ.sort(function(a,b){ return a.o-b.o; });
    function ownerAt(pos){ var lo=0,hi=occ.length-1,r=-1; while(lo<=hi){ var m=(lo+hi)>>1; if(occ[m].o<pos){ r=m; lo=m+1; } else hi=m-1; } return r>=0?occ[r]:null; }
    /* textos de anotação (_txtAL_Text) */
    var cs=cstringsAt(d);
    for(i=0;i<cs.length-1;i++){ if(cs[i].s==='_txtAL_Text'&&cs[i+1].s) doc.textos.push(cs[i+1].s); }
    /* contornos */
    var nTxt=0, nPrev=0, o=4;
    function spanAt(s){
      if(s+61>N) return null;
      var X=d[s]; if(X>2) return null;
      if(d[s+1]!==2||d[s+2]||d[s+3]||d[s+4]) return null;
      var T=dv.getUint32(s+5,true);
      var sz=(T===1&&X===0)?61:(T===0&&X===1)?69:(T===6&&X===2)?93:0;
      if(!sz||s+sz>N) return null;
      var x0=dv.getFloat64(s+9,true), y0=dv.getFloat64(s+17,true), x1=dv.getFloat64(s+33,true), y1=dv.getFloat64(s+41,true);
      if(!(Math.abs(x0)<1e7&&Math.abs(y0)<1e7&&Math.abs(x1)<1e7&&Math.abs(y1)<1e7)) return null;
      var sp={T:T,x0:x0,y0:y0,x1:x1,y1:y1,sz:sz};
      if(T===0){ sp.b=dv.getFloat64(s+61,true); if(!(Math.abs(sp.b)<1e6)) return null; }
      if(T===6){ sp.c1x=dv.getFloat64(s+61,true); sp.c1y=dv.getFloat64(s+69,true); sp.c2x=dv.getFloat64(s+77,true); sp.c2y=dv.getFloat64(s+85,true);
        if(!(Math.abs(sp.c1x)<1e7&&Math.abs(sp.c1y)<1e7&&Math.abs(sp.c2x)<1e7&&Math.abs(sp.c2y)<1e7)) return null; }
      return sp;
    }
    while(o<N-61){
      if(d[o+1]!==2||d[o+2]||d[o+3]||d[o+4]||d[o]>2){ o++; continue; }
      var cnt=dv.getUint32(o-4,true), sp0=(cnt>=1&&cnt<=500000)?spanAt(o):null;
      if(!sp0){ o++; continue; }
      var spans=[sp0], s=o+sp0.sz, ok=true;
      for(var k=1;k<cnt;k++){
        var nx=spanAt(s);
        if(!nx||Math.abs(nx.x0-spans[k-1].x1)>1e-6||Math.abs(nx.y0-spans[k-1].y1)>1e-6){ ok=false; break; }
        spans.push(nx); s+=nx.sz;
      }
      if(!ok){ o++; continue; }
      var own=ownerAt(o), real=false, Lnome='0';
      if(own){
        var h=own.o-20; Lnome=own.L.nome;
        if(h>=0&&s+16<=N){ real=true; for(var q=0;q<16;q++){ if(d[s+q]!==d[h+4+q]){ real=false; break; } } }
        if(own.L.g.indexOf(PREVIEW_GUID)===0||/^(previs|toolpath prev)/i.test(own.L.nome)){ nPrev++; o=s; continue; }
      }
      if(!real){ nTxt++; o=s; continue; }
      var ct=C(Lnome); ct.p.push(spans[0].x0,spans[0].y0);
      for(var m=0;m<spans.length;m++){
        var sp=spans[m];
        if(sp.T===1) ct.p.push(sp.x1,sp.y1);
        else if(sp.T===0) bulgePts(sp.x0,sp.y0,sp.x1,sp.y1,sp.b,ct.p);
        else bezPts(sp.x0,sp.y0,sp.c1x,sp.c1y,sp.c2x,sp.c2y,sp.x1,sp.y1,ct.p);
      }
      pushC(doc.contornos,ct);
      o=s;
    }
    if(nTxt) doc.avisos.push(nTxt+' contorno(s) de texto do Aspire ficaram de fora (anotação). Se algum texto for corte, converta em curvas no Aspire.');
    if(nPrev) doc.avisos.push(nPrev+' vetor(es) da camada de prévia de percursos ignorado(s).');
    if(!doc.contornos.length) doc.avisos.push('Nenhum vetor encontrado neste projeto. Se ele foi salvo em versão nova do Aspire (10+), exporte em DXF/EPS.');
    if(doc.chapa&&doc.chapa.w<=120&&doc.chapa.h<=120) doc.avisos.push('Chapa do projeto pequena ('+doc.chapa.w+' × '+doc.chapa.h+'). Se o job do Aspire estiver em polegadas, troque a unidade para "pol".');
    return fecharDoc(doc);
  }
  function findBytes(d,pat,from){
    var n=pat.length, f=pat[0], lim=d.length-n;
    for(var i=from;i<=lim;i++){ if(d[i]!==f) continue; var ok=true; for(var j=1;j<n;j++){ if(d[i+j]!==pat[j]){ ok=false; break; } } if(ok) return i; }
    return -1;
  }
  function cstringsAt(d){
    var out=[];
    for(var i=0;i+4<d.length;i++){
      if(d[i]===0xFF&&d[i+1]===0xFE&&d[i+2]===0xFF){ var n=d[i+3]; if(n===0xFF) continue; if(i+4+2*n<=d.length){ out.push({o:i,s:u16str(d,i+4,n)}); i+=3+2*n; } }
    }
    return out;
  }
  function cstrings(d){ return cstringsAt(d).map(function(x){ return x.s; }).filter(function(s){ return s&&s.trim(); }); }
  function b64(u8){
    if(typeof btoa!=='undefined') return btoa(latin1(u8));
    return Buffer.from(u8).toString('base64');  /* node (testes) */
  }
  RTR.parseCRV=parseCRV;

  /* ═════════════ PostScript / EPS (Corel, VCarve, Illustrator) ═════════════ */
  function parseEPS(buf, nome){
    var u8=toU8(buf), doc=novoDoc(nome,'eps'), o0=0, len=u8.length;
    if(u8[0]===0xC5&&u8[1]===0xD0&&u8[2]===0xD3&&u8[3]===0xC6){
      var hdv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength); o0=hdv.getUint32(4,true); len=hdv.getUint32(8,true);
    }
    var t=latin1(u8.subarray(o0,Math.min(u8.length,o0+len)));
    var cut=t.indexOf('%AI9_PrivateDataBegin'); if(cut>0) t=t.slice(0,cut);
    if(/^%PDF/.test(t)) throw new Error('Este .ai é PDF por dentro — será lido pelo leitor de PDF.');
    var cri=/%%Creator:\s*([^\r\n]*)/.exec(t); if(cri) doc.info=cri[1].trim();
    var ctm=I6.slice(), stack=[], gst=[], cur=null, path=[], clip=false;
    var stroke=null, fill=null, pend=null, layer=null, lastStr=null, cores={};
    var i=0, n=t.length, depth=0;
    function cp(){ return cur; }
    function newSub(x,y){ var p=tr(x,y); var ct={L:'',p:[p[0],p[1]],c:false,ux:x,uy:y}; path.push(ct); cur=ct; }
    function tr(x,y){ return [ctm[0]*x+ctm[2]*y+ctm[4], ctm[1]*x+ctm[3]*y+ctm[5]]; }
    function lineTo(x,y){ if(!cur){ newSub(x,y); return; } var p=tr(x,y); cur.p.push(p[0],p[1]); cur.ux=x; cur.uy=y; }
    function curveTo(x1,y1,x2,y2,x3,y3){
      if(!cur){ newSub(x1,y1); }
      var a=tr(cur.ux,cur.uy), b=tr(x1,y1), c=tr(x2,y2), dd=tr(x3,y3);
      bezPts(a[0],a[1],b[0],b[1],c[0],c[1],dd[0],dd[1],cur.p); cur.ux=x3; cur.uy=y3;
    }
    function closeSub(){ if(cur){ cur.c=true; var p0=cur.p; cur.ux=null; var sx=p0[0], sy=p0[1]; cur.p.push(sx,sy); cur.closedAt=true; cur=null; } }
    function corHex(v){ if(!v) return null; return v; }
    function commit(){
      var nomeL=layer||(stroke||fill?('cor '+(stroke||fill)):'EPS');
      if(!clip) path.forEach(function(ct){ ct.L=nomeL; delete ct.ux; delete ct.uy; delete ct.closedAt; ct.p=ct.p.map(function(v){ return v*MM_PT; }); pushC(doc.contornos,ct); if(stroke||fill) cores[nomeL]=stroke||fill; });
      path=[]; cur=null; clip=false;
    }
    function discard(){ path=[]; cur=null; clip=false; }
    function pop(k){ var a=stack.splice(stack.length-k,k); return a.length===k?a:null; }
    function rgb(r,g,b){ function h(v){ v=clamp(Math.round(v*255),0,255).toString(16); return v.length<2?'0'+v:v; } return '#'+h(r)+h(g)+h(b); }
    function cmyk(c,m,y,k){ return rgb((1-c)*(1-k),(1-m)*(1-k),(1-y)*(1-k)); }
    while(i<n){
      var ch=t.charCodeAt(i);
      if(ch<=32){ i++; continue; }
      if(ch===37){ /* % comentário */
        var e=t.indexOf('\n',i); if(e<0) e=n;
        var com=t.slice(i,e);
        var lm=/^%LAYER:\s*(.+)$/.exec(com);
        if(lm) layer=lm[1].trim();
        if(/^%%BeginData|^%%BeginBinary/.test(com)){ var ed=t.indexOf(/^%%BeginData/.test(com)?'%%EndData':'%%EndBinary',e); if(ed>0){ i=ed; continue; } }
        i=e+1; continue;
      }
      if(ch===40){ /* ( string ) */
        var dpt=1, j=i+1, sb='';
        while(j<n&&dpt>0){ var cj=t.charCodeAt(j); if(cj===92){ sb+=t.charAt(j+1); j+=2; continue; } if(cj===40)dpt++; else if(cj===41){ dpt--; if(!dpt) break; } sb+=t.charAt(j); j++; }
        if(!depth){ lastStr=sb; stack.push(sb); }
        i=j+1; continue;
      }
      if(ch===123){ depth++; i++; continue; }  /* { procedimento: ignora o corpo */
      if(ch===125){ if(depth) depth--; i++; continue; }
      if(ch===60){ /* <hex> ou << dict >> */
        if(t.charCodeAt(i+1)===60){ i+=2; continue; }
        var gt=t.indexOf('>',i); i=gt<0?n:gt+1; continue;
      }
      if(ch===62){ i++; continue; }
      if(ch===91){ if(!depth) stack.push('['); i++; continue; }
      if(ch===93){ if(!depth){ var arr=[]; while(stack.length&&stack[stack.length-1]!=='['){ arr.unshift(stack.pop()); } stack.pop(); stack.push(arr); } i++; continue; }
      /* palavra */
      var j2=i; while(j2<n){ var c2=t.charCodeAt(j2); if(c2<=32||c2===37||c2===40||c2===41||c2===60||c2===62||c2===91||c2===93||c2===123||c2===125||(c2===47&&j2>i)) break; j2++; }
      var w=t.slice(i,j2); i=j2;
      if(depth) continue;
      if(w.charAt(0)==='/'){ stack.push(w); continue; }
      var v=+w;
      if(w!==''&&isFinite(v)&&/^[-+]?(\d|\.\d)/.test(w)){ stack.push(v); if(stack.length>4000) stack.splice(0,2000); continue; }
      var a;
      switch(w){
        case 'm': case 'moveto': if((a=pop(2))){ newSub(a[0],a[1]); } break;
        case 'rmoveto': if((a=pop(2))&&cur){ newSub(cur.ux+a[0],cur.uy+a[1]); } break;
        case 'l': case 'L': case 'lineto': if((a=pop(2))) lineTo(a[0],a[1]); break;
        case 'rlineto': if((a=pop(2))&&cur) lineTo(cur.ux+a[0],cur.uy+a[1]); break;
        case 'c': case 'C': case 'curveto': if((a=pop(6))) curveTo(a[0],a[1],a[2],a[3],a[4],a[5]); break;
        case 'rcurveto': if((a=pop(6))&&cur){ var bx=cur.ux,by=cur.uy; curveTo(bx+a[0],by+a[1],bx+a[2],by+a[3],bx+a[4],by+a[5]); } break;
        case 'v': case 'V': if((a=pop(4))&&cur) curveTo(cur.ux,cur.uy,a[0],a[1],a[2],a[3]); break;
        case 'y': case 'Y': if((a=pop(4))) curveTo(a[0],a[1],a[2],a[3],a[2],a[3]); break;
        case 'h': case 'H': case 'closepath': case '@c': case 'cp': case 'cl': closeSub(); break;
        case 's': case 'b': case 'b*': closeSub(); commit(); break;
        case 'S': case 'F': case 'f': case 'f*': case 'F*': case 'B': case 'B*': case 'stroke': case 'fill': case 'eofill': case '@sv': commit(); break;
        case 'W': case 'W*': case 'clip': case 'eoclip': clip=true; break;
        case 'n': case 'N': case 'newpath': discard(); break;
        case 'gsave': case 'q': gst.push(ctm.slice()); break;
        case 'grestore': case 'Q': if(gst.length) ctm=gst.pop(); break;
        case 'concat': case 'cm':
          if(w==='concat'){ a=pop(1); if(a&&a[0]&&a[0].length===6) ctm=mul(ctm,a[0].map(Number)); }
          else if((a=pop(6))) ctm=mul(ctm,a);
          break;
        case 'translate': if((a=pop(2))&&typeof a[0]==='number') ctm=mul(ctm,[1,0,0,1,a[0],a[1]]); break;
        case 'scale': if((a=pop(2))&&typeof a[0]==='number') ctm=mul(ctm,[a[0],0,0,a[1],0,0]); break;
        case 'rotate': if((a=pop(1))&&typeof a[0]==='number'){ var r=a[0]*Math.PI/180, co=Math.cos(r), si=Math.sin(r); ctm=mul(ctm,[co,si,-si,co,0,0]); } break;
        case 'setrgbcolor': if((a=pop(3))) stroke=fill=rgb(a[0],a[1],a[2]); break;
        case 'setcmykcolor': if((a=pop(4))) stroke=fill=cmyk(a[0],a[1],a[2],a[3]); break;
        case 'setgray': if((a=pop(1))) stroke=fill=rgb(a[0],a[0],a[0]); break;
        case 'K': if((a=pop(4))) stroke=cmyk(a[0],a[1],a[2],a[3]); break;
        case 'k': if((a=pop(4))) fill=cmyk(a[0],a[1],a[2],a[3]); break;
        case 'XA': if((a=pop(3))) stroke=rgb(a[0],a[1],a[2]); break;
        case 'Xa': if((a=pop(3))) fill=rgb(a[0],a[1],a[2]); break;
        case 'G': if((a=pop(1))) stroke=rgb(1-a[0],1-a[0],1-a[0]); break;
        case 'create_rgb_color': if((a=pop(3))) pend=rgb(a[0],a[1],a[2]); break;
        case 'create_cmyk_color': if((a=pop(4))) pend=cmyk(a[0],a[1],a[2],a[3]); break;
        case 'set_outline': if(pend) stroke=pend; break;
        case 'set_solid_fill': if(pend) fill=pend; break;
        case 'Ln': case 'Lb': if(w==='Ln'&&typeof lastStr==='string'&&lastStr) layer=lastStr; break;
        case 'showpage': case '%%EOF': break;
        default: break;
      }
      stack.length=0; /* todo operador consome/limpa a pilha */
    }
    if(path.length) commit();
    doc.cores=cores;
    doc.contornos=joinOpen(doc.contornos);
    if(!doc.contornos.length) doc.avisos.push('Nenhum caminho de corte encontrado no EPS. Se o arquivo tiver só texto/imagem, converta em curvas antes de exportar.');
    return fecharDoc(doc);
  }
  RTR.parseEPS=parseEPS;

  /* ═════════════ DXF ═════════════ */
  function parseDXF(text, nome){
    var doc=novoDoc(nome,'dxf');
    var L=String(text).split(/\r\n|\r|\n/), pos=0, code=0, val='';
    function next(){ while(pos+1<L.length){ var c=parseInt(L[pos],10); val=L[pos+1]; pos+=2; if(isNaN(c)) continue; code=c; return true; } return false; }
    var header={}, hv=null, section=null, ents=[], blocks={}, curB=null, cur=null, layerCor={};
    while(next()){
      if(code===0){
        var v=val.trim();
        if(v==='SECTION'){ if(next()) section=val.trim(); cur=null; continue; }
        if(v==='ENDSEC'){ section=null; cur=null; continue; }
        if(v==='EOF') break;
        if(section==='BLOCKS'){
          if(v==='BLOCK'){ curB={hdr:[],ents:[]}; cur={type:'BLOCK',seq:curB.hdr}; continue; }
          if(v==='ENDBLK'){ if(curB){ var bn=gv(curB.hdr,2)||gv(curB.hdr,3)||''; curB.name=bn; curB.bx=num(gv(curB.hdr,10)); curB.by=num(gv(curB.hdr,20)); blocks[bn]=curB; } curB=null; cur={type:'ENDBLK',seq:[]}; continue; }
          cur={type:v,seq:[]}; if(curB) curB.ents.push(cur); continue;
        }
        if(section==='ENTITIES'){ cur={type:v,seq:[]}; ents.push(cur); continue; }
        if(section==='TABLES'){ cur=(v==='LAYER')?{type:'LAYER',seq:[]}:null; if(cur) ents.push(cur); continue; }
        cur=null; continue;
      }
      if(section==='HEADER'){ if(code===9) hv=val.trim(); else if(hv&&header[hv]==null) header[hv]=val.trim(); continue; }
      if(cur) cur.seq.push(code,val);
    }
    function gv(seq,c){ for(var i=0;i<seq.length;i+=2){ if(seq[i]===c) return seq[i+1]; } return null; }
    function gn(e,c,def){ var r=gv(e.seq,c); return r==null?def:num(r); }
    function gs(e,c,def){ var r=gv(e.seq,c); return r==null?def:String(r).trim(); }
    /* camadas (cor ACI só para a prévia) */
    ents.forEach(function(e){ if(e.type==='LAYER'){ var nm=gs(e,2,''); if(nm) layerCor[nm]=gn(e,62,7); } });
    var un=parseInt(header.$INSUNITS,10), k=1, unome='mm';
    if(un===1){k=25.4;unome='pol';} else if(un===2){k=304.8;unome='pés';} else if(un===5){k=10;unome='cm';} else if(un===6){k=1000;unome='m';}
    else if(un===4){k=1;} else { k=1; if(un===0||isNaN(un)) doc.avisos.push('DXF sem unidade definida: considerei milímetros.'); else doc.avisos.push('Unidade do DXF ('+un+') não reconhecida: considerei milímetros.'); }
    doc.unidadeOrigem=unome;
    var out=[], ign=doc.ignorados;
    function emit(ct,M){ xfPts(ct.p,M); if(k!==1){ for(var z=0;z<ct.p.length;z++) ct.p[z]*=k; } pushC(out,ct); }
    function texto(e){ var s=gs(e,1,''); if(s){ s=s.replace(/\\P/g,' ').replace(/\\[A-Za-z][^;]*;/g,'').replace(/[{}]/g,'').trim(); if(s&&doc.textos.length<40) doc.textos.push(s); } }
    function walk(list, M, layerPai, depth){
      for(var ix=0;ix<list.length;ix++){
        var e=list[ix], ty=e.type, lay=gs(e,8,'0');
        if(lay==='0'&&layerPai) lay=layerPai;
        var mir=gn(e,230,1)<0, ct, p, a0, a1, cx, cy, r, i2;
        function ocs(xx){ return mir?-xx:xx; }
        if(ty==='LINE'){
          ct=C(lay); ct.p.push(gn(e,10,0),gn(e,20,0),gn(e,11,0),gn(e,21,0)); emit(ct,M);
        } else if(ty==='LWPOLYLINE'){
          var vs=[], vtx=null;
          for(i2=0;i2<e.seq.length;i2+=2){ var cc=e.seq[i2], vv=e.seq[i2+1];
            if(cc===10){ vtx={x:num(vv),y:0,b:0}; vs.push(vtx); } else if(cc===20&&vtx) vtx.y=num(vv); else if(cc===42&&vtx) vtx.b=num(vv); }
          polyFrom(vs,(gn(e,70,0)&1)===1,lay,mir,M);
        } else if(ty==='POLYLINE'){
          var fl=gn(e,70,0), vs2=[];
          ix++;
          while(ix<list.length&&list[ix].type==='VERTEX'){ var ve=list[ix], vf=gn(ve,70,0); if(!(vf&16)) vs2.push({x:gn(ve,10,0),y:gn(ve,20,0),b:gn(ve,42,0)}); ix++; }
          if(ix<list.length&&list[ix].type!=='SEQEND') ix--;
          if(fl&(16|64)){ ign['malha 3D']=(ign['malha 3D']||0)+1; continue; }
          polyFrom(vs2,(fl&1)===1,lay,(fl&8)?false:mir,M);
        } else if(ty==='ARC'||ty==='CIRCLE'){
          cx=ocs(gn(e,10,0)); cy=gn(e,20,0); r=gn(e,40,0); if(!(r>0)) continue;
          ct=C(lay);
          if(ty==='CIRCLE'){ ct.p.push(cx+r,cy); arcPts(cx,cy,r,0,2*Math.PI,ct.p); ct.c=true; }
          else {
            a0=gn(e,50,0)*Math.PI/180; a1=gn(e,51,360)*Math.PI/180;
            if(mir){ var t0=Math.PI-a1; a1=Math.PI-a0; a0=t0; }
            var da=a1-a0; while(da<=0) da+=2*Math.PI; while(da>2*Math.PI) da-=2*Math.PI;
            ct.p.push(cx+r*Math.cos(a0),cy+r*Math.sin(a0)); arcPts(cx,cy,r,a0,da,ct.p);
          }
          emit(ct,M);
        } else if(ty==='ELLIPSE'){
          cx=gn(e,10,0); cy=gn(e,20,0); var mx=gn(e,11,1), my=gn(e,21,0), ra=gn(e,40,1), p0=gn(e,41,0), p1=gn(e,42,2*Math.PI);
          var sgn=mir?-1:1, rx=Math.sqrt(mx*mx+my*my), ry=rx*ra, phi=Math.atan2(my,mx);
          var dp=p1-p0; while(dp<=0) dp+=2*Math.PI; if(dp>2*Math.PI+1e-9) dp=2*Math.PI;
          ct=C(lay);
          var sx0=rx*Math.cos(p0), sy0=sgn*ry*Math.sin(p0);
          ct.p.push(cx+sx0*Math.cos(phi)-sy0*Math.sin(phi), cy+sx0*Math.sin(phi)+sy0*Math.cos(phi));
          ellPts(cx,cy,rx,sgn*ry,phi,p0,dp,ct.p);
          if(Math.abs(dp-2*Math.PI)<1e-6) ct.c=true;
          emit(ct,M);
        } else if(ty==='SPLINE'){
          ct=splineCt(e,lay); if(ct) emit(ct,M);
        } else if(ty==='INSERT'){
          var b=blocks[gs(e,2,'')]; if(!b||depth>12){ if(!b) ign['bloco ausente']=(ign['bloco ausente']||0)+1; continue; }
          var ixp=gn(e,10,0), iyp=gn(e,20,0), sx=gn(e,41,1), sy=gn(e,42,1), rot=gn(e,50,0)*Math.PI/180;
          var nc=Math.max(1,gn(e,70,1)), nr=Math.max(1,gn(e,71,1)), csp=gn(e,44,0), rsp=gn(e,45,0);
          if(mir){ ixp=-ixp; rot=-rot; sx=-sx; }
          var co=Math.cos(rot), si=Math.sin(rot);
          for(var ci=0;ci<nc&&ci<200;ci++) for(var ri=0;ri<nr&&ri<200;ri++){
            var Mi=mul(M,[1,0,0,1,ixp,iyp]); Mi=mul(Mi,[co,si,-si,co,0,0]); Mi=mul(Mi,[1,0,0,1,ci*csp,ri*rsp]);
            Mi=mul(Mi,[sx,0,0,sy,0,0]); Mi=mul(Mi,[1,0,0,1,-b.bx,-b.by]);
            walk(b.ents,Mi,lay,depth+1);
          }
        } else if(ty==='TEXT'||ty==='MTEXT'||ty==='ATTRIB'){
          texto(e); ign['texto']=(ign['texto']||0)+1;
        } else if(ty==='SEQEND'||ty==='VERTEX'||ty==='LAYER'||ty==='ATTDEF'||ty==='ENDBLK'){
        } else { ign[ty]=(ign[ty]||0)+1; }
      }
    }
    function polyFrom(vs,closed,lay,mir,M){
      if(vs.length<2) return;
      var ct=C(lay), n=vs.length, s=mir?-1:1;
      ct.p.push(s*vs[0].x,vs[0].y);
      for(var i=0;i<n;i++){
        if(i===n-1&&!closed) break;
        var a=vs[i], b=vs[(i+1)%n];
        if(Math.abs(a.b)>1e-12) bulgePts(s*a.x,a.y,s*b.x,b.y,mir?-a.b:a.b,ct.p); else ct.p.push(s*b.x,b.y);
      }
      ct.c=closed; emit(ct,M);
    }
    function splineCt(e,lay){
      var deg=gn(e,71,3), fl=gn(e,70,0), knots=[], cps=[], ws=[], fit=[], cpx=null, fx=null;
      for(var i=0;i<e.seq.length;i+=2){ var c=e.seq[i], v=num(e.seq[i+1]);
        if(c===40) knots.push(v); else if(c===10){ cpx={x:v,y:0}; cps.push(cpx); } else if(c===20&&cpx) cpx.y=v;
        else if(c===41) ws.push(v); else if(c===11){ fx={x:v,y:0}; fit.push(fx); } else if(c===21&&fx) fx.y=v; }
      var ct=C(lay);
      if(cps.length>deg&&knots.length===cps.length+deg+1){
        var w=ws.length===cps.length?ws:null, lo=knots[deg], hi=knots[knots.length-deg-1];
        var N=clamp(cps.length*24,32,4000);
        for(var s=0;s<=N;s++){ var pt=deBoor(deg,knots,cps,w,lo+(hi-lo)*s/N); ct.p.push(pt[0],pt[1]); }
      } else if(fit.length>1){
        catmull(fit,(fl&1)===1,ct.p);
        if(!doc._avSpl){ doc._avSpl=1; doc.avisos.push('Spline só com pontos de ajuste: curva reconstruída (diferença típica < 1%).'); }
      } else if(cps.length>1){ cps.forEach(function(f){ ct.p.push(f.x,f.y); }); }
      else return null;
      ct.c=(fl&1)===1;
      return ct;
    }
    walk(ents,I6,null,0);
    doc.contornos=joinOpen(out);
    var cores={}; Object.keys(layerCor).forEach(function(k2){ cores[k2]=aci(layerCor[k2]); }); doc.cores=cores;
    if(doc.ignorados.texto) doc.avisos.push(doc.ignorados.texto+' texto(s) do DXF não entram na medida.');
    return fecharDoc(doc);
  }
  /* Catmull-Rom com parametrização pela corda (passa pelos pontos de ajuste) */
  function catmull(P,closed,out){
    var n=P.length, pts=P.slice();
    if(closed){ pts=[P[n-1]].concat(P,[P[0],P[1]]); } else { pts=[{x:2*P[0].x-P[1].x,y:2*P[0].y-P[1].y}].concat(P,[{x:2*P[n-1].x-P[n-2].x,y:2*P[n-1].y-P[n-2].y}]); }
    out.push(P[0].x,P[0].y);
    var segs=closed?n:n-1;
    for(var i=1;i<=segs;i++){
      var p0=pts[i-1],p1=pts[i],p2=pts[i+1],p3=pts[i+2];
      var d1=Math.max(1e-9,Math.sqrt(Math.hypot(p1.x-p0.x,p1.y-p0.y))), d2=Math.max(1e-9,Math.sqrt(Math.hypot(p2.x-p1.x,p2.y-p1.y))), d3=Math.max(1e-9,Math.sqrt(Math.hypot(p3.x-p2.x,p3.y-p2.y)));
      /* tangentes (centrípeta) → Bézier */
      var t1x=(p1.x-p0.x)/d1-(p2.x-p0.x)/(d1+d2)+(p2.x-p1.x)/d2, t1y=(p1.y-p0.y)/d1-(p2.y-p0.y)/(d1+d2)+(p2.y-p1.y)/d2;
      var t2x=(p2.x-p1.x)/d2-(p3.x-p1.x)/(d2+d3)+(p3.x-p2.x)/d3, t2y=(p2.y-p1.y)/d2-(p3.y-p1.y)/(d2+d3)+(p3.y-p2.y)/d3;
      t1x*=d2; t1y*=d2; t2x*=d2; t2y*=d2;
      bezPts(p1.x,p1.y,p1.x+t1x/3,p1.y+t1y/3,p2.x-t2x/3,p2.y-t2y/3,p2.x,p2.y,out);
    }
  }
  function deBoor(p,U,P,W,t){
    var n=P.length-1, k=p;
    if(t>=U[n+1]) k=n; else { for(k=p;k<=n;k++){ if(t>=U[k]&&t<U[k+1]) break; } if(k>n) k=n; }
    var dx=[],dy=[],dw=[];
    for(var j=0;j<=p;j++){ var ii=k-p+j, w=W?W[ii]:1; dx[j]=P[ii].x*w; dy[j]=P[ii].y*w; dw[j]=w; }
    for(var r=1;r<=p;r++) for(var j2=p;j2>=r;j2--){
      var i3=k-p+j2, den=U[i3+p-r+1]-U[i3], al=den?(t-U[i3])/den:0;
      dx[j2]=(1-al)*dx[j2-1]+al*dx[j2]; dy[j2]=(1-al)*dy[j2-1]+al*dy[j2]; dw[j2]=(1-al)*dw[j2-1]+al*dw[j2];
    }
    return [dx[p]/dw[p], dy[p]/dw[p]];
  }
  function aci(i){
    var T={1:'#FF0000',2:'#FFFF00',3:'#00FF00',4:'#00FFFF',5:'#0000FF',6:'#FF00FF',7:'#333333',8:'#808080',9:'#C0C0C0'};
    return T[Math.abs(i)]||null;
  }
  RTR.parseDXF=parseDXF;

  /* ═════════════ SVG ═════════════ */
  function parseSVG(text, nome){
    if(typeof DOMParser==='undefined') throw new Error('Leitor de SVG indisponível neste navegador.');
    var doc=novoDoc(nome,'svg');
    var xml=new DOMParser().parseFromString(String(text),'image/svg+xml');
    var svg=xml.documentElement;
    if(!svg||String(svg.nodeName).toLowerCase().indexOf('svg')<0) throw new Error('SVG inválido.');
    var ai=/Adobe Illustrator/i.test(String(text).slice(0,3000));
    var pxmm=ai?MM_PT:25.4/96;
    function lenMM(s){
      var m=/^\s*([-+]?[\d.]+(?:e[-+]?\d+)?)\s*(mm|cm|in|pt|pc|px|m)?\s*$/i.exec(s||''); if(!m) return null;
      var v=parseFloat(m[1]), u=(m[2]||'px').toLowerCase();
      return v*({mm:1,cm:10,m:1000,'in':25.4,pt:MM_PT,pc:12*MM_PT,px:pxmm})[u];
    }
    var vb=(svg.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(parseFloat);
    var W=lenMM(svg.getAttribute('width')), H=lenMM(svg.getAttribute('height'));
    var kx=pxmm, ky=pxmm;
    if(vb.length===4&&vb[2]>0&&vb[3]>0){
      if(W&&H){ kx=W/vb[2]; ky=H/vb[3]; } else if(W){ kx=ky=W/vb[2]; } else { doc.avisos.push('SVG sem largura definida: considerei '+(ai?'72':'96')+' px por polegada.'); }
    } else if(!W){ doc.avisos.push('SVG sem unidade: considerei '+(ai?'72':'96')+' px por polegada.'); }
    var base=[kx,0,0,-ky,-(vb.length===4?vb[0]*kx:0),(vb.length===4?vb[1]*ky:0)];
    doc.unidadeOrigem=svg.getAttribute('width')||'px';
    var byId={};
    (function idx(el){ var ch=el.childNodes; for(var i=0;i<ch.length;i++){ var c=ch[i]; if(c.nodeType!==1) continue; var id=c.getAttribute('id'); if(id) byId[id]=c; idx(c); } })(svg);
    var cores={}, SKIP={defs:1,symbol:1,clippath:1,mask:1,marker:1,pattern:1,style:1,title:1,desc:1,metadata:1,lineargradient:1,radialgradient:1,filter:1,text:1,image:1,script:1,foreignobject:1};
    function attr(el,n){ var v=el.getAttribute(n); if(v!=null) return v; var st=el.getAttribute('style')||''; var m=new RegExp('(?:^|;)\\s*'+n+'\\s*:\\s*([^;]+)').exec(st); return m?m[1].trim():null; }
    function tf(s){
      var M=I6.slice(), re=/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g, m;
      while((m=re.exec(s||''))){
        var a=m[2].trim().split(/[\s,]+/).map(parseFloat), T;
        if(m[1]==='matrix') T=a.slice(0,6);
        else if(m[1]==='translate') T=[1,0,0,1,a[0]||0,a[1]||0];
        else if(m[1]==='scale') T=[a[0],0,0,a.length>1?a[1]:a[0],0,0];
        else if(m[1]==='rotate'){ var r=a[0]*Math.PI/180, co=Math.cos(r), si=Math.sin(r); T=[co,si,-si,co,0,0];
          if(a.length>2) T=mul(mul([1,0,0,1,a[1],a[2]],T),[1,0,0,1,-a[1],-a[2]]); }
        else if(m[1]==='skewX') T=[1,0,Math.tan(a[0]*Math.PI/180),1,0,0];
        else T=[1,Math.tan(a[0]*Math.PI/180),0,1,0,0];
        M=mul(M,T);
      }
      return M;
    }
    function walk(el, M, lay, top){
      var ch=el.childNodes;
      for(var i=0;i<ch.length;i++){
        var c=ch[i]; if(c.nodeType!==1) continue;
        var tag=String(c.localName||c.nodeName).toLowerCase().replace(/^svg:/,'');
        if(SKIP[tag]) { if(tag==='text') doc.ignorados.texto=(doc.ignorados.texto||0)+1; continue; }
        if(attr(c,'display')==='none'||attr(c,'visibility')==='hidden') continue;
        var Mc=c.getAttribute('transform')?mul(M,tf(c.getAttribute('transform'))):M;
        var lnome=lay;
        if(tag==='g'&&top){ lnome=c.getAttribute('inkscape:label')||c.getAttribute('data-name')||c.getAttribute('id')||lay; }
        if(tag==='g'||tag==='a'||tag==='svg'){ walk(c,Mc,lnome,false); continue; }
        if(tag==='use'){
          var href=(c.getAttribute('href')||c.getAttribute('xlink:href')||'').replace(/^#/,''), ref=byId[href];
          if(ref){ var Mu=mul(Mc,[1,0,0,1,num(c.getAttribute('x')),num(c.getAttribute('y'))]); var wrap={childNodes:[ref]}; if(String(ref.nodeName).toLowerCase()==='symbol') wrap=ref; walk(wrap,Mu,lnome,false); }
          continue;
        }
        var st=attr(c,'stroke'), lname=lnome||((st&&st!=='none')?'cor '+st:'SVG');
        if(!lnome&&st&&st!=='none') cores[lname]=st;
        var subs=shape(c,tag);
        for(var s=0;s<subs.length;s++){ var ct=subs[s]; ct.L=lname; xfPts(ct.p,mul(base,Mc)); pushC(doc.contornos,ct); }
      }
    }
    function shape(el,tag){
      var g=function(n){ return num(el.getAttribute(n)); }, ct, out=[];
      if(tag==='path') return pathD(el.getAttribute('d')||'');
      if(tag==='rect'){
        var x=g('x'),y=g('y'),w=g('width'),h=g('height'),rx=el.getAttribute('rx'),ry=el.getAttribute('ry');
        if(!(w>0&&h>0)) return out;
        rx=rx==null?(ry==null?0:num(ry)):num(rx); ry=ry==null?rx:num(ry); rx=Math.min(rx,w/2); ry=Math.min(ry,h/2);
        ct=C(); ct.c=true;
        if(rx>0&&ry>0){
          ct.p.push(x+rx,y); ct.p.push(x+w-rx,y); ellPts(x+w-rx,y+ry,rx,ry,0,-Math.PI/2,Math.PI/2,ct.p);
          ct.p.push(x+w,y+h-ry); ellPts(x+w-rx,y+h-ry,rx,ry,0,0,Math.PI/2,ct.p);
          ct.p.push(x+rx,y+h); ellPts(x+rx,y+h-ry,rx,ry,0,Math.PI/2,Math.PI/2,ct.p);
          ct.p.push(x,y+ry); ellPts(x+rx,y+ry,rx,ry,0,Math.PI,Math.PI/2,ct.p);
        } else ct.p.push(x,y,x+w,y,x+w,y+h,x,y+h,x,y);
        out.push(ct); return out;
      }
      if(tag==='circle'||tag==='ellipse'){
        var cx=g('cx'),cy=g('cy'),ex=tag==='circle'?g('r'):g('rx'),ey=tag==='circle'?g('r'):g('ry');
        if(!(ex>0&&ey>0)) return out;
        ct=C(); ct.c=true; ct.p.push(cx+ex,cy); ellPts(cx,cy,ex,ey,0,0,2*Math.PI,ct.p); out.push(ct); return out;
      }
      if(tag==='line'){ ct=C(); ct.p.push(g('x1'),g('y1'),g('x2'),g('y2')); out.push(ct); return out; }
      if(tag==='polyline'||tag==='polygon'){
        var pts=(el.getAttribute('points')||'').trim().split(/[\s,]+/).map(parseFloat).filter(function(v){ return isFinite(v); });
        if(pts.length<4) return out; ct=C(); ct.p=pts.slice(0,pts.length-(pts.length%2)); ct.c=tag==='polygon'; out.push(ct); return out;
      }
      return out;
    }
    walk(svg,I6,null,true);
    doc.cores=cores;
    doc.contornos=joinOpen(doc.contornos);
    if(doc.ignorados.texto) doc.avisos.push(doc.ignorados.texto+' texto(s) do SVG não entram na medida (converta em curvas).');
    return fecharDoc(doc);
  }
  /* path "d" do SVG → contornos (coordenadas do usuário) */
  function pathD(d){
    var out=[], i=0, n=d.length, cmd='', ct=null, x=0,y=0, sx=0,sy=0, lcx=0,lcy=0, lqx=0,lqy=0, prev='';
    function skip(){ while(i<n){ var c=d.charCodeAt(i); if(c===32||c===44||c===9||c===10||c===13) i++; else break; } }
    function isNum(){ skip(); if(i>=n) return false; var c=d.charAt(i); return /[-+.\d]/.test(c); }
    function rn(){ skip(); var m=/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(d.slice(i,i+40)); if(!m) throw new Error('path inválido'); i+=m[0].length; return parseFloat(m[0]); }
    function rf(){ skip(); var c=d.charAt(i); if(c==='0'||c==='1'){ i++; return c==='1'; } return rn()!==0; }
    function start(){ if(ct&&ct.p.length>=4) out.push(ct); ct=C(); ct.p.push(x,y); }
    while(i<n){
      skip(); if(i>=n) break;
      var ch=d.charAt(i);
      if(/[MmLlHhVvCcSsQqTtAaZz]/.test(ch)){ cmd=ch; i++; }
      else if(!cmd) { i++; continue; }
      var rel=cmd===cmd.toLowerCase(), C0=cmd.toUpperCase();
      if(C0==='Z'){ if(ct){ ct.c=true; ct.p.push(sx,sy); out.push(ct); ct=null; } x=sx; y=sy; prev='Z'; continue; }
      do{
        if(C0==='M'){ var mx=rn(), my=rn(); x=rel?x+mx:mx; y=rel?y+my:my; sx=x; sy=y; start(); C0='L'; cmd=rel?'l':'L'; }
        else if(C0==='L'){ var lx=rn(), ly=rn(); x=rel?x+lx:lx; y=rel?y+ly:ly; if(!ct) start(); ct.p.push(x,y); }
        else if(C0==='H'){ var hx=rn(); x=rel?x+hx:hx; if(!ct) start(); ct.p.push(x,y); }
        else if(C0==='V'){ var vy=rn(); y=rel?y+vy:vy; if(!ct) start(); ct.p.push(x,y); }
        else if(C0==='C'||C0==='S'){
          var x1,y1;
          if(C0==='C'){ x1=rn(); y1=rn(); if(rel){ x1+=x; y1+=y; } }
          else { if(/[CcSs]/.test(prev)){ x1=2*x-lcx; y1=2*y-lcy; } else { x1=x; y1=y; } }
          var x2=rn(), y2=rn(), x3=rn(), y3=rn(); if(rel){ x2+=x; y2+=y; x3+=x; y3+=y; }
          if(!ct) start(); bezPts(x,y,x1,y1,x2,y2,x3,y3,ct.p); lcx=x2; lcy=y2; x=x3; y=y3;
        }
        else if(C0==='Q'||C0==='T'){
          var qx,qy;
          if(C0==='Q'){ qx=rn(); qy=rn(); if(rel){ qx+=x; qy+=y; } } else { if(/[QqTt]/.test(prev)){ qx=2*x-lqx; qy=2*y-lqy; } else { qx=x; qy=y; } }
          var ex=rn(), ey=rn(); if(rel){ ex+=x; ey+=y; }
          if(!ct) start(); quadPts(x,y,qx,qy,ex,ey,ct.p); lqx=qx; lqy=qy; x=ex; y=ey;
        }
        else if(C0==='A'){
          var rx=Math.abs(rn()), ry=Math.abs(rn()), rot=rn(), la=rf(), sw=rf(), ax=rn(), ay=rn(); if(rel){ ax+=x; ay+=y; }
          if(!ct) start(); svgArc(x,y,rx,ry,rot,la,sw,ax,ay,ct.p); x=ax; y=ay;
        }
        prev=cmd;
      } while(isNum()&&C0!=='Z');
    }
    if(ct&&ct.p.length>=4) out.push(ct);
    return out;
  }
  function svgArc(x1,y1,rx,ry,deg,la,sw,x2,y2,out){
    if(rx<1e-12||ry<1e-12||(x1===x2&&y1===y2)){ out.push(x2,y2); return; }
    var phi=deg*Math.PI/180, cp=Math.cos(phi), sp=Math.sin(phi);
    var dx=(x1-x2)/2, dy=(y1-y2)/2, x1p=cp*dx+sp*dy, y1p=-sp*dx+cp*dy;
    var lam=(x1p*x1p)/(rx*rx)+(y1p*y1p)/(ry*ry); if(lam>1){ var sl=Math.sqrt(lam); rx*=sl; ry*=sl; }
    var num2=rx*rx*ry*ry-rx*rx*y1p*y1p-ry*ry*x1p*x1p, den=rx*rx*y1p*y1p+ry*ry*x1p*x1p;
    var co=Math.sqrt(Math.max(0,num2/den))*(la===sw?-1:1);
    var cxp=co*rx*y1p/ry, cyp=-co*ry*x1p/rx;
    var cx=cp*cxp-sp*cyp+(x1+x2)/2, cy=sp*cxp+cp*cyp+(y1+y2)/2;
    function ang(ux,uy,vx,vy){ var a=Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy); return a; }
    var t1=ang(1,0,(x1p-cxp)/rx,(y1p-cyp)/ry), dt=ang((x1p-cxp)/rx,(y1p-cyp)/ry,(-x1p-cxp)/rx,(-y1p-cyp)/ry);
    if(!sw&&dt>0) dt-=2*Math.PI; else if(sw&&dt<0) dt+=2*Math.PI;
    ellPts(cx,cy,rx,ry,phi,t1,dt,out);
    out[out.length-2]=x2; out[out.length-1]=y2;
  }
  RTR.parseSVG=parseSVG; RTR._pathD=pathD;

  /* ═════════════ PDF / AI (via pdf.js) ═════════════ */
  function parsePDF(buf, nome, pdfjs){
    var doc=novoDoc(nome,'pdf'); doc.cores={};
    if(!pdfjs) return Promise.reject(new Error('Leitor de PDF não carregou (sem internet?).'));
    var OPS=pdfjs.OPS, data=toU8(buf).slice(0);
    return pdfjs.getDocument({data:data, isEvalSupported:false, disableFontFace:true}).promise.then(function(pdf){
      var oc=null;
      return (pdf.getOptionalContentConfig?pdf.getOptionalContentConfig().catch(function(){ return null; }):Promise.resolve(null)).then(function(cfg){
        oc=cfg;
        var pages=[], np=Math.min(pdf.numPages,20), seq=Promise.resolve(), dx=0;
        if(pdf.numPages>1) doc.avisos.push('PDF com '+pdf.numPages+' páginas: as páginas foram lidas lado a lado'+(pdf.numPages>20?' (só as 20 primeiras)':'')+'.');
        for(var pg=1;pg<=np;pg++){ (function(pg){ seq=seq.then(function(){ return pdf.getPage(pg).then(function(page){
          return page.getOperatorList().then(function(ol){ var w=lerOps(ol,page,dx); dx+=w+50/MM_PT; }); }); }); })(pg); }
        return seq;
      });
      function lerOps(ol,page,dx){
        var view=page.view||[0,0,612,792], ctm=[1,0,0,1,dx-view[0],-view[1]], st=[], path=[], cur=null, stroke=null, mc=[];
        function tr(x,y){ return [ctm[0]*x+ctm[2]*y+ctm[4], ctm[1]*x+ctm[3]*y+ctm[5]]; }
        function sub(op,a,k){
          if(op===OPS.moveTo){ var p=tr(a[k],a[k+1]); cur={L:'',p:[p[0],p[1]],c:false,ux:a[k],uy:a[k+1],sx:a[k],sy:a[k+1]}; path.push(cur); return 2; }
          if(op===OPS.lineTo){ if(!cur) return 2; var q=tr(a[k],a[k+1]); cur.p.push(q[0],q[1]); cur.ux=a[k]; cur.uy=a[k+1]; return 2; }
          if(op===OPS.curveTo||op===OPS.curveTo2||op===OPS.curveTo3){
            if(!cur) return op===OPS.curveTo?6:4;
            var x1,y1,x2,y2,x3,y3;
            if(op===OPS.curveTo){ x1=a[k];y1=a[k+1];x2=a[k+2];y2=a[k+3];x3=a[k+4];y3=a[k+5]; }
            else if(op===OPS.curveTo2){ x1=cur.ux;y1=cur.uy;x2=a[k];y2=a[k+1];x3=a[k+2];y3=a[k+3]; }
            else { x1=a[k];y1=a[k+1];x2=a[k+2];y2=a[k+3];x3=x2;y3=y2; }
            var A=tr(cur.ux,cur.uy),B=tr(x1,y1),Cc=tr(x2,y2),D=tr(x3,y3);
            bezPts(A[0],A[1],B[0],B[1],Cc[0],Cc[1],D[0],D[1],cur.p); cur.ux=x3; cur.uy=y3;
            return op===OPS.curveTo?6:4;
          }
          if(op===OPS.closePath){ if(cur){ cur.c=true; cur.ux=cur.sx; cur.uy=cur.sy; cur=null; } return 0; }
          if(op===OPS.rectangle){ var x=a[k],y=a[k+1],w=a[k+2],h=a[k+3], r=[tr(x,y),tr(x+w,y),tr(x+w,y+h),tr(x,y+h)];
            path.push({L:'',p:[r[0][0],r[0][1],r[1][0],r[1][1],r[2][0],r[2][1],r[3][0],r[3][1]],c:true}); cur=null; return 4; }
          return 0;
        }
        function layerNome(){
          for(var i=mc.length-1;i>=0;i--){ if(mc[i]) return mc[i]; }
          return stroke?('cor '+stroke):'PDF';
        }
        function commit(){ var nm=layerNome(); path.forEach(function(ct){ ct.L=nm; delete ct.ux; delete ct.uy; delete ct.sx; delete ct.sy; ct.p=ct.p.map(function(v){ return v*MM_PT; }); pushC(doc.contornos,ct); }); if(stroke&&path.length) doc.cores[nm]=stroke; path=[]; cur=null; }
        var fa=ol.fnArray, aa=ol.argsArray;
        for(var i=0;i<fa.length;i++){
          var fn=fa[i], a=aa[i]||[];
          if(fn===OPS.save) st.push(ctm.slice());
          else if(fn===OPS.restore){ if(st.length) ctm=st.pop(); }
          else if(fn===OPS.transform) ctm=mul(ctm,a);
          else if(fn===OPS.paintFormXObjectBegin){ st.push(ctm.slice()); if(a[0]&&a[0].length===6) ctm=mul(ctm,a[0]); }
          else if(fn===OPS.paintFormXObjectEnd){ if(st.length) ctm=st.pop(); }
          else if(fn===OPS.constructPath){ var ops=a[0]||[], args=a[1]||[], k=0; for(var j=0;j<ops.length;j++) k+=sub(ops[j],args,k); }
          else if(fn===OPS.moveTo||fn===OPS.lineTo||fn===OPS.curveTo||fn===OPS.curveTo2||fn===OPS.curveTo3||fn===OPS.closePath||fn===OPS.rectangle) sub(fn,a,0);
          else if(fn===OPS.stroke||fn===OPS.closeStroke||fn===OPS.fill||fn===OPS.eoFill||fn===OPS.fillStroke||fn===OPS.eoFillStroke||fn===OPS.closeFillStroke||fn===OPS.closeEOFillStroke){
            if(fn===OPS.closeStroke||fn===OPS.closeFillStroke||fn===OPS.closeEOFillStroke){ if(cur){ cur.c=true; } }
            commit();
          }
          else if(fn===OPS.endPath){ path=[]; cur=null; }
          else if(fn===OPS.setStrokeRGBColor){ stroke=(typeof a[0]==='string')?a[0]:('#'+[a[0],a[1],a[2]].map(function(v){ v=clamp(Math.round(+v||0),0,255).toString(16); return v.length<2?'0'+v:v; }).join('')); }
          else if(fn===OPS.beginMarkedContentProps){
            var nmL=null;
            try{ var pr=a[1]; if(a[0]==='OC'&&pr){ var id=pr.id||pr; if(oc&&oc.getGroup){ var gp=oc.getGroup(id); if(gp&&gp.name) nmL=gp.name; } } }catch(err){}
            mc.push(nmL);
          }
          else if(fn===OPS.beginMarkedContent) mc.push(null);
          else if(fn===OPS.endMarkedContent) mc.pop();
        }
        return (view[2]-view[0]);
      }
    }).then(function(){
      doc.contornos=joinOpen(doc.contornos);
      if(!doc.contornos.length) doc.avisos.push('Nenhum vetor no PDF (pode ser imagem/scan). Exporte o vetor em DXF/EPS.');
      return fecharDoc(doc);
    });
  }
  RTR.parsePDF=parsePDF;

  /* ═════════════ G-code (.tap .nc .gcode) ═════════════ */
  function parseGCODE(text, nome){
    var doc=novoDoc(nome,'gcode');
    var L=String(text).split(/\r\n|\r|\n/), abs=true, k=1, mode=0, x=0,y=0,z=0, f=0, ijAbs=false;
    var g={corte:0, tempo:0, rapXY:0, rapZ:0, trocas:0, ferramentas:{}, zmin:Infinity, zmax:-Infinity, semF:0, linhas:L.length, feeds:{}};
    var prevT=null, prev=[], segs=[], bb=[Infinity,Infinity,-Infinity,-Infinity];
    function rec(x0,y0,x1,y1){ if(segs.length<300000) segs.push(x0,y0,x1,y1); if(x1<bb[0])bb[0]=x1; if(x1>bb[2])bb[2]=x1; if(y1<bb[1])bb[1]=y1; if(y1>bb[3])bb[3]=y1; }
    for(var li=0;li<L.length;li++){
      var s=L[li].replace(/\([^)]*\)/g,'').replace(/;.*$/,'').toUpperCase();
      if(!/[A-Z]/.test(s)) continue;
      var w={}, gs=[], ms=[], re=/([A-Z])\s*([-+]?\d*\.?\d+)/g, m;
      while((m=re.exec(s))){ var c=m[1], v=parseFloat(m[2]); if(c==='G') gs.push(v); else if(c==='M') ms.push(v); else w[c]=v; }
      for(var gi=0;gi<gs.length;gi++){ var gv=gs[gi];
        if(gv===0||gv===1||gv===2||gv===3) mode=gv; else if(gv===20) k=25.4; else if(gv===21) k=1; else if(gv===90) abs=true; else if(gv===91) abs=false; else if(Math.abs(gv-90.1)<1e-6) ijAbs=true; else if(Math.abs(gv-91.1)<1e-6) ijAbs=false; }
      if(w.T!=null){ g.ferramentas[w.T]=1; }
      if(ms.indexOf(6)>=0){ g.trocas++; }
      if(w.F!=null){ f=w.F*k; g.feeds[Math.round(f)]=(g.feeds[Math.round(f)]||0)+1; }
      var hasXYZ=w.X!=null||w.Y!=null||w.Z!=null;
      if(!hasXYZ) continue;
      var nx=w.X!=null?(abs?w.X*k:x+w.X*k):x, ny=w.Y!=null?(abs?w.Y*k:y+w.Y*k):y, nz=w.Z!=null?(abs?w.Z*k:z+w.Z*k):z;
      if(nz<g.zmin) g.zmin=nz; if(nz>g.zmax) g.zmax=nz;
      var dx=nx-x, dy=ny-y, dz=nz-z, dxy=Math.sqrt(dx*dx+dy*dy), dist;
      if(mode===0){ g.rapXY+=dxy; g.rapZ+=Math.abs(dz); }
      else {
        if(mode===1){ dist=Math.sqrt(dxy*dxy+dz*dz); rec(x,y,nx,ny); }
        else {
          var cx, cy, r;
          if(w.R!=null){ r=Math.abs(w.R*k); var hh=Math.sqrt(Math.max(0,r*r-dxy*dxy/4)), mx=(x+nx)/2, my=(y+ny)/2, sg=((mode===2)!==(w.R<0))?-1:1;
            cx=mx+sg*(-dy/dxy)*hh; cy=my+sg*(dx/dxy)*hh; if(!dxy){ cx=x; cy=y; } }
          else { cx=(w.I!=null?(ijAbs?w.I*k:x+w.I*k):x); cy=(w.J!=null?(ijAbs?w.J*k:y+w.J*k):y); r=Math.sqrt((x-cx)*(x-cx)+(y-cy)*(y-cy)); }
          var a0=Math.atan2(y-cy,x-cx), a1=Math.atan2(ny-cy,nx-cx), da=a1-a0;
          if(mode===2){ while(da>=0) da-=2*Math.PI; } else { while(da<=0) da+=2*Math.PI; }
          if(dxy<1e-9&&w.I==null&&w.J==null) da=0;
          var arc=Math.abs(da)*r; dist=Math.sqrt(arc*arc+dz*dz);
          var nn=clamp(Math.ceil(Math.abs(da)/0.2),1,64), px=x, py=y;
          for(var q=1;q<=nn;q++){ var aa=a0+da*q/nn, qx=cx+r*Math.cos(aa), qy=cy+r*Math.sin(aa); rec(px,py,qx,qy); px=qx; py=qy; }
        }
        g.corte+=dist;
        if(f>0) g.tempo+=dist/f; else g.semF+=dist;
      }
      x=nx; y=ny; z=nz;
    }
    var nf=Object.keys(g.ferramentas).length; if(nf>1&&!g.trocas) g.trocas=nf-1;
    if(g.semF) doc.avisos.push(Math.round(g.semF)+' mm de corte sem avanço (F) definido: não entram no tempo.');
    if(g.zmin===Infinity){ g.zmin=0; g.zmax=0; }
    doc.gcode=g; doc.segs=segs; doc.bb=bb[0]===Infinity?[0,0,0,0]:bb; doc.camadas=[];
    doc.info=g.linhas+' linhas · Z de '+g.zmin.toFixed(1)+' a '+g.zmax.toFixed(1)+' mm';
    return doc;
  }
  RTR.parseGCODE=parseGCODE;

  /* ═════════════ detecção do formato ═════════════ */
  RTR.tipoDe=function(nome, u8){
    var ext=(String(nome).toLowerCase().match(/\.([a-z0-9]+)$/)||[])[1]||'';
    u8=u8?toU8(u8):null;
    if(u8&&u8.length>8&&u8[0]===0xD0&&u8[1]===0xCF&&u8[2]===0x11&&u8[3]===0xE0) return 'crv3d';
    if(u8&&u8[0]===0x25&&u8[1]===0x50&&u8[2]===0x44&&u8[3]===0x46) return 'pdf';
    if(u8&&u8[0]===0xC5&&u8[1]===0xD0&&u8[2]===0xD3&&u8[3]===0xC6) return 'eps';
    if(ext==='crv3d'||ext==='crv') return 'crv3d';
    if(ext==='dxf') return 'dxf';
    if(ext==='svg') return 'svg';
    if(ext==='pdf') return 'pdf';
    if(ext==='eps'||ext==='ps'||ext==='ai'){
      if(u8){ var head=latin1(u8.subarray(0,Math.min(u8.length,1024))); if(/^%PDF/.test(head)) return 'pdf'; }
      return 'eps';
    }
    if(/^(tap|nc|ngc|gcode|gc|cnc|iso|txt|mpf|ncc)$/.test(ext)) return 'gcode';
    if(ext==='cdr') return 'cdr';
    if(u8){ var h2=latin1(u8.subarray(0,Math.min(u8.length,512))); if(/<svg/i.test(h2)) return 'svg'; if(/^\s*0\s*[\r\n]+\s*SECTION/.test(h2)) return 'dxf'; if(/^%!PS/.test(h2)) return 'eps'; }
    return 'desconhecido';
  };
  RTR.ler=function(nome, buf, pdfjs){
    var u8=toU8(buf), tp=RTR.tipoDe(nome,u8);
    try{
      if(tp==='crv3d') return Promise.resolve(parseCRV(u8,nome));
      if(tp==='eps') return Promise.resolve(parseEPS(u8,nome));
      if(tp==='dxf') return Promise.resolve(parseDXF(decode(u8,'windows-1252'),nome));
      if(tp==='svg') return Promise.resolve(parseSVG(decode(u8,'utf-8'),nome));
      if(tp==='gcode') return Promise.resolve(parseGCODE(decode(u8,'windows-1252'),nome));
      if(tp==='pdf') return parsePDF(u8,nome,pdfjs);
      if(tp==='cdr') return Promise.reject(new Error('CorelDRAW (.cdr) é formato fechado. No Corel: Arquivo › Exportar › EPS ou DXF.'));
    }catch(e){ return Promise.reject(e); }
    return Promise.reject(new Error('Formato não reconhecido. Use crv3d, EPS, DXF, SVG, PDF ou G-code (.tap/.nc).'));
  };

  /* ═════════════ catálogo: material × operação ═════════════ */
  /* Cada preset de CORTE é um material (chapa + preço). Vinco, rebaixo e
     gravação não consomem chapa (ficam na peça do mesmo arquivo).
     Preços (R$/chapa) e chapas das tabelas da Sul Sign/PDVEX — out/2026:
     MDF e compensado: planilha Flaviense "CUSTOS - MARCENARIA" (atual. 22/10/2026)
     PVC expandido: tabela do Carlos 20/10/2026, sem película
     Acrílico: tabela do Carlos (chapa 2×1 m); cristal 3 mm da lista do ORC
     PS: lista de chapas do ORC (Drive) · ACM 3 mm: R$ 300 citado pelo Carlos 22/10
     Policarbonato: planilha "CUSTOS - POLICARBONATO" abr/2026
     Parâmetros de corte: MDF 15 vem dos .tap reais (fresa 6, F3000, rampa 1000);
     os outros são ponto de partida para calibrar. */
  var F_MDF='Flaviense, planilha atualizada 22/10/2026', F_PVC='tabela do Carlos 20/10/2026 (sem película)', F_ACR='tabela do Carlos (chapa 2×1 m)',
      F_ORC='lista de chapas do ORC (Drive)', F_POLI='planilha CUSTOS POLICARBONATO abr/2026';
  function PC(id,nome,fam,d,prof,passo,av,mg,ch,preco,fonte){
    return {id:id,nome:nome,op:'corte',fam:fam,d:d,prof:prof,passo:passo,avanco:av,mergulho:mg,fator:1.25,chapa:ch,preco:preco,fonte:fonte};
  }
  var MDF=[2750,1850], CMP=[2200,1600], PVC=[2440,1220], A21=[2000,1000];
  RTR.PRESETS=[
    PC('mdf3',   'MDF cru 3 mm',              'MDF',3.175,4,  4,  3000,1000,MDF,73, F_MDF),
    PC('mdf6',   'MDF cru 6 mm',              'MDF',6,    7,  7,  3000,1000,MDF,145,F_MDF),
    PC('mdf9',   'MDF cru 9 mm',              'MDF',6,    10, 5.4,3000,1000,MDF,179,F_MDF),
    PC('mdf12',  'MDF cru 12 mm',             'MDF',6,    13, 5.4,3000,1000,MDF,219,F_MDF),
    PC('mdf15',  'MDF cru 15 mm',             'MDF',6,    16, 5.4,3000,1000,MDF,259,F_MDF),
    PC('mdf18',  'MDF cru 18 mm',             'MDF',6,    19, 5.4,3000,1000,MDF,313,F_MDF),
    PC('mdftx15','MDF branco TX 2F 15 mm',    'MDF',6,    16, 5.4,3000,1000,MDF,229,F_MDF),
    PC('mdfu15', 'MDF ultra branco 2F 15 mm', 'MDF',6,    16, 5.4,3000,1000,MDF,302,F_MDF),
    PC('mdfn15', 'MDF naval cru 15 mm',       'MDF',6,    16, 5.4,3000,1000,MDF,279,F_MDF),
    PC('mdffx3', 'MDF flexível 3 mm',         'MDF',3.175,4,  4,  3000,1000,[2500,1220],157,F_MDF),
    PC('comp6',  'Compensado pinus 6 mm',     'Compensado',6,7, 7,  2600,1000,CMP,49, F_MDF),
    PC('comp',   'Compensado pinus 15 mm',    'Compensado',6,16,5.4,2600,1000,CMP,187,F_MDF),
    PC('comp18', 'Compensado pinus 18 mm',    'Compensado',6,19,5.4,2600,1000,CMP,230,F_MDF),
    PC('compn15','Compensado naval 15 mm',    'Compensado',6,16,5.4,2600,1000,CMP,289,F_MDF),
    PC('pvc2',   'PVC expandido 2 mm',        'PVC',3.175,2.5,2.5,3000,1000,PVC,72, F_PVC),
    PC('pvc3',   'PVC expandido 3 mm',        'PVC',3.175,3.5,3.5,3000,1000,PVC,90, F_PVC),
    PC('pvc5',   'PVC expandido 5 mm',        'PVC',3.175,5.5,5.5,3000,1000,PVC,135,F_PVC),
    PC('pvc10',  'PVC expandido 10 mm',       'PVC',6,    11, 5.5,3000,1000,PVC,216,F_PVC),
    PC('pvc15',  'PVC expandido 15 mm',       'PVC',6,    16, 5.4,3000,1000,PVC,330,F_PVC),
    PC('pvc20',  'PVC expandido 20 mm',       'PVC',6,    21, 5.4,3000,1000,PVC,444,F_PVC),
    PC('pvcp10', 'PVC preto 10 mm',           'PVC',6,    11, 5.5,3000,1000,PVC,275,F_PVC),
    PC('pvcp20', 'PVC preto 20 mm',           'PVC',6,    21, 5.4,3000,1000,PVC,545,F_PVC),
    PC('acr2',   'Acrílico branco 2 mm',      'Acrílico',3.175,2.5,2.5,2000,600,A21,262.5, F_ACR),
    PC('acr3',   'Acrílico branco 3 mm',      'Acrílico',3.175,3.5,3.5,2000,600,A21,376.25,F_ACR),
    PC('acr4',   'Acrílico branco 4 mm',      'Acrílico',3.175,4.5,4.5,2000,600,A21,497,   F_ACR),
    PC('acr5',   'Acrílico branco 5 mm',      'Acrílico',3.175,5.5,2.8,2000,600,A21,780,   F_ACR),
    PC('acr6',   'Acrílico branco 6 mm',      'Acrílico',3.175,6.5,3.3,2000,600,A21,670,   F_ACR),
    PC('acrc2',  'Acrílico cristal 2 mm',     'Acrílico',3.175,2.5,2.5,2000,600,A21,240,   F_ACR),
    PC('acrc3',  'Acrílico cristal 3 mm',     'Acrílico',3.175,3.5,3.5,2000,600,A21,300,   F_ORC),
    PC('acrc4',  'Acrílico cristal 4 mm',     'Acrílico',3.175,4.5,4.5,2000,600,A21,461,   F_ACR),
    PC('acrc5',  'Acrílico cristal 5 mm',     'Acrílico',3.175,5.5,2.8,2000,600,A21,625,   F_ACR),
    PC('acrc6',  'Acrílico cristal 6 mm',     'Acrílico',3.175,6.5,3.3,2000,600,A21,612,   F_ACR),
    PC('acre',   'Acrílico espelhado',        'Acrílico',3.175,3.5,3.5,2000,600,A21,350,   'regra do Carlos: R$ 350 a chapa'),
    PC('acm3',   'ACM 3 mm',                  'ACM',4,3.5,3.5,3000,1000,[5000,1220],300,'citado pelo Carlos 22/10 (Terzian R$ 340 na lista do ORC)'),
    PC('acm4',   'ACM 4 mm',                  'ACM',4,4.5,4.5,3000,1000,[5000,1220],0,  'sem preço no histórico'),
    PC('ps1',    'PS 1 mm',                   'PS',3.175,1.5,1.5,3000,1000,A21,        42.5,F_ORC),
    PC('ps2',    'PS 2 mm',                   'PS',3.175,2.5,2.5,3000,1000,[3000,1000],127, F_ORC),
    PC('ps3',    'PS 3 mm',                   'PS',3.175,3.5,3.5,3000,1000,[2000,1300],188, F_ORC),
    PC('psc2',   'PS cristal 2 mm',           'PS',3.175,2.5,2.5,3000,1000,A21,        118, F_ORC),
    PC('psc3',   'PS cristal 3 mm',           'PS',3.175,3.5,3.5,3000,1000,A21,        175, F_ORC),
    PC('poli',   'Policarbonato compacto 3 mm','Policarbonato',3.175,3.5,3.5,2500,800,[3000,2050],791.98, F_POLI),
    PC('poli4',  'Policarbonato compacto 4 mm','Policarbonato',3.175,4.5,4.5,2500,800,[3000,2050],1196.74,F_POLI),
    PC('polia4', 'Policarbonato alveolar 4 mm','Policarbonato',3.175,4.5,4.5,3000,1000,[6000,2100],386.5, F_POLI),
    PC('polia6', 'Policarbonato alveolar 6 mm','Policarbonato',3.175,6.5,6.5,3000,1000,[6000,2100],570.45,F_POLI),
    {id:'acmv', nome:'ACM · vinco V 90°',        op:'vinco',   fam:'Vinco e usinagem', d:0, prof:3.2, passo:3.2, avanco:3000, mergulho:1000, fator:1.25},
    {id:'reb',  nome:'Rebaixo / pocket 5 mm',    op:'rebaixo', fam:'Vinco e usinagem', d:6, prof:5,   passo:5,   avanco:3000, mergulho:1000, step:40, fator:1.25},
    {id:'grav', nome:'Gravação / marcação 1 mm', op:'grav',    fam:'Vinco e usinagem', d:0, prof:1,   passo:1,   avanco:3000, mergulho:1000, fator:1.25},
    {id:'ign',  nome:'— não cortar (ignorar) —', op:'ignorar', fam:'Ignorar'}
  ];
  RTR.FAMILIAS=['MDF','Compensado','PVC','Acrílico','ACM','PS','Policarbonato','Outros','Vinco e usinagem','Ignorar'];
  RTR.CORFAM={'MDF':'#B7791F','Compensado':'#8D6E63','PVC':'#2563EB','Acrílico':'#0E9AA7','ACM':'#6B7280','PS':'#7C3AED','Policarbonato':'#059669','Outros':'#FF5A1F'};
  RTR.MAQ={rapidoXY:10000, rapidoZ:3000, zSeguro:10, trocaMin:3, setupMin:10, progMin:30, fatorGcode:1.15, margem:10, folga:4};
  RTR.COB={valorML:8, maqML:3, horaOp:35, horaProg:60, modoMat:'inteira'};

  /* palpite de preset pelo nome do arquivo e da camada */
  function up(s){ return String(s||'').toUpperCase().replace(/_/g,' ').replace(/[ÁÀÃÂ]/g,'A').replace(/[ÉÊ]/g,'E').replace(/Í/g,'I').replace(/[ÓÕÔ]/g,'O').replace(/Ú/g,'U').replace(/Ç/g,'C'); }
  function espDe(s,w){
    var m=new RegExp(w+'(?:\\W{1,3}[A-Z]{2,12}){0,2}\\W{0,3}(\\d{1,2}(?:[.,]\\d)?)\\s*MM').exec(s)||new RegExp(w+'\\W{0,2}(\\d{1,2})(?![\\d.,A-Z])').exec(s)||/(?:^|[^\d.,X])(\d{1,2}(?:[.,]\d)?)\s*MM/.exec(s);
    return m?parseFloat(m[1].replace(',','.')):0;
  }
  function perto(n,tab,def){
    if(!n) return tab[def];
    var best=null, bd=Infinity; Object.keys(tab).forEach(function(k){ var dd=Math.abs(+k-n); if(dd<bd){ bd=dd; best=tab[k]; } }); return best;
  }
  function matDe(s){
    if(!s) return null;
    var n;
    if(/\bACM\b/.test(s)){ n=espDe(s,'ACM'); return (n>=3.6||(!n&&/VINCO|\b3D\b/.test(s)))?'acm4':'acm3'; }
    if(/ACRILICO/.test(s)){
      n=espDe(s,'ACRILICO');
      if(/ESPELH/.test(s)) return 'acre';
      if(/CRISTAL|TRANSPAR/.test(s)) return perto(n,{2:'acrc2',3:'acrc3',4:'acrc4',5:'acrc5',6:'acrc6'},3);
      return perto(n,{2:'acr2',3:'acr3',4:'acr4',5:'acr5',6:'acr6'},3);
    }
    if(/POLICARBONATO/.test(s)){ n=espDe(s,'POLICARBONATO'); if(/ALVEOLAR/.test(s)) return n>=5?'polia6':'polia4'; return n>=3.6?'poli4':'poli'; }
    if(/\bPVC\b/.test(s)){
      n=espDe(s,'PVC');
      if(/PRETO/.test(s)&&(n>=15)) return 'pvcp20';
      if(/PRETO/.test(s)&&(!n||(n>=8&&n<15))) return 'pvcp10';
      return perto(n,{2:'pvc2',3:'pvc3',5:'pvc5',10:'pvc10',15:'pvc15',20:'pvc20'},10);
    }
    if(/\bPS\b/.test(s)){ n=espDe(s,'PS'); if(/CRISTAL/.test(s)) return n>=2.6?'psc3':'psc2'; return perto(n,{1:'ps1',2:'ps2',3:'ps3'},2); }
    if(/COMPENSADO/.test(s)){ n=espDe(s,'COMPENSADO'); if(/NAVAL/.test(s)) return 'compn15'; return perto(n,{6:'comp6',15:'comp',18:'comp18'},15); }
    if(/\bMDF/.test(s)){
      n=espDe(s,'MDF');
      if(/FLEX/.test(s)) return 'mdffx3';
      if(/ULTRA/.test(s)&&/BRANCO/.test(s)) return 'mdfu15';
      if(/NAVAL/.test(s)) return 'mdfn15';
      if(/BRANCO|\bTX\b/.test(s)&&(!n||n===15)) return 'mdftx15';
      return perto(n,{3:'mdf3',6:'mdf6',9:'mdf9',12:'mdf12',15:'mdf15',18:'mdf18'},15);
    }
    if(/GABARITO/.test(s)) return 'mdf3';
    return null;
  }
  RTR.palpite=function(arquivo, camada){
    var c=up(camada), a=up(arquivo);
    if(/DEFPOINTS|COTA|CHAMADA|TEXTO|INSTRU|LEGENDA|CARIMBO|VIEWPORT|REFER|MOLDURA|^GR /.test(c)) return 'ign';
    if(/VINCO|DOBRA|V-?GROOVE|V ?90/.test(c)) return 'acmv';
    if(/REBAIX|POCKET|CANALETA/.test(c)) return 'reb';
    if(/GRAV|MARCA/.test(c)) return 'grav';
    return matDe(c)||matDe(a);
  };

  /* ═════════════ cálculo ═════════════ */
  function aninhamento(cts){
    /* profundidade de cada contorno fechado: par = externo, ímpar = furo */
    var fech=cts.filter(function(c){ return c.c; }).sort(function(a,b){ return Math.abs(b.a)-Math.abs(a.a); });
    fech.forEach(function(c,i){
      var dpt=0, px=c.p[0], py=c.p[1];
      for(var j=0;j<i;j++){ var o=fech[j], bb=o.bb;
        if(px<bb[0]||px>bb[2]||py<bb[1]||py>bb[3]) continue;
        if(Math.abs(o.a)<=Math.abs(c.a)) continue;
        if(pip(o.p,px,py)) dpt++; }
      c.nivel=dpt;
    });
  }
  function pip(p,x,y){
    var ins=false;
    for(var i=0,j=p.length-2;i<p.length;j=i,i+=2){
      var xi=p[i],yi=p[i+1],xj=p[j],yj=p[j+1];
      if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi)) ins=!ins;
    }
    return ins;
  }
  /* rota dos deslocamentos em vazio: vizinho mais próximo */
  function rota(cts, sx, sy){
    var n=cts.length, used=new Array(n), x=sx, y=sy, tot=0;
    if(!n) return {dist:0,x:x,y:y};
    var cx=cts.map(function(c){ return (c.bb[0]+c.bb[2])/2; }), cy=cts.map(function(c){ return (c.bb[1]+c.bb[3])/2; });
    if(n>2500){ /* arquivo enorme: ordem em serpentina por faixas */
      var ord=cts.map(function(c,i){ return i; }), band=Math.max(50,(Math.max.apply(null,cy)-Math.min.apply(null,cy))/40||50);
      ord.sort(function(a,b){ var ba=Math.floor(cy[a]/band), bb=Math.floor(cy[b]/band); if(ba!==bb) return ba-bb; return (ba%2?-1:1)*(cx[a]-cx[b]); });
      ord.forEach(function(i){ var c=cts[i], dx=c.p[0]-x, dy=c.p[1]-y; tot+=Math.sqrt(dx*dx+dy*dy); var m=c.p.length; x=c.c?c.p[0]:c.p[m-2]; y=c.c?c.p[1]:c.p[m-1]; });
      return {dist:tot,x:x,y:y};
    }
    for(var k=0;k<n;k++){
      var best=-1, bd=Infinity;
      for(var i=0;i<n;i++){ if(used[i]) continue; var ddx=cx[i]-x, ddy=cy[i]-y, dd=ddx*ddx+ddy*ddy; if(dd<bd){ bd=dd; best=i; } }
      used[best]=true;
      var c=cts[best], p=c.p, m=p.length, ex, ey, d0;
      if(c.c){ /* entra pelo nó mais próximo */
        var stp=Math.max(2,2*Math.floor(m/64)), bi=0, bv=Infinity;
        for(var q=0;q<m;q+=stp){ var qx=p[q]-x, qy=p[q+1]-y, qv=qx*qx+qy*qy; if(qv<bv){ bv=qv; bi=q; } }
        d0=Math.sqrt(bv); ex=p[bi]; ey=p[bi+1];
      } else {
        var a1=(p[0]-x)*(p[0]-x)+(p[1]-y)*(p[1]-y), a2=(p[m-2]-x)*(p[m-2]-x)+(p[m-1]-y)*(p[m-1]-y);
        if(a1<=a2){ d0=Math.sqrt(a1); ex=p[m-2]; ey=p[m-1]; } else { d0=Math.sqrt(a2); ex=p[0]; ey=p[1]; }
      }
      tot+=d0; x=ex; y=ey;
    }
    return {dist:tot,x:x,y:y};
  }
  RTR._rota=rota;

  /* ═════════════ encaixe nas chapas (consumo por material) ═════════════ */
  /* casco convexo (monotone chain) de uma lista plana [x,y,x,y…] */
  function hull(p){
    var n=p.length/2, pts=new Array(n), i;
    for(i=0;i<n;i++) pts[i]=[p[2*i],p[2*i+1]];
    pts.sort(function(a,b){ return a[0]-b[0]||a[1]-b[1]; });
    function cr(o,a,b){ return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]); }
    var lo=[], hi=[];
    for(i=0;i<n;i++){ while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],pts[i])<=0) lo.pop(); lo.push(pts[i]); }
    for(i=n-1;i>=0;i--){ while(hi.length>=2&&cr(hi[hi.length-2],hi[hi.length-1],pts[i])<=0) hi.pop(); hi.push(pts[i]); }
    hi.pop(); lo.pop();
    return lo.concat(hi);
  }
  /* retângulo envolvente girado em ang: x'=x·cos+y·sin ; y'=−x·sin+y·cos */
  function rectAt(h,ang){
    var co=Math.cos(ang), si=Math.sin(ang), x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(var i=0;i<h.length;i++){ var x=h[i][0]*co+h[i][1]*si, y=-h[i][0]*si+h[i][1]*co; if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
    return {ang:ang,w:x1-x0,h:y1-y0,minx:x0,miny:y0,area:(x1-x0)*(y1-y0)};
  }
  /* menor retângulo que contém a peça (calipers rotativos); fica reto se a diferença for < 1% */
  function minRect(h){
    if(!h.length) return {ang:0,w:0,h:0,minx:0,miny:0,area:0};
    var aa=rectAt(h,0), best=aa;
    for(var i=0;i<h.length;i++){
      var a=h[i], b=h[(i+1)%h.length], dx=b[0]-a[0], dy=b[1]-a[1];
      if(dx*dx+dy*dy<1e-12) continue;
      var r=rectAt(h,Math.atan2(dy,dx));
      if(r.area<best.area-1e-9||(best.area<1e-9&&r.w+r.h<best.w+best.h-1e-9)) best=r;
    }
    if(aa.area<=best.area*1.01+1e-9&&(aa.area>1e-9||aa.w+aa.h<=best.w+best.h+1e-9)) best=aa;
    return best;
  }
  RTR._minRect=function(p){ return minRect(hull(p)); };
  function contem(P,Q){ /* P contém Q? 3 pontos de Q, maioria */
    var m=Q.length/2, ks=[0,Math.floor(m/3),Math.floor(2*m/3)], dent=0;
    for(var i=0;i<3;i++){ var k=2*ks[i]; if(pip(P,Q[k],Q[k+1])) dent++; }
    return dent>=2;
  }
  /* peças de um grupo de contornos (mesmo material, mesmo arquivo):
     contorno de nível 0 = peça; furos e ilhas vão junto com ela */
  function pecasDe(cts){
    var fe=[], ab=[], i, j;
    cts.forEach(function(c){ if(c.c&&Math.abs(c.a)>1e-6) fe.push(c); else ab.push(c); });
    fe.sort(function(a,b){ return Math.abs(b.a)-Math.abs(a.a); });
    var n=fe.length, niv=new Array(n), topo=new Array(n), pcs=[], idx={};
    for(i=0;i<n;i++){
      var c=fe[i], par=-1;
      for(j=i-1;j>=0;j--){
        var o=fe[j], bb=o.bb;
        if(c.bb[0]<bb[0]-1e-6||c.bb[2]>bb[2]+1e-6||c.bb[1]<bb[1]-1e-6||c.bb[3]>bb[3]+1e-6) continue;
        if(Math.abs(o.a)<=Math.abs(c.a)) continue;
        if(contem(o.p,c.p)){ par=j; break; }
      }
      if(par<0){ niv[i]=0; topo[i]=i; idx[i]=pcs.length; pcs.push({ext:c, membros:[c], area:Math.abs(c.a)}); }
      else { niv[i]=niv[par]+1; topo[i]=topo[par]; var pc=pcs[idx[topo[i]]]; pc.membros.push(c); pc.area+=(niv[i]%2?-1:1)*Math.abs(c.a); }
    }
    ab.forEach(function(c){
      var px=c.p[0], py=c.p[1], dono=null;
      for(var k=0;k<pcs.length&&!dono;k++){ var e=pcs[k].ext, bb=e.bb; if(!e.c||px<bb[0]||px>bb[2]||py<bb[1]||py>bb[3]) continue; if(pip(e.p,px,py)) dono=pcs[k]; }
      if(dono) dono.membros.push(c); else pcs.push({ext:c, membros:[c], area:0, aberto:true});
    });
    pcs.forEach(function(pc){ if(!pc.ext._mr) pc.ext._mr=minRect(hull(pc.ext.p)); pc.mr=pc.ext._mr; if(pc.area<0) pc.area=0; });
    return pcs;
  }
  RTR._pecasDe=pecasDe;

  /* MaxRects (Jylänki): BSSF para encher, BL (mais à esquerda) para compactar a última chapa */
  function Bin(W,H){ this.W=W; this.H=H; this.free=[{x:0,y:0,w:W,h:H}]; this.pl=[]; this.livre=W*H; }
  Bin.prototype.melhor=function(w,h,modo){
    var best=null, F=this.free;
    for(var i=0;i<F.length;i++){
      var f=F[i];
      for(var o=0;o<2;o++){
        var ww=o?h:w, hh=o?w:h;
        if(ww<=f.w+1e-6&&hh<=f.h+1e-6){
          var s1, s2;
          if(modo==='bl'){ s1=f.x+ww; s2=f.y; } else { var lw=f.w-ww, lh=f.h-hh; s1=Math.min(lw,lh); s2=Math.max(lw,lh); }
          if(!best||s1<best.s1-1e-9||(Math.abs(s1-best.s1)<=1e-9&&s2<best.s2)) best={x:f.x,y:f.y,w:ww,h:hh,rot:!!o,s1:s1,s2:s2};
        }
        if(Math.abs(w-h)<1e-9) break;
      }
    }
    return best;
  };
  function dentro(a,b){ return a.x>=b.x-1e-9&&a.y>=b.y-1e-9&&a.x+a.w<=b.x+b.w+1e-9&&a.y+a.h<=b.y+b.h+1e-9; }
  Bin.prototype.colocar=function(s,k){
    var R={x:s.x,y:s.y,w:s.w,h:s.h}, F=this.free, nov=[], i, a, b;
    for(i=0;i<F.length;){
      var f=F[i];
      if(R.x>=f.x+f.w-1e-9||R.x+R.w<=f.x+1e-9||R.y>=f.y+f.h-1e-9||R.y+R.h<=f.y+1e-9){ i++; continue; }
      F.splice(i,1);
      if(R.x>f.x+1e-9) nov.push({x:f.x,y:f.y,w:R.x-f.x,h:f.h});
      if(R.x+R.w<f.x+f.w-1e-9) nov.push({x:R.x+R.w,y:f.y,w:f.x+f.w-R.x-R.w,h:f.h});
      if(R.y>f.y+1e-9) nov.push({x:f.x,y:f.y,w:f.w,h:R.y-f.y});
      if(R.y+R.h<f.y+f.h-1e-9) nov.push({x:f.x,y:R.y+R.h,w:f.w,h:f.y+f.h-R.y-R.h});
    }
    for(i=0;i<nov.length;i++) F.push(nov[i]);
    for(a=0;a<F.length;a++){
      for(b=a+1;b<F.length;b++){
        if(dentro(F[a],F[b])){ F.splice(a,1); a--; break; }
        if(dentro(F[b],F[a])){ F.splice(b,1); b--; }
      }
    }
    this.pl.push({k:k,x:s.x,y:s.y,w:s.w,h:s.h,rot:s.rot});
    this.livre-=s.w*s.h;
  };
  function maxX(pl){ var m=0; pl.forEach(function(p){ if(p.x+p.w>m) m=p.x+p.w; }); return m; }
  /* rects: [{k,w,h}] já com a folga; Wu×Hu: área útil + folga */
  /* muitas peças (> 2500): prateleiras (rápido, um pouco menos eficiente) */
  function prateleiras(rects,Wu,Hu){
    var bins=[];
    rects.forEach(function(r){ r.rot=false; if(r.h>r.w&&r.h<=Wu+1e-6&&r.w<=Hu+1e-6){ var t=r.w; r.w=r.h; r.h=t; r.rot=true; } });
    rects.sort(function(a,b){ return (b.h-a.h)||(b.w-a.w); });
    rects.forEach(function(r){
      var feito=false;
      for(var i=Math.max(0,bins.length-2);i<bins.length&&!feito;i++){
        var b=bins[i];
        for(var j=0;j<b.sh.length&&!feito;j++){ var sh=b.sh[j]; if(r.h<=sh.h+1e-6&&sh.x+r.w<=Wu+1e-6){ b.pl.push({k:r.k,x:sh.x,y:sh.y,w:r.w,h:r.h,rot:r.rot}); sh.x+=r.w; b.livre-=r.w*r.h; feito=true; } }
        if(!feito&&b.top+r.h<=Hu+1e-6){ b.sh.push({y:b.top,h:r.h,x:r.w}); b.pl.push({k:r.k,x:0,y:b.top,w:r.w,h:r.h,rot:r.rot}); b.top+=r.h; b.livre-=r.w*r.h; feito=true; }
      }
      if(!feito){ var nb={sh:[{y:0,h:r.h,x:r.w}],top:r.h,pl:[{k:r.k,x:0,y:0,w:r.w,h:r.h,rot:r.rot}],livre:Wu*Hu-r.w*r.h}; bins.push(nb); }
    });
    return bins;
  }
  function empacotar(rects,Wu,Hu){
    var bins=[], grandes=[], rapido=rects.length>2500;
    if(rapido){
      var cabem=[];
      rects.forEach(function(r){
        var cabe=(r.w<=Wu+1e-6&&r.h<=Hu+1e-6)||(r.h<=Wu+1e-6&&r.w<=Hu+1e-6);
        if(cabe) cabem.push(r); else { var n1=Math.ceil(r.w/Wu-1e-9)*Math.ceil(r.h/Hu-1e-9), n2=Math.ceil(r.h/Wu-1e-9)*Math.ceil(r.w/Hu-1e-9); grandes.push({k:r.k,n:Math.max(1,Math.min(n1,n2))}); }
      });
      return {bins:prateleiras(cabem,Wu,Hu), grandes:grandes};
    }
    rects.sort(function(a,b){ var ma=Math.max(a.w,a.h), mb=Math.max(b.w,b.h); return (mb-ma)||(b.w*b.h-a.w*a.h); });
    rects.forEach(function(r){
      var cabe=(r.w<=Wu+1e-6&&r.h<=Hu+1e-6)||(r.h<=Wu+1e-6&&r.w<=Hu+1e-6);
      if(!cabe){
        var n1=Math.ceil(r.w/Wu-1e-9)*Math.ceil(r.h/Hu-1e-9), n2=Math.ceil(r.h/Wu-1e-9)*Math.ceil(r.w/Hu-1e-9);
        grandes.push({k:r.k,n:Math.max(1,Math.min(n1,n2))}); return;
      }
      var best=null, i0=rapido?Math.max(0,bins.length-3):0;
      for(var i=i0;i<bins.length;i++){
        var b=bins[i]; if(b.livre<r.w*r.h-1e-6) continue;
        var s=b.melhor(r.w,r.h,'bssf');
        if(s&&(!best||s.s1<best.s.s1-1e-9||(Math.abs(s.s1-best.s.s1)<=1e-9&&s.s2<best.s.s2))) best={b:b,s:s};
      }
      if(!best){ var nb=new Bin(Wu,Hu); bins.push(nb); best={b:nb,s:nb.melhor(r.w,r.h,'bssf')}; }
      best.b.colocar(best.s,r.k);
    });
    /* a chapa mais vazia vai por último e é compactada para a esquerda (sobra contínua) */
    if(bins.length){
      var iv=0; bins.forEach(function(b,i){ if(b.livre>bins[iv].livre) iv=i; });
      var ult=bins.splice(iv,1)[0], rs=ult.pl.map(function(p){ return {k:p.k,w:p.rot?p.h:p.w,h:p.rot?p.w:p.h}; });
      rs.sort(function(a,b){ var ma=Math.max(a.w,a.h), mb=Math.max(b.w,b.h); return (mb-ma)||(b.w*b.h-a.w*a.h); });
      var nb2=new Bin(Wu,Hu), ok=true;
      for(var j=0;j<rs.length&&ok;j++){ var s2=nb2.melhor(rs[j].w,rs[j].h,'bl'); if(!s2) ok=false; else nb2.colocar(s2,rs[j].k); }
      bins.push(ok&&maxX(nb2.pl)<=maxX(ult.pl)+1e-6?nb2:ult);
    }
    return {bins:bins, grandes:grandes};
  }

  /* custo do material conforme o modo: inteira | usada | envolvente */
  function custoMat(m,modo){
    if(m.reuso||!(m.preco>0)) return 0;
    var ach=m.W*m.H/1e6;
    if(modo==='envolvente') return ach>0?m.areaEnv/ach*m.preco:0;
    if(modo==='usada') return (m.ovr||m.chapasUsadas)*m.preco;
    return m.n*m.preco;
  }
  RTR.custoMat=custoMat;

  /* itens: [{id, doc, qtd, ops, mat (G-code)}] · opt: {ovr:{mat:n}, reuso:{mat:true}, modo} */
  RTR.consumo=function(itens,cfg,opt){
    opt=opt||{};
    var P=cfg.presets, M=cfg.maq, mats={}, ordem=[], semPeca=[];
    var margem=Math.max(0,num(M.margem)), folga=Math.max(0,num(M.folga));
    function grupo(pid){
      if(!mats[pid]){
        var pr=P[pid], ch=(pr.chapa||[2750,1850]).slice(0,2).map(num);
        if(ch[1]>ch[0]) ch=[ch[1],ch[0]];
        mats[pid]={id:pid, nome:pr.nome, fam:pr.fam||'Outros', W:ch[0], H:ch[1], preco:num(pr.preco), fonte:pr.fonte||'', d:num(pr.d)||0,
          pecas:[], fixos:[], arqs:{}, nVet:0, areaLiq:0, areaEnv:0, nPecas:0, aprox:false};
        ordem.push(pid);
      }
      return mats[pid];
    }
    itens.forEach(function(it){
      var d=it.doc, q=Math.max(1,Math.round(num(it.qtd))||1);
      if(d.formato==='gcode'){
        var mid=it.mat, pr=P[mid], bb=d.bb;
        if(pr&&pr.op==='corte'&&bb&&bb[2]>bb[0]&&bb[3]>bb[1]){
          var g0=grupo(mid), w=bb[2]-bb[0], h=bb[3]-bb[1];
          g0.pecas.push({it:it.id, q:q, gcode:true, area:w*h, membros:[], mr:{ang:0,w:w,h:h,minx:bb[0],miny:bb[1],area:w*h}});
          g0.arqs[it.id]=1; g0.areaLiq+=w*h*q/1e6; g0.areaEnv+=w*h*q/1e6; g0.nPecas+=q; g0.aprox=true;
        } else semPeca.push({it:it.id,q:q});
        return;
      }
      var grupos={}, trabalho=false;
      d.contornos.forEach(function(ct){
        if(ct.off) return;
        var pid=(it.ops&&it.ops[ct.L])||'mdf15', pr2=P[pid];
        if(!pr2||pr2.op==='ignorar') return;
        trabalho=true;
        if(pr2.op!=='corte') return;
        (grupos[pid]=grupos[pid]||[]).push(ct);
      });
      var ks=Object.keys(grupos);
      if(!ks.length){ if(trabalho) semPeca.push({it:it.id,q:q}); return; }
      ks.forEach(function(pid){
        var g=grupo(pid), cts=grupos[pid], pcs=pecasDe(cts), liq=0, env=0;
        pcs.forEach(function(pc){ liq+=pc.area; env+=pc.mr.w*pc.mr.h; });
        g.arqs[it.id]=1; g.nVet+=cts.length*q; g.areaLiq+=liq*q/1e6; g.areaEnv+=env*q/1e6; g.nPecas+=pcs.length*q;
        /* job do Aspire do tamanho da chapa e tudo dentro dele = já encaixado: 1 chapa por unidade */
        var ch=d.chapa, fixo=false;
        if(ch&&ch.w>0&&ch.h>0&&d.formato==='crv3d'){
          var cw=Math.max(ch.w,ch.h), chh=Math.min(ch.w,ch.h);
          if(Math.abs(cw-g.W)<=g.W*0.015&&Math.abs(chh-g.H)<=g.H*0.015){
            var gb=[Infinity,Infinity,-Infinity,-Infinity];
            fixo=cts.every(function(c){ if(c.bb[0]<gb[0])gb[0]=c.bb[0]; if(c.bb[1]<gb[1])gb[1]=c.bb[1]; if(c.bb[2]>gb[2])gb[2]=c.bb[2]; if(c.bb[3]>gb[3])gb[3]=c.bb[3];
              return c.bb[0]>=-0.5&&c.bb[1]>=-0.5&&c.bb[2]<=ch.w+0.5&&c.bb[3]<=ch.h+0.5; });
            /* só vale como encaixe pronto se as peças ocupam boa parte da chapa (job padrão com peça pequena é re-encaixado) */
            if(fixo&&(gb[2]-gb[0])*(gb[3]-gb[1])<0.6*ch.w*ch.h&&liq<0.35*ch.w*ch.h) fixo=false;
          }
        }
        if(fixo) g.fixos.push({it:it.id, q:q, pcs:pcs, jw:ch.w, jh:ch.h, liq:liq});
        else pcs.forEach(function(pc){ pc.it=it.id; pc.q=q; g.pecas.push(pc); });
      });
    });
    var modo=opt.modo||(cfg.cob&&cfg.cob.modoMat)||'inteira';
    var lista=ordem.map(function(pid){
      var g=mats[pid], gap=g.d+folga, Wu=Math.max(1,g.W-2*margem+gap), Hu=Math.max(1,g.H-2*margem+gap), folhas=[], nGr=0, nFix=0;
      function so(id){ var o={}; o[id]=1; return o; }
      g.fixos.forEach(function(fx){ for(var u=0;u<fx.q;u++){ folhas.push({fixo:true, it:fx.it, arqs:so(fx.it), pcs:fx.pcs, jw:fx.jw, jh:fx.jh, liq:fx.liq}); nFix++; } });
      var rects=[];
      g.pecas.forEach(function(pc,k){ for(var c=0;c<pc.q;c++) rects.push({k:k,w:pc.mr.w+gap,h:pc.mr.h+gap}); });
      var pk=empacotar(rects,Wu,Hu);
      pk.grandes.forEach(function(gr){ var pc=g.pecas[gr.k]; for(var t=0;t<gr.n;t++) folhas.push({grande:true, k:gr.k, parte:t+1, de:gr.n, arqs:so(pc.it), liq:t?0:pc.area}); nGr++; });
      pk.bins.forEach(function(b){ var arqs={}, liq=0; b.pl.forEach(function(p){ arqs[g.pecas[p.k].it]=1; liq+=g.pecas[p.k].area; }); folhas.push({pl:b.pl, arqs:arqs, liq:liq}); });
      var n=folhas.length, frac=1, sobra=null;
      if(pk.bins.length){
        var ul=pk.bins[pk.bins.length-1], usado=Math.min(g.W,margem+maxX(ul.pl));
        frac=g.W>0?usado/g.W:1;
        if(g.W-usado>50) sobra={w:g.W-usado,h:g.H};
      }
      var m={id:pid, nome:g.nome, fam:g.fam, W:g.W, H:g.H, preco:g.preco, fonte:g.fonte, gap:gap, margem:margem,
        chapasAuto:n, ultimaFrac:pk.bins.length?frac:null, chapasUsadas:pk.bins.length?(n-1+frac):n, sobra:sobra,
        pecas:g.nPecas, nVet:g.nVet, areaLiq:g.areaLiq, areaEnv:g.areaEnv, grandes:nGr, fixas:nFix, aprox:g.aprox,
        folhas:folhas, defs:g.pecas, arqs:g.arqs};
      var ov=opt.ovr&&Math.round(num(opt.ovr[pid]))>0?Math.round(num(opt.ovr[pid])):0;
      m.ovr=ov; m.n=ov||n; m.reuso=!!(opt.reuso&&opt.reuso[pid]);
      m.aprov=m.n?m.areaLiq/(m.n*g.W*g.H/1e6):0;
      m.custo=custoMat(m,modo); m.modo=modo;
      return m;
    });
    return {materiais:lista, semPeca:semPeca, modo:modo};
  };

  /* itens: [{id, doc, qtd, ops:{camada: presetId}, mat}] · cfg: {presets, maq, cob} · opt: ver RTR.consumo */
  RTR.calcular=function(itens, cfg, opt){
    opt=opt||{};
    var P=cfg.presets, M=cfg.maq, B=cfg.cob, R={camadas:[], arquivos:[], materiais:[], tot:null};
    var T={ml:0, mlCobrado:0, contornos:0, corte:0, mergulho:0, rapido:0, troca:0, maquina:0, setup:0, prog:0, total:0,
           chapas:0, cargas:0, areaPecas:0, gcode:0, custoMaterial:0};
    var ferrDe={}, porId={};
    itens.forEach(function(it){
      var d=it.doc, q=Math.max(1,num(it.qtd)||1), A={id:it.id, nome:d.nome, formato:d.formato, qtd:q, ml:0, mlCobrado:0, tempo:0, maquina:0, chapas:0, prog:0, troca:0};
      porId[it.id]=A; ferrDe[it.id]={};
      if(d.formato==='gcode'){
        var g=d.gcode, tm=(g.tempo+g.rapXY/M.rapidoXY+g.rapZ/M.rapidoZ)*(M.fatorGcode||1), tr=(g.trocas||0)*M.trocaMin;
        A.maquina=(tm+tr)*q; A.troca=tr*q; A.tempo=A.maquina;
        A.gcode={corte:g.corte, tempoCorte:g.tempo, rapXY:g.rapXY, rapZ:g.rapZ, trocas:g.trocas};
        T.gcode+=A.maquina; T.maquina+=A.maquina; T.troca+=A.troca;
        R.arquivos.push(A); return;
      }
      var ferr={}, ativos=[];
      d.contornos.forEach(function(ct){ if(ct.off) return; var pid=(it.ops&&it.ops[ct.L])||'mdf15', pr=P[pid]; if(!pr||pr.op==='ignorar') return; ativos.push(ct); });
      aninhamento(ativos);
      var bbA=[Infinity,Infinity,-Infinity,-Infinity], area=0;
      ativos.forEach(function(ct){ if(ct.bb[0]<bbA[0])bbA[0]=ct.bb[0]; if(ct.bb[1]<bbA[1])bbA[1]=ct.bb[1]; if(ct.bb[2]>bbA[2])bbA[2]=ct.bb[2]; if(ct.bb[3]>bbA[3])bbA[3]=ct.bb[3];
        if(ct.c) area+=(ct.nivel%2?-1:1)*Math.abs(ct.a); });
      A.areaPecas=Math.max(0,area)*q/1e6;
      A.bbox=ativos.length?[bbA[2]-bbA[0], bbA[3]-bbA[1]]:[0,0];
      var x=0, y=0;
      (d.camadas||[]).forEach(function(cm){
        var pid=(it.ops&&it.ops[cm.nome])||'mdf15', pr=P[pid]||P.mdf15;
        var cts=d.contornos.filter(function(c){ return c.L===cm.nome&&!c.off; });
        var Lv=0; cts.forEach(function(c){ Lv+=c.len; });
        var lin={arquivo:it.id, nomeArquivo:d.nome, camada:cm.nome, preset:pid, op:pr.op, n:cts.length, ml:Lv*q/1000, passadas:0, tempo:0, corte:0, mergulho:0, rapido:0};
        A.ml+=Lv*q/1000;
        if(pr.op==='ignorar'||!cts.length){ R.camadas.push(lin); return; }
        var passes=(pr.op==='vinco'||pr.op==='grav')?1:Math.max(1,Math.ceil(num(pr.prof)/Math.max(0.1,num(pr.passo))-1e-9));
        var dd=num(pr.d), trilha=0;
        if(pr.op==='corte'){ cts.forEach(function(c){ trilha+=c.c?Math.max(0,c.len+(c.nivel%2?-1:1)*Math.PI*dd):c.len; }); }
        else if(pr.op==='rebaixo'){ var ar=0; cts.forEach(function(c){ if(c.c) ar+=(c.nivel%2?-1:1)*Math.abs(c.a); }); ar=Math.max(0,ar); trilha=ar/Math.max(0.5,dd*num(pr.step||40)/100)+Lv; }
        else trilha=Lv;
        var tc=passes*trilha/Math.max(1,num(pr.avanco));
        var tm2=cts.length*num(pr.prof)/Math.max(1,num(pr.mergulho));
        var rt=rota(cts,x,y); x=rt.x; y=rt.y;
        var tr2=rt.dist/Math.max(1,M.rapidoXY)+cts.length*2*M.zSeguro/Math.max(1,M.rapidoZ);
        var f=num(pr.fator)||1;
        lin.passadas=passes; lin.corte=tc*f*q; lin.mergulho=tm2*f*q; lin.rapido=tr2*f*q; lin.tempo=(tc+tm2+tr2)*f*q; lin.trilha=trilha*passes*q/1000;
        A.maquina+=lin.tempo; A.mlCobrado+=Lv*q/1000; ferr[(pr.op==='vinco'?'V':'')+dd]=1;
        T.corte+=lin.corte; T.mergulho+=lin.mergulho; T.rapido+=lin.rapido;
        R.camadas.push(lin);
      });
      ferrDe[it.id]=ferr;
      A.prog=ativos.length?M.progMin:0;
      A.tempo=A.maquina+A.prog;
      T.ml+=A.ml; T.mlCobrado+=A.mlCobrado; T.contornos+=ativos.length*q; T.maquina+=A.maquina; T.prog+=A.prog; T.areaPecas+=A.areaPecas;
      R.arquivos.push(A);
    });
    /* chapas: encaixe por material; troca de fresa por chapa (ferramentas dos arquivos nela) */
    var C=RTR.consumo(itens,cfg,opt);
    C.materiais.forEach(function(m){
      m.folhas.forEach(function(fo){
        var tools={};
        Object.keys(fo.arqs).forEach(function(id){ Object.keys(ferrDe[id]||{}).forEach(function(t){ tools[t]=1; }); if(porId[id]) porId[id].chapas++; });
        var tc=Math.max(0,Object.keys(tools).length-1)*M.trocaMin; T.troca+=tc; T.maquina+=tc;
      });
      T.chapas+=m.n; T.cargas+=m.n; T.custoMaterial+=m.custo;
    });
    C.semPeca.forEach(function(sp){
      var nf=Object.keys(ferrDe[sp.it]||{}).length, tc=Math.max(0,nf-1)*sp.q*M.trocaMin;
      T.troca+=tc; T.maquina+=tc; T.cargas+=sp.q;
    });
    if(!T.cargas&&T.maquina>0) T.cargas=1;
    T.setup=T.cargas*M.setupMin;
    T.total=T.maquina+T.setup+T.prog;
    T.valorRouter=T.mlCobrado*B.valorML;
    T.parteMaqPDVEX=T.mlCobrado*B.maqML;
    T.custoMO=(T.maquina+T.setup)/60*B.horaOp+T.prog/60*B.horaProg;
    R.materiais=C.materiais; R.modoMat=C.modo;
    R.tot=T;
    return R;
  };

  /* minutos → "1h 25min" */
  RTR.hm=function(min){
    min=Math.round(min||0); if(min<60) return min+' min';
    var h=Math.floor(min/60), m=min%60; return h+'h'+(m?(' '+(m<10?'0':'')+m+'min'):'');
  };

  root.RTR=RTR;
  if(typeof module!=='undefined'&&module.exports) module.exports=RTR;
})(typeof window!=='undefined'?window:this);
