import { describe, expect, it } from "vitest";
import {
  JPEG_QUALITIES,
  MAX_VIDEO_TO_CONVERT_BYTES,
  captionProblem,
  convertedVideoProblem,
  photoPlan,
  pickedPhotoProblem,
  videoNeedsMp4,
  visualBody,
  visualExtension,
  visualMime,
  visualMimeFromExtension,
  visualUploadProblem,
} from "@/lib/outgoingVisual";
import { metaAttachment, metaFollowUpText, whatsappMediaContent } from "@/lib/mediaSend";
import { outgoingBody, uploadProblem } from "@/lib/outgoingMedia";

// Photos and videos a person sends from Chat: which files each network takes.
describe("visualMime: what a picked photo or video is", () => {
  it("reads the browser's type", () => {
    expect(visualMime("image/jpeg", "IMG_1.jpg")).toEqual({ kind: "image", mime: "image/jpeg" });
    expect(visualMime("video/mp4", "clip.mp4")).toEqual({ kind: "video", mime: "video/mp4" });
    expect(visualMime("video/quicktime", "IMG_2.MOV")).toEqual({ kind: "video", mime: "video/quicktime" });
  });

  it("falls back to the file name when the phone gives no type", () => {
    expect(visualMime("", "foto.PNG")).toEqual({ kind: "image", mime: "image/png" });
    expect(visualMime("", "IMG_9.HEIC")).toEqual({ kind: "image", mime: "image/heic" });
    expect(visualMime("", "video.3gp")).toEqual({ kind: "video", mime: "video/3gpp" });
  });

  it("refuses anything that isn't a photo or video", () => {
    expect(visualMime("application/pdf", "a.pdf")).toBeNull();
    expect(visualMime("", "virus.exe")).toBeNull();
    expect(visualMime("image/svg+xml", "logo.svg")).toBeNull();
  });
});

describe("visualUploadProblem: each network's limits", () => {
  const MB = 1024 * 1024;
  const photo = { mime: "image/jpeg", filename: "foto.jpg" };
  const video = { mime: "video/mp4", filename: "video.mp4" };

  it("WhatsApp: photos up to 5 MB, videos up to 16 MB", () => {
    expect(visualUploadProblem({ ...photo, channelType: "whatsapp", size: 5 * MB })).toBeNull();
    expect(visualUploadProblem({ ...photo, channelType: "whatsapp", size: 5 * MB + 1 })).toMatch(/5 MB/);
    expect(visualUploadProblem({ ...video, channelType: "whatsapp", size: 16 * MB })).toBeNull();
    expect(visualUploadProblem({ ...video, channelType: "whatsapp", size: 16 * MB + 1 })).toMatch(/16 MB/);
  });

  it("Instagram and Messenger: photos up to 8 MB, videos up to 25 MB", () => {
    for (const channelType of ["instagram", "facebook"] as const) {
      expect(visualUploadProblem({ ...photo, channelType, size: 8 * MB })).toBeNull();
      expect(visualUploadProblem({ ...photo, channelType, size: 8 * MB + 1 })).toMatch(/8 MB/);
      expect(visualUploadProblem({ ...video, channelType, size: 25 * MB })).toBeNull();
      expect(visualUploadProblem({ ...video, channelType, size: 25 * MB + 1 })).toMatch(/25 MB/);
    }
  });

  it("only JPEG or PNG photos go up (the browser redraws the rest)", () => {
    expect(visualUploadProblem({ channelType: "whatsapp", mime: "image/png", filename: "a.png", size: MB })).toBeNull();
    expect(visualUploadProblem({ channelType: "whatsapp", mime: "image/heic", filename: "a.heic", size: MB })).toMatch(/foto/i);
  });

  it("iPhone and webm videos may be bigger: the server makes them MP4 first", () => {
    const mov = { channelType: "whatsapp" as const, mime: "video/quicktime", filename: "IMG.MOV" };
    expect(visualUploadProblem({ ...mov, size: 40 * MB })).toBeNull();
    expect(visualUploadProblem({ ...mov, size: MAX_VIDEO_TO_CONVERT_BYTES + 1 })).toMatch(/video/);
  });

  it("refuses empty files and non-media", () => {
    expect(visualUploadProblem({ ...photo, channelType: "whatsapp", size: 0 })).toBe("El archivo está vacío.");
    expect(visualUploadProblem({ channelType: "whatsapp", mime: "application/pdf", filename: "a.pdf", size: MB })).toMatch(
      /foto o un video/,
    );
  });

  it("refuses a picked photo too big to even open", () => {
    expect(pickedPhotoProblem(39 * MB)).toBeNull();
    expect(pickedPhotoProblem(41 * MB)).toMatch(/muy pesada/);
  });

  it("checks a converted video against the network's limit", () => {
    expect(videoNeedsMp4("video/quicktime")).toBe(true);
    expect(videoNeedsMp4("video/webm")).toBe(true);
    expect(videoNeedsMp4("video/mp4")).toBe(false);
    expect(videoNeedsMp4("video/3gpp")).toBe(false);
    expect(convertedVideoProblem("whatsapp", 17 * MB)).toMatch(/16 MB/);
    expect(convertedVideoProblem("instagram", 17 * MB)).toBeNull();
  });
});

describe("photoPlan: when the browser shrinks a photo", () => {
  const MB = 1024 * 1024;

  it("sends a small JPEG or PNG as it is", () => {
    expect(photoPlan({ mime: "image/jpeg", size: 400_000, width: 1200, height: 900 })).toEqual({ redraw: false });
    expect(photoPlan({ mime: "image/png", size: 800_000, width: 1600, height: 1600 })).toEqual({ redraw: false });
  });

  it("shrinks a big phone photo to 1600 px on its long side, keeping its shape", () => {
    expect(photoPlan({ mime: "image/jpeg", size: 4 * MB, width: 4032, height: 3024 })).toEqual({
      redraw: true,
      width: 1600,
      height: 1200,
    });
    expect(photoPlan({ mime: "image/jpeg", size: 3 * MB, width: 3024, height: 4032 })).toEqual({
      redraw: true,
      width: 1200,
      height: 1600,
    });
  });

  it("re-encodes a heavy photo that is already small in pixels", () => {
    expect(photoPlan({ mime: "image/png", size: 3 * MB, width: 1000, height: 800 })).toEqual({
      redraw: true,
      width: 1000,
      height: 800,
    });
  });

  it("always redraws formats the networks don't take (iPhone HEIC, WebP, GIF)", () => {
    expect(photoPlan({ mime: "image/heic", size: 200_000, width: 800, height: 600 })).toEqual({
      redraw: true,
      width: 800,
      height: 600,
    });
    expect(photoPlan({ mime: "image/webp", size: 50_000, width: 300, height: 300 }).redraw).toBe(true);
  });

  it("lowers the JPEG quality step by step until the photo fits", () => {
    expect(JPEG_QUALITIES[0]).toBeGreaterThan(JPEG_QUALITIES[JPEG_QUALITIES.length - 1]);
  });
});

describe("what goes to Meta for a photo or video", () => {
  const photo = { kind: "image" as const, bytes: Buffer.from("x"), mime: "image/jpeg", url: "https://signed/photo.jpg" };
  const video = { kind: "video" as const, bytes: Buffer.from("x"), mime: "video/mp4", url: "https://signed/v.mp4" };

  it("WhatsApp sends the uploaded id with the caption under it", () => {
    expect(whatsappMediaContent({ ...photo, caption: "Camisa talla M" }, "MEDIA1")).toEqual({
      type: "image",
      image: { id: "MEDIA1", caption: "Camisa talla M" },
    });
    expect(whatsappMediaContent(video, "MEDIA2")).toEqual({ type: "video", video: { id: "MEDIA2" } });
  });

  it("Instagram/Messenger get the file by link, the caption as its own text", () => {
    expect(metaAttachment(photo)).toEqual({ type: "image", payload: { url: "https://signed/photo.jpg", is_reusable: false } });
    expect(metaAttachment(video)).toEqual({ type: "video", payload: { url: "https://signed/v.mp4", is_reusable: false } });
    expect(metaFollowUpText({ ...photo, caption: "  Así queda " })).toBe("Así queda");
    expect(metaFollowUpText(photo)).toBeNull();
  });

  it("voice notes and documents keep working as before", () => {
    expect(whatsappMediaContent({ kind: "voice", ogg: Buffer.from("x"), m4aUrl: "u" }, "V")).toEqual({
      type: "audio",
      audio: { id: "V", voice: true },
    });
    expect(metaAttachment({ kind: "document", bytes: Buffer.from("x"), mime: "application/pdf", filename: "a.pdf", url: "d" })).toEqual({
      type: "file",
      payload: { url: "d", is_reusable: false },
    });
  });
});

describe("the shared upload rules know photos and videos", () => {
  it("uploadProblem and outgoingBody take image/video", () => {
    expect(uploadProblem({ kind: "image", channelType: "whatsapp", mime: "image/jpeg", size: 1000, filename: "a.jpg" })).toBeNull();
    expect(uploadProblem({ kind: "image", channelType: "whatsapp", mime: "video/mp4", size: 1000, filename: "a.mp4" })).toMatch(
      /foto/,
    );
    expect(uploadProblem({ kind: "video", channelType: "whatsapp", mime: "video/mp4", size: 17 * 1024 * 1024, filename: "a.mp4" })).toMatch(
      /16 MB/,
    );
    expect(outgoingBody("image", undefined, "Hola")).toBe("📷 Hola");
    expect(outgoingBody("video")).toBe("🎥 Video");
    expect(outgoingBody("document", "a.pdf")).toBe("📄 a.pdf");
  });
});

describe("captions and the saved text", () => {
  it("WhatsApp captions have up to 1024 characters", () => {
    expect(captionProblem("whatsapp", "x".repeat(1024))).toBeNull();
    expect(captionProblem("whatsapp", "x".repeat(1025))).toMatch(/1024/);
    // Instagram/Messenger: the text goes as its own message after the photo.
    expect(captionProblem("instagram", "x".repeat(1000))).toBeNull();
    expect(captionProblem("instagram", "x".repeat(1001))).toMatch(/1000/);
    expect(captionProblem("facebook", "x".repeat(2000))).toBeNull();
    expect(captionProblem("facebook", "x".repeat(2001))).toMatch(/2000/);
  });

  it("keeps the same words the webhooks use for received media", () => {
    expect(visualBody("image")).toBe("📷 Foto");
    expect(visualBody("image", "  Camisa talla M ")).toBe("📷 Camisa talla M");
    expect(visualBody("video")).toBe("🎥 Video");
    expect(visualBody("video", "Así queda")).toBe("🎥 Así queda");
  });

  it("names the uploaded file by its type", () => {
    expect(visualExtension("image/jpeg")).toBe("jpg");
    expect(visualExtension("image/png")).toBe("png");
    expect(visualExtension("video/mp4")).toBe("mp4");
    expect(visualExtension("video/quicktime")).toBe("mov");
    expect(visualExtension("video/3gpp")).toBe("3gp");
    expect(visualExtension("text/html")).toBeNull();
    // And back, for the server (it only trusts the path it made).
    expect(visualMimeFromExtension("mov")).toBe("video/quicktime");
    expect(visualMimeFromExtension("exe")).toBeNull();
  });
});
