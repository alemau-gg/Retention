// Self-contained Langdock custom-integration action.
// Searches files in a predefined SharePoint site or subfolder using Microsoft Graph Search.
const MAX_RETRIES = 3;
const FALLBACK_DELAY_S = 2;
const MAX_DELAY_MS = 30000;
const SHAREPOINT_SITE_URL =
  "https://basf.sharepoint.com/teams/CKRCorporateKnowledgeRetentionAgent";

async function graphRequest(options) {
  let rateLimitRetries = 0;
  while (true) {
    const response = await ld.request(options);

    if (response.status === 429) {
      if (rateLimitRetries >= MAX_RETRIES) {
        throw new Error(
          `Rate limited by Microsoft Graph (429) after ${MAX_RETRIES} retries`,
        );
      }
      rateLimitRetries++;
      const retryAfter = parseInt(
        response.headers?.["Retry-After"] ||
          response.headers?.["retry-after"],
        10,
      );
      await ld.wait(
        Math.min(
          (retryAfter && retryAfter > 0 ? retryAfter : FALLBACK_DELAY_S) * 1000,
          MAX_DELAY_MS,
        ),
      );
      continue;
    }

    return response;
  }
}

function isLikelyUrl(value) {
  if (!value || typeof value !== "string") return false;
  return /^https?:\/\//i.test(value.trim());
}

function encodeSharingUrl(url) {
  const toSharingId = (b64) =>
    "u!" + b64.replace(/=+$/g, "").replace(/\//g, "_").replace(/\+/g, "-");
  try {
    if (typeof btoa === "function") {
      return toSharingId(btoa(unescape(encodeURIComponent(url))));
    }
  } catch (_e) {}
  try {
    if (typeof Buffer !== "undefined" && Buffer.from) {
      return toSharingId(Buffer.from(url, "utf8").toString("base64"));
    }
  } catch (_e) {}
  return "";
}

function preferListItemTitle(item) {
  const title = item?.listItem?.fields?.Title;
  if (typeof title === "string" && title.trim().length > 0) {
    return title;
  }
  return item?.name || "";
}

function getMimeTypeFromFileName(fileName) {
  const extension = String(fileName || "").split(".").pop().toLowerCase();
  const mimeTypes = {
    txt: "text/plain",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pdf: "application/pdf",
    csv: "text/csv",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    json: "application/json",
    xml: "application/xml",
    aspx: "text/html",
    html: "text/html",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
    md: "text/markdown",
    mdx: "text/markdown",
    eml: "message/rfc822",
  };
  return mimeTypes[extension] || "application/octet-stream";
}

function getMimeType(item) {
  const graphMimeType = item?.file?.mimeType;
  if (graphMimeType && graphMimeType !== "application/octet-stream") {
    return graphMimeType;
  }
  return getMimeTypeFromFileName(item?.name || "");
}

function appendWebParam(url) {
  if (!url || typeof url !== "string") return url;
  return url.includes("?") ? `${url}&web=1` : `${url}?web=1`;
}

function normalizeUrl(url) {
  try {
    return encodeURI(decodeURI(url));
  } catch {
    return url;
  }
}

function hitIsInScope(hit, siteId, targetPathPrefix) {
  const resource = hit.resource;
  if (!resource) return false;

  // Strict site check if siteId is present
  if (
    siteId &&
    resource.parentReference?.siteId &&
    resource.parentReference.siteId !== siteId
  ) {
    return false;
  }

  // URL prefix check against the site + subfolder path
  if (targetPathPrefix) {
    const webUrl = (resource.webUrl || "").toLowerCase();
    let decodedWebUrl = webUrl;
    try {
      decodedWebUrl = decodeURI(webUrl).toLowerCase();
    } catch (_e) {}
    const decodedPrefix = decodeURI(targetPathPrefix).toLowerCase();

    if (
      !webUrl.startsWith(targetPathPrefix.toLowerCase()) &&
      !decodedWebUrl.startsWith(decodedPrefix)
    ) {
      return false;
    }
  }

  return true;
}

function mapHit(hit) {
  const { resource, summary } = hit;

  return {
    url: appendWebParam(normalizeUrl(resource.webUrl)),
    documentId: resource.id,
    title: resource.name,
    snippet: summary ? summary.replace(/<\/?c0>/g, "") : undefined,
    mimeType: getMimeType(resource),
    author: resource.createdBy?.user
      ? {
          id: resource.createdBy.user.email || resource.createdBy.user.id || "",
          name: resource.createdBy.user.displayName || "",
        }
      : undefined,
    createdDate: resource.createdDateTime,
    lastModifiedByAnyone: resource.lastModifiedDateTime,
    lastModifiedByUserId: resource.lastModifiedBy?.user
      ? {
          id:
            resource.lastModifiedBy.user.email ||
            resource.lastModifiedBy.user.id ||
            "",
          name: resource.lastModifiedBy.user.displayName || "",
          lastModifiedByUserIdDate: resource.lastModifiedDateTime,
        }
      : undefined,
    parent: resource.parentReference
      ? {
          id: resource.parentReference.id || "",
          title: resource.parentReference.path
            ? resource.parentReference.path.split("/").pop()
            : undefined,
          driveId: resource.parentReference.driveId || "",
          siteId: resource.parentReference.siteId || "",
        }
      : undefined,
  };
}

// 1. Resolve the hard-coded site scope and optional per-search subfolder.
const configuredSiteUrl = SHAREPOINT_SITE_URL.replace(/\/+$/, "");
const configuredSiteId = "";
const configuredSubfolder = "";
const inputSubfolder = (data.input.subfolder || "")
  .trim()
  .replace(/^\/+|\/+$/g, "");

// Build target path prefix combining site and subfolder
let effectivePath = configuredSiteUrl;
if (configuredSubfolder) {
  effectivePath += `/${configuredSubfolder}`;
}
if (inputSubfolder) {
  // If inputSubfolder already starts with configuredSubfolder, do not duplicate
  if (
    configuredSubfolder &&
    inputSubfolder.toLowerCase().startsWith(configuredSubfolder.toLowerCase())
  ) {
    effectivePath = `${configuredSiteUrl}/${inputSubfolder}`;
  } else {
    effectivePath += `/${inputSubfolder}`;
  }
}

const targetPathPrefix = effectivePath
  ? effectivePath.replace(/\/+$/, "") + "/"
  : "";

// Parse limit (default 25, max 100)
const rawLimit = Number(data.input.limit);
const limit =
  Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 25;

const entityTypes = ["driveItem"];
const queryString = data.input.query?.trim();

if (!queryString) {
  return [];
}

try {
  // If the query looks like a direct file URL, resolve it via Graph shares API
  if (isLikelyUrl(queryString)) {
    const encodedUrl = encodeSharingUrl(queryString);
    let item;
    if (encodedUrl) {
      let itemResult;
      try {
        itemResult = await graphRequest({
          method: "GET",
          url: `https://graph.microsoft.com/v1.0/shares/${encodedUrl}/driveItem?$expand=listItem($expand=fields)`,
          headers: {
            Authorization: `Bearer ${data.auth.access_token}`,
            Accept: "application/json",
          },
        });
      } catch (_e) {}
      item = itemResult?.json;
      if (item?.error) item = undefined;
    }

    if (!item || !item.id) {
      return [];
    }

    const webUrl = item.webUrl;
    if (!webUrl) return [];

    // Confirm resolved URL belongs to the configured scope
    if (
      configuredSiteId &&
      item.parentReference?.siteId &&
      item.parentReference.siteId !== configuredSiteId
    ) {
      return [];
    }
    if (targetPathPrefix) {
      let decodedWeb = webUrl.toLowerCase();
      try {
        decodedWeb = decodeURI(webUrl).toLowerCase();
      } catch (_e) {}
      const decodedTarget = decodeURI(targetPathPrefix).toLowerCase();

      if (
        !webUrl.toLowerCase().startsWith(targetPathPrefix.toLowerCase()) &&
        !decodedWeb.startsWith(decodedTarget)
      ) {
        return [];
      }
    }

    const mimeType = getMimeType(item);
    const displayTitle = preferListItemTitle(item);

    return [
      {
        url: appendWebParam(webUrl),
        documentId: item.id,
        title: displayTitle,
        snippet: "Not available",
        mimeType,
        author: item.createdBy?.user
          ? {
              id: item.createdBy.user.id || "",
              name: item.createdBy.user.displayName || "",
            }
          : undefined,
        createdDate: item.createdDateTime,
        lastModifiedByAnyone: item.lastModifiedDateTime,
        lastModifiedByUserId: item.lastModifiedBy?.user
          ? {
              id: item.lastModifiedBy.user.id || "",
              name: item.lastModifiedBy.user.displayName || "",
              lastModifiedByUserIdDate: item.lastModifiedDateTime,
            }
          : undefined,
        parent: {
          id: item.parentReference?.id || "",
          driveId: item.parentReference?.driveId || "",
          siteId: item.parentReference?.siteId || "",
        },
      },
    ];
  }

  // 2. Build scoped KQL query string restricted to the configured site/subfolder
  let scopedQueryString = queryString;
  if (targetPathPrefix) {
    scopedQueryString = `${queryString} path:"${targetPathPrefix}"`;
  }

  const searchRequest = {
    requests: [
      {
        entityTypes,
        query: { queryString: scopedQueryString },
        size: limit,
        from: 0,
        trimDuplicates: true,
        queryAlterationOptions: {
          enableModification: true,
          enableSuggestions: true,
        },
      },
    ],
  };

  const searchResult = await graphRequest({
    method: "POST",
    url: "https://graph.microsoft.com/v1.0/search/query",
    body: searchRequest,
    headers: {
      Authorization: `Bearer ${data.auth.access_token}`,
      "Content-Type": "application/json",
    },
  });

  const hits = searchResult.json?.value?.[0]?.hitsContainers?.[0]?.hits;

  return (hits || [])
    .filter((hit) => hit.resource?.name)
    .filter((hit) => hitIsInScope(hit, configuredSiteId, targetPathPrefix))
    .slice(0, limit)
    .map(mapHit);
} catch {
  return [];
}
