import type { TripTransport } from "./trip-response";

/** Same normalized boundary as a future Mahin adapter. No provider or Routes calls. */
export const demoTransport: TripTransport = {
  async request(command) {
    const response = await fetch("/demo/transport", {
      method: "POST", cache: "no-store", credentials: "same-origin",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(command),
    });
    if (!response.ok) throw new Error(`Demo transport unavailable (${response.status})`);
    return response.json();
  },
};
