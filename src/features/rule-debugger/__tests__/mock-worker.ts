import { vi } from "vitest";
import type { WorkerRequest, WorkerResponse } from "../types";

export class MockWorker extends EventTarget {
  static instances: MockWorker[] = [];
  requests: WorkerRequest[] = [];
  terminate = vi.fn();
  constructor() {
    super();
    MockWorker.instances.push(this);
  }
  postMessage(request: WorkerRequest) {
    this.requests.push(request);
  }
  respond(response: WorkerResponse) {
    this.dispatchEvent(new MessageEvent("message", { data: response }));
  }
  latest(type: WorkerRequest["type"]) {
    return this.requests.filter((request) => request.type === type).at(-1)!;
  }
}
