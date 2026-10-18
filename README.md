# FraudGraph | Fraud Risk Detection Management System

A full-stack mini-project extending the Oracle SQL/PLSQL assignment with **Neo4j Graph Database**.

## Stack
- Frontend: HTML, CSS, vanilla JavaScript (responsive dashboard)
- Backend: Node.js + Express
- Database: Neo4j Community Edition + Cypher
- Driver: `neo4j-driver`
- Docker Compose for a local Neo4j instance

## Features
- Dashboard KPIs and risk distribution
- Transaction and fraud-alert tables
- Graph investigation: customer → account → transaction → alert → case → investigator
- Shared-device investigation example
- Update alert status
- Seed synthetic sample data based on the DA2 assignment IDs (customers 101–105, accounts 1001–1006, transactions 2001–2009, alerts 3001–3003, cases 4001–4003)
- Cypher query examples

> The dataset is synthetic and intended for academic demonstration. A shared device or suspicious transaction is an investigation lead, not proof of fraud.

## Run locally

### 1. Requirements
Install Node.js 20+ and Docker Desktop.

### 2. Start Neo4j
From this folder:
```bash
docker compose up -d
```
Neo4j Browser: http://localhost:7474
Bolt endpoint: `bolt://localhost:7687`
Default local credentials: `neo4j` / `fraudgraph123`

### 3. Configure and start the backend
```bash
cd backend
copy .env.example .env
npm install
npm run seed
npm run dev
```
On PowerShell, `copy` works. On macOS/Linux use `cp .env.example .env`.

Backend health: http://localhost:4000/api/health

### 4. Open the website
Open `frontend/index.html` in a browser, or serve the frontend:
```bash
cd frontend
npx serve .
```
The dashboard calls `http://localhost:4000/api`. If needed, change `API_BASE` in `frontend/app.js`.

## Important
- Change the default Neo4j password before using this outside a local academic demo.
- Never use real banking/customer data in this sample.
- The current UI is a local demonstration, not a production banking system. Add authentication, authorization, audit logging, input validation, HTTPS and deployment secrets before production use.

## Demo flow
1. Open the dashboard.
2. Show KPI cards and the high/critical alert list.
3. Click **Investigate** on an alert to see the connected graph path.
4. Run **Shared-device investigation** to demonstrate a graph-specific query.
5. Update an alert status and refresh the dashboard.
6. Open Neo4j Browser and run queries from `cypher/queries.cypher`.

## Suggested viva explanation
Oracle is well suited to structured records, constraints and transactional operations. Neo4j is added for relationship-heavy investigation queries. It represents entities as nodes and links as relationships, allowing multi-hop traversal without repeatedly writing SQL joins. Neo4j complements Oracle in this project; it does not universally replace relational databases.
"# FraudDetection" 
