import { createWorkerHandler } from "./worker-runtime";
import type { WorkerRequest, WorkerResponse } from "./types";

const handle = createWorkerHandler(
  (url) => fetch(url),
  (response: WorkerResponse) => self.postMessage(response),
);

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  void handle(event.data);
});
