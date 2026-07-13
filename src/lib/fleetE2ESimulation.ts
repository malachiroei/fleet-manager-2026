/**
 * Fleet E2E Simulation Engine
 * ───────────────────────────────────────────────────────────────────────────
 * Capability registry built from discovered App routes, hooks, and Supabase ops.
 * Each step maps to a real write/read/RPC path in the codebase (see `source`).
 */

import { supabase } from '@/integrations/supabase/client';
import { normalizePlateNumber } from '@/lib/plateNumber';
import { fetchComplianceAlerts, countDashboardExceptionAlerts } from '@/lib/complianceAlertsEngine';
import { formatSupabaseError, isMissingSchemaObjectError } from '@/lib/supabaseError';
import { invokeSupabaseEdgeFunction } from '@/lib/supabase/invokeEdgeFunction';

export const E2E_SIM_LABEL = '(בדיקת מערכת)';
const E2E_SIM_ALT = '(סימולציה)';
/** Prefix for every simulation-triggered email subject/header */
export const E2E_EMAIL_SUBJECT_PREFIX = '[בדיקת מערכת סימולציה]';

/** Routes discovered from `src/App.tsx` — coverage map for the simulation report */
export const FLEET_ROUTE_CATALOG: ReadonlyArray<{ path: string; label: string; layer: string }> = [
  { path: '/', label: 'לוח בקרה', layer: 'ליבה' },
  { path: '/vehicles', label: 'רשימת רכבים', layer: 'צי' },
  { path: '/vehicles/add', label: 'הוספת רכב', layer: 'צי' },
  { path: '/vehicles/odometer', label: 'עדכון ק״מ', layer: 'תפעול' },
  { path: '/vehicles/service-update', label: 'עדכון טיפול', layer: 'תפעול' },
  { path: '/drivers', label: 'רשימת נהגים', layer: 'צי' },
  { path: '/drivers/add', label: 'הוספת נהג', layer: 'צי' },
  { path: '/compliance', label: 'התראות חריגה', layer: 'ציות' },
  { path: '/handover/delivery', label: 'מסירת רכב', layer: 'העברות' },
  { path: '/handover/return', label: 'החזרת רכב', layer: 'העברות' },
  { path: '/handover/replacement', label: 'רכב חלופי', layer: 'העברות' },
  { path: '/report-mileage', label: 'דיווח ק״מ', layer: 'תפעול' },
  { path: '/maintenance/add', label: 'רישום טיפול', layer: 'תחזוקה' },
  { path: '/reports', label: 'הפקת דוחות', layer: 'דוחות' },
  { path: '/team', label: 'ניהול צוות', layer: 'ארגון' },
  { path: '/admin/compliance', label: 'מרכז ציות אדמין', layer: 'ציות' },
  { path: '/forms', label: 'טפסים ארגוניים', layer: 'ארגון' },
];

export interface E2ESimContext {
  orgId: string;
  userId: string;
  userEmail: string | null;
  runToken: string;
  plate: string;
  driverId?: string;
  vehicleId?: string;
  handoverId?: string;
  createdDocIds: string[];
}

export interface SimulationPurgeCounts {
  driver_documents: number;
  vehicle_documents: number;
  maintenance_records: number;
  maintenance_logs: number;
  vehicle_service_logs: number;
  mileage_logs: number;
  vehicle_expenses: number;
  vehicle_incidents: number;
  compliance_requests: number;
  compliance_alerts: number;
  compliance_docs: number;
  driver_family_members: number;
  driver_incidents: number;
  org_invitations: number;
  driver_vehicle_assignments: number;
  vehicle_handovers: number;
  vehicles: number;
  drivers: number;
}

export interface E2EStepLog {
  id: string;
  layer: string;
  label: string;
  route: string | null;
  tableOrRpc: string | null;
  source: string;
  ok: boolean;
  detail: string;
  optional?: boolean;
  skipped?: boolean;
}

type CapabilityRunner = (ctx: E2ESimContext) => Promise<{ detail: string }>;

interface FleetCapabilityDef {
  id: string;
  layer: string;
  label: string;
  route: string | null;
  tableOrRpc: string | null;
  source: string;
  optional?: boolean;
  skip?: boolean;
  skipReason?: string;
  requires?: Array<keyof E2ESimContext>;
  run?: CapabilityRunner;
}

function simIdNumber(): string {
  const tail = String(Date.now()).slice(-6);
  return `999${tail}`.slice(0, 9);
}

function simPlate(): string {
  return normalizePlateNumber(`99${String(Date.now()).slice(-6)}`);
}

function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function ensureDriverInsertId(row: Record<string, unknown>) {
  if (row.id) return;
  row.id = globalThis.crypto?.randomUUID?.() ?? `sim-${Date.now()}`;
}

/** Turn PostgREST / Supabase errors into readable Hebrew-friendly strings */
function failIfSupabaseError(error: unknown, stepLabel?: string): void {
  if (!error) return;
  const msg = formatSupabaseError(error);
  throw new Error(stepLabel ? `${stepLabel}: ${msg}` : msg);
}

function formatCaughtError(err: unknown): string {
  if (err instanceof Error && err.message && err.message !== '[object Object]') {
    return err.message;
  }
  return formatSupabaseError(err);
}

function isRlsError(err: unknown): boolean {
  const msg = formatCaughtError(err);
  return /row-level security|אין הרשאה|permission denied|42501/i.test(msg);
}

function simEmailSubject(base: string): string {
  return `${E2E_EMAIL_SUBJECT_PREFIX} ${base}`;
}

/** Shared simulation metadata passed to Edge Functions (subject prefix + audit) */
function simEdgeMeta(ctx: E2ESimContext): Record<string, string> {
  return {
    simulation_mode: 'true',
    email_subject_prefix: E2E_EMAIL_SUBJECT_PREFIX,
    simulation_run_token: ctx.runToken,
  };
}

async function invokeSimEdgeFunction(
  functionName: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data, error } = await invokeSupabaseEdgeFunction(functionName, body);
  if (error) failIfSupabaseError(error, functionName);
  const payload = (data ?? {}) as Record<string, unknown>;
  const bodyErr = typeof payload.error === 'string' ? payload.error.trim() : '';
  const ok = payload.ok === true || payload.success === true;
  if (bodyErr && !ok) throw new Error(`${functionName}: ${bodyErr}`);
  return payload;
}

/** Mirrors EditVehiclePage → useAssignDriverToVehicle (assigned_by = auth user) */
async function assignDriverDirect(ctx: E2ESimContext): Promise<void> {
  const vehicleId = ctx.vehicleId!;
  const driverId = ctx.driverId!;
  const unassignedAt = new Date().toISOString();

  const { data: driverVehicles, error: driverVehiclesError } = await supabase
    .from('vehicles')
    .select('id')
    .eq('assigned_driver_id', driverId)
    .neq('id', vehicleId);
  failIfSupabaseError(driverVehiclesError, 'שליפת רכבים קודמים של הנהג');

  const previousVehicleIds = (driverVehicles ?? []).map((row) => row.id);
  if (previousVehicleIds.length > 0) {
    const { error: clearDriverVehiclesError } = await supabase
      .from('vehicles')
      .update({ assigned_driver_id: null })
      .eq('assigned_driver_id', driverId)
      .neq('id', vehicleId);
    failIfSupabaseError(clearDriverVehiclesError, 'ביטול שיוך רכבים קודמים של הנהג');

    const { error: closePreviousDriverAssignmentsError } = await supabase
      .from('driver_vehicle_assignments')
      .update({ unassigned_at: unassignedAt })
      .eq('driver_id', driverId)
      .is('unassigned_at', null)
      .in('vehicle_id', previousVehicleIds);
    failIfSupabaseError(closePreviousDriverAssignmentsError, 'סגירת שיוכים קודמים של הנהג');
  }

  const { error: closeCurrentVehicleAssignmentError } = await supabase
    .from('driver_vehicle_assignments')
    .update({ unassigned_at: unassignedAt })
    .eq('vehicle_id', vehicleId)
    .is('unassigned_at', null);
  failIfSupabaseError(closeCurrentVehicleAssignmentError, 'סגירת שיוך קודם לרכב');

  const { error: updateVehicleError } = await supabase
    .from('vehicles')
    .update({ assigned_driver_id: driverId })
    .eq('id', vehicleId);
  failIfSupabaseError(updateVehicleError, 'עדכון assigned_driver_id ברכב');

  const { error: insertAssignmentError } = await supabase
    .from('driver_vehicle_assignments')
    .insert({
      vehicle_id: vehicleId,
      driver_id: driverId,
      assigned_by: ctx.userId,
    });
  failIfSupabaseError(insertAssignmentError, 'INSERT ל-driver_vehicle_assignments');
}

/** Fallback: SECURITY DEFINER handover trigger writes driver_vehicle_assignments */
async function assignDriverViaHandoverRpc(ctx: E2ESimContext): Promise<string> {
  const { data, error } = await supabase.rpc('create_vehicle_handover', {
    p_org_id: ctx.orgId,
    p_vehicle_id: ctx.vehicleId,
    p_driver_id: ctx.driverId,
    p_handover_type: 'delivery',
    p_assignment_mode: 'permanent',
    p_handover_date: new Date().toISOString(),
    p_odometer_reading: 10500,
    p_fuel_level: 'full',
    p_photo_front_url: null,
    p_photo_back_url: null,
    p_photo_right_url: null,
    p_photo_left_url: null,
    p_signature_url: null,
    p_notes: `${E2E_SIM_LABEL} שיוך דרך מסירה`,
    p_created_by: ctx.userId,
  });
  failIfSupabaseError(error, 'create_vehicle_handover (שיוך)');
  const row = data as { id?: string };
  if (!row?.id) throw new Error('RPC לא החזיר מזהה העברה');
  ctx.handoverId = row.id;
  return row.id;
}

async function resolveE2EContext(): Promise<E2ESimContext | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .maybeSingle();
  const orgId = profile?.org_id?.trim();
  if (!orgId) return null;
  const runToken = String(Date.now());
  return {
    orgId,
    userId: user.id,
    userEmail: user.email?.trim() || null,
    runToken,
    plate: simPlate(),
    createdDocIds: [],
  };
}

/**
 * Registry of executable capabilities — each entry mirrors a real app operation.
 * Built at runtime (not a static string list) so new capabilities can be registered.
 */
export function buildFleetE2ECapabilityRegistry(): FleetCapabilityDef[] {
  return [
    // ── Layer: אימות והרשאות ─────────────────────────────────────────────
    {
      id: 'auth_session',
      layer: 'אימות והרשאות',
      label: 'אימות משתמש וארגון פעיל',
      route: '/auth',
      tableOrRpc: 'profiles',
      source: 'src/hooks/useAuth.tsx',
      run: async (ctx) => {
        const { data, error } = await supabase
          .from('profiles')
          .select('org_id, status')
          .eq('id', ctx.userId)
          .single();
        if (error) failIfSupabaseError(error);
        if (!data?.org_id) throw new Error('חסר org_id בפרופיל');
        return `משתמש מחובר · org_id=${data.org_id} · סטטוס=${data.status ?? '—'}`;
      },
    },
    {
      id: 'read_roles',
      layer: 'אימות והרשאות',
      label: 'קריאת הרשאות משתמש',
      route: null,
      tableOrRpc: 'user_roles',
      source: 'src/hooks/useAuth.tsx',
      optional: true,
      run: async (ctx) => {
        const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', ctx.userId);
        if (error) failIfSupabaseError(error);
        return `${(data ?? []).length} תפקידים: ${(data ?? []).map(r => r.role).join(', ') || '—'}`;
      },
    },

    // ── Layer: קריאות צי (Read) ───────────────────────────────────────────
    {
      id: 'read_vehicles',
      layer: 'קריאות צי',
      label: 'שליפת רשימת רכבים לארגון',
      route: '/vehicles',
      tableOrRpc: 'vehicles',
      source: 'src/hooks/useVehicles.tsx',
      run: async (ctx) => {
        const { count, error } = await supabase
          .from('vehicles')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', ctx.orgId);
        if (error) failIfSupabaseError(error);
        return `${count ?? 0} רכבים רשומים לארגון`;
      },
    },
    {
      id: 'read_drivers',
      layer: 'קריאות צי',
      label: 'שליפת רשימת נהגים לארגון',
      route: '/drivers',
      tableOrRpc: 'drivers',
      source: 'src/hooks/useDrivers.tsx',
      run: async (ctx) => {
        const { count, error } = await supabase
          .from('drivers')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', ctx.orgId);
        if (error) failIfSupabaseError(error);
        return `${count ?? 0} נהגים רשומים לארגון`;
      },
    },
    {
      id: 'read_compliance_alerts',
      layer: 'ציות',
      label: 'מנוע התראות חריגה (Dashboard)',
      route: '/compliance',
      tableOrRpc: 'complianceAlertsEngine',
      source: 'src/lib/complianceAlertsEngine.ts',
      run: async (ctx) => {
        const alerts = await fetchComplianceAlerts({ effectiveOrgId: ctx.orgId });
        const expired = countDashboardExceptionAlerts(alerts);
        return `${alerts.length} התראות (${expired} פגי תוקף) — תואם כרטיס דשבורד`;
      },
    },
    {
      id: 'read_handovers',
      layer: 'העברות',
      label: 'קריאת היסטוריית העברות',
      route: '/vehicles/transfers',
      tableOrRpc: 'vehicle_handovers',
      source: 'src/hooks/useHandovers.tsx',
      optional: true,
      run: async (ctx) => {
        const { count, error } = await supabase
          .from('vehicle_handovers')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', ctx.orgId);
        if (error) failIfSupabaseError(error);
        return `${count ?? 0} רשומות העברה בארגון`;
      },
    },

    // ── Layer: יצירת ישויות (Create) ─────────────────────────────────────
    {
      id: 'create_driver',
      layer: 'יצירת נתונים',
      label: 'הקמת נהג בדיקה',
      route: '/drivers/add',
      tableOrRpc: 'drivers INSERT',
      source: 'src/hooks/useDrivers.tsx · src/lib/botFlowEngine.ts',
      run: async (ctx) => {
        const row: Record<string, unknown> = {
          org_id: ctx.orgId,
          managed_by_user_id: ctx.userId,
          full_name: `${E2E_SIM_LABEL} נהג ${ctx.runToken}`,
          id_number: simIdNumber(),
          phone: '0500000000',
          email: `sim-${ctx.runToken}@example.com`,
          license_number: `SIM${ctx.runToken}`,
          license_expiry: futureDate(365),
          status: 'valid',
          is_active: true,
          department: `${E2E_SIM_ALT} מחלקה`,
        };
        ensureDriverInsertId(row);
        const { data, error } = await supabase.from('drivers').insert(row).select('id, full_name').single();
        if (error) failIfSupabaseError(error);
        ctx.driverId = data.id;
        return `נהג נוצר: ${data.full_name} (${data.id})`;
      },
    },
    {
      id: 'create_vehicle',
      layer: 'יצירת נתונים',
      label: 'הקמת רכב בדיקה',
      route: '/vehicles/add',
      tableOrRpc: 'vehicles INSERT',
      source: 'src/hooks/useVehicles.tsx · src/lib/botFlowEngine.ts',
      run: async (ctx) => {
        const { data, error } = await supabase
          .from('vehicles')
          .insert({
            org_id: ctx.orgId,
            managed_by_user_id: ctx.userId,
            plate_number: ctx.plate,
            manufacturer: 'Toyota',
            model: `${E2E_SIM_ALT}`,
            year: new Date().getFullYear(),
            current_odometer: 10000,
            test_expiry: futureDate(180),
            insurance_expiry: futureDate(180),
            status: 'valid',
            is_active: true,
          })
          .select('id, plate_number')
          .single();
        if (error) failIfSupabaseError(error);
        ctx.vehicleId = data.id;
        return `רכב נוצר: לוחית ${data.plate_number} (${data.id})`;
      },
    },

    // ── Layer: שיוך ועדכונים ─────────────────────────────────────────────
    {
      id: 'assign_driver',
      layer: 'שיוך והקצאה',
      label: 'שיוך נהג לרכב',
      route: '/vehicles/:id/edit',
      tableOrRpc: 'vehicles + driver_vehicle_assignments',
      source: 'src/hooks/useVehicles.tsx useAssignDriverToVehicle',
      requires: ['driverId', 'vehicleId'],
      run: async (ctx) => {
        try {
          await assignDriverDirect(ctx);
          return `נהג ${ctx.driverId} שויך לרכב ${ctx.plate} · assigned_by=${ctx.userId}`;
        } catch (directErr) {
          if (!isRlsError(directErr)) throw directErr;
          const handoverId = await assignDriverViaHandoverRpc(ctx);
          return `שיוך דרך מסירת רכב (RPC) · handover=${handoverId} · p_created_by=${ctx.userId}`;
        }
      },
    },
    {
      id: 'update_odometer',
      layer: 'תפעול',
      label: 'עדכון קילומטראז׳',
      route: '/vehicles/odometer',
      tableOrRpc: 'vehicles UPDATE',
      source: 'src/hooks/useVehicles.tsx · src/lib/aiQueryEngine.ts actionQuickOdometerUpdate',
      requires: ['vehicleId'],
      run: async (ctx) => {
        const newKm = 10500;
        const { error } = await supabase
          .from('vehicles')
          .update({
            current_odometer: newKm,
            last_odometer_date: new Date().toISOString().split('T')[0],
          })
          .eq('id', ctx.vehicleId!)
          .eq('org_id', ctx.orgId);
        if (error) failIfSupabaseError(error);
        return `מד-אמת עודכן ל-${newKm.toLocaleString('he-IL')} ק"מ`;
      },
    },
    {
      id: 'update_driver_profile',
      layer: 'עדכון נתונים',
      label: 'עדכון שדות נהג (מחלקה/תפקיד)',
      route: '/drivers/:id/edit',
      tableOrRpc: 'drivers UPDATE',
      source: 'src/pages/EditDriverPage.tsx',
      requires: ['driverId'],
      run: async (ctx) => {
        const { error } = await supabase
          .from('drivers')
          .update({
            department: `${E2E_SIM_LABEL} מחלקה מעודכנת`,
            job_title: `${E2E_SIM_ALT} תפקיד`,
          })
          .eq('id', ctx.driverId!)
          .eq('org_id', ctx.orgId);
        if (error) failIfSupabaseError(error);
        return 'שדות ארגוניים של הנהג עודכנו';
      },
    },
    {
      id: 'update_vehicle_service_fields',
      layer: 'תחזוקה',
      label: 'עדכון שדות טיפול ברכב',
      route: '/vehicles/service-update',
      tableOrRpc: 'vehicles UPDATE',
      source: 'src/pages/ServiceUpdatePage.tsx',
      requires: ['vehicleId'],
      run: async (ctx) => {
        const { error } = await supabase
          .from('vehicles')
          .update({
            last_service_date: new Date().toISOString().split('T')[0],
            last_service_km: 10500,
            next_maintenance_date: futureDate(90),
            next_maintenance_km: 15000,
          })
          .eq('id', ctx.vehicleId!)
          .eq('org_id', ctx.orgId);
        if (error) failIfSupabaseError(error);
        return 'שדות טיפול/תחזוקה עודכנו ברכב';
      },
    },

    // ── Layer: מסמכים ותיקיות ────────────────────────────────────────────
    {
      id: 'driver_document',
      layer: 'מסמכים',
      label: 'הוספת מסמך נהג (מטא)',
      route: '/drivers/:id',
      tableOrRpc: 'driver_documents INSERT',
      source: 'src/lib/botFlowEngine.ts · src/hooks/useDrivers.tsx',
      requires: ['driverId'],
      optional: true,
      run: async (ctx) => {
        // Mirrors useHandovers archiveHandoverSubmission → driver_documents insert
        const reportUrl = `sim/${ctx.orgId}/driver_${ctx.driverId}/e2e_${ctx.runToken}.pdf`;
        const { data, error } = await supabase
          .from('driver_documents')
          .insert({
            driver_id: ctx.driverId!,
            title: `${E2E_SIM_LABEL} מסמך בדיקה — ${new Date().toLocaleDateString('he-IL')}`,
            file_url: reportUrl,
          })
          .select('id')
          .single();
        failIfSupabaseError(error, 'INSERT ל-driver_documents');
        ctx.createdDocIds.push(data.id);
        return `מסמך נהג נוצר (${data.id}) · נהג org_id=${ctx.orgId}`;
      },
    },
    {
      id: 'vehicle_document',
      layer: 'מסמכים',
      label: 'הוספת מסמך רכב (מטא)',
      route: '/vehicles/:id',
      tableOrRpc: 'vehicle_documents INSERT',
      source: 'src/pages/VehicleDetailPage.tsx · ServiceUpdatePage.tsx',
      requires: ['vehicleId'],
      optional: true,
      run: async (ctx) => {
        const url = `https://example.com/${E2E_SIM_ALT}/vehicle-${ctx.runToken}.pdf`;
        const { data, error } = await supabase.from('vehicle_documents').insert({
          vehicle_id: ctx.vehicleId,
          title: `${E2E_SIM_LABEL} מסמך רכב`,
          file_url: url,
          document_type: 'simulation',
        } as any).select('id').single();
        if (error) failIfSupabaseError(error);
        ctx.createdDocIds.push(data.id);
        return `מסמך רכב נוצר (${data.id})`;
      },
    },

    // ── Layer: תחזוקה ────────────────────────────────────────────────────
    {
      id: 'maintenance_record',
      layer: 'תחזוקה',
      label: 'רישום טיפול',
      route: '/maintenance/add',
      tableOrRpc: 'maintenance_records INSERT',
      source: 'src/pages/AddMaintenancePage.tsx',
      requires: ['vehicleId'],
      optional: true,
      run: async (ctx) => {
        const serviceDate = new Date().toISOString().split('T')[0];
        const maintPayload = {
          vehicle_id: ctx.vehicleId!,
          service_type: `${E2E_SIM_ALT} טיפול`,
          odometer: 10500,
          date: serviceDate,
          notes: `${E2E_SIM_LABEL} רישום בדיקה`,
          created_by: ctx.userId,
        };

        const { data: maintData, error: maintErr } = await supabase
          .from('maintenance_records')
          .insert(maintPayload)
          .select('id')
          .single();

        if (!maintErr && maintData) {
          return `רישום טיפול נוצר ב-maintenance_records (${maintData.id}) · created_by=${ctx.userId}`;
        }

        if (maintErr && !isRlsError(maintErr)) {
          failIfSupabaseError(maintErr, 'INSERT ל-maintenance_records');
        }

        // Fallback: ServiceUpdatePage audit log (user_id must equal auth.uid())
        const { data: logData, error: logErr } = await supabase
          .from('vehicle_service_logs' as never)
          .insert({
            vehicle_id: ctx.vehicleId!,
            plate_number: ctx.plate,
            service_type: `${E2E_SIM_ALT}_maintenance`,
            odometer_reading: 10500,
            photo_url: `sim/e2e/${ctx.runToken}/maintenance.pdf`,
            user_id: ctx.userId,
          } as never)
          .select('id')
          .single();

        failIfSupabaseError(logErr, 'INSERT ל-vehicle_service_logs');
        return `רישום טיפול נשמר ב-vehicle_service_logs (${logData!.id}) · user_id=${ctx.userId}`;
      },
    },

    // ── Layer: העברות (Handover) ─────────────────────────────────────────
    {
      id: 'handover_delivery_rpc',
      layer: 'העברות',
      label: 'מסירת רכב (RPC)',
      route: '/handover/delivery',
      tableOrRpc: 'create_vehicle_handover RPC',
      source: 'src/hooks/useHandovers.tsx',
      requires: ['driverId', 'vehicleId'],
      optional: true,
      run: async (ctx) => {
        if (ctx.handoverId) {
          return `העברת מסירה כבר נוצרה בשלב שיוך (${ctx.handoverId})`;
        }
        const { data, error } = await supabase.rpc('create_vehicle_handover', {
          p_org_id: ctx.orgId,
          p_vehicle_id: ctx.vehicleId,
          p_driver_id: ctx.driverId,
          p_handover_type: 'delivery',
          p_assignment_mode: 'permanent',
          p_handover_date: new Date().toISOString(),
          p_odometer_reading: 10500,
          p_fuel_level: 'full',
          p_photo_front_url: null,
          p_photo_back_url: null,
          p_photo_right_url: null,
          p_photo_left_url: null,
          p_signature_url: null,
          p_notes: `${E2E_SIM_LABEL} מסירת בדיקה`,
          p_created_by: ctx.userId,
        });
        if (error) failIfSupabaseError(error);
        const row = data as { id?: string };
        if (!row?.id) throw new Error('RPC לא החזיר מזהה העברה');
        ctx.handoverId = row.id;
        return `העברת מסירה נוצרה (${row.id})`;
      },
    },
    {
      id: 'handover_sync_assignment',
      layer: 'העברות',
      label: 'סנכרון שיוך מהעברה (RPC)',
      route: '/handover/delivery',
      tableOrRpc: 'sync_assignment_from_handover RPC',
      source: 'src/hooks/useHandovers.tsx archiveHandoverSubmission',
      requires: ['handoverId'],
      optional: true,
      run: async (ctx) => {
        const { error } = await supabase.rpc('sync_assignment_from_handover', {
          p_handover_id: ctx.handoverId,
        });
        if (error) failIfSupabaseError(error);
        return 'שיוך נהג-רכב סונכרן מהעברה';
      },
    },

    // ── Layer: אימות (Verify) ────────────────────────────────────────────
    {
      id: 'verify_vehicle_plate',
      layer: 'אימות',
      label: 'אימות קריאת רכב לפי לוחית',
      route: '/vehicles',
      tableOrRpc: 'vehicles SELECT',
      source: 'src/lib/aiQueryEngine.ts resolveVehicleByPlate',
      requires: ['vehicleId'],
      run: async (ctx) => {
        const { data, error } = await supabase
          .from('vehicles')
          .select('id, plate_number, current_odometer, assigned_driver_id')
          .eq('org_id', ctx.orgId)
          .ilike('plate_number', `%${ctx.plate}%`)
          .single();
        if (error) failIfSupabaseError(error);
        if (data.assigned_driver_id !== ctx.driverId) {
          throw new Error('שיוך נהג לא אומת בקריאה חוזרת');
        }
        return `אומת: לוחית ${data.plate_number} · ק"מ ${data.current_odometer}`;
      },
    },
    {
      id: 'verify_driver_lookup',
      layer: 'אימות',
      label: 'אימות קריאת נהג לפי שם',
      route: '/drivers',
      tableOrRpc: 'drivers SELECT',
      source: 'src/lib/aiQueryEngine.ts resolveDriverByName',
      requires: ['driverId'],
      run: async (ctx) => {
        const { data, error } = await supabase
          .from('drivers')
          .select('id, full_name, department')
          .eq('id', ctx.driverId!)
          .eq('org_id', ctx.orgId)
          .single();
        if (error) failIfSupabaseError(error);
        if (!String(data.full_name).includes(E2E_SIM_LABEL)) {
          throw new Error('שם נהג הבדיקה לא נמצא');
        }
        return `אומת: ${data.full_name} · ${data.department ?? '—'}`;
      },
    },

    // ── Layer: Edge Functions (מצב חי — מיילים אמיתיים) ───────────────────
    {
      id: 'edge_update_mileage',
      layer: 'Edge Functions',
      label: 'דיווח ק״מ + mileage_logs',
      route: '/report-mileage',
      tableOrRpc: 'update-mileage',
      source: 'supabase/functions/update-mileage · MileageUpdateDialog.tsx',
      requires: ['vehicleId'],
      optional: true,
      run: async (ctx) => {
        const payload = await invokeSimEdgeFunction('update-mileage', {
          vehicle_id: ctx.vehicleId,
          odometer_value: 10600,
          ...simEdgeMeta(ctx),
        });
        const recipients = Array.isArray(payload.recipients) ? payload.recipients.join(', ') : '—';
        return `דיווח ק״מ נשלח · נושא מייל: ${simEmailSubject(`עדכון ק״מ — ${ctx.plate}`)} · נמענים: ${recipients}`;
      },
    },
    {
      id: 'edge_compliance_request',
      layer: 'Edge Functions',
      label: 'שליחת בקשת ציות',
      route: '/admin/compliance',
      tableOrRpc: 'send-compliance-request',
      source: 'src/pages/AdminCompliancePage.tsx',
      requires: ['driverId'],
      optional: true,
      run: async (ctx) => {
        const { data: driver, error: dErr } = await supabase
          .from('drivers')
          .select('id, full_name, email, license_expiry')
          .eq('id', ctx.driverId!)
          .eq('org_id', ctx.orgId)
          .single();
        failIfSupabaseError(dErr, 'שליפת נהג לבקשת ציות');
        const driverEmail = String(driver.email ?? `sim-${ctx.runToken}@example.com`).trim();
        const payload = await invokeSimEdgeFunction('send-compliance-request', {
          org_id: ctx.orgId,
          entity_type: 'driver',
          entity_id: ctx.driverId,
          task_key: 'driver_license',
          task_label: `${E2E_SIM_LABEL} רישיון`,
          tab_label: 'רישיון נהיגה',
          due_field: 'license_expiry',
          due_date: driver.license_expiry,
          driver_id: ctx.driverId,
          driver_email: driverEmail,
          driver_name: driver.full_name,
          cta_text: 'עדכון רישיון (בדיקה)',
          admin_note: `${E2E_EMAIL_SUBJECT_PREFIX} — בקשת ציות אוטומטית מסימולציה · run=${ctx.runToken}`,
          ...simEdgeMeta(ctx),
        });
        const sentTo = String(payload.sent_to ?? driverEmail);
        return `בקשת ציות נשלחה ל־${sentTo} · נושא: ${simEmailSubject('נדרש עדכון רישיון נהיגה')}`;
      },
    },
    {
      id: 'edge_team_invite',
      layer: 'Edge Functions',
      label: 'הזמנת חבר צוות',
      route: '/team',
      tableOrRpc: 'send-invite',
      source: 'src/lib/sendInvitationEmail.ts',
      optional: true,
      run: async (ctx) => {
        const inviteEmail = `sim-invite-${ctx.runToken}@example.com`;
        const payload = await invokeSimEdgeFunction('send-invite', {
          org_id: ctx.orgId,
          email: inviteEmail,
          app_origin: typeof window !== 'undefined' ? window.location.origin : '',
          ...simEdgeMeta(ctx),
        });
        const sentTo = String(payload.sent_to ?? inviteEmail);
        return `הזמנה נשלחה ל־${sentTo} · נושא: ${simEmailSubject('הזמנה להצטרף לארגון')}`;
      },
    },
    {
      id: 'edge_handover_email',
      layer: 'Edge Functions',
      label: 'מייל התראת מסירה',
      route: '/handover/delivery',
      tableOrRpc: 'send-handover-notification',
      source: 'src/hooks/useHandovers.tsx sendHandoverNotificationEmail',
      requires: ['vehicleId', 'handoverId'],
      optional: true,
      run: async (ctx) => {
        const to = ctx.userEmail ?? `sim-${ctx.runToken}@example.com`;
        const vehicleLabel = `Toyota ${E2E_SIM_ALT} · ${ctx.plate}`;
        const subject = simEmailSubject(`מסירת רכב - ${vehicleLabel}`);
        const reportUrl = `sim/${ctx.orgId}/handover_${ctx.handoverId}/e2e_${ctx.runToken}.pdf`;
        const { error } = await invokeSupabaseEdgeFunction('send-handover-notification', {
          to,
          subject,
          simulation_mode: true,
          email_subject_prefix: E2E_EMAIL_SUBJECT_PREFIX,
          payload: {
            handoverId: ctx.handoverId,
            vehicleId: ctx.vehicleId,
            handoverType: 'delivery',
            assignmentMode: 'permanent',
            vehicleLabel,
            driverLabel: `${E2E_SIM_LABEL} נהג ${ctx.runToken}`,
            odometerReading: 10500,
            fuelLevel: 100,
            notes: `${E2E_SIM_LABEL} מייל מסירה`,
            reportUrl,
            sentAt: new Date().toISOString(),
            orgId: ctx.orgId,
            actorUserId: ctx.userId,
          },
        });
        if (error) failIfSupabaseError(error, 'send-handover-notification');
        return `מייל מסירה נשלח ל־${to} · נושא: ${subject}`;
      },
    },

    // ── Layer: מצב חי — שמירה במערכת ─────────────────────────────────────
    {
      id: 'live_persist_confirm',
      layer: 'מצב חי',
      label: 'שמירת נתוני בדיקה במערכת',
      route: '/drivers',
      tableOrRpc: 'persist (no cleanup)',
      source: 'fleetE2ESimulation live mode',
      optional: true,
      run: async (ctx) => {
        const parts = [
          `אסימון ריצה: ${ctx.runToken}`,
          ctx.driverId ? `נהג: ${ctx.driverId}` : null,
          ctx.vehicleId ? `רכב: ${ctx.plate} (${ctx.vehicleId})` : null,
          ctx.handoverId ? `העברה: ${ctx.handoverId}` : null,
        ].filter(Boolean);
        return `נתוני הבדיקה נשמרו ויופיעו במסכי המערכת · ${parts.join(' · ')} · לניקוי: «מחק נתוני בדיקה»`;
      },
    },
  ];
}

async function runCapability(
  def: FleetCapabilityDef,
  ctx: E2ESimContext,
): Promise<E2EStepLog> {
  const base: E2EStepLog = {
    id: def.id,
    layer: def.layer,
    label: def.label,
    route: def.route,
    tableOrRpc: def.tableOrRpc,
    source: def.source,
    ok: false,
    detail: '',
    optional: def.optional,
  };

  if (def.skip) {
    return { ...base, ok: true, skipped: true, detail: def.skipReason ?? 'דולג' };
  }

  if (def.requires?.some((k) => !ctx[k])) {
    return {
      ...base,
      ok: true,
      skipped: true,
      detail: `דולג — חסרה תלות (${def.requires.filter(k => !ctx[k]).join(', ')})`,
    };
  }

  try {
    const { detail } = await def.run!(ctx);
    return { ...base, ok: true, detail };
  } catch (err) {
    return { ...base, ok: false, detail: formatCaughtError(err) };
  }
}

function formatStepLine(step: E2EStepLog, index: number): string {
  const icon = step.skipped ? '⏭️' : step.ok ? '✅' : '❌';
  const routePart = step.route ? ` → \`${step.route}\`` : '';
  const tablePart = step.tableOrRpc ? ` [\`${step.tableOrRpc}\`]` : '';
  return `${icon} **${index}. ${step.label}**${routePart}${tablePart}\n   ${step.detail}`;
}

function emptyPurgeCounts(): SimulationPurgeCounts {
  return {
    driver_documents: 0,
    vehicle_documents: 0,
    maintenance_records: 0,
    maintenance_logs: 0,
    vehicle_service_logs: 0,
    mileage_logs: 0,
    vehicle_expenses: 0,
    vehicle_incidents: 0,
    compliance_requests: 0,
    compliance_alerts: 0,
    compliance_docs: 0,
    driver_family_members: 0,
    driver_incidents: 0,
    org_invitations: 0,
    driver_vehicle_assignments: 0,
    vehicle_handovers: 0,
    vehicles: 0,
    drivers: 0,
  };
}

/**
 * Tables with `vehicle_id` FK → vehicles.id (from migrations + app queries).
 * Order: leaf / logging tables first, then assignments & handovers.
 */
const VEHICLE_DEPENDENT_PURGE_ORDER: ReadonlyArray<{
  table: string;
  countKey: keyof SimulationPurgeCounts;
}> = [
  { table: 'vehicle_documents', countKey: 'vehicle_documents' },
  { table: 'maintenance_records', countKey: 'maintenance_records' },
  { table: 'maintenance_logs', countKey: 'maintenance_logs' },
  { table: 'vehicle_service_logs', countKey: 'vehicle_service_logs' },
  { table: 'mileage_logs', countKey: 'mileage_logs' },
  { table: 'vehicle_expenses', countKey: 'vehicle_expenses' },
  { table: 'vehicle_incidents', countKey: 'vehicle_incidents' },
  { table: 'driver_vehicle_assignments', countKey: 'driver_vehicle_assignments' },
  { table: 'vehicle_handovers', countKey: 'vehicle_handovers' },
];

/** Optional audit / history tables that may reference `vehicle_id` (prod-only migrations) */
const OPTIONAL_AUDIT_VEHICLE_ID_TABLES: readonly string[] = [
  'fleet_logs',
  'audit_logs',
  'activity_logs',
  'status_logs',
  'vehicle_history',
  'vehicle_logs',
  'vehicle_mileage_logs',
];

/** Tables where `vehicle_id` is nullable — clear before parent DELETE */
const VEHICLE_NULLABLE_REF_TABLES: readonly string[] = [
  'driver_incidents',
  'compliance_alerts',
];

/** Tables keyed by entity_type + entity_id instead of vehicle_id */
const VEHICLE_ENTITY_REF_PURGE: ReadonlyArray<{ table: string; countKey: keyof SimulationPurgeCounts }> = [
  { table: 'compliance_alerts', countKey: 'compliance_alerts' },
  { table: 'compliance_requests', countKey: 'compliance_requests' },
];

/**
 * Tables with `driver_id` FK → drivers.id (from migrations + app queries).
 * Order: leaf tables first, then assignments & handovers.
 */
const DRIVER_DEPENDENT_PURGE_ORDER: ReadonlyArray<{
  table: string;
  countKey: keyof SimulationPurgeCounts;
}> = [
  { table: 'compliance_docs', countKey: 'compliance_docs' },
  { table: 'driver_family_members', countKey: 'driver_family_members' },
  { table: 'driver_incidents', countKey: 'driver_incidents' },
  { table: 'driver_documents', countKey: 'driver_documents' },
  { table: 'driver_vehicle_assignments', countKey: 'driver_vehicle_assignments' },
  { table: 'vehicle_handovers', countKey: 'vehicle_handovers' },
  { table: 'compliance_requests', countKey: 'compliance_requests' },
];

const DRIVER_ENTITY_REF_PURGE: ReadonlyArray<{ table: string; countKey: keyof SimulationPurgeCounts }> = [
  { table: 'compliance_alerts', countKey: 'compliance_alerts' },
];

/** Sim invitation emails from edge send-invite step */
const SIM_DRIVER_EMAIL_RE = /sim[-a-z0-9]*@example\.com/i;
/** Legacy/alternate sim driver naming: "נהג 999335875 (בדיקת מערכת)" */
const SIM_DRIVER_LEGACY_NAME_RE = /^נהג\s+\d+/;

function isSimulationDriverRecord(
  d: { full_name?: string | null; email?: string | null; department?: string | null },
  runToken?: string,
): boolean {
  const fullName = String(d.full_name ?? '');
  const email = String(d.email ?? '').toLowerCase();
  const department = String(d.department ?? '');

  const marked =
    fullName.includes(E2E_SIM_LABEL) ||
    fullName.includes(E2E_SIM_ALT) ||
    SIM_DRIVER_LEGACY_NAME_RE.test(fullName.trim()) ||
    SIM_DRIVER_EMAIL_RE.test(email) ||
    department.includes(E2E_SIM_ALT);

  if (!marked) return false;
  if (!runToken) return true;
  return `${fullName} ${email}`.includes(runToken);
}

function isSimulationVehicleRecord(
  v: { plate_number?: string | null; model?: string | null; manufacturer?: string | null },
  runToken?: string,
): boolean {
  if (v.model !== E2E_SIM_ALT || v.manufacturer !== 'Toyota') return false;
  if (!runToken) return true;
  return String(v.plate_number ?? '').includes(runToken.slice(-6));
}

/** Identify simulation drivers/vehicles by label, email pattern, or optional run token */
async function findSimulationFleetIds(
  orgId: string,
  runToken?: string,
): Promise<{ driverIds: string[]; vehicleIds: string[] }> {
  const { data: drivers, error: dErr } = await supabase
    .from('drivers')
    .select('id, full_name, email, department')
    .eq('org_id', orgId);

  failIfSupabaseError(dErr, 'איתור נהגי בדיקה');

  let driverIds = (drivers ?? [])
    .filter((d) => isSimulationDriverRecord(d, runToken))
    .map((d) => d.id);

  const { data: vehicles, error: vErr } = await supabase
    .from('vehicles')
    .select('id, plate_number, model, manufacturer')
    .eq('org_id', orgId);

  failIfSupabaseError(vErr, 'איתור רכבי בדיקה');

  let vehicleIds = (vehicles ?? [])
    .filter((v) => isSimulationVehicleRecord(v, runToken))
    .map((v) => v.id);

  if (runToken && driverIds.length === 0) {
    const { data: byToken } = await supabase
      .from('drivers')
      .select('id')
      .eq('org_id', orgId)
      .or(`full_name.ilike.%${runToken}%,email.ilike.%${runToken}%`);
    driverIds = (byToken ?? []).map((r) => r.id);
  }

  return { driverIds: [...new Set(driverIds)], vehicleIds: [...new Set(vehicleIds)] };
}

async function countDeleted(
  table: string,
  filter: { column: string; values: string[] },
): Promise<number> {
  if (!filter.values.length) return 0;
  const { count, error } = await supabase
    .from(table as never)
    .delete({ count: 'exact' })
    .in(filter.column, filter.values);
  if (error) failIfSupabaseError(error, `מחיקה מ-${table}`);
  return count ?? 0;
}

/** Skip missing tables/columns (optional migrations) but surface real FK/RLS errors */
async function countDeletedSafe(
  table: string,
  filter: { column: string; values: string[] },
): Promise<number> {
  if (!filter.values.length) return 0;
  const { count, error } = await supabase
    .from(table as never)
    .delete({ count: 'exact' })
    .in(filter.column, filter.values);
  if (error) {
    if (isMissingSchemaObjectError(error)) return 0;
    failIfSupabaseError(error, `מחיקה מ-${table}`);
  }
  return count ?? 0;
}

function isFkConstraintError(err: unknown): boolean {
  return /foreign key|קישור שגוי/i.test(formatCaughtError(err));
}

function isIgnorableNullableClearError(error: unknown): boolean {
  if (isMissingSchemaObjectError(error)) return true;
  const msg = formatSupabaseError(error);
  return /not-null|null value|violates not-null|עמודה.*לא נמצא/i.test(msg);
}

/** SET nullable FK columns to NULL for rows pointing at simulation vehicles */
async function nullVehicleIdColumnSafe(table: string, vehicleIds: string[]): Promise<void> {
  if (!vehicleIds.length) return;
  const { error } = await supabase
    .from(table as never)
    .update({ vehicle_id: null } as never)
    .in('vehicle_id', vehicleIds);
  if (error && !isIgnorableNullableClearError(error)) {
    failIfSupabaseError(error, `ניקוי ${table}.vehicle_id`);
  }
}

/** Delete rows tied to vehicles via entity_type + entity_id (compliance_alerts, etc.) */
async function deleteByEntityRefSafe(
  table: string,
  entityType: 'vehicle' | 'driver',
  entityIds: string[],
): Promise<number> {
  if (!entityIds.length) return 0;
  const { count, error } = await supabase
    .from(table as never)
    .delete({ count: 'exact' })
    .eq('entity_type', entityType)
    .in('entity_id', entityIds);
  if (error) {
    if (isMissingSchemaObjectError(error)) return 0;
    failIfSupabaseError(error, `מחיקה מ-${table} (${entityType})`);
  }
  return count ?? 0;
}

/**
 * Fallback for audit tables (mileage_logs, vehicle_service_logs) where DELETE may be
 * blocked by RLS/grants — select primary keys first, then delete by id.
 */
async function deleteChildRowsByPrimaryKey(table: string, vehicleIds: string[]): Promise<number> {
  if (!vehicleIds.length) return 0;

  const { data: rows, error: selectErr } = await supabase
    .from(table as never)
    .select('id')
    .in('vehicle_id', vehicleIds);
  if (selectErr) {
    if (isMissingSchemaObjectError(selectErr)) return 0;
    return 0;
  }

  const ids = (rows ?? [])
    .map((row) => String((row as { id?: string }).id ?? '').trim())
    .filter(Boolean);
  if (!ids.length) return 0;

  const { count, error: deleteErr } = await supabase
    .from(table as never)
    .delete({ count: 'exact' })
    .in('id', ids);
  if (deleteErr) {
    if (isMissingSchemaObjectError(deleteErr)) return 0;
    const msg = formatSupabaseError(deleteErr);
    if (/permission denied|row-level security|אין הרשאה|42501/i.test(msg)) return 0;
    failIfSupabaseError(deleteErr, `מחיקה מ-${table} לפי מזהה`);
  }
  return count ?? 0;
}

/** SET nullable FK columns to NULL for rows pointing at simulation drivers */
async function nullDriverIdColumnSafe(table: string, driverIds: string[]): Promise<void> {
  if (!driverIds.length) return;
  const { error } = await supabase
    .from(table as never)
    .update({ driver_id: null } as never)
    .in('driver_id', driverIds);
  if (error && !isIgnorableNullableClearError(error)) {
    failIfSupabaseError(error, `ניקוי ${table}.driver_id`);
  }
}

/** Fallback delete by primary key when driver_id DELETE is blocked by RLS */
async function deleteChildRowsByDriverPrimaryKey(table: string, driverIds: string[]): Promise<number> {
  if (!driverIds.length) return 0;

  const { data: rows, error: selectErr } = await supabase
    .from(table as never)
    .select('id')
    .in('driver_id', driverIds);
  if (selectErr) {
    if (isMissingSchemaObjectError(selectErr)) return 0;
    return 0;
  }

  const ids = (rows ?? [])
    .map((row) => String((row as { id?: string }).id ?? '').trim())
    .filter(Boolean);
  if (!ids.length) return 0;

  const { count, error: deleteErr } = await supabase
    .from(table as never)
    .delete({ count: 'exact' })
    .in('id', ids);
  if (deleteErr) {
    if (isMissingSchemaObjectError(deleteErr)) return 0;
    const msg = formatSupabaseError(deleteErr);
    if (/permission denied|row-level security|אין הרשאה|42501/i.test(msg)) return 0;
    failIfSupabaseError(deleteErr, `מחיקה מ-${table} לפי מזהה (נהג)`);
  }
  return count ?? 0;
}

/** Remove sim invite rows created by edge send-invite (email pattern, not driver_id FK) */
async function deleteSimOrgInvitations(orgId: string): Promise<number> {
  const { count, error } = await supabase
    .from('org_invitations' as never)
    .delete({ count: 'exact' })
    .eq('org_id', orgId)
    .ilike('email', '%sim%@example.com%');
  if (error) {
    if (isMissingSchemaObjectError(error)) return 0;
    failIfSupabaseError(error, 'מחיקת הזמנות sim מ-org_invitations');
  }
  return count ?? 0;
}

async function purgeDriverDependentRows(
  orgId: string,
  driverIds: string[],
  counts?: SimulationPurgeCounts,
): Promise<void> {
  if (!driverIds.length) return;

  for (const { table, countKey } of DRIVER_DEPENDENT_PURGE_ORDER) {
    const deleted = await countDeletedSafe(table, {
      column: 'driver_id',
      values: driverIds,
    });
    if (counts) counts[countKey] += deleted;
    await deleteChildRowsByDriverPrimaryKey(table, driverIds);
  }

  for (const { table, countKey } of DRIVER_ENTITY_REF_PURGE) {
    const deleted = await deleteByEntityRefSafe(table, 'driver', driverIds);
    if (counts) counts[countKey] += deleted;
  }

  const invites = await deleteSimOrgInvitations(orgId);
  if (counts) counts.org_invitations += invites;
}

/** Clear reverse FK pointers & child rows before DELETE drivers */
async function clearDriverReferencesBeforeDelete(
  orgId: string,
  driverIds: string[],
  counts?: SimulationPurgeCounts,
): Promise<void> {
  if (!driverIds.length) return;

  const { error: vehiclesAdErr } = await supabase
    .from('vehicles')
    .update({ assigned_driver_id: null })
    .eq('org_id', orgId)
    .in('assigned_driver_id', driverIds);
  failIfSupabaseError(vehiclesAdErr, 'ניקוי vehicles.assigned_driver_id לפני מחיקת נהגים');

  await nullDriverIdColumnSafe('compliance_requests', driverIds);
  await nullDriverIdColumnSafe('vehicle_handovers', driverIds);
  await nullDriverIdColumnSafe('driver_vehicle_assignments', driverIds);

  await purgeDriverDependentRows(orgId, driverIds, counts);
}

async function deleteSimulationDrivers(
  orgId: string,
  driverIds: string[],
  counts: SimulationPurgeCounts,
): Promise<void> {
  if (!driverIds.length) return;

  const attemptDelete = async (): Promise<number> => {
    const { count, error } = await supabase
      .from('drivers')
      .delete({ count: 'exact' })
      .in('id', driverIds)
      .eq('org_id', orgId);
    failIfSupabaseError(error, 'מחיקת נהגי בדיקה');
    return count ?? 0;
  };

  await clearDriverReferencesBeforeDelete(orgId, driverIds, counts);

  try {
    counts.drivers = await attemptDelete();
  } catch (err) {
    if (!isFkConstraintError(err)) throw err;
    await clearDriverReferencesBeforeDelete(orgId, driverIds, counts);
    counts.drivers = await attemptDelete();
  }

  if (counts.drivers === 0 && driverIds.length > 0) {
    throw new Error(
      `מחיקת נהגי בדיקה: 0 שורות נמחקו (${driverIds.length} מזהים) — ייתכן חסימת RLS או FK שלא נוקה`,
    );
  }
}

/** Re-collect sim driver IDs (e.g. after vehicle purge) with broad email/name markers */
async function collectSimulationDriverIds(orgId: string, runToken?: string): Promise<string[]> {
  const { driverIds } = await findSimulationFleetIds(orgId, runToken);
  return driverIds;
}

/** Parse integer returned by purge_e2e_simulation_vehicle_children (PostgREST may return number or string) */
function parseRpcIntegerResult(data: unknown, label: string): number {
  if (data === null || data === undefined) {
    throw new Error(`${label}: תשובה ריקה מהשרת — ייתכן שה-RPC לא הורץ`);
  }
  if (typeof data === 'number' && Number.isFinite(data)) return data;
  if (typeof data === 'string' && data.trim() !== '') {
    const parsed = Number(data);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error(`${label}: תשובה לא צפויה מהשרת (${String(data)})`);
}

/**
 * Mandatory SECURITY DEFINER purge — matches migration params `p_org_id`, `p_vehicle_ids`.
 * Runs once per simulation vehicle so PostgREST uuid[] binding cannot skip an ID.
 */
async function executePurgeVehicleChildrenRpc(orgId: string, vehicleIds: string[]): Promise<number> {
  const label = 'RPC purge_e2e_simulation_vehicle_children';
  if (!vehicleIds.length) return 0;
  if (!orgId?.trim()) {
    throw new Error(`${label}: חסר p_org_id`);
  }

  let totalDeleted = 0;
  for (const rawId of vehicleIds) {
    const vehicleId = rawId.trim();
    if (!vehicleId) continue;

    const { data, error } = await supabase.rpc('purge_e2e_simulation_vehicle_children', {
      p_org_id: orgId,
      p_vehicle_ids: [vehicleId],
    });

    if (error) {
      failIfSupabaseError(error, `${label} (רכב ${vehicleId})`);
    }

    totalDeleted += parseRpcIntegerResult(data, `${label} (רכב ${vehicleId})`);
  }

  return totalDeleted;
}

async function purgeVehicleDependentRows(
  vehicleIds: string[],
  counts?: SimulationPurgeCounts,
): Promise<void> {
  if (!vehicleIds.length) return;

  for (const { table, countKey } of VEHICLE_DEPENDENT_PURGE_ORDER) {
    const deleted = await countDeletedSafe(table, {
      column: 'vehicle_id',
      values: vehicleIds,
    });
    if (counts) counts[countKey] += deleted;
  }

  for (const table of OPTIONAL_AUDIT_VEHICLE_ID_TABLES) {
    await countDeletedSafe(table, { column: 'vehicle_id', values: vehicleIds });
    await deleteChildRowsByPrimaryKey(table, vehicleIds);
  }

  const mileageById = await deleteChildRowsByPrimaryKey('mileage_logs', vehicleIds);
  const serviceById = await deleteChildRowsByPrimaryKey('vehicle_service_logs', vehicleIds);
  if (counts) {
    counts.mileage_logs += mileageById;
    counts.vehicle_service_logs += serviceById;
  }

  for (const { table, countKey } of VEHICLE_ENTITY_REF_PURGE) {
    const deleted = await deleteByEntityRefSafe(table, 'vehicle', vehicleIds);
    if (counts) counts[countKey] += deleted;
  }
}

/** Clear reverse FK pointers, nullable refs, audit rows — right before DELETE vehicles */
async function clearVehicleReferencesBeforeDelete(
  orgId: string,
  driverIds: string[],
  vehicleIds: string[],
  counts?: SimulationPurgeCounts,
): Promise<void> {
  if (vehicleIds.length) {
    // ── Mandatory RPC first (SECURITY DEFINER — mileage_logs / vehicle_service_logs) ──
    const rpcFirstPass = await executePurgeVehicleChildrenRpc(orgId, vehicleIds);

    for (const table of VEHICLE_NULLABLE_REF_TABLES) {
      await nullVehicleIdColumnSafe(table, vehicleIds);
    }

    await purgeVehicleDependentRows(vehicleIds);

    // ── Mandatory RPC again immediately before client-side vehicle DELETE ──
    const rpcFinalPass = await executePurgeVehicleChildrenRpc(orgId, vehicleIds);
    if (counts) {
      counts.mileage_logs += rpcFirstPass + rpcFinalPass;
    }

    const { error: driversAvErr } = await supabase
      .from('drivers')
      .update({ assigned_vehicle_id: null })
      .eq('org_id', orgId)
      .in('assigned_vehicle_id', vehicleIds);
    failIfSupabaseError(driversAvErr, 'ניקוי drivers.assigned_vehicle_id');
  }

  if (driverIds.length) {
    const { error: vehiclesAdErr } = await supabase
      .from('vehicles')
      .update({ assigned_driver_id: null })
      .eq('org_id', orgId)
      .in('assigned_driver_id', driverIds);
    failIfSupabaseError(vehiclesAdErr, 'ניקוי vehicles.assigned_driver_id');
  }

  if (vehicleIds.length) {
    const { error: selfClearErr } = await supabase
      .from('vehicles')
      .update({ assigned_driver_id: null })
      .eq('org_id', orgId)
      .in('id', vehicleIds);
    failIfSupabaseError(selfClearErr, 'ניקוי שיוך נהג ברכבי בדיקה');
  }
}

async function deleteSimulationVehicles(
  orgId: string,
  driverIds: string[],
  vehicleIds: string[],
  counts: SimulationPurgeCounts,
): Promise<void> {
  if (!vehicleIds.length) return;

  const attemptDelete = async (): Promise<number> => {
    const { count, error } = await supabase
      .from('vehicles')
      .delete({ count: 'exact' })
      .in('id', vehicleIds)
      .eq('org_id', orgId);
    failIfSupabaseError(error, 'מחיקת רכבי בדיקה');
    return count ?? 0;
  };

  // Last-chance RPC immediately before DELETE vehicles (no silent skip)
  const rpcBeforeDelete = await executePurgeVehicleChildrenRpc(orgId, vehicleIds);
  counts.mileage_logs += rpcBeforeDelete;

  try {
    counts.vehicles = await attemptDelete();
  } catch (err) {
    if (!isFkConstraintError(err)) throw err;
    await clearVehicleReferencesBeforeDelete(orgId, driverIds, vehicleIds, counts);
    await executePurgeVehicleChildrenRpc(orgId, vehicleIds);
    counts.vehicles = await attemptDelete();
  }
}

/** Hard-delete all simulation artifacts for the current org (optionally scoped by run token) */
export async function purgeSimulationDataForOrg(
  orgId: string,
  runToken?: string,
): Promise<SimulationPurgeCounts> {
  const counts = emptyPurgeCounts();
  const { driverIds: initialDriverIds, vehicleIds } = await findSimulationFleetIds(orgId, runToken);

  if (!initialDriverIds.length && !vehicleIds.length) {
    return counts;
  }

  let driverIds = [...initialDriverIds];

  // ── 1. Early driver child purge (documents + compliance) ───────────────
  if (driverIds.length) {
    await purgeDriverDependentRows(orgId, driverIds, counts);
  }

  // ── 2. All vehicle_id-dependent child tables (bottom-up) ─────────────────
  if (vehicleIds.length) {
    await purgeVehicleDependentRows(vehicleIds, counts);
  }

  // ── 3. Final vehicle reference release + DELETE vehicles ───────────────
  await clearVehicleReferencesBeforeDelete(orgId, driverIds, vehicleIds, counts);
  await deleteSimulationVehicles(orgId, driverIds, vehicleIds, counts);

  // ── 4. Refresh driver IDs (broad sim markers) then purge + DELETE drivers ─
  driverIds = [...new Set([...driverIds, ...(await collectSimulationDriverIds(orgId, runToken))])];
  await deleteSimulationDrivers(orgId, driverIds, counts);

  return counts;
}

export async function actionDeleteTestSimulationData(runToken?: string): Promise<string> {
  const ctx = await resolveE2EContext();
  if (!ctx) {
    return '❌ לא ניתן לנקות נתוני בדיקה — יש להתחבר עם פרופיל ארגון פעיל.';
  }

  try {
    const counts = await purgeSimulationDataForOrg(ctx.orgId, runToken?.trim() || undefined);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    if (total === 0) {
      return runToken
        ? `ℹ️ לא נמצאו נתוני בדיקה לאסימון \`${runToken}\` בארגון \`${ctx.orgId}\`.`
        : `ℹ️ לא נמצאו נתוני בדיקה המסומנים ב־${E2E_SIM_LABEL} בארגון \`${ctx.orgId}\`.`;
    }

    return `🧹 **ניקוי נתוני בדיקה הושלם**

**ארגון:** \`${ctx.orgId}\`${runToken ? `\n**אסימון:** \`${runToken}\`` : ''}

**שורות שנמחקו:**
• מסמכי נהג: ${counts.driver_documents}
• מסמכי ציות (compliance_docs): ${counts.compliance_docs}
• בני משפחה (נהג): ${counts.driver_family_members}
• אירועי נהג: ${counts.driver_incidents}
• הזמנות צוות (sim): ${counts.org_invitations}
• מסמכי רכב: ${counts.vehicle_documents}
• רישומי טיפול (maintenance_records): ${counts.maintenance_records}
• לוגי טיפול (maintenance_logs): ${counts.maintenance_logs}
• לוגי שירות: ${counts.vehicle_service_logs}
• דיווחי ק״מ (mileage_logs): ${counts.mileage_logs}
• הוצאות רכב: ${counts.vehicle_expenses}
• אירועים/תאונות רכב: ${counts.vehicle_incidents}
• בקשות ציות: ${counts.compliance_requests}
• התראות ציות: ${counts.compliance_alerts}
• שיוכי נהג-רכב: ${counts.driver_vehicle_assignments}
• העברות רכב: ${counts.vehicle_handovers}
• רכבים: ${counts.vehicles}
• נהגים: ${counts.drivers}

**סה״כ:** ${total} רשומות הוסרו מהמערכת.`;
  } catch (err) {
    return `❌ ניקוי נכשל: ${formatCaughtError(err)}`;
  }
}

export async function actionRunComprehensiveE2ETest(): Promise<string> {
  const ctx = await resolveE2EContext();
  if (!ctx) {
    return '❌ לא ניתן להריץ בדיקה מקיפה — יש להתחבר עם פרופיל ארגון פעיל.';
  }

  const registry = buildFleetE2ECapabilityRegistry();
  const steps: E2EStepLog[] = [];
  let failed = 0;
  let softFailed = 0;
  let skipped = 0;

  for (const def of registry) {
    const result = await runCapability(def, ctx);
    steps.push(result);
    if (result.skipped) skipped += 1;
    else if (!result.ok && result.optional) softFailed += 1;
    else if (!result.ok) failed += 1;
  }

  const passed = steps.filter(s => s.ok && !s.skipped).length;
  const layers = [...new Set(steps.map(s => s.layer))];
  const routeCoverage = FLEET_ROUTE_CATALOG.length;

  const layerSummary = layers
    .map(layer => {
      const layerSteps = steps.filter(s => s.layer === layer);
      const layerOk = layerSteps.filter(s => s.ok && !s.skipped).length;
      return `• **${layer}**: ${layerOk}/${layerSteps.length}`;
    })
    .join('\n');

  const stepLog = steps.map((s, i) => formatStepLine(s, i + 1)).join('\n\n');

  const statusEmoji = failed === 0 ? '🏆' : '⚠️';
  const statusText = failed === 0
    ? 'כל השכבות הניתנות לבדיקה עברו בהצלחה'
    : `${failed} שלבים נכשלו — בדוק הרשאות RLS או מיגרציות חסרות`;

  return `${statusEmoji} **בדיקה מקיפה E2E — ${E2E_SIM_LABEL}**

**סיכום ריצה:** ${passed} עברו · ${skipped} דולגו · ${failed} נכשלו${softFailed > 0 ? ` · ${softFailed} אופציונליים נכשלו` : ''}
**ארגון:** \`${ctx.orgId}\`
**אסימון ריצה:** \`${ctx.runToken}\`
**כיסוי מסכים (App.tsx):** ${routeCoverage} נתיבי ליבה ממופים
**יכולות שנבדקו:** ${registry.length} (מהקוד — לא רשימה קשיחה)

**שכבות:**
${layerSummary}

---

**יומן שלבים:**

${stepLog}

---

${statusText}

**מצב חי:** נתוני הבדיקה נשמרים במערכת. מיילים מסומנים בנושא \`${E2E_EMAIL_SUBJECT_PREFIX}\`.
לניקוי ידני: «מחק נתוני בדיקה» או «הסר נתוני בדיקה».`;
}
