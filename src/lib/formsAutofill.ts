import type { User } from '@supabase/supabase-js';

type DriverLike = {
  full_name?: string | null;
  id_number?: string | null;
};

type VehicleLike = {
  plate_number?: string | null;
};

export type FormsCategory = 'תפעול' | 'בטיחות' | 'מסמכים אישיים';

export interface FormsAutoFillContext {
  employee_name: string;
  id_number: string;
  vehicle_number: string;
  date: string;
}

export function buildFormsAutoFillContext(params: {
  user?: User | null;
  driver?: DriverLike | null;
  vehicle?: VehicleLike | null;
  date?: Date;
}): FormsAutoFillContext {
  const { user, driver, vehicle, date } = params;
  const sessionName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.email ? user.email.split('@')[0] : '');

  return {
    employee_name: driver?.full_name || sessionName || '',
    id_number: driver?.id_number || '',
    vehicle_number: vehicle?.plate_number || '',
    date: (date ?? new Date()).toLocaleDateString('he-IL'),
  };
}

export function resolveSchemaAutoFill(schema: any, context: FormsAutoFillContext): Record<string, string> {
  if (!schema || typeof schema !== 'object' || !schema.properties) {
    return {};
  }

  const result: Record<string, string> = {};
  const props = schema.properties as Record<string, any>;

  Object.entries(props).forEach(([fieldKey, field]) => {
    const source = field?.['x-autofill'];
    if (!source || typeof source !== 'string') {
      return;
    }

    const value = context[source as keyof FormsAutoFillContext];
    if (value) {
      result[fieldKey] = value;
    }
  });

  return result;
}
