const express = require("express");
const router = express.Router();

const { register, login } = require("../controllers/authController");

// ✅ Only define routes here, don't generate tokens here
router.post("/register", register);
router.post("/login", login);

module.exports = router;
