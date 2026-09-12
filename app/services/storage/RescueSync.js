// app/services/storage/RescueSync.js
// Syncs rescue events from mobile app to backend server
// Note: Does NOT import RescueLogger to avoid circular dependency

// API Base URL - update this to match your server
// For Android emulator, use: http://10.0.2.2:4000
// For iOS simulator, use: http://localhost:4000
// For physical device, use your computer's IP: http://192.168.1.X:4000
const API_BASE_URL = "http://localhost:4000";

class RescueSync {
  /**
   * Sync all rescue events to the backend server
   * @param {Array} events - Array of rescue events to sync
   * @returns {Promise<{success: number, failed: number}>}
   */
  async syncAll(events) {
    try {
      if (!events || events.length === 0) {
        console.log("[Neo][RescueSync] No events to sync");
        return { success: 0, failed: 0 };
      }

      let success = 0;
      let failed = 0;

      for (const event of events) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/rescues`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(event),
          });

          if (response.ok) {
            success++;
            console.log(
              `[Neo][RescueSync] ✅ Synced event: ${event.id} (${event.type})`
            );
          } else {
            failed++;
            console.error(
              `[Neo][RescueSync] ❌ Failed to sync event: ${event.id}`,
              await response.text()
            );
          }
        } catch (error) {
          failed++;
          console.error(
            `[Neo][RescueSync] ❌ Error syncing event: ${event.id}`,
            error
          );
        }
      }

      console.log(
        `[Neo][RescueSync] 📊 Sync complete: ${success} succeeded, ${failed} failed`
      );

      return { success, failed };
    } catch (error) {
      console.error("[Neo][RescueSync] ❌ Sync error:", error);
      return { success: 0, failed: 0 };
    }
  }

  /**
   * Sync a single rescue event
   * @param {Object} event - Rescue event to sync
   * @returns {Promise<boolean>}
   */
  async syncEvent(event) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rescues`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      });

      if (response.ok) {
        console.log(
          `[Neo][RescueSync] ✅ Synced event: ${event.id} (${event.type})`
        );
        return true;
      } else {
        console.error(
          `[Neo][RescueSync] ❌ Failed to sync event: ${event.id}`,
          await response.text()
        );
        return false;
      }
    } catch (error) {
      console.error(
        `[Neo][RescueSync] ❌ Error syncing event: ${event.id}`,
        error
      );
      return false;
    }
  }

  /**
   * Check if server is available
   * @returns {Promise<boolean>}
   */
  async checkServerAvailability() {
    try {
      const response = await fetch(`${API_BASE_URL}/health`, {
        method: "GET",
        timeout: 5000,
      });
      return response.ok;
    } catch (error) {
      console.log("[Neo][RescueSync] Server not available:", error.message);
      return false;
    }
  }

  /**
   * Auto-sync when events are logged (call this after RescueLogger.logEvent)
   * @param {Object} event - The event that was just logged
   */
  async autoSync(event) {
    try {
      const isAvailable = await this.checkServerAvailability();
      if (isAvailable) {
        await this.syncEvent(event);
      } else {
        console.log(
          "[Neo][RescueSync] Server unavailable, event will be synced later"
        );
      }
    } catch (error) {
      console.error("[Neo][RescueSync] Auto-sync error:", error);
    }
  }
}

export default new RescueSync();

