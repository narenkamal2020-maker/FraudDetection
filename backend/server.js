import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { driver, runQuery } from "./db.js";
dotenv.config();

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "*" }));
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  try {
    await driver.verifyConnectivity();
    res.json({ ok: true, database: "Neo4j", message: "Connected" });
  } catch (e) {
    res.status(503).json({ ok: false, database: "Neo4j", message: e.message });
  }
});

app.get("/api/dashboard", async (_req, res) => {
  try {
    const [counts, alerts, transactions, distribution] = await Promise.all([
      runQuery(`CALL { MATCH (n:Customer) RETURN count(n) AS customers }
        CALL { MATCH (n:Account) RETURN count(n) AS accounts }
        CALL { MATCH (n:Transaction) RETURN count(n) AS transactions }
        CALL { MATCH (n:FraudAlert) RETURN count(n) AS alerts }
        CALL { MATCH (n:FraudCase) RETURN count(n) AS cases }
        RETURN customers, accounts, transactions, alerts, cases`),
      runQuery(`MATCH (t:Transaction)-[:GENERATES]->(f:FraudAlert)
        OPTIONAL MATCH (a:Account)-[:PERFORMS]->(t)<-[:OWNS]-(c:Customer)
        RETURN f.alertId AS alertId, f.alertType AS alertType, f.riskLevel AS riskLevel,
          f.status AS status, t.transactionId AS transactionId, t.amount AS amount,
          t.location AS location, c.name AS customer, a.accountId AS accountId
        ORDER BY CASE f.riskLevel WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END, t.amount DESC`),
      runQuery(`MATCH (t:Transaction) RETURN t.transactionId AS id, t.amount AS amount,
        t.transactionType AS type, t.location AS location, t.status AS status,
        toString(t.dateTime) AS dateTime ORDER BY t.transactionId DESC LIMIT 8`),
      runQuery(`MATCH (f:FraudAlert) RETURN f.riskLevel AS riskLevel, count(*) AS total ORDER BY total DESC`)
    ]);
    res.json({ counts: counts[0] || {}, alerts, transactions, distribution });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/investigate/:alertId", async (req, res) => {
  const alertId = Number(req.params.alertId);
  if (!Number.isInteger(alertId)) return res.status(400).json({ error: "Invalid alert ID" });
  try {
    const rows = await runQuery(`
      MATCH (c:Customer)-[:OWNS]->(a:Account)-[:PERFORMS]->(t:Transaction)
            -[:GENERATES]->(f:FraudAlert {alertId:$alertId})
      OPTIONAL MATCH (f)-[:LEADS_TO]->(fc:FraudCase)-[:ASSIGNED_TO]->(i:Investigator)
      RETURN c.customerId AS customerId, c.name AS customer, a.accountId AS accountId,
        t.transactionId AS transactionId, t.amount AS amount, t.location AS location,
        t.status AS transactionStatus, f.alertId AS alertId, f.alertType AS alertType,
        f.riskLevel AS riskLevel, f.status AS alertStatus, fc.caseId AS caseId,
        fc.caseStatus AS caseStatus, i.name AS investigator, i.department AS department
    `, { alertId });
    res.json({ result: rows[0] || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/shared-indicators", async (_req, res) => {
  try {
    const results = await runQuery(`
      MATCH (c1:Customer)-[:OWNS]->(a1:Account)-[:USES_INDICATOR]->(d:Device)
            <-[:USES_INDICATOR]-(a2:Account)<-[:OWNS]-(c2:Customer)
      WHERE c1.customerId <> c2.customerId
      RETURN c1.name AS customer1, a1.accountId AS account1,
        c2.name AS customer2, a2.accountId AS account2,
        d.deviceId AS indicator, d.kind AS indicatorType, d.synthetic AS synthetic
    `);
    res.json({ results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/alerts/:alertId", async (req, res) => {
  const alertId = Number(req.params.alertId);
  const allowed = ["OPEN", "UNDER_REVIEW", "RESOLVED", "ESCALATED"];
  const status = req.body?.status;
  if (!Number.isInteger(alertId) || !allowed.includes(status))
    return res.status(400).json({ error: "Provide a valid alert ID and status." });
  try {
    const rows = await runQuery(`
      MATCH (f:FraudAlert {alertId:$alertId})
      SET f.status=$status
      RETURN f.alertId AS alertId, f.status AS status
    `, { alertId, status });
    if (!rows.length) return res.status(404).json({ error: "Alert not found." });
    res.json({ updated: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/graph", async (_req, res) => {
  try {
    const nodes = await runQuery(`
      MATCH (n)
      WITH n LIMIT 80
      RETURN labels(n)[0] AS label, properties(n) AS props
    `);
    const links = await runQuery(`
      MATCH (a)-[r]->(b)
      RETURN labels(a)[0] AS sourceLabel, coalesce(a.customerId,a.accountId,a.transactionId,a.alertId,a.caseId,a.investigatorId,a.deviceId) AS sourceId,
        type(r) AS relationship, labels(b)[0] AS targetLabel,
        coalesce(b.customerId,b.accountId,b.transactionId,b.alertId,b.caseId,b.investigatorId,b.deviceId) AS targetId
      LIMIT 120
    `);
    res.json({ nodes, links });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// Create records safely through typed, parameterized Cypher queries.
const recordConfigs = {
  customer: { required: ['customerId','name','email','city'], query: `CREATE (n:Customer {customerId:$customerId,name:$name,email:$email,city:$city}) RETURN n.customerId AS id` },
  account: { required: ['accountId','accountType','balance','status','customerId'], query: `MATCH (c:Customer {customerId:$customerId}) CREATE (c)-[:OWNS]->(n:Account {accountId:$accountId,accountType:$accountType,balance:$balance,status:$status}) RETURN n.accountId AS id` },
  transaction: { required: ['transactionId','amount','transactionType','dateTime','location','status','accountId'], query: `MATCH (a:Account {accountId:$accountId}) CREATE (a)-[:PERFORMS]->(n:Transaction {transactionId:$transactionId,amount:$amount,transactionType:$transactionType,dateTime:datetime($dateTime),location:$location,status:$status}) RETURN n.transactionId AS id` },
  alert: { required: ['alertId','alertType','riskLevel','alertDate','status','transactionId'], query: `MATCH (t:Transaction {transactionId:$transactionId}) CREATE (t)-[:GENERATES]->(n:FraudAlert {alertId:$alertId,alertType:$alertType,riskLevel:$riskLevel,alertDate:date($alertDate),status:$status}) RETURN n.alertId AS id` },
  case: { required: ['caseId','caseStatus','openDate','alertId','investigatorId'], query: `MATCH (f:FraudAlert {alertId:$alertId}),(i:Investigator {investigatorId:$investigatorId}) CREATE (f)-[:LEADS_TO]->(n:FraudCase {caseId:$caseId,caseStatus:$caseStatus,openDate:date($openDate),closeDate:CASE WHEN $closeDate IS NULL OR $closeDate='' THEN null ELSE date($closeDate) END})-[:ASSIGNED_TO]->(i) RETURN n.caseId AS id` }
};
function normalizeRecord(type, raw) {
  const numberFields = {customer:['customerId'],account:['accountId','balance','customerId'],transaction:['transactionId','amount','accountId'],alert:['alertId','transactionId'],case:['caseId','alertId','investigatorId']};
  const data = {...raw};
  for (const key of (numberFields[type] || [])) {
    data[key] = Number(data[key]);
    if (!Number.isFinite(data[key])) throw new Error(`${key} must be a number`);
  }
  if (type==='transaction' && !Number.isFinite(Date.parse(data.dateTime))) throw new Error('dateTime must be a valid date/time');
  if (type==='alert') {
    data.riskLevel=String(data.riskLevel||'').toUpperCase();
    data.status=String(data.status||'OPEN').toUpperCase();
    if (!['LOW','MEDIUM','HIGH','CRITICAL'].includes(data.riskLevel)) throw new Error('riskLevel must be LOW, MEDIUM, HIGH, or CRITICAL');
    if (!['OPEN','UNDER_REVIEW','RESOLVED','ESCALATED'].includes(data.status)) throw new Error('Invalid alert status');
  }
  if (type==='account') data.status=String(data.status||'ACTIVE').toUpperCase();
  return data;
}
async function createRecord(type, raw) {
  const config=recordConfigs[type];
  if (!config) throw new Error('Unsupported record type');
  const data=normalizeRecord(type,raw);
  for (const key of config.required) if (data[key]===undefined || data[key]===null || String(data[key]).trim()==='') throw new Error(`${key} is required`);
  const rows=await runQuery(config.query,data);
  if (!rows.length) throw new Error('Related record was not found. Check the referenced customer, account, transaction, alert, or investigator ID.');
  return rows[0];
}
app.post('/api/records/:type', async (req,res)=>{
  try { const created=await createRecord(String(req.params.type).toLowerCase(),req.body||{}); res.status(201).json({created}); }
  catch(e) { const duplicate=/already exists|constraint/i.test(e.message); res.status(duplicate?409:400).json({error:e.message}); }
});
app.post('/api/import/:type', async (req,res)=>{
  const type=String(req.params.type).toLowerCase();
  const rows=req.body?.rows;
  if (!Array.isArray(rows) || rows.length===0) return res.status(400).json({error:'Provide a non-empty rows array.'});
  if (rows.length>500) return res.status(413).json({error:'Import is limited to 500 rows per request.'});
  const results=[];
  for (let i=0;i<rows.length;i++) {
    try { const created=await createRecord(type,rows[i]); results.push({row:i+1,ok:true,id:created.id}); }
    catch(e) { results.push({row:i+1,ok:false,error:e.message}); }
  }
  res.status(results.some(r=>!r.ok)?207:201).json({total:rows.length,created:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,results});
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`FraudGraph API listening at http://localhost:${port}`));

process.on("SIGINT", async () => { await driver.close(); process.exit(0); });
