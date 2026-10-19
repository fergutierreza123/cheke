import { describe, expect, it } from "vitest";
import {
  coordsFromMapsLink,
  isShortMapsLink,
  locationSendPlan,
  mapsLinkFor,
  normalizeStoreLocation,
  type StoreLocation,
} from "@/lib/storeLocation";

describe("coordsFromMapsLink", () => {
  it("reads the pin from a place link (!3d…!4d…), preferring it over the map's centre", () => {
    const url =
      "https://www.google.com/maps/place/Tienda+Luna/@14.0800,-87.2000,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d14.0723!4d-87.1921";
    expect(coordsFromMapsLink(url)).toEqual({ latitude: 14.0723, longitude: -87.1921 });
  });

  it("reads the map's centre (@lat,lng) and ?q= / ?query= / ?ll= links", () => {
    expect(coordsFromMapsLink("https://www.google.com/maps/@15.5042,-88.0250,15z")).toEqual({
      latitude: 15.5042,
      longitude: -88.025,
    });
    expect(coordsFromMapsLink("https://maps.google.com/?q=14.1,-87.2")).toEqual({ latitude: 14.1, longitude: -87.2 });
    expect(coordsFromMapsLink("https://www.google.com/maps/search/?api=1&query=14.1%2C-87.2")).toEqual({
      latitude: 14.1,
      longitude: -87.2,
    });
    expect(coordsFromMapsLink("https://maps.google.com/maps?ll=14.1,-87.2&z=16")).toEqual({ latitude: 14.1, longitude: -87.2 });
  });

  it("accepts coordinates pasted on their own", () => {
    expect(coordsFromMapsLink("14.0723, -87.1921")).toEqual({ latitude: 14.0723, longitude: -87.1921 });
  });

  it("returns null when there are no coordinates or they are impossible", () => {
    expect(coordsFromMapsLink("https://maps.app.goo.gl/AbCdEf123")).toBeNull();
    expect(coordsFromMapsLink("https://www.google.com/maps?q=Tienda+Luna")).toBeNull();
    expect(coordsFromMapsLink("https://maps.google.com/?q=140,-87")).toBeNull();
    expect(coordsFromMapsLink("")).toBeNull();
  });
});

describe("isShortMapsLink", () => {
  it("spots the share links the Maps app gives (they need one redirect to read)", () => {
    expect(isShortMapsLink("https://maps.app.goo.gl/AbCdEf123")).toBe(true);
    expect(isShortMapsLink("https://goo.gl/maps/AbCd")).toBe(true);
    expect(isShortMapsLink("https://www.google.com/maps/@14,-87,15z")).toBe(false);
    expect(isShortMapsLink("https://evil.example/maps.app.goo.gl")).toBe(false);
  });
});

describe("normalizeStoreLocation", () => {
  it("keeps a Google Maps link and fills the pin from it", () => {
    const result = normalizeStoreLocation({
      address: "  Col. Palmira, frente al parque  ",
      mapsUrl: "https://www.google.com/maps/@14.1,-87.2,17z",
      latitude: null,
      longitude: null,
    });
    expect(result).toEqual({
      location: {
        address: "Col. Palmira, frente al parque",
        mapsUrl: "https://www.google.com/maps/@14.1,-87.2,17z",
        latitude: 14.1,
        longitude: -87.2,
      },
    });
  });

  it("refuses a link that isn't Google Maps", () => {
    expect(
      normalizeStoreLocation({ address: "", mapsUrl: "https://evil.example/x", latitude: null, longitude: null }).error,
    ).toBe("Pega un link de Google Maps (empieza con https://maps.app.goo.gl o https://www.google.com/maps).");
  });

  it("keeps a pin taken with «Usar mi ubicación actual» and drops impossible ones", () => {
    expect(normalizeStoreLocation({ address: "", mapsUrl: "", latitude: 14.07, longitude: -87.19 }).location).toEqual({
      address: "",
      mapsUrl: "",
      latitude: 14.07,
      longitude: -87.19,
    });
    expect(normalizeStoreLocation({ address: "", mapsUrl: "", latitude: 200, longitude: 0 }).location?.latitude).toBeNull();
  });
});

describe("mapsLinkFor", () => {
  const base: StoreLocation = { address: "", mapsUrl: "", latitude: null, longitude: null };

  it("uses the link the Tienda pasted, as is", () => {
    expect(mapsLinkFor({ ...base, mapsUrl: "https://maps.app.goo.gl/AbC", latitude: 14, longitude: -87 })).toBe(
      "https://maps.app.goo.gl/AbC",
    );
  });

  it("builds a link to the pin, or a search for the address", () => {
    expect(mapsLinkFor({ ...base, latitude: 14.0723, longitude: -87.1921 })).toBe(
      "https://www.google.com/maps/search/?api=1&query=14.0723%2C-87.1921",
    );
    expect(mapsLinkFor({ ...base, address: "Col. Palmira, Tegucigalpa" })).toBe(
      "https://www.google.com/maps/search/?api=1&query=Col.%20Palmira%2C%20Tegucigalpa",
    );
  });

  it("is null when the Tienda saved nothing", () => {
    expect(mapsLinkFor(base)).toBeNull();
  });
});

describe("locationSendPlan", () => {
  const full: StoreLocation = {
    address: "Col. Palmira, frente al parque",
    mapsUrl: "",
    latitude: 14.0723,
    longitude: -87.1921,
  };

  it("WhatsApp with a pin: a native location message, text kept for the chat", () => {
    expect(locationSendPlan("whatsapp", full, "Tienda Luna")).toEqual({
      location: { latitude: 14.0723, longitude: -87.1921, name: "Tienda Luna", address: "Col. Palmira, frente al parque" },
      text: "📍 Tienda Luna\nCol. Palmira, frente al parque\nhttps://www.google.com/maps/search/?api=1&query=14.0723%2C-87.1921",
    });
  });

  it("Instagram and Messenger: the same as text with the Google Maps link", () => {
    for (const type of ["instagram", "facebook"] as const) {
      expect(locationSendPlan(type, full, "Tienda Luna")).toEqual({
        location: null,
        text: "📍 Tienda Luna\nCol. Palmira, frente al parque\nhttps://www.google.com/maps/search/?api=1&query=14.0723%2C-87.1921",
      });
    }
  });

  it("WhatsApp without a pin (only an address): falls back to text", () => {
    const plan = locationSendPlan("whatsapp", { ...full, latitude: null, longitude: null }, "Tienda Luna");
    expect(plan?.location).toBeNull();
    expect(plan?.text).toBe(
      "📍 Tienda Luna\nCol. Palmira, frente al parque\nhttps://www.google.com/maps/search/?api=1&query=Col.%20Palmira%2C%20frente%20al%20parque",
    );
  });

  it("is null when the Tienda hasn't saved its location", () => {
    expect(locationSendPlan("whatsapp", { address: " ", mapsUrl: "", latitude: null, longitude: null }, "Tienda Luna")).toBeNull();
  });
});
