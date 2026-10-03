"use client";

import { useEffect } from "react";
import { reportError } from "../lib/report-error";

/** Reports unhandled JavaScript errors and promise rejections to the API. */
export default function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportError(e.error ?? e.message);
    const onRejection = (e: PromiseRejectionEvent) => {
      // Network failures and API refusals are already shown to the user: only real bugs are reported.
      const reason = e.reason;
      if (reason?.name === "ApiError" || reason instanceof TypeError) return;
      reportError(reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
