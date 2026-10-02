/**
 * Local stand-in for the Dify app API, to test the assistant end to end without a Dify account.
 * It speaks Dify's wire format (POST /v1/chat-messages, streaming SSE: message, agent_message,
 * agent_thought, message_end, error) and, for the agent key, really calls School ERP's tools with the
 * context_token it receives, exactly as a Dify agent app with the imported custom tool would.
 *
 *   docker compose exec backend node test/mock-dify.js            # listens on :5001
 *   DIFY_API_URL=http://localhost:5001/v1  DIFY_CHATBOT_API_KEY=app-mock-chatbot  DIFY_AGENT_API_KEY=app-mock-agent
 */
const http = require('http');
const { randomUUID } = require('crypto');

const PORT = Number(process.env.MOCK_DIFY_PORT || 5001);
const TOOLS = (process.env.MOCK_TOOLS_BASE || 'http://localhost:4000/api').replace(/\/+$/, '');
const KEYS = { 'app-mock-chatbot': 'chatbot', 'app-mock-agent': 'agent' };

const send = (res, obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function streamText(res, event, text, ids) {
  for (const chunk of text.match(/.{1,24}(\s|$)/g) || [text]) {
    send(res, { event, task_id: ids.task, message_id: ids.message, conversation_id: ids.conversation, answer: chunk, created_at: Date.now() / 1000 });
    await sleep(15);
  }
}

function pickTool(query) {
  const q = query.toLowerCase();
  if (/impay|retard de paiement|relanc/.test(q)) return { tool: 'overdue_invoices', path: '/assistant/tools/overdue', params: { limit: '5' } };
  if (/absen|présence|presence|appel/.test(q)) return { tool: 'attendance_report', path: '/assistant/tools/attendance', params: { days: '30' } };
  const m = /(?:élève|eleve|cherche|trouve)\s+([\p{L}' -]{2,40})/iu.exec(query);
  if (m) return { tool: 'search_students', path: '/assistant/tools/students', params: { q: m[1].trim() } };
  return { tool: 'school_overview', path: '/assistant/tools/overview', params: {} };
}

function summarise(tool, data) {
  if (data.statusCode || data.error) return `L'outil a refusé la demande : ${data.message || data.error}.`;
  if (tool === 'overdue_invoices') {
    const top = (data.plus_gros || []).slice(0, 3).map((r) => `${r.eleve} (${r.reste_fcfa.toLocaleString('fr-FR')} FCFA, ${r.jours_de_retard} j)`).join(' ; ');
    return `Il y a ${data.nombre_total} factures échues impayées pour ${data.montant_total_fcfa.toLocaleString('fr-FR')} FCFA. Les plus importantes : ${top}.`;
  }
  if (tool === 'attendance_report') {
    const low = (data.classes || []).slice(0, 2).map((c) => `${c.classe} (${c.taux_presence} %)`).join(', ');
    return `Sur ${data.periode_jours} jours, les classes les moins présentes sont ${low}.`;
  }
  if (tool === 'search_students') {
    const list = (data.eleves || []).map((e) => `${e.nom} (${e.matricule}, ${e.classe})`).join(' ; ');
    return list ? `J'ai trouvé : ${list}.` : "Aucun élève ne correspond.";
  }
  return `${data.etablissement} compte ${data.eleves_inscrits} élèves dans ${data.classes} classes ; présence sur 30 jours : ${data.taux_presence_30_jours} %.` +
    (data.taux_recouvrement != null ? ` Recouvrement : ${data.taux_recouvrement} %.` : '');
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || !req.url.startsWith('/v1/chat-messages')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ code: 'not_found', message: 'Not found', status: 404 }));
  }
  const key = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  const mode = KEYS[key];
  if (!mode) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ code: 'unauthorized', message: 'Access token is invalid', status: 401 }));
  }
  let body = '';
  for await (const chunk of req) body += chunk;
  const payload = JSON.parse(body || '{}');
  const ids = { task: randomUUID(), message: randomUUID(), conversation: payload.conversation_id || randomUUID() };

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  send(res, { event: 'ping' });

  if (mode === 'chatbot') {
    const who = payload.inputs?.user_name || 'vous';
    await streamText(res, 'message', `Bonjour ${who}. Vous m'avez demandé : « ${payload.query} ». Pour faire l'appel, ouvrez Présence, choisissez la classe et ne touchez que les absents, puis enregistrez.`, ids);
  } else {
    const choice = pickTool(payload.query || '');
    const thoughtId = randomUUID();
    const input = JSON.stringify({ ...choice.params, context_token: '***' });
    send(res, { event: 'agent_thought', id: thoughtId, position: 1, thought: `J'utilise ${choice.tool}.`, tool: choice.tool, tool_input: input, observation: '', conversation_id: ids.conversation, message_id: ids.message });
    const qs = new URLSearchParams({ ...choice.params, context_token: payload.inputs?.context_token || '' });
    let data;
    try {
      const r = await fetch(`${TOOLS}${choice.path}?${qs}`);
      data = await r.json();
    } catch (err) {
      data = { error: String(err) };
    }
    const observation = JSON.stringify(data).slice(0, 1500);
    send(res, { event: 'agent_thought', id: thoughtId, position: 1, thought: `J'utilise ${choice.tool}.`, tool: choice.tool, tool_input: input, observation, conversation_id: ids.conversation, message_id: ids.message });
    await streamText(res, 'agent_message', summarise(choice.tool, data), ids);
  }
  send(res, { event: 'message_end', task_id: ids.task, message_id: ids.message, conversation_id: ids.conversation, metadata: { usage: { total_tokens: 321, latency: 0.42 } } });
  res.end();
});

server.listen(PORT, () => console.log(`Mock Dify listening on http://localhost:${PORT}/v1 (tools at ${TOOLS})`));
