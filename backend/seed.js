import dotenv from "dotenv";
import { driver, runQuery } from "./db.js";
dotenv.config();

const seed = `
MATCH (n) DETACH DELETE n;
CREATE CONSTRAINT customer_id IF NOT EXISTS FOR (n:Customer) REQUIRE n.customerId IS UNIQUE;
CREATE CONSTRAINT account_id IF NOT EXISTS FOR (n:Account) REQUIRE n.accountId IS UNIQUE;
CREATE CONSTRAINT transaction_id IF NOT EXISTS FOR (n:Transaction) REQUIRE n.transactionId IS UNIQUE;
CREATE CONSTRAINT alert_id IF NOT EXISTS FOR (n:FraudAlert) REQUIRE n.alertId IS UNIQUE;
CREATE CONSTRAINT case_id IF NOT EXISTS FOR (n:FraudCase) REQUIRE n.caseId IS UNIQUE;
CREATE CONSTRAINT investigator_id IF NOT EXISTS FOR (n:Investigator) REQUIRE n.investigatorId IS UNIQUE;
`;
const session = driver.session();
try {
  // Execute constraints separately because each schema statement must be its own query.
  await session.run("MATCH (n) DETACH DELETE n");
  const constraints = [
    "CREATE CONSTRAINT customer_id IF NOT EXISTS FOR (n:Customer) REQUIRE n.customerId IS UNIQUE",
    "CREATE CONSTRAINT account_id IF NOT EXISTS FOR (n:Account) REQUIRE n.accountId IS UNIQUE",
    "CREATE CONSTRAINT transaction_id IF NOT EXISTS FOR (n:Transaction) REQUIRE n.transactionId IS UNIQUE",
    "CREATE CONSTRAINT alert_id IF NOT EXISTS FOR (n:FraudAlert) REQUIRE n.alertId IS UNIQUE",
    "CREATE CONSTRAINT case_id IF NOT EXISTS FOR (n:FraudCase) REQUIRE n.caseId IS UNIQUE",
    "CREATE CONSTRAINT investigator_id IF NOT EXISTS FOR (n:Investigator) REQUIRE n.investigatorId IS UNIQUE"
  ];
  for (const q of constraints) await session.run(q);

  const customers = [
    {id:101,name:"Rahul Sharma",email:"rahul@gmail.com",city:"Chennai"},
    {id:102,name:"Priya Reddy",email:"priya@gmail.com",city:"Hyderabad"},
    {id:103,name:"Arjun Kumar",email:"arjun@gmail.com",city:"Bangalore"},
    {id:104,name:"Sneha Rao",email:"sneha@gmail.com",city:"Mumbai"},
    {id:105,name:"Vikram Singh",email:"vikram@gmail.com",city:"Delhi"}
  ];
  const accounts = [
    {id:1001,type:"Savings",balance:75000,status:"ACTIVE",customerId:101},
    {id:1002,type:"Current",balance:150000,status:"ACTIVE",customerId:101},
    {id:1003,type:"Savings",balance:50000,status:"ACTIVE",customerId:102},
    {id:1004,type:"Savings",balance:120000,status:"ACTIVE",customerId:103},
    {id:1005,type:"Current",balance:250000,status:"ACTIVE",customerId:104},
    {id:1006,type:"Savings",balance:90000,status:"BLOCKED",customerId:105}
  ];
  const transactions = [
    {id:2001,amount:5000,type:"UPI",dateTime:"2026-08-01T10:30:00",location:"Chennai",status:"SUCCESS",accountId:1001},
    {id:2002,amount:25000,type:"ONLINE",dateTime:"2026-08-02T11:15:00",location:"Chennai",status:"SUCCESS",accountId:1001},
    {id:2003,amount:95000,type:"CARD",dateTime:"2026-08-03T02:30:00",location:"Delhi",status:"SUSPICIOUS",accountId:1002},
    {id:2004,amount:3000,type:"UPI",dateTime:"2026-08-04T14:20:00",location:"Hyderabad",status:"SUCCESS",accountId:1003},
    {id:2005,amount:85000,type:"ONLINE",dateTime:"2026-08-05T03:10:00",location:"Mumbai",status:"SUSPICIOUS",accountId:1004},
    {id:2006,amount:12000,type:"ATM",dateTime:"2026-08-06T16:45:00",location:"Bangalore",status:"SUCCESS",accountId:1004},
    {id:2007,amount:200000,type:"ONLINE",dateTime:"2026-08-07T01:20:00",location:"Unknown",status:"SUSPICIOUS",accountId:1005},
    {id:2008,amount:4500,type:"UPI",dateTime:"2026-08-08T12:30:00",location:"Delhi",status:"SUCCESS",accountId:1006},
    {id:2009,amount:60000,type:"ONLINE",dateTime:"2026-09-12T17:48:24",location:"Chennai",status:"SUSPICIOUS",accountId:1001}
  ];
  const investigators = [
    {id:501,name:"Kiran Kumar",email:"kiran@bank.com",department:"Cyber Crime"},
    {id:502,name:"Anjali Sharma",email:"anjali@bank.com",department:"Fraud Investigation"},
    {id:503,name:"Ravi Verma",email:"ravi@bank.com",department:"Risk Management"}
  ];
  const alerts = [
    {id:3001,type:"Unusual Location",riskLevel:"HIGH",date:"2026-08-03",status:"UNDER_REVIEW",transactionId:2003},
    {id:3002,type:"Unusual Transaction Time",riskLevel:"HIGH",date:"2026-08-05",status:"OPEN",transactionId:2005},
    {id:3003,type:"Large Transaction",riskLevel:"CRITICAL",date:"2026-08-07",status:"UNDER_REVIEW",transactionId:2007}
  ];
  const cases = [
    {id:4001,status:"UNDER_INVESTIGATION",openDate:"2026-08-03",closeDate:null,alertId:3001,investigatorId:501},
    {id:4002,status:"UNDER_INVESTIGATION",openDate:"2026-08-05",closeDate:null,alertId:3002,investigatorId:502},
    {id:4003,status:"RESOLVED",openDate:"2026-08-07",closeDate:"2026-08-10",alertId:3003,investigatorId:503}
  ];

  await session.run("UNWIND $rows AS r CREATE (:Customer {customerId:r.id,name:r.name,email:r.email,city:r.city})", {rows:customers});
  await session.run("UNWIND $rows AS r CREATE (:Account {accountId:r.id,accountType:r.type,balance:r.balance,status:r.status})", {rows:accounts});
  await session.run("UNWIND $rows AS r CREATE (:Transaction {transactionId:r.id,amount:r.amount,transactionType:r.type,dateTime:datetime(r.dateTime),location:r.location,status:r.status})", {rows:transactions});
  await session.run("UNWIND $rows AS r CREATE (:Investigator {investigatorId:r.id,name:r.name,email:r.email,department:r.department})", {rows:investigators});
  await session.run("UNWIND $rows AS r CREATE (:FraudAlert {alertId:r.id,alertType:r.type,riskLevel:r.riskLevel,alertDate:date(r.date),status:r.status})", {rows:alerts});
  await session.run("UNWIND $rows AS r CREATE (:FraudCase {caseId:r.id,caseStatus:r.status,openDate:date(r.openDate),closeDate:CASE WHEN r.closeDate IS NULL THEN null ELSE date(r.closeDate) END})", {rows:cases});

  await session.run(`
    UNWIND $rows AS r
    MATCH (c:Customer {customerId:r.customerId}),(a:Account {accountId:r.id})
    MERGE (c)-[:OWNS]->(a)
  `, {rows:accounts});
  await session.run(`
    UNWIND $rows AS r
    MATCH (a:Account {accountId:r.accountId}),(t:Transaction {transactionId:r.id})
    MERGE (a)-[:PERFORMS]->(t)
  `, {rows:transactions});
  await session.run(`
    UNWIND $rows AS r
    MATCH (t:Transaction {transactionId:r.transactionId}),(f:FraudAlert {alertId:r.id})
    MERGE (t)-[:GENERATES]->(f)
  `, {rows:alerts});
  await session.run(`
    UNWIND $rows AS r
    MATCH (f:FraudAlert {alertId:r.alertId}),(fc:FraudCase {caseId:r.id})
    MERGE (f)-[:LEADS_TO]->(fc)
  `, {rows:cases});
  await session.run(`
    UNWIND $rows AS r
    MATCH (fc:FraudCase {caseId:r.id}),(i:Investigator {investigatorId:r.investigatorId})
    MERGE (fc)-[:ASSIGNED_TO]->(i)
  `, {rows:cases});

  // Synthetic extra indicator data to demonstrate graph-only relationship exploration.
  await session.run(`
    CREATE (d:Device {deviceId:'DEV-SHARED-01',kind:'Browser fingerprint',synthetic:true})
    WITH d
    MATCH (a:Account {accountId:1001}),(b:Account {accountId:1004})
    CREATE (a)-[:USES_INDICATOR]->(d),(b)-[:USES_INDICATOR]->(d)
  `);
  console.log("Neo4j seeded successfully.");
} catch (err) {
  console.error("Seed failed:", err.message);
  process.exitCode = 1;
} finally {
  await session.close();
  await driver.close();
}
