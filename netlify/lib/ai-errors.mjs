// Return only allowlisted diagnostics. Provider messages can contain private request data.
export function aiFailure(error) {
  const status = Number(error?.status);
  if (!Number.isInteger(status) || status < 400 || status > 599) return null;
  const message = String(error?.message || '');
  let code = 'AI_PROVIDER_UNAVAILABLE';
  let reason = 'provider_unavailable';
  let explanation = 'The AI provider is temporarily unavailable. Your work is safe; try again shortly.';
  let httpStatus = 503;
  if (status === 401 || /api.?key[^\n]*(?:not valid|invalid|expired|leaked|blocked)/i.test(message)) {
    code = 'AI_KEY_REJECTED'; reason = 'credential_rejected';
    explanation = 'The AI provider rejected StoryLab\'s connection credential. Contact your instructor; your work is safe.';
  } else if (status === 402 || ([400, 403].includes(status) && /billing|payment|balance|credit/i.test(message))) {
    code = 'AI_BILLING_REQUIRED'; reason = 'billing_required';
    explanation = 'StoryLab\'s AI account needs billing attention. Contact your instructor; your work is safe.';
  } else if (status === 403) {
    code = 'AI_ACCESS_DENIED'; reason = 'access_denied';
    explanation = 'The AI provider denied access for StoryLab. Contact your instructor; your work is safe.';
  } else if (status === 404) {
    code = 'AI_MODEL_UNAVAILABLE'; reason = 'model_unavailable';
    explanation = 'The AI model configured for StoryLab is unavailable. Contact your instructor; your work is safe.';
  } else if (status === 429) {
    code = 'AI_USAGE_LIMIT'; reason = 'usage_or_rate_limit'; httpStatus = 429;
    explanation = 'StoryLab has reached an AI usage or rate limit. Wait before retrying; contact your instructor if it continues. Your work is safe.';
  } else if (status === 400) {
    code = 'AI_REQUEST_REJECTED'; reason = 'request_configuration_rejected';
    explanation = 'The AI provider rejected StoryLab\'s request settings. Contact your instructor; your work is safe.';
  } else if (status >= 500 && /overload|high demand|capacity/i.test(message)) {
    reason = 'provider_overloaded';
  }
  return { code, explanation, httpStatus, diagnostic: { providerStatus: status, reason } };
}
