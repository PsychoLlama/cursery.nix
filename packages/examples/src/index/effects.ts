export default {
  copy: (text: string) => navigator.clipboard.writeText(text),
  sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
};
