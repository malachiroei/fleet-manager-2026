import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useImpersonationFleetScope } from '@/hooks/useImpersonationFleetScope';
import { resolveProcedure6DriverForPlate } from '@/lib/procedure6ResolveDriver';
import { normalizePlateNumber } from '@/lib/plateNumber';

export interface Complaint {
  id: string;
  org_id?: string | null;
  driver_id?: string | null;
  vehicle_id?: string | null;
  vehicle_number: string;
  report_id: string | null;
  report_type: string | null;
  location: string | null;
  description: string | null;
  report_date_time: string | null;
  reporter_name: string | null;
  reporter_cell_phone: string | null;
  received_time: string | null;
  receiver_name: string | null;
  driver_response: string | null;
  driver_name: string | null;
  action_taken: string | null;
  first_update_time: string | null;
  last_update_time: string | null;
  status: string;
  response_token?: string | null;
  forwarded_by?: string | null;
  forwarded_to_email?: string | null;
  closed_at?: string | null;
  source?: string | null;
  /** Append-only timeline of handling (clarification / responses / close) */
  process_log?: string | null;
  created_at: string;
  updated_at: string;
}

export type ComplaintInsert = Omit<Complaint, 'id' | 'created_at' | 'updated_at'>;

function newResponseToken(): string {
  const uuid = crypto.randomUUID().replace(/-/g, '');
  const extra = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  return `${uuid}${extra}`;
}

async function enrichComplaintWithDriver(
  row: ComplaintInsert,
  fallbackOrgId: string | null,
): Promise<ComplaintInsert> {
  const plate = normalizePlateNumber(row.vehicle_number) || row.vehicle_number;
  const resolved = await resolveProcedure6DriverForPlate(
    plate,
    row.report_date_time,
    row.org_id ?? fallbackOrgId,
  );
  const orgId = row.org_id || resolved.org_id || fallbackOrgId;
  const driverId = row.driver_id ?? resolved.driver_id ?? null;
  const driverName =
    row.driver_name?.trim() ||
    resolved.driver_name ||
    (driverId ? null : 'ללא נהג');

  return {
    ...row,
    org_id: orgId,
    vehicle_id: row.vehicle_id ?? resolved.vehicle_id ?? null,
    driver_id: driverId,
    driver_name: driverName,
    vehicle_number: resolved.plate_number || plate || row.vehicle_number,
    source: row.source ?? 'manual',
    response_token: row.response_token?.trim() || newResponseToken(),
  };
}

export function useComplaints() {
  const { effectiveOrgId, fleetListReady } = useImpersonationFleetScope();
  const orgId = effectiveOrgId ?? null;

  return useQuery({
    queryKey: ['procedure6_complaints', orgId],
    enabled: fleetListReady && orgId != null,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      if (!orgId) return [] as Complaint[];
      const { data, error } = await supabase
        .from('procedure6_complaints')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as Complaint[];
    },
  });
}

/** תלונה יחידה (טופס ידני מתיק נהג). */
async function notifyStaffNewComplaint(complaintId: string) {
  try {
    await supabase.functions.invoke('send-procedure6-new-complaint-email', {
      body: { complaint_id: complaintId },
    });
  } catch (err) {
    console.warn('[useCreateComplaint] staff notify', err);
  }
}

export function useCreateComplaint() {
  const queryClient = useQueryClient();
  const { activeOrgId } = useAuth();
  const { effectiveOrgId } = useImpersonationFleetScope();

  return useMutation({
    mutationFn: async (row: ComplaintInsert) => {
      const orgFallback = effectiveOrgId ?? activeOrgId ?? null;
      const enriched = await enrichComplaintWithDriver(row, orgFallback);
      if (!enriched.org_id) throw new Error('חסר ארגון פעיל לשיוך התלונה');
      const { data, error } = await supabase
        .from('procedure6_complaints')
        .insert(enriched)
        .select()
        .single();

      if (error) throw error;
      if (data?.id) await notifyStaffNewComplaint(data.id);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procedure6_complaints'] });
      toast({ title: 'התלונה נוספה בהצלחה' });
    },
    onError: (error: Error) => {
      toast({ title: 'שגיאה בהוספת תלונה', description: error.message, variant: 'destructive' });
    },
  });
}

export function useCreateComplaints() {
  const queryClient = useQueryClient();
  const { activeOrgId } = useAuth();
  const { effectiveOrgId } = useImpersonationFleetScope();

  return useMutation({
    mutationFn: async (complaints: ComplaintInsert[]) => {
      const orgFallback = effectiveOrgId ?? activeOrgId ?? null;
      const enriched = [];
      for (const row of complaints) {
        enriched.push(await enrichComplaintWithDriver({ ...row, source: row.source ?? 'xml' }, orgFallback));
      }
      if (enriched.some((r) => !r.org_id)) {
        throw new Error('חסר ארגון פעיל לשיוך התלונות');
      }
      const { data, error } = await supabase.from('procedure6_complaints').insert(enriched).select();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['procedure6_complaints'] });
      toast({ title: `נטענו ${data.length} תלונות בהצלחה` });
    },
    onError: (error: Error) => {
      toast({ title: 'שגיאה בטעינת תלונות', description: error.message, variant: 'destructive' });
    },
  });
}

async function notifyStaffStatusUpdate(complaintId: string, previousStatus: string) {
  try {
    await supabase.functions.invoke('send-procedure6-status-update-email', {
      body: { complaint_id: complaintId, previous_status: previousStatus },
    });
  } catch (err) {
    console.warn('[useUpdateComplaint] status notify', err);
  }
}

export function useUpdateComplaint() {
  const queryClient = useQueryClient();
  const { effectiveOrgId } = useImpersonationFleetScope();
  const orgId = effectiveOrgId ?? null;

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Complaint> & { id: string }) => {
      if (!orgId) throw new Error('חסר ארגון פעיל');

      const { data: before, error: beforeErr } = await supabase
        .from('procedure6_complaints')
        .select('status, action_taken, driver_response')
        .eq('id', id)
        .eq('org_id', orgId)
        .maybeSingle();
      if (beforeErr) throw beforeErr;

      const previousStatus = (before as { status?: string } | null)?.status ?? null;

      const patch: Record<string, unknown> = { ...updates };
      // process_log is written by Edge Functions after migration; never block manual save on it
      delete patch.process_log;

      if (updates.status === 'closed' && !updates.closed_at) {
        patch.closed_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('procedure6_complaints')
        .update(patch)
        .eq('id', id)
        .eq('org_id', orgId)
        .select()
        .single();

      if (error) throw error;

      const nextStatus = typeof updates.status === 'string' ? updates.status.trim() : '';
      if (nextStatus && previousStatus != null && nextStatus !== previousStatus) {
        await notifyStaffStatusUpdate(id, previousStatus);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procedure6_complaints'] });
      toast({ title: 'התלונה עודכנה בהצלחה' });
    },
    onError: (error: Error) => {
      toast({ title: 'שגיאה בעדכון תלונה', description: error.message, variant: 'destructive' });
    },
  });
}

export function useForwardProcedure6Complaint() {
  const queryClient = useQueryClient();
  const { activeOrgId } = useAuth();
  const { effectiveOrgId } = useImpersonationFleetScope();

  return useMutation({
    mutationFn: async (input: { complaintId: string; driverEmail: string }) => {
      const { data, error } = await supabase.functions.invoke('send-procedure6-forward', {
        body: {
          complaint_id: input.complaintId,
          driver_email: input.driverEmail,
          org_id: effectiveOrgId ?? activeOrgId ?? null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      return data as { ok: boolean; response_url?: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procedure6_complaints'] });
      toast({ title: 'הקישור נשלח לנהג במייל' });
    },
    onError: (error: Error) => {
      toast({ title: 'שגיאה בשליחת קישור לנהג', description: error.message, variant: 'destructive' });
    },
  });
}
