import { videoBrief } from "./planner.js";
import { styleOf } from "./styles.js";
export function videoRequest(data) {
  const d = data ?? {},
    actions = [
      "status",
      "plan",
      "share",
      "character",
      "scene",
      "generate",
      "poll",
      "cancel",
    ];
  if (!actions.includes(d.action)) throw Error("Choose a video action.");
  const str = (v, n) =>
    typeof v === "string" && v.length <= n ? v.trim() : "";
  const ids = (v) =>
    Array.isArray(v) &&
    v.length <= 12 &&
    v.every((x) => typeof x === "string" && /^[\w-]{1,100}$/.test(x))
      ? [...new Set(v)]
      : [];
  const result = {
    action: d.action,
    ...(d.action === "plan" ? {brief:videoBrief(d.brief)} : {}),
    visualStyle: styleOf(d.visualStyle).id,
    requestId: str(d.requestId, 100),
    prompt: str(d.prompt, 3000),
    voice: str(d.voice, 200),
    name: str(d.name, 100),
    assetId: str(d.assetId, 100),
    jobId: str(d.jobId, 100),
    org: str(d.org, 100),
    readers: ids(d.readers),
    references: ids(d.references),
    duration: d.duration === 10 ? 10 : 5,
    ratio: d.ratio === "720:1280" ? "720:1280" : "1280:720",
  };
  if (
    ["generate", "character", "scene", "plan"].includes(d.action) &&
    ((d.action !== "plan" && !result.prompt) || !/^[\w-]{8,100}$/.test(result.requestId))
  )
    throw Error("Add a description and start a new request.");
  if (
    ["share"].includes(d.action) &&
    (!result.assetId ||
      !Array.isArray(d.readers) ||
      d.readers.length > 50 ||
      !d.readers.every((x) => /^[\w-]{1,100}$/.test(x)))
  )
    throw Error("Choose a valid asset and up to 50 colleagues.");
  if (
    ["poll", "cancel"].includes(d.action) &&
    !/^[\w-]{8,100}$/.test(result.jobId)
  )
    throw Error("Choose a valid generation.");
  if (
    ["share", "poll", "cancel"].includes(d.action) &&
    !/^[\w-]{1,100}$/.test(result.assetId || result.jobId)
  )
    throw Error("Choose a valid item.");
  if (d.action === "share") result.readers = [...new Set(d.readers)];
  if (
    d.references !== undefined &&
    (!Array.isArray(d.references) ||
      result.references.length !== new Set(d.references).size)
  )
    throw Error("Choose valid character references.");
  return result;
}
export const videoBody = (d) => ({
  model: "gen4.5",
  promptText: d.prompt,
  ratio: d.ratio,
  duration: d.duration,
  ...(d.image ? { promptImage: d.image } : {}),
});
export async function runway(
  key,
  path,
  body,
  method = body ? "POST" : "GET",
  fetchImpl = fetch,
) {
  const response = await fetchImpl(`https://api.dev.runwayml.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-Runway-Version": "2024-11-06",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok)
    throw Error(
      response.status === 429
        ? "The video service is busy. Try again shortly."
        : response.status === 401
          ? "The video service needs its API connection checked."
          : "The video service could not finish that request. Your project is still here.",
    );
  return response.status === 204 ? {} : await response.json();
}
export async function characterImage(
  key,
  prompt,
  images = [],
  fetchImpl = fetch,
) {
  const response = await fetchImpl(
    `https://api.openai.com/v1/images/${images.length ? "edits" : "generations"}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-2.5-sunburst",
        prompt,
        size: "1536x1024",
        quality: "medium",
        output_format: "png",
        n: 1,
        ...(images.length
          ? { images: images.map((image_url) => ({ image_url })) }
          : {}),
      }),
      signal: AbortSignal.timeout(240000),
    },
  );
  if (!response.ok)
    throw Error(
      response.status === 429
        ? "The picture service is busy. Try again shortly."
        : "The picture service could not make that image. Your references are unchanged.",
    );
  const body = await response.json(),
    data = body.data?.[0]?.b64_json;
  if (
    typeof data !== "string" ||
    !data.length ||
    data.length > 28 * 1024 * 1024
  )
    throw Error("The picture service returned an invalid image.");
  return Buffer.from(data, "base64");
}
