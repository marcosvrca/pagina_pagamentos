/// <reference types="vite/client" />

declare global {
  interface Window {
    bootstrap: {
      Modal: {
        getOrCreateInstance(element: Element): { show(): void; hide(): void };
        getInstance(element: Element): { hide(): void } | null;
      };
    };
  }
}

export {};
