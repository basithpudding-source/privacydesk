"use server";

import { headers } from "next/headers";
import { sendEmail, showLinksOnPage } from "@/lib/email/send";
import { linkBase } from "@/lib/public-form/base-url";
import { REQUEST_KINDS, verificationEmail, type RequestKind } from "@/lib/public-form/copy";
import { formServerKey, hashToken, makeToken } from "@/lib/public-form/tokens";
import { createAnonClient } from "@/lib/supabase/anon";
import type { RequestFormState, RequestFormValues } from "./form-state";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The site's own origin for links in emails: APP_URL, or in development the request's host. Null if neither can be trusted. */
async function baseUrl(): Promise<string | null> {
  const h = await headers();
  return linkBase(process.env.APP_URL, process.env.NODE_ENV === "production", {
    host: h.get("host"),
    forwardedHost: h.get("x-forwarded-host"),
    forwardedProto: h.get("x-forwarded-proto"),
  });
}

/**
 * A salted hash of the sender's network address for the hourly cap. The address itself is
 * never stored; the salt changes daily, so hashes cannot be joined across days.
 */
async function senderHash(): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "local";
  return hashToken(`${new Date().toISOString().slice(0, 10)}:${process.env.FORM_RATE_SALT ?? ""}:${ip}`);
}

export async function submitRequest(code: string, _prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  const values: RequestFormValues = {
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    kind: String(formData.get("kind") ?? "") as RequestKind | "",
    details: String(formData.get("details") ?? "").trim(),
  };
  // A field people cannot see; anything in it came from a script. Pretend it worked and do nothing.
  if (String(formData.get("website") ?? "")) return { status: "sent", values, errors: {} };

  const errors: RequestFormState["errors"] = {};
  if (values.name.length < 2 || values.name.length > 200) errors.name = "Enter your name.";
  if (!EMAIL.test(values.email) || values.email.length > 254) errors.email = "Enter an email address we can send the link to.";
  if (!REQUEST_KINDS.some((k) => k.value === values.kind)) errors.kind = "Choose what you are asking for.";
  if (values.details.length < 10) errors.details = "Tell us what you are asking for, in a sentence or more.";
  if (values.details.length > 10000) errors.details = "That is too long. Keep it under 10,000 characters.";
  if (Object.keys(errors).length) return { status: "editing", values, errors };

  const serverKey = formServerKey();
  if (!serverKey) {
    console.error("[public form] FORM_SERVER_KEY is not set (32 characters or more); see apps/web/README.md.");
    return { status: "editing", values, errors: { form: "This form is not available at the moment. Contact the organisation directly." } };
  }

  // Checked before anything is stored: a submission whose link cannot be built is no use to anyone.
  const base = await baseUrl();
  if (!base) {
    console.error("[public form] APP_URL is not set (or is not an http/https address); it is required in production. See apps/web/README.md.");
    return { status: "editing", values, errors: { form: "This form is not available at the moment. Contact the organisation directly." } };
  }

  const token = makeToken();
  const supabase = createAnonClient();
  const { data: ref, error } = await supabase.rpc("form_submit", {
    p_code: code,
    p_token_hash: hashToken(token),
    p_name: values.name,
    p_email: values.email,
    p_type: values.kind,
    p_details: values.details,
    p_sender_hash: await senderHash(),
    p_server_key: serverKey,
  });
  if (error) {
    // 42501: the database does not know this server's key (pd.set_server_key was not run, or the values differ).
    if (error.code === "42501") console.error("[public form] The database refused FORM_SERVER_KEY; see apps/web/README.md.");
    const form =
      error.code === "54000"
        ? "Too many requests from this address in the last hour. Try again later."
        : error.code === "22023"
          ? "This organisation is not taking requests through this form at the moment."
          : error.code === "42501"
            ? "This form is not available at the moment. Contact the organisation directly."
            : "We could not save your request. Try again in a minute.";
    return { status: "editing", values, errors: { form } };
  }

  const link = `${base}/r/${code.toLowerCase()}/verify?t=${token}`;
  const { data: orgRows } = await supabase.rpc("form_lookup", { p_code: code });
  const orgName = (orgRows as { name: string }[] | null)?.[0]?.name ?? "the organisation";
  const message = verificationEmail(orgName, values.name, link);
  const result = await sendEmail({ to: values.email, subject: message.subject, text: message.text });

  if (!result.sent && result.reason === "failed") {
    return { status: "editing", values, errors: { form: "We could not send the email. Check the address and try again in a minute." } };
  }
  void ref;
  return { status: "sent", values, errors: {}, devLink: showLinksOnPage() ? link : undefined };
}
