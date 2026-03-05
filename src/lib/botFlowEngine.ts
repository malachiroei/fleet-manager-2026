/**
 * Bot Flow Engine
 * ───────────────────────────────────────────────────────────────────────────
 * Guided multi-turn wizard for creating drivers and vehicles through the AI chat.
 *
 * Usage:
 *   1. Call detectFlowIntent(userText) — returns 'create_driver' | 'create_vehicle' | null
 *   2. Render getStepPrompt(flow) to get the question for the current step
 *   3. Call advanceFlow(state, input) to validate + move to next step
 *   4. When state.done === true, call executeFlow(state) to persist to Supabase
 *   5. executeFlow returns { success, entityId, entityType, error }
 */

import { supabase } from '@/integrations/supabase/client';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type FlowType = 'create_driver' | 'create_vehicle';

export type FieldInputType = 'text' | 'number' | 'date' | 'phone' | 'email' | 'file';

export interface FlowFieldDef {
  key: string;
  prompt: string;         // Hebrew prompt shown to user
  inputType: FieldInputType;
  optional?: boolean;
  validate?: (v: string) => string | null; // returns error string or null if valid
}

export interface FlowState {
  type: FlowType;
  stepIndex: number;       // which field we are currently collecting
  data: Record<string, string>;
  files: Record<string, File>;
  done: boolean;
}

export interface FlowExecuteResult {
  success: boolean;
  entityId?: string;
  entityType?: FlowType;
  error?: string;
}

// ─────────────────────────────────────────────
// Flow definitions
// ─────────────────────────────────────────────

const DRIVER_FIELDS: FlowFieldDef[] = [
  {
    key: 'full_name',
    prompt: 'מה **שם מלא** של הנהג?',
    inputType: 'text',
    validate: v => v.trim().length < 2 ? 'שם חייב להכיל לפחות 2 תווים' : null,
  },
  {
    key: 'id_number',
    prompt: 'מה **ת"ז** (מספר זהות) של הנהג? (9 ספרות)',
    inputType: 'text',
    validate: v => /^\d{9}$/.test(v.trim()) ? null : 'ת"ז חייבת להכיל בדיוק 9 ספרות',
  },
  {
    key: 'phone',
    prompt: 'מה **מספר הטלפון** של הנהג?',
    inputType: 'phone',
    validate: v => /^[0-9+\- ]{7,15}$/.test(v.trim()) ? null : 'מספר טלפון לא תקין',
  },
  {
    key: 'email',
    prompt: 'מה **כתובת האימייל** של הנהג? (או כתוב "דלג")',
    inputType: 'email',
    optional: true,
    validate: v => {
      if (v.trim().toLowerCase() === 'דלג' || v.trim() === '') return null;
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : 'כתובת אימייל לא תקינה';
    },
  },
  {
    key: 'license_number',
    prompt: 'מה **מספר רישיון הנהיגה**?',
    inputType: 'text',
    validate: v => v.trim().length < 5 ? 'מספר רישיון נראה קצר מדי' : null,
  },
  {
    key: 'license_expiry',
    prompt: 'מהי **תאריך תוקף הרישיון**? (פורמט: YYYY-MM-DD)',
    inputType: 'date',
    validate: v => {
      const d = new Date(v.trim());
      return isNaN(d.getTime()) ? 'תאריך לא תקין. השתמש בפורמט YYYY-MM-DD' : null;
    },
  },
  {
    key: 'license_front',
    prompt: 'העלה **צילום רישיון — צד קדמי** (לחץ על צרף קובץ)',
    inputType: 'file',
    optional: true,
  },
  {
    key: 'license_back',
    prompt: 'העלה **צילום רישיון — צד אחורי** (לחץ על צרף קובץ, או כתוב "דלג")',
    inputType: 'file',
    optional: true,
  },
];

const VEHICLE_FIELDS: FlowFieldDef[] = [
  {
    key: 'plate_number',
    prompt: 'מה **מספר הרישוי** (לוחית) של הרכב? (7–8 ספרות, ניתן להוסיף מקפים)',
    inputType: 'text',
    validate: v => {
      const digits = v.replace(/\D/g, '');
      return digits.length >= 7 && digits.length <= 8
        ? null
        : 'מספר רישוי חייב להכיל 7–8 ספרות';
    },
  },
  {
    key: 'manufacturer',
    prompt: 'מה **יצרן** הרכב? (למשל: Toyota, Hyundai, Kia)',
    inputType: 'text',
    validate: v => v.trim().length < 2 ? 'שם יצרן קצר מדי' : null,
  },
  {
    key: 'model',
    prompt: 'מה **דגם** הרכב? (למשל: Corolla, i35)',
    inputType: 'text',
    validate: v => v.trim().length < 1 ? 'נדרש שם דגם' : null,
  },
  {
    key: 'year',
    prompt: 'מהי **שנת ייצור** הרכב? (4 ספרות)',
    inputType: 'number',
    validate: v => {
      const n = parseInt(v.trim());
      return n >= 1990 && n <= new Date().getFullYear() + 1
        ? null
        : `שנה לא תקינה (1990–${new Date().getFullYear() + 1})`;
    },
  },
  {
    key: 'current_odometer',
    prompt: 'מה **קילומטראז\' נוכחי** של הרכב? (מספר בלבד)',
    inputType: 'number',
    validate: v => {
      const n = parseInt(v.trim());
      return !isNaN(n) && n >= 0 ? null : 'יש להזין מספר קילומטרים תקין';
    },
  },
  {
    key: 'test_expiry',
    prompt: 'מהו **תאריך תוקף הטסט**? (פורמט: YYYY-MM-DD)',
    inputType: 'date',
    validate: v => {
      const d = new Date(v.trim());
      return isNaN(d.getTime()) ? 'תאריך לא תקין' : null;
    },
  },
  {
    key: 'insurance_expiry',
    prompt: 'מהו **תאריך תוקף הביטוח**? (פורמט: YYYY-MM-DD)',
    inputType: 'date',
    validate: v => {
      const d = new Date(v.trim());
      return isNaN(d.getTime()) ? 'תאריך לא תקין' : null;
    },
  },
];

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/** Detect if the user wants to start a creation flow. Returns the flow type or null. */
export function detectFlowIntent(text: string): FlowType | null {
  const t = text.trim().toLowerCase();
  if (/הקם\s*נהג|צור\s*נהג|הוסף\s*נהג|רשום\s*נהג|driver\s*חדש|נהג\s*חדש/.test(t)) return 'create_driver';
  if (/הקם\s*רכב|צור\s*רכב|הוסף\s*רכב|רשום\s*רכב|vehicle\s*חדש|רכב\s*חדש/.test(t)) return 'create_vehicle';
  return null;
}

/** Create the initial flow state. */
export function initFlow(type: FlowType): FlowState {
  return { type, stepIndex: 0, data: {}, files: {}, done: false };
}

/** Get the field definitions for a flow type. */
export function getFlowFields(type: FlowType): FlowFieldDef[] {
  return type === 'create_driver' ? DRIVER_FIELDS : VEHICLE_FIELDS;
}

/** The current field def the bot is collecting. */
export function currentField(state: FlowState): FlowFieldDef {
  return getFlowFields(state.type)[state.stepIndex];
}

/** Returns summary of collected data in Hebrew for confirmation step. */
export function buildSummary(state: FlowState): string {
  const fields = getFlowFields(state.type);
  const lines = fields
    .filter(f => f.key in state.data && state.data[f.key] !== '' && state.data[f.key] !== 'דלג')
    .map(f => {
      const label = f.prompt.replace(/[*?]/g, '').replace(/\(.*?\)/g, '').trim().split('\n')[0];
      return `• ${label}: **${state.data[f.key]}**`;
    });

  const fileCount = Object.keys(state.files).length;
  if (fileCount > 0) lines.push(`• קבצים מצורפים: **${fileCount}**`);

  return `📋 **סיכום פרטים לפני שמירה:**\n\n${lines.join('\n')}\n\nהאם לשמור? (כתוב **כן** לאישור או **לא** לביטול)`;
}

/**
 * Advance the flow with a text answer (or skip).
 * Returns { nextPrompt, error, confirmed: false } during collection,
 * or { summary, confirmed: false } when asking for confirmation,
 * or { confirmed: true } when user types 'כן'.
 */
export function advanceFlow(
  state: FlowState,
  textInput: string,
  fileInput?: File | null,
): {
  nextState: FlowState;
  prompt?: string;
  error?: string;
  showSummary?: boolean;
  confirmed?: boolean;
  cancelled?: boolean;
} {
  const t = textInput.trim().toLowerCase();

  // Cancellation
  if (t === 'ביטול' || t === 'בטל' || t === 'cancel') {
    return { nextState: { ...state, done: true }, cancelled: true };
  }

  const fields = getFlowFields(state.type);
  const field = fields[state.stepIndex];
  if (!field) return { nextState: state };

  // File field
  if (field.inputType === 'file') {
    if (fileInput) {
      const newFiles = { ...state.files, [field.key]: fileInput };
      const newData  = { ...state.data,  [field.key]: fileInput.name };
      return _nextStep({ ...state, files: newFiles, data: newData }, fields);
    }
    if (t === 'דלג' || t === 'skip' || field.optional) {
      return _nextStep({ ...state, data: { ...state.data, [field.key]: 'דלג' } }, fields);
    }
    return { nextState: state, error: 'נדרשת העלאת קובץ — לחץ על צרף קובץ, או כתוב "דלג"' };
  }

  // Validate text
  const error = field.validate?.(textInput);
  if (error) return { nextState: state, error };

  const value = t === 'דלג' && field.optional ? '' : textInput.trim();
  return _nextStep({ ...state, data: { ...state.data, [field.key]: value } }, fields);
}

function _nextStep(state: FlowState, fields: FlowFieldDef[]) {
  const nextIndex = state.stepIndex + 1;
  if (nextIndex >= fields.length) {
    // All fields collected — show summary
    return { nextState: { ...state, stepIndex: nextIndex }, showSummary: true };
  }
  const nextField = fields[nextIndex];
  return {
    nextState: { ...state, stepIndex: nextIndex },
    prompt: nextField.prompt,
  };
}

/** Handle the confirmation response ('כן' / 'לא'). Returns confirmed or cancelled. */
export function handleConfirmation(text: string): 'yes' | 'no' | 'invalid' {
  const t = text.trim().toLowerCase();
  if (t === 'כן' || t === 'yes' || t === 'אישור' || t === 'שמור') return 'yes';
  if (t === 'לא' || t === 'no' || t === 'ביטול' || t === 'בטל')   return 'no';
  return 'invalid';
}

// ─────────────────────────────────────────────
// Supabase execution
// ─────────────────────────────────────────────

/** Upload a file to vehicle-documents bucket. Returns public URL or null. */
async function uploadFile(file: File, path: string): Promise<string | null> {
  const { error } = await supabase.storage.from('vehicle-documents').upload(path, file, { upsert: true });
  if (error) return null;
  const { data } = supabase.storage.from('vehicle-documents').getPublicUrl(path);
  return data.publicUrl;
}

/** Execute the flow: insert into DB + upload files. */
export async function executeFlow(state: FlowState): Promise<FlowExecuteResult> {
  const d = state.data;

  try {
    if (state.type === 'create_driver') {
      // Insert driver
      const { data: inserted, error } = await supabase
        .from('drivers')
        .insert({
          full_name:            d.full_name,
          id_number:            d.id_number,
          phone:                d.phone  || null,
          email:                (d.email && d.email !== 'דלג') ? d.email : null,
          license_number:       d.license_number || null,
          license_expiry:       d.license_expiry,
          status:               'valid',
          is_active:            true,
        })
        .select('id')
        .single();

      if (error || !inserted) return { success: false, error: error?.message ?? 'שגיאת DB' };

      const driverId = inserted.id;
      const ts = Date.now();

      // Upload license photos and update the canonical URL fields on the driver row
      if (state.files.license_front) {
        const url = await uploadFile(
          state.files.license_front,
          `driver_${driverId}/license_front_${ts}.jpg`,
        );
        if (url) {
          // Update dedicated column so DriverDetailPage & AI query can read it
          await supabase.from('drivers').update({ license_front_url: url } as any).eq('id', driverId);
          await supabase.from('driver_documents').insert({
            driver_id: driverId,
            title: 'רישיון נהיגה — צד א׳',
            file_url: url,
          });
        }
      }
      if (state.files.license_back) {
        const url = await uploadFile(
          state.files.license_back,
          `driver_${driverId}/license_back_${ts}.jpg`,
        );
        if (url) {
          // Update dedicated column
          await supabase.from('drivers').update({ license_back_url: url } as any).eq('id', driverId);
          await supabase.from('driver_documents').insert({
            driver_id: driverId,
            title: 'רישיון נהיגה — צד ב׳',
            file_url: url,
          });
        }
      }

      return { success: true, entityId: driverId, entityType: 'create_driver' };

    } else {
      // Insert vehicle
      const plate = d.plate_number.replace(/\D/g, '').replace(/^(\d{2,3})(\d{2,3})(\d{2,3})$/, '$1-$2-$3');

      const { data: inserted, error } = await supabase
        .from('vehicles')
        .insert({
          plate_number:     plate,
          manufacturer:     d.manufacturer,
          model:            d.model,
          year:             parseInt(d.year),
          current_odometer: parseInt(d.current_odometer),
          test_expiry:      d.test_expiry,
          insurance_expiry: d.insurance_expiry,
          status:           'valid',
          is_active:        true,
        })
        .select('id')
        .single();

      if (error || !inserted) return { success: false, error: error?.message ?? 'שגיאת DB' };

      return { success: true, entityId: inserted.id, entityType: 'create_vehicle' };
    }
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
