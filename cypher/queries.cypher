// 1. Overview counts
MATCH (n)
RETURN labels(n)[0] AS NodeType, count(*) AS Total
ORDER BY NodeType;

// 2. High and critical alerts with their connected transaction and customer
MATCH (c:Customer)-[:OWNS]->(a:Account)-[:PERFORMS]->(t:Transaction)-[:GENERATES]->(f:FraudAlert)
WHERE f.riskLevel IN ['HIGH', 'CRITICAL']
RETURN c.name, a.accountId, t.transactionId, t.amount, t.location, f.riskLevel, f.status
ORDER BY t.amount DESC;

// 3. Follow the complete fraud investigation path
MATCH path=(c:Customer)-[:OWNS]->(:Account)-[:PERFORMS]->(:Transaction)
  -[:GENERATES]->(:FraudAlert)-[:LEADS_TO]->(:FraudCase)-[:ASSIGNED_TO]->(i:Investigator)
RETURN path;

// 4. Shared indicator pattern (synthetic teaching data)
MATCH (c1:Customer)-[:OWNS]->(a1:Account)-[:USES_INDICATOR]->(d:Device)
  <-[:USES_INDICATOR]-(a2:Account)<-[:OWNS]-(c2:Customer)
WHERE c1.customerId <> c2.customerId
RETURN c1.name, a1.accountId, c2.name, a2.accountId, d.deviceId, d.kind;

// 5. Large transaction scan
MATCH (t:Transaction)
WHERE t.amount >= 50000
RETURN t.transactionId, t.amount, t.location, t.status
ORDER BY t.amount DESC;

// 6. Open cases and assigned investigators
MATCH (f:FraudAlert)-[:LEADS_TO]->(fc:FraudCase)-[:ASSIGNED_TO]->(i:Investigator)
WHERE fc.caseStatus <> 'RESOLVED'
RETURN fc.caseId, fc.caseStatus, f.riskLevel, i.name, i.department;

// 7. Count transactions per customer
MATCH (c:Customer)-[:OWNS]->(:Account)-[:PERFORMS]->(t:Transaction)
RETURN c.name, count(t) AS Transactions, sum(t.amount) AS TotalAmount
ORDER BY TotalAmount DESC;
