require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

// ─── DNS Override ─────────────────────────────────────────────────────────────
// Standalone scripts (seed, migrate, etc.) do not go through server.js, so
// dns.setServers() must be applied here — before connectDB() is called — to
// allow Node's global resolver to reach Atlas SRV records on machines whose
// system DNS cannot resolve them (set MONGO_DNS_SERVERS=8.8.8.8,8.8.4.4).
// ─────────────────────────────────────────────────────────────────────────────
const _dnsServers = process.env.MONGO_DNS_SERVERS
  ? process.env.MONGO_DNS_SERVERS.split(",").map((s) => s.trim()).filter(Boolean)
  : [];
if (_dnsServers.length > 0) {
  const dns = require("dns");
  dns.setServers(_dnsServers);
  console.log(`[DNS] Global resolver overridden: [${_dnsServers.join(", ")}]`);
}
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const connectDB = require("../config/db");
const User = require("../models/user.model");

async function seed() {
  try {
    console.log("Connecting to MongoDB...");
    await connectDB();

    console.log("Checking seed users...");

    const isProduction = process.env.NODE_ENV === "production";
    const adminEmail = process.env.ADMIN_EMAIL || "manager@taskmanagement.com";
    const adminPassword = process.env.ADMIN_PASSWORD || (isProduction ? null : "manager123");

    if (isProduction && !process.env.ADMIN_PASSWORD) {
      console.warn("⚠️ Production Notice: ADMIN_PASSWORD environment variable not set. Skipping automatic admin provisioning.");
    }

    // 0. Seed Superadmin
    const superAdminEmail = process.env.SUPERADMIN_EMAIL || "superadmin@taskmanagement.com";
    const superAdminPassword = process.env.SUPERADMIN_PASSWORD || (isProduction ? null : "superadmin123");
    let superAdmin = await User.findOne({ email: superAdminEmail });
    if (!superAdmin && superAdminPassword) {
      const hashedSuperAdminPassword = await bcrypt.hash(superAdminPassword, 12);
      superAdmin = await User.create({
        name: process.env.SUPERADMIN_NAME || "System Superadmin",
        username: process.env.SUPERADMIN_USERNAME || "superadmin_master",
        email: superAdminEmail,
        password: hashedSuperAdminPassword,
        role: "superadmin",
        phone: process.env.SUPERADMIN_PHONE || "+1 555 010 0001",
        location: "New York, USA",
        department: "Executive System Administration",
        employmentType: "full-time",
        isActive: true,
      });
      console.log(`Created Superadmin account: ${superAdminEmail}`);
    } else if (superAdmin) {
      console.log(`Superadmin already exists: ${superAdminEmail}`);
    }

    // 1. Seed Manager
    let admin = await User.findOne({ email: adminEmail });
    if (!admin && adminPassword) {
      const hashedAdminPassword = await bcrypt.hash(adminPassword, 12);
      admin = await User.create({
        name: process.env.ADMIN_NAME || "Alex Morgan",
        username: process.env.ADMIN_USERNAME || "admin_alex",
        email: adminEmail,
        password: hashedAdminPassword,
        role: "manager",
        phone: process.env.ADMIN_PHONE || "+1 555 019 2831",
        location: "New York, USA",
        department: "Operations Management",
        employmentType: "full-time",
        isActive: true,
      });
      console.log(`Created manager account: ${adminEmail}`);
    } else if (admin) {
      console.log(`Manager already exists: ${adminEmail}`);
    }

    // 2. Seed Demo Staff
    let staff = await User.findOne({ email: "staff@taskmanagement.com" });
    if (!staff) {
      const hashedStaffPassword = await bcrypt.hash("staff123", 12);
      staff = await User.create({
        name: "Arun Kumar",
        username: "arun_staff",
        email: "staff@taskmanagement.com",
        password: hashedStaffPassword,
        role: "staff",
        phone: "+1 555 019 4482",
        location: "Brooklyn, NY",
        department: "Task Operations",
        employmentType: "full-time",
        isActive: true,
        createdBy: admin?._id || null,
      });
      console.log("Created demo staff account: staff@taskmanagement.com");
    } else {
      console.log("Staff already exists: staff@taskmanagement.com");
    }

    console.log("\n✅ Demo users seeded successfully!");
    console.log("==========================================");
    console.log("Superadmin: superadmin@taskmanagement.com  /  superadmin123");
    console.log("Manager:    manager@taskmanagement.com     /  manager123");
    console.log("Staff:      staff@taskmanagement.com       /  staff123");
    console.log("==========================================");

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("Seed error:", err);
    process.exit(1);
  }
}

seed();
