const mongoose = require("mongoose");

/**
 * Connects to MongoDB using the MONGO_URI environment variable.
 *
 * DNS server override (MONGO_DNS_SERVERS) is applied globally at the process
 * entry point (server.js) via dns.setServers() *before* this module is loaded,
 * so the MongoDB driver's SRV resolution automatically uses the correct DNS.
 * No URI manipulation is performed here.
 */
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
    });

    console.log("[DB] MongoDB connected successfully");
  } catch (error) {
    // Never log the full MONGO_URI — it contains credentials.
    console.error("[DB] MongoDB connection failed:", error.message);
    if (
      error.message.includes("ENOTFOUND") ||
      error.message.includes("ECONNREFUSED")
    ) {
      console.error(
        "[DB] 💡 DNS Hint: If Atlas SRV resolution fails with system DNS, set " +
          "MONGO_DNS_SERVERS=8.8.8.8,8.8.4.4 in your .env file to use Google DNS."
      );
    }
    process.exit(1);
  }
};

module.exports = connectDB;