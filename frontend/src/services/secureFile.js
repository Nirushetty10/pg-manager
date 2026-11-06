import { useState, useEffect } from "react";
import API from "./api";

// ID proofs are private. They are fetched with the login token and shown via a
// temporary blob URL instead of a public /uploads/... link.
const PREFIX = "/uploads/id-proofs/";

export const isProtectedFile = (url) =>
  typeof url === "string" && url.startsWith(PREFIX);

export async function fetchProtectedFile(url) {
  const name = url.slice(PREFIX.length);
  const res = await API.get(`/files/id-proofs/${encodeURIComponent(name)}`, {
    responseType: "blob",
  });
  return res.data;
}

// Open a protected document (e.g. PDF) in a new tab
export async function openProtectedFile(url) {
  // open the tab synchronously so popup blockers allow it
  const tab = window.open("", "_blank");
  try {
    const blob = await fetchProtectedFile(url);
    const objUrl = URL.createObjectURL(blob);
    if (tab) tab.location.href = objUrl;
    else window.location.href = objUrl;
    setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
  } catch (e) {
    if (tab) tab.close();
    alert("Could not open the document. You may not have permission.");
  }
}

// Hook: returns a blob URL for a protected image, or null while loading / on error
export function useProtectedImage(url) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!isProtectedFile(url)) {
      setSrc(null);
      return undefined;
    }
    let cancelled = false;
    let objUrl = null;
    fetchProtectedFile(url)
      .then((blob) => {
        if (cancelled) return;
        objUrl = URL.createObjectURL(blob);
        setSrc(objUrl);
      })
      .catch(() => !cancelled && setSrc(null));
    return () => {
      cancelled = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [url]);
  return src;
}
