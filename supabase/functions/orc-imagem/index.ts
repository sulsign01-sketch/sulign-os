// Supabase Edge Function — orc-imagem (versão Google Gemini, tier GRÁTIS)
// Proxy seguro: recebe uma imagem, chama o Gemini com a chave guardada no
// servidor (secret GEMINI_API_KEY) e devolve o JSON estruturado do orçamento.
// O cliente da calculadora NÃO muda — ele já espera { ok, data }.
//
// COMO OBTER A CHAVE GRÁTIS:
//   1) acesse https://aistudio.google.com  (login com conta Google, sem cartão)
//   2) "Get API key" -> cria a chave (começa com "AIza...")
//
// DEPLOY (terminal, com a Supabase CLI logada no projeto obeamqkcuytctfczhook):
//   1) mkdir -p supabase/functions/orc-imagem
//   2) salve este arquivo como supabase/functions/orc-imagem/index.ts
//   3) supabase secrets set GEMINI_API_KEY=AIza...        (a chave fica só no servidor)
//   4) supabase functions deploy orc-imagem --no-verify-jwt
//
// Depois cole a URL no campo "Endpoint" da calculadora:
//   https://obeamqkcuytctfczhook.supabase.co/functions/v1/orc-imagem
//
// Se quiser mais cota, troque o modelo no secret opcional GEMINI_MODEL
// (ex.: gemini-3.6-flash ou gemini-3.5-flash). Padrão: gemini-3.6-flash (grátis, com visão).

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.6-flash";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROMPT =
  'Você é um orçamentista de comunicação visual da Sul Sign. Analise a imagem de letras/letreiro/peça e devolva SOMENTE um objeto JSON (sem markdown, sem texto fora do JSON) com os campos:\n' +
  '{"texto": "<texto que você lê nas letras, ou descrição curta>", "altura_cm": <número da altura estimada das letras em cm>, "construcao": "caixa"|"chapada", "iluminacao": "frontlit"|"halo"|"dupla"|"nenhuma", "material_corpo": um de ["galv","pvc10","pvc15","pvc20","mdf15","acm","acm_esp3","acm_esp4","inox","acr_lat","print3d"], "acabamento": "nenhum"|"pintura"|"vinil"|"ambos", "cores_pintura": <número de cores da pintura, 1 se não souber>, "confianca": "alta"|"média"|"baixa", "observacoes": "<o que ficou incerto e você estimou>"}\n' +
  'Regras: "halo" = efeito bafo de luz (retroiluminação). Sem luz aparente => "nenhuma". Peça fina recortada colada na parede => "chapada"; peça com profundidade/caixa => "caixa". Estime a altura pela proporção com elementos conhecidos; na dúvida, valor plausível. Se a imagem for uma prancha/briefing com vários elementos, escolha o de maior destaque (letras ou logo principal) para os campos e resuma os demais em observacoes. Responda só com o JSON.';

function json(o: unknown, status = 200): Response {
  return new Response(JSON.stringify(o), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "use POST" }, 405);
  if (!GEMINI_KEY) return json({ ok: false, error: "GEMINI_API_KEY não configurada no servidor" }, 500);

  try {
    const body = await req.json();
    const image = body.image;
    const media_type = body.media_type || "image/jpeg";
    // usa o modelo do cliente só se for um gemini-*; senão, o padrão do servidor
    const model = (typeof body.model === "string" && body.model.indexOf("gemini-3") === 0)
      ? body.model
      : GEMINI_MODEL;
    if (!image) return json({ ok: false, error: "sem imagem" }, 400);

    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent";
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_KEY },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: media_type, data: image } },
            { text: PROMPT },
          ],
        }],
        generationConfig: { maxOutputTokens: 8192, responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "low" } },
      }),
    });

    const data = await r.json();
    if (!r.ok) return json({ ok: false, error: "gemini " + r.status, detail: data }, 502);

    let txt = "";
    const cands = data.candidates || [];
    if (cands[0] && cands[0].content && cands[0].content.parts) {
      for (const p of cands[0].content.parts) if (p.text) txt += p.text;
    }
    txt = txt.replace(/```json/gi, "").replace(/```/g, "").trim();

    let obj: unknown = null;
    try { obj = JSON.parse(txt); }
    catch (_) { const m = txt.match(/\{[\s\S]*\}/); if (m) { try { obj = JSON.parse(m[0]); } catch (_) { /* noop */ } } }

    if (!obj) return json({ ok: false, error: "resposta não-JSON", raw: txt }, 200);
    return json({ ok: true, data: obj });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
