/// <reference types="vite/client" />

declare module "bootstrap" {
  export class Modal {
    static getOrCreateInstance(element: Element): Modal;
    static getInstance(element: Element): Modal | null;
    show(): void;
    hide(): void;
  }
}
