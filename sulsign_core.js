/* ═══════════════════════════════════════════════════════════════
   SULSIGN CORE — Fonte única da verdade
   Cálculo financeiro, status, categorias e config Supabase.
   Toda página deve importar este arquivo:
   <script src="sulsign_core.js"></script>
   Regra: NENHUM módulo redefine estas funções localmente.
   ═══════════════════════════════════════════════════════════════ */
var SulSignCore = (function(){

  // ── CONFIG ──
  var SUPA_URL = 'https://obeamqkcuytctfczhook.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iZWFtcWtjdXl0Y3RmY3pob29rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMDIxOTQsImV4cCI6MjA4ODU3ODE5NH0.zk88W0HUIYkp8toTsJIXFHf6IGPRPs4hKz8kT3I5QVY';

  // ── PIPELINE OFICIAL DE STATUS ──
  var STATUS_PIPELINE = [
    'Em Orçamento',
    'Proposta Enviada',
    'Aprovado',
    'Em Produção',
    'Entregue',
    'Faturado',
    'Pago',
    // terminais de negócio perdido (mantêm modal de recusa e auto-vencimento):
    'Orçamento Recusado',
    'Orçamento Vencido',
    'Cancelado'
  ];

  // ── CATEGORIAS OFICIAIS DE LANÇAMENTO ──
  var CATEGORIAS = ['Imposto','Serviços','Receita de Job','Comissão','Mão de Obra','Alimentação','Verba Produção','Material','Insumo','Logística','Estorno','Outros'];

  // ── CÁLCULO OFICIAL DO ORÇAMENTO ──
  // Replica exatamente o calcAll() do ORC_Manager:
  //   fator = (1+AC+DF+RI)/(1-L-I)
  //   por linha: venda = custo*fator; imposto = venda*IR; total = venda+imposto
  //   grupos com opcional=true NÃO entram no total geral
  //   vendaLiquida = totalGrupos * (1 - desconto%)
  //   totalGeral   = vendaLiquida + vendaLiquida * opPct%
  function calcOrcamento(orc){
    var bdi = orc.bdi || {};
    var ac = (parseFloat(bdi.ac)||0)/100,
        df = (parseFloat(bdi.df)||0)/100,
        ri = (parseFloat(bdi.ri)||0)/100,
        l  = (parseFloat(bdi.lc)||0)/100,
        im = (parseFloat(bdi.im)||0)/100,
        ir = (parseFloat(bdi.ir)||0)/100,
        dp = (parseFloat(bdi['desc-pct'])||0)/100,
        op = (parseFloat(bdi['op-pct'])||0)/100;
    var fator = (1+ac+df+ri)/(1-l-im);
    var custoTotal=0, vendaBruta=0, custoOpc=0, vendaOpc=0;
    (orc.grupos||[]).forEach(function(g){
      var isOpc = !!g.opcional;
      (g.linhas||[]).forEach(function(ln){
        var q = parseFloat(ln.qtd)||0, u = parseFloat(ln.unit)||0;
        var custo = q*u;
        var venda = custo*fator;
        var tot = venda + venda*ir;
        if(isOpc){ custoOpc+=custo; vendaOpc+=tot; }
        else     { custoTotal+=custo; vendaBruta+=tot; }
      });
    });
    var vendaLiquida = vendaBruta*(1-dp);
    var vendaTotal   = vendaLiquida + vendaLiquida*op;
    return {
      custo: custoTotal,
      venda: vendaTotal,           // total geral, idêntico ao r-geral do ORC
      vendaBruta: vendaBruta,      // antes de desconto e operacional
      desconto: vendaBruta*dp,
      operacional: vendaLiquida*op,
      custoOpcional: custoOpc,     // opcionais NÃO inclusos no total
      vendaOpcional: vendaOpc,
      fator: fator
    };
  }

  // ── FORMATAÇÃO ──
  function fmt(v){
    return 'R$ '+(v||0).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  }

  return {
    SUPA_URL: SUPA_URL,
    SUPA_KEY: SUPA_KEY,
    STATUS_PIPELINE: STATUS_PIPELINE,
    CATEGORIAS: CATEGORIAS,
    calcOrcamento: calcOrcamento,
    fmt: fmt
  };
})();
