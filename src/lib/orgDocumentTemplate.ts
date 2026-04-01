/**
 * Body text from org_documents: json_schema.template_content, else description.
 * Mirrors VehicleHandoverWizard / Forms center behavior.
 */
export function orgDocumentTemplateBody(schema: unknown, description?: string | null): string {
  if (!schema || typeof schema !== 'object') return String(description ?? '');
  const raw = (schema as Record<string, unknown>)['template_content'];
  const fromSchema =
    raw === undefined || raw === null ? '' : typeof raw === 'string' ? raw : String(raw);
  return fromSchema || String(description ?? '');
}

/** When ui_settings.vehicle_policy_text is empty, use this org_documents row title as fallback. */
export const VEHICLE_POLICY_FALLBACK_DOC_TITLE = 'נוהל שימוש ברכב';
