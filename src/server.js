require("dotenv").config();

// ─── DNS Override ─────────────────────────────────────────────────────────────
// Must be applied BEFORE any module that performs network I/O (mongoose, http,
// socket.io, etc.) is required, so that Node's global dns resolver uses the
// override servers for ALL lookups — including the SRV record resolution that
// the MongoDB driver performs for mongodb+srv:// connection strings.
//
// Set MONGO_DNS_SERVERS=8.8.8.8,8.8.4.4 in .env to enable.
// Leave unset (or empty) in production environments where DNS works correctly.
// ─────────────────────────────────────────────────────────────────────────────
const dnsServers = process.env.MONGO_DNS_SERVERS
  ? process.env.MONGO_DNS_SERVERS.split(",").map((s) => s.trim()).filter(Boolean)
  : [];

if (dnsServers.length > 0) {
  const dns = require("dns");
  dns.setServers(dnsServers);
  console.log(`[DNS] Global resolver overridden: [${dnsServers.join(", ")}]`);
}
// ─────────────────────────────────────────────────────────────────────────────

const http = require("http");
const app = require("./app");
const connectDB = require("./config/db");
const initializeSocket = require("./socket");
const { autoCheckoutEndedEventsStaff } = require("./services/autoCheckout.service");
const { autoCancelOverdueEstimates } = require("./services/estimate.service");

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();

    const server = http.createServer(app);
    const io = initializeSocket(server);

    // Initial check on server start for events/duties whose end time has already passed
    autoCheckoutEndedEventsStaff().catch((err) => {
      console.error("[Auto-Checkout] Initial run error:", err);
    });

    // Initial check to auto-cancel overdue unconverted estimates
    autoCancelOverdueEstimates().catch((err) => {
      console.error("[Auto-Cancel Estimates] Initial run error:", err);
    });

    // Check periodically every 60 seconds
    const AUTO_CHECKOUT_INTERVAL_MS = 60 * 1000;
    setInterval(() => {
      autoCheckoutEndedEventsStaff().catch((err) => {
        console.error("[Auto-Checkout] Periodic check error:", err);
      });
      autoCancelOverdueEstimates().catch((err) => {
        console.error("[Auto-Cancel Estimates] Periodic check error:", err);
      });
    }, AUTO_CHECKOUT_INTERVAL_MS);

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`⚡ Socket.IO server initialized successfully`);
      console.log(`🕒 Auto-checkout service active (checking every 60s)`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();