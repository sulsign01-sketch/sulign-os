/* Testes do motor de letra caixa — rodar: node v2/test/lcx_test.js */
var fs=require('fs'), path=require('path');
global.RTR=require('../rtr_core.js');
var LCX=require('../lcx_core.js');
var falhas=0;
function ok(c,msg){ if(!c){ falhas++; console.log('  FALHOU: '+msg); } else console.log('  ok: '+msg); }
function perto(a,b,tol,msg){ ok(Math.abs(a-b)<=tol, msg+' ('+a+' ≈ '+b+' ±'+tol+')'); }

console.log('BDI');
perto(LCX.fator(LCX.PERFIS.sulsign),1.8683,0.0001,'Sul Sign out/26 = 1,8683×');
perto(LCX.fator(LCX.PERFIS.pdvex),1.3846,0.0001,'PDVEX = 1,3846×');
perto(LCX.fator(LCX.PERFIS.legado),1.5694,0.0001,'BDI antigo AC 8 = 1,5694×');

console.log('Geometria do DXF do iLoja');
var buf=fs.readFileSync(path.join(__dirname,'iloja_600x190.dxf'));
RTR.ler('iloja_600x190.dxf',buf).then(function(doc){
  var geo=LCX.geoDeDoc(doc);
  perto(geo.perimM,2.957,0.01,'perímetro 2,957 m');
  perto(geo.areaM2*1e4,503.9,1.5,'área líquida 503,9 cm²');
  ok(geo.pecas===8,'8 peças (contou '+geo.pecas+')');
  ok(geo.vazados===2,'2 vazados (contou '+geo.vazados+')');
  perto(geo.bboxMm[0],600,0.5,'largura 600 mm'); perto(geo.bboxMm[1],193.6,0.5,'altura 193,6 mm');

  console.log('Caso iLoja: chapada PVC 15 + vinil laminado + gabarito MDF 3, 1 un, cliente instala');
  var r=LCX.calcular({nome:'Logo iLoja',perfil:'sulsign',nf:false,qtd:1,complexidade:'normal',geo:geo,constr:'chapada',
    chapada:{mat:'pvc15',acab:'vinil',vinil:'lam'},gabarito:{on:true,modo:'mdf3'},instalacao:'cliente'});
  r.linhas.forEach(function(l){ console.log('   '+(l.grupo+'      ').slice(0,5)+' '+(l.desc+' '.repeat(70)).slice(0,70)+' '+String(l.custo.toFixed(2)).padStart(8)+'   '+l.nota); });
  console.log('   CUSTO '+r.custo+'  fator '+r.fator.toFixed(4)+'  VENDA '+r.venda+'  (com NF '+r.vendaNF+')');
  var soma=0; r.linhas.forEach(function(l){ soma+=l.custo; });
  perto(soma,r.custo,0.011,'custo = soma das linhas');
  perto(r.venda,r.custo*r.fator,0.011,'venda = custo × fator');
  ok(r.custo>230&&r.custo<310,'custo na faixa de ≈ R$ 267 do orçamento de referência ('+r.custo+')');
  perto(r.sintetico.total,r.venda,0.05,'Sintético fecha com a venda');
  var rn=LCX.calcular({nome:'Logo iLoja',perfil:'sulsign',nf:true,qtd:1,complexidade:'normal',geo:geo,constr:'chapada',chapada:{mat:'pvc15',acab:'vinil',vinil:'lam'},gabarito:{on:true},instalacao:'cliente'});
  perto(rn.vendaNF,rn.venda*1.12,0.02,'NF soma 12%');
  var rp=LCX.calcular({nome:'Logo iLoja',perfil:'pdvex',qtd:1,complexidade:'normal',geo:geo,constr:'chapada',chapada:{mat:'pvc15',acab:'vinil',vinil:'lam'},gabarito:{on:true},instalacao:'cliente'});
  var rt=rp.linhas.filter(function(l){return l.chave==='router';})[0];
  perto(rt.custo*rp.fator,2.957*8,0.1,'PDVEX: router rende R$ 8,00/m.l. na venda');
  var rs=r.linhas.filter(function(l){return l.chave==='router';})[0];
  perto(rs.custo*r.fator,2.957*10,0.1,'Sul Sign: router rende R$ 10,00/m.l. na venda');
  // BDI p/ ORC reproduz o fator no calcOrcamento oficial
  global.window=undefined;
  var b=r.bdiOrc, fo=(1+(+b.ac+ +b.df+ +b.ri)/100)/(1-(+b.lc+ +b.im)/100);
  perto(fo,r.fator,0.0006,'BDI no formato do ORC reproduz o fator');

  console.log('Quantidade 5: encaixe e preço por unidade caem');
  var r5=LCX.calcular({nome:'Logo iLoja',perfil:'sulsign',qtd:5,complexidade:'normal',geo:geo,constr:'chapada',chapada:{mat:'pvc15',acab:'vinil',vinil:'lam'},gabarito:{on:true},instalacao:'cliente'});
  ok(r5.unitario<r.unitario,'unitário 5 un ('+r5.unitario+') < 1 un ('+r.unitario+')');
  var lev=LCX.levantamento(r5); ok(lev.materiais.length>=3,'levantamento lista materiais ('+lev.materiais.map(function(m){return m.material;}).join(', ')+')');

  console.log('Texto + altura (sem arquivo): avisa que é estimativa');
  var gt=LCX.geoDeTexto('iLoja',19.4,5); var rt2=LCX.calcular({perfil:'sulsign',qtd:1,geo:gt,constr:'chapada',chapada:{mat:'pvc15',acab:'vinil'}});
  ok(rt2.avisos.join(' ').indexOf('ESTIMADA')>=0,'aviso de geometria estimada');

  console.log('Caixa com face acrílico e LED');
  var gc=LCX.geoDeTexto('SUL SIGN',40,8);
  var rc=LCX.calcular({nome:'SUL SIGN',perfil:'sulsign',qtd:1,complexidade:'complexa',geo:gc,constr:'caixa',caixa:{face:'acr3',lateral:'pvc10',fundo:'pvc5',prof:5,ilum:'frontlit',led:'fita'},gabarito:{on:false},instalacao:'sulsign',alturaInst:1.3});
  rc.linhas.forEach(function(l){ console.log('   '+(l.grupo+'      ').slice(0,5)+' '+(l.desc+' '.repeat(70)).slice(0,70)+' '+String(l.custo.toFixed(2)).padStart(8)); });
  console.log('   CUSTO '+rc.custo+' VENDA '+rc.venda);
  ok(rc.linhas.some(function(l){return l.chave==='mo_eletr';}),'tem eletricista quando há luz');
  ok(rc.linhas.some(function(l){return l.chave==='fonte';}),'tem fonte');
  ok(rc.linhas.filter(function(l){return l.chave==='mat_face';})[0].custo>=40,'acrílico respeita o mínimo de R$ 40');

  console.log('Impressão 3D com peso e tempo informados');
  var r3=LCX.calcular({nome:'Letra 3D',perfil:'sulsign',qtd:1,geo:LCX.geoDeTexto('A',20,1),constr:'impressao3d',i3d:{peso_g:300,tempo_h:12,fil:'petg'},caixa:{ilum:'nenhuma'}});
  var fil=r3.linhas.filter(function(l){return l.chave==='filamento';})[0];
  perto(fil.qtd,360,0.5,'peso 300 g + 20% de perda = 360 g');
  perto(fil.custo,360*60/1000,0.02,'filamento PETG translúcido a R$ 60/kg');

  console.log('Número do orçamento');
  ok(LCX.proximoNumero(['SS-2026_11-01','SS-2026_11-07','SS-2026_10-12'],new Date(2026,10,1))==='SS-2026_11-08','próximo SS-2026_11-08');
console.log('Painel recortado (calibrado no Samba, 1.3 rococó, PDVEX)');
  (function(){
    var rp=LCX.calcularPainel({nome:'1.3 rococó',perfil:'pdvex',qtd:2,painel:{mat:'mdf15',precoChapa:302,L:5,A:3,aprov:74,pinturaFator:1.195,recorteMlM2:25,modL:2.5,modA:1.5,metalonM:38.4,sapatas:6,ferragens:2,dias:{marc:4,serr:3,mont:2,desm:1}},ovr:{}});
    perto(rp.venda,19964.86,0.05,'venda do painel rococó = R$ 19.964,86');
    var ra=LCX.calcularAvulso({nome:'Placas',perfil:'pdvex',qtd:1,avulso:{linhas:[{desc:'ACM',qtd:4,un:'chapa',pu:300},{desc:'router',qtd:50,un:'ml router',pu:8}]},ovr:{}});
    perto(ra.venda,(1200+50*8/LCX.fator(LCX.PERFIS.pdvex))*LCX.fator(LCX.PERFIS.pdvex),0.05,'avulso: ml router rende R$ 8 na venda');
    var cb=LCX.combinar([rp,ra]); perto(cb.venda,rp.venda+ra.venda,0.02,'combinar soma as vendas'); ok(cb.sintetico.linhas.length===2,'Sintético com uma linha por item');
  })();
  
  console.log(falhas?('\n'+falhas+' FALHA(S)'):'\nTudo certo');
  process.exit(falhas?1:0);
}).catch(function(e){ console.log('ERRO',e); process.exit(2); });
