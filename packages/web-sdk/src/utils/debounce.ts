export function debounce(callback: (...args: any[]) => void, delay: number) {
  let timeout: any;

  return (...args: Parameters<typeof callback>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      callback(...args);
    }, delay);
  };
}
