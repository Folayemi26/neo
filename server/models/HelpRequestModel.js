// server/models/HelpRequestModel.js
const fs = require("fs");
const path = require("path");

// Keyword triage lives in utils/keywordTriage.js so the AI analyzer and this
// model share one implementation rather than keeping divergent copies.
const { summarizeHelpRequest, analyzePriority } = require("../utils/keywordTriage");

const DB_PATH = path.join(__dirname, "../../data/helpRequests.json");
const DATA_DIR = path.dirname(DB_PATH);

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ requests: [] }, null, 2));
  }
  const data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  if (!data.requests) {
    data.requests = [];
    save(data);
  }
  return data;
}

function save(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

module.exports = {
  async add(request) {
    const data = load();
    
    // Generate ID if not provided
    if (!request.id) {
      request.id = `help-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    }
    
    // Ensure timestamp
    if (!request.timestamp) {
      request.timestamp = new Date().toISOString();
    }
    
    // Summarize help nature from message
    if (request.message && !request.natureOfHelp) {
      request.natureOfHelp = summarizeHelpRequest(request.message);
    }
    
    // Analyze priority from message
    if (request.message && !request.priority) {
      request.priority = analyzePriority(request.message);
    }
    
    // Default status
    if (!request.status) {
      request.status = "pending"; // pending, accepted, fulfilled, cancelled
    }
    
    data.requests.push(request);
    save(data);
    console.log("[Neo][HelpRequestModel] 📄 Help request added:", request.id);
    return request;
  },

  async all() {
    const data = load();
    return data.requests;
  },

  async getById(id) {
    const data = load();
    return data.requests.find((r) => r.id === id) || null;
  },

  async getPending() {
    const data = load();
    return data.requests.filter((r) => r.status === "pending" || r.status === "accepted");
  },

  async getActive() {
    const data = load();
    // Active requests are those that haven't been fulfilled or cancelled
    return data.requests.filter((r) => r.status !== "fulfilled" && r.status !== "cancelled");
  },

  async getByStatus(status) {
    const data = load();
    return data.requests.filter((r) => r.status === status);
  },

  async updateStatus(id, status) {
    const data = load();
    const request = data.requests.find((r) => r.id === id);
    if (request) {
      request.status = status;
      request.updatedAt = new Date().toISOString();
      save(data);
      return request;
    }
    return null;
  },

  async getRecent(limit = 50) {
    const data = load();
    return data.requests
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  },

  async clear() {
    save({ requests: [] });
    console.log("[Neo][HelpRequestModel] 🧹 Cleared all help requests");
    return { success: true };
  },
};

