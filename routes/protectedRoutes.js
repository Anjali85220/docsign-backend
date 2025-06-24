const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth"); // ✅ Import the auth middleware

// 🔒 Protected Route Example
router.get("/protected", auth, (req, res) => {
  res.send(`This is a protected route. User ID: ${req.user}`);
});

module.exports = router;
