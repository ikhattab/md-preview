/**
 * Safely get item from localStorage
 */
export function getStorageItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.warn('localStorage not available:', e);
    return null;
  }
}

/**
 * Safely set item in localStorage
 */
export function setStorageItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn('localStorage not available:', e);
  }
}
