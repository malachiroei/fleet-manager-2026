import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PricingData, Vehicle } from '@/types/fleet';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

const VEHICLES_STORAGE_KEY = 'vehicles_data';

const normalizeCode = (value: string | null | undefined) => {
  const trimmed = (value || '').trim();
  const withoutLeadingZeros = trimmed.replace(/^0+/, '');
  return withoutLeadingZeros || '0';
};

const buildCodeCandidates = (value: string | null | undefined) => {
  const trimmed = (value || '').trim();
  const normalized = normalizeCode(trimmed);
  const candidates = new Set<string>([trimmed, normalized]);

  [4, 5, 6].forEach((length) => {
    candidates.add(normalized.padStart(length, '0'));
  });

  return Array.from(candidates).filter(Boolean);
};

const getStoredVehicles = (): Vehicle[] => {
  const stored = localStorage.getItem(VEHICLES_STORAGE_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored) as Vehicle[];
  } catch {
    return [];
  }
};

const saveStoredVehicles = (vehicles: Vehicle[]) => {
  localStorage.setItem(VEHICLES_STORAGE_KEY, JSON.stringify(vehicles));
};

const applyPricingToVehicle = (vehicle: Vehicle, p: PricingData): Vehicle => ({
  ...vehicle,
  tax_value_price: p.usage_value,
  tax_year: p.usage_year,
  adjusted_price: p.adjusted_price,
  vehicle_type_code: p.vehicle_type_code,
  model_description: p.model_description,
  fuel_type: p.fuel_type,
  commercial_name: p.commercial_name,
  is_automatic: p.is_automatic,
  drive_type: p.drive_type,
  green_score: p.green_score,
  pollution_level: p.pollution_level,
  engine_volume: p.engine_volume_cc?.toString() || vehicle.engine_volume,
  weight: p.weight,
  list_price: p.list_price,
  effective_date: p.effective_date,
  updated_at: new Date().toISOString(),
});

const findBestPricingMatch = (
  rows: PricingData[],
  manufacturerCode: string,
  modelCode: string,
  registrationYear?: number | null
) => {
  const normalizedManufacturer = normalizeCode(manufacturerCode);
  const normalizedModel = normalizeCode(modelCode);

  return (
    rows
      .filter((row) => {
        const manufacturerMatches = normalizeCode(row.manufacturer_code) === normalizedManufacturer;
        const modelMatches = normalizeCode(row.model_code) === normalizedModel;
        const yearMatches =
          !registrationYear ||
          (row.registration_year !== null && row.registration_year === registrationYear);

        return manufacturerMatches && modelMatches && yearMatches;
      })
      .sort((a, b) => {
        const yearA = a.registration_year ?? 0;
        const yearB = b.registration_year ?? 0;
        if (yearA !== yearB) return yearB - yearA;
        return (b.usage_year ?? 0) - (a.usage_year ?? 0);
      })[0] || null
  );
};

const fetchPricingCandidates = async (
  manufacturerCode: string,
  modelCode: string,
  registrationYear?: number | null
): Promise<PricingData[]> => {
  let query = supabase
    .from('pricing_data')
    .select('*')
    .in('manufacturer_code', buildCodeCandidates(manufacturerCode))
    .in('model_code', buildCodeCandidates(modelCode));

  if (registrationYear) {
    query = query.eq('registration_year', registrationYear);
  }

  const { data, error } = await query.limit(200);
  if (error) throw error;

  return (data || []) as PricingData[];
};

export function usePricingData() {
  return useQuery({
    queryKey: ['pricing-data'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pricing_data')
        .select('*')
        .order('manufacturer_code');

      if (error) throw error;
      return data as PricingData[];
    }
  });
}

export function usePricingRowCount() {
  return useQuery({
    queryKey: ['pricing-row-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('pricing_data')
        .select('id', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 60_000,
  });
}

export function usePricingLookup(manufacturerCode: string | null, modelCode: string | null, registrationYear?: number | null) {
  return useQuery({
    queryKey: ['pricing-lookup', manufacturerCode, modelCode, registrationYear],
    queryFn: async () => {
      if (!manufacturerCode || !modelCode) return null;

      const candidates = await fetchPricingCandidates(manufacturerCode, modelCode, registrationYear);
      return findBestPricingMatch(candidates, manufacturerCode, modelCode, registrationYear);
    },
    enabled: !!manufacturerCode && !!modelCode
  });
}

export function useSyncVehicleFromPricing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ vehicleId, manufacturerCode, modelCode, year }: { vehicleId: string; manufacturerCode: string; modelCode: string; year: number }) => {
      const candidates = await fetchPricingCandidates(manufacturerCode, modelCode, year);
      const pricingRow = findBestPricingMatch(candidates, manufacturerCode, modelCode, year);

      if (!pricingRow) throw new Error('לא נמצאה שורה מתאימה במחירון');

      return { vehicleId, pricingRow };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['vehicle', data.vehicleId] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      toast({ title: 'נתוני המחירון סונכרנו בהצלחה לכרטיס הרכב' });
    },
    onError: (error) => {
      toast({ title: 'שגיאה בסנכרון', description: error.message, variant: 'destructive' });
    }
  });
}

export function useUploadPricingData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      rows,
      onProgress,
    }: {
      rows: Omit<PricingData, 'id' | 'created_at' | 'updated_at'>[];
      onProgress?: (percent: number) => void;
    }) => {
      if (rows.length === 0) return { insertedCount: 0 };

      // Delete existing data first
      const { error: deleteError } = await supabase
        .from('pricing_data')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (deleteError) throw deleteError;
      onProgress?.(5);

      const chunkSize = 1000;
      let insertedCount = 0;
      const totalChunks = Math.max(1, Math.ceil(rows.length / chunkSize));

      for (let index = 0; index < rows.length; index += chunkSize) {
        const chunk = rows.slice(index, index + chunkSize);
        const { error } = await supabase
          .from('pricing_data')
          .insert(chunk as any);

        if (error) throw error;
        insertedCount += chunk.length;
        const completedChunks = Math.floor(index / chunkSize) + 1;
        const ratio = completedChunks / totalChunks;
        onProgress?.(Math.min(95, Math.round(5 + ratio * 90)));
      }

      onProgress?.(100);
      return { insertedCount };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pricing-data'] });
      toast({ title: `נטענו ${data?.insertedCount || 0} רשומות מחירון בהצלחה` });
    },
    onError: (error) => {
      toast({ title: 'שגיאה בטעינת המחירון', description: error.message, variant: 'destructive' });
    }
  });
}

export function useSyncVehiclesFromPricing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Guard: make sure pricing_data table actually has rows
      const { count: pricingCount, error: countError } = await supabase
        .from('pricing_data')
        .select('id', { count: 'exact', head: true });

      if (countError) throw countError;

      if (!pricingCount || pricingCount === 0) {
        throw new Error(
          'טבלת המחירון ריקה — יש לטעון תחילה את קובץ ה-Excel של משרד התחבורה דרך כפתור “בחר קובץ” למעלה'
        );
      }

      // Always fetch live vehicles from Supabase — never rely on stale localStorage cache
      const { data: vehiclesData, error: vehiclesError } = await supabase
        .from('vehicles')
        .select('*')
        .eq('is_active', true);

      if (vehiclesError) throw vehiclesError;

      const vehicles: Vehicle[] = (vehiclesData || []) as Vehicle[];
      const vehiclesToSync = vehicles.filter(
        (v) => Boolean(v.manufacturer_code && v.model_code && v.year)
      );

      if (vehiclesToSync.length === 0) {
        return { updated: 0, notFound: 0, notFoundNames: [] as string[], total: 0 };
      }

      const cache = new Map<string, PricingData | null>();
      let updated = 0;
      const notFoundNames: string[] = [];

      for (const vehicle of vehiclesToSync) {
        const cacheKey = `${normalizeCode(vehicle.manufacturer_code)}|${normalizeCode(vehicle.model_code)}|${vehicle.year}`;

        if (!cache.has(cacheKey)) {
          const candidates = await fetchPricingCandidates(
            vehicle.manufacturer_code!,
            vehicle.model_code!,
            vehicle.year
          );
          const bestMatch = findBestPricingMatch(
            candidates,
            vehicle.manufacturer_code!,
            vehicle.model_code!,
            vehicle.year
          );
          cache.set(cacheKey, bestMatch);
        }

        const pricingRow = cache.get(cacheKey);
        if (!pricingRow) {
          notFoundNames.push(
            `${vehicle.manufacturer} ${vehicle.model} (${vehicle.plate_number} — קוד: ${vehicle.manufacturer_code}/${vehicle.model_code})`
          );
          continue;
        }

        const patch = {
          tax_value_price:  pricingRow.usage_value,
          tax_year:         pricingRow.usage_year,
          adjusted_price:   pricingRow.adjusted_price,
          vehicle_type_code: pricingRow.vehicle_type_code,
          model_description: pricingRow.model_description,
          fuel_type:        pricingRow.fuel_type,
          commercial_name:  pricingRow.commercial_name,
          is_automatic:     pricingRow.is_automatic,
          drive_type:       pricingRow.drive_type,
          green_score:      pricingRow.green_score,
          pollution_level:  pricingRow.pollution_level,
          engine_volume:    pricingRow.engine_volume_cc?.toString() || vehicle.engine_volume,
          weight:           pricingRow.weight,
          list_price:       pricingRow.list_price,
          effective_date:   pricingRow.effective_date,
          updated_at:       new Date().toISOString(),
        };

        const { error: updateError } = await supabase
          .from('vehicles')
          .update(patch as any)
          .eq('id', vehicle.id);

        if (updateError) {
          console.error('[useSyncVehiclesFromPricing] update error for', vehicle.id, updateError);
          notFoundNames.push(`${vehicle.manufacturer} ${vehicle.model} (שגיאת DB)`);
          continue;
        }

        updated += 1;
      }

      // Refresh localStorage cache with this org's vehicles only
      const { data: refreshed } = await supabase.from('vehicles').select('*').eq('org_id', orgId).eq('is_active', true);
      if (refreshed) saveStoredVehicles(refreshed as Vehicle[]);

      return { updated, notFound: notFoundNames.length, notFoundNames, total: vehiclesToSync.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['vehicle'] });
    },
    onError: (error) => {
      toast({ title: 'שגיאה בסנכרון', description: error.message, variant: 'destructive' });
    }
  });
}
