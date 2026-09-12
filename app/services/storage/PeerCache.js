// app/services/storage/PeerCache.js
import AsyncStorage from "@react-native-async-storage/async-storage";

const PEER_STORAGE_KEY = "@neo_peers";

// 🧠 Save a peer to local storage
export const storePeer = async (peer) => {
  try {
    const existingPeers = await getAllPeers();
    // Check if peer already exists
    const updatedPeers = existingPeers.find((p) => p.id === peer.id)
      ? existingPeers
      : [...existingPeers, peer];
    await AsyncStorage.setItem(PEER_STORAGE_KEY, JSON.stringify(updatedPeers));
    console.log(`[Neo] 💾 Stored peer: ${peer.name}`);
  } catch (err) {
    console.error("❌ Error storing peer:", err);
  }
};

// 📦 Retrieve all peers
export const getAllPeers = async () => {
  try {
    const peers = await AsyncStorage.getItem(PEER_STORAGE_KEY);
    return peers ? JSON.parse(peers) : [];
  } catch (err) {
    console.error("❌ Error getting peers:", err);
    return [];
  }
};

// 🧹 Clear all peers
export const clearPeers = async () => {
  try {
    await AsyncStorage.removeItem(PEER_STORAGE_KEY);
    console.log("[Neo] 🧹 All peers cleared.");
  } catch (err) {
    console.error("❌ Error clearing peers:", err);
  }
};

// ⏳ Remove peers older than a certain number of minutes (default 60)
export const removeOldPeers = async (minutes = 60) => {
  try {
    const peers = await getAllPeers();
    const now = new Date();
    const validPeers = peers.filter((p) => {
      const timestamp = new Date(p.timestamp);
      const age = (now - timestamp) / 1000 / 60; // minutes
      return age <= minutes;
    });
    await AsyncStorage.setItem(PEER_STORAGE_KEY, JSON.stringify(validPeers));
    console.log(`[Neo] 🧭 Cleaned peers older than ${minutes} mins.`);
  } catch (err) {
    console.error("❌ Error cleaning old peers:", err);
  }
};
