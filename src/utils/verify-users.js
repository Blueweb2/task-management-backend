/**
 * Robust post-seed DB check.
 * Writes result to verify-db-result.json — always, even on error.
 */
process.on("uncaughtException", (err) => {
  const fs = require("fs");
  const path = require("path");
  const out = { error: err.message, stack: err.stack };
  fs.writeFileSync(
    path.resolve(__dirname, "../../verify-db-result.json"),
    JSON.stringify(out, null, 2)
  );
  process.exit(1);
});

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const _dns = process.env.MONGO_DNS_SERVERS
  ? process.env.MONGO_DNS_SERVERS.split(",").map((s) => s.trim()).filter(Boolean)
  : [];
if (_dns.length > 0) {
  const dns = require("dns");
  dns.setServers(_dns);
}

const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const OUT = path.resolve(__dirname, "../../verify-db-result.json");

const User = require("../models/user.model");

const EXPECTED = [
  { email: "superadmin@taskmanagement.com", role: "superadmin" },
  { email: "manager@taskmanagement.com",    role: "manager"    },
  { email: "staff@taskmanagement.com",      role: "staff"      },
];

async function run() {
  const result = { atlas_connected: false, database: null, users: [], summary: "" };
  try {
    const uri = process.env.MONGO_URI;
    const dbMatch = uri && uri.match(/\/([^/?]+)(\?|$)/);
    result.database = dbMatch ? dbMatch[1] : "test (no db name in URI)";

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    result.atlas_connected = true;

    for (const expected of EXPECTED) {
      const doc = await User.findOne({ email: expected.email })
        .select("email role username isActive");
      if (doc) {
        result.users.push({
          email: doc.email,
          username: doc.username,
          role: doc.role,
          isActive: doc.isActive,
          roleMatch: doc.role === expected.role,
          status: doc.role === expected.role ? "OK" : "ROLE_MISMATCH",
        });
      } else {
        result.users.push({ email: expected.email, status: "NOT_FOUND" });
      }
    }

    await mongoose.disconnect();

    const allOk = result.users.every((u) => u.status === "OK");
    result.summary = allOk
      ? "All 3 users exist with correct roles."
      : "One or more users missing or have wrong role.";
  } catch (err) {
    result.error = err.message;
    result.summary = "FAILED: " + err.message;
  }

  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  process.exit(result.atlas_connected ? 0 : 1);
}

run();
