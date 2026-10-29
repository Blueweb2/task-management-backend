/**
 * Standalone Atlas connectivity test.
 * Run with: node src/utils/verify-connection.js
 * Checks DNS + MongoDB reachability without modifying any data.
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

// DNS override — must be before any network require
const _dnsServers = process.env.MONGO_DNS_SERVERS
  ? process.env.MONGO_DNS_SERVERS.split(",").map((s) => s.trim()).filter(Boolean)
  : [];
if (_dnsServers.length > 0) {
  const dns = require("dns");
  dns.setServers(_dnsServers);
  console.log(`[DNS] Global resolver overridden: [${_dnsServers.join(", ")}]`);
}

const mongoose = require("mongoose");

async function verifyConnection() {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) {
      console.error("[FAIL] MONGO_URI is not set in .env");
      process.exit(1);
    }

    // Log the database name without exposing credentials
    const dbMatch = uri.match(/\/([^/?]+)(\?|$)/);
    const dbName = dbMatch ? dbMatch[1] : "(default)";
    console.log(`[DB]  Target database: ${dbName}`);
    console.log("[DB]  Connecting to Atlas...");

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });

    const state = mongoose.connection.readyState;
    console.log(`[DB]  Connection state: ${state === 1 ? "✅ connected" : "❌ not connected (state=" + state + ")"}`);

    // Ping the deployment
    const adminDb = mongoose.connection.db.admin();
    const pingResult = await adminDb.ping();
    console.log(`[DB]  Ping result: ${JSON.stringify(pingResult)}`);

    await mongoose.disconnect();
    console.log("[DB]  Disconnected cleanly. Atlas is reachable ✅");
    process.exit(0);
  } catch (err) {
    console.error("[FAIL] Connection error:", err.message);
    process.exit(1);
  }
}

verifyConnection();
