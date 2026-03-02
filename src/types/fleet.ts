export type ComplianceStatus = 'valid' | 'warning' | 'expired';
export type AppRole = 'admin' | 'fleet_manager' | 'viewer' | 'driver';
export type HandoverType = 'delivery' | 'return';
export type AssignmentMode = 'permanent' | 'replacement';

export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface Vehicle {
  id: string;
  plate_number: string;
  manufacturer: string;
  model: string;
  year: number;
  current_odometer: number;
  next_maintenance_km: number | null;
  next_maintenance_date: string | null;
  test_expiry: string;
  insurance_expiry: string;
  license_image_url: string | null;
  insurance_pdf_url: string | null;
  status: ComplianceStatus;
  created_at: string;
  updated_at: string;
  // New fields
  engine_volume: string | null;
  color: string | null;
  ignition_code: string | null;
  is_active: boolean;
  assigned_driver_id: string | null;
  pickup_date: string | null;
  road_ascent_year: number | null;
  road_ascent_month: number | null;
  ownership_type: string | null;
  leasing_company_name: string | null;
  last_odometer_date: string | null;
  manufacturer_code: string | null;
  model_code: string | null;
  // Operational costs fields
  tax_value_price: number | null;
  tax_year: number | null;
  adjusted_price: number | null;
  chassis_number: string | null;
  average_fuel_consumption: number | null;
  monthly_total_cost: number | null;
  sale_date: string | null;
  group_name: string | null;
  internal_number: string | null;
  vehicle_budget: number | null;
  upgrade_addition: number | null;
  vehicle_type_name: string | null;
  base_index: number | null;
  driver_code: string | null;
  pascal: string | null;
  next_alert_km: number | null;
  mandatory_end_date: string | null;
  odometer_diff_maintenance: number | null;
  // Enrichment fields from pricing data
  vehicle_type_code: string | null;
  model_description: string | null;
  fuel_type: string | null;
  commercial_name: string | null;
  is_automatic: boolean | null;
  drive_type: string | null;
  green_score: number | null;
  pollution_level: number | null;
  weight: number | null;
  list_price: number | null;
  effective_date: string | null;
}

export interface Driver {
  id: string;
  user_id: string | null;
  full_name: string;
  id_number: string;
  phone: string | null;
  email: string | null;
  license_expiry: string;
  health_declaration_date: string | null;
  safety_training_date: string | null;
  license_front_url: string | null;
  license_back_url: string | null;
  health_declaration_url: string | null;
  status: ComplianceStatus;
  created_at: string;
  updated_at: string;
  // New fields
  address: string | null;
  job_title: string | null;
  department: string | null;
  license_number: string | null;
  regulation_585b_date: string | null;
  driver_code: string | null;
  is_active: boolean;
  employee_number: string | null;
  work_start_date: string | null;
  city: string | null;
  note1: string | null;
  note2: string | null;
  rating: string | null;
  division: string | null;
  eligibility: string | null;
  area: string | null;
  group_name: string | null;
  group_code: string | null;
  documents?: DriverDocument[];
}

export interface DriverSummary {
  id: string;
  full_name: string;
  id_number: string;
  phone: string | null;
  email: string | null;
  license_expiry: string;
  status: ComplianceStatus;
}

export interface DriverDocument {
  id: string;
  driver_id: string;
  title: string;
  file_url: string;
  created_at: string;
}

export interface PricingData {
  id: string;
  manufacturer_code: string;
  model_code: string;
  usage_value: number | null;
  usage_year: number | null;
  adjusted_price: number | null;
  registration_year: number | null;
  vehicle_type_code: string | null;
  manufacturer_name: string | null;
  model_description: string | null;
  fuel_type: string | null;
  commercial_name: string | null;
  is_automatic: boolean | null;
  drive_type: string | null;
  green_score: number | null;
  pollution_level: number | null;
  engine_volume_cc: number | null;
  weight: number | null;
  list_price: number | null;
  effective_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceLog {
  id: string;
  vehicle_id: string;
  service_date: string;
  service_type: string;
  odometer_reading: number;
  garage_name: string | null;
  cost: number | null;
  notes: string | null;
  invoice_url: string | null;
  created_by: string | null;
  created_at: string;
  vehicle?: Vehicle;
}

export interface VehicleHandover {
  id: string;
  vehicle_id: string;
  driver_id: string | null;
  handover_type: HandoverType;
  assignment_mode?: AssignmentMode;
  handover_date: string;
  odometer_reading: number;
  fuel_level: number;
  photo_front_url: string | null;
  photo_back_url: string | null;
  photo_right_url: string | null;
  photo_left_url: string | null;
  signature_url: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  vehicle?: Vehicle;
  driver?: Driver;
}

export interface ComplianceAlert {
  id: string;
  entity_type: 'vehicle' | 'driver';
  entity_id: string;
  alert_type: string;
  expiry_date: string;
  status: ComplianceStatus;
  email_sent: boolean;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  totalVehicles: number;
  totalDrivers: number;
  alertsCount: number;
  warningCount: number;
  expiredCount: number;
}
