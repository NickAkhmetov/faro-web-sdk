type StorageMechanism = 'sessionStorage' | 'localStorage';

function isWebStorageAvailable(type: StorageMechanism): boolean {
  try {
    let storage;
    storage = window[type];

    const testItem = '__faro_storage_test__';
    storage.setItem(testItem, testItem);
    storage.removeItem(testItem);
    return true;
  } catch (e) {
    // the above can throw
    // TODO: Log
    return false;
  }
}

export const localStorageAvailable = isWebStorageAvailable('localStorage');

export function getItem(key: string): string | null {
  if (localStorageAvailable) {
    return localStorage.getItem(key);
  }

  return null;
}

export function setItem(key: string, value: string): void {
  if (localStorageAvailable) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      // TODO: debug log
    }
  }
}

export function removeItem(key: string): void {
  if (localStorageAvailable) {
    localStorage.removeItem(key);
  }
}
