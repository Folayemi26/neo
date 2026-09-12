// server/routes/demo.js
const express = require("express");
const router = express.Router();
const DemoController = require("../controllers/DemoController");

// POST /api/demo/emergencies - Send an emergency through the simulated relay
router.post("/emergencies", DemoController.sendEmergency);

// GET /api/demo/emergencies - List demo emergencies this session
router.get("/emergencies", DemoController.listEmergencies);

// GET /api/demo/emergencies/:id - Follow one emergency's relay progress
router.get("/emergencies/:id", DemoController.getEmergency);

// GET /api/demo/network - Topology and event log for the network view
router.get("/network", DemoController.getNetwork);

// POST /api/demo/reset - Clear demo data only
router.post("/reset", DemoController.resetDemo);

module.exports = router;
