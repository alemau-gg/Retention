// Self-contained Langdock custom-integration action.
// Searches files in a predefined SharePoint site using Microsoft Graph Search.
const MAX_RETRIES = 3;
const FALLBACK_DELAY_S = 2;
const MAX_DELAY_MS = 30000;

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

function hitIsInSite(hit, siteId, sitePathPrefix) {
  const resource = hit.resource;
  if (!resource) return false;

  if (siteId && resource.parentReference?.siteId === siteId) {
    return true;
  }

  const webUrl = (resource.webUrl || "").toLowerCase();
  return webUrl.startsWith(sitePathPrefix.toLowerCase());
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

// 1. Resolve target site URL and optional site ID from connection auth fields
const configuredSiteUrl = (data.auth.siteUrl || "").trim();
const configuredSiteId = (data.auth.siteId || "").trim();

if (!configuredSiteUrl && !configuredSiteId) {
  throw new Error(
    "SharePoint site URL or site ID must be configured in connection auth fields",
  );
}

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

    // Confirm resolved URL belongs to the configured site
    const siteRootCheck = configuredSiteUrl
      ? configuredSiteUrl.replace(/\/$/, "").toLowerCase() + "/"
      : "";
    if (
      configuredSiteId &&
      item.parentReference?.siteId &&
      item.parentReference.siteId !== configuredSiteId
    ) {
      return [];
    }
    if (siteRootCheck && !webUrl.toLowerCase().startsWith(siteRootCheck)) {
      return [];
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

  // 2. Build scoped KQL query string restricted to the configured site
  let scopedQueryString = queryString;
  let sitePathPrefix = "";

  if (configuredSiteUrl) {
    const siteRoot = configuredSiteUrl.replace(/\/$/, "") + "/";
    sitePathPrefix = siteRoot;
    scopedQueryString = `${queryString} path:"${siteRoot}"`;
  }

  const searchRequest = {
    requests: [
      {
        entityTypes,
        query: { queryString: scopedQueryString },
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
    .filter((hit) => hitIsInSite(hit, configuredSiteId, sitePathPrefix))
    .map(mapHit);
} catch {
  return [];
}
