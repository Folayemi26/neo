// app/services/storage/RescueLogger.js
// Tracks rescue-related events for analytics

import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "neo_rescue_events";

class RescueLogger {
  async _getAll() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  async _save(all) {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // ignore
    }
  }

  async logEvent(type, payload = {}) {
    const events = await this._getAll();
    const event = {
      id: `rescue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type, // "ACCEPT" | "ARRIVED"
      timestamp: new Date().toISOString(),
      ...payload,
    };
    events.push(event);
    await this._save(events);
    console.log("[Neo][RescueLogger] 📄 Event logged:", event);
    
    // Auto-sync to backend if available (using dynamic import to avoid circular dependency)
    try {
      // Try to import RescueSync directly (no circular dependency)
      const RescueSync = (await import("./RescueSync")).default;
      RescueSync.autoSync(event).catch((err) => {
        console.error("[Neo][RescueLogger] Auto-sync failed:", err);
      });
    } catch (importError) {
      // RescueSync not available, skip auto-sync
      console.log("[Neo][RescueLogger] Auto-sync not available");
    }
    
    return event;
  }

  async logStartRescue({ alertId, reliefId, helperId, distanceKm, etaMinutes }) {
    return this.logEvent("ACCEPT", {
      alertId,
      reliefId: reliefId || null,
      helperId,
      distanceKm,
      etaMinutes,
    });
  }

  async logArrival({ alertId, reliefId, helperId }) {
    return this.logEvent("ARRIVED", {
      alertId,
      reliefId: reliefId || null,
      helperId,
    });
  }

  async getAllEvents() {
    return this._getAll();
  }

  async clear() {
    await this._save([]);
    console.log("[Neo][RescueLogger] 🧹 Cleared rescue log");
  }
}

export default new RescueLogger();

