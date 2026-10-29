require("dotenv").config();
const connectDB = require("./src/config/db");

connectDB()
  .then(() => {
    console.log("VERIFY:OK — Atlas connection established with scoped DNS resolver.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("VERIFY:FAIL —", err.message);
    process.exit(1);
  });
