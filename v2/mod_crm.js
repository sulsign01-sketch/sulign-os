/* ═══════════════════════════════════════════════════════════════
   SULSIGN OS 2.0 — MÓDULO: CRM / PIPELINE (crm)
   Carteira de clientes derivada automaticamente dos orçamentos:
   histórico, taxa de conversão, última atividade, recência.
   Não requer tabela nova — nasce dos dados existentes.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  var fmt=SulSignCore.fmt;
  var st={ord:'total'};

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function isTreino(x){ return (x||'').indexOf('TREINO')>=0; }
  function dstr(d){
    if(!d)return '—';
    var p=(String(d).split('T')[0]||'').split('-');
    return p.length===3?(p[2]+'/'+p[1]+'/'+p[0]):d;
  }

  var GANHO=['Aprovado','Em Produção','Entregue','Faturado','Pago'];
  var PERDIDO=['Orçamento Recusado','Orçamento Vencido','Cancelado'];

  function fetchAll(){
    if(SS20.cache.crm) return Promise.resolve(SS20.cache.crm);
    return SS20.sb('orcamentos?select=numero,cliente,agencia,projeto,bdi,grupos,status,updated_at&order=numero.desc')
      .then(function(rows){
        var data=rows.filter(function(o){return !isTreino(o.numero);});
        SS20.cache.crm=data;
        return data;
      });
  }

  function render(c){
    fetchAll().then(function(d){ draw(c,d); })
    .catch(function(e){
      c.innerHTML='<div class="err-view">Erro ao carregar carteira: '+esc(e.message)+'</div>';
    });
  }

  function draw(c,d){
    var hoje=new Date();
    var cart={};
    d.forEach(function(o){
      var k=o.agencia||o.cliente||'(sem cliente)';
      if(!cart[k])cart[k]={nome:k,ehAgencia:!!o.agencia,jobs:0,ganhos:0,perdidos:0,abertos:0,total:0,ganhoVal:0,ultimo:null,ultimoNum:'',ultimoStatus:'',clientesFinais:{}};
      var e=cart[k];
      var venda=SulSignCore.calcOrcamento(o).venda;
      var s=o.status||'Em Orçamento';
      e.jobs++; e.total+=venda;
      if(GANHO.indexOf(s)>=0){e.ganhos++;e.ganhoVal+=venda;}
      else if(PERDIDO.indexOf(s)>=0)e.perdidos++;
      else e.abertos++;
      if(o.agencia&&o.cliente)e.clientesFinais[o.cliente]=1;
      var up=o.updated_at||'';
      if(!e.ultimo||up>e.ultimo){e.ultimo=up;e.ultimoNum=o.numero;e.ultimoStatus=s;}
    });
    var lista=Object.keys(cart).map(function(k){
      var e=cart[k];
      e.conv=e.jobs?Math.round(e.ganhos/(e.ganhos+e.perdidos||1)*100):0;
      e.dias=e.ultimo?Math.round((hoje-new Date(e.ultimo))/86400000):null;
      return e;
    });

    if(st.ord==='total')lista.sort(function(a,b){return b.ganhoVal-a.ganhoVal;});
    else if(st.ord==='recente')lista.sort(function(a,b){return (a.dias===null?9999:a.dias)-(b.dias===null?9999:b.dias);});
    else if(st.ord==='frio')lista.sort(function(a,b){return (b.dias===null?-1:b.dias)-(a.dias===null?-1:a.dias);});
    else if(st.ord==='abertos')lista.sort(function(a,b){return b.abertos-a.abertos;});

    var totGanho=lista.reduce(function(a,b){return a+b.ganhoVal;},0);
    var comAberto=lista.filter(function(e){return e.abertos>0;}).length;
    var frios=lista.filter(function(e){return e.dias!==null&&e.dias>60&&e.ganhos>0;}).length;

    var h='<div style="padding:24px 26px">';
    h+='<h2 style="font-family:var(--font-d);font-size:19px;margin-bottom:4px">CRM · Carteira de clientes</h2>';
    h+='<p style="color:var(--mut);font-size:12.5px;margin-bottom:18px">Construída automaticamente do histórico de orçamentos · agências agrupam seus clientes finais</p>';

    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin-bottom:20px">';
    h+=kpi('Contas na carteira',lista.length,'','var(--ink)');
    h+=kpi('Com proposta aberta',comAberto,'oportunidades vivas','var(--ok)');
    h+=kpi('Volume ganho (hist.)',fmt(totGanho),'','var(--accent)');
    h+=kpi('Frias > 60 dias',frios,'clientes ganhos sem atividade','var(--warn)');
    h+='</div>';

    /* ordenação */
    h+='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">';
    [['total','Maior volume'],['recente','Atividade recente'],['frio','Mais frios'],['abertos','Mais abertos']].forEach(function(o){
      var on=st.ord===o[0];
      h+='<button type="button" data-crm-ord="'+o[0]+'" style="border:1px solid var(--line);background:'+(on?'var(--ink)':'var(--panel)')+';color:'+(on?'#fff':'var(--ink2)')+';font-size:11.5px;font-weight:600;padding:5px 11px;border-radius:16px;cursor:pointer">'+o[1]+'</button>';
    });
    h+='</div>';

    h+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px">';
    lista.forEach(function(e){
      var frio=e.dias!==null&&e.dias>60;
      var finais=Object.keys(e.clientesFinais);
      h+='<div style="background:var(--panel);border:1px solid '+(e.abertos?'var(--ok)':'var(--line)')+';border-radius:var(--radius);padding:15px 16px">'
        +'<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:2px">'
        +'<span style="font-family:var(--font-d);font-weight:700;font-size:14.5px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(e.nome)+'">'+esc(e.nome)+'</span>'
        +(e.ehAgencia?'<span style="font-size:9px;font-weight:700;letter-spacing:.6px;padding:2px 7px;border-radius:10px;background:var(--blue-soft);color:var(--blue)">AGÊNCIA</span>':'')
        +'</div>'
        +(finais.length?'<div style="font-size:10.5px;color:var(--mut);margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(finais.join(', '))+'</div>':'<div style="height:6px"></div>')
        +'<div style="display:flex;gap:14px;font-size:11.5px;color:var(--mut);margin-bottom:8px">'
        +'<span><b style="color:var(--ink)">'+e.jobs+'</b> jobs</span>'
        +'<span><b style="color:var(--ok)">'+e.ganhos+'</b> ganhos</span>'
        +(e.abertos?'<span><b style="color:var(--accent)">'+e.abertos+'</b> abertos</span>':'')
        +'<span>conv. <b style="color:var(--ink)">'+e.conv+'%</b></span>'
        +'</div>'
        +'<div style="font-size:15px;font-weight:800;font-family:var(--font-d);margin-bottom:8px">'+fmt(e.ganhoVal)+'</div>'
        +'<div style="font-size:11px;color:'+(frio?'var(--warn)':'var(--mut)')+'">'
        +(e.dias!==null?('Última atividade: '+(e.dias===0?'hoje':e.dias+'d atrás')+' · '+esc(e.ultimoNum)+' ('+esc(e.ultimoStatus)+')'+(frio?' 🥶':'')):'—')
        +'</div>'
        +'</div>';
    });
    h+='</div></div>';
    c.innerHTML=h;

    var btns=c.querySelectorAll('[data-crm-ord]');
    Array.prototype.forEach.call(btns,function(b){
      b.addEventListener('click',function(){
        st.ord=this.getAttribute('data-crm-ord');
        draw(c,d);
      });
    });
  }

  function kpi(lbl,valTxt,sub,cor){
    return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px">'
      +'<div style="font-size:10.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut)">'+lbl+'</div>'
      +'<div style="font-family:var(--font-d);font-size:21px;font-weight:800;margin:6px 0 3px;color:'+cor+'">'+valTxt+'</div>'
      +'<div style="font-size:11.5px;color:var(--mut)">'+(sub||'&nbsp;')+'</div></div>';
  }

  SS20.modules.crm={render:render};
})();
